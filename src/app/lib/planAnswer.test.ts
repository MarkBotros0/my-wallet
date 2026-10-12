import { describe, expect, it } from "vitest";
import type { PlanResult } from "@/lib/capacity";
import { newPlan, type FormError } from "./capacityForm";
import { isBlankPrice, planAnswer, realErrors } from "./planAnswer";

const result = (patch: Partial<PlanResult>): PlanResult => ({
  price: null,
  topUp: null,
  blocker: null,
  simulation: null,
  ...patch,
});

const base = { mode: "max" as const, errors: [] as FormError[], moneyBroken: false, currency: "EGP" };

describe("planAnswer", () => {
  it("max mode: the maximum, or Nothing affordable", () => {
    const plan = newPlan("p1");
    expect(planAnswer({ ...base, plan, result: result({ price: 8_860_000 }) })).toMatchObject({
      label: "Most you can pay",
      value: "8,860,000 EGP",
      tone: "answer",
    });
    expect(planAnswer({ ...base, plan, result: result({ price: null }) })).toMatchObject({
      value: "Nothing affordable",
      tone: "muted",
    });
    expect(planAnswer({ ...base, plan: newPlan("p2", { kind: "resale" }), result: null }).label).toBe("Most to the seller");
  });

  it("top-up mode: an amount, covered, or can't work", () => {
    const plan = newPlan("p1", { price: "9,000,000" });
    const topUp = { ...base, mode: "topUp" as const, plan };
    expect(planAnswer({ ...topUp, result: result({ price: 9e6, topUp: 120_000 }) })).toMatchObject({
      label: "Add each year",
      value: "120,000 EGP",
    });
    expect(planAnswer({ ...topUp, result: result({ price: 9e6, topUp: 0 }) }).value).toBe("0 — covered");
    expect(planAnswer({ ...topUp, result: result({ price: 9e6, topUp: null, blocker: "day-one" }) })).toMatchObject({
      value: "Can't work",
      tone: "problem",
    });
  });

  it("a blank top-up price asks for one instead of reporting an error", () => {
    const plan = newPlan("p1");
    const errors: FormError[] = [{ field: "plan.p1.price", message: "Enter the price to check." }];
    expect(isBlankPrice(plan, "topUp")).toBe(true);
    expect(isBlankPrice(plan, "max")).toBe(false);
    expect(realErrors(plan, "topUp", errors)).toEqual([]);
    expect(planAnswer({ ...base, mode: "topUp", plan, errors, result: null })).toMatchObject({
      value: "Enter a price",
      missing: "price",
    });
    // A price that is there but wrong IS an error.
    const bad = newPlan("p1", { price: "abc" });
    expect(realErrors(bad, "topUp", errors)).toEqual(errors);
    expect(planAnswer({ ...base, mode: "topUp", plan: bad, errors, result: null }).missing).toBe("plan");
  });

  it("a broken money step outranks the plan's own state", () => {
    expect(planAnswer({ ...base, moneyBroken: true, plan: newPlan("p1"), result: null })).toMatchObject({
      missing: "money",
      tone: "problem",
    });
  });
});
