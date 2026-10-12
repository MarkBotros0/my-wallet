"use client";

import type { PlanAnswer } from "@/app/lib/planAnswer";
import { FitLine } from "./PlanCard";

export interface RankedPlan {
  id: string;
  name: string;
  terms: string;
  answer: PlanAnswer;
  /** How far this plan's figure is from the best one's, in words ("1,200,000 EGP less"); null for the best or no figure. */
  gap: string | null;
}

/**
 * Step ③'s list: every plan in the order it was entered, its answer on the
 * right and a "Best" tag on the winner — a tag in words, not a colour. Each
 * row is one button: a working plan selects itself (`aria-pressed`, and the
 * accent edge); a plan that cannot be answered yet says what it needs and
 * goes to fix it.
 */
export default function PlanRanking({
  plans,
  selectedId,
  bestId,
  onSelect,
  onFix,
}: {
  plans: RankedPlan[];
  selectedId: string;
  bestId: string | null;
  onSelect: (id: string) => void;
  onFix: (id: string) => void;
}) {
  return (
    <ul className="surface divide-y divide-white/5 overflow-hidden" aria-label="Your plans">
      {plans.map((p) => {
        const broken = p.answer.missing !== null;
        const selected = p.id === selectedId;
        const best = plans.length > 1 && p.id === bestId;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => (broken ? onFix(p.id) : onSelect(p.id))}
              aria-pressed={broken ? undefined : selected}
              className={`relative flex min-h-[64px] w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 ${
                selected ? "bg-accent/[0.07]" : "hover:bg-white/[0.03] active:bg-white/[0.05]"
              }`}
            >
              {/* The selected row's accent edge — the state is also aria-pressed, and the heading below repeats the name. */}
              {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                  <span className="min-w-0 break-words">{p.name}</span>
                  {best && (
                    <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                      Best
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-white/50">{p.terms}</span>
              </span>
              <span className="max-w-[48%] shrink-0 text-right">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-white/40">{p.answer.label}</span>
                <span
                  className={`mt-0.5 block text-sm ${
                    p.answer.tone === "answer"
                      ? "font-mono font-semibold tabular-nums text-white"
                      : p.answer.tone === "problem"
                        ? "font-medium text-loss"
                        : "text-white/50"
                  }`}
                >
                  {p.answer.value}
                  {broken && <span aria-hidden> ›</span>}
                </span>
                {p.answer.fit && <FitLine fit={p.answer.fit} />}
                {p.gap && <span className="mt-0.5 block text-[11px] text-white/40">{p.gap}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
