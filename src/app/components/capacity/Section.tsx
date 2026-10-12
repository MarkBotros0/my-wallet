"use client";

import type { ReactNode } from "react";
import type { SectionId } from "@/app/lib/capacitySections";

/**
 * One folding input section. Closed, it is a single row — title, what is
 * inside in one line, a red dot when a field inside has a problem — so the
 * whole form reads at a glance; open, it shows its fields. The parent keeps
 * one open at a time. A real button with aria-expanded, a 52px target.
 */
export default function Section({
  id,
  title,
  summary,
  open,
  onToggle,
  hasError,
  children,
}: {
  id: SectionId;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  hasError: boolean;
  children: ReactNode;
}) {
  const panelId = `section-${id}`;
  return (
    <section id={`${panelId}-root`} className="surface overflow-hidden" style={{ scrollMarginTop: "calc(var(--top-nav-clearance) + 76px)" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02] active:bg-white/[0.04] md:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">{title}</span>
          {!open && <span className="block truncate text-xs text-white/50">{summary}</span>}
        </span>
        {hasError && (
          <>
            <span className="h-2 w-2 shrink-0 rounded-full bg-loss" aria-hidden />
            <span className="sr-only">Has a problem</span>
          </>
        )}
        <svg
          viewBox="0 0 16 16"
          className={`h-4 w-4 shrink-0 text-white/50 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 6.5 8 10.5l4-4" />
        </svg>
      </button>
      {open && (
        <div id={panelId} className="animate-rise px-4 pb-4 md:px-5 md:pb-5">
          {children}
        </div>
      )}
    </section>
  );
}
