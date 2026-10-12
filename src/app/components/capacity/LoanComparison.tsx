import { purchaseOf, type CalculatorInputs, type Comparison, type SimulationResult } from "@/lib/capacity";
import { loanVerdict } from "@/app/lib/dealText";
import { formatMoney } from "@/app/lib/format";
import { Card } from "../ui";

/**
 * "Is the loan worth it?" — one verdict line, one line of why, then the
 * same five rows for each side. A comparison is a position, not money
 * moving, so nothing here is green or red; the larger figure carries a small
 * "higher" tag instead.
 */
export default function LoanComparison({
  inputs,
  comparison,
  currency,
}: {
  inputs: CalculatorInputs;
  comparison: Comparison;
  currency: string;
}) {
  const v = loanVerdict(inputs, comparison);
  const money = (n: number) => formatMoney(n, currency);
  const figure = (n: number) => formatMoney(n, "");
  const a = comparison.withLoan;
  const b = comparison.withoutLoan;
  const otherLabel = purchaseOf(inputs).kind === "developer-cash" ? "Installments" : "Without loan";

  const headline =
    v.kind === "loan-better"
      ? `The loan lets you afford ${money(v.difference)} more.`
      : v.kind === "no-loan-better"
        ? `Without the loan you can afford ${money(-v.difference)} more.`
        : v.kind === "same"
          ? "Same either way — the loan only changes when you pay."
          : "Neither works with these numbers.";
  const why = [
    `Interest ${money(v.interest)}`,
    `your certificates earn back ${money(v.certificateInterest)} while pledged`,
    ...(v.discountSaved > 0 ? [`the cash discount saves ${money(v.discountSaved)}`] : []),
  ].join(" · ");

  const sim = (s: SimulationResult | null, pick: (s: SimulationResult) => number) => (s ? pick(s) : null);
  const rows: { label: string; with: number | null; without: number | null; compare: boolean }[] = [
    { label: "Max you can afford", with: a.maxPrice, without: b.maxPrice, compare: true },
    { label: "Lowest balance", with: sim(a.simulation, (s) => s.minBalance), without: sim(b.simulation, (s) => s.minBalance), compare: true },
    { label: "Ends with", with: sim(a.simulation, (s) => s.finalBalance), without: sim(b.simulation, (s) => s.finalBalance), compare: true },
    { label: "Interest paid", with: sim(a.simulation, (s) => s.loan?.totalInterest ?? 0), without: 0, compare: false },
    { label: "Net cost of the loan", with: sim(a.simulation, (s) => s.loan?.netCost ?? 0), without: null, compare: false },
  ];

  return (
    <Card className="animate-rise" style={{ animationDelay: "80ms" }}>
      <h2 className="text-base font-semibold text-white" aria-live="polite">{headline}</h2>
      {v.kind !== "neither" && <p className="mt-1 text-xs leading-snug text-white/50">{why}.</p>}

      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 text-xs">
        <dt className="pb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">Measure</dt>
        <dd className="pb-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-white/40">With loan</dd>
        <dd className="pb-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-white/40">{otherLabel}</dd>
        {rows.map((r) => {
          const higher = r.compare && r.with !== null && r.without !== null && Math.abs(r.with - r.without) >= 1;
          const cell = (key: string, n: number | null, tag: boolean) => (
            <dd key={key} className="border-t border-white/5 py-2 text-right font-mono tabular-nums text-white">
              {n === null ? <span className="text-white/40">{r.label.startsWith("Max") ? "Nothing" : "—"}</span> : figure(n)}
              {tag && <span className="ml-1.5 rounded bg-white/10 px-1 py-px font-sans text-[10px] text-white/70">higher</span>}
            </dd>
          );
          return [
            <dt key={`${r.label}-l`} className="border-t border-white/5 py-2 text-white/60">{r.label}</dt>,
            cell(`${r.label}-a`, r.with, higher && r.with! > r.without!),
            cell(`${r.label}-b`, r.without, higher && r.without! > r.with!),
          ];
        })}
      </dl>
      <p className="mt-2 text-[11px] text-white/40">All figures in {currency}, over {comparison.horizonYears} years.</p>
    </Card>
  );
}
