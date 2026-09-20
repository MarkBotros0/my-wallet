import { CardSkeleton } from "@/app/components/LoadingSkeleton";

/** Mirrors Home's chrome: title and the two cards. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <div className="h-8 w-40 animate-pulse rounded bg-white/5" />
      <div className="mt-2 h-4 w-64 animate-pulse rounded bg-white/5" />
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
