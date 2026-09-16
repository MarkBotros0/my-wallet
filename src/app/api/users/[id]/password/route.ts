import { getDb } from "@/server/db";
import { hashPassword, requireAdmin } from "@/server/auth";
import { handle, json, readJson } from "@/server/http";
import { cleanPassword, fetchUser } from "@/server/users";

/**
 * POST /api/users/{id}/password — reset a password.
 *
 * Leaving `password` empty is the intended path: a strong one is generated
 * and returned ONCE. Their current password stops working immediately; any
 * token they hold keeps working, because the token never carried the
 * password — that is what disable is for.
 */

type Params = { params: Promise<{ id: string }> };

interface ResetBody {
  password?: string | null;
}

export const POST = handle(async (req: Request, { params }: Params) => {
  await requireAdmin(req);
  const { id } = await params;
  const body = await readJson<ResetBody>(req);
  const [password, generated] = cleanPassword(body.password);

  const sql = await getDb();
  const target = await fetchUser(sql, id);

  await sql`UPDATE users SET password_hash = ${await hashPassword(password)} WHERE id = ${id}`;

  return json({
    id,
    username: target.username,
    generated_password: generated ? password : null,
  });
});
