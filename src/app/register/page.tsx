"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MIN_PASSWORD_LENGTH, validateCredentials } from "@/lib/account/validate";
import { useAuth } from "../components/AuthProvider";
import { AUTH_BUTTON_CLASS, AUTH_INPUT_CLASS, AuthCard, withNext } from "../components/AuthCard";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, isAuthenticated } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const next = searchParams?.get("next") || "/";

  useEffect(() => {
    if (isAuthenticated) router.replace(next);
  }, [isAuthenticated, next, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // The SAME check the route runs, so a pair this form lets through is a
    // pair the server accepts — and a bad one is explained before a round trip.
    const result = validateCredentials({ username, password });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSubmitting(true);
    try {
      await register(result.value.username, result.value.password);
      router.replace(next);
    } catch (e: unknown) {
      setErrors([e instanceof Error ? e.message : "Could not create the account"]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-white/60">Username</label>
        <input
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={AUTH_INPUT_CLASS}
        />
        <p className="mt-1 text-xs text-white/40">3–32 characters: a–z, 0–9, dot, dash or underscore.</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-white/60">Password</label>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={AUTH_INPUT_CLASS}
        />
        <p className="mt-1 text-xs text-white/40">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <button type="submit" disabled={submitting} className={AUTH_BUTTON_CLASS}>
        {submitting ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-white/50">
        Already have an account?{" "}
        <Link href={withNext("/login", next)} className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <AuthCard title="Create account" subtitle="Your expenses, income and buying power.">
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
