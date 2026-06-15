import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <div className="animate-fade-in">
      <header className="flex items-center justify-between mb-10">
        <div className="space-y-3">
          <Skeleton className="h-9 w-72 rounded-2xl" />
          <Skeleton className="h-4 w-56 rounded-full" />
        </div>
        <Skeleton className="h-11 w-64 rounded-full" />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="glass rounded-[2rem] p-6 space-y-4 animate-fade-in"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <Skeleton className="h-3 w-20 rounded-full" />
            <Skeleton className="h-12 w-24 rounded-xl" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-8 space-y-8">
          <section className="glass rounded-[2rem] p-8 space-y-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40 rounded-full" />
              <Skeleton className="h-3 w-24 rounded-full" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-32 rounded-full" />
                  <Skeleton className="h-3 w-10 rounded-full" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            ))}
          </section>

          <section className="glass rounded-[2rem] p-8 space-y-3">
            <Skeleton className="h-5 w-40 rounded-full mb-3" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </section>
        </div>

        <aside className="xl:col-span-4 space-y-4">
          <div className="glass-strong p-7 rounded-[2rem] space-y-4">
            <Skeleton className="h-5 w-40 rounded-full" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-2xl" />
          </div>
          <div className="glass p-5 rounded-3xl space-y-3">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-4 w-40 rounded-full" />
          </div>
        </aside>
      </div>
    </div>
  );
}