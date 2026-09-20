/**
 * The one place the sign-up rules are spelled. The register route AND the
 * register form call this, so a value the form lets through is a value the
 * server accepts — the same arrangement as lib/ledger/validate.ts.
 */

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 8;

export interface Credentials {
  username: string;
  password: string;
}

export type CredentialsResult =
  | { ok: true; value: Credentials }
  | { ok: false; errors: string[] };

/** Trimmed and lower-cased — the form a username is stored and matched in. */
export function normalizeUsername(raw: unknown): string {
  return (typeof raw === "string" ? raw : "").trim().toLowerCase();
}

export function validateCredentials(raw: unknown): CredentialsResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["Credentials must be an object."] };
  }
  const src = raw as Record<string, unknown>;
  const errors: string[] = [];

  const username = normalizeUsername(src.username);
  if (!USERNAME_PATTERN.test(username)) {
    errors.push("Username must be 3–32 characters, using a–z, 0–9, dot, dash or underscore.");
  }

  // NOT trimmed: login does not trim either, so what was typed here is
  // exactly what signs in later.
  const password = typeof src.password === "string" ? src.password : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { username, password } };
}
