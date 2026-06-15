import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageSkeleton } from "@/components/PageSkeleton";
import { getWeeklyAggregate, getSyncState } from "@/lib/notion.functions";
import { generateWeeklyInsights } from "@/lib/ai.functions";
import { Pager, usePager } from "@/components/Pager";
import { downloadWeeklyReport } from "@/components/WeeklyReportPDF";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard — NowTrack" },
      { name: "description", content: "Inowtech PM hub: weekly recap project, jam kerja, dan aktivitas tim dari Notion." },
    ],
  }),
  component: Dashboard,
});

function shiftWeek(iso: string, weeks: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function formatRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  e.setUTCDate(e.getUTCDate() - 1);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(s)} — ${fmt(e)}`;
}

const PRESET_BY_NAME: Record<string, string> = {
  purple: "#a855f7",
  blue: "#3b82f6",
  green: "#10b981",
  orange: "#f97316",
  pink: "#ec4899",
  red: "#ef4444",
  yellow: "#eab308",
  cyan: "#06b6d4",
};
function resolveColor(c: string | null | undefined): string {
  if (!c) return "#a855f7";
  if (c.startsWith("#")) return c;
  return PRESET_BY_NAME[c] ?? "#a855f7";
}


function Dashboard() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const fetchAgg = useServerFn(getWeeklyAggregate);
  const fetchSync = useServerFn(getSyncState);
  const fetchAI = useServerFn(generateWeeklyInsights);

  const { data: agg, isFetching } = useSuspenseQuery({
    queryKey: ["weekly", weekStart ?? "current"],
    queryFn: () => fetchAgg({ data: { weekStart } }),
    refetchInterval: 60000,
  });

  const { data: sync } = useQuery({
    queryKey: ["sync-state"],
    queryFn: () => fetchSync(),
    refetchInterval: 30000,
  });

  const ai = useQuery({
    queryKey: ["ai-insights", agg.weekStart],
    queryFn: () => fetchAI({ data: { weekStart: agg.weekStart } }),
    staleTime: 5 * 60 * 1000,
  });

  const maxHours = Math.max(1, ...agg.perPerson.map((p) => p.totalHours));

  const peoplePager = usePager(agg.perPerson, 8, agg.weekStart);
  const projectPager = usePager(agg.projects, 5, agg.weekStart);

  return (
    <>
      <header className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-4xl font-display font-extrabold tracking-tight">Weekly Overview</h1>
          <p className="text-foreground/50 text-sm flex items-center gap-2 mt-1">
            <span className="size-1.5 rounded-full bg-foreground/60 animate-pulse" />
            {sync?.lastSync
              ? `Synced from Notion · ${new Date(sync.lastSync).toLocaleString()}`
              : "Syncing from Notion"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              downloadWeeklyReport(
                {
                  kind: "all",
                  agg,
                  ai: ai.data
                    ? { summary: String(ai.data.summary ?? ""), improvements: String(ai.data.improvements ?? ""), critique: String(ai.data.critique ?? "") }
                    : null,
                },
                `nowtrack-weekly-${agg.weekStart}.pdf`,
              )
            }
            className="px-4 py-2 text-xs font-bold tracking-wider uppercase glass rounded-full hover:bg-foreground/10 transition-colors"
            title="Export weekly report as PDF"
          >
            ⬇ Export PDF
          </button>
          <div className="glass rounded-full p-1.5 flex items-center gap-1">
            <button
              onClick={() => setWeekStart(shiftWeek(agg.weekStart, -1))}
              className="px-3 py-1.5 text-sm text-foreground/50 hover:text-foreground rounded-full transition-colors"
            >
              ←
            </button>
            <span className="px-3 text-sm font-mono text-foreground/70">{formatRange(agg.weekStart, agg.weekEnd)}</span>
            <button
              onClick={() => setWeekStart(undefined)}
              className="px-5 py-1.5 text-xs font-bold tracking-wider uppercase bg-white text-black rounded-full shadow-[0_4px_20px_oklch(1_0_0_/_0.25)] hover:scale-105 active:scale-95 transition-transform"
            >
              Today
            </button>
            <button
              onClick={() => setWeekStart(shiftWeek(agg.weekStart, 1))}
              className="px-3 py-1.5 text-sm text-foreground/50 hover:text-foreground rounded-full transition-colors"
            >
              →
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard label="Total Hours" value={agg.totalHours.toFixed(1)} note={isFetching ? "Refreshing…" : "Logged this week"} delay="0ms" />
        <StatCard label="Tasks Done" value={String(agg.tasksDone).padStart(2, "0")} note="Completed" delay="60ms" />
        <StatCard label="In Progress" value={String(agg.tasksInProgress).padStart(2, "0")} note="Active work" delay="120ms" />
        <StatCard label="Blocked" value={String(agg.tasksBlocked).padStart(2, "0")} note={agg.tasksBlocked > 0 ? "Action required" : "All clear"} delay="180ms" />
      </div>

      {agg.projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          <div className="xl:col-span-8 space-y-8">
            <section className="glass rounded-[2rem] p-8">
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="font-display font-semibold text-lg">Hours per Person</h3>
                <span className="text-[10px] font-mono uppercase text-foreground/40">
                  {agg.perPerson.length} member{agg.perPerson.length === 1 ? "" : "s"} · this week
                </span>
              </div>
              {agg.perPerson.length === 0 ? (
                <p className="text-sm text-foreground/50">No time logged this week.</p>
              ) : (
                <>
                <ul className="space-y-4">
                  {peoplePager.pageItems.map((person) => {
                    const pct = (person.totalHours / maxHours) * 100;
                    const entries = Object.entries(person.byProject).sort(([, a], [, b]) => b - a);
                    return (
                      <li key={person.name}>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <span className="text-xs text-foreground/80 truncate">{person.name}</span>
                          <span className="font-mono text-xs tabular-nums text-foreground/70">
                            {person.totalHours.toFixed(1)}h
                          </span>
                        </div>
                        <div
                          className="relative h-2.5 rounded-full bg-foreground/[0.05] ring-1 ring-inset ring-white/5 overflow-hidden backdrop-blur-sm"
                          title={entries.map(([p, h]) => `${p}: ${h.toFixed(1)}h`).join(" · ")}
                        >
                          <div
                            className="absolute inset-y-0 left-0 flex rounded-full overflow-hidden"
                            style={{ width: `${pct}%` }}
                          >
                            {entries.map(([proj, hrs], i) => {
                              const segPct = (hrs / person.totalHours) * 100;
                              // Layered glass tones — same hue family, varying opacity
                              const tones = [
                                "bg-foreground/70",
                                "bg-foreground/45",
                                "bg-foreground/30",
                                "bg-foreground/20",
                                "bg-foreground/15",
                              ];
                              return (
                                <div
                                  key={proj}
                                  className={`${tones[i % tones.length]} border-r border-background/30 last:border-r-0`}
                                  style={{ width: `${segPct}%` }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Pager
                  page={peoplePager.page}
                  totalPages={peoplePager.totalPages}
                  onChange={peoplePager.setPage}
                  total={peoplePager.total}
                  pageSize={peoplePager.pageSize}
                />
                </>
              )}
            </section>

            <section className="glass rounded-[2rem] p-8">
              <h3 className="font-display font-semibold text-lg mb-4">Project Recap</h3>
              <div className="space-y-3">
                {projectPager.pageItems.map((p) => (
                  <div key={p.projectId} className="flex items-center justify-between p-4 rounded-2xl glass-tile hover:bg-white/[0.08] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="size-3 rounded-full" style={{ backgroundColor: resolveColor(p.color) }} />
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-xs text-foreground/55">
                          {p.tasksDone} done · {p.tasksInProgress} in progress · {p.tasksBlocked} blocked
                        </p>
                      </div>
                    </div>
                    <p className="font-mono font-bold">{p.totalHours.toFixed(1)}h</p>
                  </div>
                ))}
              </div>
              <Pager
                page={projectPager.page}
                totalPages={projectPager.totalPages}
                onChange={projectPager.setPage}
                total={projectPager.total}
                pageSize={projectPager.pageSize}
              />
            </section>
          </div>

          <aside className="xl:col-span-4 animate-panel">
            <div className="sticky top-0 space-y-4">
              <div className="glass-strong p-7 rounded-[2rem] relative overflow-hidden">
                <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="size-2.5 bg-foreground/80 rounded-full animate-pulse" />
                    <span className="font-display font-semibold">AI Insight Engine</span>
                  </div>
                  {ai.isFetching && <span className="text-[10px] font-mono opacity-60">thinking…</span>}
                </div>

                {ai.isLoading || !ai.data ? (
                  <p className="text-sm text-foreground/60">Generating insights…</p>
                ) : ai.error ? (
                  <p className="text-sm text-foreground/60">{(ai.error as Error).message}</p>
                ) : (
                  <div className="space-y-5">
                    <Block label="Summary" body={ai.data.summary} />
                    <Block label="Improvements" body={ai.data.improvements} variant="muted" />
                    <Block label="Critique" body={ai.data.critique} variant="warn" />
                  </div>
                )}

                <button
                  onClick={() => ai.refetch()}
                  className="w-full mt-6 py-3 bg-white text-black rounded-2xl text-sm font-extrabold tracking-tight hover:scale-[0.98] transition-transform shadow-[0_4px_20px_oklch(1_0_0_/_0.2)]"
                >
                  Regenerate Insight
                </button>
              </div>

              <div className="glass p-5 rounded-3xl">
                <div className="text-xs font-mono uppercase text-foreground/40 mb-3">Notion Sync</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="size-2 bg-foreground/70 rounded-full" />
                    <span className="text-xs font-medium">Live · {agg.projects.length} project{agg.projects.length !== 1 ? "s" : ""}</span>
                  </div>
                  <Link to="/settings" className="text-[10px] text-foreground/50 hover:text-foreground">
                    Manage
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, note, delay }: { label: string; value: string; note: string; delay: string }) {
  return (
    <div
      className="animate-enter group relative overflow-hidden glass rounded-[2rem] p-6 transition-all duration-500 hover:-translate-y-1 hover:bg-white/[0.09]"
      style={{ animationDelay: delay }}
    >
      <div aria-hidden className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl transition-transform duration-500 bg-white/10 group-hover:scale-125" />
      <div className="relative z-10">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] mb-3 text-foreground/50">{label}</div>
        <div className="text-5xl font-display font-extrabold tracking-tighter text-foreground mb-5">{value}</div>
        <div className="inline-block px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border border-white/10 bg-white/5 text-foreground/70">
          {note}
        </div>
      </div>
    </div>
  );
}

function Block({ label, body, variant }: { label: string; body: string; variant?: "muted" | "warn" }) {
  if (!body) return null;
  const cls =
    variant === "warn"
      ? "p-4 bg-white/5 rounded-2xl ring-1 ring-white/15 backdrop-blur"
      : variant === "muted"
      ? "p-4 bg-white/5 rounded-2xl ring-1 ring-white/10 backdrop-blur"
      : "";
  const labelColor = "text-foreground/40";
  return (
    <div className={`space-y-2 ${cls}`}>
      <div className={`text-[10px] font-mono uppercase ${labelColor}`}>{label}</div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{body}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass rounded-[2rem] p-12 text-center">
      <h2 className="text-xl font-display font-bold mb-2">No projects connected yet</h2>
      <p className="text-foreground/60 text-sm mb-6 max-w-md mx-auto">
        Connect your Notion database for each project. NowTrack will pull tasks, hours, and statuses automatically.
      </p>
      <Link to="/settings" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black rounded-2xl text-sm font-bold shadow-[0_4px_20px_oklch(1_0_0_/_0.2)] hover:scale-105 transition-transform">
        Open Settings →
      </Link>
    </div>
  );
}
