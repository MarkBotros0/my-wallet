import { createHash, randomInt, randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { getDb, type Sql } from "./db";
import { HttpError } from "./http";
import { bearerToken, decodeToken } from "./token";

/**
 * Authentication core — password hashing and resolving the caller from a
 * Bearer token. Ported from EGX's `core/auth.py`; the model is the same:
 *
 *   - two roles, `user` and `admin`, on users.role
 *   - admin status comes ONLY from the AUTH_ADMINS env var, re-asserted on
 *     every boot; no API route writes a role
 *   - AUTH_USERS only CREATES users that do not exist — never rewrites a hash
 *   - role and active-state are read from the DB on every request, never
 *     trusted from the token
 *   - no registration endpoint; accounts come from an admin or the env seed
 */

export const ROLE_USER = "user";
export const ROLE_ADMIN = "admin";
export type Role = typeof ROLE_USER | typeof ROLE_ADMIN;

export interface CurrentUser {
  id: string;
  username: string;
  role: Role;
  is_active: boolean;
}

export const isAdmin = (u: CurrentUser): boolean => u.role === ROLE_ADMIN;

// Ambiguous glyphs removed: a generated password gets read off a screen and
// typed by hand, so 0/O and 1/l/I cost support time for no entropy worth
// keeping. 16 chars of this alphabet is ~91 bits.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const GENERATED_PASSWORD_LENGTH = 16;

const BCRYPT_ROUNDS = 12;

/** A random password for an admin to hand to a user. Never stored raw. */
export function generatePassword(length = GENERATED_PASSWORD_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

/**
 * SHA-256 → base64 (44 chars), comfortably under bcrypt's 72-byte input cap.
 * Eliminates length errors for arbitrarily long passwords without silently
 * truncating (which would collide different passwords). Base64 rather than
 * raw bytes because bcrypt treats its input as a C string and a raw digest
 * can contain a NUL.
 */
function prehash(password: string): string {
  return createHash("sha256").update(password, "utf8").digest("base64");
}

export async function hashPassword(password: string): Promise<string> {
  return hash(prehash(password), BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await compare(prehash(password), passwordHash);
  } catch {
    return false;
  }
}

export function asRole(value: unknown): Role {
  return value === ROLE_ADMIN ? ROLE_ADMIN : ROLE_USER;
}

interface UserRow {
  id: string;
  username: string;
  role: string | null;
  is_active: boolean;
}

/** Read the live user row. Returns null if missing or disabled. */
async function loadUser(sql: Sql, userId: string): Promise<CurrentUser | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, username, role, is_active FROM users WHERE id = ${userId}
  `;
  const row = rows[0];
  if (!row || !row.is_active) return null;
  return { id: row.id, username: row.username, role: asRole(row.role), is_active: true };
}

/**
 * Resolve the caller, reading role and active-state from the DB.
 *
 * The row is re-read on every request rather than trusted from the token.
 * Tokens live 30 days, so carrying `role`/`is_active` as claims would mean an
 * admin disabling a user changes nothing for a month — "disable" would be a
 * lie. This is one indexed primary-key lookup on a pooled connection.
 */
export async function getCurrentUser(req: Request): Promise<CurrentUser> {
  const token = bearerToken(req.headers.get("authorization"));
  const payload = await decodeToken(token);
  const sql = await getDb();
  const user = await loadUser(sql, payload.sub);
  if (!user) {
    // Same message for "deleted" and "disabled" — the distinction is not the
    // caller's business, and either way they must log in again.
    throw new HttpError(401, "Account is not active");
  }
  return user;
}

export async function requireAdmin(req: Request): Promise<CurrentUser> {
  const user = await getCurrentUser(req);
  if (!isAdmin(user)) {
    throw new HttpError(403, "Admin access required");
  }
  return user;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

function parseAdminUsernames(): Set<string> {
  const raw = (process.env.AUTH_ADMINS ?? "").trim();
  return new Set(
    raw
      .split(",")
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Create users from AUTH_USERS and stamp admin roles from AUTH_ADMINS.
 *
 * Format: `AUTH_USERS=alice:pw1,bob:pw2` — each entry `username:password`.
 *         `AUTH_ADMINS=alice` — comma-separated usernames.
 *
 * Passwords here are for BOOTSTRAP only. An existing user's password hash is
 * never touched: admins reset passwords through /api/users, and rewriting the
 * hash on every boot would silently revert every reset on the next cold start.
 *
 * AUTH_ADMINS is authoritative for admin status and is re-applied on every
 * boot, so it survives a DB reset and you cannot lock yourself out by fumbling
 * a role in the database. Demotion of unlisted users only happens when
 * AUTH_ADMINS is non-empty — a blank or unset var must never strip every admin
 * and leave the app unmanageable.
 */
export async function seedUsersFromEnv(sql: Sql): Promise<void> {
  const admins = parseAdminUsernames();
  const raw = (process.env.AUTH_USERS ?? "").trim();
  const now = nowIso();

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed || !trimmed.includes(":")) continue;
    const idx = trimmed.indexOf(":");
    const username = trimmed.slice(0, idx).trim().toLowerCase();
    const password = trimmed.slice(idx + 1).trim();
    if (!username || !password) continue;

    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (existing.length === 0) {
      await sql`
        INSERT INTO users (id, username, password_hash, created_at, role, is_active)
        VALUES (${newId()}, ${username}, ${await hashPassword(password)}, ${now},
                ${admins.has(username) ? ROLE_ADMIN : ROLE_USER}, TRUE)
      `;
    }
  }

  if (admins.size > 0) {
    const list = [...admins];
    await sql`UPDATE users SET role = ${ROLE_ADMIN} WHERE username = ANY(${list}) AND role <> ${ROLE_ADMIN}`;
    await sql`UPDATE users SET role = ${ROLE_USER} WHERE NOT (username = ANY(${list})) AND role <> ${ROLE_USER}`;
  }
}
