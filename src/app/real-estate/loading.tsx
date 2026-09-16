import { CardSkeleton, ChartSkeleton, TableSkeleton } from "@/app/components/LoadingSkeleton";

/** Mirrors the calculator's chrome: inputs left, hero + chart + table right. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      <div className="h-8 w-40 animate-pulse rounded bg-white/5" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-white/5" />
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-6">
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="mt-6 space-y-4 lg:mt-0">
          <CardSkeleton />
          <ChartSkeleton />
          <TableSkeleton rows={6} />
        </div>
      </div>
    </div>
  );
}
