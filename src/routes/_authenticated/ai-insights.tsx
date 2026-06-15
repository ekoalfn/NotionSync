import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { generateWeeklyInsights } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/ai-insights")({
  head: () => ({ meta: [{ title: "AI Insights — NowTrack" }] }),
  component: InsightsPage,
});

function InsightsPage() {
  const fetchAI = useServerFn(generateWeeklyInsights);
  const [forceKey, setForceKey] = useState(0);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ai-insights", "page", forceKey],
    queryFn: () => fetchAI({ data: { force: forceKey > 0 } }),
  });

  return (
    <>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">AI Insights</h1>
          <p className="text-foreground/50 text-sm">
            Weekly summary, improvement plan, and constructive critique generated from your Notion data.
          </p>
        </div>
        <button
          onClick={() => {
            setForceKey((k) => k + 1);
            refetch();
          }}
          disabled={isFetching}
          className="px-4 py-2 bg-foreground text-background rounded-xl text-sm font-bold disabled:opacity-50"
        >
          {isFetching ? "Generating…" : "Regenerate"}
        </button>
      </header>

      {isLoading ? (
        <div className="glass rounded-[2rem] p-8 animate-pulse text-foreground/40">
          Analyzing this week's data…
        </div>
      ) : error ? (
        <div className="bg-white/5 border border-white/15 text-foreground/60 rounded-3xl p-6">
          {(error as Error).message}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card title="Weekly Summary" body={data.summary} accent="bg-foreground/60" />
          <Card title="Improvements" body={data.improvements} accent="bg-foreground/60" />
          <Card title="Critique" body={data.critique} accent="bg-foreground/60" />
        </div>
      ) : null}
    </>
  );
}

function Card({ title, body, accent }: { title: string; body: string; accent: string }) {
  return (
    <article className="glass rounded-[2rem] p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className={`size-3 rounded-full ${accent}`} />
        <h2 className="font-display font-bold">{title}</h2>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/80">
        {body || "—"}
      </p>
    </article>
  );
}