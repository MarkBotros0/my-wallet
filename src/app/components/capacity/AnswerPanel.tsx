"use client";

import type { ReactNode } from "react";
import type { CalculatorInputs, PlanResult, SimulationResult } from "@/lib/capacity";
import type { Mode } from "@/app/lib/capacityForm";
import { topUpSentence } from "@/app/lib/dealText";
import { formatMoney } from "@/app/lib/format";
import { dealBreakdown } from "@/app/lib/moneyFlow";
import DealSummary, { Sentence } from "./DealSummary";
import MoneyFlowList from "./MoneyFlowList";

/**
 * The Answer tab: one figure first (the most you can pay, or the yearly
 * top-up — or why there is none), then "Where the money goes" with every
 * stream under its own heading, then the deal in sentences.
 */
export default function AnswerPanel({
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
    // A top-up result always carries its run; without one there is no sentence to say.
    const sentence = result.simulation
      ? topUpSentence({ topUp: result.topUp, blocker: result.blocker, simulation: result.simulation }, incomeFrequency, inputs.income.annualIncrease)
      : [];
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

