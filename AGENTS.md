# AGENTS.md

This project's agent/contributor guidance lives in **[CLAUDE.md](./CLAUDE.md)** — single source of
truth for stack, layout, generated-file rules, env, and commands. Read it first.

Quick reference:

- Install: `bun install` · Dev: `bun dev` · Build: `bun run build` · Lint: `bun run lint`
- Don't edit generated files: `routeTree.gen.ts`, `auth-middleware.ts`, `supabase/types.ts`, `components/ui/*`
- Secrets only in `*.server.ts`; read `process.env` inside handlers, not at module scope
- Run `bun run lint` before finishing
