/**
 * One figure in a summary strip: label, a mono number, an optional unit.
 * Colour is the caller's call and follows the money rule — `gain` for money
 * in, `loss` for money out, muted for a position or a zero.
 */
export default function Tile({
  label,
  value,
  className,
  sub,
}: {
  label: string;
  value: string;
  className: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-charcoal p-3">
      <div className="text-[11px] text-white/40">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-sm tabular-nums sm:text-base ${className}`}>{value}</div>
      {sub && <div className="text-[10px] text-white/30">{sub}</div>}
    </div>
  );
}
