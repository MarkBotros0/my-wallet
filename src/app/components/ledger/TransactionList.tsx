"use client";

import { groupByDay, type Transaction } from "@/lib/ledger";
import { formatAmount, formatSignedAmount } from "@/app/lib/format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * 'Tue 16 Sep' from '2026-09-16'. Spelled from fixed arrays rather than Intl:
 * the date is a calendar day (UTC keeps it from drifting) and locales disagree
 * on details like "Sep" vs "Sept".
 */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * A month's entries grouped by day, newest first. Each row is a button —
 * tapping it opens the edit form. Amounts are signed and coloured by
 * direction, per the design-system rule: green is money in, red is money out.
 */
export default function TransactionList({
  transactions,
  onSelect,
}: {
  transactions: Transaction[];
  onSelect: (t: Transaction) => void;
}) {
  const groups = groupByDay(transactions);

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.date} aria-label={dayLabel(g.date)}>
          <div className="mb-1.5 flex items-baseline justify-between px-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-white/40">{dayLabel(g.date)}</h3>
            <span className={`font-mono text-[11px] tabular-nums ${netClass(g.net)}`}>
              {formatSignedAmount(g.net, "")}
            </span>
          </div>
          <ul className="overflow-hidden rounded-xl border border-white/10 bg-charcoal">
            {g.items.map((t) => (
              <li key={t.id} className="border-b border-white/5 last:border-0">
                <button
                  type="button"
                  onClick={() => onSelect(t)}
                  className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03] active:bg-white/5"
                >
                  <span className="min-w-0">
                    <span className={`block truncate text-sm ${t.category ? "text-white" : "text-white/40"}`}>
                      {t.category || "Uncategorised"}
                    </span>
                    {t.note && <span className="block truncate text-xs text-white/40">{t.note}</span>}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-sm tabular-nums ${
                      t.kind === "income" ? "text-gain" : "text-loss"
                    }`}
                  >
                    {t.kind === "income" ? "+" : "−"}
                    {formatAmount(t.amount, "")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Net carries a real direction: positive is gain, negative is loss, zero is neither. */
export function netClass(net: number): string {
  if (net > 0) return "text-gain";
  if (net < 0) return "text-loss";
  return "text-white/50";
}
