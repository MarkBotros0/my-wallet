"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { yearOf, type ClientInput } from "@/lib/ledger";
import { createClient, fetchClients, type ClientsResponse } from "@/app/lib/api";
import { formatAmount } from "@/app/lib/format";
import { useToday } from "@/app/lib/today";
import { TableSkeleton } from "../LoadingSkeleton";
import Fab from "../Fab";
import PeriodBar from "../ledger/PeriodBar";
import ClientForm from "./ClientForm";

/**
 * Every client with what they paid in one calendar year. The totals come
 * from the server (one SUM per client — the page never fetches every row of
 * every client); the client's own page derives its numbers from its list.
 */
export default function ClientsPage() {
  const today = useToday();
  // Years relative to the current one, so "This year" is always offset 0.
  const [offset, setOffset] = useState(0);
  const year = today ? String(Number(yearOf(today)) + offset) : null;

  const [data, setData] = useState<ClientsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!year) return;
    let cancelled = false;
    fetchClients(year).then(
      (res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load your clients");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [year, version]);

  const handleCreate = async (input: ClientInput) => {
    await createClient(input);
    setCreating(false);
    setVersion((v) => v + 1);
  };

  const stale = data !== null && year !== null && data.year !== year;
  const shown = data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="mt-1 text-sm text-white/50">Who you work with, and what each paid you this year.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="hidden min-h-[44px] shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-charcoal-dark transition-opacity active:opacity-70 md:block"
        >
          + Add client
        </button>
      </div>

      <PeriodBar label={year ?? " "} offset={offset} onShift={setOffset} unit="year" />

      {error && (
        <div className="mb-4 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm text-loss">{error}</div>
      )}

      {!shown ? (
        <TableSkeleton rows={4} />
      ) : shown.clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-charcoal p-8 text-center">
          <p className="text-sm text-white/50">No clients yet.</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 min-h-[44px] rounded-lg border border-white/10 px-4 text-sm text-white/70 transition-colors hover:bg-white/5"
          >
            Add the first client
          </button>
        </div>
      ) : (
        <ul className={`space-y-3 transition-opacity ${stale ? "opacity-50" : ""}`} aria-busy={stale}>
          {shown.clients.map((c) => (
            <li key={c.id}>
              <Link
                href={`/clients/${encodeURIComponent(c.id)}`}
                className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-white/10 bg-charcoal px-4 py-3 transition-colors hover:bg-white/[0.03] active:bg-white/5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">{c.name}</span>
                  <span className="block truncate text-xs text-white/40">
                    {c.year_count === 0
                      ? `Nothing in ${shown.year}`
                      : `God's share ${formatAmount(c.year_share, "")} · ${c.year_count} ${c.year_count === 1 ? "entry" : "entries"}`}
                  </span>
                </span>
                {/* Money in, so gain — unless there is none, which is not a direction. */}
                <span className={`shrink-0 font-mono text-sm tabular-nums ${c.year_total > 0 ? "text-gain" : "text-white/40"}`}>
                  {formatAmount(c.year_total, "")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Fab onClick={() => setCreating(true)} ariaLabel="Add client" />

      {creating && <ClientForm onSave={handleCreate} onClose={() => setCreating(false)} />}
    </div>
  );
}
