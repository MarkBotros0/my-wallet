import { getDb } from "@/server/db";
import { hashPassword, newId, nowIso, requireAdmin } from "@/server/auth";
import { handle, HttpError, json, readJson } from "@/server/http";
import { ROLE_USER, cleanPassword, cleanUsername, toManaged } from "@/server/users";

/**
 * User administration — the admin page's backend.
 *
 *   GET  /api/users   — list every user
 *   POST /api/users   — create one, generating a password
 *
 * Every route requires an admin. `role` is NOT settable here: admin status
 * comes only from the AUTH_ADMINS env var at boot (server/auth.ts
 * seedUsersFromEnv), so privilege escalation through this API is structurally
 * impossible.
 *
 * A generated password is returned EXACTLY ONCE, in the response to the call
 * that created it. Only the bcrypt hash is stored, so it can never be read
 * back.
 */

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const sql = await getDb();
  const rows = await sql<
    { id: string; username: string; role: string | null; is_active: boolean; created_at: string }[]
  >`
    SELECT id, username, role, is_active, created_at
    FROM users
    ORDER BY created_at ASC
  `;
  return json({ users: rows.map(toManaged) });
});

interface CreateBody {
  username?: string;
  password?: string | null;
}

export const POST = handle(async (req: Request) => {
  await requireAdmin(req);
  const body = await readJson<CreateBody>(req);
  const username = cleanUsername(body.username);
  const [password, generated] = cleanPassword(body.password);

  const sql = await getDb();
  const taken = await sql`SELECT id FROM users WHERE username = ${username}`;
  if (taken.length > 0) {
    throw new HttpError(409, `Username already taken: ${username}`);
  }

  const id = newId();
  const now = nowIso();
  await sql`
    INSERT INTO users (id, username, password_hash, created_at, role, is_active)
    VALUES (${id}, ${username}, ${await hashPassword(password)}, ${now}, ${ROLE_USER}, TRUE)
  `;

  return json(
    {
      user: { id, username, role: ROLE_USER, is_active: true, created_at: now },
      // Returned once and never again — only the hash is stored.
      generated_password: generated ? password : null,
    },
    201,
  );
});
