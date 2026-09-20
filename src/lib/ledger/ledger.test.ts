import { describe, expect, it } from "vitest";
import {
  DEFAULT_GODS_SHARE_RATE,
  defaultGodsShare,
  godsShareTotals,
  groupByDay,
  isMonthKey,
  isYearKey,
  monthKeyOf,
  monthLabel,
  monthName,
  monthRange,
  shiftMonth,
  summarize,
  toIsoDate,
  validateClientInput,
  validateTransactionInput,
  yearOf,
  yearRange,
  type Transaction,
} from "./index";

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  kind: "expense",
  amount: 100,
  occurred_on: "2026-09-16",
  client_id: null,
  gods_share: 0,
  created_at: "2026-09-16T10:00:00.000Z",
  updated_at: "2026-09-16T10:00:00.000Z",
  ...over,
});

describe("validateTransactionInput", () => {
  const good = { kind: "expense", amount: 1250.5, occurred_on: "2026-09-16" };

  it("accepts a well-formed entry", () => {
    const r = validateTransactionInput(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        kind: "expense",
        amount: 1250.5,
        occurred_on: "2026-09-16",
        client_id: null,
        gods_share: 0,
      });
    }
  });

  it("ignores the category and note a stale client still sends", () => {
    const r = validateTransactionInput({ ...good, category: "x".repeat(41), note: "x".repeat(501) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).not.toHaveProperty("category");
      expect(r.value).not.toHaveProperty("note");
    }
  });

  describe("gods_share", () => {
    const income = { kind: "income", amount: 1000, occurred_on: "2026-09-16" };

    it("defaults to zero when absent", () => {
      const r = validateTransactionInput(income);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.gods_share).toBe(0);
    });

    it("accepts any amount from zero up to the entry's amount, on either kind", () => {
      for (const gods_share of [0, 0.01, 100, 1000]) {
        expect(validateTransactionInput({ ...income, gods_share }).ok, `income ${gods_share}`).toBe(true);
        expect(validateTransactionInput({ ...good, gods_share, amount: 1000 }).ok, `expense ${gods_share}`).toBe(true);
      }
    });

    it("rejects a share below zero, above the amount, or not a number", () => {
      for (const gods_share of [-1, 1000.01, "100", NaN, Infinity]) {
        const r = validateTransactionInput({ ...income, gods_share });
        expect(r.ok, String(gods_share)).toBe(false);
        if (!r.ok) expect(r.errors.some((e) => /God's share/.test(e))).toBe(true);
      }
    });

    it("rejects more than two decimals but snaps float noise to cents", () => {
      expect(validateTransactionInput({ ...income, gods_share: 1.005 }).ok).toBe(false);
      const r = validateTransactionInput({ ...income, gods_share: 0.1 + 0.2 });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.gods_share).toBe(0.3);
    });
  });

  describe("client_id", () => {
    const income = { kind: "income", amount: 1000, occurred_on: "2026-09-16" };

    it("is null when absent, empty or null", () => {
      for (const client_id of [undefined, null, ""]) {
        const r = validateTransactionInput({ ...income, client_id });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.client_id).toBeNull();
      }
    });

    it("is kept, trimmed, on an income entry", () => {
      const r = validateTransactionInput({ ...income, client_id: " c1 " });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.client_id).toBe("c1");
    });

    it("is refused on an expense — only income is collected from a client", () => {
      const r = validateTransactionInput({ ...good, client_id: "c1" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.some((e) => /client/i.test(e))).toBe(true);
    });

    it("rejects a non-string or an absurdly long id", () => {
      expect(validateTransactionInput({ ...income, client_id: 42 }).ok).toBe(false);
      expect(validateTransactionInput({ ...income, client_id: "x".repeat(65) }).ok).toBe(false);
    });
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
    expect(monthName("2026-09")).toBe("September");
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

describe("validateClientInput", () => {
  it("accepts a name and note, trimmed", () => {
    const r = validateClientInput({ name: "  Acme  ", note: " retainer " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ name: "Acme", note: "retainer" });
  });

  it("treats a missing note as empty", () => {
    const r = validateClientInput({ name: "Acme" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.note).toBe("");
  });

  it("requires a non-blank name of at most 60 characters", () => {
    for (const name of [undefined, "", "   ", 42, "x".repeat(61)]) {
      const r = validateClientInput({ name });
      expect(r.ok, String(name)).toBe(false);
      if (!r.ok) expect(r.errors.some((e) => /name/i.test(e))).toBe(true);
    }
    expect(validateClientInput({ name: "x".repeat(60) }).ok).toBe(true);
  });

  it("caps the note at 500 characters", () => {
    expect(validateClientInput({ name: "Acme", note: "x".repeat(501) }).ok).toBe(false);
    expect(validateClientInput({ name: "Acme", note: "x".repeat(500) }).ok).toBe(true);
  });

  it("rejects anything that is not an object", () => {
    expect(validateClientInput(null).ok).toBe(false);
    expect(validateClientInput("Acme").ok).toBe(false);
  });
});

describe("year helpers", () => {
  it("recognises YYYY keys only", () => {
    expect(isYearKey("2026")).toBe(true);
    expect(isYearKey("2026-09")).toBe(false);
    expect(isYearKey("26")).toBe(false);
    expect(isYearKey("")).toBe(false);
  });

  it("gives a half-open ISO range for a calendar year", () => {
    expect(yearRange("2026")).toEqual({ from: "2026-01-01", to: "2027-01-01" });
  });

  it("derives the year of a date", () => {
    expect(yearOf("2026-09-16")).toBe("2026");
  });
});

describe("God's share", () => {
  it("defaults to ten percent, snapped to cents", () => {
    expect(DEFAULT_GODS_SHARE_RATE).toBe(0.1);
    expect(defaultGodsShare(1000)).toBe(100);
    expect(defaultGodsShare(1234.56)).toBe(123.46);
    expect(defaultGodsShare(0.04)).toBe(0);
  });

  it("totals accrued from income, settled from expenses, and nets the remainder", () => {
    const t = godsShareTotals([
      tx({ kind: "income", amount: 10_000, gods_share: 1_000 }),
      tx({ kind: "income", amount: 5_000, gods_share: 0 }),
      tx({ kind: "income", amount: 3_000, gods_share: 250.5 }),
      tx({ kind: "expense", amount: 500, gods_share: 500 }),
      tx({ kind: "expense", amount: 80, gods_share: 0 }),
    ]);
    expect(t).toEqual({ accrued: 1_250.5, settled: 500, remaining: 750.5 });
  });

  it("is all zeros with nothing recorded", () => {
    expect(godsShareTotals([])).toEqual({ accrued: 0, settled: 0, remaining: 0 });
  });

  it("rounds away float noise in the totals", () => {
    const t = godsShareTotals([
      tx({ kind: "income", amount: 1, gods_share: 0.1 }),
      tx({ kind: "income", amount: 1, gods_share: 0.2 }),
    ]);
    expect(t.accrued).toBe(0.3);
    expect(t.remaining).toBe(0.3);
  });
});
