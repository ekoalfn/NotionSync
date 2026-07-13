import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getMonthlyReport } from "@/lib/notion.functions";
import { getMonthlyInsights } from "@/lib/chat.functions";
import { downloadMonthlyReport } from "@/components/MonthlyReportPDF";

// Monthly now lives inside the unified /report page (Monthly tab). This route
// only redirects there so old links / bookmarks keep working. The report page
// imports `MonthlyContent` below directly.
export const Route = createFileRoute("/_authenticated/monthly")({
  beforeLoad: () => {
    throw redirect({ to: "/report", search: { tab: "monthly" } });
  },
});

// ───────────────────────── helpers ─────────────────────────

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

// Deterministic palette for person lines (no project color reference).
const PERSON_PALETTE = [
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#f97316", // orange
  "#10b981", // green
  "#ec4899", // pink
  "#eab308", // yellow
  "#3b82f6", // blue
  "#ef4444", // red
];
function personColor(idx: number) {
  return PERSON_PALETTE[idx % PERSON_PALETTE.length];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function isoFor(d: Date) {
  return d.toISOString().slice(0, 10);
}
function presetThisMonth(): { start: string; end: string } {
  const n = new Date();
  return {
    start: isoFor(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1))),
    end: isoFor(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0))),
  };
}
function presetLastMonth(): { start: string; end: string } {
  const n = new Date();
  return {
    start: isoFor(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1))),
    end: isoFor(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0))),
  };
}
function presetLast30(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  return { start: isoFor(start), end: isoFor(end) };
}
function presetLast90(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 89);
  return { start: isoFor(start), end: isoFor(end) };
}

// ───────────────────────── content ─────────────────────────

export function MonthlyContent() {
  const fetchReport = useServerFn(getMonthlyReport);
  const fetchInsights = useServerFn(getMonthlyInsights);

  const initial = presetThisMonth();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [compare, setCompare] = useState(false);

  // Filter state — empty array = "all". User can narrow to specific persons/projects.
  const [filterPersons, setFilterPersons] = useState<string[]>([]);
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // PDF generation state
  const [pdfBusy, setPdfBusy] = useState(false);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["monthly-report", start, end, compare],
    queryFn: () => fetchReport({ data: { start, end, compare } }),
    staleTime: 60_000,
  });

  // AI Insights state — declared AFTER `data` because mutation reads it.
  const [insights, setInsights] = useState<string | null>(null);
  const insightsMut = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("Data belum dimuat.");
      const res = await fetchInsights({
        data: {
          report: filteredReport ?? data,
          filters: {
            persons: filterPersons.length ? filterPersons : undefined,
            projects: filterProjects.length ? filterProjects : undefined,
          },
        },
      });
      return res.content;
    },
    onSuccess: (content) => setInsights(content),
  });

  // Reset insights when range/compare/filter changes — stale insights mislead.
  // (We don't auto-regenerate to save API calls; user clicks button.)
  useEffect(() => {
    setInsights(null);
  }, [start, end, compare, filterPersons.join(","), filterProjects.join(",")]);

  // Active preset detection — used to highlight the chip the user clicked.
  const activePreset = useMemo(() => {
    const presets = {
      "This month": presetThisMonth(),
      "Last month": presetLastMonth(),
      "Last 30 days": presetLast30(),
      "Last 90 days": presetLast90(),
    } as const;
    for (const [name, p] of Object.entries(presets)) {
      if (p.start === start && p.end === end) return name;
    }
    return null;
  }, [start, end]);

  // Apply filters to the raw report. We re-build persons/projects/weekTotals/grandTotals
  // when a filter is active. Returns null when no filter is set (use original data).
  const filteredReport = useMemo(() => {
    if (!data) return null;
    if (filterPersons.length === 0 && filterProjects.length === 0) return null;

    const pSet = new Set(filterPersons);
    const projSet = new Set(filterProjects);

    const applyFilter = (period: typeof data) => {
      const persons =
        filterPersons.length > 0 ? period.persons.filter((p) => pSet.has(p.name)) : period.persons;
      const projects =
        filterProjects.length > 0
          ? period.projects.filter((p) => projSet.has(p.name))
          : period.projects;

      // Recompute week totals from the filtered slices.
      // Wall-clock total per week = sum of filtered project byWeek values.
      // Man-hours total per week = sum of filtered person byWeek values.
      // Tasks count can't be re-derived from byWeek aggregates alone — we leave
      // it as the original (or null) so the UI shouldn't depend on it post-filter.
      const weekTotals = period.weeks.map((w) => {
        const wallClock = projects.reduce((s, p) => s + (p.byWeek[w.key] ?? 0), 0);
        const manHours = persons.reduce((s, p) => s + (p.byWeek[w.key] ?? 0), 0);
        return {
          key: w.key,
          wallClock: Number(wallClock.toFixed(2)),
          manHours: Number(manHours.toFixed(2)),
          tasks: 0, // unavailable after filter
        };
      });
      const grandTotals = {
        wallClock: Number(projects.reduce((s, p) => s + p.total, 0).toFixed(2)),
        manHours: Number(persons.reduce((s, p) => s + p.total, 0).toFixed(2)),
        tasks: 0,
      };
      // Keep projectBreakdowns for the projects that survived the filter.
      // The per-project breakdown is already man-hours per assignee; we don't
      // re-filter by person here because the breakdown's "persons" array is
      // scoped to that project's contributors regardless of the global person
      // filter. If the user wants to narrow contributors view, they should
      // adjust the person filter and look at Person × Week instead.
      const rawBreakdowns = (period as any).projectBreakdowns ?? {};
      const projectBreakdowns: Record<string, any> = {};
      for (const proj of projects) {
        if (rawBreakdowns[proj.name]) {
          projectBreakdowns[proj.name] = rawBreakdowns[proj.name];
        }
      }
      return { ...period, persons, projects, projectBreakdowns, weekTotals, grandTotals };
    };

    const current = applyFilter(data);
    const previous = data.previous ? applyFilter(data.previous as typeof data) : null;
    return { ...current, previous };
  }, [data, filterPersons, filterProjects]);

  // The "active" view — either raw or filtered.
  const view = filteredReport ?? data;

  // All available persons/projects across BOTH periods (so filter dropdown shows
  // names even if they only existed in the previous period).
  const allPersonNames = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    data.persons.forEach((p) => set.add(p.name));
    data.previous?.persons.forEach((p) => set.add(p.name));
    return Array.from(set).sort();
  }, [data]);
  const allProjectNames = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    data.projects.forEach((p) => set.add(p.name));
    data.previous?.projects.forEach((p) => set.add(p.name));
    return Array.from(set).sort();
  }, [data]);

  const filterCount = filterPersons.length + filterProjects.length;

  const handleExportPdf = async () => {
    if (!view) return;
    setPdfBusy(true);
    try {
      await downloadMonthlyReport({
        range: view.range,
        weeks: view.weeks,
        persons: view.persons,
        projects: view.projects,
        projectBreakdowns: (view as any).projectBreakdowns,
        weekTotals: view.weekTotals,
        grandTotals: view.grandTotals,
        previous: view.previous ?? null,
        insights,
      });
    } catch (e) {
      console.error("PDF export failed:", e);
      alert("Gagal membuat PDF: " + (e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <>
      <header className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-4xl font-display font-extrabold tracking-tight">
            Monthly Report
          </h1>
          <p className="text-foreground/50 text-xs md:text-sm mt-1">
            Per-week breakdown of team hours and project effort. Custom range, auto-grouped weekly.
          </p>
        </div>
        {isFetching && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/40">
            Refreshing…
          </span>
        )}
      </header>

      {/* Date range controls */}
      <section className="glass rounded-[2rem] p-5 md:p-6 mb-6 md:mb-8">
        <div className="flex flex-wrap items-end gap-4">
          {/* Preset chips */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: "This month", range: presetThisMonth() },
              { label: "Last month", range: presetLastMonth() },
              { label: "Last 30 days", range: presetLast30() },
              { label: "Last 90 days", range: presetLast90() },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setStart(p.range.start);
                  setEnd(p.range.end);
                }}
                className={
                  activePreset === p.label
                    ? "px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-white text-black shadow-[0_4px_20px_oklch(1_0_0_/_0.2)]"
                    : "px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase glass-tile text-foreground/70 hover:text-foreground transition-colors"
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="h-6 w-px bg-foreground/10 hidden md:block" />
          {/* Custom date inputs */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/40">
                Start
              </span>
              <input
                type="date"
                value={start}
                max={end}
                onChange={(e) => setStart(e.target.value)}
                className="px-3 py-2 rounded-xl glass-tile text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-foreground/20 text-foreground/90 min-w-0 w-[150px]"
              />
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/40">
                End
              </span>
              <input
                type="date"
                value={end}
                min={start}
                max={todayISO()}
                onChange={(e) => setEnd(e.target.value)}
                className="px-3 py-2 rounded-xl glass-tile text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-foreground/20 text-foreground/90 min-w-0 w-[150px]"
              />
            </label>
          </div>
          <div className="h-6 w-px bg-foreground/10 hidden md:block ml-auto" />
          {/* Compare toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none group">
            <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/50 group-hover:text-foreground/80 transition-colors">
              Compare to previous period
            </span>
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                compare ? "bg-white" : "bg-foreground/15"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                  compare ? "bg-black translate-x-[18px]" : "bg-foreground/60 translate-x-1"
                }`}
              />
            </span>
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="sr-only"
            />
          </label>
        </div>
      </section>

      {/* Filter & action bar */}
      {data && (
        <section className="glass rounded-[2rem] p-4 md:p-5 mb-6 md:mb-8 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setFilterPanelOpen((v) => !v)}
            className={
              filterCount > 0
                ? "px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-white text-black inline-flex items-center gap-2"
                : "px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase glass-tile text-foreground/70 hover:text-foreground transition-colors inline-flex items-center gap-2"
            }
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polygon points="3 4 21 4 14 12 14 19 10 21 10 12 3 4" />
            </svg>
            Filter
            {filterCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-mono rounded-full bg-black text-white">
                {filterCount}
              </span>
            )}
          </button>

          {filterCount > 0 && (
            <button
              onClick={() => {
                setFilterPersons([]);
                setFilterProjects([]);
              }}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase text-foreground/60 hover:text-foreground/90 transition-colors"
            >
              Clear filters
            </button>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() => insightsMut.mutate()}
              disabled={insightsMut.isPending || !data}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase glass-tile text-foreground/80 hover:text-foreground transition-colors inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 2l2.4 7.2h7.6l-6.2 4.5 2.4 7.3-6.2-4.5-6.2 4.5 2.4-7.3-6.2-4.5h7.6z" />
              </svg>
              {insightsMut.isPending
                ? "Analyzing…"
                : insights
                  ? "Regenerate insights"
                  : "AI insights"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={pdfBusy || !view}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-white text-black inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_20px_oklch(1_0_0_/_0.15)]"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              {pdfBusy ? "Building PDF…" : "Export PDF"}
            </button>
          </div>

          {/* Filter panel (expandable) */}
          {filterPanelOpen && (
            <div className="w-full pt-3 mt-1 border-t border-white/10 flex flex-col gap-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-foreground/50 mb-2">
                  Persons {filterPersons.length > 0 && `(${filterPersons.length} selected)`}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allPersonNames.length === 0 ? (
                    <span className="text-xs text-foreground/40">No persons in range.</span>
                  ) : (
                    allPersonNames.map((n) => {
                      const active = filterPersons.includes(n);
                      return (
                        <button
                          key={n}
                          onClick={() => {
                            setFilterPersons((prev) =>
                              prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
                            );
                          }}
                          className={
                            active
                              ? "px-2.5 py-1 rounded-full text-[11px] font-medium bg-white text-black"
                              : "px-2.5 py-1 rounded-full text-[11px] font-medium glass-tile text-foreground/70 hover:text-foreground transition-colors"
                          }
                        >
                          {n}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-foreground/50 mb-2">
                  Projects {filterProjects.length > 0 && `(${filterProjects.length} selected)`}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allProjectNames.length === 0 ? (
                    <span className="text-xs text-foreground/40">No projects in range.</span>
                  ) : (
                    allProjectNames.map((n) => {
                      const active = filterProjects.includes(n);
                      const proj =
                        data.projects.find((p) => p.name === n) ??
                        data.previous?.projects.find((p) => p.name === n);
                      const color = resolveColor(proj?.color);
                      return (
                        <button
                          key={n}
                          onClick={() => {
                            setFilterProjects((prev) =>
                              prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
                            );
                          }}
                          className={
                            active
                              ? "px-2.5 py-1 rounded-full text-[11px] font-medium bg-white text-black inline-flex items-center gap-1.5"
                              : "px-2.5 py-1 rounded-full text-[11px] font-medium glass-tile text-foreground/70 hover:text-foreground transition-colors inline-flex items-center gap-1.5"
                          }
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          {n}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              {filterCount > 0 && (
                <p className="text-[11px] text-foreground/50">
                  Showing data for {filterPersons.length > 0 && `${filterPersons.length} person(s)`}
                  {filterPersons.length > 0 && filterProjects.length > 0 && " · "}
                  {filterProjects.length > 0 && `${filterProjects.length} project(s)`}. Tasks count
                  hidden because totals are recomputed from aggregated buckets.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Error state */}
      {error && (
        <div className="glass rounded-[2rem] p-6 mb-6">
          <p className="text-sm text-foreground/70">
            Failed to load report: <span className="font-mono">{(error as Error).message}</span>
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-white text-black rounded-full"
          >
            Retry
          </button>
        </div>
      )}

      {view && (
        <>
          {/* AI Insights panel — sticky at top so it's the first thing user reads after KPIs */}
          {(insights || insightsMut.isError) && (
            <section className="glass rounded-[2rem] p-5 md:p-7 mb-6 md:mb-8 relative">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/50" />
                  <h2 className="font-display font-semibold text-lg">AI Insights</h2>
                  {filterCount > 0 && (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/40">
                      · filtered view
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setInsights(null)}
                  className="text-[10px] font-mono uppercase tracking-wider text-foreground/40 hover:text-foreground/80 transition-colors"
                >
                  Dismiss
                </button>
              </div>
              {insightsMut.isError ? (
                <p className="text-sm text-rose-300">
                  Gagal generate insights: {(insightsMut.error as Error).message}
                </p>
              ) : (
                <article className="prose prose-invert prose-sm max-w-none text-foreground/85 leading-relaxed [&_strong]:text-foreground [&_strong]:font-semibold [&_ul]:my-2 [&_li]:my-0.5 [&_p]:my-2 whitespace-pre-wrap">
                  {insights}
                </article>
              )}
            </section>
          )}

          {/* KPI summary with optional comparison deltas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-6 md:mb-8">
            <KpiCard
              label="Wall-clock"
              value={
                filterPersons.length > 0 && filterProjects.length === 0
                  ? "—"
                  : `${view.grandTotals.wallClock.toFixed(1)}h`
              }
              sub={
                filterPersons.length > 0 && filterProjects.length === 0
                  ? "n/a per person"
                  : "actual time"
              }
              previous={
                filterPersons.length > 0 && filterProjects.length === 0
                  ? undefined
                  : view.previous?.grandTotals.wallClock
              }
            />
            <KpiCard
              label="Man-hours"
              value={`${view.grandTotals.manHours.toFixed(1)}h`}
              sub="incl. collab"
              previous={view.previous?.grandTotals.manHours}
            />
            <KpiCard
              label="Tasks"
              value={filterCount > 0 ? "—" : String(view.grandTotals.tasks)}
              sub={filterCount > 0 ? "filtered" : "with duration"}
              previous={filterCount > 0 ? undefined : view.previous?.grandTotals.tasks}
            />
            <KpiCard
              label="Weeks"
              value={String(view.weeks.length)}
              sub="in range"
              previous={view.previous?.weeks.length}
            />
          </div>

          {/* Comparison band — shows which periods are being compared */}
          {view.previous && (
            <div className="glass rounded-2xl px-4 md:px-5 py-3 mb-6 md:mb-8 flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-white" />
                <span className="font-mono text-foreground/85">
                  {view.range.start} → {view.range.end}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-foreground/40">
                  current
                </span>
              </span>
              <span className="text-foreground/30">vs</span>
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-foreground/40 outline outline-1 outline-dashed outline-foreground/40" />
                <span className="font-mono text-foreground/65">
                  {view.previous.range.start} → {view.previous.range.end}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-foreground/40">
                  previous
                </span>
              </span>
            </div>
          )}

          {view.weeks.length === 0 || view.persons.length + view.projects.length === 0 ? (
            <div className="glass rounded-[2rem] p-12 text-center">
              <p className="text-foreground/60">
                {filterCount > 0
                  ? "No data matches the current filters. Try clearing one or more."
                  : "No tasks with duration in this date range."}
              </p>
            </div>
          ) : (
            <div className="space-y-6 md:space-y-8">
              {/* When filter is active we hide the side that the filter doesn't constrain,
                  because those numbers would be misleading (we only have aggregated buckets
                  per dimension, not a person×project breakdown). */}
              {(() => {
                const onlyPerson = filterPersons.length > 0 && filterProjects.length === 0;
                const onlyProject = filterProjects.length > 0 && filterPersons.length === 0;
                const showPersonSide = !onlyProject;
                const showProjectSide = !onlyPerson;
                const showTotalTrend = !filterCount || (showPersonSide && showProjectSide);
                return (
                  <>
                    {/* TREND CHART: Total hours per week (with optional previous overlay) */}
                    {showTotalTrend && (
                      <TotalTrendChart
                        weeks={view.weeks}
                        weekTotals={view.weekTotals}
                        previousWeekTotals={view.previous?.weekTotals ?? null}
                      />
                    )}

                    {showPersonSide && (
                      <>
                        {/* TREND CHART: Per-person multi-line */}
                        <PersonTrendChart
                          weeks={view.weeks}
                          persons={view.persons}
                          previousPersons={view.previous?.persons ?? null}
                        />

                        {/* PERSON × WEEK MATRIX */}
                        <WeeklyMatrix
                          title="Person × Week"
                          subtitle="Man-hours per person. Co-assigned tasks credit each collaborator the full duration."
                          leftHeader="Team"
                          rows={view.persons.map((p) => ({
                            key: p.name,
                            label: p.name,
                            color: null,
                            byWeek: p.byWeek,
                            total: p.total,
                          }))}
                          weeks={view.weeks}
                          weekTotals={view.weekTotals.map((w) => ({
                            key: w.key,
                            total: w.manHours,
                          }))}
                          grandTotal={view.grandTotals.manHours}
                          previousRows={view.previous?.persons.map((p) => ({
                            key: p.name,
                            total: p.total,
                          }))}
                          showWowDelta
                          capacityHoursPerWeek={(view as any).normalHoursPerWeek}
                        />
                      </>
                    )}

                    {showProjectSide && (
                      <>
                        {/* TREND CHART: Per-project multi-line */}
                        <ProjectTrendChart
                          weeks={view.weeks}
                          projects={view.projects}
                          previousProjects={view.previous?.projects ?? null}
                        />

                        {/* PROJECT × WEEK MATRIX */}
                        <WeeklyMatrix
                          title="Project × Week"
                          subtitle="Wall-clock hours per project. Each task counted once even if multiple people worked on it."
                          leftHeader="Project"
                          rows={view.projects.map((p) => ({
                            key: p.name,
                            label: p.name,
                            color: p.color,
                            byWeek: p.byWeek,
                            total: p.total,
                          }))}
                          weeks={view.weeks}
                          weekTotals={view.weekTotals.map((w) => ({
                            key: w.key,
                            total: w.wallClock,
                          }))}
                          grandTotal={view.grandTotals.wallClock}
                          previousRows={view.previous?.projects.map((p) => ({
                            key: p.name,
                            total: p.total,
                          }))}
                          showWowDelta
                        />
                      </>
                    )}

                    {/* Helper note when filtering hides a side */}
                    {(onlyPerson || onlyProject) && (
                      <p className="text-xs text-foreground/40 italic px-2">
                        {onlyPerson
                          ? "Project-side data hidden — we don't have per-person × per-project breakdowns. Add a project filter alongside to narrow further."
                          : "Person-side data hidden — we don't have per-project × per-person breakdowns. Add a person filter alongside to narrow further."}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ───────────────────────── KPI card with delta ─────────────────────────

function KpiCard({
  label,
  value,
  sub,
  previous,
}: {
  label: string;
  value: string;
  sub: string;
  previous?: number | undefined;
}) {
  // Parse the numeric portion of `value` for delta computation.
  // We accept "133.7h", "5", etc.
  const currentNum = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  const hasDelta =
    previous !== undefined && Number.isFinite(currentNum) && Number.isFinite(previous);
  let deltaPct: number | null = null;
  let deltaDir: "up" | "down" | "flat" = "flat";
  if (hasDelta) {
    if (previous === 0 && currentNum === 0) {
      deltaPct = 0;
      deltaDir = "flat";
    } else if (previous === 0) {
      deltaPct = null; // infinity — render as "new"
      deltaDir = "up";
    } else {
      const diff = currentNum - previous;
      deltaPct = (diff / previous) * 100;
      deltaDir = Math.abs(deltaPct) < 0.5 ? "flat" : diff > 0 ? "up" : "down";
    }
  }

  return (
    <div className="glass rounded-2xl md:rounded-[2rem] p-4 md:p-6">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/50 mb-2 md:mb-3">
        {label}
      </div>
      <div className="text-2xl md:text-4xl font-display font-extrabold tracking-tighter tabular-nums">
        {value}
      </div>
      <div className="flex items-center gap-2 mt-2 md:mt-3 min-w-0">
        {hasDelta ? (
          <>
            <span
              className={`text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded shrink-0 ${
                deltaDir === "up"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : deltaDir === "down"
                    ? "bg-rose-500/15 text-rose-300"
                    : "bg-foreground/10 text-foreground/60"
              }`}
            >
              {deltaPct === null
                ? "NEW"
                : `${deltaDir === "up" ? "▲" : deltaDir === "down" ? "▼" : "•"} ${Math.abs(deltaPct).toFixed(0)}%`}
            </span>
            <span className="text-[10px] font-mono uppercase text-foreground/40 truncate">
              vs prev
            </span>
          </>
        ) : (
          <span className="text-[10px] font-mono uppercase text-foreground/40 truncate">{sub}</span>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── chart shared bits ─────────────────────────

// Generic dark-themed tooltip — formats hours nicely
function HoursTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // Filter out 0-value lines from tooltip to reduce noise on sparse data.
  const visible = payload.filter((p: any) => Number(p.value) > 0);
  if (visible.length === 0) return null;
  return (
    <div className="glass rounded-xl px-3 py-2.5 text-xs min-w-[140px] shadow-lg border border-white/5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-foreground/50 mb-1.5">
        {label}
      </div>
      <ul className="space-y-1">
        {visible.map((p: any) => (
          <li key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <span className="text-foreground/85 truncate max-w-[120px]">{p.name}</span>
            </span>
            <span className="font-mono tabular-nums font-semibold text-foreground shrink-0">
              {Number(p.value).toFixed(1)}h
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Custom legend — compact, scrollable on overflow
function CompactLegend({ payload }: any) {
  if (!payload?.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-2 max-h-[60px] overflow-y-auto px-2">
      {payload.map((entry: any) => (
        <li key={entry.value} className="flex items-center gap-1.5 text-[11px]">
          <span
            className="size-2 rounded-full shrink-0"
            style={{
              backgroundColor: entry.color,
              outline: entry.payload?.strokeDasharray ? `1px dashed ${entry.color}` : undefined,
              outlineOffset: entry.payload?.strokeDasharray ? "1px" : undefined,
            }}
          />
          <span className="text-foreground/75 truncate max-w-[140px]">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}

// ───────────────────────── TOTAL TREND CHART ─────────────────────────

function TotalTrendChart({
  weeks,
  weekTotals,
  previousWeekTotals,
}: {
  weeks: Array<{ key: string; label: string }>;
  weekTotals: Array<{ key: string; wallClock: number; manHours: number }>;
  previousWeekTotals: Array<{ key: string; wallClock: number; manHours: number }> | null;
}) {
  // Align previous by week-index (Week 1, 2, ...). Both periods are same length when compare=on.
  const data = weeks.map((w, i) => {
    const cur = weekTotals[i];
    const prev = previousWeekTotals?.[i];
    return {
      label: w.label,
      "Wall-clock": cur?.wallClock ?? 0,
      "Man-hours": cur?.manHours ?? 0,
      "Wall-clock (prev)": prev?.wallClock ?? 0,
      "Man-hours (prev)": prev?.manHours ?? 0,
    };
  });

  return (
    <section className="glass rounded-[2rem] p-6 md:p-8">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="font-display font-semibold text-lg">Weekly Totals — Trend</h2>
        <span className="text-[10px] font-mono uppercase text-foreground/40 shrink-0">
          {weeks.length} weeks
        </span>
      </div>
      <p className="text-xs text-foreground/45 mb-4 md:mb-6">
        Wall-clock vs man-hours across each week.
        {previousWeekTotals && " Dashed lines = previous period."}
      </p>
      <div className="h-[280px] md:h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v) => `${v}h`}
            />
            <Tooltip content={<HoursTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
            <Legend content={<CompactLegend />} />
            <Line
              type="monotone"
              dataKey="Wall-clock"
              stroke="#a855f7"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#a855f7", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="Man-hours"
              stroke="#06b6d4"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#06b6d4", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            {previousWeekTotals && (
              <>
                <Line
                  type="monotone"
                  dataKey="Wall-clock (prev)"
                  stroke="#a855f7"
                  strokeOpacity={0.45}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Man-hours (prev)"
                  stroke="#06b6d4"
                  strokeOpacity={0.45}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ───────────────────────── PERSON TREND CHART ─────────────────────────

function PersonTrendChart({
  weeks,
  persons,
  previousPersons,
}: {
  weeks: Array<{ key: string; label: string }>;
  persons: Array<{ name: string; byWeek: Record<string, number>; total: number }>;
  previousPersons: Array<{ name: string; byWeek: Record<string, number>; total: number }> | null;
}) {
  // Limit to top 6 persons by total to keep chart readable. "Other" bucket if > 6.
  const TOP_N = 6;
  const sorted = [...persons].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, TOP_N);
  const rest = sorted.slice(TOP_N);
  const showOther = rest.length > 0;

  // Color map (stable, by sorted order)
  const colorOf = (name: string) => {
    const idx = top.findIndex((p) => p.name === name);
    return idx >= 0 ? personColor(idx) : "#94a3b8";
  };

  // Previous-period map by name (so missing persons in prev are zeroed).
  const prevByName = new Map<string, Record<string, number>>();
  if (previousPersons) {
    // Align previous by week-INDEX, not week-key (different keys in prev period).
    // Build by-index buckets.
    const prevWeekKeys = new Set<string>();
    previousPersons.forEach((p) => Object.keys(p.byWeek).forEach((k) => prevWeekKeys.add(k)));
    const sortedPrevKeys = Array.from(prevWeekKeys).sort();
    for (const person of previousPersons) {
      const byIndex: Record<string, number> = {};
      sortedPrevKeys.forEach((k, i) => {
        byIndex[`__idx${i}`] = person.byWeek[k] ?? 0;
      });
      prevByName.set(person.name, byIndex);
    }
  }

  const data = weeks.map((w, i) => {
    const row: Record<string, any> = { label: w.label };
    for (const p of top) {
      row[p.name] = p.byWeek[w.key] ?? 0;
    }
    if (showOther) {
      row["Other"] = rest.reduce((s, p) => s + (p.byWeek[w.key] ?? 0), 0);
    }
    if (previousPersons) {
      for (const p of top) {
        const prev = prevByName.get(p.name);
        row[`${p.name} (prev)`] = prev?.[`__idx${i}`] ?? 0;
      }
    }
    return row;
  });

  return (
    <section className="glass rounded-[2rem] p-6 md:p-8">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="font-display font-semibold text-lg">Person — Weekly Trend</h2>
        <span className="text-[10px] font-mono uppercase text-foreground/40 shrink-0">
          {top.length} {top.length === 1 ? "person" : "people"}
          {showOther && ` + ${rest.length} other`}
        </span>
      </div>
      <p className="text-xs text-foreground/45 mb-4 md:mb-6">
        Man-hours per person per week (top {TOP_N}).
        {previousPersons && " Dashed = previous period."}
      </p>
      <div className="h-[300px] md:h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v) => `${v}h`}
            />
            <Tooltip content={<HoursTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
            <Legend content={<CompactLegend />} />
            {top.map((p) => (
              <Line
                key={p.name}
                type="monotone"
                dataKey={p.name}
                stroke={colorOf(p.name)}
                strokeWidth={2}
                dot={{ r: 2.5, fill: colorOf(p.name), strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            ))}
            {showOther && (
              <Line
                type="monotone"
                dataKey="Other"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="2 3"
                dot={false}
              />
            )}
            {previousPersons &&
              top.map((p) => (
                <Line
                  key={`${p.name}-prev`}
                  type="monotone"
                  dataKey={`${p.name} (prev)`}
                  stroke={colorOf(p.name)}
                  strokeOpacity={0.4}
                  strokeWidth={1.2}
                  strokeDasharray="4 4"
                  dot={false}
                  legendType="none"
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ───────────────────────── PROJECT TREND CHART ─────────────────────────

function ProjectTrendChart({
  weeks,
  projects,
  previousProjects,
}: {
  weeks: Array<{ key: string; label: string }>;
  projects: Array<{
    name: string;
    color: string | null;
    byWeek: Record<string, number>;
    total: number;
  }>;
  previousProjects: Array<{
    name: string;
    color: string | null;
    byWeek: Record<string, number>;
    total: number;
  }> | null;
}) {
  // Show all projects (they're already sorted by total desc); cap at 8 for readability.
  const TOP_N = 8;
  const top = projects.slice(0, TOP_N);
  const rest = projects.slice(TOP_N);
  const showOther = rest.length > 0;

  // Previous map by name → by-index
  const prevByName = new Map<string, Record<string, number>>();
  if (previousProjects) {
    const prevWeekKeys = new Set<string>();
    previousProjects.forEach((p) => Object.keys(p.byWeek).forEach((k) => prevWeekKeys.add(k)));
    const sortedPrevKeys = Array.from(prevWeekKeys).sort();
    for (const proj of previousProjects) {
      const byIndex: Record<string, number> = {};
      sortedPrevKeys.forEach((k, i) => {
        byIndex[`__idx${i}`] = proj.byWeek[k] ?? 0;
      });
      prevByName.set(proj.name, byIndex);
    }
  }

  const data = weeks.map((w, i) => {
    const row: Record<string, any> = { label: w.label };
    for (const p of top) {
      row[p.name] = p.byWeek[w.key] ?? 0;
    }
    if (showOther) {
      row["Other"] = rest.reduce((s, p) => s + (p.byWeek[w.key] ?? 0), 0);
    }
    if (previousProjects) {
      for (const p of top) {
        const prev = prevByName.get(p.name);
        row[`${p.name} (prev)`] = prev?.[`__idx${i}`] ?? 0;
      }
    }
    return row;
  });

  return (
    <section className="glass rounded-[2rem] p-6 md:p-8">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="font-display font-semibold text-lg">Project — Weekly Trend</h2>
        <span className="text-[10px] font-mono uppercase text-foreground/40 shrink-0">
          {top.length} {top.length === 1 ? "project" : "projects"}
          {showOther && ` + ${rest.length} other`}
        </span>
      </div>
      <p className="text-xs text-foreground/45 mb-4 md:mb-6">
        Wall-clock hours per project per week (top {TOP_N}).
        {previousProjects && " Dashed = previous period."}
      </p>
      <div className="h-[300px] md:h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v) => `${v}h`}
            />
            <Tooltip content={<HoursTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
            <Legend content={<CompactLegend />} />
            {top.map((p) => (
              <Line
                key={p.name}
                type="monotone"
                dataKey={p.name}
                stroke={resolveColor(p.color)}
                strokeWidth={2}
                dot={{ r: 2.5, fill: resolveColor(p.color), strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            ))}
            {showOther && (
              <Line
                type="monotone"
                dataKey="Other"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="2 3"
                dot={false}
              />
            )}
            {previousProjects &&
              top.map((p) => (
                <Line
                  key={`${p.name}-prev`}
                  type="monotone"
                  dataKey={`${p.name} (prev)`}
                  stroke={resolveColor(p.color)}
                  strokeOpacity={0.4}
                  strokeWidth={1.2}
                  strokeDasharray="4 4"
                  dot={false}
                  legendType="none"
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ───────────────────────── WEEKLY MATRIX (existing) ─────────────────────────

/**
 * WeeklyMatrix — desktop table + mobile card stack. Identical column semantics
 * for both: leftmost row label, one cell per week, rightmost total per row;
 * footer row sums each week + grand total.
 *
 * `previousRows` (optional) → shows a delta badge next to each row's total
 * (current vs same-name row in previous period).
 */
function WeeklyMatrix({
  title,
  subtitle,
  leftHeader,
  rows,
  weeks,
  weekTotals,
  grandTotal,
  previousRows,
  showWowDelta,
  capacityHoursPerWeek,
}: {
  title: string;
  subtitle: string;
  leftHeader: string;
  rows: Array<{
    key: string;
    label: string;
    color: string | null;
    byWeek: Record<string, number>;
    total: number;
  }>;
  weeks: Array<{ key: string; label: string; weekStart: string; weekEnd: string }>;
  weekTotals: Array<{ key: string; total: number }>;
  grandTotal: number;
  previousRows?: Array<{ key: string; total: number }> | undefined;
  /** Show week-over-week delta inline inside each hour cell (green ▲ / red ▼). */
  showWowDelta?: boolean;
  /** When > 0, render an additional sub-row beneath each data row showing
   *  (hours / capacity) % per week. Used for "utilization" in Person × Week. */
  capacityHoursPerWeek?: number;
}) {
  const totalsByKey: Record<string, number> = {};
  for (const w of weekTotals) totalsByKey[w.key] = w.total;

  const previousTotalsByKey = new Map<string, number>();
  if (previousRows) {
    for (const r of previousRows) previousTotalsByKey.set(r.key, r.total);
  }

  const fmt = (n: number) => (n === 0 ? "—" : n.toFixed(1));

  /** Week-over-week delta inside a cell. Compares value vs the previous week
   *  within the SAME period (not vs the comparison period — that lives in the
   *  row Total column). Returns null when there's no prior week to compare. */
  const wowDeltaInline = (current: number, prev: number | undefined) => {
    if (!showWowDelta) return null;
    if (prev === undefined) return null; // first week, no baseline
    if (prev === 0 && current === 0) return null;
    if (prev === 0) {
      return <span className="ml-1.5 text-[9px] font-mono font-bold text-emerald-300">↑</span>;
    }
    if (current === 0) {
      return <span className="ml-1.5 text-[9px] font-mono font-bold text-rose-300">↓</span>;
    }
    const diff = current - prev;
    const pct = (diff / prev) * 100;
    if (Math.abs(pct) < 0.5) return null;
    const isUp = diff > 0;
    return (
      <span
        className={`ml-1.5 text-[9px] font-mono font-bold ${
          isUp ? "text-emerald-300" : "text-rose-300"
        }`}
      >
        {isUp ? "▲" : "▼"}
        {Math.abs(pct).toFixed(0)}%
      </span>
    );
  };

  /** Utilization cell content for the secondary sub-row. */
  const utilization = (hours: number) => {
    if (!capacityHoursPerWeek || capacityHoursPerWeek <= 0) return null;
    if (hours === 0) return "—";
    const pct = (hours / capacityHoursPerWeek) * 100;
    return `${pct.toFixed(0)}%`;
  };

  /** Color classes for utilization % — over 100% red, 80-100 emerald,
   *  50-80 yellow, <50 muted gray. */
  const utilColor = (hours: number) => {
    if (!capacityHoursPerWeek || hours === 0) return "text-foreground/30";
    const pct = (hours / capacityHoursPerWeek) * 100;
    if (pct > 100) return "text-rose-300";
    if (pct >= 80) return "text-emerald-300";
    if (pct >= 50) return "text-yellow-300/90";
    return "text-foreground/45";
  };

  const renderDelta = (current: number, prev: number | undefined) => {
    // No comparison active at all → don't render badge column.
    if (!previousRows) return null;
    // Both zero → noisy, hide.
    if ((prev ?? 0) === 0 && current === 0) return null;
    // Person/project missing from previous period entirely OR explicitly 0 with current>0 → "NEW".
    if ((prev ?? 0) === 0) {
      return (
        <span className="ml-2 text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300 align-middle">
          NEW
        </span>
      );
    }
    // Existing in both → pct change.
    if (current === 0) {
      return (
        <span className="ml-2 text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-rose-500/15 text-rose-300 align-middle">
          GONE
        </span>
      );
    }
    const diff = current - (prev as number);
    const pct = (diff / (prev as number)) * 100;
    const dir = Math.abs(pct) < 0.5 ? "flat" : diff > 0 ? "up" : "down";
    return (
      <span
        className={`ml-2 text-[9px] font-mono font-bold px-1 py-0.5 rounded align-middle ${
          dir === "up"
            ? "bg-emerald-500/15 text-emerald-300"
            : dir === "down"
              ? "bg-rose-500/15 text-rose-300"
              : "bg-foreground/10 text-foreground/60"
        }`}
      >
        {dir === "up" ? "▲" : dir === "down" ? "▼" : "•"}
        {Math.abs(pct).toFixed(0)}%
      </span>
    );
  };

  return (
    <section className="glass rounded-[2rem] p-6 md:p-8">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="font-display font-semibold text-lg">{title}</h2>
        <span className="text-[10px] font-mono uppercase text-foreground/40 shrink-0">
          {rows.length} × {weeks.length}w
        </span>
      </div>
      <p className="text-xs text-foreground/45 mb-4 md:mb-6">{subtitle}</p>

      {rows.length === 0 ? (
        <p className="text-sm text-foreground/50">No data for this section.</p>
      ) : (
        <>
          {/* MOBILE & TABLET (<lg): card stack */}
          <div className="lg:hidden space-y-3">
            <div className="glass-tile rounded-2xl p-4">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/40">
                  Weekly totals
                </span>
                <span className="font-mono tabular-nums font-extrabold text-foreground text-lg">
                  {grandTotal.toFixed(1)}h
                </span>
              </div>
              <ul className="space-y-1.5">
                {weeks.map((w) => (
                  <li key={w.key} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground/70 truncate">{w.label}</span>
                    <span className="font-mono tabular-nums text-xs text-foreground/85 shrink-0">
                      {(totalsByKey[w.key] ?? 0) === 0 ? "—" : (totalsByKey[w.key] ?? 0).toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {rows.map((r) => {
              // Note: filled needs INDEX in original weeks array to compute WoW prev,
              // so we keep both the filtered list (for bars) AND the indexed walk.
              const filled = weeks
                .map((w, i) => ({ week: w, h: r.byWeek[w.key] ?? 0, idx: i }))
                .filter((e) => e.h > 0);
              const maxH = filled.length ? Math.max(...filled.map((e) => e.h)) : 1;
              const rowTotalUtil = capacityHoursPerWeek
                ? (r.total / (capacityHoursPerWeek * weeks.length)) * 100
                : null;
              return (
                <div key={r.key} className="glass-tile rounded-2xl p-4">
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {r.color !== null && (
                        <span
                          className="size-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: resolveColor(r.color) }}
                        />
                      )}
                      <span className="font-semibold text-foreground/90 truncate">{r.label}</span>
                    </div>
                    <span className="font-mono tabular-nums font-bold text-foreground shrink-0 flex items-baseline gap-2">
                      <span>{r.total.toFixed(1)}h</span>
                      {rowTotalUtil !== null && (
                        <span
                          className={`text-[10px] font-semibold ${
                            rowTotalUtil > 100
                              ? "text-rose-300"
                              : rowTotalUtil >= 80
                                ? "text-emerald-300"
                                : rowTotalUtil >= 50
                                  ? "text-yellow-300/90"
                                  : "text-foreground/45"
                          }`}
                        >
                          {rowTotalUtil.toFixed(0)}%
                        </span>
                      )}
                      {renderDelta(r.total, previousTotalsByKey.get(r.key))}
                    </span>
                  </div>
                  {filled.length === 0 ? (
                    <p className="text-xs text-foreground/40">No hours in this range.</p>
                  ) : (
                    <ul className="space-y-2">
                      {filled.map((e) => {
                        const pct = (e.h / maxH) * 100;
                        const prev = e.idx > 0 ? (r.byWeek[weeks[e.idx - 1].key] ?? 0) : undefined;
                        const utilPct = capacityHoursPerWeek
                          ? (e.h / capacityHoursPerWeek) * 100
                          : null;
                        return (
                          <li key={e.week.key}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs text-foreground/75 truncate">
                                {e.week.label}
                              </span>
                              <span className="font-mono tabular-nums text-xs text-foreground/85 shrink-0 flex items-baseline gap-1.5">
                                <span>{e.h.toFixed(1)}</span>
                                {wowDeltaInline(e.h, prev)}
                                {utilPct !== null && (
                                  <span className={`text-[10px] ${utilColor(e.h)}`}>
                                    {utilPct.toFixed(0)}%
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-foreground/[0.04] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-foreground/40"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* DESKTOP (≥lg): full table */}
          <div className="hidden lg:block -mx-8 overflow-x-auto">
            <div className="px-8 min-w-fit">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="sticky left-0 bg-background/40 backdrop-blur-sm text-left py-3 pr-4 text-[10px] font-mono uppercase tracking-wider text-foreground/40 font-normal z-10">
                      {leftHeader}
                    </th>
                    {weeks.map((w) => (
                      <th
                        key={w.key}
                        className="text-right px-3 py-3 text-[10px] font-mono uppercase tracking-wider text-foreground/40 font-normal whitespace-nowrap"
                        title={`${w.weekStart} → ${w.weekEnd}`}
                      >
                        {w.label}
                      </th>
                    ))}
                    <th className="text-right pl-4 py-3 text-[10px] font-mono uppercase tracking-wider text-foreground/60 font-semibold whitespace-nowrap border-l border-white/10">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const rowTotalUtil = capacityHoursPerWeek
                      ? (r.total / (capacityHoursPerWeek * weeks.length)) * 100
                      : null;
                    return (
                      <Fragment key={r.key}>
                        <tr
                          className={`hover:bg-white/[0.03] transition-colors ${
                            idx % 2 === 1 ? "bg-white/[0.015]" : ""
                          } ${capacityHoursPerWeek ? "" : "border-b border-white/5"}`}
                        >
                          <td className="sticky left-0 bg-background/40 backdrop-blur-sm py-3 pr-4 text-foreground/85 font-medium truncate max-w-[200px] z-10">
                            <span className="inline-flex items-center gap-2 min-w-0">
                              {r.color !== null && (
                                <span
                                  className="size-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: resolveColor(r.color) }}
                                />
                              )}
                              <span className="truncate">{r.label}</span>
                            </span>
                          </td>
                          {weeks.map((w, wi) => {
                            const h = r.byWeek[w.key] ?? 0;
                            const prev = wi > 0 ? (r.byWeek[weeks[wi - 1].key] ?? 0) : undefined;
                            return (
                              <td
                                key={w.key}
                                className={`text-right px-3 py-3 font-mono tabular-nums whitespace-nowrap ${
                                  h === 0 ? "text-foreground/25" : "text-foreground/85"
                                }`}
                              >
                                {fmt(h)}
                                {wowDeltaInline(h, prev)}
                              </td>
                            );
                          })}
                          <td className="text-right pl-4 py-3 font-mono tabular-nums font-bold text-foreground whitespace-nowrap border-l border-white/10">
                            {r.total.toFixed(1)}
                            {renderDelta(r.total, previousTotalsByKey.get(r.key))}
                          </td>
                        </tr>
                        {/* Capacity utilization sub-row */}
                        {capacityHoursPerWeek ? (
                          <tr
                            className={`border-b border-white/5 ${
                              idx % 2 === 1 ? "bg-white/[0.015]" : ""
                            }`}
                          >
                            <td className="sticky left-0 bg-background/40 backdrop-blur-sm py-1 pr-4 text-[9px] font-mono uppercase tracking-wider text-foreground/30 z-10">
                              utilization
                            </td>
                            {weeks.map((w) => {
                              const h = r.byWeek[w.key] ?? 0;
                              return (
                                <td
                                  key={w.key}
                                  className={`text-right px-3 py-1 font-mono tabular-nums text-[10px] whitespace-nowrap ${utilColor(h)}`}
                                >
                                  {utilization(h)}
                                </td>
                              );
                            })}
                            <td
                              className={`text-right pl-4 py-1 font-mono tabular-nums text-[10px] font-semibold whitespace-nowrap border-l border-white/10 ${
                                rowTotalUtil === null
                                  ? "text-foreground/30"
                                  : rowTotalUtil > 100
                                    ? "text-rose-300"
                                    : rowTotalUtil >= 80
                                      ? "text-emerald-300"
                                      : rowTotalUtil >= 50
                                        ? "text-yellow-300/90"
                                        : "text-foreground/45"
                              }`}
                            >
                              {rowTotalUtil === null ? "—" : `${rowTotalUtil.toFixed(0)}%`}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-white/15 bg-white/[0.04]">
                    <td className="sticky left-0 bg-background/60 backdrop-blur-sm py-3 pr-4 text-[10px] font-mono uppercase tracking-wider text-foreground/60 font-semibold z-10">
                      Total
                    </td>
                    {weeks.map((w) => {
                      const t = totalsByKey[w.key] ?? 0;
                      return (
                        <td
                          key={w.key}
                          className="text-right px-3 py-3 font-mono tabular-nums font-bold text-foreground/90 whitespace-nowrap"
                        >
                          {t === 0 ? "—" : t.toFixed(1)}
                        </td>
                      );
                    })}
                    <td className="text-right pl-4 py-3 font-mono tabular-nums font-extrabold text-foreground whitespace-nowrap border-l border-white/10">
                      {grandTotal.toFixed(1)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
