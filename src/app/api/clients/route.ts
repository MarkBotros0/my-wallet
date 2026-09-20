import { getDb } from "@/server/db";
import { getCurrentUser, newId, nowIso } from "@/server/auth";
import { handle, HttpError, json, readJson } from "@/server/http";
import { guardUniqueName, listClientsForYear } from "@/server/clients";
import { isYearKey, validateClientInput, yearRange } from "@/lib/ledger";

/**
 *   GET  /api/clients?year=YYYY  — every client with that year's income total
 *   POST /api/clients            — create one
 *
 * Both scoped to the caller.
 */

export const GET = handle(async (req: Request) => {
  const user = await getCurrentUser(req);
  const year = new URL(req.url).searchParams.get("year") ?? "";
  if (!isYearKey(year)) {
    throw new HttpError(400, "year must be YYYY.");
  }
  const sql = await getDb();
  const clients = await listClientsForYear(sql, user.id, yearRange(year));
  return json({ year, clients });
});

export const POST = handle(async (req: Request) => {
  const user = await getCurrentUser(req);
  const result = validateClientInput(await readJson(req));
  if (!result.ok) throw new HttpError(400, result.errors.join(" "));
  const { name, note } = result.value;

  const sql = await getDb();
  await guardUniqueName(sql, user.id, name);
  const id = newId();
  const now = nowIso();
  await sql`
    INSERT INTO clients (id, user_id, name, note, created_at, updated_at)
    VALUES (${id}, ${user.id}, ${name}, ${note}, ${now}, ${now})
  `;
  return json({ client: { id, name, note, created_at: now, updated_at: now } }, 201);
});
