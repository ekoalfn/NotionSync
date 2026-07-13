import { useEffect, useState } from "react";
import type { getWeeklyAggregate } from "@/lib/notion.functions";
import { fmtJam } from "@/lib/utils";

type WeeklyAgg = Awaited<ReturnType<typeof getWeeklyAggregate>>;
type Project = WeeklyAgg["projects"][number];

export type DailyDay = {
  iso: string;
  label: string;
  rows: Array<{ project: Project; actual: number; target: number | null }>;
};

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

const HARI_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function labelHari(iso: string): string {
  const d = new Date(iso);
  return `${HARI_ID[d.getUTCDay()]} - ${d.getUTCDate()} ${BULAN_ID[d.getUTCMonth()]}`;
}

export function noteKey(iso: string, projectId: string) {
  return `${iso}|${projectId}`;
}

// Shared by the on-screen table AND the PDF export so both stay in sync.
// Shows at least Senin–Sabtu (6 days) even if the workdays divisor is 5.
// `hidden` = projectIds to exclude (filter chips).
export function buildDailyRows(agg: WeeklyAgg, hidden?: Set<string>): DailyDay[] {
  const workdays = agg.workdaysPerWeek || 5;
  const targetDaily = (p: Project): number | null =>
    p.targetHoursPerDay != null
      ? p.targetHoursPerDay
      : p.targetHoursPerWeek != null
        ? p.targetHoursPerWeek / workdays
        : null;

  const displayDays = Math.max(workdays, 6);
  return Array.from({ length: displayDays }, (_, i) => {
    const iso = addDaysISO(agg.weekStart, i);
    const rows = agg.projects
      .filter((p) => !hidden?.has(p.projectId))
      .map((p) => ({
        project: p,
        actual: p.tasks.reduce((s, t) => (t.date === iso ? s + t.duration : s), 0),
        target: targetDaily(p),
      }))
      .filter((r) => (r.target != null && r.target > 0) || r.actual > 0);
    return { iso, label: labelHari(iso), rows };
  }).filter((d) => d.rows.length > 0);
}

// One editable notes cell. Local state so typing is smooth; commits on blur.
// Syncs when the saved value changes (e.g. after week switch / refetch).
function NoteCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => {
    setV(value);
  }, [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== value) onSave(v);
      }}
      placeholder="+ note"
      className="w-full min-w-[140px] bg-transparent border border-transparent hover:border-foreground/10 focus:border-foreground/20 rounded-lg px-2 py-1 text-sm text-foreground/80 placeholder:text-foreground/30 focus:outline-none transition-colors"
    />
  );
}

export function DailyRecap({
  agg,
  notes = {},
  onSaveNote,
  hidden,
  onToggleProject,
}: {
  agg: WeeklyAgg;
  notes?: Record<string, string>;
  onSaveNote?: (iso: string, projectId: string, note: string) => void;
  hidden?: Set<string>;
  onToggleProject?: (projectId: string) => void;
}) {
  const days = buildDailyRows(agg, hidden);

  const filterBar = onToggleProject && agg.projects.length > 0 && (
    <div className="flex flex-wrap gap-2 mb-4">
      {agg.projects.map((p) => {
        const on = !hidden?.has(p.projectId);
        return (
          <button
            key={p.projectId}
            onClick={() => onToggleProject(p.projectId)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              on
                ? "border-foreground/15 bg-foreground/[0.06] text-foreground/80"
                : "border-transparent text-foreground/30 line-through"
            }`}
          >
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: on ? resolveColor(p.color) : "currentColor" }}
            />
            {p.name}
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="glass rounded-[2rem] p-6 md:p-8">
      <h3 className="font-display font-semibold text-lg mb-4">Daily Project Recap</h3>
      {filterBar}
      {days.length === 0 ? (
        <p className="text-sm text-foreground/50">
          Belum ada target harian atau jam tercatat minggu ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/40 text-left">
                <th className="py-2 pr-4 font-normal">Date</th>
                <th className="py-2 pr-4 font-normal">Project</th>
                <th className="py-2 pr-4 font-normal">Target</th>
                <th className="py-2 pr-4 font-normal">Actual</th>
                <th className="py-2 font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, di) =>
                d.rows.map((r, ri) => {
                  const key = noteKey(d.iso, r.project.projectId);
                  const sep = ri === 0 && di > 0;
                  return (
                    <tr
                      key={key}
                      className={
                        sep
                          ? "border-t-2 border-foreground/20"
                          : "border-t border-foreground/[0.06]"
                      }
                    >
                      {ri === 0 && (
                        <td
                          rowSpan={d.rows.length}
                          className="py-3 pr-4 align-top font-medium text-foreground/80 whitespace-nowrap"
                        >
                          {d.label}
                        </td>
                      )}
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: resolveColor(r.project.color) }}
                          />
                          {r.project.name}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-foreground/70 whitespace-nowrap">
                        {r.target != null && r.target > 0 ? fmtJam(r.target) : "—"}
                      </td>
                      <td
                        className={`py-3 pr-4 font-mono whitespace-nowrap ${
                          r.target != null && r.target > 0 && r.actual >= r.target
                            ? "text-foreground"
                            : "text-foreground/70"
                        }`}
                      >
                        {fmtJam(r.actual)}
                      </td>
                      <td className="py-2 pr-0 align-middle">
                        {onSaveNote ? (
                          <NoteCell
                            value={notes[key] ?? ""}
                            onSave={(v) => onSaveNote(d.iso, r.project.projectId, v)}
                          />
                        ) : (
                          <span className="text-foreground/70">{notes[key] ?? "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
