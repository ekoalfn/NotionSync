import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjects } from "@/lib/notion.functions";
import { useTheme } from "./ThemeProvider";
import { FloatingChat } from "./FloatingChat";
import { PageSkeleton } from "./PageSkeleton";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/projects", label: "Projects" },
  { to: "/team", label: "Team" },
  { to: "/report", label: "Report" },
  { to: "/ai-insights", label: "AI Insights" },
  { to: "/settings", label: "Settings" },
] as const;

// Notion-named colors → real CSS values for the sidebar project dot.
// Keeps the dot visually tied to each project (matches the project recap on the
// dashboard which already uses the same palette).
const SIDEBAR_PRESET: Record<string, string> = {
  purple: "#a855f7",
  blue: "#3b82f6",
  green: "#10b981",
  orange: "#f97316",
  pink: "#ec4899",
  red: "#ef4444",
  yellow: "#eab308",
  cyan: "#06b6d4",
};
function resolveSidebarColor(c: string | null | undefined): string {
  if (!c) return "rgb(168 168 168 / 0.6)"; // neutral fallback
  if (c.startsWith("#")) return c;
  return SIDEBAR_PRESET[c] ?? "rgb(168 168 168 / 0.6)";
}

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
        <aside className="hidden md:flex glass-strong rounded-[2rem] w-64 flex-col p-6 gap-8 shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)]">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="size-9 rounded-2xl bg-background/40 shadow-[0_0_20px_var(--glass-inset)] flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden">
                <img src="/logo.svg" alt="" aria-hidden className="size-7 object-contain" />
              </div>
              <span className="font-display font-extrabold text-lg tracking-[0.18em]">
                NOWTRACK
              </span>
            </Link>
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="size-8 rounded-full glass-tile flex items-center justify-center text-foreground/70 hover:text-foreground transition-all hover:scale-110 active:scale-95"
            >
              {theme === "dark" ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
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
            <div className="flex flex-col gap-1">
              {projects.length === 0 ? (
                <Link
                  to="/settings"
                  className="text-xs text-foreground/50 hover:text-foreground transition-colors"
                >
                  + Connect a Notion database
                </Link>
              ) : (
                projects.map((p) => {
                  // Highlight current project when its detail page is active so users
                  // see where they are inside the projects/$projectId route.
                  const isActive =
                    pathname === `/projects/${p.id}` || pathname.startsWith(`/projects/${p.id}/`);
                  return (
                    <Link
                      key={p.id}
                      to="/projects/$projectId"
                      params={{ projectId: p.id }}
                      className={
                        isActive
                          ? "flex items-center gap-3 text-sm px-3 py-2 -mx-3 rounded-xl glass text-foreground"
                          : "flex items-center gap-3 text-sm px-3 py-2 -mx-3 rounded-xl text-foreground/70 hover:text-foreground hover:bg-foreground/[0.05] hover:translate-x-0.5 transition-all"
                      }
                      title={p.name}
                    >
                      <div
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: resolveSidebarColor(p.color) }}
                      />
                      <span className="truncate">{p.name}</span>
                    </Link>
                  );
                })
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              {user ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">
                      {(user.user_metadata?.display_name as string) || user.email}
                    </p>
                    <p className="text-[10px] font-mono text-foreground/40 truncate">
                      {user.email}
                    </p>
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

        <main className="flex-1 min-w-0 p-4 md:p-6 overflow-x-hidden overflow-y-auto mobile-nav-clearance md:!pb-0">
          {/* Mobile-only top bar (sidebar is hidden on small screens).
              Carries brand, theme toggle, and account quick action. Desktop unchanged. */}
          <header className="md:hidden mb-4 flex items-center justify-between gap-3 glass-tile rounded-2xl px-4 py-3 pt-safe">
            <Link to="/" className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-xl bg-background/40 shadow-[0_0_18px_var(--glass-inset)] flex items-center justify-center shrink-0 overflow-hidden">
                <img src="/logo.svg" alt="" aria-hidden className="size-6 object-contain" />
              </div>
              <span className="font-display font-extrabold text-sm tracking-[0.18em] truncate">
                NOWTRACK
              </span>
            </Link>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={toggle}
                aria-label="Toggle theme"
                className="size-9 rounded-full glass-tile flex items-center justify-center text-foreground/70 active:scale-90 transition-transform"
              >
                {theme === "dark" ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
              {user ? (
                <button
                  onClick={async () => {
                    await queryClient.cancelQueries();
                    queryClient.clear();
                    await signOut();
                    navigate({ to: "/auth", replace: true });
                  }}
                  aria-label="Sign out"
                  className="size-9 rounded-full glass-tile flex items-center justify-center text-foreground/70 active:scale-90 transition-transform"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              ) : (
                <Link
                  to="/auth"
                  className="px-3 h-9 inline-flex items-center bg-foreground text-background rounded-full text-[11px] font-bold"
                >
                  Sign in
                </Link>
              )}
            </div>
          </header>

          <div key={resolvedPathname} className="animate-page-soft">
            <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
          </div>
        </main>
      </div>
      <MobileBottomNav />
      <FloatingChat />
    </div>
  );
}
