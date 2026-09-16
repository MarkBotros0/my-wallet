import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { handle, HttpError, json, readJson } from "@/server/http";
import { fetchUser, guardNotLastAdmin, guardNotSelf } from "@/server/users";

/**
 *   PATCH  /api/users/{id}  — enable / disable
 *   DELETE /api/users/{id}  — delete the user and everything they own
 *
 * Guards: you cannot disable or delete YOURSELF, or the LAST ACTIVE ADMIN —
 * either would leave the app with nobody able to administer it.
 */

type Params = { params: Promise<{ id: string }> };

interface PatchBody {
  is_active?: unknown;
}

export const PATCH = handle(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;
  const body = await readJson<PatchBody>(req);
  if (typeof body.is_active !== "boolean") {
    throw new HttpError(400, "is_active must be a boolean");
  }

  const sql = await getDb();
  const target = await fetchUser(sql, id);

  if (!body.is_active) {
    guardNotSelf(id, admin, "disable");
    await guardNotLastAdmin(sql, target, "disable");
  }

  await sql`UPDATE users SET is_active = ${body.is_active} WHERE id = ${id}`;
  return json({ ...target, is_active: body.is_active });
});

export const DELETE = handle(async (req: Request, { params }: Params) => {
  const admin = await requireAdmin(req);
  const { id } = await params;

  const sql = await getDb();
  const target = await fetchUser(sql, id);
  guardNotSelf(id, admin, "delete");
  await guardNotLastAdmin(sql, target, "delete");

  // No table has a foreign key to `users`, so nothing cascades — without this
  // the rows survive as invisible orphans. One transaction, so a half-deleted
  // user is impossible.
  //
  // EVERY table that carries a user_id belongs in this list. When the
  // transactions / accounts tables arrive, add them here in the same commit.
  await sql.begin(async (tx) => {
    await tx`DELETE FROM user_settings WHERE user_id = ${id}`;
    await tx`DELETE FROM users WHERE id = ${id}`;
  });

  return json({ deleted: id, username: target.username });
});
