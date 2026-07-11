import type { ReactNode } from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Path,
  Line as SvgLine,
  Rect,
  Circle,
  Text as SvgText,
  G,
  Polyline,
  pdf,
} from "@react-pdf/renderer";

// ───────────────────────── styles (match WeeklyReportPDF look) ─────────────────────────

const s = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111111",
  },
  // Header
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

  // Section
  sectionTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 6 },
  sectionSub: { fontSize: 8, color: "#666", marginBottom: 8 },

  // KPI
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  kpiBox: { flex: 1, border: "1pt solid #ddd", padding: 8, borderRadius: 4 },
  kpiLabel: { fontSize: 7, color: "#666", textTransform: "uppercase", letterSpacing: 1 },
  kpiValue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 3 },
  kpiDelta: { fontSize: 7, marginTop: 3, fontFamily: "Helvetica-Bold" },
  kpiDeltaUp: { color: "#067a4d" },
  kpiDeltaDown: { color: "#b91c4a" },
  kpiDeltaFlat: { color: "#666" },
  kpiPrev: { fontSize: 7, color: "#888", marginTop: 1 },

  // Comparison band (date ranges)
  bandRow: {
    flexDirection: "row",
    gap: 10,
    padding: 8,
    border: "1pt solid #ddd",
    borderRadius: 4,
    marginBottom: 12,
    alignItems: "center",
  },
  bandDotSolid: { width: 6, height: 6, backgroundColor: "#111", borderRadius: 3 },
  bandDotOutline: { width: 6, height: 6, border: "1pt dashed #888", borderRadius: 3 },
  bandText: { fontSize: 8, color: "#222" },
  bandLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 1 },
  bandSep: { fontSize: 8, color: "#999" },

  // Matrix
  matrixCard: { border: "1pt solid #ddd", padding: 10, borderRadius: 4, marginBottom: 12 },
  matrixHead: { flexDirection: "row", borderBottom: "1pt solid #222", paddingBottom: 3, marginBottom: 3 },
  matrixTh: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#222",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  matrixRow: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.5pt solid #eee" },
  matrixTotalRow: { flexDirection: "row", paddingVertical: 4, borderTop: "1pt solid #222", marginTop: 2 },
  matrixTd: { fontSize: 8, color: "#222" },
  matrixTdBold: { fontSize: 8, color: "#000", fontFamily: "Helvetica-Bold" },
  cellRight: { textAlign: "right" },

  // Side-by-side
  sideBySide: { flexDirection: "row", gap: 10, marginBottom: 12 },
  sideCol: { flex: 1 },
  sideHead: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#222",
    marginBottom: 4,
    paddingBottom: 3,
    borderBottom: "0.5pt solid #888",
  },
  sideHeadPrev: { color: "#666" },

  // AI Insights
  aiSection: { border: "1pt solid #ddd", padding: 12, borderRadius: 4, marginBottom: 12, backgroundColor: "#fafafa" },
  aiTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  aiBody: { fontSize: 9, lineHeight: 1.5, color: "#222" },

  // Footer
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

  // ── Per-project summary cards & detail pages ────────────────────────────
  projSummaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  projSummaryCard: {
    width: "48.5%",
    border: "1pt solid #ddd",
    borderRadius: 4,
    padding: 8,
  },
  projSummaryHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  projSummaryDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 5, marginTop: 3 },
  projSummaryName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111", flexShrink: 1 },
  projSummaryTotal: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#111" },
  projSummaryTotalSub: { fontSize: 6, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 },
  projSummaryMeta: { fontSize: 7, color: "#666", marginTop: 1 },
  projSummaryDelta: { fontSize: 7, fontFamily: "Helvetica-Bold", marginTop: 1 },
  // Mini-bar row inside summary card
  miniBarRow: { flexDirection: "row", alignItems: "flex-end", gap: 1.5, height: 24, marginTop: 5, marginBottom: 3 },
  miniBar: { backgroundColor: "#7c3aed", borderRadius: 1, flex: 1 },
  miniBarEmpty: { backgroundColor: "#eee", borderRadius: 1, flex: 1, height: 2, alignSelf: "flex-end" },

  // Detail page hero
  projDetailHero: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: "0.5pt solid #ddd",
  },
  projDetailName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#111" },
  projDetailRange: { fontSize: 8, color: "#666", marginTop: 2 },
  projDetailHours: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right" },
  projDetailHoursSub: { fontSize: 7, color: "#888", textAlign: "right", marginTop: 2 },

  // Highlights row (detail page)
  highlightRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  highlightBox: { flex: 1, border: "1pt solid #eee", borderRadius: 4, padding: 7 },
  highlightLabel: { fontSize: 6, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  highlightValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  highlightSub: { fontSize: 6, color: "#999", marginTop: 1 },

  // Hours by person bar (detail page)
  personRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  personName: { fontSize: 8, width: "28%", paddingRight: 6 },
  personBarTrack: { flex: 1, height: 5, backgroundColor: "#eee", borderRadius: 2 },
  personBarFill: { height: 5, backgroundColor: "#333", borderRadius: 2 },
  personHrs: { fontSize: 8, width: "14%", textAlign: "right", color: "#222", fontFamily: "Helvetica-Bold" },
  personShare: { fontSize: 6, width: "12%", textAlign: "right", color: "#999" },
});

// ───────────────────────── helpers ─────────────────────────

function fmtDateRange(startISO: string, endISO: string) {
  const a = new Date(`${startISO}T00:00:00Z`);
  const b = new Date(`${endISO}T00:00:00Z`);
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${f(a)} — ${f(b)}`;
}

function deltaInfo(current: number, previous: number | undefined) {
  if (previous === undefined) return null;
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return { label: "NEW", dir: "up" as const, pct: null };
  if (current === 0) return { label: "GONE", dir: "down" as const, pct: null };
  const diff = current - previous;
  const pct = (diff / previous) * 100;
  const dir = Math.abs(pct) < 0.5 ? "flat" : diff > 0 ? "up" : "down";
  return { label: null, dir, pct };
}

function DeltaText({ d }: { d: ReturnType<typeof deltaInfo> }) {
  if (!d) return null;
  const styleByDir =
    d.dir === "up" ? s.kpiDeltaUp : d.dir === "down" ? s.kpiDeltaDown : s.kpiDeltaFlat;
  const arrow = d.dir === "up" ? "▲" : d.dir === "down" ? "▼" : "•";
  return (
    <Text style={[s.kpiDelta, styleByDir]}>
      {d.label ?? `${arrow} ${Math.abs(d.pct ?? 0).toFixed(0)}% vs prev`}
    </Text>
  );
}

// ───────────────────────── header / footer ─────────────────────────

function Header({ start, end, generatedAt }: { start: string; end: string; generatedAt: string }) {
  return (
    <View style={s.headerRow} fixed>
      <View style={s.brandWrap}>
        <View style={s.brandDot} />
        <View>
          <Text style={s.brandName}>NOWTRACK</Text>
          <Text style={s.brandSub}>Inowtech · PM Hub</Text>
        </View>
      </View>
      <View style={s.metaRight}>
        <Text style={s.metaTitle}>Monthly Report</Text>
        <Text style={s.metaSub}>{fmtDateRange(start, end)}</Text>
        <Text style={s.metaSub}>Generated {generatedAt}</Text>
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>NowTrack — Inowtech · Monthly Report</Text>
      <Text
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

// ───────────────────────── KPI row (with optional deltas) ─────────────────────────

function KpiBox({
  label,
  value,
  previousValue,
  unit,
}: {
  label: string;
  value: number;
  previousValue?: number | undefined;
  unit?: string;
}) {
  const d = deltaInfo(value, previousValue);
  return (
    <View style={s.kpiBox}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>
        {value.toFixed(unit === "h" ? 1 : 0)}
        {unit ?? ""}
      </Text>
      {previousValue !== undefined ? (
        <>
          <DeltaText d={d} />
          <Text style={s.kpiPrev}>
            prev: {previousValue.toFixed(unit === "h" ? 1 : 0)}
            {unit ?? ""}
          </Text>
        </>
      ) : null}
    </View>
  );
}

// ───────────────────────── matrix ─────────────────────────

type WeekHeader = { key: string; label: string };
type RowData = {
  name: string;
  byWeek: Record<string, number>;
  total: number;
  previousTotal?: number;
};

function MatrixTable({
  title,
  subtitle,
  leftHeader,
  weeks,
  rows,
  weekTotals,
  grandTotal,
  hasCompare,
}: {
  title: string;
  subtitle?: string;
  leftHeader: string;
  weeks: WeekHeader[];
  rows: RowData[];
  weekTotals: Array<{ key: string; total: number }>;
  grandTotal: number;
  hasCompare: boolean;
}) {
  const totalsByKey: Record<string, number> = {};
  for (const t of weekTotals) totalsByKey[t.key] = t.total;

  // Distribute column widths: left 22%, total 12% (+ optional delta 12%), rest split equally
  const leftW = 22;
  const totalW = 12;
  const deltaW = hasCompare ? 12 : 0;
  const weekCount = weeks.length || 1;
  const weekW = (100 - leftW - totalW - deltaW) / weekCount;

  return (
    <View style={s.matrixCard} wrap={false}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}

      <View style={s.matrixHead}>
        <Text style={[s.matrixTh, { width: `${leftW}%` }]}>{leftHeader}</Text>
        {weeks.map((w) => (
          <Text
            key={w.key}
            style={[s.matrixTh, s.cellRight, { width: `${weekW}%` }]}
          >
            {w.label}
          </Text>
        ))}
        <Text style={[s.matrixTh, s.cellRight, { width: `${totalW}%` }]}>Total</Text>
        {hasCompare ? (
          <Text style={[s.matrixTh, s.cellRight, { width: `${deltaW}%` }]}>Δ</Text>
        ) : null}
      </View>

      {rows.map((r) => {
        const d = hasCompare ? deltaInfo(r.total, r.previousTotal) : null;
        return (
          <View key={r.name} style={s.matrixRow}>
            <Text style={[s.matrixTd, { width: `${leftW}%` }]}>{r.name}</Text>
            {weeks.map((w) => {
              const h = r.byWeek[w.key] ?? 0;
              return (
                <Text
                  key={w.key}
                  style={[
                    s.matrixTd,
                    s.cellRight,
                    { width: `${weekW}%`, color: h === 0 ? "#bbb" : "#222" },
                  ]}
                >
                  {h === 0 ? "—" : h.toFixed(1)}
                </Text>
              );
            })}
            <Text style={[s.matrixTdBold, s.cellRight, { width: `${totalW}%` }]}>
              {r.total.toFixed(1)}
            </Text>
            {hasCompare ? (
              <Text
                style={[
                  s.matrixTd,
                  s.cellRight,
                  { width: `${deltaW}%`, fontFamily: "Helvetica-Bold" },
                  d?.dir === "up" ? s.kpiDeltaUp : d?.dir === "down" ? s.kpiDeltaDown : s.kpiDeltaFlat,
                ]}
              >
                {d
                  ? d.label
                    ? d.label
                    : `${d.dir === "up" ? "▲" : d.dir === "down" ? "▼" : "•"}${Math.abs(d.pct ?? 0).toFixed(0)}%`
                  : "—"}
              </Text>
            ) : null}
          </View>
        );
      })}

      <View style={s.matrixTotalRow}>
        <Text style={[s.matrixTdBold, { width: `${leftW}%` }]}>TOTAL</Text>
        {weeks.map((w) => {
          const t = totalsByKey[w.key] ?? 0;
          return (
            <Text
              key={w.key}
              style={[s.matrixTdBold, s.cellRight, { width: `${weekW}%` }]}
            >
              {t === 0 ? "—" : t.toFixed(1)}
            </Text>
          );
        })}
        <Text style={[s.matrixTdBold, s.cellRight, { width: `${totalW}%` }]}>
          {grandTotal.toFixed(1)}
        </Text>
        {hasCompare ? <Text style={[s.matrixTd, { width: `${deltaW}%` }]} /> : null}
      </View>
    </View>
  );
}

// ───────────────────────── side-by-side weekly totals ─────────────────────────

function SideBySideWeekly({
  currentWeeks,
  currentTotals,
  previousWeeks,
  previousTotals,
}: {
  currentWeeks: WeekHeader[];
  currentTotals: Array<{ key: string; wallClock: number; manHours: number }>;
  previousWeeks: WeekHeader[];
  previousTotals: Array<{ key: string; wallClock: number; manHours: number }>;
}) {
  const renderCol = (
    weeks: WeekHeader[],
    totals: Array<{ key: string; wallClock: number; manHours: number }>,
    heading: string,
    isPrev: boolean,
  ) => {
    const totalsByKey = new Map<string, { wallClock: number; manHours: number }>();
    for (const t of totals) totalsByKey.set(t.key, { wallClock: t.wallClock, manHours: t.manHours });
    return (
      <View style={s.sideCol}>
        <Text style={[s.sideHead, isPrev ? s.sideHeadPrev : undefined]}>{heading}</Text>
        <View style={s.matrixHead}>
          <Text style={[s.matrixTh, { width: "45%" }]}>Week</Text>
          <Text style={[s.matrixTh, s.cellRight, { width: "27%" }]}>Wall</Text>
          <Text style={[s.matrixTh, s.cellRight, { width: "28%" }]}>Man</Text>
        </View>
        {weeks.map((w) => {
          const v = totalsByKey.get(w.key) ?? { wallClock: 0, manHours: 0 };
          return (
            <View key={w.key} style={s.matrixRow}>
              <Text style={[s.matrixTd, { width: "45%" }]}>{w.label}</Text>
              <Text style={[s.matrixTd, s.cellRight, { width: "27%" }]}>
                {v.wallClock === 0 ? "—" : v.wallClock.toFixed(1)}
              </Text>
              <Text style={[s.matrixTd, s.cellRight, { width: "28%" }]}>
                {v.manHours === 0 ? "—" : v.manHours.toFixed(1)}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={s.matrixCard} wrap={false}>
      <Text style={s.sectionTitle}>Weekly Totals — Side by Side</Text>
      <Text style={s.sectionSub}>
        Wall-clock and man-hours per week for both periods. Weeks aligned by index.
      </Text>
      <View style={s.sideBySide}>
        {renderCol(currentWeeks, currentTotals, "Current period", false)}
        {renderCol(previousWeeks, previousTotals, "Previous period", true)}
      </View>
    </View>
  );
}

// ───────────────────────── AI Insights block ─────────────────────────

function AiInsightsBlock({ markdown }: { markdown: string }) {
  // Render markdown lightly — split paragraphs by double newline, bullets by leading "-" or "*".
  // Bold **text** is detected and rendered inline.
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const renderInline = (line: string, key: string) => {
    // Split on **bold** tokens
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <Text key={key} style={s.aiBody}>
        {parts.map((p, i) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <Text key={i} style={{ fontFamily: "Helvetica-Bold" }}>
              {p.slice(2, -2)}
            </Text>
          ) : (
            <Text key={i}>{p}</Text>
          ),
        )}
      </Text>
    );
  };

  return (
    <View style={s.aiSection}>
      <Text style={s.aiTitle}>AI Insights</Text>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^[-*•]\s+/.test(l) || /^\d+\.\s+/.test(l));
        if (isList) {
          return (
            <View key={bi} style={{ marginBottom: 4 }}>
              {lines.map((l, li) => {
                const content = l.replace(/^[-*•\d.]+\s+/, "");
                return (
                  <View key={li} style={{ flexDirection: "row", marginBottom: 2 }}>
                    <Text style={[s.aiBody, { width: 10 }]}>•</Text>
                    {renderInline(content, `${bi}-${li}`)}
                  </View>
                );
              })}
            </View>
          );
        }
        return (
          <View key={bi} style={{ marginBottom: 4 }}>
            {lines.map((l, li) => renderInline(l, `${bi}-${li}`))}
          </View>
        );
      })}
    </View>
  );
}

// ───────────────────────── SVG CHARTS ─────────────────────────
// All charts are vector — render crisp at any zoom, ~zero bundle cost (no images).
// Layout convention: width 520 (fits A4 portrait content area ≈523pt at 36pt margins);
// landscape pages get width 760. Caller passes width explicitly.

const CHART_COLORS = {
  wallClock: "#7c3aed", // violet-600
  manHours: "#0891b2", // cyan-600
  axis: "#9ca3af",
  grid: "#e5e7eb",
  text: "#374151",
  textMuted: "#9ca3af",
  prevWallClock: "#c4b5fd", // violet-300 (lighter)
  prevManHours: "#a5f3fc", // cyan-200 (lighter)
  barBg: "#e5e7eb",
};

/** Format a number for axis labels — drop trailing zero. */
function nfmt(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(0);
  return n.toFixed(1).replace(/\.0$/, "");
}

/** Nice-rounded "ceiling" for axis max — e.g. 87 → 100, 23 → 25, 7 → 8. */
function niceMax(raw: number): number {
  if (raw <= 0) return 10;
  if (raw <= 5) return Math.ceil(raw);
  if (raw <= 10) return Math.ceil(raw / 2) * 2;
  if (raw <= 50) return Math.ceil(raw / 5) * 5;
  if (raw <= 100) return Math.ceil(raw / 10) * 10;
  if (raw <= 500) return Math.ceil(raw / 25) * 25;
  return Math.ceil(raw / 50) * 50;
}

/**
 * WeeklyLineChart — wall-clock + man-hours lines for current period,
 * optional dashed lines for previous period (aligned by week INDEX).
 */
function WeeklyLineChart({
  width,
  weeks,
  weekTotals,
  previousWeekTotals,
}: {
  width: number;
  weeks: Array<{ key: string; label: string }>;
  weekTotals: Array<{ key: string; wallClock: number; manHours: number }>;
  previousWeekTotals?: Array<{ key: string; wallClock: number; manHours: number }> | null;
}) {
  const height = 180;
  const padL = 32;
  const padR = 14;
  const padT = 14;
  const padB = 40;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = weeks.length;
  if (n === 0) return null;

  // Compute y-axis max across all visible series
  const allValues: number[] = [];
  weekTotals.forEach((w) => {
    allValues.push(w.wallClock, w.manHours);
  });
  previousWeekTotals?.forEach((w) => {
    allValues.push(w.wallClock, w.manHours);
  });
  const yMax = niceMax(Math.max(...allValues, 1));
  const yToPx = (v: number) => padT + innerH - (v / yMax) * innerH;
  const xToPx = (i: number) => (n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);

  // Build polyline points
  const buildPoints = (values: number[]) =>
    values.map((v, i) => `${xToPx(i).toFixed(1)},${yToPx(v).toFixed(1)}`).join(" ");

  const wcPts = buildPoints(weekTotals.map((w) => w.wallClock));
  const mhPts = buildPoints(weekTotals.map((w) => w.manHours));
  const prevWcPts = previousWeekTotals ? buildPoints(previousWeekTotals.map((w) => w.wallClock)) : null;
  const prevMhPts = previousWeekTotals ? buildPoints(previousWeekTotals.map((w) => w.manHours)) : null;

  // Y-axis ticks (4 gridlines)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  return (
    <View style={{ marginBottom: 12 }}>
      <Svg width={width} height={height}>
        {/* Grid lines + Y labels */}
        {ticks.map((t, i) => {
          const y = yToPx(t);
          return (
            <G key={i}>
              <SvgLine x1={padL} y1={y} x2={padL + innerW} y2={y} stroke={CHART_COLORS.grid} strokeWidth={0.5} />
              <SvgText x={padL - 4} y={y + 3} textAnchor="end" fill={CHART_COLORS.textMuted} style={{ fontSize: 7 }}>
                {nfmt(t)}h
              </SvgText>
            </G>
          );
        })}

        {/* Previous-period lines (dashed, lighter) */}
        {prevWcPts && (
          <Polyline
            points={prevWcPts}
            stroke={CHART_COLORS.prevWallClock}
            strokeWidth={1.2}
            strokeDasharray="3,2"
            fill="none"
          />
        )}
        {prevMhPts && (
          <Polyline
            points={prevMhPts}
            stroke={CHART_COLORS.prevManHours}
            strokeWidth={1.2}
            strokeDasharray="3,2"
            fill="none"
          />
        )}

        {/* Current-period lines */}
        <Polyline points={wcPts} stroke={CHART_COLORS.wallClock} strokeWidth={1.8} fill="none" />
        <Polyline points={mhPts} stroke={CHART_COLORS.manHours} strokeWidth={1.8} fill="none" />

        {/* Dots on current lines */}
        {weekTotals.map((w, i) => (
          <G key={`d-${i}`}>
            <Circle cx={xToPx(i)} cy={yToPx(w.wallClock)} r={2} fill={CHART_COLORS.wallClock} />
            <Circle cx={xToPx(i)} cy={yToPx(w.manHours)} r={2} fill={CHART_COLORS.manHours} />
          </G>
        ))}

        {/* X-axis labels */}
        {weeks.map((w, i) => (
          <SvgText
            key={`x-${i}`}
            x={xToPx(i)}
            y={padT + innerH + 12}
            textAnchor="middle"
            fill={CHART_COLORS.text}
            style={{ fontSize: 7 }}
          >
            {w.label}
          </SvgText>
        ))}

        {/* Value labels above current-period dots (man-hours, since it's typically higher) */}
        {weekTotals.map((w, i) => {
          const top = Math.max(w.wallClock, w.manHours);
          const y = yToPx(top) - 5;
          if (top === 0) return null;
          return (
            <SvgText
              key={`v-${i}`}
              x={xToPx(i)}
              y={y}
              textAnchor="middle"
              fill={CHART_COLORS.text}
              style={{ fontSize: 7, fontWeight: 700 }}
            >
              {top.toFixed(0)}h
            </SvgText>
          );
        })}
      </Svg>
      {/* Legend */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 14, marginTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 10, height: 2, backgroundColor: CHART_COLORS.wallClock }} />
          <Text style={{ fontSize: 7, color: CHART_COLORS.text }}>Wall-clock</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 10, height: 2, backgroundColor: CHART_COLORS.manHours }} />
          <Text style={{ fontSize: 7, color: CHART_COLORS.text }}>Man-hours</Text>
        </View>
        {previousWeekTotals ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 10, height: 2, backgroundColor: CHART_COLORS.prevWallClock }} />
              <Text style={{ fontSize: 7, color: CHART_COLORS.textMuted }}>Wall (prev)</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 10, height: 2, backgroundColor: CHART_COLORS.prevManHours }} />
              <Text style={{ fontSize: 7, color: CHART_COLORS.textMuted }}>Man (prev)</Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

/**
 * HorizontalBarChart — horizontal bars for top-N entities (persons or projects).
 * Each row: name (left) | bar (filled) | total (right). Optional small "previous"
 * bar shown beneath each main bar when previousByName is provided.
 */
function HorizontalBarChart({
  width,
  rows,
  previousByName,
  defaultColor = CHART_COLORS.manHours,
  unit = "h",
}: {
  width: number;
  rows: Array<{ name: string; value: number; color?: string | null }>;
  previousByName?: Map<string, number>;
  defaultColor?: string;
  unit?: string;
}) {
  if (rows.length === 0) return null;
  const rowH = previousByName ? 22 : 16; // extra room when showing prev
  const padTop = 6;
  const padBottom = 4;
  const height = padTop + padBottom + rows.length * rowH;

  // Left zone (labels) ~ 32% of width but capped, right zone (value) 14%.
  const labelW = Math.min(140, width * 0.32);
  const valueW = 40;
  const barAreaX = labelW + 6;
  const barAreaW = width - labelW - valueW - 6;

  // Find max across both current AND previous for consistent scaling.
  const allVals = rows.map((r) => r.value);
  if (previousByName) {
    rows.forEach((r) => {
      const p = previousByName.get(r.name) ?? 0;
      if (p > 0) allVals.push(p);
    });
  }
  const max = Math.max(...allVals, 1);

  return (
    <Svg width={width} height={height}>
      {rows.map((r, idx) => {
        const y = padTop + idx * rowH;
        const barH = previousByName ? 6 : 8;
        const w = (r.value / max) * barAreaW;
        const color = r.color || defaultColor;
        const prevVal = previousByName?.get(r.name) ?? 0;
        const prevW = previousByName ? (prevVal / max) * barAreaW : 0;
        return (
          <G key={r.name}>
            {/* Name */}
            <SvgText
              x={labelW}
              y={y + barH - 1}
              textAnchor="end"
              fill={CHART_COLORS.text}
              style={{ fontSize: 8 }}
            >
              {r.name.length > 24 ? r.name.slice(0, 23) + "…" : r.name}
            </SvgText>
            {/* Track */}
            <Rect x={barAreaX} y={y} width={barAreaW} height={barH} fill={CHART_COLORS.barBg} rx={1} ry={1} />
            {/* Bar */}
            {w > 0 && (
              <Rect x={barAreaX} y={y} width={w} height={barH} fill={color} rx={1} ry={1} />
            )}
            {/* Current value (right) */}
            <SvgText
              x={width}
              y={y + barH - 1}
              textAnchor="end"
              fill={CHART_COLORS.text}
              style={{ fontSize: 8, fontWeight: 700 }}
            >
              {r.value.toFixed(1)}
              {unit}
            </SvgText>
            {/* Previous bar (thinner, lighter, below) */}
            {previousByName && prevVal > 0 && (
              <>
                <Rect
                  x={barAreaX}
                  y={y + barH + 2}
                  width={prevW}
                  height={3}
                  fill={color}
                  fillOpacity={0.35}
                  rx={1}
                  ry={1}
                />
                <SvgText
                  x={width}
                  y={y + barH + 6}
                  textAnchor="end"
                  fill={CHART_COLORS.textMuted}
                  style={{ fontSize: 6 }}
                >
                  prev {prevVal.toFixed(1)}{unit}
                </SvgText>
              </>
            )}
          </G>
        );
      })}
    </Svg>
  );
}

/**
 * ChartCard — visual wrapper with title + subtitle around any chart.
 */
function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View style={s.matrixCard} wrap={false}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

// ───────────────────────── per-project summary cards & detail page ─────────────────────────

// Color resolver — matches the project recap UI (Notion color names → hex).
const PROJECT_COLOR_MAP: Record<string, string> = {
  purple: "#a855f7",
  blue: "#3b82f6",
  green: "#10b981",
  orange: "#f97316",
  pink: "#ec4899",
  red: "#ef4444",
  yellow: "#eab308",
  cyan: "#06b6d4",
};
function resolveProjectColor(c: string | null | undefined): string {
  if (!c) return "#7c3aed";
  if (c.startsWith("#")) return c;
  return PROJECT_COLOR_MAP[c] ?? "#7c3aed";
}

/**
 * ProjectSummaryCards — 2-column grid of mini project cards rendered on the
 * monthly overview page. Each card shows: project name + color dot, total
 * hours (wall-clock), tiny weekly bars sparkline, delta vs previous, and
 * status counts (done/in progress/blocked). Mirrors the Project Recap card
 * stack on the Dashboard but adapted for monthly time frame.
 */
function ProjectSummaryCards({
  projects,
  weeks,
  previousByName,
  breakdowns,
}: {
  projects: MonthlyPdfPayload["projects"];
  weeks: MonthlyPdfPayload["weeks"];
  previousByName?: Map<string, number>;
  breakdowns?: MonthlyPdfPayload["projectBreakdowns"];
}) {
  if (!projects.length) return null;
  const sorted = [...projects].sort((a, b) => b.total - a.total);

  return (
    <View style={s.matrixCard} wrap={false}>
      <Text style={s.sectionTitle}>Project Summary</Text>
      <Text style={s.sectionSub}>
        Each card shows total wall-clock hours, weekly distribution, status mix, and trend vs previous period.
      </Text>
      <View style={s.projSummaryGrid}>
        {sorted.map((p) => {
          const color = resolveProjectColor(p.color);
          const weekVals = weeks.map((w) => p.byWeek[w.key] ?? 0);
          const maxV = Math.max(...weekVals, 0.001);
          const delta = previousByName ? deltaInfo(p.total, previousByName.get(p.name)) : null;
          const stat = breakdowns?.[p.name];
          return (
            <View key={p.name} style={s.projSummaryCard}>
              <View style={s.projSummaryHead}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", flexShrink: 1, paddingRight: 4 }}>
                  <View style={[s.projSummaryDot, { backgroundColor: color }]} />
                  <Text style={s.projSummaryName} numberOfLines={1}>{p.name}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.projSummaryTotal}>{p.total.toFixed(1)}h</Text>
                  <Text style={s.projSummaryTotalSub}>wall-clock</Text>
                </View>
              </View>

              {/* Mini weekly bars */}
              <View style={s.miniBarRow}>
                {weekVals.map((v, i) => {
                  const h = maxV > 0 ? Math.max(1, (v / maxV) * 22) : 1;
                  if (v === 0) return <View key={i} style={s.miniBarEmpty} />;
                  return (
                    <View
                      key={i}
                      style={[s.miniBar, { height: h, backgroundColor: color }]}
                    />
                  );
                })}
              </View>

              {/* Status + delta */}
              {stat ? (
                <Text style={s.projSummaryMeta}>
                  {stat.tasksTotal} tasks · {stat.tasksDone} done · {stat.tasksInProgress} prog · {stat.tasksBlocked} blocked
                </Text>
              ) : null}
              {delta ? (
                <Text
                  style={[
                    s.projSummaryDelta,
                    delta.dir === "up" ? s.kpiDeltaUp : delta.dir === "down" ? s.kpiDeltaDown : s.kpiDeltaFlat,
                  ]}
                >
                  {delta.label
                    ? delta.label
                    : `${delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "•"} ${Math.abs(delta.pct ?? 0).toFixed(0)}% vs prev`}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * ProjectDetailPage — one full A4 page per project. Mirrors the web view at
 * /projects/$projectId but scoped to the monthly date range:
 *   - Hero: name + total hours
 *   - KPI grid: tasks/done/in progress/blocked
 *   - Weekly trend line chart (current ± previous)
 *   - Hours by person (horizontal bars, full duration per assignee)
 *   - Highlights: avg hours per week, peak week, completion rate
 */
function ProjectDetailPage({
  project,
  breakdown,
  weeks,
  previousProject,
  previousBreakdown,
  rangeStart,
  rangeEnd,
  generatedAt,
}: {
  project: MonthlyPdfPayload["projects"][number];
  breakdown: NonNullable<MonthlyPdfPayload["projectBreakdowns"]>[string] | undefined;
  weeks: MonthlyPdfPayload["weeks"];
  previousProject?: MonthlyPdfPayload["projects"][number];
  previousBreakdown?: NonNullable<MonthlyPdfPayload["projectBreakdowns"]>[string];
  rangeStart: string;
  rangeEnd: string;
  generatedAt: string;
}) {
  const color = resolveProjectColor(project.color);
  const tasksTotal = breakdown?.tasksTotal ?? 0;
  const tasksDone = breakdown?.tasksDone ?? 0;
  const tasksInProgress = breakdown?.tasksInProgress ?? 0;
  const tasksBlocked = breakdown?.tasksBlocked ?? 0;
  const completionRate = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0;

  // Highlights: avg hours/week, peak week
  const weekVals = weeks.map((w) => ({ key: w.key, label: w.label, v: project.byWeek[w.key] ?? 0 }));
  const nonZero = weekVals.filter((w) => w.v > 0);
  const avgPerWeek = nonZero.length ? nonZero.reduce((s, w) => s + w.v, 0) / nonZero.length : 0;
  const peakWeek = weekVals.reduce<{ label: string; v: number } | null>(
    (acc, w) => (!acc || w.v > acc.v ? { label: w.label, v: w.v } : acc),
    null,
  );

  // Hours-by-person (man-hours, full duration per assignee).
  const persons = breakdown?.persons ?? [];
  const maxPerson = Math.max(1, ...persons.map((p) => p.total));

  // Non-Project Activities (no relation) — Role/Context replaces person breakdown as primary lens.
  const isUnassigned = project.sourceKind === "unassigned";
  const byRole = (breakdown?.byRole ?? []).map((r) => ({
    ...r,
    pct: project.total ? (r.hours / project.total) * 100 : 0,
  }));
  const byContext = (breakdown?.byContext ?? []).map((c) => ({
    ...c,
    pct: project.total ? (c.hours / project.total) * 100 : 0,
  }));

  // Build week totals series for line chart (project-scoped wall-clock).
  const chartWeekTotals = weeks.map((w) => ({
    key: w.key,
    wallClock: project.byWeek[w.key] ?? 0,
    manHours: (breakdown?.persons ?? []).reduce((s, p) => s + (p.byWeek[w.key] ?? 0), 0),
  }));
  const prevChartWeekTotals = previousProject
    ? weeks.map((w, i) => ({
        key: w.key,
        wallClock: previousProject.byWeek[Object.keys(previousProject.byWeek)[i] ?? ""] ?? 0,
        manHours: (previousBreakdown?.persons ?? []).reduce(
          (s, p) => s + (p.byWeek[Object.keys(p.byWeek)[i] ?? ""] ?? 0),
          0,
        ),
      }))
    : null;

  const delta = previousProject ? deltaInfo(project.total, previousProject.total) : null;

  return (
    <Page size="A4" style={s.page}>
      <Header start={rangeStart} end={rangeEnd} generatedAt={generatedAt} />

      {/* Hero */}
      <View style={s.projDetailHero}>
        <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color, marginRight: 8 }} />
          <View style={{ flexShrink: 1 }}>
            <Text style={s.projDetailName}>{project.name}</Text>
            <Text style={s.projDetailRange}>
              Project detail · {fmtDateRange(rangeStart, rangeEnd)}
            </Text>
          </View>
        </View>
        <View>
          <Text style={s.projDetailHours}>{project.total.toFixed(1)}h</Text>
          <Text style={s.projDetailHoursSub}>
            wall-clock
            {delta ? (
              <Text style={delta.dir === "up" ? s.kpiDeltaUp : delta.dir === "down" ? s.kpiDeltaDown : s.kpiDeltaFlat}>
                {"  "}
                {delta.label
                  ? delta.label
                  : `${delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "•"} ${Math.abs(delta.pct ?? 0).toFixed(0)}%`}
              </Text>
            ) : null}
          </Text>
        </View>
      </View>

      {/* KPI grid */}
      <View style={s.kpiRow}>
        <View style={s.kpiBox}>
          <Text style={s.kpiLabel}>Total Tasks</Text>
          <Text style={s.kpiValue}>{tasksTotal}</Text>
        </View>
        <View style={s.kpiBox}>
          <Text style={s.kpiLabel}>Done</Text>
          <Text style={s.kpiValue}>{tasksDone}</Text>
        </View>
        <View style={s.kpiBox}>
          <Text style={s.kpiLabel}>In Progress</Text>
          <Text style={s.kpiValue}>{tasksInProgress}</Text>
        </View>
        <View style={s.kpiBox}>
          <Text style={s.kpiLabel}>Blocked</Text>
          <Text style={s.kpiValue}>{tasksBlocked}</Text>
        </View>
      </View>

      {/* Highlights */}
      <View style={s.highlightRow}>
        <View style={s.highlightBox}>
          <Text style={s.highlightLabel}>Avg per active week</Text>
          <Text style={s.highlightValue}>{avgPerWeek.toFixed(1)}h</Text>
          <Text style={s.highlightSub}>{nonZero.length} of {weeks.length} weeks active</Text>
        </View>
        <View style={s.highlightBox}>
          <Text style={s.highlightLabel}>Peak week</Text>
          <Text style={s.highlightValue}>{peakWeek && peakWeek.v > 0 ? `${peakWeek.v.toFixed(1)}h` : "—"}</Text>
          <Text style={s.highlightSub}>{peakWeek && peakWeek.v > 0 ? peakWeek.label : "no activity"}</Text>
        </View>
        <View style={s.highlightBox}>
          <Text style={s.highlightLabel}>Completion rate</Text>
          <Text style={s.highlightValue}>{completionRate}%</Text>
          <Text style={s.highlightSub}>{tasksDone}/{tasksTotal} tasks</Text>
        </View>
        <View style={s.highlightBox}>
          <Text style={s.highlightLabel}>Contributors</Text>
          <Text style={s.highlightValue}>{persons.length}</Text>
          <Text style={s.highlightSub}>{persons[0] ? `top: ${persons[0].name}` : "—"}</Text>
        </View>
      </View>

      {/* Weekly trend line chart */}
      {chartWeekTotals.some((w) => w.wallClock > 0 || w.manHours > 0) ? (
        <ChartCard
          title="Weekly Trend"
          subtitle="Solid = wall-clock and man-hours for this project across the period."
        >
          <WeeklyLineChart
            width={523}
            weeks={weeks}
            weekTotals={chartWeekTotals}
            previousWeekTotals={prevChartWeekTotals}
          />
        </ChartCard>
      ) : null}

      {/* Role / Context breakdown — Non-Project Activities only */}
      {isUnassigned && (byRole.length > 0 || byContext.length > 0) ? (
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
          <View style={{ flex: 1, border: "1pt solid #ddd", borderRadius: 4, padding: 10 }}>
            <Text style={s.sectionTitle}>By Role</Text>
            {byRole.map((r) => (
              <View key={r.label} style={s.personRow}>
                <Text style={s.personName} numberOfLines={1}>{r.label}</Text>
                <View style={s.personBarTrack}>
                  <View style={[s.personBarFill, { width: `${Math.min(100, r.pct).toFixed(1)}%` as any, backgroundColor: color }]} />
                </View>
                <Text style={s.personHrs}>{r.hours.toFixed(1)}h</Text>
                <Text style={s.personShare}>{r.pct.toFixed(0)}%</Text>
              </View>
            ))}
          </View>
          <View style={{ flex: 1, border: "1pt solid #ddd", borderRadius: 4, padding: 10 }}>
            <Text style={s.sectionTitle}>By Context</Text>
            {byContext.map((c) => (
              <View key={c.label} style={s.personRow}>
                <Text style={s.personName} numberOfLines={1}>{c.label}</Text>
                <View style={s.personBarTrack}>
                  <View style={[s.personBarFill, { width: `${Math.min(100, c.pct).toFixed(1)}%` as any, backgroundColor: color }]} />
                </View>
                <Text style={s.personHrs}>{c.hours.toFixed(1)}h</Text>
                <Text style={s.personShare}>{c.pct.toFixed(0)}%</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Hours by person */}
      {persons.length > 0 ? (
        <View style={s.matrixCard} wrap={false}>
          <Text style={s.sectionTitle}>Hours by Person</Text>
          <Text style={s.sectionSub}>
            Man-hours per contributor on this project. Co-assigned tasks credit each person the full duration.
          </Text>
          {persons.map((p) => {
            const pct = (p.total / maxPerson) * 100;
            const share = project.total > 0 ? (p.total / project.total) * 100 : 0;
            return (
              <View key={p.name} style={s.personRow}>
                <Text style={s.personName} numberOfLines={1}>{p.name}</Text>
                <View style={s.personBarTrack}>
                  <View style={[s.personBarFill, { width: `${pct.toFixed(1)}%` as any, backgroundColor: color }]} />
                </View>
                <Text style={s.personHrs}>{p.total.toFixed(1)}h</Text>
                <Text style={s.personShare}>{share.toFixed(0)}%</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <Footer />
    </Page>
  );
}

// ───────────────────────── main Document ─────────────────────────

export type MonthlyPdfPayload = {
  range: { start: string; end: string };
  weeks: Array<{ key: string; label: string; weekStart: string; weekEnd: string }>;
  persons: Array<{ name: string; byWeek: Record<string, number>; total: number }>;
  projects: Array<{
    name: string;
    color: string | null;
    sourceKind?: string;
    byWeek: Record<string, number>;
    total: number;
  }>;
  /** Per-project contributor breakdown (key = project name). */
  projectBreakdowns?: Record<
    string,
    {
      persons: Array<{ name: string; byWeek: Record<string, number>; total: number }>;
      tasksDone: number;
      tasksInProgress: number;
      tasksBlocked: number;
      tasksTotal: number;
      byRole?: Array<{ label: string; hours: number }>;
      byContext?: Array<{ label: string; hours: number }>;
    }
  >;
  weekTotals: Array<{ key: string; wallClock: number; manHours: number; tasks: number }>;
  grandTotals: { wallClock: number; manHours: number; tasks: number };
  previous: {
    range: { start: string; end: string };
    weeks: Array<{ key: string; label: string; weekStart: string; weekEnd: string }>;
    persons: Array<{ name: string; byWeek: Record<string, number>; total: number }>;
    projects: Array<{
      name: string;
      color: string | null;
      byWeek: Record<string, number>;
      total: number;
    }>;
    projectBreakdowns?: Record<
      string,
      {
        persons: Array<{ name: string; byWeek: Record<string, number>; total: number }>;
        tasksDone: number;
        tasksInProgress: number;
        tasksBlocked: number;
        tasksTotal: number;
      }
    >;
    weekTotals: Array<{ key: string; wallClock: number; manHours: number; tasks: number }>;
    grandTotals: { wallClock: number; manHours: number; tasks: number };
  } | null;
  insights?: string | null;
};

export function MonthlyReportDocument({ data }: { data: MonthlyPdfPayload }) {
  const generatedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";

  const hasCompare = !!data.previous;

  // Build previous-by-name maps for delta lookups
  const prevPersonTotal = new Map<string, number>();
  if (data.previous) for (const p of data.previous.persons) prevPersonTotal.set(p.name, p.total);
  const prevProjectTotal = new Map<string, number>();
  if (data.previous) for (const p of data.previous.projects) prevProjectTotal.set(p.name, p.total);

  return (
    <Document>
      {/* ─── Page 1: Overview ─── */}
      <Page size="A4" style={s.page}>
        <Header start={data.range.start} end={data.range.end} generatedAt={generatedAt} />

        {/* Comparison band */}
        {hasCompare && data.previous ? (
          <View style={s.bandRow}>
            <View style={s.bandDotSolid} />
            <Text style={s.bandText}>
              {data.range.start} → {data.range.end}
            </Text>
            <Text style={s.bandLabel}>CURRENT</Text>
            <Text style={s.bandSep}>vs</Text>
            <View style={s.bandDotOutline} />
            <Text style={s.bandText}>
              {data.previous.range.start} → {data.previous.range.end}
            </Text>
            <Text style={s.bandLabel}>PREVIOUS</Text>
          </View>
        ) : null}

        {/* KPI row */}
        <View style={s.kpiRow}>
          <KpiBox
            label="Wall-clock"
            value={data.grandTotals.wallClock}
            unit="h"
            previousValue={data.previous?.grandTotals.wallClock}
          />
          <KpiBox
            label="Man-hours"
            value={data.grandTotals.manHours}
            unit="h"
            previousValue={data.previous?.grandTotals.manHours}
          />
          <KpiBox
            label="Tasks"
            value={data.grandTotals.tasks}
            previousValue={data.previous?.grandTotals.tasks}
          />
          <KpiBox
            label="Weeks"
            value={data.weeks.length}
            previousValue={data.previous?.weeks.length}
          />
        </View>

        {/* Visual: Weekly totals line chart (always shown when data exists) */}
        {data.weekTotals.length > 0 ? (
          <ChartCard
            title="Weekly Totals — Trend"
            subtitle={
              hasCompare
                ? "Solid = current period · Dashed = previous period (aligned by week index)."
                : "Hours per week across this date range."
            }
          >
            <WeeklyLineChart
              width={523}
              weeks={data.weeks}
              weekTotals={data.weekTotals}
              previousWeekTotals={data.previous?.weekTotals ?? null}
            />
          </ChartCard>
        ) : null}

        {/* Side-by-side weekly when compare ON */}
        {hasCompare && data.previous ? (
          <SideBySideWeekly
            currentWeeks={data.weeks}
            currentTotals={data.weekTotals}
            previousWeeks={data.previous.weeks}
            previousTotals={data.previous.weekTotals}
          />
        ) : null}

        {/* AI Insights (rendered on overview page if it fits) */}
        {data.insights ? <AiInsightsBlock markdown={data.insights} /> : null}

        {/* Per-project summary cards */}
        <ProjectSummaryCards
          projects={data.projects}
          weeks={data.weeks}
          previousByName={hasCompare ? prevProjectTotal : undefined}
          breakdowns={data.projectBreakdowns}
        />

        <Footer />
      </Page>

      {/* ─── Page 2: Person × Week ─── */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Header start={data.range.start} end={data.range.end} generatedAt={generatedAt} />

        {/* Visual: Person ranking bar chart (top 8) */}
        {data.persons.length > 0 ? (
          <ChartCard
            title="Top People by Man-hours"
            subtitle={
              hasCompare
                ? "Bars sorted by current period. Thin lighter bar below = previous period."
                : "Sorted highest to lowest. Each task credits assignees their full duration."
            }
          >
            <HorizontalBarChart
              width={760}
              rows={data.persons.slice(0, 8).map((p) => ({ name: p.name, value: p.total }))}
              previousByName={hasCompare ? prevPersonTotal : undefined}
            />
          </ChartCard>
        ) : null}

        <MatrixTable
          title="Person × Week"
          subtitle="Man-hours per person. Co-assigned tasks credit each collaborator the full duration."
          leftHeader="Team"
          weeks={data.weeks}
          rows={data.persons.map((p) => ({
            name: p.name,
            byWeek: p.byWeek,
            total: p.total,
            previousTotal: hasCompare ? (prevPersonTotal.get(p.name) ?? 0) : undefined,
          }))}
          weekTotals={data.weekTotals.map((w) => ({ key: w.key, total: w.manHours }))}
          grandTotal={data.grandTotals.manHours}
          hasCompare={hasCompare}
        />

        {/* If compare ON, also include the previous-period matrix immediately below */}
        {hasCompare && data.previous ? (
          <MatrixTable
            title="Person × Week — Previous Period"
            subtitle={`${data.previous.range.start} → ${data.previous.range.end}`}
            leftHeader="Team"
            weeks={data.previous.weeks}
            rows={data.previous.persons.map((p) => ({
              name: p.name,
              byWeek: p.byWeek,
              total: p.total,
            }))}
            weekTotals={data.previous.weekTotals.map((w) => ({ key: w.key, total: w.manHours }))}
            grandTotal={data.previous.grandTotals.manHours}
            hasCompare={false}
          />
        ) : null}

        <Footer />
      </Page>

      {/* ─── Page 3: Project × Week ─── */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Header start={data.range.start} end={data.range.end} generatedAt={generatedAt} />

        {/* Visual: Project ranking bar chart (top 8, uses each project's brand color) */}
        {data.projects.length > 0 ? (
          <ChartCard
            title="Top Projects by Wall-clock Hours"
            subtitle={
              hasCompare
                ? "Bars use each project's brand color. Lighter bar below = previous period."
                : "Sorted highest to lowest. Each task counted once regardless of assignees."
            }
          >
            <HorizontalBarChart
              width={760}
              rows={data.projects.slice(0, 8).map((p) => ({
                name: p.name,
                value: p.total,
                color: p.color ?? undefined,
              }))}
              previousByName={hasCompare ? prevProjectTotal : undefined}
            />
          </ChartCard>
        ) : null}

        <MatrixTable
          title="Project × Week"
          subtitle="Wall-clock hours per project. Each task counted once even if multiple people worked on it."
          leftHeader="Project"
          weeks={data.weeks}
          rows={data.projects.map((p) => ({
            name: p.name,
            byWeek: p.byWeek,
            total: p.total,
            previousTotal: hasCompare ? (prevProjectTotal.get(p.name) ?? 0) : undefined,
          }))}
          weekTotals={data.weekTotals.map((w) => ({ key: w.key, total: w.wallClock }))}
          grandTotal={data.grandTotals.wallClock}
          hasCompare={hasCompare}
        />

        {hasCompare && data.previous ? (
          <MatrixTable
            title="Project × Week — Previous Period"
            subtitle={`${data.previous.range.start} → ${data.previous.range.end}`}
            leftHeader="Project"
            weeks={data.previous.weeks}
            rows={data.previous.projects.map((p) => ({
              name: p.name,
              byWeek: p.byWeek,
              total: p.total,
            }))}
            weekTotals={data.previous.weekTotals.map((w) => ({ key: w.key, total: w.wallClock }))}
            grandTotal={data.previous.grandTotals.wallClock}
            hasCompare={false}
          />
        ) : null}

        <Footer />
      </Page>

      {/* ─── Pages 4..N: One detail page per project ─── */}
      {data.projects.map((proj) => {
        const breakdown = data.projectBreakdowns?.[proj.name];
        const previousProject = data.previous?.projects.find((p) => p.name === proj.name);
        const previousBreakdown = data.previous?.projectBreakdowns?.[proj.name];
        return (
          <ProjectDetailPage
            key={proj.name}
            project={proj}
            breakdown={breakdown}
            weeks={data.weeks}
            previousProject={previousProject}
            previousBreakdown={previousBreakdown}
            rangeStart={data.range.start}
            rangeEnd={data.range.end}
            generatedAt={generatedAt}
          />
        );
      })}
    </Document>
  );
}

export async function downloadMonthlyReport(payload: MonthlyPdfPayload) {
  const blob = await pdf(<MonthlyReportDocument data={payload} />).toBlob();
  const fname = `monthly-report-${payload.range.start}-to-${payload.range.end}${payload.previous ? "-compared" : ""}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
