"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { monthKeyOf, monthLabel, summarize, type GodsShareTotals, type MonthSummary } from "@/lib/ledger";
import { fetchGodsShare, fetchMonth } from "@/app/lib/api";
import { formatAmount, formatSignedAmount } from "@/app/lib/format";
import { useToday } from "@/app/lib/today";
import { CardSkeleton } from "../LoadingSkeleton";
import { netClass } from "../ledger/TransactionList";

/**
 * At a glance: this month from the ledger's month endpoint (summarised by
 * the same helper the Transactions page uses) and God's share owed. Each
 * card is a link to the page that owns the number.
 */
export default function HomePage() {
  const today = useToday();
  const month = today ? monthKeyOf(today) : null;

  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [share, setShare] = useState<GodsShareTotals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!month) return;
    let cancelled = false;
    const fail = (e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Could not load your summary");
    };
    fetchMonth(month).then((res) => {
      if (!cancelled) setSummary(summarize(res.transactions));
    }, fail);
    fetchGodsShare().then((res) => {
      if (!cancelled) setShare(res.totals);
    }, fail);
    return () => {
      cancelled = true;
    };
  }, [month]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Home</h1>
        <p className="mt-1 text-sm text-white/50">This month, and what is set aside.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm text-loss">{error}</div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {month && summary ? (
          <Link
            href="/transactions"
            className="block rounded-xl border border-white/10 bg-charcoal p-4 transition-colors hover:bg-white/[0.03] active:bg-white/5"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-white">{monthLabel(month)}</h2>
              <span className="text-[11px] text-white/40">Transactions ›</span>
            </div>
            <div className={`mt-2 font-mono text-2xl tabular-nums ${netClass(summary.net)}`}>
              {formatSignedAmount(summary.net, "EGP")}
            </div>
            <div className="mt-2 flex gap-4 text-xs">
              <span className="text-white/40">
                In <span className={`font-mono tabular-nums ${summary.income > 0 ? "text-gain" : "text-white/50"}`}>{formatAmount(summary.income, "")}</span>
              </span>
              <span className="text-white/40">
                Out <span className={`font-mono tabular-nums ${summary.expenses > 0 ? "text-loss" : "text-white/50"}`}>{formatAmount(summary.expenses, "")}</span>
              </span>
            </div>
          </Link>
        ) : (
          <CardSkeleton />
        )}

        {share ? (
          <Link
            href="/gods-share"
            className="block rounded-xl border border-white/10 bg-charcoal p-4 transition-colors hover:bg-white/[0.03] active:bg-white/5"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-white">God&apos;s share</h2>
              <span className="text-[11px] text-white/40">Settle ›</span>
            </div>
            {/* A balance owed is a position, not money moving — it stays neutral. */}
            <div className="mt-2 font-mono text-2xl tabular-nums text-white">{formatAmount(share.remaining, "EGP")}</div>
            <div className="mt-2 flex gap-4 text-xs text-white/40">
              <span>
                Set aside <span className="font-mono tabular-nums text-white/60">{formatAmount(share.accrued, "")}</span>
              </span>
              <span>
                Settled <span className="font-mono tabular-nums text-white/60">{formatAmount(share.settled, "")}</span>
              </span>
            </div>
          </Link>
        ) : (
          <CardSkeleton />
        )}
      </div>
    </div>
  );
}
