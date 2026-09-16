"use client";

import type { YearSummary } from "@/lib/capacity";
import { formatMoney } from "@/app/lib/format";

/**
 * Year by year: what the fund earned, what came in, what went out, where it
 * ended and how low it got. A row whose lowest balance dipped under the buffer
 * is tinted `loss` — a real bad outcome, so it earns the colour.
 *
 * Money in (returns, income) and money out (installments, extra costs) are
 * signed and coloured by direction, per the design-system rule; opening,
 * closing and lowest are positions, not flows, and stay neutral.
 */
export default function YearTable({
  years,
  buffer,
  currency,
}: {
  years: YearSummary[];
  buffer: number;
  currency: string;
}) {
  const money = (n: number) => formatMoney(n, "");
  const inflow = (n: number) => (n === 0 ? <span className="text-white/30">—</span> : <span className="text-gain/80">+{money(n)}</span>);
  const outflow = (n: number) => (n === 0 ? <span className="text-white/30">—</span> : <span className="text-loss/80">−{money(n)}</span>);
  const lowestCell = (y: YearSummary) => (
    <span className={y.breached ? "font-semibold text-loss" : ""}>{money(y.lowest)}</span>
  );

  return (
    <>
      <p className="mb-3 text-[11px] text-white/40">
        All figures in {currency}. Lowest is the lowest end-of-month balance in that year; the buffer is{" "}
        {formatMoney(buffer, currency)}.
      </p>

      {/* Mobile: one card per year */}
      <div className="space-y-2 md:hidden">
        {years.map((y) => (
          <div
            key={y.year}
            className={`rounded-xl border p-3 ${
              y.breached ? "border-loss/30 bg-loss/10" : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-white">Year {y.year}</span>
              {y.breached && <span className="text-[11px] font-medium text-loss">Below buffer</span>}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <Row label="Opening" value={money(y.opening)} />
              <Row label="Closing" value={money(y.closing)} />
              <Row label="Returns" value={inflow(y.returns)} />
              <Row label="Income" value={inflow(y.income)} />
              <Row label="Installments" value={outflow(y.installments)} />
              <Row label="Extra costs" value={outflow(y.extraCosts)} />
              <Row label="Lowest" value={lowestCell(y)} />
            </dl>
          </div>
        ))}
      </div>

      {/* Desktop: the table */}
      <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-left uppercase tracking-wide text-white/40">
              <th className="px-3 py-2.5 font-medium">Year</th>
              <th className="px-3 py-2.5 text-right font-medium">Opening</th>
              <th className="px-3 py-2.5 text-right font-medium">Returns</th>
              <th className="px-3 py-2.5 text-right font-medium">Income</th>
              <th className="px-3 py-2.5 text-right font-medium">Installments</th>
              <th className="px-3 py-2.5 text-right font-medium">Extra costs</th>
              <th className="px-3 py-2.5 text-right font-medium">Closing</th>
              <th className="px-3 py-2.5 text-right font-medium">Lowest</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {years.map((y) => (
              <tr
                key={y.year}
                className={`border-b border-white/5 last:border-0 ${
                  y.breached ? "bg-loss/10" : "hover:bg-white/[0.02]"
                }`}
              >
                <td className="px-3 py-2 font-sans text-white/70">
                  {y.year}
                  {y.breached && <span className="ml-2 text-[10px] font-medium text-loss">below buffer</span>}
                </td>
                <td className="px-3 py-2 text-right text-white/80">{money(y.opening)}</td>
                <td className="px-3 py-2 text-right">{inflow(y.returns)}</td>
                <td className="px-3 py-2 text-right">{inflow(y.income)}</td>
                <td className="px-3 py-2 text-right">{outflow(y.installments)}</td>
                <td className="px-3 py-2 text-right">{outflow(y.extraCosts)}</td>
                <td className="px-3 py-2 text-right text-white">{money(y.closing)}</td>
                <td className="px-3 py-2 text-right text-white/80">{lowestCell(y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-white/40">{label}</dt>
      <dd className="font-mono tabular-nums text-white/80">{value}</dd>
    </div>
  );
}
