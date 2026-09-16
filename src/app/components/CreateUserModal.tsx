"use client";

import { FormEvent, useState } from "react";

/**
 * Full-screen on mobile, centred card on desktop.
 *
 * Leaving the password blank is the intended path: the backend generates a
 * strong one and returns it once. The optional field exists for the case where
 * the admin has already agreed a password with the person.
 */
export default function CreateUserModal({
  onCreate,
  onClose,
}: {
  onCreate: (username: string, password?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [useOwnPassword, setUseOwnPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await onCreate(username.trim().toLowerCase(), useOwnPassword ? password : undefined);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not create the user");
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[16px] text-white outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/20 md:text-sm";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-charcoal-dark md:items-center md:justify-center md:bg-black/70 md:backdrop-blur-sm">
      <div
        className="flex-1 overflow-y-auto p-4 md:max-h-[90vh] md:w-full md:max-w-md md:flex-none md:rounded-2xl md:border md:border-white/10 md:bg-charcoal md:p-6"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Add user</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Username</label>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`${inputClass} font-mono`}
              placeholder="sara.b"
            />
            <p className="mt-1 text-[11px] text-white/40">
              3–32 characters: a–z, 0–9, dot, dash or underscore.
            </p>
          </div>

          <label className="flex min-h-[44px] items-center gap-2.5 text-sm text-white/70">
            <input
              type="checkbox"
              checked={useOwnPassword}
              onChange={(e) => setUseOwnPassword(e.target.checked)}
              className="h-4 w-4 accent-[#4488ff]"
            />
            Set the password myself
          </label>

          {useOwnPassword ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">Password</label>
              <input
                type="text"
                autoComplete="off"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} font-mono`}
              />
              <p className="mt-1 text-[11px] text-white/40">At least 8 characters.</p>
            </div>
          ) : (
            <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white/50">
              A strong password will be generated and shown to you once.
            </p>
          )}

          {err && (
            <div className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
              {err}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] flex-1 rounded-lg bg-accent px-4 text-sm font-semibold text-charcoal-dark transition-opacity disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create user"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-lg border border-white/10 px-4 text-sm text-white/70 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
