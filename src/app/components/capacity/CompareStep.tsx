"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  compare,
  compareTopUp,
  purchaseOf,
  sensitivity,
  simulate,
  topUpSensitivity,
  type CalculatorInputs,
  type PlanResult,
  type SimulationResult,
} from "@/lib/capacity";
import { planName, planTerms, type CapacityForm, type FormField, type ParsedForm, type PlanForm } from "@/app/lib/capacityForm";
import { updatePlan } from "@/app/lib/capacityFormStore";
import { topUpSentence } from "@/app/lib/dealText";
import { formatMoney } from "@/app/lib/format";
import { dealBreakdown } from "@/app/lib/moneyFlow";
import { planAnswer, realErrors, type PlanAnswer } from "@/app/lib/planAnswer";
import BalanceChart from "./BalanceChart";
import DealSummary, { Sentence } from "./DealSummary";
import { CalcField } from "./formErrors";
import LoanComparison from "./LoanComparison";
import MoneyFlowList from "./MoneyFlowList";
import PlanRanking, { type RankedPlan } from "./PlanRanking";
import ResultTabs, { tabPanelProps, type ResultTab } from "./ResultTabs";
import SensitivityTable from "./SensitivityTable";
import YearTable from "./YearTable";

type Mode = CapacityForm["mode"];

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
  onSelect,
  onReveal,
}: {
  form: CapacityForm;
  parsed: ParsedForm;
  results: Record<string, PlanResult | null>;
  best: string | null;
  horizon: number | null;
  currency: string;
  onSelect: (id: string) => void;
  /** Go to the step holding a field, open its plan, focus it. */
  onReveal: (field: FormField) => void;
}) {
  const [tab, setTab] = useState<ResultTab>("answer");
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

function AnswerPanel({
  mode,
  resale,
  inputs,
  result,
  sim,
  horizon,
  incomeFrequency,
  currency,
  onWhatIf,
}: {
  mode: Mode;
  resale: boolean;
  inputs: CalculatorInputs;
  result: PlanResult;
  sim: SimulationResult | null;
  horizon: number;
  incomeFrequency: "monthly" | "yearly";
  currency: string;
  onWhatIf: () => void;
}) {
  const money = (n: number) => formatMoney(n, currency);
  const keep = inputs.minKeptShare * inputs.startingCapital;
  const floor = inputs.safetyBuffer > 0 ? `never below ${money(inputs.safetyBuffer)}` : "never running out";
  const safety = `Over ${horizon} ${horizon === 1 ? "year" : "years"}, ${floor}${keep > 0 ? `, ending with at least ${money(keep)}` : ""}.`;

  let hero: ReactNode;
  if (mode === "max") {
    const label = resale ? "Most you can pay the seller" : "Most you can pay";
    hero =
      result.price === null ? (
        <Hero label={label} value="Nothing affordable" muted>
          Even a very small price would take your savings below your minimum.{" "}
          <button type="button" onClick={onWhatIf} className="min-h-[44px] cursor-pointer font-medium text-accent hover:underline">
            See what would change it
          </button>
        </Hero>
      ) : (
        <Hero label={label} value={money(result.price)}>
          {safety}
        </Hero>
      );
  } else {
    const price = result.price ?? 0;
    const forPrice = `For ${resale ? "cash to the seller of" : "a price of"} ${money(price)}.`;
    const sentence = topUpSentence(
      { topUp: result.topUp, blocker: result.blocker, simulation: result.simulation! },
      currency,
      incomeFrequency,
      inputs.income.annualIncrease,
    );
    hero =
      result.topUp === null ? (
        <Hero label="Add each year" value="Can't work" problem>
          <span className="text-loss/90">
            <Sentence parts={sentence} currency={currency} />
          </span>{" "}
          {forPrice}
        </Hero>
      ) : result.topUp <= 0 ? (
        <Hero label="Add each year" value={money(0)} note="You're already covered">
          <Sentence parts={sentence} currency={currency} /> {forPrice}
        </Hero>
      ) : (
        <Hero label="Add each year" value={money(result.topUp)} note="on top of your income">
          <Sentence parts={sentence} currency={currency} /> {forPrice} {safety}
        </Hero>
      );
  }

  // The deal in sentences still reads right for a blocked top-up: it is the
  // deal that cannot work, at no top-up.
  const dealSim = sim ?? (mode === "topUp" ? result.simulation : null);
  const b = sim ? dealBreakdown(inputs, sim) : null;

  return (
    <div className="space-y-6">
      {hero}

      {b && (
        <section>
          <h3 className="text-sm font-semibold text-white">Where the money goes</h3>
          <p className="mt-0.5 mb-3 text-[11px] leading-snug text-white/40">
            Over {horizon} {horizon === 1 ? "year" : "years"}, in {currency}. <span className="text-gain">+</span> came into
            your savings, <span className="text-loss">−</span> left them. Each heading is added up on its own.
          </p>
          <MoneyFlowList start={b.start} groups={b.groups} end={b.end} currency={currency} />
        </section>
      )}

      {dealSim && (
        <DealSummary
          inputs={inputs}
          sim={dealSim}
          caption={mode === "max" ? "At the most you can pay." : "At the price you entered."}
          currency={currency}
        />
      )}
    </div>
  );
}

function Hero({
  label,
  value,
  note,
  muted = false,
  problem = false,
  children,
}: {
  label: string;
  value: string;
  /** A few words beside the figure ("on top of your income"). */
  note?: string;
  muted?: boolean;
  problem?: boolean;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={
            problem
              ? "text-3xl font-semibold text-loss"
              : muted
                ? "text-3xl font-semibold text-white/60"
                : "font-mono text-4xl font-semibold tabular-nums tracking-tight text-white lg:text-5xl"
          }
        >
          {value}
        </span>
        {note && <span className="text-sm text-white/60">{note}</span>}
      </div>
      {children && <p className="mt-2 text-sm leading-relaxed text-white/60">{children}</p>}
    </div>
  );
}

function WhatIfPanel({
  mode,
  plan,
  inputs,
  testPrice,
  result,
  horizon,
  currency,
}: {
  mode: Mode;
  plan: PlanForm;
  inputs: CalculatorInputs;
  testPrice: number | null;
  result: PlanResult;
  horizon: number;
  currency: string;
}) {
  const certificate = inputs.savingsVehicle === "certificate";
  const price = result.price;
  const hasLoan = !!inputs.loan?.enabled;

  const rates = useMemo(
    () =>
      mode === "max"
        ? sensitivity(inputs, undefined, undefined, horizon).map((r) => ({ ...r, value: r.maxPrice }))
        : price === null
          ? []
          : topUpSensitivity(inputs, price, undefined, undefined, horizon).map((r) => ({ ...r, value: r.topUp })),
    [mode, inputs, price, horizon],
  );

  const loan = useMemo(() => {
    if (!hasLoan) return null;
    if (mode === "max") return { mode, comparison: compare(inputs, null, undefined, horizon) } as const;
    return price === null ? null : ({ mode, comparison: compareTopUp(inputs, price, undefined, horizon) } as const);
  }, [hasLoan, mode, inputs, price, horizon]);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-white">If the {certificate ? "certificate rate" : "fund's return"} changes</h3>
        <p className="mt-0.5 mb-3 text-[11px] leading-snug text-white/40">
          Returns are not guaranteed. This is how much the answer leans on them.
        </p>
        <SensitivityTable
          rows={rates}
          mode={mode}
          rateLabel={certificate ? "Certificate rate" : "Fund return"}
          currency={currency}
        />
      </section>

      {loan && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">With and without the loan</h3>
          {loan.mode === "max" ? (
            <LoanComparison mode="max" inputs={inputs} comparison={loan.comparison} currency={currency} />
          ) : (
            <LoanComparison mode="topUp" comparison={loan.comparison} currency={currency} />
          )}
        </section>
      )}

      {mode === "max" && (
        <CheckPrice plan={plan} inputs={inputs} testPrice={testPrice} horizon={horizon} currency={currency} />
      )}
    </div>
  );
}

/** "Check a price": one price of your own, run through the same plan. */
function CheckPrice({
  plan,
  inputs,
  testPrice,
  horizon,
  currency,
}: {
  plan: PlanForm;
  inputs: CalculatorInputs;
  testPrice: number | null;
  horizon: number;
  currency: string;
}) {
  const resale = purchaseOf(inputs).kind === "resale";
  const sim = useMemo(
    () => (testPrice === null ? null : simulate(inputs, testPrice, horizon)),
    [inputs, testPrice, horizon],
  );
  const money = (n: number) => formatMoney(n, currency);
  const b = sim ? dealBreakdown(inputs, sim) : null;

  let verdict: ReactNode = null;
  if (sim) {
    if (sim.feasible) {
      verdict = (
        <p className="text-sm text-white">
          <span className="font-semibold">This price works.</span>{" "}
          <span className="text-white/60">
            Your savings never go below {money(sim.minBalance)} and end at {money(sim.finalBalance)}.
          </span>
        </p>
      );
    } else if (sim.firstBreach) {
      verdict = (
        <p className="text-sm">
          <span className="font-semibold text-loss">This price doesn&apos;t work.</span>{" "}
          <span className="text-white/60">
            {sim.firstBreach.month === 0
              ? `Paying now leaves you ${money(sim.firstBreach.shortfall)} short of your minimum.`
              : `In month ${sim.firstBreach.month} your savings fall ${money(sim.firstBreach.shortfall)} below your minimum.`}
          </span>
        </p>
      );
    } else if (sim.endShortfall) {
      verdict = (
        <p className="text-sm">
          <span className="font-semibold text-loss">This price doesn&apos;t work.</span>{" "}
          <span className="text-white/60">
            You would end {money(sim.endShortfall.shortfall)} short of what you want to keep.
          </span>
        </p>
      );
    }
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-white">Check a price</h3>
      <p className="mt-0.5 mb-3 text-[11px] leading-snug text-white/40">
        Have a {resale ? "seller's asking price" : "price"} in mind? See how this plan carries it.
      </p>
      <CalcField
        field={`plan.${plan.id}.testPrice`}
        label={resale ? "Cash to the seller" : "Price"}
        value={plan.testPrice}
        onChange={(testPrice) => updatePlan(plan.id, { testPrice })}
        suffix={currency}
        placeholder="e.g. 8,000,000"
        group
        className="sm:max-w-xs"
      />
      {verdict && (
        <div className="mt-3" aria-live="polite">
          {verdict}
        </div>
      )}
      {b && (
        <details className="group mt-3">
          <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1 text-xs font-medium text-accent [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m6 4 4 4-4 4" />
            </svg>
            Where the money goes at this price
          </summary>
          <div className="mt-2">
            <MoneyFlowList start={b.start} groups={b.groups} end={b.end} currency={currency} />
          </div>
        </details>
      )}
    </section>
  );
}
