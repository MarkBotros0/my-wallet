import { ChartSkeleton, ListSkeleton } from "@/app/components/LoadingSkeleton";

/** Mirrors the clients page's chrome: title, year bar, the hero, the roster. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <div className="shimmer h-8 w-40 rounded bg-white/5" />
      <div className="shimmer mt-2 h-4 w-64 rounded bg-white/5" />
      <div className="shimmer mt-5 h-14 rounded-xl bg-white/5" />
      <div className="mt-4 space-y-4">
        <ChartSkeleton height="h-36" />
        <ListSkeleton rows={4} />
      </div>
    </div>
  );
}
