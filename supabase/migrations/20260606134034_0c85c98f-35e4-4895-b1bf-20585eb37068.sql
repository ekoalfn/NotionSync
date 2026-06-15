
-- Projects table: stores which Notion databases are tracked as projects
CREATE TABLE public.notion_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notion_database_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'purple',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notion_projects TO anon, authenticated;
GRANT ALL ON public.notion_projects TO service_role;
ALTER TABLE public.notion_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access for now" ON public.notion_projects FOR ALL USING (true) WITH CHECK (true);

-- Cache for AI insights per week
CREATE TABLE public.ai_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all',
  summary TEXT,
  improvements TEXT,
  critique TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, scope)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insights TO anon, authenticated;
GRANT ALL ON public.ai_insights TO service_role;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access for now" ON public.ai_insights FOR ALL USING (true) WITH CHECK (true);

-- Cache invalidation marker (touched by Notion webhook)
CREATE TABLE public.sync_state (
  id INT PRIMARY KEY DEFAULT 1,
  last_sync TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.sync_state (id) VALUES (1);

GRANT SELECT, INSERT, UPDATE ON public.sync_state TO anon, authenticated;
GRANT ALL ON public.sync_state TO service_role;
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access for now" ON public.sync_state FOR ALL USING (true) WITH CHECK (true);
