import { CardSkeleton, TableSkeleton } from "@/app/components/LoadingSkeleton";

/** Mirrors the client page's chrome: back link, name, year bar, three tiles, the list. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <div className="h-5 w-16 animate-pulse rounded bg-white/5" />
      <div className="mt-4 h-8 w-40 animate-pulse rounded bg-white/5" />
      <div className="mt-2 h-4 w-64 animate-pulse rounded bg-white/5" />
      <div className="mt-5 h-14 animate-pulse rounded-xl bg-white/5" />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="mt-5">
        <TableSkeleton rows={4} />
      </div>
    </div>
  );
}
