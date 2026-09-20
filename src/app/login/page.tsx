"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import { AUTH_BUTTON_CLASS, AUTH_INPUT_CLASS, AuthCard, withNext } from "../components/AuthCard";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const next = searchParams?.get("next") || "/";

  useEffect(() => {
    if (isAuthenticated) router.replace(next);
  }, [isAuthenticated, next, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await login(username.trim().toLowerCase(), password);
      router.replace(next);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Invalid username or password";
      setErr(message);
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
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-white/60">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={AUTH_INPUT_CLASS}
        />
      </div>

      {err && (
        <div className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
          {err}
        </div>
      )}

      <button type="submit" disabled={submitting} className={AUTH_BUTTON_CLASS}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-sm text-white/50">
        New here?{" "}
        <Link href={withNext("/register", next)} className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard title="Sign in" subtitle="Your expenses, income and buying power.">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
