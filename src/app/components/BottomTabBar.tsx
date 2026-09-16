"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";

const ICON = {
  width: 21,
  height: 21,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/**
 * Four tabs, the same four for everyone. The pill carries the destinations
 * every user has; account actions (Users, Log out) live in the Navbar.
 * Add a tab here and the sliding highlight measures itself — nothing else to
 * touch, but keep four: each tab is a 44px target and the pill is capped at
 * 320px, so a fifth squeezes the labels.
 */
const TABS = [
  {
    href: "/",
    label: "Home",
    icon: (
      <svg {...ICON}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M10 21v-6h4v6" />
      </svg>
    ),
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: (
      <svg {...ICON}>
        <path d="M8 3 4 7l4 4" />
        <path d="M4 7h16" />
        <path d="m16 21 4-4-4-4" />
        <path d="M20 17H4" />
      </svg>
    ),
  },
  {
    href: "/calculator",
    label: "Calculator",
    icon: (
      <svg {...ICON}>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" x2="16" y1="6" y2="6" />
        <line x1="16" x2="16" y1="14" y2="18" />
        <path d="M16 10h.01" />
        <path d="M12 10h.01" />
        <path d="M8 10h.01" />
        <path d="M12 14h.01" />
        <path d="M8 14h.01" />
        <path d="M12 18h.01" />
        <path d="M8 18h.01" />
      </svg>
    ),
  },
  {
    href: "/reports",
    label: "Reports",
    icon: (
      <svg {...ICON}>
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </svg>
    ),
  },
];

export default function BottomTabBar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  const tabs = TABS;

  const activeIndex = tabs.findIndex((tab) =>
    tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href),
  );

  // ------------------------------------------------------------------
  // The active highlight is ONE element that slides, not a background
  // toggled per tab. A per-tab background can only cross-fade, which reads
  // as two separate things blinking; a single travelling pill reads as the
  // selection physically moving, which is the whole effect.
  //
  // Its geometry is MEASURED rather than computed from tab count, because
  // the tabs are flex-1 inside a fluid pill — their width depends on the
  // screen.
  // ------------------------------------------------------------------
  const railRef = useRef<HTMLDivElement | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // First paint must PLACE the highlight, not animate it in from x=0 — so the
  // transition is armed one frame after the first measurement.
  //
  // This is STATE, not a ref. A ref mutation does not re-render: the element
  // would keep the `transition: none` it was first painted with, so the
  // highlight teleports between tabs instead of sliding. Measured
  // transitionDuration of 0s while the transform updates correctly is exactly
  // what that bug looks like.
  const [armed, setArmed] = useState(false);

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail || activeIndex < 0) {
      setPill(null);
      return;
    }
    // Query the anchors, NOT rail.children — the highlight is itself a child,
    // so indexing children shifts every tab by one the moment it mounts.
    const el = rail.querySelectorAll("a")[activeIndex] as HTMLElement | undefined;
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeIndex]);

  // Layout effect, not effect: measuring after paint would show the highlight
  // at its old position for a frame on every navigation.
  //
  // `isAuthenticated` and the tab count are deps because this component
  // renders null while auth is still loading. Without them the first (null)
  // render measures a rail that does not exist, and nothing re-runs when the
  // real bar appears — the highlight then never renders at all.
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, isAuthenticated, tabs.length]);

  // Arm the transition one frame after the highlight has been placed, so the
  // first paint is a placement and every later one is a slide.
  useEffect(() => {
    if (!pill || armed) return;
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, [pill, armed]);

  // Signed out there is nowhere to tab to, and the bar would otherwise sit
  // under the login form promising pages that all bounce back to it.
  if (!isAuthenticated) return null;

  return (
    // A floating capsule rather than an edge-to-edge bar. The outer element
    // spans the screen only so the pill can centre itself; it is
    // pointer-events-none so the transparent gutters either side stay
    // tappable — content genuinely scrolls past the pill there.
    //
    // Height and offset here are what --bottom-nav-clearance encodes. Change
    // one and change the other.
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 md:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
    >
      {/* Fluid, not content-sized: fills the available width up to a cap, so
          the tabs grow with the screen instead of the gutters doing it. At
          max-w-[320px] it is 85% of a 375px phone and 73% of a 440px one. */}
      <div
        ref={railRef}
        className="pointer-events-auto relative flex h-[52px] w-full max-w-[320px] items-center gap-0.5 rounded-full border border-white/10 bg-charcoal/85 px-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      >
        {/* The travelling highlight. aria-hidden and pointer-events-none: it is
            decoration, and the tabs above it own every tap and every label a
            screen reader reads. */}
        {pill && (
          // Vertical centring lives in the inline transform below, NOT in a
          // -translate-y-1/2 class: Tailwind v4 emits that as the `translate`
          // property, which COMPOSES with `transform`, so the -50% applied
          // twice and the highlight floated half out of the pill.
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-1/2 h-[44px] rounded-full bg-accent/15 will-change-transform motion-reduce:transition-none"
            style={{
              width: pill.width,
              transform: `translate(${pill.left}px, -50%)`,
              // Slightly overshoots and settles, so the selection feels thrown
              // rather than dragged. Width eases plainly — a springy width on a
              // pill that also moves reads as wobble.
              transition: armed
                ? "transform 340ms cubic-bezier(0.34, 1.4, 0.5, 1), width 220ms ease-out"
                : "none",
            }}
          />
        )}

        {tabs.map((tab, i) => {
          const isActive = i === activeIndex;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              // flex-1 so the tabs share the pill's width evenly; the min-w
              // is the floor for a narrow phone, not the target.
              //
              // relative + z-10 so the label and icon sit ABOVE the travelling
              // highlight rather than under it.
              className={`relative z-10 flex h-[44px] min-w-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 transition-colors duration-200 ${
                isActive ? "text-accent" : "text-white/40 active:bg-white/5"
              }`}
            >
              {/* The icon lifts and grows a little as its tab becomes active,
                  so the motion is not purely horizontal. */}
              <span
                className="transition-transform duration-300 ease-out motion-reduce:transition-none"
                style={{ transform: isActive ? "scale(1.08) translateY(-1px)" : "none" }}
              >
                {tab.icon}
              </span>
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
