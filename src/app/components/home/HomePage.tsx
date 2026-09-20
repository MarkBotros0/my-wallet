"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clientBars,
  monthKeyOf,
  monthName,
  monthlyIncome,
  type ClientFilter,
  type GodsShareTotals,
  type HomeSummary,
} from "@/lib/ledger";
import { fetchSummary } from "@/app/lib/api";
import { formatAmount } from "@/app/lib/format";
import { useToday } from "@/app/lib/today";
import { CardSkeleton, ChartSkeleton } from "../LoadingSkeleton";
import { Card, Select } from "../ui";
import ClientBars from "./ClientBars";
import MonthlyChart from "./MonthlyChart";

const CURRENCY = "EGP";

/**
 * Home answers the two questions the app exists for: how much have I earned,
 * and where does God's share stand. Spending lives in Transactions and never
 * appears here — a settlement is money given, not money lost, so nothing on
 * this page can go into the red.
 *
 * One request (`/api/summary`) framed by the phone's month; the year's
 * headline, the per-client bars and the monthly columns are all derived from
 * it with the pure helpers, so they cannot disagree. The share totals are all
 * time — the same three numbers as the tracker page.
 */
export default function HomePage() {
  const today = useToday();
  const month = today ? monthKeyOf(today) : null;

  const [data, setData] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ClientFilter>("all");

  useEffect(() => {
    if (!month) return;
    let cancelled = false;
    fetchSummary(month).then(
      (res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load your summary");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [month]);

  const bars = data ? clientBars(data.clients, data.yearIncome) : [];
  const hasUnlinked = bars.some((b) => b.id === null);
  const filterOptions = data
    ? [
        { value: "all", label: "All clients" },
        ...data.clients.map((c) => ({ value: c.id, label: c.name })),
        ...(hasUnlinked ? [{ value: "none", label: "No client" }] : []),
      ]
    : [];
  // A filter for a client that no longer exists falls back to everyone.
  const activeFilter = filterOptions.some((o) => o.value === filter) ? filter : "all";
  const filterLabel = filterOptions.find((o) => o.value === activeFilter)?.label ?? "All clients";
  const values = data ? monthlyIncome(data.series, data.year, activeFilter) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Home</h1>
        <p className="mt-1 text-sm text-white/50">Your earnings, and God&apos;s share of them.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm text-loss">{error}</div>
      )}

      {!data ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <ChartSkeleton height="h-48" />
          <ChartSkeleton height="h-64" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <EarningsCard data={data} />
            <ShareCard share={data.share} />
          </div>

          <Card title={`By client in ${data.year}`}>
            {bars.length === 0 ? (
              <EmptyNote>No income in {data.year} yet — add one from Transactions.</EmptyNote>
            ) : (
              <ClientBars bars={bars} currency={CURRENCY} />
            )}
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">Over {data.year}</h2>
              <Select<string>
                compact
                value={activeFilter}
                onChange={(v) => setFilter(v)}
                options={filterOptions}
                ariaLabel="Client shown in the monthly chart"
              />
            </div>
            <MonthlyChart
              values={values}
              year={data.year}
              currentMonth={data.month}
              currency={CURRENCY}
              label={filterLabel}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

/** The year's income — money in, so `gain` — with this month beneath. The card is the link to Clients. */
function EarningsCard({ data }: { data: HomeSummary }) {
  const { yearIncome, monthIncome } = data;
  return (
    <Link
      href="/clients"
      className="block rounded-xl border border-white/10 bg-charcoal p-4 transition-colors hover:bg-white/[0.03] active:bg-white/5"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-white">Earned in {data.year}</h2>
        <span className="text-[11px] text-white/40">Clients ›</span>
      </div>
      <div className={`mt-2 font-mono text-2xl tabular-nums ${yearIncome.income > 0 ? "text-gain" : "text-white/50"}`}>
        {formatAmount(yearIncome.income, CURRENCY)}
      </div>
      <div className="mt-2 text-xs text-white/40">
        {monthName(data.month)}{" "}
        <span className={`font-mono tabular-nums ${monthIncome.income > 0 ? "text-gain/80" : "text-white/50"}`}>
          {formatAmount(monthIncome.income, "")}
        </span>
        {" · "}
        {yearIncome.count} {yearIncome.count === 1 ? "entry" : "entries"} this year
      </div>
    </Link>
  );
}

/**
 * Where God's share stands, all time. Positions, so nothing here is coloured:
 * what is owed is the headline, what was set aside and settled beneath it.
 * The card links to the tracker; the Settle button, above it in the stacking
 * order, opens the tracker with the settlement form already up.
 */
function ShareCard({ share }: { share: GodsShareTotals }) {
  return (
    <div className="relative rounded-xl border border-white/10 bg-charcoal p-4 transition-colors hover:bg-white/[0.03]">
      <Link
        href="/gods-share"
        className="flex items-baseline justify-between outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-accent/50"
      >
        <h2 className="text-sm font-semibold text-white">God&apos;s share</h2>
        <span className="text-[11px] text-white/40">Details ›</span>
      </Link>
      <div className="mt-2 text-[11px] text-white/40">Owed</div>
      <div className="font-mono text-2xl tabular-nums text-white">{formatAmount(share.remaining, CURRENCY)}</div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
        <span>
          Set aside <span className="font-mono tabular-nums text-white/60">{formatAmount(share.accrued, "")}</span>
        </span>
        <span>
          Settled <span className="font-mono tabular-nums text-white/60">{formatAmount(share.settled, "")}</span>
        </span>
      </div>
      {share.remaining > 0 ? (
        <Link
          href="/gods-share?settle=1"
          className="relative z-10 mt-3 inline-flex min-h-[40px] items-center rounded-lg bg-accent px-4 text-sm font-semibold text-charcoal-dark transition-opacity active:opacity-70"
        >
          Settle {formatAmount(share.remaining, CURRENCY)}
        </Link>
      ) : (
        <p className="mt-3 text-xs text-white/40">
          {share.accrued > 0 ? "Nothing owed — all settled." : "Nothing set aside yet — it accrues from income."}
        </p>
      )}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-white/40">{children}</div>
  );
}
