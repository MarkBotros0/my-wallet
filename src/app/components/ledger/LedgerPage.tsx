"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  monthKeyOf,
  monthLabel,
  shiftMonth,
  summarize,
  toIsoDate,
  type Transaction,
  type TransactionInput,
} from "@/lib/ledger";
import {
  createTransaction,
  deleteTransaction,
  fetchMonth,
  updateTransaction,
  type MonthResponse,
} from "@/app/lib/api";
import { formatAmount, formatSignedAmount } from "@/app/lib/format";
import { CardSkeleton, TableSkeleton } from "../LoadingSkeleton";
import TransactionForm from "./TransactionForm";
import TransactionList, { netClass } from "./TransactionList";

// Today's date in the BROWSER's calendar, read the hydration-safe way: null
// on the server and during the hydration render, the real day right after.
// The server's clock is in another timezone and may be on another day.
const noSubscribe = () => () => {};
const useToday = () => useSyncExternalStore(noSubscribe, () => toIsoDate(new Date()), () => null);

type Editing = { mode: "create" } | { mode: "edit"; entry: Transaction } | null;

/**
 * The ledger, one month at a time. The month's list is fetched whole and
 * the totals and day grouping are derived from it by the pure helpers —
 * the list IS the month, so nothing can disagree with it.
 */
export default function LedgerPage() {
  const today = useToday();
  // Months relative to the current one, so "This month" is always offset 0
  // and the current month never has to be re-derived when the day rolls over.
  const [offset, setOffset] = useState(0);
  const month = today ? shiftMonth(monthKeyOf(today), offset) : null;

  const [data, setData] = useState<MonthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped after every write so the effect below refetches the month.
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);

  useEffect(() => {
    if (!month) return;
    let cancelled = false;
    fetchMonth(month).then(
      (res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this month");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [month, version]);

  const refresh = () => setVersion((v) => v + 1);

  const handleSave = async (input: TransactionInput) => {
    if (editing?.mode === "edit") await updateTransaction(editing.entry.id, input);
    else await createTransaction(input);
    setEditing(null);
    refresh();
  };

  const handleDelete = async () => {
    if (editing?.mode !== "edit") return;
    await deleteTransaction(editing.entry.id);
    setEditing(null);
    refresh();
  };

  // The list on screen is for `data.month`; while another month loads, keep
  // it visible at reduced opacity rather than flashing a skeleton.
  const stale = data !== null && month !== null && data.month !== month;
  const shown = data;
  const summary = shown ? summarize(shown.transactions) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="mt-1 text-sm text-white/50">Every expense and every income entry, month by month.</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ mode: "create" })}
          className="hidden min-h-[44px] shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-charcoal-dark transition-opacity active:opacity-70 md:block"
        >
          + Add entry
        </button>
      </div>

      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-white/10 bg-charcoal px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOffset((o) => o - 1)}
          aria-label="Previous month"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/5 hover:text-white"
        >
          ‹
        </button>
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-white">{month ? monthLabel(month) : " "}</span>
          {offset !== 0 && (
            <button
              type="button"
              onClick={() => setOffset(0)}
              className="text-[11px] text-accent hover:underline"
            >
              This month
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOffset((o) => o + 1)}
          aria-label="Next month"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/5 hover:text-white"
        >
          ›
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm text-loss">{error}</div>
      )}

      {!shown || !summary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <TableSkeleton rows={4} />
        </div>
      ) : (
        <div className={`space-y-5 transition-opacity ${stale ? "opacity-50" : ""}`} aria-busy={stale}>
          {/* Summary strip: money in, money out, what is left. */}
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Income" value={formatAmount(summary.income, "")} className={summary.income > 0 ? "text-gain" : "text-white/50"} />
            <Tile label="Expenses" value={formatAmount(summary.expenses, "")} className={summary.expenses > 0 ? "text-loss" : "text-white/50"} />
            <Tile label="Net" value={formatSignedAmount(summary.net, "")} className={netClass(summary.net)} sub="EGP" />
          </div>

          {shown.transactions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-charcoal p-8 text-center">
              <p className="text-sm text-white/50">Nothing recorded in {monthLabel(shown.month)}.</p>
              <button
                type="button"
                onClick={() => setEditing({ mode: "create" })}
                className="mt-4 min-h-[44px] rounded-lg border border-white/10 px-4 text-sm text-white/70 transition-colors hover:bg-white/5"
              >
                Add the first entry
              </button>
            </div>
          ) : (
            <TransactionList
              transactions={shown.transactions}
              onSelect={(entry) => setEditing({ mode: "edit", entry })}
            />
          )}
        </div>
      )}

      {/* Mobile FAB, clearing the pill nav through the shared variable. */}
      <button
        type="button"
        onClick={() => setEditing({ mode: "create" })}
        aria-label="Add entry"
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl font-light text-charcoal-dark shadow-lg transition-transform active:scale-95 md:hidden"
        style={{ bottom: "calc(var(--bottom-nav-clearance) + 12px)" }}
      >
        +
      </button>

      {editing && (
        <TransactionForm
          key={editing.mode === "edit" ? editing.entry.id : "create"}
          existing={editing.mode === "edit" ? editing.entry : undefined}
          categories={shown?.categories ?? { expense: [], income: [] }}
          onSave={handleSave}
          onDelete={editing.mode === "edit" ? handleDelete : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Tile({ label, value, className, sub }: { label: string; value: string; className: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-charcoal p-3">
      <div className="text-[11px] text-white/40">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-sm tabular-nums sm:text-base ${className}`}>{value}</div>
      {sub && <div className="text-[10px] text-white/30">{sub}</div>}
    </div>
  );
}
