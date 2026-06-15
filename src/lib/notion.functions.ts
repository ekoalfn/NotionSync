import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface ProjectWeekly {
  projectId: string;
  notionDatabaseId: string;
  name: string;
  color: string;
  targetHoursPerWeek: number | null;
  error?: string | null;
  totalHours: number;
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
    raw: Record<string, string>;
  }>;
}

export interface WeeklyAggregate {
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  tasksDone: number;
  tasksInProgress: number;
  tasksBlocked: number;
  projects: ProjectWeekly[];
  perPerson: Array<{
    name: string;
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
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("notion_projects")
      .update({ target_hours_per_week: data.target_hours_per_week })
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
    const { queryDatabase, queryDatabaseByRelation } = await import("./notion.server");
    const range = getWeekRange(data.weekStart);

    const { data: projects, error } = await supabaseAdmin
      .from("notion_projects")
      .select("id, notion_database_id, name, color, target_hours_per_week, source_kind, task_database_id, relation_property, relation_page_id");
    if (error) throw error;

    const result: WeeklyAggregate = {
      weekStart: range.start,
      weekEnd: range.end,
      totalHours: 0,
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
      }>;
    }>();

    for (const proj of projects) {
      let tasks: any[] = [];
      let queryError: string | null = null;
      try {
        const sk = (proj as any).source_kind ?? "database";
        if (sk === "relation" && (proj as any).task_database_id && (proj as any).relation_property && (proj as any).relation_page_id) {
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
          const share = t.assignees.length ? t.duration / t.assignees.length : t.duration;
          p.totalHours += share;
          p.byProject[proj.name] = (p.byProject[proj.name] ?? 0) + share;
          p.activeProjects.add(proj.name);
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
          });
        }
      }

      result.projects.push({
        projectId: proj.id,
        notionDatabaseId: proj.notion_database_id,
        name: proj.name,
        color: proj.color,
        targetHoursPerWeek: (proj as any).target_hours_per_week ?? null,
        error: queryError,
        totalHours: Number(projHours.toFixed(2)),
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
          raw: t.raw ?? {},
        })),
      });

      result.totalHours += projHours;
      result.tasksDone += done;
      result.tasksInProgress += prog;
      result.tasksBlocked += blocked;
    }

    result.totalHours = Number(result.totalHours.toFixed(2));
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