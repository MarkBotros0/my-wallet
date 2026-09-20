"use client";

import type { SensitivityRow } from "@/lib/capacity";
import { formatMoney, formatPct, formatSignedMoney } from "@/app/lib/format";

/**
 * How much the answer leans on the return rate. Four rows around the current
 * rate; the current one is highlighted. Deltas are stated against the current
 * maximum so the reader sees the swing, not just four big numbers.
 */
export default function SensitivityTable({
  rows,
  currency,
}: {
  rows: SensitivityRow[];
  currency: string;
}) {
  const current = rows.find((r) => r.delta === 0)?.maxPrice ?? null;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-left uppercase tracking-wide text-white/40">
            <th className="px-3 py-2.5 font-medium">Return rate</th>
            <th className="px-3 py-2.5 text-right font-medium">Max price</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">vs current</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => {
            const isCurrent = r.delta === 0;
            const diff = r.maxPrice !== null && current !== null ? r.maxPrice - current : null;
            return (
              <tr
                key={r.delta}
                className={`border-b border-white/5 last:border-0 ${isCurrent ? "bg-accent/[0.06]" : "hover:bg-white/[0.02]"}`}
              >
                {/* The current row is marked by an accent hairline on its edge, not by a wash alone. */}
                <td className={`px-3 py-2 ${isCurrent ? "shadow-[inset_2px_0_0_var(--color-accent)]" : ""}`}>
                  <span className={isCurrent ? "text-accent" : "text-white/80"}>{formatPct(r.effectiveAnnualRate)}</span>
                  <span className="ml-2 font-sans text-[10px] text-white/40">
                    {isCurrent ? "current" : `${r.delta > 0 ? "+" : "−"}${Math.abs(r.delta * 100).toFixed(0)} pts`}
                  </span>
                </td>
                <td className={`px-3 py-2 text-right ${isCurrent ? "font-semibold text-white" : "text-white/80"}`}>
                  {r.maxPrice === null ? <span className="text-white/40">nothing</span> : formatMoney(r.maxPrice, currency)}
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
