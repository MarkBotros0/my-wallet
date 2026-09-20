"use client";

import { createContext, useCallback, useContext, useState, type ComponentProps, type ReactNode } from "react";
import type { FormField } from "@/app/lib/capacityForm";
import { Field, NumberInput } from "../ui";

/**
 * How the calculator shows a field's error beside the field.
 *
 * `parseForm` says WHAT is wrong (`byField`); this decides WHEN to show it.
 * A message appears under a field once the user has left it — validate on
 * blur, not on every keystroke, or clearing a field to retype it flashes
 * "required" — but straight away for a field the user is not in (a saved
 * form that no longer parses, the summary jumping to a field). Once shown,
 * it stays while the user fixes it, so they watch it clear.
 */
export function useVisibleErrors(byField: Partial<Record<FormField, string>>) {
  const [touched, setTouched] = useState<ReadonlySet<FormField>>(() => new Set());
  const [active, setActive] = useState<FormField | null>(null);

  const touch = useCallback((field: FormField) => {
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  }, []);

  const errorFor = (field: FormField): string | undefined => {
    const message = byField[field];
    if (!message) return undefined;
    return touched.has(field) || active !== field ? message : undefined;
  };

  const bind = (field: FormField) => ({
    onFocus: () => {
      setActive(field);
      // Already showing an error when the user steps in: keep it up.
      if (byField[field]) touch(field);
    },
    onBlur: () => {
      setActive((a) => (a === field ? null : a));
      touch(field);
    },
  });

  const reset = useCallback(() => {
    setTouched(new Set());
    setActive(null);
  }, []);

  return { errorFor, bind, reset };
}

type FormErrors = ReturnType<typeof useVisibleErrors>;

const FormErrorsContext = createContext<FormErrors | null>(null);

export function FormErrorsProvider({ value, children }: { value: FormErrors; children: ReactNode }) {
  return <FormErrorsContext.Provider value={value}>{children}</FormErrorsContext.Provider>;
}

export function useFormErrors(): FormErrors {
  const ctx = useContext(FormErrorsContext);
  if (!ctx) throw new Error("useFormErrors must be used inside the calculator's FormErrorsProvider.");
  return ctx;
}

/** The DOM id of a field's input, so the summary can jump to it. */
export function fieldId(field: FormField): string {
  return `capacity-${field}`;
}

/** Scroll a field into the middle of the screen and put the cursor in it. */
export function focusField(field: FormField) {
  // A problem with the set of year fields is fixed in the first of them.
  const el = document.getElementById(fieldId(field === "yearPcts" ? "year-0" : field));
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  el.focus({ preventScroll: true });
}

/**
 * A labelled number field of the calculator: the Field, the NumberInput, the
 * id, the focus tracking and the error, from one `field` name.
 */
export function CalcField({
  field,
  label,
  hint,
  errorId,
  className,
  ...input
}: {
  field: FormField;
  label: string;
  hint?: ReactNode;
  errorId?: string;
  className?: string;
} & Omit<ComponentProps<typeof NumberInput>, "id" | "onFocus" | "onBlur">) {
  const { errorFor, bind } = useFormErrors();
  return (
    <Field label={label} hint={hint} error={errorFor(field)} errorId={errorId} className={className}>
      <NumberInput id={fieldId(field)} {...bind(field)} {...input} />
    </Field>
  );
}
