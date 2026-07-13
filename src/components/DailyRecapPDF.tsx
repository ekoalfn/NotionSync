import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import type { getWeeklyAggregate } from "@/lib/notion.functions";
import { fmtJam } from "@/lib/utils";
import { buildDailyRows, noteKey } from "@/components/DailyRecap";

type WeeklyAgg = Awaited<ReturnType<typeof getWeeklyAggregate>>;

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
  brandDot: { width: 14, height: 14, backgroundColor: "#111", borderRadius: 7 },
  brandName: { fontSize: 14, fontFamily: "Helvetica-Bold", letterSpacing: 2 },
  brandSub: { fontSize: 8, color: "#555", marginTop: 2 },
  metaRight: { textAlign: "right" },
  metaTitle: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  metaSub: { fontSize: 8, color: "#555", marginTop: 2 },

  tHead: {
    flexDirection: "row",
    borderBottom: "1pt solid #222",
    paddingBottom: 4,
    marginBottom: 2,
  },
  tHeadCell: { fontSize: 7, color: "#666", textTransform: "uppercase", letterSpacing: 1 },
  row: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #e5e5e5",
    paddingVertical: 4,
    alignItems: "flex-start",
  },
  cDate: { width: "16%", paddingRight: 6, fontFamily: "Helvetica-Bold" },
  cProject: { width: "22%", paddingRight: 6, flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  cTarget: { width: "15%", paddingRight: 6, fontFamily: "Helvetica" },
  cActual: { width: "15%", paddingRight: 6, fontFamily: "Helvetica" },
  cNotes: { width: "32%", color: "#333" },
  met: { color: "#0a7a34", fontFamily: "Helvetica-Bold" },
});

function fmtRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  e.setUTCDate(e.getUTCDate() - 1);
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(s)} — ${f(e)}`;
}

export function DailyReportDocument({
  agg,
  notes,
}: {
  agg: WeeklyAgg;
  notes: Record<string, string>;
}) {
  const days = buildDailyRows(agg);

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerRow}>
          <View style={styles.brandWrap}>
            <View style={styles.brandDot} />
            <View>
              <Text style={styles.brandName}>NOWTRACK</Text>
              <Text style={styles.brandSub}>Inowtech PM Hub</Text>
            </View>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.metaTitle}>Daily Project Recap</Text>
            <Text style={styles.metaSub}>{fmtRange(agg.weekStart, agg.weekEnd)}</Text>
          </View>
        </View>

        <View style={styles.tHead}>
          <Text style={[styles.tHeadCell, styles.cDate]}>Date</Text>
          <Text style={[styles.tHeadCell, styles.cProject]}>Project</Text>
          <Text style={[styles.tHeadCell, styles.cTarget]}>Target</Text>
          <Text style={[styles.tHeadCell, styles.cActual]}>Actual</Text>
          <Text style={[styles.tHeadCell, styles.cNotes]}>Notes</Text>
        </View>

        {days.length === 0 ? (
          <Text style={{ marginTop: 10, color: "#666" }}>
            Belum ada target harian atau jam tercatat minggu ini.
          </Text>
        ) : (
          days.map((d) =>
            d.rows.map((r, ri) => {
              const met = r.target != null && r.target > 0 && r.actual >= r.target;
              return (
                <View key={`${d.iso}-${r.project.projectId}`} style={styles.row} wrap={false}>
                  <Text style={styles.cDate}>{ri === 0 ? d.label : ""}</Text>
                  <View style={styles.cProject}>
                    <View
                      style={[styles.dot, { backgroundColor: resolveColor(r.project.color) }]}
                    />
                    <Text>{r.project.name}</Text>
                  </View>
                  <Text style={styles.cTarget}>
                    {r.target != null && r.target > 0 ? fmtJam(r.target) : "—"}
                  </Text>
                  <Text style={[styles.cActual, met ? styles.met : {}]}>{fmtJam(r.actual)}</Text>
                  <Text style={styles.cNotes}>
                    {notes[noteKey(d.iso, r.project.projectId)] ?? ""}
                  </Text>
                </View>
              );
            }),
          )
        )}
      </Page>
    </Document>
  );
}

export async function downloadDailyReport(
  agg: WeeklyAgg,
  notes: Record<string, string>,
  filename: string,
) {
  const blob = await pdf(<DailyReportDocument agg={agg} notes={notes} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
