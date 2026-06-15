-- Add relation-based project mode so a row in notion_projects can be
-- a Production page + filter on a shared Daily Project data source.
ALTER TABLE public.notion_projects
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'database',
  ADD COLUMN IF NOT EXISTS task_database_id TEXT,
  ADD COLUMN IF NOT EXISTS relation_property TEXT,
  ADD COLUMN IF NOT EXISTS relation_page_id TEXT;

-- Allow same task DB to back many projects (different relation pages).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notion_projects_notion_database_id_key'
  ) THEN
    ALTER TABLE public.notion_projects DROP CONSTRAINT notion_projects_notion_database_id_key;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS notion_projects_db_unique
  ON public.notion_projects (notion_database_id)
  WHERE source_kind = 'database';

CREATE UNIQUE INDEX IF NOT EXISTS notion_projects_relation_unique
  ON public.notion_projects (task_database_id, relation_property, relation_page_id)
  WHERE source_kind = 'relation';
