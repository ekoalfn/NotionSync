import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { WeeklyAggregate, ProjectWeekly } from "@/lib/notion.functions";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111111",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottom: "1pt solid #111",
    paddingBottom: 10,
    marginBottom: 14,
  },
  brandWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandDot: {
    width: 14,
    height: 14,
    backgroundColor: "#111",
    borderRadius: 7,
  },
  brandName: { fontSize: 14, fontFamily: "Helvetica-Bold", letterSpacing: 2 },
  brandSub: { fontSize: 8, color: "#555", marginTop: 2 },
  metaRight: { textAlign: "right" },
  metaTitle: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  metaSub: { fontSize: 8, color: "#555", marginTop: 2 },

  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    marginTop: 12,
  },
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  kpiBox: {
    flex: 1,
    border: "1pt solid #ddd",
    padding: 8,
    borderRadius: 4,
  },
  kpiLabel: {
    fontSize: 7,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  kpiValue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 3 },

  projectCard: {
    border: "1pt solid #ddd",
    padding: 10,
    borderRadius: 4,
    marginBottom: 10,
  },
  projectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  projectName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  projectMeta: { fontSize: 8, color: "#666" },

  tableHead: {
    flexDirection: "row",
    borderBottom: "1pt solid #222",
    paddingBottom: 3,
    marginBottom: 3,
    marginTop: 4,
  },
  th: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#222",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottom: "0.5pt solid #eee",
  },
  td: { fontSize: 8, color: "#222" },

  // Column widths (project task table)
  cTitle: { width: "38%", paddingRight: 4 },
  cStatus: { width: "15%" },
  cAssign: { width: "25%" },
  cHrs: { width: "10%", textAlign: "right" },
  cDate: { width: "12%", textAlign: "right" },

  // Person table cols
  pName: { width: "45%" },
  pProj: { width: "35%" },
  pCount: { width: "10%", textAlign: "right" },
  pHrs: { width: "10%", textAlign: "right" },

  aiSection: {
    border: "1pt solid #ddd",
    padding: 10,
    borderRadius: 4,
    marginBottom: 8,
  },
  aiTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  aiBody: { fontSize: 9, lineHeight: 1.4, color: "#222" },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#888",
    borderTop: "0.5pt solid #ddd",
    paddingTop: 6,
  },

  // ── Project detail specific ──────────────────────────────────────────────
  projHeroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  projHeroName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  projHeroHours: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right" },
  projHeroSub: { fontSize: 8, color: "#666", textAlign: "right", marginTop: 2 },

  // Target / progress bar
  targetBox: { border: "1pt solid #ddd", borderRadius: 4, padding: 10, marginBottom: 12 },
  targetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  targetLabel: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  targetBadge: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  progressTrack: { height: 6, backgroundColor: "#eee", borderRadius: 3, marginBottom: 5 },
  progressBar: { height: 6, backgroundColor: "#222", borderRadius: 3 },
  targetStats: { flexDirection: "row", justifyContent: "space-between" },
  targetStatText: { fontSize: 8, color: "#666" },

  // Highlights row
  highlightRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  highlightBox: { flex: 1, border: "1pt solid #eee", borderRadius: 4, padding: 8 },
  highlightLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  highlightValue: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  highlightSub: { fontSize: 7, color: "#888", marginTop: 2 },

  // Hours by person bars
  personRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  personName: { fontSize: 8, width: "28%", paddingRight: 6 },
  personBarTrack: { flex: 1, height: 5, backgroundColor: "#eee", borderRadius: 2 },
  personBarFill: { height: 5, backgroundColor: "#333", borderRadius: 2 },
  personHrs: { fontSize: 8, width: "16%", textAlign: "right", color: "#444", fontFamily: "Helvetica-Bold" },
  personTasks: { fontSize: 7, width: "16%", textAlign: "right", color: "#999" },
});

function fmtDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  e.setUTCDate(e.getUTCDate() - 1);
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${f(s)} — ${f(e)}`;
}

function Header({ subtitle, weekStart, weekEnd, generatedAt }: { subtitle: string; weekStart: string; weekEnd: string; generatedAt: string }) {
  return (
    <View style={styles.headerRow} fixed>
      <View style={styles.brandWrap}>
        <View style={styles.brandDot} />
        <View>
          <Text style={styles.brandName}>NOWTRACK</Text>
          <Text style={styles.brandSub}>Inowtech · PM Hub</Text>
        </View>
      </View>
      <View style={styles.metaRight}>
        <Text style={styles.metaTitle}>{subtitle}</Text>
        <Text style={styles.metaSub}>{fmtDateRange(weekStart, weekEnd)}</Text>
        <Text style={styles.metaSub}>Generated {generatedAt}</Text>
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>NowTrack Weekly Report</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function statusLabel(t: ProjectWeekly["tasks"][number]) {
  if (t.blocked) return "Blocked";
  return t.status || "—";
}

function ProjectPage({ project, weekStart, weekEnd, generatedAt }: {
  project: ProjectWeekly;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
}) {
  const target = project.targetHoursPerWeek;
  const targetPct = target && target > 0
    ? Math.min(100, (project.totalHours / target) * 100)
    : null;
  const remaining = target != null ? target - project.totalHours : null;

  // Track status (mirror web logic)
  let trackLabel = "No target set";
  let trackBg = "#e5e5e5";
  let trackColor = "#666";
  if (target != null && target > 0) {
    if (project.totalHours >= target) { trackLabel = "Target met"; trackBg = "#222"; trackColor = "#fff"; }
    else if (targetPct! >= 75) { trackLabel = "On track"; trackBg = "#555"; trackColor = "#fff"; }
    else if (targetPct! >= 40) { trackLabel = "Behind"; trackBg = "#999"; trackColor = "#fff"; }
    else { trackLabel = "Far behind"; trackBg = "#ccc"; trackColor = "#333"; }
  }

  // Per-person aggregation — hours split by assignee count (same as web)
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

  // Highlights
  const totalTasks = project.tasks.length;
  const avgDuration = totalTasks
    ? project.tasks.reduce((s, t) => s + t.duration, 0) / totalTasks
    : 0;
  const longestTask = project.tasks.reduce<(typeof project.tasks)[number] | null>(
    (acc, t) => (!acc || t.duration > acc.duration ? t : acc), null,
  );
  const completionRate = totalTasks
    ? Math.round((project.tasksDone / totalTasks) * 100)
    : 0;
  const topContributor = people[0] ?? null;

  // Tasks sorted by date desc
  const tasksSorted = [...project.tasks].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? ""),
  );

  return (
    <Page size="A4" style={styles.page}>
      <Header subtitle={`Project · ${project.name}`} weekStart={weekStart} weekEnd={weekEnd} generatedAt={generatedAt} />

      {/* Hero: project name + total hours */}
      <View style={styles.projHeroRow}>
        <View>
          <Text style={styles.projHeroName}>{project.name}</Text>
          <Text style={{ fontSize: 8, color: "#666", marginTop: 2 }}>
            {weekStart} → {new Date(weekEnd).toISOString().slice(0, 10)}
          </Text>
        </View>
        <View>
          <Text style={styles.projHeroHours}>{project.totalHours.toFixed(1)}h</Text>
          {project.manHours > project.totalHours + 0.05 && (
            <Text style={styles.projHeroSub}>{project.manHours.toFixed(1)}h man-hours</Text>
          )}
        </View>
      </View>

      {/* Target progress */}
      {target != null && target > 0 ? (
        <View style={styles.targetBox}>
          <View style={styles.targetRow}>
            <Text style={styles.targetLabel}>Weekly target — goal: {target}h</Text>
            <Text style={[styles.targetBadge, { backgroundColor: trackBg, color: trackColor }]}>
              {trackLabel}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${targetPct!.toFixed(1)}%` as any }]} />
          </View>
          <View style={styles.targetStats}>
            <Text style={styles.targetStatText}>
              {project.totalHours.toFixed(1)}h / {target}h ({targetPct!.toFixed(0)}%)
            </Text>
            {remaining! > 0 && (
              <Text style={styles.targetStatText}>{remaining!.toFixed(1)}h to go</Text>
            )}
            {remaining! < 0 && (
              <Text style={styles.targetStatText}>+{Math.abs(remaining!).toFixed(1)}h over target</Text>
            )}
            {topContributor && (
              <Text style={styles.targetStatText}>
                Top: {topContributor.name} ({topContributor.hours.toFixed(1)}h)
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View style={[styles.targetBox, { backgroundColor: "#fafafa" }]}>
          <Text style={{ fontSize: 8, color: "#999" }}>
            No weekly target set. {project.totalHours.toFixed(1)}h logged this week.
          </Text>
        </View>
      )}

      {/* KPI grid */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Total Tasks</Text>
          <Text style={styles.kpiValue}>{totalTasks}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Done</Text>
          <Text style={styles.kpiValue}>{project.tasksDone}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>In Progress</Text>
          <Text style={styles.kpiValue}>{project.tasksInProgress}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Blocked</Text>
          <Text style={styles.kpiValue}>{project.tasksBlocked}</Text>
        </View>
      </View>

      {/* Hours by person + Highlights side by side */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        {/* Hours by person (70%) */}
        <View style={{ flex: 7, border: "1pt solid #ddd", borderRadius: 4, padding: 10 }}>
          <Text style={styles.sectionTitle}>Hours by Person</Text>
          {people.length === 0 ? (
            <Text style={{ fontSize: 8, color: "#999" }}>No contributors this week.</Text>
          ) : (
            people.map((p) => {
              const pct = (p.hours / maxPersonHours) * 100;
              const sharePct = project.totalHours > 0
                ? ((p.hours / project.totalHours) * 100).toFixed(0)
                : "0";
              return (
                <View key={p.name} style={styles.personRow}>
                  <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                  <View style={styles.personBarTrack}>
                    <View style={[styles.personBarFill, { width: `${pct.toFixed(1)}%` as any }]} />
                  </View>
                  <Text style={styles.personHrs}>{p.hours.toFixed(1)}h</Text>
                  <Text style={styles.personTasks}>{p.tasks}t · {sharePct}%</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Highlights (30%) */}
        <View style={{ flex: 3, border: "1pt solid #ddd", borderRadius: 4, padding: 10 }}>
          <Text style={styles.sectionTitle}>Highlights</Text>
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.highlightLabel}>Avg duration / task</Text>
            <Text style={styles.highlightValue}>{avgDuration.toFixed(1)}h</Text>
          </View>
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.highlightLabel}>Longest task</Text>
            <Text style={styles.highlightValue}>{longestTask ? `${longestTask.duration.toFixed(1)}h` : "—"}</Text>
            {longestTask && (
              <Text style={styles.highlightSub} numberOfLines={2}>{longestTask.title}</Text>
            )}
          </View>
          <View>
            <Text style={styles.highlightLabel}>Completion rate</Text>
            <Text style={styles.highlightValue}>{completionRate}%</Text>
            <Text style={styles.highlightSub}>{project.tasksDone}/{totalTasks} tasks</Text>
          </View>
        </View>
      </View>

      {/* Tasks this week — full table */}
      <Text style={styles.sectionTitle}>Tasks This Week ({tasksSorted.length})</Text>
      {tasksSorted.length === 0 ? (
        <Text style={{ fontSize: 9, color: "#666" }}>No tasks recorded this week.</Text>
      ) : (
        <View>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.cTitle]}>Task</Text>
            <Text style={[styles.th, styles.cAssign]}>Assignees</Text>
            <Text style={[styles.th, styles.cStatus]}>Status</Text>
            <Text style={[styles.th, styles.cDate]}>Date</Text>
            <Text style={[styles.th, styles.cHrs]}>Hrs</Text>
          </View>
          {tasksSorted.map((t) => (
            <View key={t.id} style={styles.tr} wrap={false}>
              <Text style={[styles.td, styles.cTitle]}>{t.title}</Text>
              <Text style={[styles.td, styles.cAssign]}>
                {t.assignees.length ? t.assignees.join(", ") : "Unassigned"}
              </Text>
              <Text style={[styles.td, styles.cStatus]}>{statusLabel(t)}</Text>
              <Text style={[styles.td, styles.cDate]}>{t.date ?? "—"}</Text>
              <Text style={[styles.td, styles.cHrs]}>{t.duration.toFixed(1)}</Text>
            </View>
          ))}
        </View>
      )}

      <Footer />
    </Page>
  );
}

function OverviewPage({ agg, generatedAt }: { agg: WeeklyAggregate; generatedAt: string }) {
  return (
    <Page size="A4" style={styles.page}>
      <Header subtitle="Weekly Overview" weekStart={agg.weekStart} weekEnd={agg.weekEnd} generatedAt={generatedAt} />

      <View style={styles.kpiRow}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Total Hours</Text>
          <Text style={styles.kpiValue}>{agg.totalHours.toFixed(1)}h</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Done</Text>
          <Text style={styles.kpiValue}>{agg.tasksDone}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>In Progress</Text>
          <Text style={styles.kpiValue}>{agg.tasksInProgress}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Blocked</Text>
          <Text style={styles.kpiValue}>{agg.tasksBlocked}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Projects</Text>
          <Text style={styles.kpiValue}>{agg.projects.length}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Projects</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, { width: "40%" }]}>Project</Text>
        <Text style={[styles.th, { width: "15%", textAlign: "right" }]}>Hours</Text>
        <Text style={[styles.th, { width: "15%", textAlign: "right" }]}>Done</Text>
        <Text style={[styles.th, { width: "15%", textAlign: "right" }]}>In Prog</Text>
        <Text style={[styles.th, { width: "15%", textAlign: "right" }]}>Blocked</Text>
      </View>
      {agg.projects.map((p) => (
        <View key={p.projectId} style={styles.tr} wrap={false}>
          <Text style={[styles.td, { width: "40%" }]}>{p.name}</Text>
          <Text style={[styles.td, { width: "15%", textAlign: "right" }]}>{p.totalHours.toFixed(1)}</Text>
          <Text style={[styles.td, { width: "15%", textAlign: "right" }]}>{p.tasksDone}</Text>
          <Text style={[styles.td, { width: "15%", textAlign: "right" }]}>{p.tasksInProgress}</Text>
          <Text style={[styles.td, { width: "15%", textAlign: "right" }]}>{p.tasksBlocked}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Team</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.pName]}>Person</Text>
        <Text style={[styles.th, styles.pProj]}>Active Projects</Text>
        <Text style={[styles.th, styles.pCount]}>Tasks</Text>
        <Text style={[styles.th, styles.pHrs]}>Hours</Text>
      </View>
      {agg.perPerson.map((p) => (
        <View key={p.name} style={styles.tr} wrap={false}>
          <Text style={[styles.td, styles.pName]}>{p.name}</Text>
          <Text style={[styles.td, styles.pProj]}>{p.activeProjects.join(", ") || "—"}</Text>
          <Text style={[styles.td, styles.pCount]}>{p.tasksTotal}</Text>
          <Text style={[styles.td, styles.pHrs]}>{p.totalHours.toFixed(1)}</Text>
        </View>
      ))}

      <Footer />
    </Page>
  );
}

function PersonPage({
  person,
  agg,
  generatedAt,
}: {
  person: WeeklyAggregate["perPerson"][number];
  agg: WeeklyAggregate;
  generatedAt: string;
}) {
  return (
    <Page size="A4" style={styles.page}>
      <Header subtitle={`Team · ${person.name}`} weekStart={agg.weekStart} weekEnd={agg.weekEnd} generatedAt={generatedAt} />

      <View style={styles.kpiRow}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Total Hours</Text>
          <Text style={styles.kpiValue}>{person.totalHours.toFixed(1)}h</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Tasks</Text>
          <Text style={styles.kpiValue}>{person.tasksTotal}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Done</Text>
          <Text style={styles.kpiValue}>{person.tasksDone}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>In Progress</Text>
          <Text style={styles.kpiValue}>{person.tasksInProgress}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Blocked</Text>
          <Text style={styles.kpiValue}>{person.tasksBlocked}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Hours by Project</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, { width: "70%" }]}>Project</Text>
        <Text style={[styles.th, { width: "30%", textAlign: "right" }]}>Hours</Text>
      </View>
      {Object.entries(person.byProject).map(([proj, hrs]) => (
        <View key={proj} style={styles.tr} wrap={false}>
          <Text style={[styles.td, { width: "70%" }]}>{proj}</Text>
          <Text style={[styles.td, { width: "30%", textAlign: "right" }]}>{hrs.toFixed(1)}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Tasks</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.cTitle]}>Task</Text>
        <Text style={[styles.th, styles.cStatus]}>Status</Text>
        <Text style={[styles.th, styles.cAssign]}>Project</Text>
        <Text style={[styles.th, styles.cHrs]}>Hrs</Text>
        <Text style={[styles.th, styles.cDate]}>Date</Text>
      </View>
      {person.tasks.map((t) => (
        <View key={t.id} style={styles.tr} wrap={false}>
          <Text style={[styles.td, styles.cTitle]}>{t.title}</Text>
          <Text style={[styles.td, styles.cStatus]}>{t.blocked ? "Blocked" : t.status}</Text>
          <Text style={[styles.td, styles.cAssign]}>{t.projectName}</Text>
          <Text style={[styles.td, styles.cHrs]}>{t.duration.toFixed(1)}</Text>
          <Text style={[styles.td, styles.cDate]}>{t.date ?? "—"}</Text>
        </View>
      ))}

      <Footer />
    </Page>
  );
}

function AiPage({
  ai,
  weekStart,
  weekEnd,
  generatedAt,
}: {
  ai: { summary: string; improvements: string; critique: string };
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
}) {
  return (
    <Page size="A4" style={styles.page}>
      <Header subtitle="AI Insights" weekStart={weekStart} weekEnd={weekEnd} generatedAt={generatedAt} />
      <View style={styles.aiSection}>
        <Text style={styles.aiTitle}>Weekly Summary</Text>
        <Text style={styles.aiBody}>{ai.summary || "—"}</Text>
      </View>
      <View style={styles.aiSection}>
        <Text style={styles.aiTitle}>Improvements</Text>
        <Text style={styles.aiBody}>{ai.improvements || "—"}</Text>
      </View>
      <View style={styles.aiSection}>
        <Text style={styles.aiTitle}>Critique</Text>
        <Text style={styles.aiBody}>{ai.critique || "—"}</Text>
      </View>
      <Footer />
    </Page>
  );
}

export type ReportScope =
  | { kind: "all"; agg: WeeklyAggregate; ai?: { summary: string; improvements: string; critique: string } | null }
  | { kind: "project"; agg: WeeklyAggregate; projectId: string }
  | { kind: "person"; agg: WeeklyAggregate; personName: string };

export function WeeklyReportDocument({ scope }: { scope: ReportScope }) {
  const generatedAt = new Date().toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
  const { agg } = scope;

  if (scope.kind === "project") {
    const proj = agg.projects.find((p) => p.projectId === scope.projectId);
    if (!proj) {
      return (
        <Document>
          <Page size="A4" style={styles.page}>
            <Text>Project not found.</Text>
          </Page>
        </Document>
      );
    }
    return (
      <Document>
        <ProjectPage project={proj} weekStart={agg.weekStart} weekEnd={agg.weekEnd} generatedAt={generatedAt} />
      </Document>
    );
  }

  if (scope.kind === "person") {
    const person = agg.perPerson.find((p) => p.name === scope.personName);
    if (!person) {
      return (
        <Document>
          <Page size="A4" style={styles.page}>
            <Text>Person not found.</Text>
          </Page>
        </Document>
      );
    }
    return (
      <Document>
        <PersonPage person={person} agg={agg} generatedAt={generatedAt} />
      </Document>
    );
  }

  // all
  return (
    <Document>
      <OverviewPage agg={agg} generatedAt={generatedAt} />
      {agg.projects.map((p) => (
        <ProjectPage key={p.projectId} project={p} weekStart={agg.weekStart} weekEnd={agg.weekEnd} generatedAt={generatedAt} />
      ))}
      {scope.ai && <AiPage ai={scope.ai} weekStart={agg.weekStart} weekEnd={agg.weekEnd} generatedAt={generatedAt} />}
    </Document>
  );
}

export async function downloadWeeklyReport(scope: ReportScope, filename: string) {
  const blob = await pdf(<WeeklyReportDocument scope={scope} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
