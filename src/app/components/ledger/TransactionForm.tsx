"use client";

import { FormEvent, useId, useState } from "react";
import {
  MAX_CATEGORY_LENGTH,
  MAX_NOTE_LENGTH,
  toIsoDate,
  validateTransactionInput,
  type CategorySuggestions,
  type Transaction,
  type TransactionInput,
  type TransactionKind,
} from "@/lib/ledger";
import { parseNumber } from "@/app/lib/numbers";
import { Field, NumberInput, Segmented, inputClass } from "../ui";

/**
 * Add or edit one entry. Full-screen on mobile, centred card on desktop —
 * the CreateUserModal shape.
 *
 * The form holds strings while the user types and hands the parsed object to
 * `validateTransactionInput` on submit — the SAME function the API route
 * runs — so a value this form accepts is a value the server accepts.
 */
export default function TransactionForm({
  existing,
  defaultKind = "expense",
  categories,
  onSave,
  onDelete,
  onClose,
}: {
  /** Editing this entry; undefined means creating. */
  existing?: Transaction;
  defaultKind?: TransactionKind;
  categories: CategorySuggestions;
  onSave: (input: TransactionInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<TransactionKind>(existing?.kind ?? defaultKind);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [date, setDate] = useState(existing?.occurred_on ?? toIsoDate(new Date()));
  const [category, setCategory] = useState(existing?.category ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const listId = useId();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseNumber(amount);
    const result = validateTransactionInput({
      kind,
      amount: parsedAmount ?? NaN,
      occurred_on: date,
      category,
      note,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSubmitting(true);
    try {
      await onSave(result.value);
    } catch (e: unknown) {
      setErrors([e instanceof Error ? e.message : "Could not save the entry"]);
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    setSubmitting(true);
    try {
      await onDelete();
    } catch (e: unknown) {
      setErrors([e instanceof Error ? e.message : "Could not delete the entry"]);
      setSubmitting(false);
    }
  };

  const isExpense = kind === "expense";

  return (
    // z-[60], above the z-50 pill nav: the Delete button sits at the bottom of
    // this form and must not be covered — nor should a stray tap on the pill
    // navigate away from a half-typed entry.
    <div className="fixed inset-0 z-[60] flex flex-col bg-charcoal-dark md:items-center md:justify-center md:bg-black/70 md:backdrop-blur-sm">
      <div
        className="flex-1 overflow-y-auto p-4 md:max-h-[90vh] md:w-full md:max-w-md md:flex-none md:rounded-2xl md:border md:border-white/10 md:bg-charcoal md:p-6"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{existing ? "Edit entry" : "Add entry"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Segmented<TransactionKind>
            ariaLabel="Entry kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
          />

          <Field label="Amount" hint={isExpense ? "Money out." : "Money in."}>
            <NumberInput
              value={amount}
              onChange={setAmount}
              suffix="EGP"
              placeholder="0.00"
              ariaLabel="Amount"
            />
          </Field>

          <Field label="Date">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${inputClass} font-mono`}
              aria-label="Date"
            />
          </Field>

          <Field label="Category" hint={`Optional. Your ${isExpense ? "expense" : "income"} categories are suggested as you type.`}>
            <input
              type="text"
              list={listId}
              maxLength={MAX_CATEGORY_LENGTH}
              autoComplete="off"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={isExpense ? "Groceries, Rent, Transport…" : "Salary, Freelance, Dividends…"}
              className={inputClass}
              aria-label="Category"
            />
            <datalist id={listId}>
              {categories[kind].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Note">
            <input
              type="text"
              maxLength={MAX_NOTE_LENGTH}
              autoComplete="off"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              className={inputClass}
              aria-label="Note"
            />
          </Field>

          {errors.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] flex-1 rounded-lg bg-accent px-4 text-sm font-semibold text-charcoal-dark transition-opacity disabled:opacity-50"
            >
              {submitting ? "Saving…" : existing ? "Save changes" : isExpense ? "Add expense" : "Add income"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-lg border border-white/10 px-4 text-sm text-white/70 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>

          {existing && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="min-h-[44px] w-full rounded-lg border border-loss/30 px-4 text-sm text-loss transition-colors hover:bg-loss/10 disabled:opacity-40"
            >
              Delete entry
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
