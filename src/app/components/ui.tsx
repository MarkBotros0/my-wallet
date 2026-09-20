"use client";

import { createContext, useContext, useId, type CSSProperties, type ReactNode } from "react";
import { parseNumber } from "@/app/lib/numbers";

/**
 * The calculator's small building blocks, in the app's existing shapes: the
 * card, the input, the filter-pill style toggle. Nothing here knows about
 * money or the engine.
 */

export const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[16px] text-white placeholder:text-white/25 outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/20 md:text-sm";

export function Card({
  title,
  children,
  className = "",
  id,
  style,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  id?: string;
  /** For an entrance delay (`animate-rise` + animationDelay), nothing else. */
  style?: CSSProperties;
}) {
  return (
    <section id={id} style={style} className={`surface p-4 md:p-5 ${className}`}>
      {title && <h2 className="mb-4 text-sm font-semibold text-white">{title}</h2>}
      {children}
    </section>
  );
}

/**
 * What a Field tells the input inside it: whether it is in error and which
 * element describes the error. Read by NumberInput (and `useFieldState` for
 * a raw input) so a call site only ever passes `error` to the Field.
 */
const FieldContext = createContext<{ invalid: boolean; errorId?: string }>({ invalid: false });

export function useFieldState() {
  return useContext(FieldContext);
}

/**
 * Label above, control, then ONE line beneath: the error when there is one,
 * otherwise the hint. The error replaces the hint rather than stacking under
 * it so the field does not grow and shove the form about as it flips.
 *
 * `errorId` says the message is rendered by the parent under that id (a row
 * of two narrow fields shares one full-width line) — the field still turns
 * red and points its input at the message.
 */
export function Field({
  label,
  hint,
  error,
  errorId,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  errorId?: string;
  children: ReactNode;
  className?: string;
}) {
  const ownId = useId();
  const messageId = errorId ?? `${ownId}-error`;
  return (
    <FieldContext.Provider value={{ invalid: !!error, errorId: error ? messageId : undefined }}>
      <label className={`block ${className}`}>
        <span className={`mb-1 block text-xs font-medium ${error ? "text-loss" : "text-white/60"}`}>{label}</span>
        {children}
        {error && !errorId ? (
          <FieldError id={messageId}>{error}</FieldError>
        ) : (
          hint && <span className="mt-1 block text-[11px] leading-snug text-white/40">{hint}</span>
        )}
      </label>
    </FieldContext.Provider>
  );
}

/** The one shape of an inline error: announced, red, with a mark that is not only colour. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} role="alert" className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-loss">
      <svg viewBox="0 0 16 16" className="mt-px h-3 w-3 shrink-0" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.75v3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11" r="0.9" fill="currentColor" />
      </svg>
      <span>{children}</span>
    </span>
  );
}

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

/**
 * A text input for a number the user is still typing. Kept as `type="text"`
 * with a decimal keyboard: a `type="number"` field rejects "5,000,000", fights
 * a trailing ".", and validates against `step`, none of which helps here —
 * parsing is the form's job (see lib/capacityForm.ts).
 *
 * The suffix sits inside the border as a flex sibling, so a long one ("% of
 * capital") takes the room it needs instead of painting over the digits.
 * `group` rewrites a parsed value with thousands separators on blur — a
 * million reads as one at a glance, and the parser strips them again.
 */
export function NumberInput({
  value,
  onChange,
  suffix,
  placeholder,
  ariaLabel,
  mono = true,
  id,
  group = false,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  placeholder?: string;
  ariaLabel?: string;
  mono?: boolean;
  id?: string;
  group?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const { invalid, errorId } = useFieldState();
  const blur = () => {
    if (group) {
      const n = parseNumber(value);
      if (n !== null) {
        const text = grouped.format(n);
        if (text !== value) onChange(text);
      }
    }
    onBlur?.();
  };
  return (
    <span
      className={`flex items-center rounded-lg border bg-white/5 transition-colors focus-within:ring-2 ${
        invalid
          ? "border-loss/50 focus-within:border-loss/70 focus-within:ring-loss/20"
          : "border-white/10 focus-within:border-accent/60 focus-within:ring-accent/20"
      }`}
    >
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={errorId}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={blur}
        className={`min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[16px] text-white placeholder:text-white/25 outline-none md:text-sm ${
          mono ? "font-mono" : ""
        }`}
      />
      {suffix && <span className="shrink-0 pr-3 text-xs text-white/40">{suffix}</span>}
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
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`pressable min-h-[44px] cursor-pointer rounded-full border px-4 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              active
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white active:bg-white/10"
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
          ? "min-h-[32px] rounded-md border border-white/10 bg-charcoal px-2 py-1 text-[16px] text-white/80 outline-none focus:border-accent/50 md:text-xs"
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
      <div className="mt-0.5 font-mono text-sm tabular-nums text-white">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-white/40">{sub}</div>}
    </div>
  );
}
