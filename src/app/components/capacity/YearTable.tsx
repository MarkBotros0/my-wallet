"use client";

import type { YearSummary } from "@/lib/capacity";
import { formatMoney } from "@/app/lib/format";
import { yearStory } from "@/app/lib/yearStory";

/**
 * Year by year, as a story the reader can follow top to bottom: where the
 * fund opened, what was paid out of it (the down payment on year 1, the
 * installments, any extra cost), what covered that (the fund's returns, the
 * income added, and the rest out of savings — or, in a good year, what was
 * left in them), and where it closed. On a phone each year is one card in
 * that order; on a desktop the table lays the same ledger across one row,
 * where opening and closing sit side by side and the savings line is not
 * needed.
 *
 * Colour follows the money rule: money out (down payment, installments,
 * extra costs) is `loss`, money in (returns, income) is `gain`. Opening,
 * closing, lowest and the savings row are positions, not flows, and stay
 * neutral. A year whose lowest balance dipped under the buffer is tinted
 * `loss` — a real bad outcome, so it earns the colour.
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
  const dash = <span className="text-white/30">—</span>;
  const inflow = (n: number) => (n === 0 ? dash : <span className="text-gain/80">+{money(n)}</span>);
  const outflow = (n: number) => (n === 0 ? dash : <span className="text-loss/80">−{money(n)}</span>);
  const hasLoan = years.some((y) => y.bankInstallments > 0 || y.pledged > 0);
  const lowestCell = (y: YearSummary) => (
    <span className={y.breached ? "font-semibold text-loss" : ""}>{money(y.lowest)}</span>
  );

  return (
    <>
      <p className="mb-3 text-[11px] text-white/40">
        All figures in {currency}. Lowest is the lowest end-of-month balance in that year — year 1 includes the
        balance right after the down payment; the buffer is {formatMoney(buffer, currency)}.
        {hasLoan &&
          " Locked is the pledge the bank holds — not spendable, so the buffer does not count it; Closing is the spendable fund."}
      </p>

      {/* Mobile: one card per year, read top to bottom */}
      <div className="space-y-2 md:hidden">
        {years.map((y) => {
          const { paid, fromSavings } = yearStory(y);
          const bankFlows = y.pledged + y.released;
          return (
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
              <dl className="mt-2 flex flex-col gap-1 text-xs">
                <Row label="Opening" value={money(y.opening)} tone="strong" />

                <Row
                  label="Paid this year"
                  value={paid === 0 ? dash : <span className="text-loss">−{money(paid)}</span>}
                  tone="strong"
                  className="mt-1.5"
                />
                {y.downPayment > 0 && <Row label={hasLoan ? "Up front, from savings" : "Paid up front"} value={outflow(y.downPayment)} />}
                {y.installments > 0 && <Row label="Installments" value={outflow(y.installments)} />}
                {y.bankInstallments > 0 && <Row label="Bank installments" value={outflow(y.bankInstallments)} />}
                {y.extraCosts > 0 && <Row label="Extra costs" value={outflow(y.extraCosts)} />}

                <Row label="Covered by" tone="strong" className="mt-1.5" />
                {y.returns > 0 && <Row label="Fund returns" value={inflow(y.returns)} />}
                {y.income > 0 && <Row label="Income" value={inflow(y.income)} />}
                {y.certificateInterest > 0 && <Row label="Certificate interest" value={inflow(y.certificateInterest)} />}
                <Row
                  label={fromSavings >= 0 ? "From savings" : "Left in savings"}
                  value={money(Math.abs(fromSavings))}
                />

                {bankFlows > 0 && (
                  <>
                    <Row label="Bank guarantee" tone="strong" className="mt-1.5" />
                    {y.pledged > 0 && <Row label="Locked as guarantee" value={money(y.pledged)} />}
                    {y.released > 0 && <Row label="Released" value={money(y.released)} />}
                  </>
                )}

                <Row
                  label="Closing"
                  value={money(y.closing)}
                  tone="strong"
                  className="mt-1.5 border-t border-white/10 pt-2"
                />
                <Row label="Lowest in the year" value={lowestCell(y)} tone="muted" />
              </dl>
            </div>
          );
        })}
      </div>

      {/* Desktop: the table */}
      <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-left uppercase tracking-wide text-white/40">
              <th className="px-3 py-2.5 font-medium">Year</th>
              <th className="px-3 py-2.5 text-right font-medium">Opening</th>
              <th className="px-3 py-2.5 text-right font-medium">{hasLoan ? "From savings" : "Up front"}</th>
              <th className="px-3 py-2.5 text-right font-medium">Installments</th>
              <th className="px-3 py-2.5 text-right font-medium">Extra costs</th>
              <th className="px-3 py-2.5 text-right font-medium">Returns</th>
              <th className="px-3 py-2.5 text-right font-medium">Income</th>
              {hasLoan && (
                <>
                  <th className="px-3 py-2.5 text-right font-medium">Bank</th>
                  <th className="px-3 py-2.5 text-right font-medium">Certificates</th>
                  <th className="px-3 py-2.5 text-right font-medium">Locked</th>
                </>
              )}
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
                <td className="px-3 py-2 text-right">{outflow(y.downPayment)}</td>
                <td className="px-3 py-2 text-right">{outflow(y.installments)}</td>
                <td className="px-3 py-2 text-right">{outflow(y.extraCosts)}</td>
                <td className="px-3 py-2 text-right">{inflow(y.returns)}</td>
                <td className="px-3 py-2 text-right">{inflow(y.income)}</td>
                {hasLoan && (
                  <>
                    <td className="px-3 py-2 text-right">{outflow(y.bankInstallments)}</td>
                    <td className="px-3 py-2 text-right">{inflow(y.certificateInterest)}</td>
                    <td className="px-3 py-2 text-right text-white/70">
                      {y.pledged > 0 && y.released > 0 ? (
                        `${money(y.pledged)} / −${money(y.released)}`
                      ) : y.pledged > 0 ? (
                        money(y.pledged)
                      ) : y.released > 0 ? (
                        `−${money(y.released)}`
                      ) : (
                        dash
                      )}
                    </td>
                  </>
                )}
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

/**
 * One line of a year card. `strong` is an anchor of the story (opening, a
 * group's heading, closing); the default is an indented line inside a group;
 * `muted` is the footnote (lowest). A heading with nothing to say on the
 * right keeps an empty `dd`, so the list stays a list of pairs.
 */
function Row({
  label,
  value,
  tone = "sub",
  className = "",
}: {
  label: string;
  value?: React.ReactNode;
  tone?: "strong" | "sub" | "muted";
  className?: string;
}) {
  const dt = tone === "strong" ? "font-medium text-white/70" : "text-white/40";
  const dd = tone === "strong" ? "font-semibold text-white" : tone === "muted" ? "text-white/50" : "text-white/80";
  return (
    <div className={`flex items-baseline justify-between gap-2 ${tone === "sub" ? "pl-3" : ""} ${className}`}>
      <dt className={dt}>{label}</dt>
      <dd className={`font-mono tabular-nums ${dd}`}>{value}</dd>
    </div>
  );
}
