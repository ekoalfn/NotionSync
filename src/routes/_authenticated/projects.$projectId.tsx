import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { getWeeklyAggregate, updateProjectTarget } from "@/lib/notion.functions";
import { Pager, usePager } from "@/components/Pager";
import { downloadWeeklyReport } from "@/components/WeeklyReportPDF";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectDetailPage,
  notFoundComponent: () => (
    <div className="glass rounded-[2rem] p-12 text-center">
      <p className="text-foreground/60 mb-4">Project not found.</p>
      <Link to="/projects" className="text-sm underline text-foreground/80">
        ← Back to projects
      </Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="glass rounded-[2rem] p-12 text-center text-foreground/70">{error.message}</div>
  ),
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

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function statusTone(status: string, blocked: boolean) {
  const s = status.toLowerCase();
  if (blocked || s.includes("blocked")) return "bg-foreground/15 text-foreground/80";
  if (s.includes("done") || s.includes("complete")) return "bg-foreground/70 text-background";
  if (s.includes("progress") || s.includes("doing") || s.includes("review"))
    return "bg-foreground/40 text-background";
  return "bg-foreground/10 text-foreground/70";
}

function ProjectDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProjectDetailContent />
    </Suspense>
  );
}

function ProjectDetailContent() {
  const { projectId } = Route.useParams();
  const fetchAgg = useServerFn(getWeeklyAggregate);
  const saveTargetFn = useServerFn(updateProjectTarget);
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const { data: agg } = useSuspenseQuery({
    queryKey: ["weekly", weekStart ?? "current"],
    queryFn: () => fetchAgg({ data: { weekStart } }),
  });

  const project = agg.projects.find((p) => p.projectId === projectId);
  // If no data this week, fabricate empty so user can still navigate weeks.
  if (!project && weekStart === undefined) throw notFound();
  if (!project) {
    return (
      <>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/projects"
            className="text-xs font-mono uppercase tracking-[0.2em] text-foreground/50 hover:text-foreground transition-colors"
          >
            ← All projects
          </Link>
          <div className="glass rounded-full p-1.5 flex items-center gap-1">
            <button
              onClick={() => setWeekStart(shiftWeek(agg.weekStart, -1))}
              className="px-3 py-1.5 text-sm text-foreground/50 hover:text-foreground rounded-full"
            >
              ←
            </button>
            <span className="px-3 text-sm font-mono text-foreground/70">
              {formatRange(agg.weekStart, agg.weekEnd)}
            </span>
            <button
              onClick={() => setWeekStart(undefined)}
              className="px-4 py-1.5 text-[10px] font-bold uppercase bg-white text-black rounded-full"
            >
              Today
            </button>
            <button
              onClick={() => setWeekStart(shiftWeek(agg.weekStart, 1))}
              className="px-3 py-1.5 text-sm text-foreground/50 hover:text-foreground rounded-full"
            >
              →
            </button>
          </div>
        </div>
        <div className="glass rounded-[2rem] p-12 text-center text-foreground/60">
          Project tidak punya data di minggu ini.
        </div>
      </>
    );
  }

  const target = project.targetHoursPerWeek;
  const targetPct =
    target && target > 0 ? Math.min(999, (project.totalHours / target) * 100) : null;
  const remaining = target != null ? target - project.totalHours : null;
  let trackStatus: { label: string; tone: string } = {
    label: "No target set",
    tone: "bg-foreground/10 text-foreground/60",
  };
  if (target != null && target > 0) {
    if (project.totalHours >= target)
      trackStatus = { label: "Target met", tone: "bg-foreground/70 text-background" };
    else if (targetPct! >= 75)
      trackStatus = { label: "On track", tone: "bg-foreground/40 text-background" };
    else if (targetPct! >= 40)
      trackStatus = { label: "Behind", tone: "bg-foreground/25 text-foreground" };
    else trackStatus = { label: "Far behind", tone: "bg-foreground/15 text-foreground/80" };
  }

  // Per-person aggregation within this project
  const peopleMap = new Map<string, { name: string; hours: number; tasks: number }>();
  for (const t of project.tasks) {
    const list = t.assignees.length ? t.assignees : ["Unassigned"];
    const share = t.duration / list.length;
    for (const a of list) {
      const cur = peopleMap.get(a) ?? { name: a, hours: 0, tasks: 0 };
      cur.hours += share;
      cur.tasks += 1;
      peopleMap.set(a, cur);
    }
  }
  const people = Array.from(peopleMap.values())
    .map((p) => ({ ...p, hours: Number(p.hours.toFixed(2)) }))
    .sort((a, b) => b.hours - a.hours);
  const maxPersonHours = Math.max(1, ...people.map((p) => p.hours));

  const tasksSorted = [...project.tasks].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const totalTasks = project.tasks.length;
  const avgDuration = totalTasks
    ? project.tasks.reduce((s, t) => s + t.duration, 0) / totalTasks
    : 0;
  const longestTask = project.tasks.reduce<(typeof project.tasks)[number] | null>(
    (acc, t) => (!acc || t.duration > acc.duration ? t : acc),
    null,
  );
  const topContributor = people[0] ?? null;

  // Target editor modal
  const [targetInput, setTargetInput] = useState<string>(target?.toString() ?? "");
  const [dailyInput, setDailyInput] = useState<string>(project.targetHoursPerDay?.toString() ?? "");
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");
  const tasksPager = usePager(tasksSorted, 10, project.projectId);
  const workdays = agg.workdaysPerWeek || 5;
  const autoDaily = target != null ? target / workdays : null;
  const saveTarget = useMutation({
    mutationFn: (vals: { week: number | null; day: number | null }) =>
      saveTargetFn({
        data: {
          id: project.projectId,
          target_hours_per_week: vals.week,
          target_hours_per_day: vals.day,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setTargetModalOpen(false);
    },
  });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/projects"
          className="text-xs font-mono uppercase tracking-[0.2em] text-foreground/50 hover:text-foreground transition-colors"
        >
          ← All projects
        </Link>
        <div className="flex items-center gap-2">
          <div className="glass rounded-full p-1.5 flex items-center gap-1">
            <button
              onClick={() => setWeekStart(shiftWeek(agg.weekStart, -1))}
              className="px-3 py-1.5 text-sm text-foreground/50 hover:text-foreground rounded-full transition-colors"
            >
              ←
            </button>
            <span className="px-3 text-sm font-mono text-foreground/70">
              {formatRange(agg.weekStart, agg.weekEnd)}
            </span>
            <button
              onClick={() => setWeekStart(undefined)}
              className="px-4 py-1.5 text-[10px] font-bold tracking-wider uppercase bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-transform"
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
          <button
            onClick={() =>
              downloadWeeklyReport(
                { kind: "project", agg, projectId: project.projectId },
                `nowtrack-${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${agg.weekStart}.pdf`,
              )
            }
            className="px-4 py-2 text-xs font-bold tracking-wider uppercase glass rounded-full hover:bg-foreground/10 transition-colors"
          >
            ⬇ Export PDF
          </button>
        </div>
      </div>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="size-3 rounded-full bg-foreground/60" />
            <h1 className="text-3xl font-display font-extrabold tracking-tight">{project.name}</h1>
          </div>
          <p className="text-foreground/50 text-sm font-mono">
            {agg.weekStart} → {agg.weekEnd}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40">
            Total hours
          </p>
          <p className="font-display font-extrabold text-4xl tabular-nums">
            {project.totalHours.toFixed(1)}
            <span className="text-foreground/50 text-2xl">h</span>
          </p>
          {project.manHours > project.totalHours + 0.05 && (
            <p className="text-[10px] font-mono text-foreground/50 mt-1">
              {project.manHours.toFixed(1)}h man-hours
            </p>
          )}
        </div>
      </header>

      {/* Target vs actual summary */}
      <section className="glass rounded-[2rem] p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-lg">Weekly target</h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${trackStatus.tone}`}
              >
                {trackStatus.label}
              </span>
            </div>
            <p className="text-xs text-foreground/50 mt-1">
              {target != null
                ? `Goal: ${target}h per week`
                : "Set a weekly hours goal to track progress."}
            </p>
          </div>
          <Dialog open={targetModalOpen} onOpenChange={setTargetModalOpen}>
            <DialogTrigger asChild>
              <button className="text-xs font-mono uppercase tracking-[0.18em] px-3 py-2 rounded-xl bg-foreground/[0.05] hover:bg-foreground/[0.1] transition-colors">
                {target != null ? "Edit target" : "+ Set target"}
              </button>
            </DialogTrigger>
            <DialogContent className="border-foreground/10 bg-background/80 backdrop-blur-xl max-w-sm rounded-[1.5rem] p-0 overflow-hidden">
              <DialogHeader className="text-left px-6 pt-6 pb-2">
                <DialogTitle className="font-display font-bold text-xl">Weekly target</DialogTitle>
                <DialogDescription className="text-sm text-foreground/50">
                  {target != null
                    ? `Current goal: ${target}h per week`
                    : "Set a weekly hours goal to track progress."}
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const rawW = targetInput.trim();
                  let week: number | null = null;
                  if (rawW !== "") {
                    const n = Number(rawW);
                    if (!Number.isFinite(n) || n < 0 || n > 1000) return;
                    week = n;
                  }
                  const rawD = dailyInput.trim();
                  let day: number | null = null;
                  if (rawD !== "") {
                    const n = Number(rawD);
                    if (!Number.isFinite(n) || n < 0 || n > 24) return;
                    day = n;
                  }
                  saveTarget.mutate({ week, day });
                }}
                className="px-6 py-4 space-y-4"
              >
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40 mb-2 block">
                    Target hours / week
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="1000"
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      placeholder="e.g. 40"
                      className="flex-1 px-4 py-3 bg-foreground/[0.05] border border-foreground/10 rounded-xl text-sm font-mono backdrop-blur focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      autoFocus
                    />
                    <span className="text-sm text-foreground/50 font-mono">h/week</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40 mb-2 block">
                    Target / hari
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="24"
                      value={dailyInput}
                      onChange={(e) => setDailyInput(e.target.value)}
                      placeholder={autoDaily != null ? `auto: ${autoDaily.toFixed(1)}` : "otomatis"}
                      className="flex-1 px-4 py-3 bg-foreground/[0.05] border border-foreground/10 rounded-xl text-sm font-mono backdrop-blur focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    />
                    <span className="text-sm text-foreground/50 font-mono">h/hari</span>
                  </div>
                  <p className="text-[10px] text-foreground/40 mt-1.5">
                    Kosongkan untuk hitung otomatis dari target mingguan ÷ {workdays} hari kerja.
                  </p>
                </div>
                <DialogFooter className="px-0 pb-2 flex-row gap-3">
                  <DialogClose asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetInput(target?.toString() ?? "");
                        setDailyInput(project.targetHoursPerDay?.toString() ?? "");
                      }}
                      className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-foreground/[0.05] hover:bg-foreground/[0.1] transition-colors"
                    >
                      Cancel
                    </button>
                  </DialogClose>
                  <button
                    type="submit"
                    disabled={saveTarget.isPending}
                    className="flex-1 px-4 py-3 bg-foreground text-background rounded-xl text-sm font-bold disabled:opacity-50 transition-opacity"
                  >
                    {saveTarget.isPending ? "Saving…" : "Save target"}
                  </button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {target != null && target > 0 ? (
          <>
            <div className="flex items-baseline justify-between mb-2 text-sm">
              <span className="font-mono tabular-nums">
                <span className="font-display font-extrabold text-2xl">
                  {project.totalHours.toFixed(1)}
                </span>
                <span className="text-foreground/50"> / {target}h</span>
              </span>
              <span className="font-mono tabular-nums text-foreground/70">
                {targetPct!.toFixed(0)}%
                {remaining! > 0 && (
                  <span className="text-foreground/50"> · {remaining!.toFixed(1)}h to go</span>
                )}
                {remaining! < 0 && (
                  <span className="text-foreground/50">
                    {" "}
                    · +{Math.abs(remaining!).toFixed(1)}h over
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-foreground/[0.05] overflow-hidden ring-1 ring-inset ring-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-foreground/40 to-foreground/80 transition-[width]"
                style={{ width: `${Math.min(100, targetPct!)}%` }}
              />
              {targetPct! > 100 && (
                <div
                  className="absolute top-0 right-0 h-full bg-foreground/30"
                  style={{ width: `${Math.min(40, targetPct! - 100)}%` }}
                />
              )}
            </div>
            {topContributor && (
              <p className="text-xs text-foreground/60 mt-3">
                Top contributor:{" "}
                <Link
                  to="/team/$name"
                  params={{ name: topContributor.name }}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {topContributor.name}
                </Link>{" "}
                · {topContributor.hours.toFixed(1)}h (
                {((topContributor.hours / Math.max(project.totalHours, 0.0001)) * 100).toFixed(0)}%
                of project)
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-foreground/50">
            {project.totalHours.toFixed(1)}h logged this week. Set a target to see progress and
            pacing.
          </p>
        )}
      </section>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPI label="Tasks" value={totalTasks} />
        <KPI label="Done" value={project.tasksDone} />
        <KPI label="In Progress" value={project.tasksInProgress} />
        <KPI label="Blocked" value={project.tasksBlocked} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="glass rounded-[2rem] p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display font-bold text-lg">Hours by person</h2>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40">
              {people.length} contributor{people.length === 1 ? "" : "s"}
            </span>
          </div>
          {people.length === 0 ? (
            <p className="text-sm text-foreground/50">No contributors this week.</p>
          ) : (
            <div className="space-y-3">
              {people.map((p) => {
                const pct = (p.hours / maxPersonHours) * 100;
                return (
                  <Link
                    key={p.name}
                    to="/team/$name"
                    params={{ name: p.name }}
                    className="block group"
                  >
                    <div className="flex items-baseline justify-between text-sm mb-1.5">
                      <span className="font-medium truncate group-hover:translate-x-0.5 transition-transform">
                        {p.name}
                      </span>
                      <span className="font-mono tabular-nums text-foreground/70">
                        {p.hours.toFixed(1)}h · {p.tasks} task{p.tasks === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-foreground/[0.05] overflow-hidden ring-1 ring-inset ring-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-foreground/40 to-foreground/80"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass rounded-[2rem] p-6 space-y-4">
          <h2 className="font-display font-bold text-lg">Highlights</h2>
          <Stat label="Avg duration / task" value={`${avgDuration.toFixed(1)}h`} />
          <Stat
            label="Longest task"
            value={longestTask ? `${longestTask.duration.toFixed(1)}h` : "—"}
            sub={longestTask?.title}
          />
          <Stat
            label="Completion rate"
            value={totalTasks ? `${Math.round((project.tasksDone / totalTasks) * 100)}%` : "—"}
          />
        </div>
      </div>

      {/* Tasks table */}
      <section className="glass rounded-[2rem] p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display font-bold text-lg">Tasks this week</h2>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40">
              {tasksSorted.length} total
            </span>
            <ViewToggle />
          </div>
        </div>
        {tasksSorted.length === 0 ? (
          <p className="text-sm text-foreground/50">No tasks recorded this week.</p>
        ) : view === "list" ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/40 border-b border-foreground/10">
                    <th className="py-2 pr-4 font-normal">Task</th>
                    <th className="py-2 pr-4 font-normal">Assignees</th>
                    <th className="py-2 pr-4 font-normal">Status</th>
                    <th className="py-2 pr-4 font-normal">Date</th>
                    <th className="py-2 pl-4 font-normal text-right">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {tasksPager.pageItems.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-foreground/[0.06] last:border-0 hover:bg-foreground/[0.02] transition-colors"
                    >
                      <td className="py-3 pr-4 max-w-[28ch]">
                        <p className="font-medium truncate">{t.title}</p>
                      </td>
                      <td className="py-3 pr-4 text-foreground/70 max-w-[20ch] truncate">
                        {t.assignees.length ? t.assignees.join(", ") : "Unassigned"}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${statusTone(t.status, t.blocked)}`}
                        >
                          {t.blocked ? "blocked" : t.status || "—"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-foreground/60 font-mono text-xs">
                        {fmtDate(t.date)}
                      </td>
                      <td className="py-3 pl-4 text-right font-mono tabular-nums">
                        {t.duration.toFixed(1)}h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={tasksPager.page}
              totalPages={tasksPager.totalPages}
              onChange={tasksPager.setPage}
              total={tasksPager.total}
              pageSize={tasksPager.pageSize}
            />
          </>
        ) : (
          <TaskCalendar tasks={tasksSorted} anchorDate={agg.weekStart} />
        )}
      </section>
    </>
  );

  function ViewToggle() {
    return (
      <div className="inline-flex p-0.5 rounded-xl bg-foreground/[0.05] ring-1 ring-inset ring-white/5">
        {(["list", "calendar"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-[0.18em] transition-colors ${
              view === v
                ? "bg-foreground text-background"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    );
  }
}

function KPI({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40">{label}</p>
      <p className="font-display font-extrabold text-2xl tabular-nums mt-1">{value}</p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40">{label}</p>
      <p className="font-display font-bold text-xl tabular-nums">{value}</p>
      {sub && <p className="text-xs text-foreground/50 truncate mt-0.5">{sub}</p>}
    </div>
  );
}

type CalendarTask = {
  id: string;
  title: string;
  status: string;
  blocked: boolean;
  date: string | null;
  duration: number;
  assignees: string[];
  estimated: number;
  startTime: string | null;
  endTime: string | null;
  priority: string;
  module: string;
};

function TaskCalendar({ tasks, anchorDate }: { tasks: CalendarTask[]; anchorDate: string }) {
  const initial = anchorDate ? new Date(anchorDate) : new Date();
  const [cursor, setCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupDate, setPopupDate] = useState<Date | null>(null);
  const [popupTasks, setPopupTasks] = useState<CalendarTask[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<CalendarTask | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byDay = new Map<string, CalendarTask[]>();
  for (const t of tasks) {
    if (!t.date) continue;
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = byDay.get(key) ?? [];
    list.push(t);
    byDay.set(key, list);
  }

  const cells: Array<{ day: number | null; date: Date | null }> = [];
  for (let i = 0; i < startDay; i++) cells.push({ day: null, date: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: new Date(year, month, d) });
  while (cells.length % 7 !== 0) cells.push({ day: null, date: null });

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const openPopup = (date: Date, dayTasks: CalendarTask[]) => {
    setPopupDate(date);
    setPopupTasks(dayTasks);
    setPopupOpen(true);
  };

  const openDetail = (task: CalendarTask) => {
    setDetailTask(task);
    setDetailOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="px-3 py-1.5 rounded-lg text-xs font-mono bg-foreground/[0.05] hover:bg-foreground/[0.1] transition-colors"
        >
          ←
        </button>
        <p className="font-display font-bold text-base">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="px-3 py-1.5 rounded-lg text-xs font-mono bg-foreground/[0.05] hover:bg-foreground/[0.1] transition-colors"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/40 py-1"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c.date) return <div key={i} className="aspect-square rounded-xl bg-transparent" />;
          const key = `${c.date.getFullYear()}-${c.date.getMonth()}-${c.date.getDate()}`;
          const dayTasks = byDay.get(key) ?? [];
          const isToday = c.date.getTime() === today.getTime();
          const totalH = dayTasks.reduce((s, t) => s + t.duration, 0);
          return (
            <button
              key={i}
              type="button"
              onClick={() => dayTasks.length > 0 && openPopup(c.date!, dayTasks)}
              className={`min-h-[88px] rounded-xl p-1.5 ring-1 ring-inset ring-white/5 text-left transition-colors ${
                isToday ? "bg-foreground/[0.08]" : "bg-foreground/[0.025]"
              } ${dayTasks.length > 0 ? "hover:bg-foreground/[0.06] cursor-pointer" : "cursor-default"}`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <span
                  className={`text-xs font-mono tabular-nums ${
                    isToday ? "font-bold text-foreground" : "text-foreground/60"
                  }`}
                >
                  {c.day}
                </span>
                {totalH > 0 && (
                  <span className="text-[9px] font-mono tabular-nums text-foreground/50">
                    {totalH.toFixed(1)}h
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map((t) => (
                  <div
                    key={t.id}
                    title={`${t.title} · ${t.duration.toFixed(1)}h`}
                    className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 ${
                      t.blocked
                        ? "bg-foreground/15 text-foreground/80"
                        : /done|complete/i.test(t.status)
                          ? "bg-foreground/70 text-background"
                          : /progress|doing|review/i.test(t.status)
                            ? "bg-foreground/40 text-background"
                            : "bg-foreground/10 text-foreground/80"
                    }`}
                  >
                    {t.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-[9px] font-mono text-foreground/50 px-1">
                    +{dayTasks.length - 3} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day popup */}
      <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
        <DialogContent className="border-foreground/10 bg-background/80 backdrop-blur-xl max-w-lg rounded-[1.5rem] p-0 overflow-hidden">
          <DialogHeader className="text-left px-6 pt-6 pb-2">
            <DialogTitle className="font-display font-bold text-xl">
              {popupDate
                ? popupDate.toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : ""}
            </DialogTitle>
            <DialogDescription className="text-sm text-foreground/50">
              {popupTasks.length} task{popupTasks.length === 1 ? "" : "s"} ·{" "}
              {popupTasks.reduce((s, t) => s + t.duration, 0).toFixed(1)}h
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4 space-y-2 max-h-[60vh] overflow-y-auto">
            {popupTasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setPopupOpen(false);
                  openDetail(t);
                }}
                className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-xl bg-foreground/[0.03] ring-1 ring-inset ring-white/5 hover:bg-foreground/[0.06] transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-[10px] font-mono text-foreground/50 mt-0.5">
                    {t.duration.toFixed(1)}h · {t.status || "—"}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${statusTone(t.status, t.blocked)}`}
                >
                  {t.blocked ? "blocked" : t.status || "—"}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Task detail modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="border-foreground/10 bg-background/80 backdrop-blur-xl max-w-lg rounded-[1.5rem] p-0 overflow-hidden">
          {detailTask && (
            <>
              <DialogHeader className="text-left px-6 pt-6 pb-2">
                <DialogTitle className="font-display font-bold text-xl leading-snug">
                  {detailTask.title}
                </DialogTitle>
                <DialogDescription className="text-sm text-foreground/50">
                  {detailTask.module && (
                    <span className="inline-block mr-2">{detailTask.module}</span>
                  )}
                  {detailTask.date && <span>{fmtDate(detailTask.date)}</span>}
                </DialogDescription>
              </DialogHeader>
              <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider ${statusTone(detailTask.status, detailTask.blocked)}`}
                  >
                    {detailTask.blocked ? "blocked" : detailTask.status || "—"}
                  </span>
                  {detailTask.priority && (
                    <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-foreground/10 text-foreground/70">
                      {detailTask.priority}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-foreground/[0.03] ring-1 ring-inset ring-white/5">
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40">
                      Duration
                    </p>
                    <p className="font-display font-bold text-lg tabular-nums">
                      {detailTask.duration.toFixed(1)}h
                    </p>
                  </div>
                  {detailTask.estimated > 0 && (
                    <div className="p-3 rounded-xl bg-foreground/[0.03] ring-1 ring-inset ring-white/5">
                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40">
                        Estimated
                      </p>
                      <p className="font-display font-bold text-lg tabular-nums">
                        {detailTask.estimated.toFixed(1)}h
                      </p>
                    </div>
                  )}
                </div>

                {detailTask.assignees.length > 0 && (
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40 mb-1.5">
                      Assignees
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {detailTask.assignees.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-foreground/[0.05] ring-1 ring-inset ring-white/5"
                        >
                          <span className="size-1.5 rounded-full bg-foreground/40" />
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(detailTask.startTime || detailTask.endTime) && (
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40 mb-1.5">
                      Time
                    </p>
                    <p className="text-sm font-mono text-foreground/70">
                      {detailTask.startTime
                        ? new Date(detailTask.startTime).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                      {" → "}
                      {detailTask.endTime
                        ? new Date(detailTask.endTime).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                  </div>
                )}

                <a
                  href={`https://www.notion.so/${detailTask.id.replace(/-/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center px-4 py-3 rounded-xl bg-foreground text-background text-sm font-bold hover:bg-foreground/90 transition-colors"
                >
                  Open in Notion ↗
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
