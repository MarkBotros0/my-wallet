"use client";

import { Suspense, useState, FormEvent, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

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
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[16px] text-white outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/20 md:text-sm"
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
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[16px] text-white outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/20 md:text-sm"
        />
      </div>

      {err && (
        <div className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-[44px] w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-charcoal-dark transition-opacity disabled:opacity-50"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-charcoal p-6 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="text-2xl font-bold text-accent">My</span>
            <span className="text-lg text-white/60">Wallet</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Sign in</h1>
          <p className="mt-1 text-sm text-white/50">Your expenses, income and buying power.</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
