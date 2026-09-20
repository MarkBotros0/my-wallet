import type { ReactNode } from "react";

/**
 * The signed-out card: logo, a title, a line under it, and whatever form the
 * page puts inside. /login and /register share it so the two cannot drift.
 */

// The input and button shapes from the design system, spelled once for the
// two forms. 16px stops iOS zooming the field on focus.
export const AUTH_INPUT_CLASS =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[16px] text-white outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/20 md:text-sm";

export const AUTH_BUTTON_CLASS =
  "btn-primary min-h-[44px] w-full px-4 py-2 text-sm";

/** `/login` or `/register` with the `?next=` carried across, dropped when it is just the home page. */
export function withNext(path: string, next: string): string {
  return next && next !== "/" ? `${path}?next=${encodeURIComponent(next)}` : path;
}

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-charcoal p-6 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="text-2xl font-bold text-accent">My</span>
            <span className="text-lg text-white/60">Wallet</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="mt-1 text-sm text-white/50">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The card's outline while a signed-out page streams in — both loading.tsx files. */
export function AuthCardSkeleton() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-charcoal p-6 shadow-xl">
        <div className="mx-auto mb-6 h-8 w-32 animate-pulse rounded bg-white/5" />
        <div className="space-y-4">
          <div className="h-11 animate-pulse rounded-lg bg-white/5" />
          <div className="h-11 animate-pulse rounded-lg bg-white/5" />
          <div className="h-11 animate-pulse rounded-lg bg-white/5" />
        </div>
      </div>
    </div>
  );
}
