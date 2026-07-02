import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const AI_PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    requiresKey: true,
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
    defaultModel: "anthropic/claude-3.5-sonnet",
    models: [
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3.7-sonnet",
      "openai/gpt-4o-mini",
      "google/gemini-2.5-flash",
      "deepseek/deepseek-chat",
      "meta-llama/llama-3.3-70b-instruct",
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1",
    requiresKey: true,
    defaultModel: "claude-3-5-sonnet-latest",
    models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    requiresKey: true,
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  },
  {
    id: "custom",
    label: "Custom (Anthropic-compatible)",
    baseUrl: "https://api.anthropic.com/v1",
    requiresKey: true,
    defaultModel: "",
    models: [],
  },
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"];

export const DEFAULT_CONFIG = {
  provider: "openai" as AiProviderId,
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

const KEYS = ["ai_provider", "ai_base_url", "ai_api_key", "ai_model"] as const;

export const getAiConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("key,value")
    .in("key", KEYS as unknown as string[]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const provider = (map.get("ai_provider") as AiProviderId) || DEFAULT_CONFIG.provider;
  const preset = AI_PROVIDERS.find((p) => p.id === provider) ?? AI_PROVIDERS[0];
  return {
    provider,
    baseUrl: map.get("ai_base_url") || preset.baseUrl,
    apiKey: map.get("ai_api_key") || "",
    model: map.get("ai_model") || preset.defaultModel || DEFAULT_CONFIG.model,
  };
});

export const setAiConfig = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      provider: z.enum(["openai", "openrouter", "anthropic", "groq", "custom"]),
      baseUrl: z.string().url().max(300),
      apiKey: z.string().max(500).optional().default(""),
      model: z.string().min(1).max(120),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const rows = [
      { key: "ai_provider", value: data.provider, updated_at: now },
      { key: "ai_base_url", value: data.baseUrl, updated_at: now },
      { key: "ai_api_key", value: data.apiKey ?? "", updated_at: now },
      { key: "ai_model", value: data.model, updated_at: now },
    ];
    const { error } = await supabaseAdmin.from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAiModels = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      provider: z.enum(["openai", "openrouter", "anthropic", "groq", "custom"]),
      baseUrl: z.string().url().max(300),
      apiKey: z.string().max(500).optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const key = data.apiKey;
    if (!key) throw new Error("API key kosong — isi dulu untuk fetch daftar model.");

    // Anthropic + custom (Anthropic-compatible) use x-api-key + anthropic-version
    if (
      data.provider === "anthropic" ||
      data.provider === "custom" ||
      /anthropic\.com/i.test(data.baseUrl)
    ) {
      headers["x-api-key"] = key;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${key}`;
    }

    const url = `${data.baseUrl.replace(/\/$/, "")}/models`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gagal fetch models (${res.status}): ${text.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const list: any[] = json.data ?? json.models ?? json ?? [];
    const models = list
      .map((m) => (typeof m === "string" ? m : m.id ?? m.name ?? m.model))
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .sort();
    return { models, source: "live" as const };
  });
// ─────────────────────────────────────────────────────────────────────────────
// Capacity config — "normal hours per week" used for capacity utilization %.
// Stored as a single key in app_settings; default 42 (5×8h-30min lunch).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_NORMAL_HOURS = 42;

export const getCapacityConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("key,value")
    .eq("key", "normal_hours_per_week")
    .maybeSingle();
  const raw = data?.value;
  const n = raw ? Number(raw) : NaN;
  const normalHoursPerWeek = Number.isFinite(n) && n > 0 ? n : DEFAULT_NORMAL_HOURS;
  return { normalHoursPerWeek };
});

export const setCapacityConfig = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      // Sane bounds: 1h..168h (a week max). Caller can pick anything in between.
      normalHoursPerWeek: z.number().min(1).max(168),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_settings").upsert(
      {
        key: "normal_hours_per_week",
        value: String(data.normalHoursPerWeek),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, normalHoursPerWeek: data.normalHoursPerWeek };
  });
