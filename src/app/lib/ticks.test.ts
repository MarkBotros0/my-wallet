import { describe, expect, it } from "vitest";
import { niceTicks } from "./ticks";

describe("niceTicks", () => {
  it("spans the range with round steps", () => {
    const { ticks, lo, hi } = niceTicks(0, 1_340_000, 4);
    expect(lo).toBe(0);
    expect(hi).toBe(1_500_000);
    expect(ticks).toEqual([0, 500_000, 1_000_000, 1_500_000]);
  });

  it("gives a flat or empty range one step above its floor rather than a zero-height axis", () => {
    const { lo, hi } = niceTicks(0, 0, 4);
    expect(hi).toBeGreaterThan(lo);
  });
});
