/**
 * Clean axis ticks (1 / 2 / 2.5 / 5 × 10ⁿ) spanning [min, max]. Shared by
 * every hand-rolled chart so their axes read the same.
 */
export function niceTicks(min: number, max: number, count: number): { ticks: number[]; lo: number; hi: number } {
  const range = max - min || Math.abs(max) || 1;
  const rough = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { ticks, lo, hi: hi === lo ? lo + step : hi };
}
