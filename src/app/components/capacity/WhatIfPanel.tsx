"use client";

import { useMemo, type ReactNode } from "react";
import {
  compare,
  compareTopUp,
  purchaseOf,
  sensitivity,
  simulate,
  topUpSensitivity,
  type CalculatorInputs,
  type PlanResult,
} from "@/lib/capacity";
import type { Mode, PlanForm } from "@/app/lib/capacityForm";
import { updatePlan } from "@/app/lib/capacityFormStore";
import { formatMoney } from "@/app/lib/format";
import { dealBreakdown } from "@/app/lib/moneyFlow";
import { CalcField } from "./formErrors";
import LoanComparison from "./LoanComparison";
import MoneyFlowList from "./MoneyFlowList";
import SensitivityTable from "./SensitivityTable";

/**
 * The What if tab: the answer at other return rates, with and without the
 * plan's loan, and (max mode) one price of the user's own.
 */
export default function WhatIfPanel({
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
