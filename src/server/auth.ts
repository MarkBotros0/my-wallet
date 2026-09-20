import { createHash, randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { getDb, type Sql } from "./db";
import { HttpError } from "./http";
import { bearerToken, decodeToken } from "./token";

/**
 * Authentication core — password hashing and resolving the caller from a
 * Bearer token. Ported from EGX's `core/auth.py`, minus the admin role:
 *
 *   - one kind of user; anyone can register (api/auth/register)
 *   - the caller is re-read from the DB on every request, never trusted from
 *     the token — a row deleted by hand ends that session at once
 *   - no e-mail, no recovery: a forgotten password is a row edit
 */

export interface CurrentUser {
  id: string;
  username: string;
}

const BCRYPT_ROUNDS = 12;

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

interface UserRow {
  id: string;
  username: string;
}

/** Read the live user row. Returns null if it is gone. */
async function loadUser(sql: Sql, userId: string): Promise<CurrentUser | null> {
  const rows = await sql<UserRow[]>`SELECT id, username FROM users WHERE id = ${userId}`;
  const row = rows[0];
  return row ? { id: row.id, username: row.username } : null;
}

/**
 * Resolve the caller, reading the row from the DB.
 *
 * The row is re-read on every request rather than trusted from the token.
 * Tokens live 30 days; if the row is gone, the session must end now, not in
 * a month. This is one indexed primary-key lookup on a pooled connection.
 */
export async function getCurrentUser(req: Request): Promise<CurrentUser> {
  const token = bearerToken(req.headers.get("authorization"));
  const payload = await decodeToken(token);
  const sql = await getDb();
  const user = await loadUser(sql, payload.sub);
  if (!user) {
    throw new HttpError(401, "Account not found");
  }
  return user;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}
