import { getDb } from "@/server/db";
import { asRole, verifyPassword } from "@/server/auth";
import { handle, HttpError, json, readJson } from "@/server/http";
import { createAccessToken } from "@/server/token";

/**
 * POST /api/auth/login — exchange username + password for a JWT.
 *
 * The ONLY public API route (see PUBLIC_ENDPOINTS in server/token.ts). There is
 * no registration endpoint by design — users are seeded from AUTH_USERS at
 * startup or created by an admin.
 */

interface LoginBody {
  username?: string;
  password?: string;
}

interface Row {
  id: string;
  username: string;
  password_hash: string;
  role: string | null;
  is_active: boolean;
}

export const POST = handle(async (req: Request) => {
  const body = await readJson<LoginBody>(req);
  const username = (body.username ?? "").toLowerCase().trim();
  const password = body.password ?? "";
  if (!username || !password) {
    throw new HttpError(401, "Invalid username or password");
  }

  const sql = await getDb();
  const rows = await sql<Row[]>`
    SELECT id, username, password_hash, role, is_active FROM users WHERE username = ${username}
  `;
  const row = rows[0];
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new HttpError(401, "Invalid username or password");
  }
  if (!row.is_active) {
    throw new HttpError(403, "This account has been disabled.");
  }

  const token = await createAccessToken(row.id, row.username);
  return json({
    access_token: token,
    token_type: "bearer",
    user: { id: row.id, username: row.username, role: asRole(row.role) },
  });
});
