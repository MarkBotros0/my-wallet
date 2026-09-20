"use client";

import { useEffect, useState, type RefObject } from "react";
import type { SimulationResult } from "@/lib/capacity";
import type { FormError } from "@/app/lib/capacityForm";
import { formatMoney, formatPct } from "@/app/lib/format";
import { focusField } from "./formErrors";

/** Scroll the results column's top under the nav; the id carries the scroll margin. */
function scrollToResults() {
  const el = document.getElementById("results");
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
}

/**
 * True once `ref`'s element has scrolled up past the nav — the moment a
 * condensed copy of it should take over. An IntersectionObserver against a
 * root inset by the nav's height, so no scroll listener and no per-frame
 * layout reads.
 */
export function useScrolledPast(ref: RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The top nav is the one sticky <nav>; measured, not restated.
    const inset = (document.querySelector<HTMLElement>("nav.sticky")?.offsetHeight ?? 61) + 16;
    const io = new IntersectionObserver(
      ([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.bottom < inset),
      { rootMargin: `-${inset}px 0px 0px 0px`, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return past;
}

/**
 * The desktop twin of the phone strip: a slim glass bar that sticks under
 * the nav in the results column and appears only once the headline card
 * has scrolled out of view — editing "Extra costs" three screens down, the
 * answer is still in sight. Hidden below `lg:`, where the phone strip does
 * this job; zero height in flow, so it costs the column nothing.
 */
export function DesktopResultBar({
  visible,
  sim,
  maxPrice,
  currency,
  errors,
}: {
  visible: boolean;
  /** The simulation at the maximum, for the two figures beside the price. */
  sim: SimulationResult | null;
  maxPrice: number | null | undefined;
  currency: string;
  errors: FormError[];
}) {
  const broken = errors.length > 0;
  return (
    <div
      className="pointer-events-none sticky z-40 hidden h-0 lg:block"
      style={{ top: "calc(var(--top-nav-clearance) + 8px)" }}
      aria-hidden={!visible}
    >
      <div
        className={`flex min-h-[52px] items-center gap-4 rounded-xl border px-4 shadow-lg shadow-black/40 backdrop-blur-xl transition-[opacity,transform] duration-200 ease-out-expo ${
          visible ? "pointer-events-auto translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        } ${broken ? "border-loss/30 bg-charcoal/90" : "border-white/10 bg-charcoal/85"}`}
      >
        {broken ? (
          <>
            <span className="text-[10px] font-medium uppercase tracking-wider text-loss">Can&apos;t calculate</span>
            <span className="text-sm text-white">
              {errors.length === 1 ? "1 input needs fixing" : `${errors.length} inputs need fixing`}
            </span>
            <button
              type="button"
              onClick={() => focusField(errors[0].field)}
              tabIndex={visible ? 0 : -1}
              className="pressable ml-auto flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg px-3 text-xs font-medium text-loss hover:bg-white/5"
            >
              Fix
              <Chevron direction="up" />
            </button>
          </>
        ) : (
          <>
            <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">Maximum</span>
            <span className={`font-mono text-lg tabular-nums ${maxPrice === null ? "text-white/60" : "text-white"}`}>
              {maxPrice === undefined ? "—" : maxPrice === null ? "Nothing affordable" : formatMoney(maxPrice, currency)}
            </span>
            {sim && maxPrice !== null && (
              <span className="hidden text-xs text-white/40 xl:inline">
                Ends with <span className="font-mono tabular-nums text-white/70">{formatMoney(sim.finalBalance, "")}</span>
                {" · "}
                <span className="font-mono tabular-nums text-white/70">{formatPct(sim.keptShareOfCapital, 0)}</span> kept
              </span>
            )}
            <button
              type="button"
              onClick={scrollToResults}
              tabIndex={visible ? 0 : -1}
              className="pressable ml-auto flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg px-3 text-xs font-medium text-accent hover:bg-white/5"
            >
              Summary
              <Chevron direction="up" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * On a phone the inputs sit ABOVE the results, so a number changed at the
 * top has its effect two screens down. This strip sticks under the nav
 * while the inputs are on screen and shows the answer as it moves; tapping
 * it scrolls to the full results. When the form does not parse it says how
 * many inputs to fix and tapping goes to the first one.
 *
 * Hidden from `lg:` up, where the results column is beside the form and
 * DesktopResultBar takes over. The same glass as the pill nav, and its
 * `top` reads --top-nav-clearance.
 */
export default function LiveResult({
  maxPrice,
  currency,
  errors,
}: {
  /** The maximum, null when nothing is affordable, undefined when there is no result yet. */
  maxPrice: number | null | undefined;
  currency: string;
  errors: FormError[];
}) {
  const broken = errors.length > 0;

  return (
    <div className="sticky z-40 lg:hidden" style={{ top: "calc(var(--top-nav-clearance) + 8px)" }}>
      <button
        type="button"
        onClick={broken ? () => focusField(errors[0].field) : scrollToResults}
        aria-live="polite"
        className={`pressable flex min-h-[56px] w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-left shadow-lg shadow-black/40 backdrop-blur-xl active:bg-white/5 ${
          broken ? "border-loss/30 bg-charcoal/90" : "border-white/10 bg-charcoal/85"
        }`}
      >
        {broken ? (
          <>
            <span className="min-w-0">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-loss">Can&apos;t calculate</span>
              <span className="block truncate text-sm text-white">
                {errors.length === 1 ? "1 input needs fixing" : `${errors.length} inputs need fixing`}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-loss">
              Fix
              <Chevron direction="up" />
            </span>
          </>
        ) : (
          <>
            <span className="min-w-0">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-white/50">
                Maximum buying capacity
              </span>
              <span
                className={`block truncate font-mono text-base tabular-nums ${
                  maxPrice === null ? "text-white/60" : "text-white"
                }`}
              >
                {maxPrice === undefined ? "—" : maxPrice === null ? "Nothing affordable" : formatMoney(maxPrice, currency)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
              Results
              <Chevron direction="down" />
            </span>
          </>
        )}
      </button>
    </div>
  );
}

function Chevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-4 w-4 ${direction === "up" ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 6.5 8 10.5l4-4" />
    </svg>
  );
}
