import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Extract first balanced JSON object from a string.
// Handles trailing prose, leading prose, escaped quotes.
function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function safeParseJson<T = any>(raw: string, ctx = "ai"): T | null {
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try { return JSON.parse(cleaned) as T; }
  catch (e) {
    console.warn(`[${ctx}] direct JSON.parse failed: ${(e as Error).message}. raw length=${raw.length}`);
  }
  const slice = extractFirstJsonObject(cleaned);
  if (slice) {
    console.warn(`[${ctx}] balanced-extract sliced ${slice.length}/${cleaned.length} chars`);
    try { return JSON.parse(slice) as T; }
    catch (e) {
      console.error(`[${ctx}] balanced-slice JSON.parse failed: ${(e as Error).message}`);
      console.error(`[${ctx}] slice head: ${slice.slice(0, 200)}`);
      console.error(`[${ctx}] slice tail: ${slice.slice(-200)}`);
    }
  } else {
    console.error(`[${ctx}] no balanced { } object found in cleaned content`);
  }
  console.error(`[${ctx}] raw head: ${raw.slice(0, 300)}`);
  console.error(`[${ctx}] raw tail: ${raw.slice(-300)}`);
  return null;
}

export const generateWeeklyInsights = createServerFn({ method: "POST" })
  .inputValidator(z.object({ weekStart: z.string().optional(), force: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getWeeklyAggregate } = await import("./notion.functions");
    const { getAiConfig, DEFAULT_CONFIG } = await import("./settings.functions");

    const agg = await getWeeklyAggregate({ data: { weekStart: data.weekStart } });

    // Check cache
    if (!data.force) {
      const { data: cached } = await supabaseAdmin
        .from("ai_insights")
        .select("*")
        .eq("week_start", agg.weekStart)
        .eq("scope", "all")
        .maybeSingle();
      if (cached && cached.summary) {
        return {
          summary: cached.summary,
          improvements: cached.improvements ?? "",
          critique: cached.critique ?? "",
          weekStart: agg.weekStart,
          weekEnd: agg.weekEnd,
          cached: true,
        };
      }
    }

    if (agg.projects.length === 0) {
      return {
        summary: "Belum ada project yang ditrack. Tambahkan database Notion di halaman Settings.",
        improvements: "",
        critique: "",
        weekStart: agg.weekStart,
        weekEnd: agg.weekEnd,
        cached: false,
      };
    }

    const payload = {
      week: `${agg.weekStart} → ${agg.weekEnd}`,
      totals: {
        hours: agg.totalHours,
        done: agg.tasksDone,
        in_progress: agg.tasksInProgress,
        blocked: agg.tasksBlocked,
      },
      projects: agg.projects.map((p) => ({
        name: p.name,
        hours: p.totalHours,
        done: p.tasksDone,
        in_progress: p.tasksInProgress,
        blocked: p.tasksBlocked,
        tasks_sample: p.tasks.slice(0, 20).map((t) => ({
          title: t.title,
          status: t.status,
          hours: t.duration,
          assignees: t.assignees,
          properties: t.raw,
        })),
      })),
      per_person: agg.perPerson,
    };

    const systemPrompt = `Kamu adalah Engineering Manager yang melihat data weekly tim. Berikan analisis dalam Bahasa Indonesia yang ringkas, spesifik, dan actionable. Gunakan angka konkret dari data. Hindari basa-basi. Format markdown ringan (bullet boleh).

Output WAJIB JSON valid dengan 3 field bertipe STRING (bukan array, bukan stringified JSON):
- "summary": STRING 2-3 kalimat (achievements + key numbers)
- "improvements": STRING multi-line. Setiap bullet di baris baru, awali dgn "- " (dash + space). 3-4 bullet.
- "critique": STRING multi-line. Format sama spt improvements. 2-3 bullet, sebutkan nama project/person.

JANGAN bungkus value dgn array atau JSON-encoded string. Cukup plain string biasa dgn newline.

Contoh:
{
  "summary": "Tim selesaikan 8 task, 24 jam tercatat...",
  "improvements": "- Validasi durasi saat close task\\n- Assign owner ke task backlog\\n- Rebalance beban Zaeni",
  "critique": "- Distribusi tidak merata...\\n- 4 task Done dgn duration 0..."
}`;

    const cfg = await getAiConfig().catch(() => DEFAULT_CONFIG);
    if (!cfg.apiKey) throw new Error(`API key untuk provider "${cfg.provider}" belum diisi di Settings.`);

    const isAnthropic =
      cfg.provider === "anthropic" ||
      cfg.provider === "custom" ||
      /anthropic\.com/i.test(cfg.baseUrl);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let url: string;
    let body: any;

    if (isAnthropic) {
      headers["x-api-key"] = cfg.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      url = `${cfg.baseUrl.replace(/\/$/, "")}/messages`;
      body = {
        model: cfg.model,
        max_tokens: 2048,
        system: `${systemPrompt}\n\nBalas HANYA JSON valid (tanpa markdown fence).`,
        messages: [
          { role: "user", content: `Data weekly tim:\n\n${JSON.stringify(payload, null, 2)}` },
        ],
      };
    } else {
      headers["Authorization"] = `Bearer ${cfg.apiKey}`;
      if (cfg.provider === "openrouter") {
        headers["X-Title"] = "NowTrack — Inowtech PM Hub";
      }
      url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
      body = {
        model: cfg.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Data weekly tim:\n\n${JSON.stringify(payload, null, 2)}` },
        ],
        response_format: { type: "json_object" },
      };
    }

    console.log(`[ai/weekly] provider=${cfg.provider} model=${cfg.model} url=${url} isAnthropic=${isAnthropic}`);
    const t0 = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    console.log(`[ai/weekly] response status=${res.status} elapsed=${Date.now() - t0}ms`);

    if (!res.ok) {
      const text = await res.text();
      console.error(`[ai/weekly] error body: ${text.slice(0, 500)}`);
      if (res.status === 429) throw new Error("Rate limit. Coba lagi sebentar.");
      if (res.status === 402) throw new Error("Kredit AI workspace habis. Tambahkan di Settings → Workspace → Usage.");
      throw new Error(`AI error ${res.status}: ${text.slice(0, 300)}`);
    }

    const rawBody = await res.text();
    console.log(`[ai/weekly] body length=${rawBody.length} head=${rawBody.slice(0, 200)}`);
    const json: any = safeParseJson(rawBody, "ai/weekly:body") ?? {};
    console.log(`[ai/weekly] json keys: ${Object.keys(json).join(",")} stop_reason=${json.stop_reason ?? json.choices?.[0]?.finish_reason ?? "?"}`);
    let content: string;
    if (isAnthropic) {
      content =
        Array.isArray(json.content)
          ? json.content.map((b: any) => b.text ?? "").join("")
          : json.content?.text ?? "{}";
      console.log(`[ai/weekly] anthropic content blocks=${Array.isArray(json.content) ? json.content.length : "n/a"} text length=${content.length}`);
    } else {
      content = json.choices?.[0]?.message?.content ?? "{}";
      console.log(`[ai/weekly] openai-compat content length=${content.length}`);
    }
    type InsightShape = {
      summary?: unknown;
      improvements?: unknown;
      critique?: unknown;
    };
    const parsed =
      safeParseJson<InsightShape>(content, "ai/weekly") ??
      ((): InsightShape => {
        console.warn("[ai/weekly] fallback → wrap full content as summary (no JSON extracted)");
        return { summary: content };
      })();

    const normalize = (v: unknown): string => {
      if (v == null) return "";
      if (typeof v === "string") {
        // Sometimes model emits stringified JSON array.
        const t = v.trim();
        if (t.startsWith("[") && t.endsWith("]")) {
          try {
            const arr = JSON.parse(t);
            if (Array.isArray(arr)) return arr.map((x) => `- ${String(x).trim()}`).join("\n");
          } catch {/* fall through */}
        }
        return v;
      }
      if (Array.isArray(v)) return v.map((x) => `- ${String(x).trim()}`).join("\n");
      if (typeof v === "object") return JSON.stringify(v, null, 2);
      return String(v);
    };

    const out = {
      summary: normalize(parsed.summary),
      improvements: normalize(parsed.improvements),
      critique: normalize(parsed.critique),
    };

    await supabaseAdmin.from("ai_insights").upsert({
      week_start: agg.weekStart,
      scope: "all",
      ...out,
    }, { onConflict: "week_start,scope" });

    return { ...out, weekStart: agg.weekStart, weekEnd: agg.weekEnd, cached: false };
  });