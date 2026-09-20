"use client";

/**
 * `‹ September 2026 ›` — step through months or years, with a jump back to
 * the current one when elsewhere. The label is whatever the page derives for
 * its period; `offset` is that period relative to now, so 0 hides the jump.
 */
export default function PeriodBar({
  label,
  offset,
  onShift,
  unit,
}: {
  label: string;
  offset: number;
  onShift: (offset: number) => void;
  /** Names the step in the buttons' labels: "Previous month", "This year". */
  unit: "month" | "year";
}) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-xl border border-white/10 bg-charcoal px-2 py-1.5">
      <button
        type="button"
        onClick={() => onShift(offset - 1)}
        aria-label={`Previous ${unit}`}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/5 hover:text-white"
      >
        ‹
      </button>
      <div className="flex flex-col items-center">
        <span className="text-sm font-semibold text-white">{label}</span>
        {offset !== 0 && (
          <button type="button" onClick={() => onShift(0)} className="text-[11px] text-accent hover:underline">
            This {unit}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onShift(offset + 1)}
        aria-label={`Next ${unit}`}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/5 hover:text-white"
      >
        ›
      </button>
    </div>
  );
}
