import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface ProjectWeekly {
  projectId: string;
  notionDatabaseId: string;
  name: string;
  color: string;
  /** "unassigned" = Non-Project Activities bucket (no project relation). Drives Role/Context breakdown in reports. */
  sourceKind?: string;
  targetHoursPerWeek: number | null;
  /** Manual per-day target. null = auto-derive (weekly / workdaysPerWeek). */
  targetHoursPerDay: number | null;
  error?: string | null;
  /** Wall-clock hours: sum of unique task durations (each task counted once). */
  totalHours: number;
  /** Man-hours: sum of per-person contributions (a 4h task by 2 people = 8h). */
  manHours: number;
  tasksDone: number;
  tasksInProgress: number;
  tasksBlocked: number;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    assignees: string[];
    duration: number;
    estimated: number;
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    priority: string;
    module: string;
    blocked: boolean;
    role: string;
    context: string[];
    raw: Record<string, string>;
  }>;
}

export interface WeeklyAggregate {
  weekStart: string;
  weekEnd: string;
  /** Configured working days per week — divisor for auto daily targets. */
  workdaysPerWeek: number;
  /** Wall-clock hours: sum of unique task durations across all projects (each task once). */
  totalHours: number;
  /** Man-hours: sum of every assignee's contribution across all projects. */
  manHours: number;
  tasksDone: number;
  tasksInProgress: number;
  tasksBlocked: number;
  projects: ProjectWeekly[];
  perPerson: Array<{
    name: string;
    /** Full task duration per assignment — NOT divided by collaborator count. */
    totalHours: number;
    tasksDone: number;
    activeProjects: string[];
    byProject: Record<string, number>;
    tasksInProgress: number;
    tasksBlocked: number;
    tasksTotal: number;
    tasks: Array<{
      id: string;
      title: string;
      status: string;
      duration: number;
      date: string | null;
      blocked: boolean;
      projectName: string;
      projectColor: string;
      role: string;
      context: string[];
    }>;
  }>;
}

function getWeekRange(weekStartISO?: string) {
  const now = weekStartISO ? new Date(weekStartISO) : new Date();
  const d = new Date(now);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // Monday start
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  const start = new Date(d);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 7);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export const listProjects = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("notion_projects")
    .select("id, notion_database_id, name, color, target_hours_per_week, source_kind, task_database_id, relation_property, relation_page_id, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    notion_database_id: r.notion_database_id,
    name: r.name,
    color: r.color,
    target_hours_per_week: r.target_hours_per_week as number | null,
    source_kind: (r as any).source_kind ?? "database",
    task_database_id: (r as any).task_database_id ?? null,
    relation_property: (r as any).relation_property ?? null,
    relation_page_id: (r as any).relation_page_id ?? null,
  }));
});

export const addUnassignedProject = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(120).default("Non-Project Activities"),
      color: z.string().min(2).max(32).default("cyan"),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "relation_source")
      .maybeSingle();
    if (!cfg?.value) throw new Error("Daily Project source belum dikonfigurasi.");
    const parsed = JSON.parse(cfg.value);
    const taskDbId: string = parsed.task_database_id;
    const relProp: string = parsed.relation_property;
    if (!taskDbId || !relProp) throw new Error("Daily Project source tidak lengkap.");

    const { data: existing } = await supabaseAdmin
      .from("notion_projects")
      .select("id")
      .eq("source_kind", "unassigned")
      .maybeSingle();
    if (existing) throw new Error("Non-Project Activities sudah ada.");

    const { error } = await supabaseAdmin.from("notion_projects").insert({
      notion_database_id: taskDbId,
      name: data.name,
      color: data.color,
      source_kind: "unassigned",
      task_database_id: taskDbId,
      relation_property: relProp,
      relation_page_id: null,
    });
    if (error) throw error;
    return { ok: true };
  });

export const addProject = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      notion_database_id: z.string().min(10),
      name: z.string().min(1).max(120).optional(),
      color: z.string().min(2).max(32).default("purple"),
      task_database_id: z.string().min(10).optional(),
      relation_property: z.string().min(1).max(120).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { retrieveDatabase, retrievePage, listChildDatabases, extractPageTitle } = await import("./notion.server");
    const hyphenate = (s: string) => {
      const id = s.replace(/[^a-f0-9]/gi, "").toLowerCase();
      return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`;
    };
    const hyphenated = hyphenate(data.notion_database_id);
    let resolvedName = data.name;

    // Resolve relation mode params from saved config if not provided
    let taskDbInput = data.task_database_id;
    let relProp = data.relation_property;
    if (!taskDbInput || !relProp) {
      const { data: cfg } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "relation_source")
        .maybeSingle();
      if (cfg?.value) {
        try {
          const p = JSON.parse(cfg.value);
          taskDbInput = taskDbInput || p.task_database_id;
          relProp = relProp || p.relation_property;
        } catch {}
      }
    }

    // Relation mode: have task DB + relation property
    if (taskDbInput && relProp) {
      const taskDbId = hyphenate(taskDbInput);
      // Verify the page exists and pull its title
      let page: any;
      try {
        page = await retrievePage(hyphenated);
      } catch (e) {
        throw new Error(`Cannot access page ${hyphenated}. Share ke integration. (${(e as Error).message})`);
      }
      if (!resolvedName) resolvedName = extractPageTitle(page);
      const { error } = await supabaseAdmin.from("notion_projects").insert({
        notion_database_id: taskDbId, // keep for back-compat / display
        name: resolvedName ?? "Notion Project",
        color: data.color,
        source_kind: "relation",
        task_database_id: taskDbId,
        relation_property: relProp,
        relation_page_id: hyphenated,
      });
      if (error) throw error;
      return { ok: true };
    }

    // Database mode (legacy / direct database URL)
    let resolvedId = hyphenated;
    let dbErr: string | null = null;
    try {
      const db = await retrieveDatabase(hyphenated);
      if (!resolvedName) {
        resolvedName = db.title?.map((t: any) => t.plain_text).join("") || "Notion Project";
      }
    } catch (e) {
      dbErr = (e as Error).message;
    }
    if (dbErr) {
      try {
        const children = await listChildDatabases(hyphenated);
        if (children.length === 0) {
          try {
            await retrievePage(hyphenated);
            throw new Error("Halaman ini tidak berisi database. Buka inline database sebagai full page, lalu copy URL-nya, atau pakai mode Relation (pilih task DB + relation property).");
          } catch {
            throw new Error(`Cannot access this database/page. Pastikan sudah di-share ke integration. (${dbErr})`);
          }
        }
        if (children.length > 1 && !data.name) {
          throw new Error(`Halaman ini berisi ${children.length} database: ${children.map((c) => c.title).join(", ")}. Buka salah satu sebagai full page lalu copy URL-nya.`);
        }
        const picked = children[0];
        resolvedId = picked.id;
        if (!resolvedName) resolvedName = picked.title || "Notion Project";
      } catch (e) {
        throw new Error((e as Error).message);
      }
    }
    const { error } = await supabaseAdmin.from("notion_projects").insert({
      notion_database_id: resolvedId,
      name: resolvedName ?? "Notion Project",
      color: data.color,
      source_kind: "database",
    });
    if (error) throw error;
    return { ok: true };
  });

export const inspectNotionTarget = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(10) }))
  .handler(async ({ data }) => {
    const { retrieveDatabase, retrievePage, getDataSourceSchema, extractPageTitle } = await import("./notion.server");
    const id = data.id.replace(/[^a-f0-9]/gi, "").toLowerCase();
    const hy = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`;
    // Try database
    try {
      const db = await retrieveDatabase(hy);
      const schema = await getDataSourceSchema(hy);
      const relations = Object.entries(schema.properties)
        .filter(([, v]: [string, any]) => v?.type === "relation")
        .map(([k, v]: [string, any]) => ({
          name: k,
          related_data_source_id: v.relation?.data_source_id ?? v.relation?.database_id ?? null,
        }));
      return {
        kind: "database" as const,
        id: hy,
        title: db.title?.map((t: any) => t.plain_text).join("") || "Untitled database",
        relations,
      };
    } catch {/* fall through */}
    try {
      const page = await retrievePage(hy);
      return {
        kind: "page" as const,
        id: hy,
        title: extractPageTitle(page),
      };
    } catch (e) {
      throw new Error(`Tidak dapat akses ${hy}: ${(e as Error).message}`);
    }
  });

export const inspectTaskDatabase = createServerFn({ method: "POST" })
  .inputValidator(z.object({ task_database_id: z.string().min(10) }))
  .handler(async ({ data }) => {
    const { getDataSourceSchema } = await import("./notion.server");
    const id = data.task_database_id.replace(/[^a-f0-9]/gi, "").toLowerCase();
    const hy = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`;
    const schema = await getDataSourceSchema(hy);
    const relations = Object.entries(schema.properties)
      .filter(([, v]: [string, any]) => v?.type === "relation")
      .map(([k, v]: [string, any]) => ({
        name: k,
        related_data_source_id:
          v.relation?.data_source_id ?? v.relation?.database_id ?? null,
      }));
    return { id: hy, relations, relationProperties: relations.map((r) => r.name) };
  });

const RELATION_SOURCE_KEY = "relation_source";

export const getRelationSource = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", RELATION_SOURCE_KEY)
    .maybeSingle();
  if (!data?.value) {
    return { configured: false as const, task_database_id: "", relation_property: "", related_data_source_id: "", updated_at: null as string | null };
  }
  try {
    const parsed = JSON.parse(data.value);
    return {
      configured: true as const,
      task_database_id: String(parsed.task_database_id ?? ""),
      relation_property: String(parsed.relation_property ?? ""),
      related_data_source_id: String(parsed.related_data_source_id ?? ""),
      updated_at: data.updated_at,
    };
  } catch {
    return { configured: false as const, task_database_id: "", relation_property: "", related_data_source_id: "", updated_at: null };
  }
});

export const setRelationSource = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      task_database_id: z.string().min(10),
      relation_property: z.string().min(1).max(120),
    }),
  )
  .handler(async ({ data }) => {
    const { getDataSourceSchema } = await import("./notion.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.task_database_id.replace(/[^a-f0-9]/gi, "").toLowerCase();
    const hy = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`;
    const schema = await getDataSourceSchema(hy);
    const prop: any = schema.properties[data.relation_property];
    if (!prop || prop.type !== "relation") {
      throw new Error(`Property "${data.relation_property}" tidak ditemukan atau bukan relation.`);
    }
    const related = prop.relation?.data_source_id ?? prop.relation?.database_id ?? "";
    if (!related) throw new Error("Relation tidak punya target database/data_source.");
    const value = JSON.stringify({
      task_database_id: hy,
      relation_property: data.relation_property,
      related_data_source_id: related,
    });
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        { key: RELATION_SOURCE_KEY, value, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw error;
    return { ok: true, related_data_source_id: related };
  });

export const clearRelationSource = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("app_settings").delete().eq("key", RELATION_SOURCE_KEY);
  return { ok: true };
});

export const listRelationTargetPages = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { listDataSourcePages } = await import("./notion.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", RELATION_SOURCE_KEY)
    .maybeSingle();
  if (!data?.value) throw new Error("Daily Project source belum dikonfigurasi.");
  const parsed = JSON.parse(data.value);
  const target = parsed.related_data_source_id || parsed.task_database_id;
  const pages = await listDataSourcePages(target);
  return { source: parsed, pages };
});

export const removeProject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("notion_projects").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const updateProjectTarget = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      target_hours_per_week: z.number().min(0).max(1000).nullable(),
      // Optional: only touch the daily column when explicitly provided, so a
      // weekly-only save doesn't clobber a manual daily target. null = auto.
      target_hours_per_day: z.number().min(0).max(24).nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { target_hours_per_week: number | null; target_hours_per_day?: number | null } = {
      target_hours_per_week: data.target_hours_per_week,
    };
    if (data.target_hours_per_day !== undefined) {
      patch.target_hours_per_day = data.target_hours_per_day;
    }
    const { error } = await supabaseAdmin
      .from("notion_projects")
      .update(patch)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const searchNotionDatabases = createServerFn({ method: "GET" }).handler(async () => {
  const { searchDatabases } = await import("./notion.server");
  return searchDatabases();
});

export interface NotionTreeNode {
  id: string;
  type: "database" | "page";
  title: string;
  parentId: string | null;
  url?: string;
  children: NotionTreeNode[];
}

export const searchNotionTree = createServerFn({ method: "GET" }).handler(async () => {
  const { notionFetch } = await import("./notion.server");
  // Fetch all shared databases + pages
  const collected: any[] = [];
  for (const objType of ["database", "page"] as const) {
    let cursor: string | undefined;
    let pages = 0;
    do {
      const body: any = { filter: { value: objType, property: "object" }, page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const data = await notionFetch(`/search`, { method: "POST", body: JSON.stringify(body) });
      collected.push(...(data.results ?? []));
      cursor = data.has_more ? data.next_cursor : undefined;
      pages++;
    } while (cursor && pages < 10);
  }

  const getTitle = (r: any): string => {
    if (Array.isArray(r.title) && r.title.length) return r.title.map((t: any) => t.plain_text).join("");
    const props = r.properties ?? {};
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v?.type === "title" && Array.isArray(v.title) && v.title.length) {
        return v.title.map((t: any) => t.plain_text).join("");
      }
    }
    return r.object === "database" ? "Untitled database" : "Untitled page";
  };
  const getParentId = (r: any): string | null => {
    const p = r.parent;
    if (!p) return null;
    if (p.type === "page_id") return p.page_id;
    if (p.type === "database_id") return p.database_id;
    if (p.type === "block_id") return p.block_id;
    return null; // workspace
  };

  const nodes = new Map<string, NotionTreeNode>();
  for (const r of collected) {
    nodes.set(r.id, {
      id: r.id,
      type: r.object === "database" ? "database" : "page",
      title: getTitle(r),
      parentId: getParentId(r),
      url: r.url,
      children: [],
    });
  }

  const roots: NotionTreeNode[] = [];
  for (const n of nodes.values()) {
    if (n.parentId && nodes.has(n.parentId)) {
      nodes.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }

  const sortRec = (arr: NotionTreeNode[]) => {
    arr.sort((a, b) => {
      if (a.type !== b.type) return a.type === "database" ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);

  return roots;
});

export const getNotionTokenStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", "notion_token")
    .maybeSingle();
  const token = data?.value?.trim() ?? "";
  const envFallback = !!process.env.NOTION_INTEGRATION_TOKEN?.trim();
  return {
    configured: token.length > 0,
    source: token ? ("database" as const) : envFallback ? ("env" as const) : ("none" as const),
    masked: token ? `${token.slice(0, 7)}…${token.slice(-4)}` : "",
    updatedAt: data?.updated_at ?? null,
  };
});

export const setNotionToken = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().trim().min(20).max(500) }))
  .handler(async ({ data }) => {
    // Validate token by hitting /users/me before saving
    const { notionFetch } = await import("./notion.server");
    try {
      await notionFetch("/users/me", { method: "GET" }, data.token);
    } catch (e) {
      throw new Error(`Token tidak valid: ${(e as Error).message}`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "notion_token", value: data.token, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    return { ok: true };
  });

export const clearNotionToken = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("app_settings").delete().eq("key", "notion_token");
  return { ok: true };
});

export const getWeeklyAggregate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ weekStart: z.string().optional() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { queryDatabase, queryDatabaseByRelation, queryDatabaseUnassigned } = await import("./notion.server");
    const range = getWeekRange(data.weekStart);

    const { data: projects, error } = await supabaseAdmin
      .from("notion_projects")
      .select("id, notion_database_id, name, color, target_hours_per_week, target_hours_per_day, source_kind, task_database_id, relation_property, relation_page_id");
    if (error) throw error;

    const { data: workdaysRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "workdays_per_week")
      .maybeSingle();
    const wRaw = workdaysRow?.value ? Number(workdaysRow.value) : NaN;
    const workdaysPerWeek = Number.isFinite(wRaw) && wRaw >= 1 && wRaw <= 7 ? Math.round(wRaw) : 5;

    const result: WeeklyAggregate = {
      weekStart: range.start,
      weekEnd: range.end,
      workdaysPerWeek,
      totalHours: 0,
      manHours: 0,
      tasksDone: 0,
      tasksInProgress: 0,
      tasksBlocked: 0,
      projects: [],
      perPerson: [],
    };

    if (!projects || projects.length === 0) return result;

    const personMap = new Map<string, {
      name: string;
      totalHours: number;
      tasksDone: number;
      activeProjects: Set<string>;
      byProject: Record<string, number>;
      tasksInProgress: number;
      tasksBlocked: number;
      tasks: Array<{
        id: string;
        title: string;
        status: string;
        duration: number;
        date: string | null;
        blocked: boolean;
        projectName: string;
        projectColor: string;
        role: string;
        context: string[];
      }>;
    }>();

    for (const proj of projects) {
      let tasks: any[] = [];
      let queryError: string | null = null;
      try {
        const sk = (proj as any).source_kind ?? "database";
        if (sk === "unassigned" && (proj as any).task_database_id && (proj as any).relation_property) {
          tasks = await queryDatabaseUnassigned(
            (proj as any).task_database_id,
            (proj as any).relation_property,
          );
        } else if (sk === "relation" && (proj as any).task_database_id && (proj as any).relation_property && (proj as any).relation_page_id) {
          tasks = await queryDatabaseByRelation(
            (proj as any).task_database_id,
            (proj as any).relation_property,
            (proj as any).relation_page_id,
          );
        } else {
          tasks = await queryDatabase(proj.notion_database_id);
        }
      } catch (e) {
        queryError = (e as Error).message;
        console.error(`Failed to query ${proj.name}:`, e);
      }
      const weekTasks = tasks.filter((t) => {
        if (!t.date) return false;
        return t.date >= range.start && t.date < range.end;
      });

      let projHours = 0;
      let projManHours = 0;
      let done = 0, prog = 0, blocked = 0;
      for (const t of weekTasks) {
        projHours += t.duration;
        const s = t.status.toLowerCase();
        if (t.blocked || s.includes("blocked")) blocked++;
        else if (s.includes("done") || s.includes("complete")) done++;
        else if (s.includes("progress") || s.includes("doing") || s.includes("review")) prog++;
        for (const person of t.assignees.length ? t.assignees : ["Unassigned"]) {
          if (!personMap.has(person)) {
            personMap.set(person, {
              name: person,
              totalHours: 0,
              tasksDone: 0,
              activeProjects: new Set(),
              byProject: {},
              tasksInProgress: 0,
              tasksBlocked: 0,
              tasks: [],
            });
          }
          const p = personMap.get(person)!;
          // Full task duration per assignee — co-assigned tasks are NOT split.
          // Each collaborator gets credit for the full duration they worked.
          // This means sum(perPerson.totalHours) >= sum(unique task durations);
          // the difference is exposed as `manHours` so the UI can show both views.
          const share = t.duration;
          p.totalHours += share;
          p.byProject[proj.name] = (p.byProject[proj.name] ?? 0) + share;
          p.activeProjects.add(proj.name);
          projManHours += share;
          if (s.includes("done") || s.includes("complete")) p.tasksDone++;
          else if (t.blocked || s.includes("blocked")) p.tasksBlocked++;
          else if (s.includes("progress") || s.includes("doing") || s.includes("review")) p.tasksInProgress++;
          p.tasks.push({
            id: t.id,
            title: t.title,
            status: t.status,
            duration: Number(share.toFixed(2)),
            date: t.date,
            blocked: t.blocked,
            projectName: proj.name,
            projectColor: proj.color,
            role: t.role ?? "",
            context: t.context ?? [],
          });
        }
      }

      result.projects.push({
        projectId: proj.id,
        notionDatabaseId: proj.notion_database_id,
        name: proj.name,
        color: proj.color,
        sourceKind: (proj as any).source_kind ?? "database",
        targetHoursPerWeek: (proj as any).target_hours_per_week ?? null,
        targetHoursPerDay: (proj as any).target_hours_per_day ?? null,
        error: queryError,
        totalHours: Number(projHours.toFixed(2)),
        manHours: Number(projManHours.toFixed(2)),
        tasksDone: done,
        tasksInProgress: prog,
        tasksBlocked: blocked,
        tasks: weekTasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          assignees: t.assignees,
          duration: t.duration,
          estimated: t.estimated ?? 0,
          date: t.date,
          startTime: t.startTime ?? null,
          endTime: t.endTime ?? null,
          priority: t.priority ?? "",
          module: t.module ?? "",
          blocked: t.blocked,
          role: t.role ?? "",
          context: t.context ?? [],
          raw: t.raw ?? {},
        })),
      });

      result.totalHours += projHours;
      result.manHours += projManHours;
      result.tasksDone += done;
      result.tasksInProgress += prog;
      result.tasksBlocked += blocked;
    }

    result.totalHours = Number(result.totalHours.toFixed(2));
    result.manHours = Number(result.manHours.toFixed(2));
    result.perPerson = Array.from(personMap.values())
      .map((p) => ({
        name: p.name,
        totalHours: Number(p.totalHours.toFixed(2)),
        tasksDone: p.tasksDone,
        activeProjects: Array.from(p.activeProjects),
        byProject: Object.fromEntries(
          Object.entries(p.byProject).map(([k, v]) => [k, Number(v.toFixed(2))]),
        ),
        tasksInProgress: p.tasksInProgress,
        tasksBlocked: p.tasksBlocked,
        tasksTotal: p.tasks.length,
        tasks: p.tasks.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    return result;
  });

export const touchSyncState = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("sync_state").update({ last_sync: new Date().toISOString() }).eq("id", 1);
  return { ok: true };
});

export const getSyncState = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("sync_state").select("last_sync").eq("id", 1).single();
  return { lastSync: data?.last_sync ?? null };
});

/**
 * Flat task feed across ALL projects with NO date filter — used by the chat
 * assistant so it can answer arbitrary-date questions ("kemarin", "minggu lalu",
 * "Juni", "Q2 2026") instead of being stuck on the current week.
 *
 * Returns full task properties (status, assignees, duration, date, raw Notion
 * properties) so the LLM can filter/aggregate on its own. Date range coverage
 * is reported in metadata so the assistant can honestly say "data ku punya 12
 * Mei → 22 Juni, di luar itu belum tersync".
 *
 * Capping strategy: tasks are sorted by `date` descending and capped at
 * `taskCap` (default 1500). The cap exists so a workspace with years of data
 * doesn't blow past the model's context window. Reports `truncated: true` +
 * the oldest included date so the assistant can mention the cutoff honestly.
 */
export const getAllTasks = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      taskCap: z.number().int().positive().max(5000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { queryDatabase, queryDatabaseByRelation, queryDatabaseUnassigned } = await import("./notion.server");

    const taskCap = data.taskCap ?? 1500;

    const { data: projects, error } = await supabaseAdmin
      .from("notion_projects")
      .select(
        "id, notion_database_id, name, color, target_hours_per_week, source_kind, task_database_id, relation_property, relation_page_id",
      );
    if (error) throw error;

    type FlatTask = {
      title: string;
      status: string;
      assignees: string[];
      duration_hours: number;
      estimated_hours: number;
      date: string | null;
      start_time: string | null;
      end_time: string | null;
      priority: string;
      module: string;
      blocked: boolean;
      project: string;
      role: string;
      context: string[];
      properties: Record<string, string>;
    };

    const allTasks: FlatTask[] = [];
    const perProjectMeta: Array<{
      name: string;
      taskCount: number;
      error: string | null;
      target_hours_per_week: number | null;
    }> = [];

    for (const proj of projects ?? []) {
      let tasks: any[] = [];
      let queryError: string | null = null;
      try {
        const sk = (proj as any).source_kind ?? "database";
        if (sk === "unassigned" && (proj as any).task_database_id && (proj as any).relation_property) {
          tasks = await queryDatabaseUnassigned(
            (proj as any).task_database_id,
            (proj as any).relation_property,
          );
        } else if (
          sk === "relation" &&
          (proj as any).task_database_id &&
          (proj as any).relation_property &&
          (proj as any).relation_page_id
        ) {
          tasks = await queryDatabaseByRelation(
            (proj as any).task_database_id,
            (proj as any).relation_property,
            (proj as any).relation_page_id,
          );
        } else {
          tasks = await queryDatabase(proj.notion_database_id);
        }
      } catch (e) {
        queryError = (e as Error).message;
        console.error(`[getAllTasks] Failed to query ${proj.name}:`, e);
      }

      perProjectMeta.push({
        name: proj.name,
        taskCount: tasks.length,
        error: queryError,
        target_hours_per_week: (proj as any).target_hours_per_week ?? null,
      });

      for (const t of tasks) {
        allTasks.push({
          title: t.title,
          status: t.status,
          assignees: t.assignees ?? [],
          duration_hours: t.duration ?? 0,
          estimated_hours: t.estimated ?? 0,
          date: t.date ?? null,
          start_time: t.startTime ?? null,
          end_time: t.endTime ?? null,
          priority: t.priority ?? "",
          module: t.module ?? "",
          blocked: !!t.blocked,
          project: proj.name,
          role: t.role ?? "",
          context: t.context ?? [],
          properties: t.raw ?? {},
        });
      }
    }

    // Sort by date desc (null dates pushed to the end). Then apply cap.
    allTasks.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
    const truncated = allTasks.length > taskCap;
    const truncatedAt = truncated ? allTasks[taskCap - 1]?.date ?? null : null;
    const kept = truncated ? allTasks.slice(0, taskCap) : allTasks;

    // Date coverage across whatever survived the cap.
    const datedTasks = kept.filter((t) => !!t.date);
    const minDate = datedTasks.length
      ? datedTasks.reduce((m, t) => (t.date! < m ? t.date! : m), datedTasks[0].date!)
      : null;
    const maxDate = datedTasks.length
      ? datedTasks.reduce((m, t) => (t.date! > m ? t.date! : m), datedTasks[0].date!)
      : null;

    return {
      totalTaskCount: allTasks.length,
      returnedTaskCount: kept.length,
      truncated,
      truncatedAt,
      dateRange: { earliest: minDate, latest: maxDate },
      projects: perProjectMeta,
      tasks: kept,
    };
  });

/**
 * Monthly report — group tasks across a custom date range into per-week
 * buckets (Mon-Sun, UTC) and expose two matrices:
 *   - person × week (full task duration per assignee, NOT split)
 *   - project × week (wall-clock per project — each task counted once)
 *
 * Used by /monthly route. Range defaults to current calendar month if omitted.
 * Range bounds are inclusive on both ends (start..end). Weeks that touch the
 * range are included — so a request "2026-06-15 → 2026-06-30" picks up the
 * week of Jun 15 (Mon) through Jun 21 (Sun) entirely, even though Jun 22+
 * are also part of that ISO week conceptually.
 *
 * Tasks outside the requested range are excluded; tasks inside but missing a
 * date are dropped (no week to attribute them to).
 */
export const getMonthlyReport = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      // ISO YYYY-MM-DD; both inclusive. Omit either to use current month bounds.
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      // When true, also fetch the immediately-preceding period (same length) for comparison.
      compare: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { queryDatabase, queryDatabaseByRelation, queryDatabaseUnassigned } = await import("./notion.server");

    // Resolve date range — default to current calendar month if missing.
    const now = new Date();
    const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const startISO = data.start ?? defaultStart.toISOString().slice(0, 10);
    const endISO = data.end ?? defaultEnd.toISOString().slice(0, 10);
    if (startISO > endISO) {
      throw new Error(`Invalid range: start (${startISO}) > end (${endISO}).`);
    }

    // Pull projects to query (once — shared across periods).
    const { data: projects, error } = await supabaseAdmin
      .from("notion_projects")
      .select(
        "id, notion_database_id, name, color, target_hours_per_week, source_kind, task_database_id, relation_property, relation_page_id",
      );
    if (error) throw error;

    // Fetch tasks ONCE across the widest range we'll need (covers compare period too).
    // Cache: project name → tasks[]
    const taskCache = new Map<string, any[]>();
    for (const proj of projects ?? []) {
      try {
        const sk = (proj as any).source_kind ?? "database";
        let tasks: any[] = [];
        if (sk === "unassigned" && (proj as any).task_database_id && (proj as any).relation_property) {
          tasks = await queryDatabaseUnassigned(
            (proj as any).task_database_id,
            (proj as any).relation_property,
          );
        } else if (
          sk === "relation" &&
          (proj as any).task_database_id &&
          (proj as any).relation_property &&
          (proj as any).relation_page_id
        ) {
          tasks = await queryDatabaseByRelation(
            (proj as any).task_database_id,
            (proj as any).relation_property,
            (proj as any).relation_page_id,
          );
        } else {
          tasks = await queryDatabase(proj.notion_database_id);
        }
        taskCache.set(proj.name, tasks);
      } catch (e) {
        console.error(`[monthly] Failed to query ${proj.name}:`, e);
        taskCache.set(proj.name, []);
      }
    }

    type Week = { weekStart: string; weekEnd: string; key: string; label: string };
    type PeriodResult = {
      range: { start: string; end: string };
      weeks: Week[];
      persons: Array<{ name: string; byWeek: Record<string, number>; total: number }>;
      projects: Array<{
        name: string;
        color: string | null;
        sourceKind?: string;
        byWeek: Record<string, number>;
        total: number;
      }>;
      /**
       * Per-project breakdown of contributors. For each project, who worked on it
       * and how much (split per week). Man-hours semantics — a 4h task by 2 people
       * credits each contributor 4h on that project. Used by PDF for per-project
       * detail pages (mirror of /projects/$id web view).
       */
      projectBreakdowns: Record<
        string,
        {
          persons: Array<{ name: string; byWeek: Record<string, number>; total: number }>;
          tasksDone: number;
          tasksInProgress: number;
          tasksBlocked: number;
          tasksTotal: number;
          /** Role/Context hour split (data-driven, no hardcoded list). Used for Non-Project Activities pages. */
          byRole: Array<{ label: string; hours: number }>;
          byContext: Array<{ label: string; hours: number }>;
        }
      >;
      weekTotals: Array<{ key: string; wallClock: number; manHours: number; tasks: number }>;
      grandTotals: { wallClock: number; manHours: number; tasks: number };
    };

    const aggregate = (rStart: string, rEnd: string): PeriodResult => {
      // Build week buckets from Monday-of-start to Sunday-of-end inclusive.
      const weeks: Week[] = [];
      const startDate = new Date(`${rStart}T00:00:00Z`);
      const monOfStart = new Date(startDate);
      monOfStart.setUTCDate(monOfStart.getUTCDate() - ((monOfStart.getUTCDay() + 6) % 7));
      const endDate = new Date(`${rEnd}T00:00:00Z`);
      const sunOfEnd = new Date(endDate);
      sunOfEnd.setUTCDate(sunOfEnd.getUTCDate() + ((7 - sunOfEnd.getUTCDay()) % 7));
      let cursor = new Date(monOfStart);
      let safety = 0;
      while (cursor <= sunOfEnd && safety < 60) {
        const wEnd = new Date(cursor);
        wEnd.setUTCDate(wEnd.getUTCDate() + 6);
        const ws = cursor.toISOString().slice(0, 10);
        const we = wEnd.toISOString().slice(0, 10);
        const fmt = (d: Date) =>
          d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
        const label = `${fmt(cursor)}-${wEnd.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" })}`;
        weeks.push({ weekStart: ws, weekEnd: we, key: ws, label });
        cursor.setUTCDate(cursor.getUTCDate() + 7);
        safety++;
      }

      const personMatrix = new Map<string, Map<string, number>>();
      const projectMatrix = new Map<string, Map<string, number>>();
      const projectMeta = new Map<string, { name: string; color: string | null; sourceKind: string }>();
      // Per-project per-person matrix → projectName → person → weekKey → hours
      const projectPersonMatrix = new Map<string, Map<string, Map<string, number>>>();
      // Per-project status counters
      const projectStatus = new Map<string, { done: number; prog: number; blocked: number; total: number }>();
      // Per-project role/context hour maps (data-driven, no hardcoded list).
      const projectRoleHours = new Map<string, Map<string, number>>();
      const projectContextHours = new Map<string, Map<string, number>>();
      const weekTotals = new Map<string, { wallClock: number; manHours: number; tasks: number }>();
      weeks.forEach((w) => weekTotals.set(w.key, { wallClock: 0, manHours: 0, tasks: 0 }));
      let grandWallClock = 0;
      let grandManHours = 0;
      let grandTasks = 0;

      const findWeekKey = (dateISO: string): string | null => {
        for (const w of weeks) {
          if (dateISO >= w.weekStart && dateISO <= w.weekEnd) return w.key;
        }
        return null;
      };

      for (const proj of projects ?? []) {
        projectMeta.set(proj.name, { name: proj.name, color: proj.color, sourceKind: (proj as any).source_kind ?? "database" });
        const tasks = taskCache.get(proj.name) ?? [];
        for (const t of tasks) {
          if (!t.date) continue;
          if (t.date < rStart || t.date > rEnd) continue;
          const wk = findWeekKey(t.date);
          if (!wk) continue;
          const dur = Number(t.duration ?? 0);
          if (dur <= 0) continue;

          if (!projectMatrix.has(proj.name)) projectMatrix.set(proj.name, new Map());
          const pRow = projectMatrix.get(proj.name)!;
          pRow.set(wk, (pRow.get(wk) ?? 0) + dur);

          const wt = weekTotals.get(wk)!;
          wt.wallClock += dur;
          wt.tasks += 1;
          grandWallClock += dur;
          grandTasks += 1;

          // Per-project status counters (same task classification rules as weekly agg).
          if (!projectStatus.has(proj.name)) {
            projectStatus.set(proj.name, { done: 0, prog: 0, blocked: 0, total: 0 });
          }
          const ps = projectStatus.get(proj.name)!;
          ps.total += 1;
          const stat = String(t.status ?? "").toLowerCase();
          if (t.blocked || stat.includes("blocked")) ps.blocked += 1;
          else if (stat.includes("done") || stat.includes("complete")) ps.done += 1;
          else if (stat.includes("progress") || stat.includes("doing") || stat.includes("review")) ps.prog += 1;

          if (!projectRoleHours.has(proj.name)) projectRoleHours.set(proj.name, new Map());
          const roleMap = projectRoleHours.get(proj.name)!;
          const role = t.role?.trim() || "Unspecified";
          roleMap.set(role, (roleMap.get(role) ?? 0) + dur);

          if (!projectContextHours.has(proj.name)) projectContextHours.set(proj.name, new Map());
          const contextMap = projectContextHours.get(proj.name)!;
          const contexts = t.context?.length ? t.context : ["Unspecified"];
          for (const c of contexts) contextMap.set(c, (contextMap.get(c) ?? 0) + dur);

          const assignees: string[] = t.assignees?.length ? t.assignees : ["Unassigned"];
          for (const person of assignees) {
            if (!personMatrix.has(person)) personMatrix.set(person, new Map());
            const row = personMatrix.get(person)!;
            row.set(wk, (row.get(wk) ?? 0) + dur);
            wt.manHours += dur;
            grandManHours += dur;

            // Per-project per-person bucket (full duration per assignee — man-hours).
            if (!projectPersonMatrix.has(proj.name)) projectPersonMatrix.set(proj.name, new Map());
            const projPersons = projectPersonMatrix.get(proj.name)!;
            if (!projPersons.has(person)) projPersons.set(person, new Map());
            const cell = projPersons.get(person)!;
            cell.set(wk, (cell.get(wk) ?? 0) + dur);
          }
        }
      }

      const personRows = Array.from(personMatrix.entries())
        .map(([name, weekMap]) => {
          const byWeek: Record<string, number> = {};
          let total = 0;
          for (const w of weeks) {
            const v = Number((weekMap.get(w.key) ?? 0).toFixed(2));
            byWeek[w.key] = v;
            total += v;
          }
          return { name, byWeek, total: Number(total.toFixed(2)) };
        })
        .sort((a, b) => b.total - a.total);

      const projectRows = Array.from(projectMatrix.entries())
        .map(([name, weekMap]) => {
          const meta = projectMeta.get(name);
          const byWeek: Record<string, number> = {};
          let total = 0;
          for (const w of weeks) {
            const v = Number((weekMap.get(w.key) ?? 0).toFixed(2));
            byWeek[w.key] = v;
            total += v;
          }
          return {
            name,
            color: meta?.color ?? null,
            sourceKind: meta?.sourceKind ?? "database",
            byWeek,
            total: Number(total.toFixed(2)),
          };
        })
        .sort((a, b) => b.total - a.total);

      // Build projectBreakdowns from projectPersonMatrix + projectStatus.
      const projectBreakdowns: PeriodResult["projectBreakdowns"] = {};
      for (const [projName, personMap] of projectPersonMatrix.entries()) {
        const personRowsForProj = Array.from(personMap.entries())
          .map(([person, weekMap]) => {
            const byWeek: Record<string, number> = {};
            let total = 0;
            for (const w of weeks) {
              const v = Number((weekMap.get(w.key) ?? 0).toFixed(2));
              byWeek[w.key] = v;
              total += v;
            }
            return { name: person, byWeek, total: Number(total.toFixed(2)) };
          })
          .sort((a, b) => b.total - a.total);
        const st = projectStatus.get(projName) ?? { done: 0, prog: 0, blocked: 0, total: 0 };
        const byRole = [...(projectRoleHours.get(projName)?.entries() ?? [])]
          .map(([label, hours]) => ({ label, hours: Number(hours.toFixed(2)) }))
          .sort((a, b) => b.hours - a.hours);
        const byContext = [...(projectContextHours.get(projName)?.entries() ?? [])]
          .map(([label, hours]) => ({ label, hours: Number(hours.toFixed(2)) }))
          .sort((a, b) => b.hours - a.hours);
        projectBreakdowns[projName] = {
          persons: personRowsForProj,
          tasksDone: st.done,
          tasksInProgress: st.prog,
          tasksBlocked: st.blocked,
          tasksTotal: st.total,
          byRole,
          byContext,
        };
      }

      return {
        range: { start: rStart, end: rEnd },
        weeks,
        persons: personRows,
        projects: projectRows,
        projectBreakdowns,
        weekTotals: Array.from(weekTotals.entries()).map(([key, v]) => ({
          key,
          wallClock: Number(v.wallClock.toFixed(2)),
          manHours: Number(v.manHours.toFixed(2)),
          tasks: v.tasks,
        })),
        grandTotals: {
          wallClock: Number(grandWallClock.toFixed(2)),
          manHours: Number(grandManHours.toFixed(2)),
          tasks: grandTasks,
        },
      };
    };

    const current = aggregate(startISO, endISO);

    // Compute previous period of same length immediately before primary start.
    let previous: PeriodResult | null = null;
    if (data.compare) {
      const startD = new Date(`${startISO}T00:00:00Z`);
      const endD = new Date(`${endISO}T00:00:00Z`);
      const days = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
      const prevEnd = new Date(startD);
      prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
      previous = aggregate(prevStart.toISOString().slice(0, 10), prevEnd.toISOString().slice(0, 10));
    }

    // Pull the capacity setting so the client can compute per-week utilization %.
    let normalHoursPerWeek = 42;
    try {
      const { data: capRow } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "normal_hours_per_week")
        .maybeSingle();
      const n = capRow?.value ? Number(capRow.value) : NaN;
      if (Number.isFinite(n) && n > 0) normalHoursPerWeek = n;
    } catch {
      // setting missing → use default
    }

    return { ...current, previous, normalHoursPerWeek };
  });

/**
 * PM role/context split — groups task hours by "Role" (select, one bucket per
 * task) and "Context" (multi-select, a task can count toward several context
 * buckets so context percentages may sum >100%). Buckets are derived purely
 * from whatever values exist in the data — no hardcoded list, so new
 * Role/Context options added in Notion show up automatically.
 *
 * Scoped to a week (default current) and optionally a single person.
 */
export const getRoleContextBreakdown = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      weekStart: z.string().optional(),
      personName: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { queryDatabase, queryDatabaseByRelation, queryDatabaseUnassigned } = await import("./notion.server");
    const range = getWeekRange(data.weekStart);

    const { data: projects, error } = await supabaseAdmin
      .from("notion_projects")
      .select("id, notion_database_id, name, source_kind, task_database_id, relation_property, relation_page_id");
    if (error) throw error;

    const roleHours = new Map<string, number>();
    const contextHours = new Map<string, number>();
    let totalHours = 0;

    for (const proj of projects ?? []) {
      let tasks: any[] = [];
      try {
        const sk = (proj as any).source_kind ?? "database";
        if (sk === "unassigned" && (proj as any).task_database_id && (proj as any).relation_property) {
          tasks = await queryDatabaseUnassigned((proj as any).task_database_id, (proj as any).relation_property);
        } else if (sk === "relation" && (proj as any).task_database_id && (proj as any).relation_property && (proj as any).relation_page_id) {
          tasks = await queryDatabaseByRelation(
            (proj as any).task_database_id,
            (proj as any).relation_property,
            (proj as any).relation_page_id,
          );
        } else {
          tasks = await queryDatabase(proj.notion_database_id);
        }
      } catch (e) {
        console.error(`[roleContext] Failed to query ${proj.name}:`, e);
        continue;
      }

      for (const t of tasks) {
        if (!t.date || t.date < range.start || t.date >= range.end) continue;
        if (data.personName) {
          const people: string[] = t.assignees?.length ? t.assignees : ["Unassigned"];
          if (!people.includes(data.personName)) continue;
        }
        const dur = Number(t.duration ?? 0);
        if (dur <= 0) continue;
        totalHours += dur;

        const role = t.role || "Unspecified";
        roleHours.set(role, (roleHours.get(role) ?? 0) + dur);

        const contexts: string[] = t.context?.length ? t.context : ["Unspecified"];
        for (const ctx of contexts) {
          contextHours.set(ctx, (contextHours.get(ctx) ?? 0) + dur);
        }
      }
    }

    const toBuckets = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([label, hours]) => ({
          label,
          hours: Number(hours.toFixed(2)),
          percent: totalHours > 0 ? Number(((hours / totalHours) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.hours - a.hours);

    return {
      weekStart: range.start,
      weekEnd: range.end,
      totalHours: Number(totalHours.toFixed(2)),
      byRole: toBuckets(roleHours),
      byContext: toBuckets(contextHours),
    };
  });