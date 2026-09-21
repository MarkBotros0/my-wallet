"use client";

import { useState, type FormEvent } from "react";
import { MIN_PASSWORD_LENGTH, validatePasswordChange } from "@/lib/account/validate";
import { changePassword } from "@/app/lib/api";
import { useAuth } from "../AuthProvider";
import { Card, Field, inputClass } from "../ui";

/**
 * Account: who is signed in, and the one thing they can change about it —
 * the password, proven by the current one. There is no recovery (a
 * forgotten password is a row edit), which is why the new password is
 * typed twice: a typo here would lock the account.
 */
export default function AccountPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [changed, setChanged] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setChanged(false);
    // The SAME check the route runs, so a pair this form lets through is a
    // pair the server accepts. The confirm field is the form's own question —
    // the server never needs it.
    const result = validatePasswordChange({ currentPassword, newPassword });
    const problems = result.ok ? [] : result.errors;
    if (newPassword !== confirmPassword) {
      problems.push("The new passwords do not match.");
    }
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChanged(true);
    } catch (e: unknown) {
      setErrors([e instanceof Error ? e.message : "Could not change the password"]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-6 md:py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Account</h1>
        <p className="mt-1 text-sm text-white/50">
          Signed in as <span className="font-mono text-white/80">{user?.username}</span>
        </p>
      </div>

      <Card title="Change password" className="animate-rise">
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Not shown: tells a password manager which account the new
              password belongs to, so it updates the saved entry. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={user?.username ?? ""}
            readOnly
            tabIndex={-1}
            aria-hidden
            className="sr-only"
          />

          <Field label="Current password">
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field
            label="Confirm new password"
            hint="There is no password recovery, so type it twice."
          >
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </Field>

          {errors.length > 0 && (
            <div role="alert" className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
              {errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}

          {changed && (
            <div role="status" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
              Password changed.
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary min-h-[44px] w-full px-4 text-sm">
            {submitting ? "Changing…" : "Change password"}
          </button>
        </form>
      </Card>
    </div>
  );
}
