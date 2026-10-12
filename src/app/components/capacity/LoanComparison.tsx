import type { ReactNode } from "react";
import type { CalculatorInputs, Comparison, SimulationResult, TopUpResult } from "@/lib/capacity";
import { loanVerdict, loanVerdictTopUp } from "@/app/lib/dealText";
import { formatMoney } from "@/app/lib/format";
import { Sentence } from "./DealSummary";

type Props =
  | { mode: "max"; inputs: CalculatorInputs; comparison: Comparison; currency: string }
  | {
      mode: "topUp";
      comparison: { horizonYears: number; withLoan: TopUpResult; withoutLoan: TopUpResult };
      currency: string;
    };

interface Line {
  label: string;
  with: number | null;
  without: number | null;
  /** Mark the better side: "higher" or "lower" is better; null = not a contest. */
  better: "higher" | "lower" | null;
  /** What a null shows. */
  none?: string;
}

/**
 * "Is the loan worth it?" — one verdict line, one line of why, then the same
 * rows for each side. A comparison is a position, not money moving, so the
 * table stays neutral; the better figure carries a small word tag instead.
 */
export default function LoanComparison(props: Props) {
  const { currency } = props;
  const money = (n: number) => formatMoney(n, currency);
  const figure = (n: number) => formatMoney(n, "");
  const sim = (s: SimulationResult | null | undefined, pick: (s: SimulationResult) => number) => (s ? pick(s) : null);

  let headline: ReactNode;
  let why: string | null;
  let lines: Line[];
  if (props.mode === "max") {
    const c = props.comparison;
    const v = loanVerdict(props.inputs, c);
    headline =
      v.kind === "loan-better"
        ? `The loan lets you pay ${money(v.difference)} more.`
        : v.kind === "no-loan-better"
          ? `Without the loan you can pay ${money(-v.difference)} more.`
          : v.kind === "same"
            ? "About the same either way — the loan changes when you pay, not how much."
            : "Neither works with these numbers.";
    why = v.kind === "neither" || c.withLoan.maxPrice === null
      ? null
      : `The bank charges ${money(v.interest)} in interest; the guarantee earns ${money(v.certificateInterest)} back while it is locked.`;
    const a = c.withLoan.simulation;
    const b = c.withoutLoan.simulation;
    lines = [
      { label: "Most you can pay", with: c.withLoan.maxPrice, without: c.withoutLoan.maxPrice, better: "higher", none: "Nothing" },
      { label: "Lowest balance", with: sim(a, (s) => s.minBalance), without: sim(b, (s) => s.minBalance), better: null },
      { label: "You end with", with: sim(a, (s) => s.finalBalance), without: sim(b, (s) => s.finalBalance), better: "higher" },
      { label: "Interest to the bank", with: sim(a, (s) => s.loan?.totalInterest ?? 0), without: b ? 0 : null, better: null },
      { label: "Interest on the guarantee", with: sim(a, (s) => s.loan?.certificateInterest ?? 0), without: b ? 0 : null, better: null },
    ];
  } else {
    const c = props.comparison;
    const v = loanVerdictTopUp(c);
    headline = <Sentence parts={v.headline} currency={currency} />;
    why = v.kind === "neither" ? null : `The bank charges ${money(v.interest)} in interest; the guarantee earns ${money(v.certificateInterest)} back while it is locked.`;
    const ok = (r: TopUpResult) => (r.topUp === null ? null : r.simulation);
    lines = [
      { label: "Add each year", with: c.withLoan.topUp, without: c.withoutLoan.topUp, better: "lower", none: "Can't work" },
      { label: "Lowest balance", with: sim(ok(c.withLoan), (s) => s.minBalance), without: sim(ok(c.withoutLoan), (s) => s.minBalance), better: null },
      { label: "You end with", with: sim(ok(c.withLoan), (s) => s.finalBalance), without: sim(ok(c.withoutLoan), (s) => s.finalBalance), better: "higher" },
      { label: "Interest to the bank", with: c.withLoan.simulation.loan?.totalInterest ?? 0, without: 0, better: null },
      { label: "Interest on the guarantee", with: c.withLoan.simulation.loan?.certificateInterest ?? 0, without: 0, better: null },
    ];
  }

  return (
    <div>
      <p className="text-sm font-semibold leading-snug text-white">{headline}</p>
      {why && <p className="mt-1 text-xs leading-snug text-white/50">{why}</p>}

      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-white/40">
            <th scope="col" className="pb-1.5 text-left font-medium"><span className="sr-only">Measure</span></th>
            <th scope="col" className="pb-1.5 pl-2 text-right font-medium">With the loan</th>
            <th scope="col" className="pb-1.5 pl-2 text-right font-medium">Without the loan</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {lines.map((r) => {
            const contest = r.better !== null && r.with !== null && r.without !== null && Math.abs(r.with - r.without) >= 1;
            const wins = (mine: number | null, theirs: number | null) =>
              contest && mine !== null && theirs !== null && (r.better === "higher" ? mine > theirs : mine < theirs);
            const cell = (n: number | null, tag: boolean) => (
              <td className="border-t border-white/5 py-2 pl-2 text-right text-white">
                {n === null ? <span className="font-sans text-white/40">{r.none ?? "—"}</span> : figure(n)}
                {tag && <span className="ml-1.5 rounded bg-white/10 px-1 py-px font-sans text-[10px] text-white/70">better</span>}
              </td>
            );
            return (
              <tr key={r.label}>
                <th scope="row" className="border-t border-white/5 py-2 text-left font-sans font-normal text-white/60">{r.label}</th>
                {cell(r.with, wins(r.with, r.without))}
                {cell(r.without, wins(r.without, r.with))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-white/40">All figures in {currency}, over {props.comparison.horizonYears} years.</p>
    </div>
  );
}
