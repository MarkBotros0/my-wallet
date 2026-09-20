"use client";

import Link from "next/link";
import type { ClientBar } from "@/lib/ledger";
import { formatAmount } from "@/app/lib/format";

/**
 * The year's income by client: one horizontal bar each, biggest first, the
 * value written beside the name rather than read off an axis — a list that
 * happens to have bars, so it is its own table view. One series (money in),
 * so the bars are `gain` and there is no legend; the name and the number
 * stay in text tokens. Each row is a 44px tap target to the client's page;
 * the "No client" bar has nowhere to go.
 */
export default function ClientBars({ bars, currency }: { bars: ClientBar[]; currency: string }) {
  const max = bars.reduce((m, b) => Math.max(m, b.total), 0);
  const rowClass =
    "group block min-h-[44px] rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03] active:bg-white/5";

  return (
    <ul className="space-y-0.5">
      {bars.map((b) => {
        // At least a sliver, so a small client is still visibly a bar.
        const pct = max > 0 ? Math.max(1.5, (b.total / max) * 100) : 0;
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className={`truncate ${b.id ? "text-white/80" : "italic text-white/40"}`}>{b.name}</span>
              <span className="shrink-0 font-mono tabular-nums text-white">
                {formatAmount(b.total, "")}
                <span className="ml-1.5 font-sans text-[10px] text-white/30">
                  {b.count} {b.count === 1 ? "entry" : "entries"}
                </span>
              </span>
            </div>
            <div
              className="mt-1.5 h-2.5 rounded-r-[4px] bg-gain/85 transition-colors group-hover:bg-gain"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          </>
        );
        return (
          <li key={b.id ?? "none"}>
            {b.id ? (
              <Link
                href={`/clients/${encodeURIComponent(b.id)}`}
                className={rowClass}
                aria-label={`${b.name}: ${formatAmount(b.total, currency)} this year`}
              >
                {body}
              </Link>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
