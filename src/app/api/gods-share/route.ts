import { getDb } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { handle, json } from "@/server/http";
import { godsShareTotals, listSettlements } from "@/server/transactions";

/**
 *   GET /api/gods-share  — accrued / settled / remaining, all time, plus the
 *                          expenses that settled it (newest first)
 *
 * Scoped to the caller. Settling is not a verb here: a settlement is an
 * expense with gods_share set, written through POST /api/transactions.
 */

export const GET = handle(async (req: Request) => {
  const user = await getCurrentUser(req);
  const sql = await getDb();
  const [totals, settlements] = await Promise.all([
    godsShareTotals(sql, user.id),
    listSettlements(sql, user.id),
  ]);
  return json({ totals, settlements });
});
