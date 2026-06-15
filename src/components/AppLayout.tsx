import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjects } from "@/lib/notion.functions";
import { useTheme } from "./ThemeProvider";
import { FloatingChat } from "./FloatingChat";
import { PageSkeleton } from "./PageSkeleton";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/projects", label: "Projects" },
  { to: "/team", label: "Team" },
  { to: "/ai-insights", label: "AI Insights" },
  { to: "/settings", label: "Settings" },
] as const;

const colorMap: Record<string, string> = {
  blue: "bg-foreground/60",
  purple: "bg-foreground/60",
  orange: "bg-foreground/60",
  green: "bg-foreground/60",
};

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const resolvedPathname = useRouterState({
    select: (s) => s.resolvedLocation?.pathname ?? s.location.pathname,
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const fetchProjects = useServerFn(listProjects);
  const { data: projects } = useSuspenseQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
    staleTime: 5 * 60 * 1000,
  });
  const { theme, toggle } = useTheme();

  // Parallax: track scroll and pointer for aurora blobs
  const [scrollY, setScrollY] = useState(0);
  const pointer = useRef({ x: 0, y: 0 });
  const [, force] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      pointer.current = { x, y };
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          force((n) => n + 1);
        });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const px = pointer.current.x;
  const py = pointer.current.y;

  return (
    <div className="relative min-h-screen text-foreground">
      {/* Ambient aurora */}
      <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div
          className="aurora-blob w-[55vw] h-[55vw] -top-[15vw] -left-[10vw]"
          style={{
            background: "var(--aurora-1)",
            transform: `translate3d(${px * 40}px, ${py * 30 - scrollY * 0.15}px, 0)`,
          }}
        />
        <div
          className="aurora-blob w-[50vw] h-[50vw] -top-[10vw] right-[-10vw]"
          style={{
            background: "var(--aurora-2)",
            transform: `translate3d(${px * -50}px, ${py * 40 - scrollY * 0.25}px, 0)`,
            animationDelay: "-4s",
          }}
        />
        <div
          className="aurora-blob w-[45vw] h-[45vw] bottom-[-15vw] right-[20vw]"
          style={{
            background: "var(--aurora-3)",
            transform: `translate3d(${px * 30}px, ${py * -40 + scrollY * 0.1}px, 0)`,
            animationDelay: "-8s",
          }}
        />
      </div>

      <div className="flex min-h-screen p-4 md:p-6 gap-6">
        <aside className="glass-strong rounded-[2rem] w-64 flex flex-col p-6 gap-8 shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)]">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="size-8 rounded-full bg-foreground shadow-[0_0_20px_var(--glass-inset)] flex items-center justify-center transition-transform group-hover:scale-110">
                <div className="size-2.5 bg-background rounded-full animate-pulse" />
              </div>
              <span className="font-display font-extrabold text-lg tracking-[0.18em]">NOWTRACK</span>
            </Link>
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="size-8 rounded-full glass-tile flex items-center justify-center text-foreground/70 hover:text-foreground transition-all hover:scale-110 active:scale-95"
            >
              {theme === "dark" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
          </div>

          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const active = resolvedPathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    active
                      ? "px-4 py-2.5 rounded-2xl text-sm font-medium glass text-foreground"
                      : "px-4 py-2.5 rounded-2xl text-sm font-medium text-foreground/45 hover:text-foreground hover:translate-x-0.5 transition-all"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/40 mb-4">
              Active Projects
            </div>
            <div className="flex flex-col gap-3">
              {projects.length === 0 ? (
                <Link to="/settings" className="text-xs text-foreground/50 hover:text-foreground transition-colors">
                  + Connect a Notion database
                </Link>
              ) : (
                projects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 text-sm">
                    <div className="size-2 rounded-full bg-foreground/60" />
                    <span className="truncate text-foreground/80">{p.name}</span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              {user ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">
                      {(user.user_metadata?.display_name as string) || user.email}
                    </p>
                    <p className="text-[10px] font-mono text-foreground/40 truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await queryClient.cancelQueries();
                      queryClient.clear();
                      await signOut();
                      navigate({ to: "/auth", replace: true });
                    }}
                    className="text-[10px] font-mono uppercase tracking-widest text-foreground/50 hover:text-foreground"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="block text-center px-3 py-2 bg-foreground text-background rounded-xl text-xs font-bold"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-4 md:p-6 overflow-y-auto">
          <div key={resolvedPathname} className="animate-page-soft">
            <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
          </div>
        </main>
      </div>
      <FloatingChat />
    </div>
  );
}