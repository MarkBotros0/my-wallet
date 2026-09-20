import { describe, expect, it } from "vitest";
import { placeLabels, textWidth, type LabelCandidate } from "./chartLabels";

const BOUNDS = { left: 0, top: 0, right: 300, bottom: 200 };

const label = (id: string, priority: number, positions: { x: number; y: number }[]): LabelCandidate => ({
  id,
  priority,
  width: 60,
  height: 14,
  positions,
});

describe("placeLabels", () => {
  it("places a label that fits at its first position, saying which position won", () => {
    const placed = placeLabels([label("a", 1, [{ x: 10, y: 10 }])], BOUNDS);
    expect(placed).toEqual([{ id: "a", x: 10, y: 10, width: 60, height: 14, position: 0 }]);
  });

  it("gives a higher-priority label its spot and moves the lower one to its alternative", () => {
    const placed = placeLabels(
      [
        label("low", 2, [
          { x: 20, y: 10 },
          { x: 20, y: 40 },
        ]),
        label("high", 1, [{ x: 10, y: 10 }]),
      ],
      BOUNDS,
    );
    expect(placed.map((p) => [p.id, p.y])).toEqual([
      ["high", 10],
      ["low", 40],
    ]);
  });

  it("falls to the alternative when the first position leaves the plot", () => {
    const placed = placeLabels(
      [
        label("edge", 1, [
          { x: 260, y: 10 }, // right edge at 320 > 300
          { x: 230, y: 10 },
        ]),
      ],
      BOUNDS,
    );
    expect(placed).toEqual([{ id: "edge", x: 230, y: 10, width: 60, height: 14, position: 1 }]);
  });

  it("drops a label when none of its positions fit", () => {
    const placed = placeLabels(
      [label("high", 1, [{ x: 10, y: 10 }]), label("low", 2, [{ x: 12, y: 12 }, { x: 250, y: 10 }])],
      BOUNDS,
    );
    expect(placed.map((p) => p.id)).toEqual(["high"]);
  });

  it("treats obstacles — the line, the markers — like labels already placed", () => {
    const line = [
      { x: 30, y: 15, width: 2, height: 2 },
      { x: 60, y: 18, width: 2, height: 2 },
    ];
    const placed = placeLabels([label("a", 1, [{ x: 10, y: 10 }, { x: 10, y: 40 }])], BOUNDS, 2, line);
    expect(placed).toEqual([{ id: "a", x: 10, y: 40, width: 60, height: 14, position: 1 }]);
  });

  it("keeps a gap between neighbours, so touching boxes count as overlapping", () => {
    const placed = placeLabels(
      [label("a", 1, [{ x: 10, y: 10 }]), label("b", 2, [{ x: 71, y: 10 }, { x: 10, y: 40 }])],
      BOUNDS,
      4,
    );
    expect(placed.map((p) => [p.id, p.x, p.y])).toEqual([
      ["a", 10, 10],
      ["b", 10, 40],
    ]);
  });
});

describe("textWidth", () => {
  it("grows with the text and the font size", () => {
    expect(textWidth("Lowest 512K", 11)).toBeGreaterThan(textWidth("Lowest", 11));
    expect(textWidth("Lowest", 14)).toBeGreaterThan(textWidth("Lowest", 11));
  });
});
