import { Toaster as Sonner } from "sonner";
import { useEffect, useState } from "react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Sonner toaster with responsive positioning.
 *
 * Mobile (< 768px): top-center.
 *   The bottom of the viewport is occupied by the liquid-glass MobileBottomNav
 *   floating bar. Sonner's default bottom-right would render its toasts on
 *   top of (and behind) that bar, leaving stray text like "Project (saved)"
 *   visually overlapping the Projects/Team tabs. Anchoring to top-center
 *   keeps toasts well clear of both the top header and the bottom nav.
 *
 * Desktop (≥ 768px): bottom-right.
 *   Keeps the original Sonner default so existing visual hierarchy on the
 *   wider layout is preserved.
 */
const Toaster = ({ position: positionProp, ...props }: ToasterProps) => {
  // Pick a position based on viewport. We resolve once on mount and on resize
  // — Sonner reads `position` reactively so this swaps without a full reload.
  const [position, setPosition] = useState<ToasterProps["position"]>(
    positionProp ?? "bottom-right",
  );
  useEffect(() => {
    if (positionProp) return; // explicit override wins
    const mql = window.matchMedia("(min-width: 768px)");
    const update = () => setPosition(mql.matches ? "bottom-right" : "top-center");
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [positionProp]);

  return (
    <Sonner
      className="toaster group"
      position={position}
      // Generous offset so even at top-center the toast clears the iOS
      // status bar + the in-app header pill comfortably.
      offset={position?.startsWith("top") ? 72 : 32}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
