"use client";

import type { FormError } from "@/app/lib/capacityForm";
import { formatMoney } from "@/app/lib/format";
import { focusField } from "./formErrors";

/**
 * On a phone the inputs sit ABOVE the results, so a number changed at the
 * top has its effect two screens down. This strip sticks under the nav
 * while the inputs are on screen and shows the answer as it moves; tapping
 * it scrolls to the full results. When the form does not parse it says how
 * many inputs to fix and tapping goes to the first one.
 *
 * Hidden from `lg:` up, where the results column is beside the form. The
 * same glass as the pill nav, and its `top` reads --top-nav-clearance.
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
  const scrollToResults = () => {
    const el = document.getElementById("results");
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  };

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
