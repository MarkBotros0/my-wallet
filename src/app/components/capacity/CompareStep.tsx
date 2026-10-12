"use client";

import { useMemo } from "react";
import { purchaseOf, type CalculatorInputs, type PlanResult, type SimulationResult } from "@/lib/capacity";
import { planName, planTerms, type CapacityForm, type FormField, type Mode, type ParsedForm, type PlanForm } from "@/app/lib/capacityForm";
import { formatMoney } from "@/app/lib/format";
import { planAnswer, realErrors, type PlanAnswer } from "@/app/lib/planAnswer";
import AnswerPanel from "./AnswerPanel";
import BalanceChart from "./BalanceChart";
import PlanRanking, { type RankedPlan } from "./PlanRanking";
import ResultTabs, { tabPanelProps, type ResultTab } from "./ResultTabs";
import WhatIfPanel from "./WhatIfPanel";
import YearTable from "./YearTable";

/**
 * Step ③ — the plans side by side, then one plan in depth.
 *
 * The list (`PlanRanking`) answers "which way of buying is best?" at a
 * glance; the selected plan's detail answers "why?" in four tabs:
 *
 * - **Answer** — one figure first (the most you can pay, or the yearly
 *   top-up), then "Where the money goes": every stream under its own heading
 *   with its own signed rows and subtotal — savings, what you add, the
 *   developer or seller, the bank, extra costs — from what you start with to
 *   what you end with, nothing netted. Then the deal in sentences.
 * - **Over time** — the balance chart.
 * - **Year by year** — the same headings, one year at a time.
 * - **What if** — the return rate moving, the loan switched off, a price of
 *   your own.
 *
 * Every simulation here runs over the plans' common horizon, so every plan
 * ends on the same date and the figures compare.
 */
export default function CompareStep({
  form,
  parsed,
  results,
  best,
  horizon,
  currency,
  tab,
  onTab: setTab,
  onSelect,
  onReveal,
}: {
  form: CapacityForm;
  parsed: ParsedForm;
  results: Record<string, PlanResult | null>;
  best: string | null;
  horizon: number | null;
  currency: string;
  /** The detail's open tab — held by the calculator so a field reveal can open What if. */
  tab: ResultTab;
  onTab: (tab: ResultTab) => void;
  onSelect: (id: string) => void;
  /** Go to the step holding a field, open its plan, focus it. */
  onReveal: (field: FormField) => void;
}) {
  const { mode, plans } = form;
  const moneyBroken = parsed.moneyErrors.length > 0;

  const answerOf = (plan: PlanForm): PlanAnswer =>
    planAnswer({
      plan,
      mode,
      result: results[plan.id] ?? null,
      errors: parsed.plans.find((p) => p.id === plan.id)?.errors ?? [],
      moneyBroken,
      currency,
    });

  /** What a plan that cannot be answered needs, as the field to go to. */
  const fixFieldOf = (plan: PlanForm): FormField | null => {
    if (moneyBroken) return parsed.moneyErrors[0].field;
    const errors = realErrors(plan, mode, parsed.plans.find((p) => p.id === plan.id)?.errors ?? []);
    if (errors.length > 0) return errors[0].field;
    if (mode === "topUp" && plan.price.trim() === "") return `plan.${plan.id}.price`;
    return null;
  };

  const bestResult = best ? results[best] : null;
  const ranked: RankedPlan[] = plans.map((plan) => {
    const r = results[plan.id] ?? null;
    let gap: string | null = null;
    // A gap only between plans of one kind: cash to a seller is not a list price.
    const bestKind = plans.find((p) => p.id === best)?.kind;
    if (plans.length > 1 && best && plan.id !== best && r && bestResult && plan.kind === bestKind) {
      if (mode === "max" && r.price !== null && bestResult.price !== null && bestResult.price - r.price >= 1) {
        gap = `${formatMoney(bestResult.price - r.price, currency)} less`;
      } else if (mode === "topUp" && r.topUp !== null && bestResult.topUp !== null && r.topUp - bestResult.topUp >= 1) {
        gap = `${formatMoney(r.topUp - bestResult.topUp, currency)} a year more`;
      }
    }
    return { id: plan.id, name: planName(plan), terms: planTerms(plan), answer: answerOf(plan), gap };
  });

  const selected = plans.find((p) => p.id === form.selectedPlanId) ?? plans[0];
  const selectedParsed = parsed.plans.find((p) => p.id === selected.id);
  const answer = answerOf(selected);
  const fixField = fixFieldOf(selected);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="animate-rise">
        <h2 className="mb-2 px-1 text-xs font-medium text-white/60">
          {plans.length > 1
            ? mode === "max"
              ? "Your plans — the best lets you pay the most"
              : "Your plans — the best needs the least added"
            : "Your plan"}
        </h2>
        <PlanRanking
          plans={ranked}
          selectedId={selected.id}
          bestId={best}
          onSelect={onSelect}
          onFix={(id) => {
            const plan = plans.find((p) => p.id === id);
            const field = plan ? fixFieldOf(plan) : null;
            if (field) onReveal(field);
          }}
        />
      </div>

      <section aria-labelledby="compare-detail-title" className="min-w-0 animate-rise" style={{ animationDelay: "40ms" }}>
        <div className="mb-2 px-1">
          <h2 id="compare-detail-title" className="text-base font-semibold text-white">
            {planName(selected)}
          </h2>
          <p className="text-xs text-white/50">{planTerms(selected)}</p>
        </div>
        <ResultTabs value={tab} onChange={setTab} />
        <div {...tabPanelProps(tab)} tabIndex={0} className="surface mt-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 md:p-5">
          {fixField !== null || !selectedParsed?.inputs || horizon === null || !results[selected.id] ? (
            <Notice
              answer={answer}
              onFix={fixField ? () => onReveal(fixField) : undefined}
            />
          ) : (
            <Detail
              key={selected.id}
              tab={tab}
              mode={mode}
              plan={selected}
              inputs={selectedParsed.inputs}
              testPrice={selectedParsed.testPrice}
              result={results[selected.id]!}
              horizon={horizon}
              incomeFrequency={form.money.incomeFrequency}
              currency={currency}
              onTab={setTab}
            />
          )}
        </div>
      </section>
    </div>
  );
}

/** A plan that cannot be answered yet: what it needs, and the way there. */
function Notice({ answer, onFix }: { answer: PlanAnswer; onFix?: () => void }) {
  const text =
    answer.missing === "money"
      ? "Some of your money details need fixing before any plan can be worked out."
      : answer.missing === "plan"
        ? "This plan has a value that needs fixing."
        : answer.missing === "price"
          ? "Enter this plan's price to see how much you would need to add each year."
          : "This plan can't be worked out yet.";
  const action =
    answer.missing === "money" ? "Fix your money" : answer.missing === "price" ? "Enter a price" : "Fix this plan";
  return (
    <div className="py-4 text-center">
      <p className={`text-sm ${answer.tone === "problem" ? "text-loss" : "text-white/70"}`}>{text}</p>
      {onFix && (
        <button type="button" onClick={onFix} className="btn-primary mt-4 min-h-[44px] rounded-lg px-5 text-sm font-medium">
          {action}
        </button>
      )}
    </div>
  );
}

/**
 * The same inputs object for as long as its contents are the same. The form
 * re-parses on every keystroke — the test price, a plan's name — and the
 * What-if solvers (four binary searches each) must not re-run for that.
 */
function useStableInputs(inputs: CalculatorInputs): CalculatorInputs {
  const key = JSON.stringify(inputs);
  return useMemo(() => JSON.parse(key) as CalculatorInputs, [key]);
}

function Detail({
  tab,
  mode,
  plan,
  inputs: parsedInputs,
  testPrice,
  result,
  horizon,
  incomeFrequency,
  currency,
  onTab,
}: {
  tab: ResultTab;
  mode: Mode;
  plan: PlanForm;
  inputs: CalculatorInputs;
  testPrice: number | null;
  result: PlanResult;
  horizon: number;
  incomeFrequency: "monthly" | "yearly";
  currency: string;
  onTab: (tab: ResultTab) => void;
}) {
  const inputs = useStableInputs(parsedInputs);
  const resale = purchaseOf(inputs).kind === "resale";
  // The run the answer rests on: at the maximum (max mode) or at the least
  // top-up (top-up mode). A blocked top-up has a run, but it fails — it is
  // not a plan to draw.
  const sim: SimulationResult | null =
    mode === "max" ? (result.price === null ? null : result.simulation) : result.topUp === null ? null : result.simulation;
  const why =
    mode === "max"
      ? "Nothing is affordable with these numbers, so there is nothing to show here."
      : "No top-up can make this price work, so there is no plan to show here.";

  if (tab === "answer") {
    return (
      <AnswerPanel
        mode={mode}
        resale={resale}
        inputs={inputs}
        result={result}
        sim={sim}
        horizon={horizon}
        incomeFrequency={incomeFrequency}
        currency={currency}
        onWhatIf={() => onTab("whatif")}
      />
    );
  }
  if (tab === "time" || tab === "years") {
    if (!sim) return <OneLine text={why} onWhatIf={() => onTab("whatif")} />;
    if (tab === "time") {
      return (
        <div>
          <h3 className="text-sm font-semibold text-white">Your spendable savings, month by month</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-white/40">
            Touch or hover the chart for a month&apos;s money in and out. The dashed line is your minimum.
            {sim.loan && sim.loan.pledge > 0 && " The faint band on top is money locked as the bank's guarantee — yours, but not spendable."}
          </p>
          <div className="mt-3">
            <BalanceChart inputs={inputs} sim={sim} currency={currency} />
          </div>
        </div>
      );
    }
    return (
      <div>
        <h3 className="mb-1 text-sm font-semibold text-white">Year by year</h3>
        <YearTable
          years={sim.years}
          ctx={{ vehicle: inputs.savingsVehicle ?? "fund", kind: purchaseOf(inputs).kind, hasLoan: !!sim.loan && sim.loan.amount > 0 }}
          buffer={inputs.safetyBuffer}
          currency={currency}
        />
      </div>
    );
  }
  return (
    <WhatIfPanel
      mode={mode}
      plan={plan}
      inputs={inputs}
      testPrice={testPrice}
      result={result}
      horizon={horizon}
      currency={currency}
    />
  );
}

function OneLine({ text, onWhatIf }: { text: string; onWhatIf: () => void }) {
  return (
    <p className="py-2 text-sm text-white/60">
      {text}{" "}
      <button type="button" onClick={onWhatIf} className="min-h-[44px] cursor-pointer font-medium text-accent hover:underline">
        Try What if
      </button>
    </p>
  );
}
