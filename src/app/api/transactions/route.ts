import { getDb } from "@/server/db";
import { getCurrentUser, newId, nowIso } from "@/server/auth";
import { handle, HttpError, json, readJson } from "@/server/http";
import { categorySuggestions, listForMonth } from "@/server/transactions";
import { isMonthKey, monthRange, validateTransactionInput } from "@/lib/ledger";

/**
 *   GET  /api/transactions?month=YYYY-MM  — the month's entries + category suggestions
 *   POST /api/transactions                — create one
 *
 * Both scoped to the caller. Validation is src/lib/ledger/validate.ts, the
 * same code the form runs, so the two cannot disagree about what is allowed.
 */

export const GET = handle(async (req: Request) => {
  const user = await getCurrentUser(req);
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isMonthKey(month)) {
    throw new HttpError(400, "month must be YYYY-MM.");
  }
  const sql = await getDb();
  const [transactions, categories] = await Promise.all([
    listForMonth(sql, user.id, monthRange(month)),
    categorySuggestions(sql, user.id),
  ]);
  return json({ month, transactions, categories });
});

export const POST = handle(async (req: Request) => {
  const user = await getCurrentUser(req);
  const result = validateTransactionInput(await readJson(req));
  if (!result.ok) throw new HttpError(400, result.errors.join(" "));
  const { kind, amount, occurred_on, category, note } = result.value;

  const sql = await getDb();
  const id = newId();
  const now = nowIso();
  await sql`
    INSERT INTO transactions (id, user_id, kind, amount, occurred_on, category, note, created_at, updated_at)
    VALUES (${id}, ${user.id}, ${kind}, ${amount}, ${occurred_on}, ${category}, ${note}, ${now}, ${now})
  `;
  return json({ transaction: { id, kind, amount, occurred_on, category, note, created_at: now, updated_at: now } }, 201);
});
