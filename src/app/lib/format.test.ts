import { describe, expect, it } from "vitest";
import { formatCompact } from "./format";

describe("formatCompact", () => {
  it("keeps up to two decimals for axis ticks", () => {
    expect(formatCompact(1_250_000)).toBe("1.25M");
    expect(formatCompact(500_000)).toBe("500K");
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(-80_000)).toBe("−80K");
  });

  it("rounds to a number of significant figures for a direct label", () => {
    expect(formatCompact(616_880, 3)).toBe("617K");
    expect(formatCompact(771_100, 3)).toBe("771K");
    expect(formatCompact(72_290, 3)).toBe("72.3K");
    expect(formatCompact(1_501_246, 3)).toBe("1.5M");
    expect(formatCompact(5_000_000, 3)).toBe("5M");
    expect(formatCompact(999_600, 3)).toBe("1M");
  });
});
