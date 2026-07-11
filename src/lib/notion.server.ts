const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

async function getNotionToken(): Promise<string> {
  // 1) DB-managed token (admin can rotate via Settings UI without redeploy)
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "notion_token")
      .maybeSingle();
    const token = data?.value?.trim();
    if (token) return token;
  } catch {
    // fall through to env fallback
  }
  // 2) Env fallback (handy for first boot on VPS)
  const envToken = process.env.NOTION_INTEGRATION_TOKEN?.trim();
  if (envToken) return envToken;
  throw new Error("Notion not connected. Add an Integration Token in Settings → Notion.");
}

export async function notionFetch(path: string, init: RequestInit = {}, tokenOverride?: string) {
  const token = tokenOverride ?? (await getNotionToken());
  const res = await fetch(`${NOTION_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Notion API ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

export interface NotionTask {
  id: string;
  title: string;
  status: string;
  assignees: string[];
  duration: number; // hours
  estimated: number; // hours
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  priority: string;
  module: string;
  blocked: boolean;
  /** "Role" select property — e.g. Tasking/Reviewing/Client Comm/Analysis. Empty if unset. */
  role: string;
  /** "Context" multi-select property — task can belong to multiple contexts. */
  context: string[];
  /** All Notion properties flattened to readable string. Includes custom fields (Payment, Side, etc). */
  raw: Record<string, string>;
}

function getProp(props: Record<string, any>, names: string[]): any {
  for (const n of names) {
    for (const key of Object.keys(props)) {
      if (key.toLowerCase() === n.toLowerCase()) return props[key];
    }
  }
  return undefined;
}

function extractText(prop: any): string {
  if (!prop) return "";
  if (prop.title) return prop.title.map((t: any) => t.plain_text).join("");
  if (prop.rich_text) return prop.rich_text.map((t: any) => t.plain_text).join("");
  if (prop.select) return prop.select?.name ?? "";
  if (prop.status) return prop.status?.name ?? "";
  if (prop.multi_select) return prop.multi_select.map((s: any) => s.name).join(", ");
  if (typeof prop.number === "number") return String(prop.number);
  return "";
}

function extractNumber(prop: any): number {
  if (!prop) return 0;
  if (typeof prop.number === "number") return prop.number;
  if (prop.formula?.number) return prop.formula.number;
  // Text/rich_text storing values like "1 Jam", "30m", "1:30", "1.5h"
  const txt =
    (Array.isArray(prop.rich_text) && prop.rich_text.map((t: any) => t.plain_text).join("")) ||
    (Array.isArray(prop.title) && prop.title.map((t: any) => t.plain_text).join("")) ||
    "";
  return parseDurationText(txt);
}

export function parseDurationText(raw: string): number {
  if (!raw) return 0;
  const s = String(raw).trim().toLowerCase();
  if (!s) return 0;
  // hh:mm
  const hm = s.match(/^(\d{1,3}):(\d{1,2})$/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  let total = 0;
  let matched = false;
  // hours: "1 jam", "1h", "1 hr", "1 hour", "1.5j"
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*(jam|hours?|hrs?|hr|h|j)\b/g)) {
    total += parseFloat(m[1].replace(",", ".")); matched = true;
  }
  // minutes: "30 menit", "30m", "30 min", "30mnt"
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*(menit|mins?|minutes?|mnt|m)\b/g)) {
    total += parseFloat(m[1].replace(",", ".")) / 60; matched = true;
  }
  if (matched) return total;
  // Bare number → assume hours
  const bare = s.match(/^(\d+(?:[.,]\d+)?)$/);
  if (bare) return parseFloat(bare[1].replace(",", "."));
  return 0;
}

function extractPeople(prop: any): string[] {
  if (!prop) return [];
  // Notion "people" property
  if (Array.isArray(prop.people) && prop.people.length) {
    return prop.people
      .map((p: any) => p.name || p.person?.email || (p.id ? `User ${String(p.id).slice(0, 6)}` : null))
      .filter(Boolean);
  }
  // Multi-select used as assignee
  if (Array.isArray(prop.multi_select) && prop.multi_select.length) {
    return prop.multi_select.map((s: any) => s.name).filter(Boolean);
  }
  // Single select
  if (prop.select?.name) return [prop.select.name];
  // Status
  if (prop.status?.name) return [prop.status.name];
  // Rich text / title fallback
  if (Array.isArray(prop.rich_text) && prop.rich_text.length) {
    const t = prop.rich_text.map((t: any) => t.plain_text).join("").trim();
    return t ? t.split(/\s*,\s*/) : [];
  }
  if (Array.isArray(prop.title) && prop.title.length) {
    const t = prop.title.map((t: any) => t.plain_text).join("").trim();
    return t ? [t] : [];
  }
  // Created by / last edited by
  if (prop.created_by?.name) return [prop.created_by.name];
  if (prop.last_edited_by?.name) return [prop.last_edited_by.name];
  return [];
}

function extractDate(prop: any): { start: string | null; end: string | null } {
  if (!prop?.date) return { start: null, end: null };
  return { start: prop.date.start ?? null, end: prop.date.end ?? null };
}

function extractCheckbox(prop: any): boolean {
  return !!prop?.checkbox;
}

/** Stringify any Notion property to readable form. Returns "" if empty. */
export function flattenProperty(prop: any): string {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
    case "rich_text": {
      const arr = prop[prop.type];
      return Array.isArray(arr) ? arr.map((t: any) => t.plain_text).join("") : "";
    }
    case "number":
      return prop.number == null ? "" : String(prop.number);
    case "select":
      return prop.select?.name ?? "";
    case "multi_select":
      return Array.isArray(prop.multi_select) ? prop.multi_select.map((s: any) => s.name).join(", ") : "";
    case "status":
      return prop.status?.name ?? "";
    case "date": {
      const d = prop.date;
      if (!d) return "";
      return d.end ? `${d.start} → ${d.end}` : d.start ?? "";
    }
    case "people":
      return Array.isArray(prop.people)
        ? prop.people.map((p: any) => p.name || p.person?.email || `User ${String(p.id ?? "").slice(0, 6)}`).filter(Boolean).join(", ")
        : "";
    case "checkbox":
      return prop.checkbox ? "true" : "false";
    case "url":
      return prop.url ?? "";
    case "email":
      return prop.email ?? "";
    case "phone_number":
      return prop.phone_number ?? "";
    case "files":
      return Array.isArray(prop.files) ? prop.files.map((f: any) => f.name).join(", ") : "";
    case "formula": {
      const f = prop.formula;
      if (!f) return "";
      return String(f.string ?? f.number ?? f.boolean ?? f.date?.start ?? "");
    }
    case "rollup": {
      const r = prop.rollup;
      if (!r) return "";
      if (r.type === "number") return r.number == null ? "" : String(r.number);
      if (r.type === "date") return r.date?.start ?? "";
      if (r.type === "array") return (r.array ?? []).map((x: any) => flattenProperty(x)).filter(Boolean).join(", ");
      return "";
    }
    case "relation":
      return Array.isArray(prop.relation) ? prop.relation.map((r: any) => r.id).join(", ") : "";
    case "created_time":
      return prop.created_time ?? "";
    case "last_edited_time":
      return prop.last_edited_time ?? "";
    case "created_by":
      return prop.created_by?.name ?? "";
    case "last_edited_by":
      return prop.last_edited_by?.name ?? "";
    case "unique_id":
      return prop.unique_id?.prefix ? `${prop.unique_id.prefix}-${prop.unique_id.number}` : String(prop.unique_id?.number ?? "");
    default:
      return "";
  }
}

export function flattenAllProperties(page: any): Record<string, string> {
  const out: Record<string, string> = {};
  const props = page?.properties ?? {};
  for (const key of Object.keys(props)) {
    const v = flattenProperty(props[key]);
    if (v !== "") out[key] = v;
  }
  return out;
}

export function mapPageToTask(page: any): NotionTask {
  const p = page.properties ?? {};
  const titleProp = getProp(p, ["Name", "Task", "Title"]) ?? Object.values(p).find((v: any) => v?.type === "title");
  const status = getProp(p, ["Status"]);
  let assignee = getProp(p, ["Assignee", "Assignees", "Person", "Owner", "PIC", "Penanggung Jawab", "Pemilik", "Team", "Member", "Members"]);
  // Fallback: find any property of type "people"
  if (!assignee) {
    for (const key of Object.keys(p)) {
      if (p[key]?.type === "people" && Array.isArray(p[key].people) && p[key].people.length) {
        assignee = p[key];
        break;
      }
    }
  }
  const duration = getProp(p, ["Duration", "Hours", "Time Spent"]);
  const estimated = getProp(p, ["Estimated Time", "Estimate", "Estimated"]);
  const date = getProp(p, ["Date", "Work Date"]);
  const startTime = getProp(p, ["Start Time", "Start"]);
  const endTime = getProp(p, ["End Time", "End"]);
  const priority = getProp(p, ["Priority"]);
  const moduleProp = getProp(p, ["Module", "Feature", "Module/Feature"]);
  const blocked = getProp(p, ["Blocked", "Blocked Status", "Is Blocked"]);
  const roleProp = getProp(p, ["Role"]);
  const contextProp = getProp(p, ["Context"]);

  const d = extractDate(date);
  const s = extractDate(startTime);
  const e = extractDate(endTime);

  let dur = extractNumber(duration);
  // If no duration but start+end exist, compute hours
  if (!dur && s.start && e.start) {
    const ms = new Date(e.start).getTime() - new Date(s.start).getTime();
    if (ms > 0) dur = ms / 3600000;
  }

  return {
    id: page.id,
    title: extractText(titleProp) || "Untitled",
    status: extractText(status) || "—",
    assignees: extractPeople(assignee),
    duration: Number(dur.toFixed(2)),
    estimated: extractNumber(estimated),
    date: d.start ?? s.start,
    startTime: s.start,
    endTime: e.start,
    priority: extractText(priority),
    module: extractText(moduleProp),
    blocked: extractCheckbox(blocked) || /blocked/i.test(extractText(blocked)),
    role: roleProp?.select?.name ?? "",
    context: Array.isArray(contextProp?.multi_select)
      ? contextProp.multi_select.map((s: any) => s.name).filter(Boolean)
      : [],
    raw: flattenAllProperties(page),
  };
}

async function resolveDataSourceId(databaseOrDataSourceId: string): Promise<string> {
  // Try as data_source first (cheaper if it already is one)
  try {
    const ds = await notionFetch(`/data_sources/${databaseOrDataSourceId}`, { method: "GET" });
    if (ds?.object === "data_source") return ds.id;
  } catch {
    // fall through
  }
  // Try as database — pick first data source
  try {
    const db = await notionFetch(`/databases/${databaseOrDataSourceId}`, { method: "GET" });
    const sources = db?.data_sources ?? [];
    if (sources.length) return sources[0].id;
  } catch {
    // fall through to page fallback
  }
  // Fallback: treat as page, scan child blocks for inline child_database
  try {
    const kids = await listChildDatabases(databaseOrDataSourceId);
    if (kids.length) {
      // Recurse to resolve data_source of first inline DB
      return await resolveDataSourceId(kids[0].id);
    }
  } catch {
    // fall through
  }
  throw new Error(`Database/page ${databaseOrDataSourceId} tidak punya data source yang accessible. Share database (atau parent page) ke integration di Notion (⋯ → Connections), dan pastikan integration dapat capability "Read content".`);
}

export async function queryDatabase(databaseId: string, filter?: any): Promise<NotionTask[]> {
  const dataSourceId = await resolveDataSourceId(databaseId);
  const all: any[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;
    const data = await notionFetch(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    all.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor : undefined;
    pages++;
  } while (cursor && pages < 20); // safety cap
  return all.map(mapPageToTask);
}

export async function queryDatabaseByRelation(
  databaseId: string,
  relationProperty: string,
  relationPageId: string,
): Promise<NotionTask[]> {
  const filter = { property: relationProperty, relation: { contains: relationPageId } };
  return queryDatabase(databaseId, filter);
}

/** Tasks with NO relation set on `relationProperty` — used for non-project activities (Tasking, Reviewing, etc). */
export async function queryDatabaseUnassigned(
  databaseId: string,
  relationProperty: string,
): Promise<NotionTask[]> {
  const filter = { property: relationProperty, relation: { is_empty: true } };
  return queryDatabase(databaseId, filter);
}

export async function getDataSourceSchema(databaseOrDataSourceId: string) {
  const dataSourceId = await resolveDataSourceId(databaseOrDataSourceId);
  const ds = await notionFetch(`/data_sources/${dataSourceId}`, { method: "GET" });
  return { id: ds.id, properties: ds.properties ?? {} };
}

export async function listDataSourcePages(
  databaseOrDataSourceId: string,
): Promise<Array<{ id: string; title: string; url?: string }>> {
  const dataSourceId = await resolveDataSourceId(databaseOrDataSourceId);
  const out: Array<{ id: string; title: string; url?: string }> = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    for (const r of data.results ?? []) {
      out.push({ id: r.id, title: extractPageTitle(r), url: r.url });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
    pages++;
  } while (cursor && pages < 10);
  return out;
}

export function extractPageTitle(page: any): string {
  const props = page?.properties ?? {};
  for (const k of Object.keys(props)) {
    const v = props[k];
    if (v?.type === "title" && Array.isArray(v.title) && v.title.length) {
      return v.title.map((t: any) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

export async function retrieveDatabase(databaseId: string) {
  return notionFetch(`/databases/${databaseId}`, { method: "GET" });
}

export async function listChildDatabases(pageId: string): Promise<Array<{ id: string; title: string }>> {
  const found: Array<{ id: string; title: string }> = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : `?page_size=100`;
    const data = await notionFetch(`/blocks/${pageId}/children${qs}`, { method: "GET" });
    for (const b of data.results ?? []) {
      if (b.type === "child_database") {
        found.push({ id: b.id, title: b.child_database?.title || "Untitled database" });
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
    pages++;
  } while (cursor && pages < 10);
  return found;
}

export async function retrievePage(pageId: string) {
  return notionFetch(`/pages/${pageId}`, { method: "GET" });
}

export async function searchDatabases() {
  const data = await notionFetch(`/search`, {
    method: "POST",
    body: JSON.stringify({ filter: { value: "database", property: "object" }, page_size: 50 }),
  });
  return (data.results ?? []).map((r: any) => ({
    id: r.id,
    title: r.title?.map((t: any) => t.plain_text).join("") || "Untitled database",
    url: r.url,
  }));
}