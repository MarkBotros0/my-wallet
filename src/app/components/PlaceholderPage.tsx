/**
 * A route that exists so the navigation is complete, before its feature does.
 * Replace the whole component with the real page; keep the outer container
 * (`mx-auto max-w-5xl px-4 py-6 md:py-8`) so the chrome does not jump.
 */
export default function PlaceholderPage({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="mt-1 text-sm text-white/50">{blurb}</p>

      <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-charcoal p-8 text-center">
        <p className="text-sm text-white/40">Nothing here yet.</p>
        <p className="mt-1 text-xs text-white/25">This screen is planned, not built.</p>
      </div>
    </div>
  );
}
