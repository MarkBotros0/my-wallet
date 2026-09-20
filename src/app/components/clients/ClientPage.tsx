"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  godsShareTotals,
  summarize,
  yearOf,
  type ClientInput,
  type Transaction,
  type TransactionInput,
} from "@/lib/ledger";
import {
  createTransaction,
  deleteClient,
  deleteTransaction,
  fetchClientYear,
  updateClient,
  updateTransaction,
  type ClientYearResponse,
} from "@/app/lib/api";
import { formatAmount } from "@/app/lib/format";
import { useToday } from "@/app/lib/today";
import { CardSkeleton, TableSkeleton } from "../LoadingSkeleton";
import Fab from "../Fab";
import PeriodBar from "../ledger/PeriodBar";
import Tile from "../ledger/Tile";
import TransactionForm from "../ledger/TransactionForm";
import TransactionList from "../ledger/TransactionList";
import ClientForm from "./ClientForm";

type Editing = { mode: "create" } | { mode: "edit"; entry: Transaction } | null;

/**
 * One client, one calendar year: what they paid, the God's share set aside
 * from it, and every income entry. The tiles derive from the list with the
 * pure helpers — the list IS the year.
 */
export default function ClientPage({ id }: { id: string }) {
  const router = useRouter();
  const today = useToday();
  const [offset, setOffset] = useState(0);
  const year = today ? String(Number(yearOf(today)) + offset) : null;

  const [data, setData] = useState<ClientYearResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [editingClient, setEditingClient] = useState(false);

  useEffect(() => {
    if (!year) return;
    let cancelled = false;
    fetchClientYear(id, year).then(
      (res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this client");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, year, version]);

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

  const handleSaveClient = async (input: ClientInput) => {
    await updateClient(id, input);
    setEditingClient(false);
    refresh();
  };

  const handleDeleteClient = async () => {
    await deleteClient(id);
    router.replace("/clients");
  };

  const stale = data !== null && year !== null && data.year !== year;
  const shown = data;
  const summary = shown ? summarize(shown.transactions) : null;
  const share = shown ? godsShareTotals(shown.transactions) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <Link href="/clients" className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm text-white/50 hover:text-white">
        ‹ Clients
      </Link>

      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {shown ? (
            <button
              type="button"
              onClick={() => setEditingClient(true)}
              className="block max-w-full truncate text-left text-2xl font-bold text-white hover:text-accent"
              title="Edit client"
            >
              {shown.client.name}
            </button>
          ) : (
            <div className="h-8 w-40 animate-pulse rounded bg-white/5" />
          )}
          <p className="mt-1 truncate text-sm text-white/50">{shown?.client.note || "What this client paid you, year by year."}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ mode: "create" })}
          className="btn-primary hidden min-h-[44px] shrink-0 px-4 text-sm md:block"
        >
          + Add income
        </button>
      </div>

      <PeriodBar label={year ?? " "} offset={offset} onShift={setOffset} unit="year" />

      {error && (
        <div className="mb-4 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm text-loss">{error}</div>
      )}

      {!shown || !summary || !share ? (
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
          {/* Collected is money in; the share is a portion of it and the count a number — neither has a direction. */}
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Collected" value={formatAmount(summary.income, "")} className={summary.income > 0 ? "text-gain" : "text-white/50"} sub="EGP" />
            <Tile label="God's share" value={formatAmount(share.accrued, "")} className="text-white" />
            <Tile label="Entries" value={String(summary.count)} className="text-white" />
          </div>

          {shown.transactions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-charcoal p-8 text-center">
              <p className="text-sm text-white/50">Nothing from {shown.client.name} in {shown.year}.</p>
              <button
                type="button"
                onClick={() => setEditing({ mode: "create" })}
                className="mt-4 min-h-[44px] rounded-lg border border-white/10 px-4 text-sm text-white/70 transition-colors hover:bg-white/5"
              >
                Add income
              </button>
            </div>
          ) : (
            <TransactionList transactions={shown.transactions} onSelect={(entry) => setEditing({ mode: "edit", entry })} />
          )}
        </div>
      )}

      <Fab onClick={() => setEditing({ mode: "create" })} ariaLabel="Add income" />

      {editing && shown && (
        <TransactionForm
          key={editing.mode === "edit" ? editing.entry.id : "create"}
          existing={editing.mode === "edit" ? editing.entry : undefined}
          prefill={{ kind: "income", client_id: id }}
          clients={shown.clients}
          onSave={handleSave}
          onDelete={editing.mode === "edit" ? handleDelete : undefined}
          onClose={() => setEditing(null)}
        />
      )}

      {editingClient && shown && (
        <ClientForm
          existing={shown.client}
          onSave={handleSaveClient}
          onDelete={handleDeleteClient}
          onClose={() => setEditingClient(false)}
        />
      )}
    </div>
  );
}
