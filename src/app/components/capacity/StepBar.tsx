"use client";

import type { Step } from "@/app/lib/capacityForm";

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "Your money" },
  { step: 2, label: "Plans" },
  { step: 3, label: "Compare" },
];

/**
 * The three steps as one row of buttons — any step is a tap away, nothing is
 * locked. The current one is filled with the accent and `aria-current`; a
 * step holding a field with a problem carries a red dot (and says so to a
 * screen reader), so a mistake on another step is never invisible.
 */
export default function StepBar({
  step,
  onStep,
  hasError,
}: {
  step: Step;
  onStep: (step: Step) => void;
  hasError: (step: Step) => boolean;
}) {
  return (
    <nav aria-label="Calculator steps">
      <ol className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
        {STEPS.map(({ step: s, label }) => {
          const current = s === step;
          const bad = hasError(s);
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => onStep(s)}
                aria-current={current ? "step" : undefined}
                className={`pressable relative flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl px-1 text-[13px] font-medium sm:gap-2 sm:px-2 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  current ? "bg-accent/15 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs ${
                    current ? "bg-accent text-white" : "border border-white/20 text-white/60"
                  }`}
                  aria-hidden
                >
                  {s}
                </span>
                <span className="sr-only">Step {s}: </span>
                <span className="truncate">{label}</span>
                {bad && (
                  <>
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-loss" aria-hidden />
                    <span className="sr-only">(needs fixing)</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
