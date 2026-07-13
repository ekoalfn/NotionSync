-- Manual per-row notes for the Daily Project Recap table. One note per
-- (date, project). Empty note = row deleted. Follows the same open-RLS pattern
-- as the other app tables for now.
CREATE TABLE IF NOT EXISTS public.daily_notes (
  date date NOT NULL,
  project_id uuid NOT NULL REFERENCES public.notion_projects(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, project_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_notes TO anon, authenticated;
GRANT ALL ON public.daily_notes TO service_role;
ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access for now" ON public.daily_notes FOR ALL USING (true) WITH CHECK (true);
