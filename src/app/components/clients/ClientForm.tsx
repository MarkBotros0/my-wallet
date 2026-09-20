"use client";

import { FormEvent, useState } from "react";
import {
  MAX_CLIENT_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  validateClientInput,
  type Client,
  type ClientInput,
} from "@/lib/ledger";
import { Field, inputClass } from "../ui";

/**
 * Add or rename a client. Full-screen on mobile, centred card on desktop —
 * the TransactionForm shape. Validation is `validateClientInput`, the same
 * function the API route runs.
 */
export default function ClientForm({
  existing,
  onSave,
  onDelete,
  onClose,
}: {
  /** Editing this client; undefined means creating. */
  existing?: Client;
  onSave: (input: ClientInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = validateClientInput({ name, note });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSubmitting(true);
    try {
      await onSave(result.value);
    } catch (e: unknown) {
      setErrors([e instanceof Error ? e.message : "Could not save the client"]);
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !existing) return;
    // Spelled out: the income survives, only the link goes.
    if (
      !confirm(
        `Remove ${existing.name}? Income recorded under this client stays in your transactions (and its God's share stays owed) — it just stops being linked to a client.`,
      )
    )
      return;
    setSubmitting(true);
    try {
      await onDelete();
    } catch (e: unknown) {
      setErrors([e instanceof Error ? e.message : "Could not remove the client"]);
      setSubmitting(false);
    }
  };

  return (
    // z-[60], above the z-50 pill nav — see TransactionForm.
    <div className="fixed inset-0 z-[60] flex flex-col bg-charcoal-dark md:items-center md:justify-center md:bg-black/70 md:backdrop-blur-sm">
      <div
        className="flex-1 overflow-y-auto p-4 md:max-h-[90vh] md:w-full md:max-w-md md:flex-none md:rounded-2xl md:border md:border-white/10 md:bg-charcoal md:p-6"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{existing ? "Edit client" : "Add client"}</h2>
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
          <Field label="Name">
            <input
              type="text"
              required
              autoFocus
              maxLength={MAX_CLIENT_NAME_LENGTH}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Who you work with"
              className={inputClass}
              aria-label="Client name"
            />
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
              {submitting ? "Saving…" : existing ? "Save changes" : "Add client"}
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
              Remove client
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
