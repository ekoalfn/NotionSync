import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageSkeleton } from "@/components/PageSkeleton";
import { getWeeklyAggregate } from "@/lib/notion.functions";
import { ChevronRight } from "lucide-react";
import { Pager, usePager } from "@/components/Pager";

export const Route = createFileRoute("/_authenticated/team/")({
  head: () => ({ meta: [{ title: "Team — NowTrack" }] }),
  component: TeamPage,
});

function initials(name: string) {
  return name.split(/\s+/).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function TeamPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeamContent />
    </Suspense>
  );
}

function TeamContent() {
  const fetchAgg = useServerFn(getWeeklyAggregate);
  const { data: agg } = useSuspenseQuery({
    queryKey: ["weekly", "current"],
    queryFn: () => fetchAgg({ data: {} }),
  });

  const pager = usePager(agg.perPerson, 10);

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-display font-extrabold tracking-tight">Team</h1>
        <p className="text-foreground/50 text-sm">Per-person hour breakdown and active projects.</p>
      </header>

      {agg.perPerson.length === 0 ? (
        <div className="glass rounded-[2rem] p-12 text-center text-foreground/60">
          No team activity logged this week yet.
        </div>
      ) : (
        <section className="glass rounded-[2rem] p-6">
          <h3 className="font-display font-semibold text-lg mb-4">Leaderboard</h3>
          <table className="w-full">
            <thead className="text-[10px] font-mono uppercase text-foreground/40 border-b border-border">
              <tr>
                <th className="text-left py-3 font-medium">Member</th>
                <th className="text-left py-3 font-medium">Tasks Done</th>
                <th className="text-left py-3 font-medium">Active Projects</th>
                <th className="text-right py-3 font-medium">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {pager.pageItems.map((person) => (
                <tr key={person.name} className="group hover:bg-white/[0.03] transition-colors">
                  <td className="py-4">
                    <Link
                      to="/team/$name"
                      params={{ name: person.name }}
                      className="flex items-center gap-3"
                    >
                      <div className="size-8 rounded-full bg-white/10 grid place-items-center text-xs font-bold text-foreground">
                        {initials(person.name)}
                      </div>
                      <span className="text-sm font-medium group-hover:underline">{person.name}</span>
                    </Link>
                  </td>
                  <td className="py-4">
                    <span className="text-xs bg-white/5 text-foreground/60 px-2 py-1 rounded-full font-medium">
                      {person.tasksDone} Done
                    </span>
                  </td>
                  <td className="py-4 text-xs text-foreground/60">
                    {person.activeProjects.join(", ") || "—"}
                  </td>
                  <td className="py-4 text-right font-mono text-sm">
                    <Link
                      to="/team/$name"
                      params={{ name: person.name }}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {person.totalHours.toFixed(1)}
                      <ChevronRight className="size-3 opacity-50" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            page={pager.page}
            totalPages={pager.totalPages}
            onChange={pager.setPage}
            total={pager.total}
            pageSize={pager.pageSize}
          />
        </section>
      )}
    </>
  );
}