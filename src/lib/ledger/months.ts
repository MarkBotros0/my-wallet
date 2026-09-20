/**
 * Dates as ISO text. Every date in this app is a 'YYYY-MM-DD' string and
 * every month a 'YYYY-MM' key: they sort correctly as strings, they carry no
 * timezone, and a month is the half-open range [first day, next first day).
 */

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_KEY_RE = /^\d{4}$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isMonthKey(value: string): boolean {
  return MONTH_KEY_RE.test(value);
}

export function isYearKey(value: string): boolean {
  return YEAR_KEY_RE.test(value);
}

/** `[from, to)` — the year's first day and the NEXT year's first day. */
export function yearRange(year: string): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${Number(year) + 1}-01-01` };
}

export function yearOf(isoDate: string): string {
  return isoDate.slice(0, 4);
}

/** True for a real calendar date written as YYYY-MM-DD (2026-02-30 is not). */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `[from, to)` — the month's first day and the NEXT month's first day. */
export function monthRange(key: string): { from: string; to: string } {
  return { from: `${key}-01`, to: `${shiftMonth(key, 1)}-01` };
}

export function shiftMonth(key: string, delta: number): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7)); // 1-based
  const index = year * 12 + (month - 1) + delta;
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return `${y}-${pad2(m)}`;
}

export function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 'September 2026'. Spelled here rather than via Intl so it is identical on server and client. */
export function monthLabel(key: string): string {
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/** A local Date → 'YYYY-MM-DD' in the same local calendar — never via toISOString, which shifts to UTC. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
