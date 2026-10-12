"use client";

import { Fragment, useState, type ReactNode } from "react";
import type { PurchaseKind, SavingsVehicle, YearSummary } from "@/lib/capacity";
import { formatMoney, formatSignedMoney } from "@/app/lib/format";
import { flowGroups, type FlowGroup, type FlowGroupId } from "@/app/lib/moneyFlow";
import { FLOW_TONE, signTone } from "./MoneyFlowList";

type Ctx = { vehicle: SavingsVehicle; kind: PurchaseKind; hasLoan: boolean };

/** The table's column heads: the groups' titles, shortened to fit a column. */
const SHORT: Record<FlowGroupId, string> = {
  savings: "Savings",
  added: "Added",
  developer: "Developer",
  bank: "Bank",
  costs: "Costs",
};
const ORDER: FlowGroupId[] = ["savings", "added", "developer", "bank", "costs"];

/**
 * Year by year, under the same headings as "Where the money goes": each year
 * opens, every stream moves it by its own subtotal (savings, what you add,
 * developer, bank, costs — never netted into one another), and it closes.
 *
 *   opening + Σ group subtotals = closing
 *
 * On a phone each year is one card read top to bottom, every group with its
 * rows and subtotal. On a desktop each year is one table row of subtotals,
 * and a button on the row opens its line items.
 *
 * Colour follows the money rule: rows are `gain` in, `loss` out, the
 * guarantee locked or returned neutral; a subtotal is coloured by its sign.
 * Opening, closing and lowest are positions and stay neutral. A year whose
 * lowest balance dipped under the buffer is tinted `loss` — a real bad
 * outcome — and says so in words.
 */
export default function YearTable({
  years,
  ctx,
  buffer,
  currency,
}: {
  years: YearSummary[];
  ctx: Ctx;
  buffer: number;
  currency: string;
}) {
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const toggle = (year: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });

  const rows = years.map((y) => ({ y, groups: flowGroups(y, ctx) }));
  const columns = ORDER.filter((id) => rows.some((r) => r.groups.some((g) => g.id === id)));
  const titleOf = (id: FlowGroupId) => {
    if (id === "developer" && ctx.kind === "resale") return "Seller";
    return SHORT[id];
  };
  const money = (n: number) => formatMoney(n, "");
  const signed = (n: number) => formatSignedMoney(n, "");
  const dash = <span className="text-white/25">—</span>;

  return (
    <>
      <p className="mb-3 text-[11px] leading-snug text-white/40">
        All figures in {currency}. Each year opens where the last one closed; every heading adds or takes its own
        part. Lowest is the lowest balance at the end of any month that year (year 1 includes the moment right after
        paying now) — it must stay above {formatMoney(buffer, currency)}.
        {ctx.hasLoan && " Money locked as the bank's guarantee is not spendable, so it is taken out until it comes back."}
      </p>

      {/* Phone: one card per year, read top to bottom */}
      <ol className="space-y-2 md:hidden">
        {rows.map(({ y, groups }) => (
          <li
            key={y.year}
            className={`rounded-xl border p-3 ${y.breached ? "border-loss/30 bg-loss/10" : "border-white/10 bg-white/[0.03]"}`}
          >
            <div className="flex items-baseline justify-between">
              <h4 className="text-sm font-semibold text-white">Year {y.year}</h4>
              {y.breached && <span className="text-[11px] font-medium text-loss">Below your minimum</span>}
            </div>
            <div className="mt-2 text-xs">
              <dl>
                <Line label="Opening" value={money(y.opening)} strong />
              </dl>
              {groups.map((g) => (
                <GroupLines key={g.id} group={g} />
              ))}
              <dl className="mt-2 border-t border-white/10 pt-2">
                <Line label="Closing" value={money(y.closing)} strong />
                <Line
                  label="Lowest in the year"
                  value={<span className={y.breached ? "font-semibold text-loss" : "text-white/60"}>{money(y.lowest)}</span>}
                />
              </dl>
            </div>
          </li>
        ))}
      </ol>

      {/* Desktop: one row of subtotals per year, each opening to its line items */}
      <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-left uppercase tracking-wide text-white/40">
              <th scope="col" className="px-2.5 py-2.5 font-medium">Year</th>
              <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Opening</th>
              {columns.map((id) => (
                <th key={id} scope="col" className="px-2.5 py-2.5 text-right font-medium">{titleOf(id)}</th>
              ))}
              <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Closing</th>
              <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Lowest</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {rows.map(({ y, groups }) => {
              const isOpen = open.has(y.year);
              const detailId = `year-detail-${y.year}`;
              const tint = y.breached ? "bg-loss/10" : "";
              return (
                <Fragment key={y.year}>
                  <tr className={`border-b border-white/5 ${tint} ${isOpen ? "" : "last:border-0"}`}>
                    <th scope="row" className="px-1 py-1 text-left font-sans font-normal">
                      <button
                        type="button"
                        onClick={() => toggle(y.year)}
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? detailId : undefined}
                        aria-label={`Year ${y.year}${y.breached ? ", below your minimum" : ""} — ${isOpen ? "hide" : "show"} the details`}
                        className="flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-white/80 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          className={`h-3.5 w-3.5 text-white/40 transition-transform ${isOpen ? "rotate-90" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="m6 4 4 4-4 4" />
                        </svg>
                        {y.year}
                        {y.breached && <span className="text-[10px] font-medium text-loss">below min</span>}
                      </button>
                    </th>
                    <td className="px-2.5 py-2 text-right text-white/80">{money(y.opening)}</td>
                    {columns.map((id) => {
                      const g = groups.find((x) => x.id === id);
                      return (
                        <td key={id} className={`px-2.5 py-2 text-right ${g ? signTone(g.subtotal) : ""}`}>
                          {g ? signed(g.subtotal) : dash}
                        </td>
                      );
                    })}
                    <td className="px-2.5 py-2 text-right font-semibold text-white">{money(y.closing)}</td>
                    <td className={`px-2.5 py-2 text-right ${y.breached ? "font-semibold text-loss" : "text-white/70"}`}>
                      {money(y.lowest)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr id={detailId} className={`border-b border-white/5 last:border-0 ${tint}`}>
                      <td colSpan={columns.length + 4} className="px-4 pb-3 pt-1">
                        <div className="grid gap-x-6 gap-y-3 font-sans sm:grid-cols-2 xl:grid-cols-3">
                          {groups.map((g) => (
                            <div key={g.id} className="text-xs">
                              <GroupLines group={g} />
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** A group inside a year: its heading and subtotal, then its signed rows. */
function GroupLines({ group }: { group: FlowGroup }) {
  return (
    <dl className="mt-2">
      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{group.title}</dt>
        <dd className={`font-mono font-semibold tabular-nums ${signTone(group.subtotal)}`}>
          {formatSignedMoney(group.subtotal, "")}
        </dd>
      </div>
      {group.rows.map((r) => (
        <div key={r.key} className="flex items-baseline justify-between gap-2 pl-3">
          <dt className="text-white/45">{r.label}</dt>
          <dd className={`font-mono tabular-nums ${FLOW_TONE[r.tone]}`}>{formatSignedMoney(r.amount, "")}</dd>
        </div>
      ))}
    </dl>
  );
}

function Line({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={strong ? "font-medium text-white/70" : "text-white/45"}>{label}</dt>
      <dd className={`font-mono tabular-nums ${strong ? "font-semibold text-white" : ""}`}>{value}</dd>
    </div>
  );
}
