import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageSkeleton } from "@/components/PageSkeleton";
import { getWeeklyAggregate } from "@/lib/notion.functions";
import { Pager, usePager } from "@/components/Pager";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsPage,
});

function ProjectsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProjectsContent />
    </Suspense>
  );
}

function ProjectsContent() {
  const fetchAgg = useServerFn(getWeeklyAggregate);
  const { data: agg } = useSuspenseQuery({
    queryKey: ["weekly", "current"],
    queryFn: () => fetchAgg({ data: {} }),
  });

  const pager = usePager(agg.projects, 8);

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-display font-extrabold tracking-tight">Projects</h1>
        <p className="text-foreground/50 text-sm">
          Weekly recap for every connected Notion database. Click a project for full detail.
        </p>
      </header>

      {agg.projects.length === 0 ? (
        <div className="glass rounded-[2rem] p-12 text-center">
          <p className="text-foreground/60 mb-4">No projects connected.</p>
          <Link
            to="/settings"
            className="px-4 py-2 bg-foreground text-background rounded-xl text-sm font-bold"
          >
            Connect Notion database
          </Link>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {pager.pageItems.map((p) => {
            const total = p.tasks.length;
            const donePct = total ? (p.tasksDone / total) * 100 : 0;
            const progPct = total ? (p.tasksInProgress / total) * 100 : 0;
            const blockPct = total ? (p.tasksBlocked / total) * 100 : 0;
            return (
              <Link
                key={p.projectId}
                to="/projects/$projectId"
                params={{ projectId: p.projectId }}
                className="glass rounded-[2rem] p-6 hover:bg-foreground/[0.03] transition-colors group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-2.5 rounded-full bg-foreground/60 shrink-0" />
                    <h2 className="font-display font-bold text-lg truncate group-hover:translate-x-0.5 transition-transform">
                      {p.name}
                    </h2>
                  </div>
                  <p className="font-mono font-bold text-xl tabular-nums">
                    {p.totalHours.toFixed(1)}h
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="p-2 rounded-xl bg-foreground/[0.04]">
                    <div className="text-[10px] text-foreground/50 font-mono uppercase tracking-wider">Done</div>
                    <div className="font-bold tabular-nums">{p.tasksDone}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-foreground/[0.04]">
                    <div className="text-[10px] text-foreground/50 font-mono uppercase tracking-wider">Progress</div>
                    <div className="font-bold tabular-nums">{p.tasksInProgress}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-foreground/[0.04]">
                    <div className="text-[10px] text-foreground/50 font-mono uppercase tracking-wider">Blocked</div>
                    <div className="font-bold tabular-nums">{p.tasksBlocked}</div>
                  </div>
                </div>

                <div className="h-1.5 w-full rounded-full overflow-hidden bg-foreground/[0.05] flex">
                  <div style={{ width: `${donePct}%` }} className="bg-foreground/70" />
                  <div style={{ width: `${progPct}%` }} className="bg-foreground/40" />
                  <div style={{ width: `${blockPct}%` }} className="bg-foreground/20" />
                </div>
                <p className="mt-3 text-[11px] text-foreground/40 font-mono">
                  {total} task{total === 1 ? "" : "s"} this week · view detail →
                </p>
                {p.error && (
                  <p className="mt-2 text-[11px] text-foreground/60 font-mono break-words">
                    ⚠ {p.error}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
        <Pager
          page={pager.page}
          totalPages={pager.totalPages}
          onChange={pager.setPage}
          total={pager.total}
          pageSize={pager.pageSize}
        />
        </>
      )}
    </>
  );
}