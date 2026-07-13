import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageSkeleton } from "@/components/PageSkeleton";
import { getWeeklyAggregate } from "@/lib/notion.functions";
import { getDailyNotes, setDailyNote } from "@/lib/notes.functions";
import { downloadWeeklyReport } from "@/components/WeeklyReportPDF";
import { downloadDailyReport } from "@/components/DailyRecapPDF";
import { DailyRecap } from "@/components/DailyRecap";
import { fmtJam } from "@/lib/utils";
import { MonthlyContent } from "./monthly";

type Tab = "daily" | "weekly" | "monthly";
const TABS: { id: Tab; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

export const Route = createFileRoute("/_authenticated/report")({
  validateSearch: (search: Record<string, unknown>): { tab: Tab } => {
    const t = search.tab;
    return { tab: t === "daily" || t === "monthly" ? t : "weekly" };
  },
  head: () => ({
    meta: [
      { title: "Report — NowTrack" },
      { name: "description", content: "Recap Daily, Weekly, dan Monthly tim dari Notion." },
    ],
  }),
  component: ReportPage,
});

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

function ReportPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <>
      <header className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-display font-extrabold tracking-tight">Report</h1>
        <p className="text-foreground/50 text-xs md:text-sm mt-1">
          Recap Daily, Weekly, dan Monthly — semua dalam satu tempat.
        </p>
      </header>

      {/* Tab bar */}
      <div className="glass rounded-full p-1.5 inline-flex items-center gap-1 mb-6 md:mb-8">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate({ to: "/report", search: { tab: t.id } })}
            className={
              tab === t.id
                ? "px-4 md:px-5 py-2 rounded-full text-sm font-bold bg-white text-black shadow-[0_4px_20px_oklch(1_0_0_/_0.2)]"
                : "px-4 md:px-5 py-2 rounded-full text-sm font-medium text-foreground/55 hover:text-foreground transition-colors"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "monthly" ? (
        <Suspense fallback={<PageSkeleton />}>
          <MonthlyContent />
        </Suspense>
      ) : (
        <Suspense fallback={<PageSkeleton />}>
          <WeeklyBasedTab tab={tab} />
        </Suspense>
      )}
    </>
  );
}

// Daily + Weekly both key off the weekly aggregate for a chosen week, so they
// share the week navigator and data fetch.
function WeeklyBasedTab({ tab }: { tab: Exclude<Tab, "monthly"> }) {
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const fetchAgg = useServerFn(getWeeklyAggregate);
  const { data: agg } = useSuspenseQuery({
    queryKey: ["weekly", weekStart ?? "current"],
    queryFn: () => fetchAgg({ data: { weekStart } }),
    refetchInterval: 60000,
  });

  const qc = useQueryClient();
  const fetchNotes = useServerFn(getDailyNotes);
  const saveNoteFn = useServerFn(setDailyNote);
  const notesQuery = useQuery({
    queryKey: ["daily-notes", agg.weekStart],
    queryFn: () => fetchNotes({ data: { weekStart: agg.weekStart } }),
    enabled: tab === "daily",
  });
  const notes = notesQuery.data ?? {};
  const saveNote = useMutation({
    mutationFn: (v: { date: string; projectId: string; note: string }) => saveNoteFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-notes", agg.weekStart] }),
  });

  return (
    <>
      {/* Week navigator (+ PDF export on Weekly) */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="glass rounded-full p-1.5 flex items-center gap-0.5 md:gap-1">
          <button
            onClick={() => setWeekStart(shiftWeek(agg.weekStart, -1))}
            className="px-2.5 md:px-3 py-1.5 text-sm text-foreground/50 hover:text-foreground rounded-full transition-colors"
            aria-label="Previous week"
          >
            ←
          </button>
          <span className="px-2 md:px-3 text-[11px] md:text-sm font-mono text-foreground/70 whitespace-nowrap">
            {formatRange(agg.weekStart, agg.weekEnd)}
          </span>
          <button
            onClick={() => setWeekStart(undefined)}
            className="px-3 md:px-5 py-1.5 text-[10px] md:text-xs font-bold tracking-wider uppercase bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-transform"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(shiftWeek(agg.weekStart, 1))}
            className="px-2.5 md:px-3 py-1.5 text-sm text-foreground/50 hover:text-foreground rounded-full transition-colors"
            aria-label="Next week"
          >
            →
          </button>
        </div>
        <button
          onClick={() =>
            tab === "daily"
              ? downloadDailyReport(agg, notes, `nowtrack-daily-${agg.weekStart}.pdf`)
              : downloadWeeklyReport(
                  { kind: "all", agg, ai: null },
                  `nowtrack-weekly-${agg.weekStart}.pdf`,
                )
          }
          className="px-3 md:px-4 py-2 text-[11px] md:text-xs font-bold tracking-wider uppercase glass rounded-full hover:bg-foreground/10 transition-colors"
          title={`Export ${tab} report as PDF`}
        >
          ⬇ Export PDF
        </button>
      </div>

      {tab === "daily" ? (
        <DailyRecap
          agg={agg}
          notes={notes}
          onSaveNote={(date, projectId, note) => saveNote.mutate({ date, projectId, note })}
        />
      ) : (
        <WeeklyReport agg={agg} />
      )}
    </>
  );
}

function WeeklyReport({ agg }: { agg: Awaited<ReturnType<typeof getWeeklyAggregate>> }) {
  const workdays = agg.workdaysPerWeek || 5;

  if (agg.projects.length === 0) {
    return (
      <section className="glass rounded-[2rem] p-12 text-center">
        <p className="text-foreground/60">
          Belum ada project. Hubungkan database Notion di Settings.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
        <Kpi label="Total Hours" value={fmtJam(agg.totalHours)} />
        <Kpi label="Man-hours" value={fmtJam(agg.manHours)} />
        <Kpi label="Done" value={String(agg.tasksDone)} />
        <Kpi label="Blocked" value={String(agg.tasksBlocked)} />
      </div>

      {/* Project recap: weekly target vs actual */}
      <section className="glass rounded-[2rem] p-6 md:p-8">
        <h3 className="font-display font-semibold text-lg mb-4">Project Recap — Weekly</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/40 text-left">
                <th className="py-2 pr-4 font-normal">Project</th>
                <th className="py-2 pr-4 font-normal">Target</th>
                <th className="py-2 pr-4 font-normal">Actual</th>
                <th className="py-2 pr-4 font-normal">Man-hours</th>
                <th className="py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {agg.projects.map((p) => {
                const target = p.targetHoursPerWeek;
                const met = target != null && target > 0 && p.totalHours >= target;
                return (
                  <tr key={p.projectId} className="border-t border-foreground/[0.06]">
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: resolveColor(p.color) }}
                        />
                        {p.name}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-foreground/70 whitespace-nowrap">
                      {target != null && target > 0 ? fmtJam(target) : "—"}
                    </td>
                    <td
                      className={`py-3 pr-4 font-mono whitespace-nowrap ${met ? "text-emerald-300" : "text-foreground/85"}`}
                    >
                      {fmtJam(p.totalHours)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-foreground/60 whitespace-nowrap">
                      {fmtJam(p.manHours)}
                    </td>
                    <td className="py-3 text-xs text-foreground/55 whitespace-nowrap">
                      {p.tasksDone} done · {p.tasksInProgress} wip · {p.tasksBlocked} blocked
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-foreground/40 mt-3">
          Target mingguan per project. Butuh breakdown harian? Buka tab Daily (target ÷ {workdays}{" "}
          hari kerja).
        </p>
      </section>

      {/* Per-person hours */}
      {agg.perPerson.length > 0 && (
        <section className="glass rounded-[2rem] p-6 md:p-8">
          <h3 className="font-display font-semibold text-lg mb-4">Per Person</h3>
          <div className="space-y-2">
            {agg.perPerson.map((person) => (
              <div
                key={person.name}
                className="flex items-center justify-between p-3 rounded-2xl glass-tile"
              >
                <span className="font-medium">{person.name}</span>
                <span className="font-mono text-sm text-foreground/80">
                  {fmtJam(person.totalHours)}
                  <span className="text-foreground/40"> · {person.tasksTotal} tasks</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl md:rounded-[2rem] p-4 md:p-6">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/50 mb-2">
        {label}
      </div>
      <div className="text-xl md:text-3xl font-display font-extrabold tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}
