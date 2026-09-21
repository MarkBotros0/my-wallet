import { getDb } from "@/server/db";
import { getCurrentUser, hashPassword, verifyPassword } from "@/server/auth";
import { handle, HttpError, json, readJson } from "@/server/http";
import { validatePasswordChange } from "@/lib/account/validate";

/**
 * PUT /api/auth/password — change the caller's password, proving the current
 * one first.
 *
 * NOT in PUBLIC_ENDPOINTS: the gate in proxy.ts wants a valid token, and
 * getCurrentUser re-reads the row, so only a signed-in user changes their
 * own password — never anyone else's.
 *
 * A wrong current password is a 400, deliberately not a 401: lib/api.ts
 * treats every 401 as "the session is dead" and signs the user out, and a
 * typo in a form must not do that.
 *
 * Only the hash changes. Tokens are 30-day JWTs with no revocation, so a
 * session on another device rides out its lifetime — the same as the row
 * edit this route replaces. Chosen over signing other devices out
 * (password_changed_at + an iat check) on 2026-09-21, to stay simple.
 */

interface Row {
  password_hash: string;
}

export const PUT = handle(async (req: Request) => {
  const user = await getCurrentUser(req);
  const result = validatePasswordChange(await readJson(req));
  if (!result.ok) throw new HttpError(400, result.errors.join(" "));
  const { currentPassword, newPassword } = result.value;

  const sql = await getDb();
  const rows = await sql<Row[]>`SELECT password_hash FROM users WHERE id = ${user.id}`;
  const row = rows[0];
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw new HttpError(400, "Current password is incorrect.");
  }

  await sql`
    UPDATE users SET password_hash = ${await hashPassword(newPassword)} WHERE id = ${user.id}
  `;
  return json({ ok: true });
});
