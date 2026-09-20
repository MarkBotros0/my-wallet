import { getDb } from "@/server/db";
import { getCurrentUser, nowIso } from "@/server/auth";
import { handle, HttpError, json, readJson } from "@/server/http";
import { clientOptions, fetchOwnedClient, guardUniqueName } from "@/server/clients";
import { categorySuggestions, listForClient } from "@/server/transactions";
import { isYearKey, validateClientInput, yearRange } from "@/lib/ledger";

/**
 *   GET    /api/clients/{id}?year=YYYY  — the client + that year's income entries,
 *                                         plus what the entry form needs
 *   PUT    /api/clients/{id}            — rename / note
 *   DELETE /api/clients/{id}            — unlink its entries, then delete it
 *
 * `fetchOwnedClient` 404s unless the row is the caller's, so no verb can
 * reach another user's client.
 */

type Params = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Params) => {
  const user = await getCurrentUser(req);
  const { id } = await params;
  const year = new URL(req.url).searchParams.get("year") ?? "";
  if (!isYearKey(year)) {
    throw new HttpError(400, "year must be YYYY.");
  }
  const sql = await getDb();
  const client = await fetchOwnedClient(sql, user.id, id);
  const [transactions, categories, clients] = await Promise.all([
    listForClient(sql, user.id, id, yearRange(year)),
    categorySuggestions(sql, user.id),
    clientOptions(sql, user.id),
  ]);
  return json({ client, year, transactions, categories, clients });
});

export const PUT = handle(async (req: Request, { params }: Params) => {
  const user = await getCurrentUser(req);
  const { id } = await params;
  const result = validateClientInput(await readJson(req));
  if (!result.ok) throw new HttpError(400, result.errors.join(" "));
  const { name, note } = result.value;

  const sql = await getDb();
  const existing = await fetchOwnedClient(sql, user.id, id);
  await guardUniqueName(sql, user.id, name, id);
  const now = nowIso();
  await sql`
    UPDATE clients SET name = ${name}, note = ${note}, updated_at = ${now}
    WHERE id = ${id} AND user_id = ${user.id}
  `;
  return json({ client: { ...existing, name, note, updated_at: now } });
});

export const DELETE = handle(async (req: Request, { params }: Params) => {
  const user = await getCurrentUser(req);
  const { id } = await params;
  const sql = await getDb();
  await fetchOwnedClient(sql, user.id, id);
  // The income stays — it happened, and its God's share is still owed. Only
  // the link goes, in the same transaction as the client.
  await sql.begin(async (tx) => {
    await tx`UPDATE transactions SET client_id = NULL WHERE client_id = ${id} AND user_id = ${user.id}`;
    await tx`DELETE FROM clients WHERE id = ${id} AND user_id = ${user.id}`;
  });
  return json({ deleted: id });
});
