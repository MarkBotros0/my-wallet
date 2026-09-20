"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clientBars,
  yearOf,
  type ClientBar,
  type ClientInput,
  type ClientSummary,
  type YearIncome,
} from "@/lib/ledger";
import { createClient, fetchClients, type ClientsResponse } from "@/app/lib/api";
import { formatMoney, formatShare } from "@/app/lib/format";
import { initials } from "@/app/lib/initials";
import { useToday } from "@/app/lib/today";
import { useCountUp } from "@/app/lib/useCountUp";
import { ChartSkeleton, ListSkeleton } from "../LoadingSkeleton";
import Fab from "../Fab";
import PeriodBar from "../ledger/PeriodBar";
import ClientForm from "./ClientForm";
import YearSplitBar from "./YearSplitBar";

const CURRENCY = "EGP";

/**
 * The year, and who made it: the year's income as the hero, split across
 * clients in one bar, then the roster — every client, biggest payer first,
 * each with its share of the year. The totals come from the server (one SUM
 * over the year, one per client — the page never fetches every row of every
 * client); the client's own page derives its numbers from its list.
 *
 * Amounts here are whole units (`formatMoney`): the page compares clients,
 * and piastres are noise at that distance.
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
  // The split of the year, biggest first, with a "No client" remainder so the
  // segments add up to the headline — the same helper Home's bars use.
  const bars = shown ? clientBars(shown.clients, shown.totals) : [];

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
          className="btn-primary hidden min-h-[44px] shrink-0 px-4 text-sm md:block"
        >
          + Add client
        </button>
      </div>

      <PeriodBar label={year ?? " "} offset={offset} onShift={setOffset} unit="year" />

      {error && (
        <div className="mb-4 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm text-loss">{error}</div>
      )}

      {!shown ? (
        <div className="space-y-4">
          <ChartSkeleton height="h-36" />
          <ListSkeleton rows={4} />
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${stale ? "opacity-50" : ""}`} aria-busy={stale}>
          <YearHero year={shown.year} totals={shown.totals} bars={bars} />

          {shown.clients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-charcoal p-8 text-center">
              <p className="text-sm text-white/70">No clients yet.</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-white/40">
                A client is who you collect income from. Add one, then link income to it from the entry form.
              </p>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-4 min-h-[44px] rounded-lg border border-white/10 px-4 text-sm text-white/70 transition-colors hover:bg-white/5"
              >
                Add a client
              </button>
            </div>
          ) : (
            <Roster year={shown.year} clients={shown.clients} income={shown.totals.income} />
          )}
        </div>
      )}

      <Fab onClick={() => setCreating(true)} ariaLabel="Add client" />

      {creating && <ClientForm onSave={handleCreate} onClose={() => setCreating(false)} />}
    </div>
  );
}

/**
 * The year's income — the hero figure, in `gain` because it is money in,
 * counting up as it arrives over a soft green wash (Home's treatment, so the
 * number the user tapped through from looks the same here). Beneath it the
 * split bar, then the share, the count and whatever income has no client —
 * said out loud, or the headline looks like it disagrees with the roster.
 */
function YearHero({ year, totals, bars }: { year: string; totals: YearIncome; bars: readonly ClientBar[] }) {
  const shown = useCountUp(totals.income);
  const unlinked = bars.find((b) => b.id === null)?.total ?? 0;
  const earned = totals.income > 0;
  return (
    <section className="surface animate-rise relative overflow-hidden p-4 md:p-5">
      {earned && (
        <span aria-hidden className="pointer-events-none absolute -left-8 -top-12 h-36 w-56 rounded-full bg-gain/10 blur-3xl" />
      )}
      <h2 className="relative text-sm font-semibold text-white">Income {year}</h2>
      <div
        className={`relative mt-2 text-4xl font-bold leading-none tracking-tight md:text-5xl ${
          earned ? "text-gain" : "text-white/50"
        }`}
      >
        {formatMoney(shown, "")}
        <span className="ml-2 text-base font-medium text-white/40">{CURRENCY}</span>
      </div>
      <YearSplitBar segments={bars} total={totals.income} />
      <div className="relative mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/40">
        {earned ? (
          <>
            <span>
              God&apos;s share <span className="font-mono tabular-nums text-white/60">{formatMoney(totals.share, "")}</span>
            </span>
            <span>
              {totals.count} {totals.count === 1 ? "entry" : "entries"}
            </span>
            {unlinked > 0 && (
              <span>
                <span className="font-mono tabular-nums text-white/60">{formatMoney(unlinked, "")}</span> with no client
              </span>
            )}
          </>
        ) : (
          <span>Nothing collected in {year} yet.</span>
        )}
      </div>
    </section>
  );
}

/**
 * Every client as one grouped list, in the server's order (biggest payer
 * first, then by name): a monogram, the name, its share of the year, and
 * the total in `gain`. A client with nothing this year sinks to the bottom
 * and dims — it exists, it just has not paid yet.
 */
function Roster({ year, clients, income }: { year: string; clients: readonly ClientSummary[]; income: number }) {
  return (
    <ul className="surface animate-rise divide-y divide-white/[0.06] overflow-hidden" style={{ animationDelay: "80ms" }}>
      {clients.map((c) => {
        const paid = c.year_total > 0;
        return (
          <li key={c.id}>
            <Link
              href={`/clients/${encodeURIComponent(c.id)}`}
              aria-label={`${c.name}: ${formatMoney(c.year_total, CURRENCY)} in ${year}`}
              className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 active:bg-white/5 md:px-5"
            >
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-xs font-semibold ${
                  paid ? "text-white/70" : "text-white/35"
                }`}
              >
                {initials(c.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-medium ${paid ? "text-white" : "text-white/60"}`}>{c.name}</span>
                <span className="mt-0.5 block truncate text-xs text-white/40">
                  {paid
                    ? `${formatShare(c.year_total / income)} of ${year} · ${c.year_count} ${c.year_count === 1 ? "entry" : "entries"}`
                    : `Nothing in ${year}`}
                </span>
              </span>
              {/* Money in, so gain; nothing at all is not a direction, and the line above already says so. */}
              {paid && <span className="shrink-0 font-mono text-sm tabular-nums text-gain">{formatMoney(c.year_total, "")}</span>}
              <span aria-hidden className="shrink-0 text-base text-white/25">
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
