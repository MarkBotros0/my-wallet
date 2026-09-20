"use client";

import type { ReactNode } from "react";

/**
 * The calculator's small building blocks, in the app's existing shapes: the
 * card, the input, the filter-pill style toggle. Nothing here knows about
 * money or the engine.
 */

export const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[16px] text-white outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/20 md:text-sm";

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-white/10 bg-charcoal p-4 md:p-5 ${className}`}>
      {title && <h2 className="mb-4 text-sm font-semibold text-white">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-white/60">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-white/40">{hint}</span>}
    </label>
  );
}

/**
 * A text input for a number the user is still typing. Kept as `type="text"`
 * with a decimal keyboard: a `type="number"` field rejects "5,000,000", fights
 * a trailing ".", and validates against `step`, none of which helps here —
 * parsing is the form's job (see lib/capacityForm.ts).
 */
export function NumberInput({
  value,
  onChange,
  suffix,
  placeholder,
  ariaLabel,
  mono = true,
}: {
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  placeholder?: string;
  ariaLabel?: string;
  mono?: boolean;
}) {
  return (
    <span className="relative block">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} ${mono ? "font-mono" : ""} ${suffix ? "pr-12" : ""}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-white/40">
          {suffix}
        </span>
      )}
    </span>
  );
}

/** Mutually exclusive choices as pills — the dashboard filter shape. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-h-[40px] rounded-full border px-3.5 text-xs font-medium transition-colors ${
              active
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  compact = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** Inline, in a sentence, rather than a full-width form field. */
  compact?: boolean;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as T)}
      // 16px on mobile in both variants: a smaller select zooms the page on
      // iOS focus (see the base rule in globals.css).
      className={
        compact
          ? "rounded-md border border-white/10 bg-charcoal px-2 py-1 text-[16px] text-white/80 outline-none focus:border-accent/50 md:text-xs"
          : `${inputClass} appearance-none bg-charcoal`
      }
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-charcoal">
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A checkbox as a full-width row: label on the left, a 44px tap target, the
 * accent when on. For an on/off that changes what the form asks next.
 */
export function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: ReactNode;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm text-white">{label}</span>
        {hint && <span className="block text-[11px] text-white/40">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-accent"
      />
    </label>
  );
}

/** A labelled figure — the stat-tile shape used under the hero number. */
export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
      <div className="text-[11px] text-white/40">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-white">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-white/40">{sub}</div>}
    </div>
  );
}
