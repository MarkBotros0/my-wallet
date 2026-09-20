import { getDb } from "@/server/db";
import { hashPassword, newId, nowIso } from "@/server/auth";
import { handle, HttpError, json, readJson } from "@/server/http";
import { createAccessToken } from "@/server/token";
import { validateCredentials } from "@/lib/account/validate";

/**
 * POST /api/auth/register — create an account and sign it in.
 *
 * Public (see PUBLIC_ENDPOINTS in server/token.ts): anyone with the URL can
 * create an account. Every ledger row is user-scoped, so a stranger gets an
 * empty ledger of their own and nothing else. The response is exactly the
 * login response, so the client stores it the same way and the new user is
 * signed in at once.
 *
 * A taken username is detected from the UNIQUE violation, not a pre-select:
 * two sign-ups racing for the same name cannot both win.
 */

// Postgres SQLSTATE for unique_violation.
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === UNIQUE_VIOLATION;
}

export const POST = handle(async (req: Request) => {
  const result = validateCredentials(await readJson(req));
  if (!result.ok) throw new HttpError(400, result.errors.join(" "));
  const { username, password } = result.value;

  const sql = await getDb();
  const id = newId();
  try {
    await sql`
      INSERT INTO users (id, username, password_hash, created_at)
      VALUES (${id}, ${username}, ${await hashPassword(password)}, ${nowIso()})
    `;
  } catch (e: unknown) {
    if (isUniqueViolation(e)) throw new HttpError(409, "That username is taken.");
    throw e;
  }

  const token = await createAccessToken(id, username);
  return json({ access_token: token, token_type: "bearer", user: { id, username } }, 201);
});
