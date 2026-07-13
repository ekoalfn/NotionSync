-- Per-project daily target (hours). NULL = auto-derive from
-- target_hours_per_week / workdays_per_week (see app_settings). A manual value
-- here overrides the derived one. Used by the Daily Project Recap table.
ALTER TABLE public.notion_projects
  ADD COLUMN IF NOT EXISTS target_hours_per_day numeric;
