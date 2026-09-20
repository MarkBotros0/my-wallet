"use client";

/**
 * The mobile "+" button, bottom right, clearing the pill nav through the
 * shared variable — never a bare number: a hardcoded bottom with no
 * safe-area term puts the nav over this button on any phone with a home
 * indicator. Hidden at md:, where the page header carries the action.
 */
export default function Fab({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="pressable fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl font-light text-charcoal-dark shadow-lg shadow-accent/30 md:hidden"
      style={{ bottom: "calc(var(--bottom-nav-clearance) + 12px)" }}
    >
      +
    </button>
  );
}
