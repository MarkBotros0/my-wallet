"use client";

import { formatMoney, formatPct, formatSignedMoney } from "@/app/lib/format";

export interface SensitivityLine {
  /** The rate this row was solved at. */
  effectiveAnnualRate: number;
  /** Difference from the current rate (e.g. −0.03). */
  delta: number;
  /** Max mode: the most you can pay. Top-up mode: the yearly top-up. null = nothing affordable / no top-up can help. */
  value: number | null;
}

/**
 * How much the answer leans on the return rate: four rows around the current
 * rate, the current one marked. In max mode the value is the most you can
 * pay; in top-up mode the yearly top-up. The swing against the current row is
 * a comparison, not money moving, so it stays neutral.
 */
export default function SensitivityTable({
  rows,
  mode,
  rateLabel,
  currency,
}: {
  rows: SensitivityLine[];
  mode: "max" | "topUp";
  /** "Fund return" or "Certificate rate". */
  rateLabel: string;
  currency: string;
}) {
  const current = rows.find((r) => r.delta === 0)?.value ?? null;
  const none = mode === "max" ? "nothing" : "can't work";

  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-left uppercase tracking-wide text-white/40">
            <th scope="col" className="px-3 py-2.5 font-medium">{rateLabel}</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              {mode === "max" ? "Most you can pay" : "Add each year"}
            </th>
            <th scope="col" className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">vs now</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => {
            const isCurrent = r.delta === 0;
            const diff = r.value !== null && current !== null ? r.value - current : null;
            return (
              <tr key={r.delta} className={`border-b border-white/5 last:border-0 ${isCurrent ? "bg-accent/[0.06]" : ""}`}>
                {/* The current row is marked by an accent hairline and a word, not by a wash alone. */}
                <th scope="row" className={`px-3 py-2 text-left font-normal ${isCurrent ? "shadow-[inset_2px_0_0_var(--color-accent)]" : ""}`}>
                  <span className={isCurrent ? "text-accent" : "text-white/80"}>{formatPct(r.effectiveAnnualRate)}</span>
                  <span className="ml-2 font-sans text-[10px] text-white/40">
                    {isCurrent ? "today" : `${r.delta > 0 ? "+" : "−"}${Math.abs(r.delta * 100).toFixed(0)} pts`}
                  </span>
                </th>
                <td className={`px-3 py-2 text-right ${isCurrent ? "font-semibold text-white" : "text-white/80"}`}>
                  {r.value === null ? <span className="font-sans text-white/40">{none}</span> : formatMoney(Math.max(0, r.value), currency)}
                </td>
                <td className="hidden px-3 py-2 text-right text-white/50 sm:table-cell">
                  {isCurrent || diff === null ? "—" : formatSignedMoney(diff, "")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
