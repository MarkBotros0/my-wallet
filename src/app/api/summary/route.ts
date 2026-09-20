import { getDb } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { handle, HttpError, json } from "@/server/http";
import { listClientsForYear } from "@/server/clients";
import { godsShareTotals, incomeByMonthAndClient, incomeTotals } from "@/server/transactions";
import { isMonthKey, monthRange, yearRange, type HomeSummary } from "@/lib/ledger";

/**
 *   GET /api/summary?month=YYYY-MM  — everything Home shows, in one response:
 *                                     the month's and the year's income, the
 *                                     share totals (all time), the year's
 *                                     per-client totals and the per-month ×
 *                                     per-client income series.
 *
 * The month is the phone's, not the server's — the two can be on different
 * days. Scoped to the caller.
 */
export const GET = handle(async (req: Request) => {
  const user = await getCurrentUser(req);
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isMonthKey(month)) {
    throw new HttpError(400, "month must be YYYY-MM.");
  }
  const year = month.slice(0, 4);
  const sql = await getDb();
  const [monthIncome, yearIncome, share, clients, series] = await Promise.all([
    incomeTotals(sql, user.id, monthRange(month)),
    incomeTotals(sql, user.id, yearRange(year)),
    godsShareTotals(sql, user.id),
    listClientsForYear(sql, user.id, yearRange(year)),
    incomeByMonthAndClient(sql, user.id, yearRange(year)),
  ]);
  const body: HomeSummary = { month, year, monthIncome, yearIncome, share, clients, series };
  return json(body);
});
