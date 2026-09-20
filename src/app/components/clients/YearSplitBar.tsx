import type { ClientBar } from "@/lib/ledger";
import { formatShare } from "@/app/lib/format";

/**
 * How the year's income splits across clients: one stacked bar, a segment
 * per client in the roster's order (biggest first), the income with no
 * client last as the faint remainder. It is one series — all money in — so
 * every segment is `gain` and hairline gaps do the separating; the reader
 * maps the biggest segment to the first row beneath. Renders nothing for an
 * empty year: the hero says so in words instead.
 */
export default function YearSplitBar({ segments, total }: { segments: readonly ClientBar[]; total: number }) {
  if (total <= 0) return null;
  // `clientBars` sorts the "No client" remainder by size; here it always trails.
  const ordered = [...segments.filter((s) => s.id !== null), ...segments.filter((s) => s.id === null)];
  const label = ordered
    .map((s) => `${s.id === null ? "no client" : s.name} ${formatShare(s.total / total)}`)
    .join(", ");

  return (
    <div
      role="img"
      aria-label={label}
      className="animate-grow-x mt-4 flex h-2 origin-left gap-[2px] overflow-hidden rounded-full"
      style={{ animationDelay: "200ms" }}
    >
      {ordered.map((s) => (
        <div
          key={s.id ?? "none"}
          title={`${s.name} · ${formatShare(s.total / total)}`}
          className={`min-w-[3px] flex-none ${s.id === null ? "bg-gain/25" : "bg-gain"}`}
          style={{ width: `${(s.total / total) * 100}%` }}
        />
      ))}
    </div>
  );
}
