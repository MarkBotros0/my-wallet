"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Transaction, TransactionInput } from "@/lib/ledger";
import {
  createTransaction,
  deleteTransaction,
  fetchGodsShare,
  updateTransaction,
  type GodsShareResponse,
} from "@/app/lib/api";
import { formatAmount } from "@/app/lib/format";
import { CardSkeleton, TableSkeleton } from "../LoadingSkeleton";
import Fab from "../Fab";
import Tile from "../ledger/Tile";
import TransactionForm from "../ledger/TransactionForm";
import TransactionList from "../ledger/TransactionList";

type Editing = { mode: "settle" } | { mode: "edit"; entry: Transaction } | null;

const SETTLEMENT_CATEGORY = "God's share";

/**
 * God's share, all time: what income has set aside, what has been paid out,
 * and what is still owed. "Settle" is the entry form opened as an expense
 * that pays from the share — a settlement is a normal expense, so the month
 * it lands in shows the cash leaving.
 *
 * `/gods-share?settle=1` (Home's Settle button) opens with the form already
 * up; closing it drops the flag so a reload does not reopen it.
 */
export default function GodsSharePage() {
  const router = useRouter();
  const openedToSettle = useSearchParams().get("settle") !== null;

  const [data, setData] = useState<GodsShareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<Editing>(openedToSettle ? { mode: "settle" } : null);

  const close = () => {
    setEditing(null);
    if (openedToSettle) router.replace("/gods-share");
  };

  useEffect(() => {
    let cancelled = false;
    fetchGodsShare().then(
      (res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load God's share");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [version]);

  const refresh = () => setVersion((v) => v + 1);

  const handleSave = async (input: TransactionInput) => {
    if (editing?.mode === "edit") await updateTransaction(editing.entry.id, input);
    else await createTransaction(input);
    close();
    refresh();
  };

  const handleDelete = async () => {
    if (editing?.mode !== "edit") return;
    await deleteTransaction(editing.entry.id);
    close();
    refresh();
  };

  const totals = data?.totals ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">God&apos;s share</h1>
          <p className="mt-1 text-sm text-white/50">Set aside from every income; paid out when you settle.</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ mode: "settle" })}
          className="btn-primary hidden min-h-[44px] shrink-0 px-4 text-sm md:block"
        >
          Settle
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm text-loss">{error}</div>
      )}

      {!data || !totals ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <TableSkeleton rows={3} />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Positions, not directions: none of these is money moving now, so none is coloured. */}
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Set aside" value={formatAmount(totals.accrued, "")} className="text-white" />
            <Tile label="Settled" value={formatAmount(totals.settled, "")} className="text-white" />
            <Tile label="Remaining" value={formatAmount(totals.remaining, "")} className="text-white" sub="EGP" />
          </div>

          <section>
            <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-white/40">Settlements</h2>
            {data.settlements.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-charcoal p-8 text-center">
                <p className="text-sm text-white/50">Nothing settled yet.</p>
                {totals.remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditing({ mode: "settle" })}
                    className="mt-4 min-h-[44px] rounded-lg border border-white/10 px-4 text-sm text-white/70 transition-colors hover:bg-white/5"
                  >
                    Settle {formatAmount(totals.remaining, "EGP")}
                  </button>
                )}
              </div>
            ) : (
              <TransactionList transactions={data.settlements} onSelect={(entry) => setEditing({ mode: "edit", entry })} />
            )}
          </section>
        </div>
      )}

      <Fab onClick={() => setEditing({ mode: "settle" })} ariaLabel="Settle God's share" />

      {/* Not before the totals: the form takes its prefilled amount once, on mount. */}
      {editing && totals && (
        <TransactionForm
          key={editing.mode === "edit" ? editing.entry.id : "settle"}
          existing={editing.mode === "edit" ? editing.entry : undefined}
          prefill={{
            kind: "expense",
            godsShareOn: true,
            amount: totals && totals.remaining > 0 ? totals.remaining : undefined,
            category: SETTLEMENT_CATEGORY,
          }}
          categories={{ expense: [SETTLEMENT_CATEGORY], income: [] }}
          clients={[]}
          onSave={handleSave}
          onDelete={editing.mode === "edit" ? handleDelete : undefined}
          onClose={close}
        />
      )}
    </div>
  );
}
