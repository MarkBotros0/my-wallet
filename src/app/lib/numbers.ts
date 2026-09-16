/** "5,000,000" / "5 000 000" / "5000000" → 5000000; blank or junk → null. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
