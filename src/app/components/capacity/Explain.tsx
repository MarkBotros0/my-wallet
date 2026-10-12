import type { ReactNode } from "react";

/**
 * "What's this?" for a term the reader may not know. A native <details>, so
 * it opens by tap, by keyboard, and for a screen reader — never a hover
 * tooltip a phone cannot show.
 */
export default function Explain({ term, children }: { term: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1 text-xs font-medium text-accent [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 4 4 4-4 4" />
        </svg>
        {term}
      </summary>
      <p className="-mt-1 mb-2 pl-[1.125rem] text-xs leading-relaxed text-white/60">{children}</p>
    </details>
  );
}
