import type { Sql } from "./db";
import {
  ROLE_ADMIN,
  ROLE_USER,
  asRole,
  generatePassword,
  type CurrentUser,
  type Role,
} from "./auth";
import { HttpError } from "./http";

/**
 * Shared pieces of the admin-only /api/users routes — validation and the two
 * guards. Kept out of the route files so the list, create, reset, patch and
 * delete handlers all speak the same rules.
 */

export interface ManagedUser {
  id: string;
  username: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

export function cleanUsername(raw: unknown): string {
  const username = (typeof raw === "string" ? raw : "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(
      400,
      "Username must be 3–32 characters, using a–z, 0–9, dot, dash or underscore.",
    );
  }
  return username;
}

/** Return [password, wasGenerated]. Generates when none was supplied. */
export function cleanPassword(raw: unknown): [string, boolean] {
  if (typeof raw !== "string" || !raw.trim()) {
    return [generatePassword(), true];
  }
  const password = raw.trim();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return [password, false];
}

interface UserRow {
  id: string;
  username: string;
  role: string | null;
  is_active: boolean;
  created_at: string;
}

export function toManaged(row: UserRow): ManagedUser {
  return {
    id: row.id,
    username: row.username,
    role: asRole(row.role),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
  };
}

export async function fetchUser(sql: Sql, userId: string): Promise<ManagedUser> {
  const rows = await sql<UserRow[]>`
    SELECT id, username, role, is_active, created_at FROM users WHERE id = ${userId}
  `;
  if (!rows[0]) {
    throw new HttpError(404, `User not found: ${userId}`);
  }
  return toManaged(rows[0]);
}

export function guardNotSelf(targetId: string, admin: CurrentUser, verb: string): void {
  if (targetId === admin.id) {
    throw new HttpError(400, `You cannot ${verb} your own account.`);
  }
}

/** An app with no active admin can never be administered again. */
export async function guardNotLastAdmin(sql: Sql, target: ManagedUser, verb: string): Promise<void> {
  if (target.role !== ROLE_ADMIN || !target.is_active) return;
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM users WHERE role = ${ROLE_ADMIN} AND is_active = TRUE
  `;
  if (Number(rows[0]?.count ?? 0) <= 1) {
    throw new HttpError(
      400,
      `You cannot ${verb} the last active admin — no one could administer the app.`,
    );
  }
}

export { ROLE_USER };
