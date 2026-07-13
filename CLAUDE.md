# CLAUDE.md

Guidance for AI agents (Claude Code, etc.) working in this repo. Human-readable too.

## What this is

**NowTrack** (`nowtrack`) — Inowtech PM Hub. Pulls task data from **Notion** databases and turns
it into weekly/monthly recaps, time tracking, per-person man-hours, and AI insights. Installable PWA.

Product surface (routes under `src/routes/`):

- `_authenticated/index.tsx` — dashboard / weekly recap
- `_authenticated/monthly.tsx` — monthly report (+ PDF export)
- `_authenticated/ai-insights.tsx` — LLM-generated summaries
- `_authenticated/projects*.tsx` — projects list + detail
- `_authenticated/team*.tsx` — team + per-person view
- `_authenticated/settings.tsx` — Notion token, AI provider, capacity
- `auth.tsx`, `reset-password.tsx` — Supabase auth
- `api/public/notion-webhook.ts` — Notion webhook receiver

## Stack

- **TanStack Start** (SSR via `@tanstack/react-start`) + **React 19** + **Vite 7**
- **Tailwind v4** + **shadcn/ui** (`src/components/ui/`, generated — don't hand-edit)
- **Supabase** — auth, Postgres, RLS (`src/integrations/supabase/`)
- **Notion API** (`Notion-Version: 2025-09-03`)
- **PWA** (`vite-plugin-pwa`), **PDF** (`@react-pdf/renderer`)
- Package manager: **bun** (`bun.lock`) — `pnpm-lock.yaml` also present. Prefer bun.
- Deploy: Nitro `node-server` preset.

## Layout that matters

```
src/
  lib/
    *.functions.ts     server fns (createServerFn) — client-callable RPC
    *.server.ts        server-ONLY (secrets); .server suffix keeps it out of client bundle
    ai.functions.ts    LLM call, provider-agnostic (Anthropic + OpenAI-compat)
    chat.functions.ts  FloatingChat backend
    notion.functions.ts  Notion → weekly/monthly aggregation (largest file)
    notion.server.ts   Notion HTTP client + token resolution + NotionTask types
    settings.functions.ts  read/write app_settings
  integrations/supabase/
    client.ts          browser client (anon key)
    client.server.ts   supabaseAdmin — SERVICE ROLE, bypasses RLS, server only
    auth-middleware.ts  requireSupabaseAuth (GENERATED — do not edit)
    types.ts           generated DB types
  routes/              file-based routing; routeTree.gen.ts is GENERATED
  server.ts            SSR entry + catastrophic-error normalization
supabase/migrations/   canonical DB migrations
supabase-migrations/   older manual migrations (001_manual_time_entries.sql)
vite.config.ts         uses @lovable.dev/vite-tanstack-config — read the header comment
```

## Rules / gotchas

- **Never edit generated files**: `routeTree.gen.ts`, `auth-middleware.ts`, `integrations/supabase/types.ts`, `src/components/ui/*`.
- **`vite.config.ts`**: the lovable config already bundles tanstackStart, viteReact, tailwind, tsConfigPaths, nitro, `@` alias. Do NOT re-add them — duplicate plugins break the app.
- **Env access**: env binds per-request. Read `process.env` INSIDE handlers, never at module scope. `VITE_*` = public (ships to browser, no secrets). See `src/lib/config.server.ts`.
- **Secrets**: only in `*.server.ts` files. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — server only, never log, never send to client.
- **Notion token**: resolved DB-first (`app_settings.key='notion_token'`, rotatable via Settings UI), env `NOTION_INTEGRATION_TOKEN` is first-boot fallback only.
- **AI provider**: configurable at runtime (stored in DB, not env). Detects Anthropic vs OpenAI-compat by provider/baseUrl. Adds `anthropic-version` header for Anthropic.
- **"unassigned" project**: `notion_projects.source_kind='unassigned'` = Non-Project Activities bucket (tasks with no project relation). Singleton (unique index). Downstream aggregation is generic — don't special-case it.
- **totalHours vs manHours**: wall-clock (each task once) vs sum of per-assignee contributions. Keep the distinction.

## DB tables

`notion_projects`, `ai_insights`, `sync_state`, `app_settings`, `chat_threads`, `chat_messages`, `profiles`, `user_roles`.

## Commands

```bash
bun dev            # vite dev
bun run build      # vite build (bun build is different — use run)
bun run lint       # eslint
bun run format     # prettier
```

## Env

Copy `.env.example` → `.env`. Keys: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NOTION_INTEGRATION_TOKEN` (optional), `NODE_ENV`, `PUBLIC_APP_URL`.

## Before you finish

Run `bun run lint`. UI text is Indonesian in places (`lang: id`) — match existing language per surface.
