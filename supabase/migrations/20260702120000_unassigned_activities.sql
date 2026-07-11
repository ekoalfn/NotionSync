-- "Non-Project Activities" bucket: tasks on the shared Daily Project data
-- source with NO relation set (Tasking, Reviewing, Client Comm, etc). Modeled
-- as a normal notion_projects row with source_kind = 'unassigned' so all
-- downstream aggregation/PDF/AI logic (already generic per-project) picks it
-- up with no extra branching beyond the query itself. Only one such row makes
-- sense (the filter is always "relation is empty"), so cap it at 1.
CREATE UNIQUE INDEX IF NOT EXISTS notion_projects_unassigned_singleton
  ON public.notion_projects ((true))
  WHERE source_kind = 'unassigned';
