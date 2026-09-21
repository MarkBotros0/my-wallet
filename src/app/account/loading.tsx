/** Mirrors the account page's chrome: title, the signed-in line, one card of three fields. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-md px-4 py-6 md:py-8">
      <div className="h-8 w-32 animate-pulse rounded bg-white/5" />
      <div className="mt-2 h-4 w-48 animate-pulse rounded bg-white/5" />
      <div className="shimmer mt-5 rounded-xl border border-white/5 bg-white/[0.04] p-4 md:p-5">
        <div className="mb-4 h-4 w-32 rounded bg-white/10" />
        <div className="space-y-4">
          <div className="h-11 rounded-lg bg-white/10" />
          <div className="h-11 rounded-lg bg-white/10" />
          <div className="h-11 rounded-lg bg-white/10" />
          <div className="h-11 rounded-lg bg-white/10" />
        </div>
      </div>
    </div>
  );
}
