"use client";

import { useState } from "react";
import { planName, type FormField, type Mode, type Step } from "@/app/lib/capacityForm";
import { useCapacityForm } from "@/app/lib/capacityFormStore";
import { isBlankPrice, planAnswer, realErrors } from "@/app/lib/planAnswer";
import { usePlanResults } from "@/app/lib/usePlanResults";
import { FormErrorsProvider, focusField, useVisibleErrors } from "./formErrors";
import LiveResult, { DesktopAnswer } from "./LiveResult";
import MoneyStep from "./MoneyStep";
import CompareStep from "./CompareStep";
import PlansStep from "./PlansStep";
import { type ResultTab } from "./ResultTabs";
import StepBar from "./StepBar";
import { Segmented } from "../ui";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Which step holds a field: the money block is step ①, the test price (What if) step ③, every other plan field step ②. */
function stepOf(field: FormField): Step {
  if (field.startsWith("money.")) return 1;
  return field.endsWith(".testPrice") ? 3 : 2;
}

/** `plan.<id>.<key>` → `<id>`. */
function planOf(field: FormField): string | null {
  return field.startsWith("plan.") ? field.slice(5, field.indexOf(".", 5)) : null;
}

/**
 * The Real Estate calculator — three steps instead of one long form.
 *
 * ① Your money (entered once) → ② Plans (the ways of buying, each answering
 * live) → ③ Compare. Above the steps, one question: find the most I can pay
 * ("Max price") or, for prices I already have, how much I would need to add
 * each year ("Yearly top-up"). Everything persists per device through
 * `useCapacityForm`, the step and the selected plan included.
 *
 * Errors: `parseForm` says WHAT, each field shows it beneath itself (WHEN is
 * `useVisibleErrors`), a step holding a problem wears a red dot, and the
 * sticky answer — a strip under the nav on a phone, the end of the sticky
 * step header on a desktop — counts the problems that stop the selected
 * plan and its Fix goes to the step, opens the plan, and focuses the field.
 * A blank price in top-up mode is not an error: it is asked for in words.
 */
export default function CapacityCalculator() {
  const [form, update, reset] = useCapacityForm();
  const { parsed, results, best, horizon } = usePlanResults(form);
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const [compareTab, setCompareTab] = useState<ResultTab>("answer");
  const currency = form.money.currency.trim().toUpperCase() || "EGP";

  // A blank top-up price is a question not yet answered: never red, never counted.
  const quiet = new Set<string>(
    form.plans.filter((p) => isBlankPrice(p, form.mode)).map((p) => `plan.${p.id}.price`),
  );
  const byField: typeof parsed.byField = {};
  for (const [field, message] of Object.entries(parsed.byField) as [FormField, string][]) {
    if (!quiet.has(field)) byField[field] = message;
  }
  const errors = parsed.errors.filter((e) => !quiet.has(e.field));
  const visible = useVisibleErrors(byField);

  const selected = form.plans.find((p) => p.id === form.selectedPlanId) ?? form.plans[0];
  const selectedParsed = parsed.plans.find((p) => p.id === selected.id);
  const moneyBroken = parsed.moneyErrors.length > 0;
  const answer = planAnswer({
    plan: selected,
    mode: form.mode,
    result: results[selected.id] ?? null,
    errors: selectedParsed?.errors ?? [],
    moneyBroken,
    currency,
  });
  // What stops the selected plan: the money step's problems and its own.
  const blocking = [...parsed.moneyErrors, ...realErrors(selected, form.mode, selectedParsed?.errors ?? [])];

  const scrollToTop = () =>
    requestAnimationFrame(() =>
      document.getElementById("calculator")?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" }),
    );

  const goTo = (step: Step) => {
    if (step !== form.step) update({ step });
    scrollToTop();
  };

  /** Go to the step holding a field, open its plan, then focus it once it has rendered. */
  const reveal = (field: FormField) => {
    const plan = planOf(field);
    if (plan) {
      if (field.endsWith(".testPrice")) setCompareTab("whatif");
      else setOpenPlan(plan);
      update({ step: stepOf(field), selectedPlanId: plan });
    } else {
      update({ step: stepOf(field) });
    }
    requestAnimationFrame(() => requestAnimationFrame(() => focusField(field)));
  };

  const fix = () => {
    if (blocking.length > 0) reveal(blocking[0].field);
    else if (answer.missing === "price") reveal(`plan.${selected.id}.price`);
  };

  const stepHasError = (step: Step) =>
    errors.some((e) => stepOf(e.field) === step && visible.errorFor(e.field) !== undefined);

  const resetAll = () => {
    if (!confirm("Start again from the examples? Everything you typed here will be lost.")) return;
    reset();
    visible.reset();
    setOpenPlan(null);
  };

  const strip = {
    name: planName(selected),
    answer,
    errorCount: blocking.length,
    onFix: fix,
    onCompare: () => goTo(3),
  };

  return (
    <FormErrorsProvider value={visible}>
      {/* Step ③ puts the plans beside the detail from lg:, so it takes the width. */}
      <div className={`mx-auto px-4 py-6 md:py-8 ${form.step === 3 ? "max-w-3xl lg:max-w-6xl" : "max-w-3xl"}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Real Estate</h1>
            <p className="mt-1 text-sm text-white/50">What can you afford — and which way of buying is best?</p>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="min-h-[44px] shrink-0 cursor-pointer rounded-lg border border-white/10 px-3 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white active:bg-white/10"
          >
            Start again
          </button>
        </div>

        <div className="surface mb-4 p-4 md:p-5">
          <span className="mb-2 block text-xs font-medium text-white/60">What do you want to know?</span>
          <Segmented<Mode>
            ariaLabel="What to work out"
            value={form.mode}
            onChange={(mode) => update({ mode })}
            options={[
              { value: "max", label: "Max price" },
              { value: "topUp", label: "Yearly top-up" },
            ]}
          />
          <p className="mt-2 text-xs leading-snug text-white/50">
            {form.mode === "max"
              ? "The most each plan lets you pay without your savings dropping too low."
              : "For a price you already have, how much you would need to add each year to make it work."}
          </p>
        </div>

        {/* One tall parent for the sticky strip/header, so they stick through every step. */}
        <div id="calculator" style={{ scrollMarginTop: "calc(var(--top-nav-clearance) + 8px)" }}>
          <div className="mb-3">
            <LiveResult {...strip} />
          </div>

          {/* On a desktop the step bar and the answer stay in sight as one sticky header. */}
          <div
            className="lg:sticky lg:z-40 lg:-mx-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:gap-3 lg:rounded-2xl lg:bg-charcoal-dark/85 lg:px-3 lg:py-2 lg:backdrop-blur-xl"
            style={{ top: "calc(var(--top-nav-clearance) + 8px)" }}
          >
            <StepBar step={form.step} onStep={goTo} hasError={stepHasError} />
            <DesktopAnswer {...strip} />
          </div>

          <div className="mt-5">
          {form.step === 1 && (
            <>
              <MoneyStep money={form.money} currency={currency} />
              <StepNav next={{ label: "Next: Plans", onClick: () => goTo(2) }} />
            </>
          )}

          {form.step === 2 && (
            <>
              <PlansStep
                form={form}
                parsed={parsed}
                results={results}
                best={best}
                currency={currency}
                openPlan={openPlan}
                onOpenPlan={setOpenPlan}
                onSelect={(selectedPlanId) => update({ selectedPlanId })}
              />
              <StepNav
                back={{ label: "Back", onClick: () => goTo(1) }}
                next={{ label: "Next: Compare", onClick: () => goTo(3) }}
              />
            </>
          )}

          {form.step === 3 && (
            <>
              <CompareStep
                form={form}
                parsed={parsed}
                results={results}
                best={best}
                horizon={horizon}
                currency={currency}
                tab={compareTab}
                onTab={setCompareTab}
                onSelect={(selectedPlanId) => {
                  setOpenPlan(null);
                  update({ selectedPlanId });
                }}
                onReveal={reveal}
              />
              <StepNav back={{ label: "Back to plans", onClick: () => goTo(2) }} />
            </>
          )}
          </div>
        </div>

        <p className="mt-8 px-1 text-xs text-white/40">
          Estimates assume constant rates. Fund and certificate returns vary and are not guaranteed; bank fees, early
          repayment and tax on certificate interest are not modelled.
        </p>
      </div>
    </FormErrorsProvider>
  );
}

/** Back (quiet) and Next (the step's one primary action) at the foot of a step. */
function StepNav({
  back,
  next,
}: {
  back?: { label: string; onClick: () => void };
  next?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mt-6 flex items-center gap-3">
      {back && (
        <button
          type="button"
          onClick={back.onClick}
          className="pressable min-h-[44px] cursor-pointer rounded-lg border border-white/10 px-4 text-sm text-white/70 hover:bg-white/5 hover:text-white"
        >
          {back.label}
        </button>
      )}
      {next && (
        <button
          type="button"
          onClick={next.onClick}
          className="btn-primary ml-auto min-h-[44px] flex-1 rounded-lg px-4 text-sm font-medium sm:flex-none sm:px-6"
        >
          {next.label}
        </button>
      )}
    </div>
  );
}
