"use client";

import { useRef, type KeyboardEvent } from "react";

export type ResultTab = "answer" | "time" | "years" | "whatif";

export const RESULT_TABS: readonly { id: ResultTab; label: string }[] = [
  { id: "answer", label: "Answer" },
  { id: "time", label: "Over time" },
  { id: "years", label: "Year by year" },
  { id: "whatif", label: "What if" },
];

/** The ARIA wiring for a tab's panel — only the active panel is rendered. */
export function tabPanelProps(tab: ResultTab) {
  return { role: "tabpanel" as const, id: `results-panel-${tab}`, "aria-labelledby": `results-tab-${tab}` };
}

/**
 * The results, split so no one view is a long scroll. A real tablist: the
 * active tab is the only one in the tab order, arrows / Home / End move
 * between tabs and select them (automatic activation — the panels are cheap).
 * Four equal tabs fit a 360px phone at 12px.
 */
export default function ResultTabs({ value, onChange }: { value: ResultTab; onChange: (tab: ResultTab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent, i: number) => {
    const last = RESULT_TABS.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(RESULT_TABS[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="Results" className="surface grid grid-cols-4 gap-1 p-1">
      {RESULT_TABS.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`results-tab-${t.id}`}
            aria-selected={on}
            aria-controls={`results-panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => move(e, i)}
            className={`min-h-[44px] cursor-pointer rounded-lg px-1 text-xs font-medium transition-colors ${
              on ? "bg-accent/15 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/80"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
