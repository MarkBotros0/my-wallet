import { CardSkeleton, ChartSkeleton } from "@/app/components/LoadingSkeleton";

/** Mirrors Home's chrome: title, the two cards, the two charts. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <div className="h-8 w-40 animate-pulse rounded bg-white/5" />
      <div className="mt-2 h-4 w-64 animate-pulse rounded bg-white/5" />
      <div className="mt-5 space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <ChartSkeleton height="h-48" />
        <ChartSkeleton height="h-64" />
      </div>
    </div>
  );
}
