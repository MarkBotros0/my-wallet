"use client";

import type { PlanAnswer } from "@/app/lib/planAnswer";

interface Props {
  /** The selected plan's name. */
  name: string;
  answer: PlanAnswer;
  /** Blocking problems in the money step and the selected plan; > 0 turns the strip into "fix this". */
  errorCount: number;
  /** Go to the first problem (or, with no problem but no price, to the price field). */
  onFix: () => void;
  /** Go to step ③. */
  onCompare: () => void;
}

/**
 * The selected plan's answer, always in sight while the numbers change. On a
 * phone it is a strip stuck under the nav on every step (`LiveResult`); on a
 * desktop the same words sit at the end of the sticky step header
 * (`DesktopAnswer`). With a problem it says how many inputs need fixing and
 * the tap goes to the first; with no price yet (top-up mode) it asks for one;
 * otherwise the tap goes to Compare.
 */
export default function LiveResult({ name, answer, errorCount, onFix, onCompare }: Props) {
  const broken = errorCount > 0;
  const needsPrice = !broken && answer.missing === "price";
  return (
    <div className="sticky z-40 lg:hidden" style={{ top: "calc(var(--top-nav-clearance) + 8px)" }}>
      <button
        type="button"
        onClick={broken || needsPrice ? onFix : onCompare}
        className={`pressable flex min-h-[56px] w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-left shadow-lg shadow-black/40 backdrop-blur-xl active:bg-white/5 ${
          broken ? "border-loss/30 bg-charcoal/90" : "border-white/10 bg-charcoal/85"
        }`}
      >
        <Words name={name} answer={answer} errorCount={errorCount} />
        <span className={`flex shrink-0 items-center gap-1 text-xs font-medium ${broken ? "text-loss" : "text-accent"}`}>
          {broken ? "Fix" : needsPrice ? "Add price" : "Compare"}
          <Chevron />
        </span>
      </button>
    </div>
  );
}

/** The desktop twin: one line at the end of the sticky step header. */
export function DesktopAnswer({ name, answer, errorCount, onFix, onCompare }: Props) {
  const broken = errorCount > 0;
  const needsPrice = !broken && answer.missing === "price";
  return (
    <button
      type="button"
      onClick={broken || needsPrice ? onFix : onCompare}
      className={`pressable hidden min-h-[52px] min-w-0 cursor-pointer items-center gap-4 rounded-2xl border px-4 text-left hover:bg-white/[0.03] lg:flex ${
        broken ? "border-loss/30" : "border-white/10"
      }`}
    >
      <Words name={name} answer={answer} errorCount={errorCount} />
      <span className={`ml-auto flex shrink-0 items-center gap-1 text-xs font-medium ${broken ? "text-loss" : "text-accent"}`}>
        {broken ? "Fix" : needsPrice ? "Add price" : "Compare"}
        <Chevron />
      </span>
    </button>
  );
}

function Words({ name, answer, errorCount }: { name: string; answer: PlanAnswer; errorCount: number }) {
  if (errorCount > 0) {
    return (
      <span className="min-w-0" aria-live="polite">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-loss">Can&apos;t calculate</span>
        <span className="block truncate text-sm text-white">
          {errorCount === 1 ? "1 input needs fixing" : `${errorCount} inputs need fixing`}
        </span>
      </span>
    );
  }
  return (
    <span className="min-w-0" aria-live="polite">
      <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-white/50">
        {answer.label} · <span className="normal-case tracking-normal">{name}</span>
      </span>
      <span
        className={`block truncate text-base ${
          answer.tone === "answer"
            ? "font-mono tabular-nums text-white"
            : answer.tone === "problem"
              ? "font-medium text-loss"
              : "text-white/60"
        }`}
      >
        {answer.value}
      </span>
    </span>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 -rotate-90"
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
