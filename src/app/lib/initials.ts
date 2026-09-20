/**
 * A name's monogram: the first letter of its first two words, upper-cased —
 * "Acme Corp" → "AC", "acme" → "A". Whole code points, so an emoji or a
 * script without case comes through intact rather than as half a surrogate.
 */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]!.toUpperCase())
    .join("");
}
