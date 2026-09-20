import { describe, expect, it } from "vitest";
import { clientBars, monthlyIncome } from "./summary";
import type { ClientSummary, MonthClientIncome } from "./types";

const row = (month: string, client_id: string | null, income: number): MonthClientIncome => ({
  month,
  client_id,
  income,
});

const client = (id: string, name: string, year_total: number, year_count = 1): ClientSummary => ({
  id,
  name,
  note: "",
  created_at: "",
  updated_at: "",
  year_total,
  year_share: year_total / 10,
  year_count,
});

describe("monthlyIncome", () => {
  const series = [
    row("2026-01", "a", 100),
    row("2026-01", "b", 50),
    row("2026-01", null, 25),
    row("2026-03", "a", 200.1),
    row("2026-03", "a", 0.2),
    row("2025-12", "a", 999), // another year, never counted
  ];

  it("returns twelve months, January first, with the year's income summed into each", () => {
    const out = monthlyIncome(series, "2026", "all");
    expect(out).toHaveLength(12);
    expect(out[0]).toBe(175);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(200.3, 2);
    expect(out.slice(3).every((v) => v === 0)).toBe(true);
  });

  it("filters to one client, or to income with no client", () => {
    expect(monthlyIncome(series, "2026", "a")[0]).toBe(100);
    expect(monthlyIncome(series, "2026", "b")).toEqual([50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(monthlyIncome(series, "2026", "none")[0]).toBe(25);
  });

  it("snaps sums to cents", () => {
    expect(monthlyIncome([row("2026-05", "a", 0.1), row("2026-05", "b", 0.2)], "2026", "all")[4]).toBe(0.3);
  });
});

describe("clientBars", () => {
  it("lists paying clients biggest first and drops those with nothing this year", () => {
    const bars = clientBars(
      [client("a", "Acme", 300), client("z", "Zed", 0, 0), client("b", "Bolt", 700)],
      { income: 1000, share: 100, count: 5 },
    );
    expect(bars.map((b) => b.name)).toEqual(["Bolt", "Acme"]);
    expect(bars[0]).toEqual({ id: "b", name: "Bolt", total: 700, count: 1 });
  });

  it("adds a 'No client' bar for income that no client accounts for, placed by size", () => {
    const bars = clientBars([client("a", "Acme", 300, 2)], { income: 1000, share: 100, count: 5 });
    expect(bars.map((b) => b.name)).toEqual(["No client", "Acme"]);
    expect(bars[0]).toEqual({ id: null, name: "No client", total: 700, count: 3 });
  });

  it("adds no such bar when the clients account for everything", () => {
    const bars = clientBars([client("a", "Acme", 300)], { income: 300, share: 30, count: 1 });
    expect(bars.map((b) => b.id)).toEqual(["a"]);
  });
});
