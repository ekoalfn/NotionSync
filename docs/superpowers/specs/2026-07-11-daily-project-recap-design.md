# Daily Project Recap — Design

Date: 2026-07-11
Status: Approved (pending spec review)

## Goal

Add a **daily project recap** table to the weekly dashboard (`index.tsx`), matching the reference
image: per weekday, list each active project with a **Target** (daily) and **Actual** (hours logged
that day). Each project gains a **daily target** that is either entered manually or derived
automatically from its weekly target.

## Reference (from image)

```
▾ Week 2 Juli
Date              Project    Target   Actual
Senin - 6 Juli    Candid     4 Jam    1 Jam
                  Axxo       5 Jam    2 Jam
                  React      4 Jam    5 Jam
Selasa - 7 Juli   Candid8    4 Jam    2 Jam 10 Menit
...
```

- Days are Indonesian, Monday-first: "Senin - 6 Juli".
- Actual formatted as "X Jam Y Menit" (minutes omitted when 0 → "5 Jam").
- Per day, only projects with a target or actual > 0 appear (ringkas).

## Decisions (locked)

| Question | Decision |
|---|---|
| Auto daily target divisor | Configurable `workdays_per_week` in Settings, default **5** |
| Manual target granularity | **One value per project** (`target_hours_per_day`), same every day |
| Table location | **Dashboard weekly** (`_authenticated/index.tsx`) |
| Row filter | Only rows where target > 0 **or** actual > 0 that day |

## Target-daily formula

```
targetDaily(project) =
  project.target_hours_per_day        // manual, if set (not null)
  ?? (project.target_hours_per_week != null
        ? project.target_hours_per_week / workdaysPerWeek
        : null)                       // no weekly target → no daily target
```

Manual value wins. Empty manual + weekly set → auto. Neither → null (row hidden unless actual > 0).

## Data model

1. **Migration** `supabase/migrations/<ts>_daily_target.sql`:
   ```sql
   ALTER TABLE public.notion_projects
     ADD COLUMN IF NOT EXISTS target_hours_per_day numeric;
   ```
   `null` = auto-derive. No backfill.

2. **Setting** `app_settings.key = 'workdays_per_week'`, value stringified int. Default 5 when absent.
   Reuse the existing capacity-config pattern in `settings.functions.ts`.

## Server changes (`src/lib/`)

### `settings.functions.ts` — capacity config
- Extend `getCapacityConfig` return: add `workdaysPerWeek` (read `workdays_per_week`, default 5, clamp 1..7).
- Extend `setCapacityConfig` input: add `workdaysPerWeek: z.number().int().min(1).max(7)`; upsert the key.
- Keep `normalHoursPerWeek` behavior unchanged (both saved together).

### `notion.functions.ts`
- `updateProjectTarget` input: add `target_hours_per_day: z.number().min(0).max(24).nullable().optional()`.
  Only update the column when the field is present (`!== undefined`) so weekly-only saves don't wipe it.
- `ProjectWeekly` interface: add `targetHoursPerDay: number | null`.
- `WeeklyAggregate` interface: add `workdaysPerWeek: number`.
- `getWeeklyAggregate` handler:
  - Add `target_hours_per_day` to the `notion_projects` select.
  - Read `workdays_per_week` from `app_settings` (one `maybeSingle`), default 5, put on result.
  - Set `targetHoursPerDay: proj.target_hours_per_day ?? null` on each pushed project.
- **No new Notion query.** Daily Actual is derived on the client from the existing
  `project.tasks[]` (`date`, `duration`).

## Client changes

### `src/routes/_authenticated/index.tsx`
- New component `DailyRecapTable({ agg })` rendered below the project cards.
- Build day list: from `agg.weekStart` (Monday, ISO `YYYY-MM-DD`), generate `agg.workdaysPerWeek`
  consecutive days. Label via a small Indonesian formatter (`Senin`, `Selasa`, …, plus `d MMMM`
  using `date-fns` with `id` locale — date-fns already a dep).
- For each day:
  - For each project in `agg.projects`:
    - `actual = Σ task.duration where task.date === dayISO`
    - `target = targetDaily(project)` (formula above, using `agg.workdaysPerWeek`)
    - Skip if `target` falsy/0 **and** `actual === 0`.
  - Render rows; day label spans only its first row (rowSpan or grouped block).
- Hours formatter `fmtJam(hoursDecimal)`:
  - `h = floor(hours)`, `m = round((hours - h) * 60)`; carry if `m === 60`.
  - `"{h} Jam"` + (`m>0` ? ` {m} Menit` : ``); if `h===0 && m>0` → `"{m} Menit"`; if both 0 → `"—"`.
- Styling: follow existing dashboard card/table classes (mono numerals like other cells).

### `src/routes/_authenticated/projects.$projectId.tsx`
- In the existing target modal, add a second input **"Target / hari"** bound to a new
  `dailyInput` state.
- Placeholder shows the computed auto value: `weekly / workdaysPerWeek` (fetch workdays via
  `getCapacityConfig`, or read `agg.workdaysPerWeek` already loaded on this route).
- On save, pass `target_hours_per_day`: empty string → `null` (auto), else parsed number.
  Send alongside `target_hours_per_week` in the same `updateProjectTarget` call.

### `src/routes/_authenticated/settings.tsx`
- In the capacity section, add a **"Hari kerja / minggu"** numeric input (1–7) bound to
  `workdaysPerWeek`, saved through `setCapacityConfig` with the existing normal-hours field.

## Edge cases

- Project with weekly target but 0 tasks a day → target shown, actual "—".
- Actual > 0 but no target (target_hours_per_day null, weekly null) → row shown, target "—".
- `workdaysPerWeek` change instantly re-derives auto daily targets (no stored per-day value).
- Rounding: minutes rounded to nearest; 59.6m→"1 Jam". Keep `duration` decimal internally.
- `unassigned` project row participates like any other (generic aggregation already covers it).

## Testing

- Unit-style self-check for `fmtJam`: `0→"—"`, `4→"4 Jam"`, `2.1667→"2 Jam 10 Menit"`,
  `0.8→"48 Menit"`, `4.99→"4 Jam 59 Menit"`. Add an inline `assert` demo or a tiny `test_*`.
- Manual: set weekly target on a project, verify daily auto = weekly/workdays; set a manual daily,
  verify override; change workdays in Settings, verify auto recompute.

## Out of scope (YAGNI)

- Per-day-of-week targets, per-date overrides, separate Daily route, editing actuals (actuals come
  from Notion), persisting derived daily values.
