"use client";

import type { PlanResult } from "@/lib/capacity";
import { MAX_PLANS, newPlan, planId, planName, planTerms, type CapacityForm, type ParsedForm } from "@/app/lib/capacityForm";
import { setPlans, updatePlan } from "@/app/lib/capacityFormStore";
import { planAnswer } from "@/app/lib/planAnswer";
import PlanCard from "./PlanCard";
import PlanEditor from "./PlanEditor";

/**
 * Step ② — the ways of buying being weighed, one card each with its answer
 * live. One editor is open at a time, inline under its card; opening one also
 * selects that plan, so the sticky answer follows what is being edited.
 */
export default function PlansStep({
  form,
  parsed,
  results,
  best,
  currency,
  openPlan,
  onOpenPlan,
  onSelect,
}: {
  form: CapacityForm;
  parsed: ParsedForm;
  results: Record<string, PlanResult | null>;
  best: string | null;
  currency: string;
  openPlan: string | null;
  onOpenPlan: (id: string | null) => void;
  /** Select without marking the examples edited — opening a plan is not changing it. */
  onSelect: (id: string) => void;
}) {
  const { plans, mode } = form;
  const moneyBroken = parsed.moneyErrors.length > 0;

  const open = (id: string) => {
    onOpenPlan(id);
    onSelect(id);
  };

  const add = () => {
    const plan = newPlan(planId(plans));
    setPlans([...plans, plan], plan.id);
    onOpenPlan(plan.id);
  };

  const duplicate = (id: string) => {
    const i = plans.findIndex((p) => p.id === id);
    const source = plans[i];
    const copy = { ...source, id: planId(plans), name: source.name.trim() ? `${source.name.trim()} (copy)` : "" };
    setPlans([...plans.slice(0, i + 1), copy, ...plans.slice(i + 1)], copy.id);
    onOpenPlan(copy.id);
  };

  const remove = (id: string) => {
    const plan = plans.find((p) => p.id === id);
    if (!plan || !confirm(`Delete "${planName(plan)}"?`)) return;
    const rest = plans.filter((p) => p.id !== id);
    setPlans(rest, form.selectedPlanId === id ? rest[0].id : undefined);
    if (openPlan === id) onOpenPlan(null);
  };

  return (
    <div className="space-y-3">
      {!form.examplesEdited && (
        <p className="rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3 text-sm leading-snug text-white/80">
          Example plans — replace them with your developer&apos;s offers.
        </p>
      )}

      {plans.map((plan) => {
        const parsedPlan = parsed.plans.find((p) => p.id === plan.id);
        const editing = openPlan === plan.id;
        return (
          <PlanCard
            key={plan.id}
            name={planName(plan)}
            terms={planTerms(plan)}
            answer={planAnswer({
              plan,
              mode,
              result: results[plan.id] ?? null,
              errors: parsedPlan?.errors ?? [],
              moneyBroken,
              currency,
            })}
            best={plans.length > 1 && best === plan.id}
            editing={editing}
            onEdit={() => (editing ? onOpenPlan(null) : open(plan.id))}
            onDuplicate={plans.length < MAX_PLANS ? () => duplicate(plan.id) : undefined}
            onDelete={plans.length > 1 ? () => remove(plan.id) : undefined}
          >
            {editing && (
              <PlanEditor
                plan={plan}
                mode={mode}
                currency={currency}
                result={results[plan.id] ?? null}
                onChange={(patch) => updatePlan(plan.id, patch)}
                onDone={() => onOpenPlan(null)}
              />
            )}
          </PlanCard>
        );
      })}

      {plans.length < MAX_PLANS ? (
        <button
          type="button"
          onClick={add}
          className="pressable flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-sm font-medium text-accent hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
          Add a plan
        </button>
      ) : (
        <p className="px-1 text-xs text-white/40">{MAX_PLANS} plans is the most you can compare at once.</p>
      )}
    </div>
  );
}
