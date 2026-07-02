import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Apple liquid-glass bottom navigation for mobile.
 *
 * Visual model:
 *  - The nav itself is a frosted-glass bar (heavy backdrop-blur + dual-layer wash).
 *  - The "active" indicator is a SINGLE absolutely-positioned pill that slides
 *    between tabs with a spring curve — this is what reads as liquid, because
 *    the eye sees one continuous blob morphing rather than separate chips
 *    blinking on/off.
 *  - Tapping a tab also spawns a short-lived ripple inside that tab for the
 *    "bubble on water" feeling, and the icon micro-bounces.
 *  - Tap target ≥ 44x44 (Apple HIG); safe-area-inset-bottom handled by wrapper.
 *  - Desktop hides this entirely via `md:hidden` on the wrapper.
 */

type IconProps = { className?: string };

const Icons = {
  Dashboard: ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  Projects: ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  ),
  Team: ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.6-3.1 2.9-5 5.5-5s4.9 1.9 5.5 5" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M15.5 14.5c2.4.3 4 2.2 4.5 4.5" />
    </svg>
  ),
  AI: ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" />
      <circle cx="12" cy="12" r="4.5" />
    </svg>
  ),
  // Monthly: stylised calendar with a small bar-chart inside to imply "report"
  Monthly: ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 3v4M16 3v4" />
      <path d="M8 17v-3M12 17v-5M16 17v-2" />
    </svg>
  ),
  Settings: ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  ),
} as const;

const navItems = [
  { to: "/", label: "Home", Icon: Icons.Dashboard },
  { to: "/projects", label: "Projects", Icon: Icons.Projects },
  { to: "/team", label: "Team", Icon: Icons.Team },
  { to: "/monthly", label: "Monthly", Icon: Icons.Monthly },
  { to: "/settings", label: "Settings", Icon: Icons.Settings },
] as const;

// Matches the route a tab is responsible for, including nested routes
// (so /projects/:id keeps Projects active).
function isActiveFor(to: string, pathname: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

export function MobileBottomNav() {
  const pathname = useRouterState({
    select: (s) => s.resolvedLocation?.pathname ?? s.location.pathname,
  });

  const activeIndex = Math.max(0, navItems.findIndex((n) => isActiveFor(n.to, pathname)));

  // Refs to the tab DOM nodes so we can measure their layout and slide the
  // pill into the right position. We measure on mount, on route change, and
  // on resize (rotation, etc).
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number } | null>(null);

  // useLayoutEffect to avoid a frame where the pill is at the wrong slot.
  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      const node = tabRefs.current[activeIndex];
      if (!container || !node) return;
      const cb = container.getBoundingClientRect();
      const nb = node.getBoundingClientRect();
      setPillStyle({ left: nb.left - cb.left, width: nb.width });
    }
    measure();
    // Re-measure on resize / orientation change.
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [activeIndex]);

  // Hide when the on-screen keyboard pops up (iOS Safari otherwise floats the
  // bar in the middle of the keyboard).
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const baseline = vv.height;
    const onResize = () => {
      setKeyboardOpen(baseline - vv.height > 150);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Per-tab ripple bookkeeping. Each entry is the timestamp of the last tap
  // — used as a React key so re-tapping the SAME tab restarts the animation
  // instead of being deduped by React.
  const [rippleAt, setRippleAt] = useState<number[]>(() => navItems.map(() => 0));
  const spawnRipple = (idx: number) => {
    setRippleAt((prev) => {
      const next = prev.slice();
      next[idx] = Date.now();
      return next;
    });
  };

  if (keyboardOpen) return null;

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 pb-safe px-3 pointer-events-none"
    >
      <div
        ref={containerRef}
        className="glass-bottom-nav rounded-[2rem] relative flex items-stretch justify-around px-2 pt-2 pb-2 gap-1 max-w-md mx-auto pointer-events-auto"
      >
        {/* The single sliding "liquid pill" — its position/width are JS-driven,
            its motion is a CSS spring transition, so it visually flows between
            tabs as a continuous blob. Hidden on first paint until we've
            measured (otherwise it would flash at left:0). */}
        {pillStyle && (
          <span
            aria-hidden
            className="liquid-pill rounded-2xl glass-pill"
            style={{ left: pillStyle.left, width: pillStyle.width }}
          />
        )}

        {navItems.map(({ to, label, Icon }, idx) => {
          const active = idx === activeIndex;
          return (
            <Link
              key={to}
              to={to}
              ref={(el) => { tabRefs.current[idx] = el; }}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              onClick={() => spawnRipple(idx)}
              className="relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl transition-transform active:scale-95 overflow-hidden"
            >
              {/* Ripple (re-keyed by timestamp so re-tapping replays the
                  animation). Rendered above the pill so it's visible on the
                  currently-active tab too. */}
              {rippleAt[idx] > 0 && (
                <span
                  key={rippleAt[idx]}
                  aria-hidden
                  className="liquid-ripple"
                />
              )}
              <Icon
                className={
                  active
                    ? "relative size-6 text-foreground liquid-icon-pop"
                    : "relative size-6 text-foreground/55"
                }
              />
              <span
                className={
                  active
                    ? "relative text-[10px] font-semibold tracking-wide text-foreground"
                    : "relative text-[10px] font-medium tracking-wide text-foreground/55"
                }
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
