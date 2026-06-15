import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  listProjects,
  addProject,
  removeProject,
  searchNotionDatabases,
  searchNotionTree,
  getNotionTokenStatus,
  setNotionToken,
  clearNotionToken,
  inspectTaskDatabase,
  getRelationSource,
  setRelationSource,
  clearRelationSource,
  listRelationTargetPages,
} from "@/lib/notion.functions";
import type { NotionTreeNode } from "@/lib/notion.functions";
import { AI_PROVIDERS, getAiConfig, setAiConfig, listAiModels, type AiProviderId } from "@/lib/settings.functions";
import { useEffect } from "react";
import { Pager, usePager } from "@/components/Pager";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — NowTrack" }] }),
  component: SettingsPage,
});

const PRESET_COLORS = [
  { name: "purple", hex: "#a855f7" },
  { name: "blue", hex: "#3b82f6" },
  { name: "green", hex: "#10b981" },
  { name: "orange", hex: "#f97316" },
  { name: "pink", hex: "#ec4899" },
  { name: "red", hex: "#ef4444" },
  { name: "yellow", hex: "#eab308" },
  { name: "cyan", hex: "#06b6d4" },
] as const;
const PRESET_BY_NAME: Record<string, string> = Object.fromEntries(
  PRESET_COLORS.map((c) => [c.name, c.hex]),
);
function resolveColor(c: string | null | undefined): string {
  if (!c) return "#a855f7";
  if (c.startsWith("#")) return c;
  return PRESET_BY_NAME[c] ?? "#a855f7";
}

function extractIdFromUrl(input: string) {
  const m = input.match(/([a-f0-9]{32})/i);
  return m ? m[1] : input.replace(/-/g, "");
}

function TreeView({
  nodes,
  expanded,
  onToggle,
  onPick,
  depth = 0,
}: {
  nodes: NotionTreeNode[];
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onPick: (n: NotionTreeNode) => void;
  depth?: number;
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((n) => {
        const hasChildren = n.children.length > 0;
        const isOpen = expanded[n.id] ?? depth < 1;
        return (
          <li key={n.id} style={{ paddingLeft: depth * 14 }}>
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => hasChildren && onToggle(n.id)}
                className={`w-4 text-foreground/40 ${hasChildren ? "" : "opacity-0"}`}
              >
                {isOpen ? "▾" : "▸"}
              </button>
              <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${n.type === "database" ? "bg-foreground/15 text-foreground/80" : "bg-foreground/5 text-foreground/40"}`}>
                {n.type === "database" ? "DB" : "PG"}
              </span>
              {n.type === "database" ? (
                <button
                  onClick={() => onPick(n)}
                  className="text-left hover:underline font-medium"
                >
                  {n.title}
                </button>
              ) : (
                <span className="text-foreground/70">{n.title}</span>
              )}
              <span className="text-[10px] font-mono text-foreground/30">{n.id.slice(0, 8)}…</span>
            </div>
            {hasChildren && isOpen && (
              <div className="mt-1">
                <TreeView nodes={n.children} expanded={expanded} onToggle={onToggle} onPick={onPick} depth={depth + 1} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const fetchProjects = useServerFn(listProjects);
  const addFn = useServerFn(addProject);
  const removeFn = useServerFn(removeProject);
  const searchFn = useServerFn(searchNotionDatabases);
  const searchTreeFn = useServerFn(searchNotionTree);
  const fetchTokenStatus = useServerFn(getNotionTokenStatus);
  const saveTokenFn = useServerFn(setNotionToken);
  const clearTokenFn = useServerFn(clearNotionToken);
  const fetchConfig = useServerFn(getAiConfig);
  const saveConfig = useServerFn(setAiConfig);
  const fetchModels = useServerFn(listAiModels);

  const projects = useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects() });
  const tokenStatus = useQuery({ queryKey: ["notion-token"], queryFn: () => fetchTokenStatus() });
  const [tokenInput, setTokenInput] = useState("");
  const [tokenMsg, setTokenMsg] = useState<string | null>(null);
  const saveToken = useMutation({
    mutationFn: (token: string) => saveTokenFn({ data: { token } }),
    onSuccess: () => {
      setTokenInput("");
      setTokenMsg("Tersimpan ✓");
      qc.invalidateQueries({ queryKey: ["notion-token"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["weekly"] });
      // Auto-load list of databases shared with this integration
      qc.refetchQueries({ queryKey: ["notion-search"] });
      setTimeout(() => setTokenMsg(null), 2500);
    },
    onError: (e: Error) => setTokenMsg(e.message),
  });
  const clearToken = useMutation({
    mutationFn: () => clearTokenFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notion-token"] });
    },
  });
  const [dbInput, setDbInput] = useState("");
  const [color, setColor] = useState<string>("#a855f7");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const search = useQuery({ queryKey: ["notion-search"], queryFn: () => searchFn(), enabled: false });
  const tree = useQuery({ queryKey: ["notion-tree"], queryFn: () => searchTreeFn(), enabled: false });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const add = useMutation({
    mutationFn: (vars: {
      id: string;
      name?: string;
      color: string;
      task_database_id?: string;
      relation_property?: string;
    }) =>
      addFn({
        data: {
          notion_database_id: vars.id,
          name: vars.name,
          color: vars.color,
          task_database_id: vars.task_database_id,
          relation_property: vars.relation_property,
        },
      }),
    onSuccess: () => {
      setDbInput("");
      setName("");
      setError(null);
      setTaskDbInput("");
      setRelationProp("");
      setRelationProps([]);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["weekly"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const inspectTaskDbFn = useServerFn(inspectTaskDatabase);
  const getRelSrcFn = useServerFn(getRelationSource);
  const saveRelSrcFn = useServerFn(setRelationSource);
  const clearRelSrcFn = useServerFn(clearRelationSource);
  const listRelPagesFn = useServerFn(listRelationTargetPages);

  const relSrc = useQuery({ queryKey: ["relation-source"], queryFn: () => getRelSrcFn() });
  const [taskDbInput, setTaskDbInput] = useState("");
  const [relationProp, setRelationProp] = useState("");
  const [relationProps, setRelationProps] = useState<string[]>([]);
  const [inspectErr, setInspectErr] = useState<string | null>(null);
  const inspect = useMutation({
    mutationFn: (id: string) => inspectTaskDbFn({ data: { task_database_id: id } }),
    onSuccess: (r) => {
      setRelationProps(r.relationProperties);
      setInspectErr(null);
      if (r.relationProperties.length && !relationProp) setRelationProp(r.relationProperties[0]);
    },
    onError: (e: Error) => {
      setRelationProps([]);
      setInspectErr(e.message);
    },
  });
  const saveRelSrc = useMutation({
    mutationFn: (v: { task_database_id: string; relation_property: string }) => saveRelSrcFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["relation-source"] });
      qc.invalidateQueries({ queryKey: ["relation-pages"] });
    },
  });
  const clearRelSrc = useMutation({
    mutationFn: () => clearRelSrcFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["relation-source"] });
      qc.invalidateQueries({ queryKey: ["relation-pages"] });
    },
  });

  useEffect(() => {
    if (relSrc.data?.configured) {
      setTaskDbInput(relSrc.data.task_database_id);
      setRelationProp(relSrc.data.relation_property);
    }
  }, [relSrc.data?.configured, relSrc.data?.task_database_id, relSrc.data?.relation_property]);

  const [addOpen, setAddOpen] = useState(false);
  const [pageSearch, setPageSearch] = useState("");
  const [pickedColor, setPickedColor] = useState<string>("#a855f7");
  const [overrideName, setOverrideName] = useState("");
  const [pickedPage, setPickedPage] = useState<{ id: string; title: string } | null>(null);
  const relPages = useQuery({
    queryKey: ["relation-pages"],
    queryFn: () => listRelPagesFn(),
    enabled: addOpen && !!relSrc.data?.configured,
  });
  const trackedRelationIds = new Set(
    (projects.data ?? [])
      .filter((p) => p.source_kind === "relation")
      .map((p) => String(p.relation_page_id ?? "").replace(/-/g, "")),
  );
  const filteredPages = (relPages.data?.pages ?? []).filter((p: any) =>
    p.title.toLowerCase().includes(pageSearch.toLowerCase()),
  );

  const del = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["weekly"] });
    },
  });

  const cfgQuery = useQuery({ queryKey: ["ai-config"], queryFn: () => fetchConfig() });
  const [aiProvider, setAiProvider] = useState<AiProviderId>("openai");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModelInput] = useState("");
  const [aiSaved, setAiSaved] = useState(false);

  useEffect(() => {
    if (cfgQuery.data) {
      setAiProvider(cfgQuery.data.provider);
      setAiBaseUrl(cfgQuery.data.baseUrl);
      setAiApiKey(cfgQuery.data.apiKey);
      setAiModelInput(cfgQuery.data.model);
    }
  }, [cfgQuery.data]);

  const updateConfig = useMutation({
    mutationFn: () =>
      saveConfig({
        data: { provider: aiProvider, baseUrl: aiBaseUrl, apiKey: aiApiKey, model: aiModel },
      }),
    onSuccess: () => {
      setAiSaved(true);
      qc.invalidateQueries({ queryKey: ["ai-config"] });
      qc.invalidateQueries({ queryKey: ["ai-insights"] });
      setTimeout(() => setAiSaved(false), 2000);
    },
  });

  const currentPreset = AI_PROVIDERS.find((p) => p.id === aiProvider) ?? AI_PROVIDERS[0];
  const applyPreset = (id: AiProviderId) => {
    const p = AI_PROVIDERS.find((x) => x.id === id) ?? AI_PROVIDERS[0];
    setAiProvider(id);
    if (p.baseUrl) setAiBaseUrl(p.baseUrl);
    if (p.defaultModel) setAiModelInput(p.defaultModel);
    setLiveModels(null);
    setModelsError(null);
  };

  const [liveModels, setLiveModels] = useState<string[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const loadModels = useMutation({
    mutationFn: () => fetchModels({ data: { provider: aiProvider, baseUrl: aiBaseUrl, apiKey: aiApiKey } }),
    onSuccess: (r) => {
      setLiveModels(r.models);
      setModelsError(null);
    },
    onError: (e: Error) => {
      setLiveModels(null);
      setModelsError(e.message);
    },
  });

  const modelOptions = liveModels ?? [...currentPreset.models];

  const treeRoots = tree.data ?? [];
  const treePager = usePager(treeRoots, 10, treeRoots.length);
  const searchResults = (search.data ?? []) as Array<{ id: string; title: string }>;
  const searchPager = usePager(searchResults, 10, searchResults.length);
  const trackedProjects = projects.data ?? [];
  const trackedPager = usePager(trackedProjects, 10, trackedProjects.length);

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-display font-extrabold tracking-tight">Settings</h1>
        <p className="text-foreground/50 text-sm">Manage which Notion databases sync as projects.</p>
      </header>

      <section className="glass rounded-[2rem] p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-bold text-lg">Notion Integration Token</h2>
          {tokenStatus.data?.configured ? (
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 bg-foreground/10 rounded-full">
              Connected · {tokenStatus.data.source}
            </span>
          ) : (
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 bg-foreground/10 rounded-full">
              Not connected
            </span>
          )}
        </div>
        <p className="text-sm text-foreground/60 mb-4">
          Buat <strong>Internal Integration</strong> di{" "}
          <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="underline">
            notion.so/my-integrations
          </a>
          , copy <em>Internal Integration Secret</em> (mulai dengan <code>ntn_…</code> atau <code>secret_…</code>),
          lalu share database yang dipakai ke integration tersebut. Token disimpan di database aplikasi —
          ganti akun Notion = paste token baru di sini, langsung aktif tanpa restart server.
        </p>
        {tokenStatus.data?.configured && (
          <p className="text-xs font-mono text-foreground/50 mb-3">
            Saat ini: <span className="text-foreground/80">{tokenStatus.data.masked}</span>
            {tokenStatus.data.updatedAt && (
              <> · diperbarui {new Date(tokenStatus.data.updatedAt).toLocaleString()}</>
            )}
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="ntn_xxxxxxxxxxxx..."
            className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm font-mono"
            autoComplete="off"
          />
          <button
            disabled={saveToken.isPending || tokenInput.trim().length < 20}
            onClick={() => saveToken.mutate(tokenInput.trim())}
            className="px-4 py-3 bg-foreground text-background rounded-xl text-sm font-bold disabled:opacity-50"
          >
            {saveToken.isPending ? "Memvalidasi…" : "Simpan"}
          </button>
          {tokenStatus.data?.source === "database" && (
            <button
              onClick={() => clearToken.mutate()}
              disabled={clearToken.isPending}
              className="px-4 py-3 border border-white/10 rounded-xl text-sm hover:bg-white/5 disabled:opacity-50"
            >
              Hapus
            </button>
          )}
        </div>
        {tokenMsg && <p className="text-xs text-foreground/60 mt-3">{tokenMsg}</p>}
        <p className="text-[11px] text-foreground/40 mt-3">
          Tip VPS: set env <code>NOTION_INTEGRATION_TOKEN</code> di server sebagai fallback untuk first-boot.
          Token di Settings selalu mengoverride env.
        </p>
      </section>

      <section className="glass rounded-[2rem] p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-bold text-lg">Daily Project Source</h2>
          {relSrc.data?.configured ? (
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 bg-foreground/10 rounded-full">
              Configured
            </span>
          ) : (
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 bg-foreground/10 rounded-full">
              Not configured
            </span>
          )}
        </div>
        <p className="text-sm text-foreground/60 mb-3">
          Pilih database task (mis. <code>Daily Project</code>) dan relation property yang point ke daftar project (mis. <code>Project</code> → Production). Disimpan sekali, lalu tinggal Add Project tanpa isi ulang.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <input
            value={taskDbInput}
            onChange={(e) => setTaskDbInput(e.target.value)}
            placeholder="Task database URL atau ID (Daily Project)"
            className="md:col-span-7 px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm font-mono"
          />
          <button
            disabled={inspect.isPending || !taskDbInput.trim()}
            onClick={() => inspect.mutate(extractIdFromUrl(taskDbInput.trim()))}
            className="md:col-span-3 px-4 py-3 border border-white/10 rounded-xl text-sm hover:bg-white/5 disabled:opacity-50"
          >
            {inspect.isPending ? "Loading…" : "Cek relation"}
          </button>
          {relSrc.data?.configured && (
            <button
              onClick={() => clearRelSrc.mutate()}
              className="md:col-span-2 px-4 py-3 border border-white/10 rounded-xl text-sm hover:bg-white/5"
            >
              Reset
            </button>
          )}
        </div>
        {(relationProps.length > 0 || relSrc.data?.configured) && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mt-3">
            <label className="md:col-span-7 flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-foreground/40">Relation property</span>
              <select
                value={relationProp}
                onChange={(e) => setRelationProp(e.target.value)}
                className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm font-mono"
              >
                {relationProp && !relationProps.includes(relationProp) && (
                  <option value={relationProp}>{relationProp} (saved)</option>
                )}
                {relationProps.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <button
              disabled={saveRelSrc.isPending || !taskDbInput.trim() || !relationProp}
              onClick={() =>
                saveRelSrc.mutate({
                  task_database_id: extractIdFromUrl(taskDbInput.trim()),
                  relation_property: relationProp,
                })
              }
              className="md:col-span-5 px-4 py-3 bg-foreground text-background rounded-xl text-sm font-bold disabled:opacity-50 self-end"
            >
              {saveRelSrc.isPending ? "Menyimpan…" : "Simpan source"}
            </button>
          </div>
        )}
        {inspectErr && <p className="text-xs text-foreground/60 mt-2">{inspectErr}</p>}
        {saveRelSrc.error && <p className="text-xs text-foreground/60 mt-2">{(saveRelSrc.error as Error).message}</p>}
        {relSrc.data?.configured && (
          <p className="text-[11px] font-mono text-foreground/40 mt-3">
            task DB <span className="text-foreground/70">{relSrc.data.task_database_id.slice(0, 8)}…</span> · prop <span className="text-foreground/70">{relSrc.data.relation_property}</span> · target DS <span className="text-foreground/70">{relSrc.data.related_data_source_id.slice(0, 8)}…</span>
          </p>
        )}
      </section>

      <section className="glass rounded-[2rem] p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg">Add Project</h2>
          {relSrc.data?.configured ? (
            <button
              onClick={() => {
                setAddOpen(true);
                setPickedPage(null);
                setOverrideName("");
                setPageSearch("");
              }}
              className="px-4 py-2 bg-foreground text-background rounded-xl text-sm font-bold"
            >
              + Add Project (dari Relation)
            </button>
          ) : (
            <span className="text-xs text-foreground/50">Configure source dulu di atas</span>
          )}
        </div>
        <details>
          <summary className="text-xs text-foreground/60 cursor-pointer hover:text-foreground">Advanced: paste URL database/page manual</summary>
          <p className="text-[11px] text-foreground/50 mt-2 mb-3">Untuk database mode (1 DB = 1 project) atau jika belum konfigurasi source.</p>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <input
              value={dbInput}
              onChange={(e) => setDbInput(e.target.value)}
              placeholder="https://www.notion.so/yourworkspace/..."
              className="md:col-span-6 px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm font-mono"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name (optional)"
              className="md:col-span-3 px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm"
            />
            <div className="md:col-span-2 flex gap-1 items-center flex-wrap px-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setColor(c.hex)}
                  style={{ backgroundColor: c.hex }}
                  className={`size-5 rounded-full ${color === c.hex ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100"}`}
                  aria-label={c.name}
                  title={c.name}
                />
              ))}
              <input
                type="color"
                value={resolveColor(color)}
                onChange={(e) => setColor(e.target.value)}
                className="size-5 rounded-full bg-transparent border border-white/20 cursor-pointer"
                title="Custom color"
              />
            </div>
            <button
              disabled={add.isPending || !dbInput.trim()}
              onClick={() =>
                add.mutate({
                  id: extractIdFromUrl(dbInput.trim()),
                  name: name.trim() || undefined,
                  color,
                })
              }
              className="md:col-span-1 px-4 py-3 bg-foreground text-background rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {add.isPending ? "…" : "Add"}
            </button>
          </div>
          {error && <p className="text-sm text-foreground/60 mt-3">{error}</p>}
        </details>

        <div className="mt-5 pt-5 border-t border-border">
          <button
            onClick={() => search.refetch()}
            className="text-xs text-foreground/60 hover:text-foreground underline"
          >
            {search.isFetching ? "Searching…" : "Browse shared databases"}
          </button>
          <button
            onClick={() => tree.refetch()}
            className="ml-4 text-xs text-foreground/60 hover:text-foreground underline"
          >
            {tree.isFetching ? "Loading tree…" : "Browse as nested tree"}
          </button>
          {search.data && search.data.length > 0 && (
            <div className="mt-3 grid gap-2">
              {searchPager.pageItems.map((db: { id: string; title: string }) => (
                <button
                  key={db.id}
                  onClick={() => {
                    setDbInput(db.id);
                    setName(db.title);
                  }}
                  className="text-left text-sm px-3 py-2 bg-white/5 border border-white/10 rounded-lg backdrop-blur hover:border-foreground/30"
                >
                  <span className="font-medium">{db.title}</span>
                  <span className="ml-2 text-xs font-mono text-foreground/40">{db.id.slice(0, 8)}…</span>
                </button>
              ))}
              <Pager
                page={searchPager.page}
                totalPages={searchPager.totalPages}
                onChange={searchPager.setPage}
                total={searchPager.total}
                pageSize={searchPager.pageSize}
              />
            </div>
          )}
          {tree.data && tree.data.length > 0 && (
            <div className="mt-3 border border-white/10 rounded-xl p-3 bg-white/5">
              <p className="text-[11px] text-foreground/50 mb-2">
                Klik <span className="font-mono">database</span> untuk pakai sebagai project. Page hanya untuk navigasi.
              </p>
              <TreeView
                nodes={treePager.pageItems}
                expanded={expanded}
                onToggle={toggle}
                onPick={(n) => {
                  setDbInput(n.id);
                  setName(n.title);
                }}
              />
              <Pager
                page={treePager.page}
                totalPages={treePager.totalPages}
                onChange={treePager.setPage}
                total={treePager.total}
                pageSize={treePager.pageSize}
              />
            </div>
          )}
        </div>
      </section>

      <section className="glass rounded-[2rem] p-6">
        <h2 className="font-display font-bold text-lg mb-4">Tracked projects</h2>
        {!projects.data || projects.data.length === 0 ? (
          <p className="text-sm text-foreground/50">None yet.</p>
        ) : (
          <>
          <ul className="divide-y divide-border">
            {trackedPager.pageItems.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="size-3 rounded-full" style={{ backgroundColor: resolveColor(p.color) }} />
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {p.name}
                      <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 bg-foreground/10 rounded">
                        {p.source_kind === "relation" ? "relation" : "database"}
                      </span>
                    </p>
                    {p.source_kind === "relation" ? (
                      <p className="text-xs font-mono text-foreground/40">
                        task DB {String(p.task_database_id).slice(0, 8)}… · {p.relation_property} → page {String(p.relation_page_id).slice(0, 8)}…
                      </p>
                    ) : (
                      <p className="text-xs font-mono text-foreground/40">{p.notion_database_id}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => del.mutate(p.id)}
                  className="text-xs text-foreground/60 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <Pager
            page={trackedPager.page}
            totalPages={trackedPager.totalPages}
            onChange={trackedPager.setPage}
            total={trackedPager.total}
            pageSize={trackedPager.pageSize}
          />
          </>
        )}
      </section>

      <section className="mt-6 glass rounded-[2rem] p-6">
        <h2 className="font-display font-bold text-lg mb-2">Real-time sync</h2>
        <p className="text-sm text-foreground/60 mb-3">
          To enable instant updates when Notion changes, register this webhook URL in your Notion integration:
        </p>
        <code className="block p-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-xs font-mono break-all">
          {typeof window !== "undefined" ? window.location.origin : ""}/api/public/notion-webhook
        </code>
        <p className="text-xs text-foreground/40 mt-2">
          The dashboard also auto-refreshes every 60 seconds.
        </p>
      </section>

      <section className="mt-6 glass rounded-[2rem] p-6">
        <h2 className="font-display font-bold text-lg mb-2">AI Provider</h2>
        <p className="text-sm text-foreground/60 mb-4">
          Pilih provider AI dan model untuk generate weekly summary, improvements, dan critique.
          Mendukung OpenAI-compatible (OpenAI/OpenRouter/Groq) dan Anthropic-compatible (Anthropic + custom).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-foreground/40">Provider</span>
            <select
              value={aiProvider}
              onChange={(e) => applyPreset(e.target.value as AiProviderId)}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm"
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-foreground/40 flex items-center justify-between">
              <span>Model {liveModels ? `(${liveModels.length} live)` : ""}</span>
              <button
                type="button"
                onClick={() => loadModels.mutate()}
                disabled={loadModels.isPending || !aiBaseUrl || !aiApiKey}
                className="text-[10px] font-mono normal-case underline disabled:opacity-40"
              >
                {loadModels.isPending ? "Loading…" : "↻ Fetch models"}
              </button>
            </span>
            {modelOptions.length > 0 ? (
              <select
                value={aiModel}
                onChange={(e) => setAiModelInput(e.target.value)}
                className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm font-mono"
              >
                {!modelOptions.includes(aiModel) && aiModel && (
                  <option value={aiModel}>{aiModel} (current)</option>
                )}
                {modelOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <input
                value={aiModel}
                onChange={(e) => setAiModelInput(e.target.value)}
                placeholder="Klik ↻ Fetch models atau isi manual"
                className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm font-mono"
              />
            )}
            {modelsError && <span className="text-[10px] text-foreground/60">{modelsError}</span>}
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-foreground/40">Base URL</span>
            <input
              value={aiBaseUrl}
              onChange={(e) => setAiBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm font-mono disabled:opacity-60"
            />
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-foreground/40">
              API Key
            </span>
            <input
              type="password"
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder="sk-..."
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm font-mono disabled:opacity-60"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            disabled={updateConfig.isPending || !aiBaseUrl || !aiModel}
            onClick={() => updateConfig.mutate()}
            className="px-4 py-2 bg-foreground text-background rounded-xl text-sm font-bold disabled:opacity-50"
          >
            {updateConfig.isPending ? "Menyimpan…" : "Simpan AI Settings"}
          </button>
          {aiSaved && <span className="text-xs text-foreground/60">Tersimpan ✓</span>}
          {updateConfig.error && (
            <span className="text-xs text-foreground/60">{(updateConfig.error as Error).message}</span>
          )}
        </div>

        <p className="text-xs text-foreground/40 mt-3">
          API key disimpan di database project ini.
          OpenAI-compatible → pakai <code>/chat/completions</code>.
          Anthropic-compatible (incl. Custom) → pakai <code>/messages</code> dgn header <code>x-api-key</code> + <code>anthropic-version</code>.
        </p>
      </section>
      {addOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setAddOpen(false)}
        >
          <div
            className="glass rounded-[2rem] p-6 max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-lg">Pilih project (relation target)</h3>
              <button
                onClick={() => setAddOpen(false)}
                className="text-foreground/60 hover:text-foreground text-xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-foreground/50 mb-3">
              Dari data source target relation. Klik salah satu untuk pilih.
            </p>
            <input
              value={pageSearch}
              onChange={(e) => setPageSearch(e.target.value)}
              placeholder="Cari…"
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm mb-3"
            />
            <div className="overflow-y-auto flex-1 border border-white/10 rounded-xl">
              {relPages.isLoading && <p className="p-3 text-sm text-foreground/50">Loading…</p>}
              {relPages.error && (
                <p className="p-3 text-sm text-foreground/60">{(relPages.error as Error).message}</p>
              )}
              {relPages.data && filteredPages.length === 0 && (
                <p className="p-3 text-sm text-foreground/50">Kosong.</p>
              )}
              <ul className="divide-y divide-border">
                {filteredPages.map((p: any) => {
                  const taken = trackedRelationIds.has(String(p.id).replace(/-/g, ""));
                  const isPicked = pickedPage?.id === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        disabled={taken}
                        onClick={() => {
                          setPickedPage({ id: p.id, title: p.title });
                          setOverrideName(p.title);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between ${isPicked ? "bg-foreground/10" : ""}`}
                      >
                        <span>
                          <span className="font-medium">{p.title}</span>
                          <span className="ml-2 text-[10px] font-mono text-foreground/40">{String(p.id).slice(0, 8)}…</span>
                        </span>
                        {taken && <span className="text-[10px] font-mono uppercase text-foreground/40">tracked</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            {pickedPage && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-foreground/50 mb-2">
                  Picked: <span className="text-foreground/80 font-medium">{pickedPage.title}</span>
                </p>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <input
                    value={overrideName}
                    onChange={(e) => setOverrideName(e.target.value)}
                    placeholder="Nama project"
                    className="md:col-span-7 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm"
                  />
                  <div className="md:col-span-3 flex gap-1 items-center flex-wrap px-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => setPickedColor(c.hex)}
                        style={{ backgroundColor: c.hex }}
                        className={`size-5 rounded-full ${pickedColor === c.hex ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100"}`}
                        aria-label={c.name}
                        title={c.name}
                      />
                    ))}
                    <input
                      type="color"
                      value={resolveColor(pickedColor)}
                      onChange={(e) => setPickedColor(e.target.value)}
                      className="size-5 rounded-full bg-transparent border border-white/20 cursor-pointer"
                      title="Custom"
                    />
                  </div>
                  <button
                    disabled={add.isPending || !overrideName.trim()}
                    onClick={() => {
                      add.mutate(
                        {
                          id: pickedPage.id,
                          name: overrideName.trim(),
                          color: pickedColor,
                        },
                        {
                          onSuccess: () => {
                            setAddOpen(false);
                          },
                        },
                      );
                    }}
                    className="md:col-span-2 px-3 py-2 bg-foreground text-background rounded-lg text-sm font-bold disabled:opacity-50"
                  >
                    {add.isPending ? "…" : "Add"}
                  </button>
                </div>
                {error && <p className="text-xs text-foreground/60 mt-2">{error}</p>}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}