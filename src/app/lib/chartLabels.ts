/**
 * Direct labels on a chart compete for the same few pixels — the lowest point
 * sits on the buffer line, the end sits beside the keep target, a cost lands
 * in the same month as the low. This decides which labels get drawn and where,
 * so a phone-width plot shows the ones that matter instead of a pile-up.
 *
 * Every label is a box (top-left, width, height) with one or more positions
 * to try, in order. Labels are placed greedily by priority: the first
 * position that lies inside the plot and clears everything already placed
 * wins; a label with no such position is dropped — the tooltip and the table
 * still carry it. No React, no SVG, so it is unit-tested beside the maths.
 */

export interface LabelCandidate {
  id: string;
  /** Lower places first. */
  priority: number;
  width: number;
  height: number;
  /** Top-left corners to try, in order of preference. */
  positions: { x: number; y: number }[];
}

export interface PlacedLabel {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Index into the candidate's `positions` — a caller may treat a fallback spot differently (a leader line, say). */
  position: number;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type Box = { x: number; y: number; width: number; height: number };

function inside(b: Box, bounds: Bounds): boolean {
  return b.x >= bounds.left && b.y >= bounds.top && b.x + b.width <= bounds.right && b.y + b.height <= bounds.bottom;
}

/** Overlap with `gap` px of air required between boxes. */
function overlaps(a: Box, b: Box, gap: number): boolean {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
}

export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * `obstacles` are boxes a label must also clear — the series line (one small
 * box per point) and its markers — so a label never runs across the data.
 */
export function placeLabels(
  candidates: LabelCandidate[],
  bounds: Bounds,
  gap = 2,
  obstacles: Obstacle[] = [],
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const ordered = [...candidates].sort((a, b) => a.priority - b.priority);
  for (const c of ordered) {
    for (let i = 0; i < c.positions.length; i++) {
      const pos = c.positions[i];
      const box = { x: pos.x, y: pos.y, width: c.width, height: c.height };
      if (!inside(box, bounds)) continue;
      if (placed.some((p) => overlaps(p, box, gap))) continue;
      if (obstacles.some((o) => overlaps(o, box, gap))) continue;
      placed.push({ id: c.id, ...box, position: i });
      break;
    }
  }
  return placed;
}

/**
 * A width estimate for a label before it is rendered — SVG text cannot be
 * measured until it is in the DOM, and the layout must be decided first.
 * 0.6em per character is the sans at these sizes with a little slack, so a
 * label is more likely dropped than clipped.
 */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}
