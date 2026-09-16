/**
 * The three skeleton shapes every loading.tsx is built from. Reuse these
 * rather than inventing a new one per route, so a navigation reads as a fill
 * of the same chrome rather than a flash of unrelated layout.
 */

export function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-white/5 bg-white/5 p-4">
      <div className="mb-3 h-4 w-16 rounded bg-white/10" />
      <div className="mb-2 h-6 w-24 rounded bg-white/10" />
      <div className="h-3 w-20 rounded bg-white/10" />
    </div>
  );
}

export function ChartSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-white/5 bg-white/5 ${height} flex items-center justify-center`}
    >
      <div className="text-sm text-white/20">Loading…</div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded bg-white/5" />
      ))}
    </div>
  );
}
