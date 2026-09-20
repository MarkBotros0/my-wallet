import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letter of the first two words, upper-cased", () => {
    expect(initials("Acme Corp")).toBe("AC");
    expect(initials("acme")).toBe("A");
    expect(initials("Al-Ahly Bank Egypt")).toBe("AB");
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(initials("  el  sayed ")).toBe("ES");
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
  });

  it("takes whole code points, so a script without case and an emoji survive", () => {
    expect(initials("شركة النيل")).toBe("شا");
    expect(initials("🚀 Rocket Ltd")).toBe("🚀R");
  });
});
