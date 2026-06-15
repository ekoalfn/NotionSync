import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageSkeleton } from "@/components/PageSkeleton";
import { getWeeklyAggregate } from "@/lib/notion.functions";
import { ArrowLeft, CheckCircle2, Clock, AlertTriangle, Folder } from "lucide-react";
import { Pager, usePager } from "@/components/Pager";
import { downloadWeeklyReport } from "@/components/WeeklyReportPDF";

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

export const Route = createFileRoute("/_authenticated/team/$name")({
  head: ({ params }) => ({
    meta: [{ title: `${decodeURIComponent(params.name)} — Team` }],
  }),
  component: PersonDetailPage,
  errorComponent: ({ error }) => (
    <div className="glass rounded-[2rem] p-8 text-sm text-foreground/70">
      Gagal memuat data: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="glass rounded-[2rem] p-8 text-sm text-foreground/70">
      Member tidak ditemukan minggu ini.
    </div>
  ),
});

function initials(name: string) {
  return name.split(/\s+/).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function statusTone(status: string, blocked: boolean) {
  const s = status.toLowerCase();
  if (blocked || s.includes("blocked")) return "bg-white/10 text-foreground/80 ring-1 ring-white/15";
  if (s.includes("done") || s.includes("complete")) return "bg-foreground/15 text-foreground";
  if (s.includes("progress") || s.includes("doing") || s.includes("review"))
    return "bg-white/8 text-foreground/80";
  return "bg-white/5 text-foreground/60";
}

function PersonDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PersonDetailContent />
    </Suspense>
  );
}

function PersonDetailContent() {
  const { name } = Route.useParams();
  const personName = decodeURIComponent(name);
  const fetchAgg = useServerFn(getWeeklyAggregate);
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const { data: agg } = useSuspenseQuery({
    queryKey: ["weekly", weekStart ?? "current"],
    queryFn: () => fetchAgg({ data: { weekStart } }),
  });

  const person = agg.perPerson.find((p) => p.name === personName);
  if (!person && weekStart === undefined) throw notFound();
  if (!person) {
    return (
      <>
        <div className="flex items-center justify-between mb-6">
          <Link to="/team" className="inline-flex items-center gap-2 text-xs text-foreground/50 hover:text-foreground transition-colors">
            <ArrowLeft className="size-3.5" /> Back to Team
          </Link>
          <div className="glass rounded-full p-1.5 flex items-center gap-1">
            <button onClick={() => setWeekStart(shiftWeek(agg.weekStart, -1))} className="px-3 py-1.5 text-sm text-foreground/50 hover:text-foreground rounded-full">←</button>
            <span className="px-3 text-sm font-mono text-foreground/70">{formatRange(agg.weekStart, agg.weekEnd)}</span>
            <button onClick={() => setWeekStart(undefined)} className="px-4 py-1.5 text-[10px] font-bold uppercase bg-white text-black rounded-full">Today</button>
            <button onClick={() => setWeekStart(shiftWeek(agg.weekStart, 1))} className="px-3 py-1.5 text-sm text-foreground/50 hover:text-foreground rounded-full">→</button>
          </div>
        </div>
        <div className="glass rounded-[2rem] p-12 text-center text-foreground/60">
          {personName} tidak punya aktivitas di minggu ini.
        </div>
      </>
    );
  }

  const completionRate = person.tasksTotal
    ? Math.round((person.tasksDone / person.tasksTotal) * 100)
    : 0;

  const maxProjectHours = Math.max(...Object.values(person.byProject), 0.001);

  // Group tasks by project for readability
  const tasksByProject = person.tasks.reduce<Record<string, typeof person.tasks>>((acc, t) => {
    (acc[t.projectName] = acc[t.projectName] ?? []).push(t);
    return acc;
  }, {});
  const projectGroups = Object.entries(tasksByProject);
  const groupsPager = usePager(projectGroups, 3, personName);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <Link
          to="/team"
          className="inline-flex items-center gap-2 text-xs text-foreground/50 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to Team
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
                { kind: "person", agg, personName },
                `nowtrack-${personName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${agg.weekStart}.pdf`,
              )
            }
            className="px-4 py-2 text-xs font-bold tracking-wider uppercase glass rounded-full hover:bg-foreground/10 transition-colors"
          >
            ⬇ Export PDF
          </button>
        </div>
      </div>

      <header className="glass rounded-[2rem] p-8 mb-8">
        <div className="flex items-start gap-5">
          <div className="size-16 rounded-2xl bg-white/10 grid place-items-center text-xl font-bold ring-1 ring-white/10">
            {initials(personName)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-display font-extrabold tracking-tight">{personName}</h1>
            <p className="text-foreground/50 text-sm mt-1">
              Week {agg.weekStart} → {agg.weekEnd}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
              <Stat label="Total Hours" value={person.totalHours.toFixed(1)} suffix="h" icon={<Clock className="size-3.5" />} />
              <Stat label="Tasks Done" value={String(person.tasksDone)} icon={<CheckCircle2 className="size-3.5" />} />
              <Stat label="In Progress" value={String(person.tasksInProgress)} />
              <Stat label="Blocked" value={String(person.tasksBlocked)} icon={<AlertTriangle className="size-3.5" />} />
            </div>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Completion */}
        <section className="glass rounded-[1.5rem] p-6">
          <h3 className="text-[10px] font-mono uppercase text-foreground/40 mb-3">Completion Rate</h3>
          <div className="text-4xl font-display font-extrabold">{completionRate}%</div>
          <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-foreground/70 rounded-full transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <p className="text-xs text-foreground/50 mt-3">
            {person.tasksDone} of {person.tasksTotal} tasks closed this week
          </p>
        </section>

        {/* Hours by project */}
        <section className="glass rounded-[1.5rem] p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between mb-5">
            <h3 className="text-[10px] font-mono uppercase text-foreground/40">Hours by Project</h3>
            <span className="text-[10px] font-mono text-foreground/30">
              {Object.keys(person.byProject).length} projects
            </span>
          </div>
          <ul className="space-y-4">
            {Object.entries(person.byProject)
              .sort(([, a], [, b]) => b - a)
              .map(([projName, hrs]) => {
                const pct = (hrs / maxProjectHours) * 100;
                const share = person.totalHours ? (hrs / person.totalHours) * 100 : 0;
                return (
                  <li key={projName}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-sm text-foreground/85 truncate flex items-center gap-2 min-w-0">
                        <Folder className="size-3.5 opacity-40 shrink-0" />
                        <span className="truncate">{projName}</span>
                      </span>
                      <span className="flex items-baseline gap-2 shrink-0">
                        <span className="font-mono text-sm tabular-nums text-foreground">{hrs.toFixed(1)}h</span>
                        <span className="text-[10px] font-mono text-foreground/40 tabular-nums">{share.toFixed(0)}%</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-foreground/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-foreground/40 to-foreground/80 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      </div>

      {/* Tasks grouped by project */}
      <section className="space-y-6">
        <h2 className="text-lg font-display font-semibold">Tasks This Week</h2>
        {groupsPager.pageItems.map(([projName, tasks]) => (
          <div key={projName} className="glass rounded-[1.5rem] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Folder className="size-4 opacity-60" />
                {projName}
              </h3>
              <span className="text-xs font-mono text-foreground/50">
                {tasks.length} tasks · {tasks.reduce((s, t) => s + t.duration, 0).toFixed(1)}h
              </span>
            </div>
            <ul className="divide-y divide-border/40">
              {tasks.map((t) => (
                <li key={t.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium ${statusTone(t.status, t.blocked)}`}>
                        {t.blocked ? "Blocked" : t.status}
                      </span>
                      {t.date && (
                        <span className="text-[10px] font-mono text-foreground/40">{t.date}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm tabular-nums whitespace-nowrap">
                    {t.duration.toFixed(2)}h
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {projectGroups.length > 0 && (
          <Pager
            page={groupsPager.page}
            totalPages={groupsPager.totalPages}
            onChange={groupsPager.setPage}
            total={groupsPager.total}
            pageSize={groupsPager.pageSize}
          />
        )}
        {person.tasks.length === 0 && (
          <div className="glass rounded-[1.5rem] p-12 text-center text-sm text-foreground/50">
            No tasks logged this week.
          </div>
        )}
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  suffix,
  icon,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/5 p-4">
      <div className="text-[10px] font-mono uppercase text-foreground/40 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-display font-extrabold text-2xl tabular-nums">
        {value}
        {suffix && <span className="text-base font-normal text-foreground/40 ml-0.5">{suffix}</span>}
      </div>
    </div>
  );
}