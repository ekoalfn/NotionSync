# memory.md

Running project memory — non-obvious decisions and context not derivable from code or git log.
Append as you learn. Newest on top.

## Architecture decisions

- **AI provider is DB-configured, not env.** Chosen so admins swap models/keys via Settings UI
  without redeploy. `ai.functions.ts` / `chat.functions.ts` branch on provider (Anthropic vs
  OpenAI-compat) by inspecting provider string + baseUrl.
- **Notion token DB-first, env fallback.** Same reason — rotate without redeploy. Env only for first boot.
- **"unassigned" activities as a normal project row** (`source_kind='unassigned'`, singleton). Keeps
  all aggregation/PDF/AI code generic — no branching except the source query.
- **totalHours (wall-clock) vs manHours (per-person sum)** are deliberately separate metrics. Don't merge.
- **Lovable-generated project.** `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`; several
  files are generated (see CLAUDE.md). Regenerating overwrites hand-edits.

## Watch out

- `server.ts` normalizes h3's swallowed SSR 500s (`{"unhandled":true,"message":"HTTPError"}`) into a
  real error page. If SSR errors look wrong, check `error-capture.ts` + `error-page.ts`.
- Two migration dirs: `supabase/migrations/` (canonical) and `supabase-migrations/` (older manual).

## TODO / open

- (add as they come up)
