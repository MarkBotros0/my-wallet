import { TableSkeleton } from "@/app/components/LoadingSkeleton";

/** Mirrors the clients page's chrome: title, year bar, the list. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <div className="h-8 w-40 animate-pulse rounded bg-white/5" />
      <div className="mt-2 h-4 w-64 animate-pulse rounded bg-white/5" />
      <div className="mt-5 h-14 animate-pulse rounded-xl bg-white/5" />
      <div className="mt-4">
        <TableSkeleton rows={4} />
      </div>
    </div>
  );
}
