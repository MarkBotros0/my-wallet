"use client";

import { useState, useSyncExternalStore } from "react";

const trimSlashes = (url: string) => url.trim().replace(/\/+$/, "");

// The browser's origin, read the hydration-safe way: "" on the server and
// during the hydration render, the real value on the client straight after.
// (Origin never changes for a page's lifetime, so there is nothing to
// subscribe to.)
const noSubscribe = () => () => {};
const useOrigin = () =>
  useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );

/**
 * Shows a generated password exactly once.
 *
 * The backend stores only the bcrypt hash, so this really is the only time it
 * can ever be displayed — the copy is blunt about that rather than leaving the
 * admin to discover it by closing the dialog too early.
 */
export default function PasswordRevealDialog({
  username,
  password,
  onClose,
}: {
  username: string;
  password: string;
  onClose: () => void;
}) {
  // Which button was last used, so each shows its own "Copied" feedback.
  const [copied, setCopied] = useState<"all" | "password" | null>(null);

  // NEXT_PUBLIC_APP_URL is inlined at build time; `window.location.origin`
  // fills in when it is unset. The link must never be blank: an admin pasting
  // credentials with no address is the whole reason this line exists. Set the
  // variable only where the origin the admin happens to be browsing would be
  // the wrong address to send.
  const origin = useOrigin();
  const appUrl = trimSlashes(process.env.NEXT_PUBLIC_APP_URL ?? "") || trimSlashes(origin);

  // Link, username and password in one block, because it gets pasted into one
  // message. Copying the password alone left the admin to type the username by
  // hand into the same chat — and credentials with no address are a login the
  // recipient cannot use.
  const message = [appUrl && `Link: ${appUrl}`, `Username: ${username}`, `Password: ${password}`]
    .filter(Boolean)
    .join("\n");

  // "Copy password only" is here for the WhatsApp case: when the combined block
  // lands as one message, a recipient long-pressing it copies all three lines.
  // Sending the bare password as its OWN message lets them copy it in one tap.
  const copyText = async (text: string, which: "all" | "password") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some mobile browsers.
      // Every value is on screen and selectable, so this is not a dead end.
      setCopied(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-md rounded-t-2xl border border-white/10 bg-charcoal p-5 md:rounded-2xl">
        <h2 className="text-lg font-bold text-white">Login details</h2>
        <p className="mt-1 text-sm text-white/50">
          Copy these now — the password cannot be shown again. If it is lost, generate a new one.
        </p>

        {/* Mirrors the copied text exactly, so what is sent matches what was
            checked on screen. */}
        <div className="mt-4 select-all rounded-lg border border-accent/30 bg-accent/5 p-3">
          {appUrl && (
            <div className="mb-2 flex gap-2 border-b border-white/10 pb-2">
              <span className="w-[70px] shrink-0 text-xs text-white/40">Link</span>
              <code className="flex-1 break-all font-mono text-sm text-white">{appUrl}</code>
            </div>
          )}
          <div className="flex gap-2">
            <span className="w-[70px] shrink-0 text-xs text-white/40">Username</span>
            <code className="flex-1 break-all font-mono text-sm text-white">{username}</code>
          </div>
          <div className="mt-2 flex gap-2 border-t border-white/10 pt-2">
            <span className="w-[70px] shrink-0 text-xs text-white/40">Password</span>
            <code className="flex-1 break-all font-mono text-sm text-white">{password}</code>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <button
            onClick={() => copyText(message, "all")}
            className="min-h-[44px] w-full rounded-lg bg-accent px-4 text-sm font-semibold text-charcoal-dark transition-opacity active:opacity-70"
          >
            {copied === "all" ? "Copied" : "Copy link, username & password"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => copyText(password, "password")}
              className="min-h-[44px] flex-1 rounded-lg border border-white/10 px-4 text-sm text-white/70 transition-colors hover:bg-white/5"
            >
              {copied === "password" ? "Copied" : "Copy password only"}
            </button>
            <button
              onClick={onClose}
              className="min-h-[44px] rounded-lg border border-white/10 px-4 text-sm text-white/70 transition-colors hover:bg-white/5"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
