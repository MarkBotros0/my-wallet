import { describe, expect, it } from "vitest";
import {
  groupByDay,
  isMonthKey,
  monthKeyOf,
  monthLabel,
  monthRange,
  shiftMonth,
  summarize,
  toIsoDate,
  validateTransactionInput,
  type Transaction,
} from "./index";

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  kind: "expense",
  amount: 100,
  occurred_on: "2026-09-16",
  category: "Food",
  note: "",
  created_at: "2026-09-16T10:00:00.000Z",
  updated_at: "2026-09-16T10:00:00.000Z",
  ...over,
});

describe("validateTransactionInput", () => {
  const good = { kind: "expense", amount: 1250.5, occurred_on: "2026-09-16", category: " Food ", note: "lunch " };

  it("accepts a well-formed entry and trims the text fields", () => {
    const r = validateTransactionInput(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ kind: "expense", amount: 1250.5, occurred_on: "2026-09-16", category: "Food", note: "lunch" });
    }
  });

  it("treats missing category and note as empty strings", () => {
    const r = validateTransactionInput({ kind: "income", amount: 5, occurred_on: "2026-01-01" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ category: "", note: "" });
  });

  it("rejects an unknown kind", () => {
    const r = validateTransactionInput({ ...good, kind: "transfer" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /kind/i.test(e))).toBe(true);
  });

  it("rejects a zero, negative, non-numeric or absurd amount", () => {
    for (const amount of [0, -5, "12", NaN, Infinity, 1e13]) {
      const r = validateTransactionInput({ ...good, amount });
      expect(r.ok, `amount ${String(amount)}`).toBe(false);
    }
  });

  it("rejects more than two decimals but tolerates float noise", () => {
    expect(validateTransactionInput({ ...good, amount: 1.005 }).ok).toBe(false);
    expect(validateTransactionInput({ ...good, amount: 0.1 + 0.2 }).ok).toBe(true); // 0.30000000000000004
  });

  it("rejects a malformed or impossible date", () => {
    for (const occurred_on of ["16/09/2026", "2026-9-16", "2026-02-30", "2026-13-01", "1969-12-31", "2101-01-01", ""]) {
      expect(validateTransactionInput({ ...good, occurred_on }).ok, occurred_on).toBe(false);
    }
    expect(validateTransactionInput({ ...good, occurred_on: "2024-02-29" }).ok).toBe(true); // leap day
  });

  it("caps category at 40 and note at 500 characters", () => {
    expect(validateTransactionInput({ ...good, category: "x".repeat(41) }).ok).toBe(false);
    expect(validateTransactionInput({ ...good, note: "x".repeat(501) }).ok).toBe(false);
    expect(validateTransactionInput({ ...good, category: "x".repeat(40), note: "x".repeat(500) }).ok).toBe(true);
  });

  it("rejects anything that is not an object", () => {
    expect(validateTransactionInput(null).ok).toBe(false);
    expect(validateTransactionInput("nope").ok).toBe(false);
  });
});

describe("month helpers", () => {
  it("recognises YYYY-MM keys only", () => {
    expect(isMonthKey("2026-09")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-9")).toBe(false);
    expect(isMonthKey("2026-09-01")).toBe(false);
  });

  it("gives a half-open ISO range for a month, rolling over the year", () => {
    expect(monthRange("2026-09")).toEqual({ from: "2026-09-01", to: "2026-10-01" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", -14)).toBe("2025-07");
  });

  it("derives the month key of a date and a readable label", () => {
    expect(monthKeyOf("2026-09-16")).toBe("2026-09");
    expect(monthLabel("2026-09")).toBe("September 2026");
    expect(monthLabel("2027-01")).toBe("January 2027");
  });

  it("formats a local Date as YYYY-MM-DD without timezone drift", () => {
    expect(toIsoDate(new Date(2026, 8, 16, 23, 59))).toBe("2026-09-16");
    expect(toIsoDate(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
});

describe("summarize", () => {
  it("adds income and expenses separately and nets them", () => {
    const s = summarize([
      tx({ kind: "income", amount: 30_000 }),
      tx({ kind: "expense", amount: 1_250.5 }),
      tx({ kind: "expense", amount: 749.5 }),
    ]);
    expect(s).toEqual({ income: 30_000, expenses: 2_000, net: 28_000, count: 3 });
  });

  it("is all zeros for an empty month", () => {
    expect(summarize([])).toEqual({ income: 0, expenses: 0, net: 0, count: 0 });
  });

  it("rounds away float noise in the totals", () => {
    const s = summarize([tx({ amount: 0.1 }), tx({ amount: 0.2 })]);
    expect(s.expenses).toBe(0.3);
    expect(s.net).toBe(-0.3);
  });
});

describe("groupByDay", () => {
  it("groups entries by date, newest day first, keeping the given order within a day", () => {
    const groups = groupByDay([
      tx({ id: "a", occurred_on: "2026-09-16", amount: 10 }),
      tx({ id: "b", occurred_on: "2026-09-16", kind: "income", amount: 100 }),
      tx({ id: "c", occurred_on: "2026-09-02", amount: 5 }),
      tx({ id: "d", occurred_on: "2026-09-20", amount: 7 }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(["2026-09-20", "2026-09-16", "2026-09-02"]);
    expect(groups[1].items.map((t) => t.id)).toEqual(["a", "b"]);
    expect(groups[1].net).toBe(90);
    expect(groups[2].net).toBe(-5);
  });

  it("returns no groups for no entries", () => {
    expect(groupByDay([])).toEqual([]);
  });
});
