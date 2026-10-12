import type { FlowGroup, FlowTone } from "@/app/lib/moneyFlow";
import { formatMoney, formatSignedMoney } from "@/app/lib/format";

/** The money rule: in is `gain`, out is `loss`, locked money and positions stay neutral. */
export const FLOW_TONE: Record<FlowTone, string> = {
  in: "text-gain",
  out: "text-loss",
  held: "text-white/70",
  neutral: "text-white",
};

/** A net movement coloured by its sign — a subtotal is money in or out once added up. */
export function signTone(n: number): string {
  return n > 0.5 ? "text-gain" : n < -0.5 ? "text-loss" : "text-white/50";
}

/**
 * Where the money goes, read top to bottom: what you start with, one block
 * per stream (savings, what you add, developer, bank, costs) — each with its
 * own signed rows and a subtotal, so nothing is netted out of sight — and
 * what you end with.
 *
 * Every block also carries a bridge bar (a waterfall turned on its side):
 * where the running total stood before the block and after it, on one scale
 * shared with the start and the end. The bar only repeats what the signed
 * figures say, so colour is never the only carrier of the direction.
 */
export default function MoneyFlowList({
  start,
  groups,
  end,
  currency,
  startLabel = "You start with",
  endLabel = "You end with",
  bars = true,
}: {
  start: number;
  groups: FlowGroup[];
  end: number;
  currency: string;
  startLabel?: string;
  endLabel?: string;
  bars?: boolean;
}) {
  const signed = (n: number) => formatSignedMoney(n, "");

  // The running total before and after each block, for the bridge bars.
  const spans: [number, number][] = [];
  let running = start;
  for (const g of groups) {
    spans.push([running, running + g.subtotal]);
    running += g.subtotal;
  }
  const all = [0, start, end, ...spans.flat()];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const bar = (from: number, to: number, tone: string) => (
    <div className="relative mt-1.5 h-1.5 rounded-full bg-white/[0.04]" aria-hidden>
      <div
        className={`absolute inset-y-0 rounded-full ${tone}`}
        style={{ left: `${pos(Math.min(from, to))}%`, width: `${Math.max(0.6, Math.abs(pos(to) - pos(from)))}%` }}
      />
    </div>
  );

  return (
    <div className="text-sm">
      <div className="flex items-baseline justify-between gap-3 pb-3">
        <span className="font-medium text-white/80">{startLabel}</span>
        <span className="font-mono font-semibold tabular-nums text-white">{formatMoney(start, currency)}</span>
      </div>
      {bars && <div className="-mt-2 mb-3">{bar(0, start, "bg-white/35")}</div>}

      <ol className="space-y-2">
        {groups.map((g, i) => {
          const rows = g.rows.filter((r) => r.key !== "start");
          const held = rows.some((r) => r.tone === "held");
          const [from, to] = spans[i];
          return (
            <li key={g.id} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/55">{g.title}</h4>
                <span className={`font-mono text-sm font-semibold tabular-nums ${signTone(g.subtotal)}`}>
                  {signed(g.subtotal)}
                </span>
              </div>
              {bars && bar(from, to, g.subtotal >= 0 ? "bg-gain/60" : "bg-loss/60")}
              <dl className="mt-2 space-y-1">
                {rows.map((r) => (
                  <div key={r.key} className="flex items-baseline justify-between gap-3 text-xs">
                    <dt className="text-white/55">{r.label}</dt>
                    <dd className={`font-mono tabular-nums ${FLOW_TONE[r.tone]}`}>{signed(r.amount)}</dd>
                  </div>
                ))}
              </dl>
              {held && (
                <p className="mt-1.5 text-[11px] leading-snug text-white/40">
                  The guarantee stays yours: it is set aside while the loan runs, not spent.
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-white/10 pt-3">
        <span className="font-medium text-white/80">{endLabel}</span>
        <span className="font-mono font-semibold tabular-nums text-white">{formatMoney(end, currency)}</span>
      </div>
      {bars && <div className="mt-1.5">{bar(0, end, "bg-white/35")}</div>}
    </div>
  );
}
