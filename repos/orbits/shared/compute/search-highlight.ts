// R30 global search (search/DESIGN.md §4.3): where each term hits inside the original text, as code point ranges.
// Matching is done on the folded text (NFKC / lower / no whitespace — search-normalize.ts); the ranges are mapped
// back onto the original so the client can wrap exactly those characters in <mark>. Pure.
import type { SearchHighlight } from "../contract/global-search";
import { lowerText } from "./compute-text";

/** Folded form of `text` plus, for every folded code point, the index of the original code point it came from. */
function foldWithMap(text: string): { folded: string; origin: number[] } {
  const chars = Array.from(text);
  let folded = "";
  const origin: number[] = [];
  chars.forEach((char, index) => {
    const piece = lowerText(char.normalize("NFKC")).replace(/\s+/gu, "");
    for (const unit of Array.from(piece)) {
      folded += unit;
      origin.push(index);
    }
  });
  return { folded, origin };
}

/** Ranges (code points, end exclusive, merged when touching) of every occurrence of every term in `text`. */
export function highlightRanges(text: string, terms: readonly string[]): { start: number; end: number }[] {
  if (!text || !terms.length) return [];
  const { folded, origin } = foldWithMap(text);
  const foldedUnits = Array.from(folded);
  const raw: { start: number; end: number }[] = [];
  for (const term of terms) {
    const needle = Array.from(term);
    if (!needle.length) continue;
    for (let at = 0; at + needle.length <= foldedUnits.length; at += 1) {
      let hit = true;
      for (let k = 0; k < needle.length; k += 1) if (foldedUnits[at + k] !== needle[k]) { hit = false; break; }
      if (!hit) continue;
      raw.push({ start: origin[at]!, end: origin[at + needle.length - 1]! + 1 });
    }
  }
  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const range of raw) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/** Highlights for a title and an optional subtitle, in the contract's shape. */
export function highlightsFor(title: string, subtitle: string | null | undefined, terms: readonly string[]): SearchHighlight[] {
  return [
    ...highlightRanges(title, terms).map((range) => ({ field: "title" as const, ...range })),
    ...highlightRanges(subtitle ?? "", terms).map((range) => ({ field: "subtitle" as const, ...range })),
  ];
}

/** Split `text` into plain / marked pieces by code point ranges (what both clients render). */
export function splitByHighlights(text: string, ranges: readonly { start: number; end: number }[]): { text: string; marked: boolean }[] {
  const chars = Array.from(text);
  const pieces: { text: string; marked: boolean }[] = [];
  let cursor = 0;
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const start = Math.max(cursor, Math.min(range.start, chars.length));
    const end = Math.max(start, Math.min(range.end, chars.length));
    if (start > cursor) pieces.push({ marked: false, text: chars.slice(cursor, start).join("") });
    if (end > start) pieces.push({ marked: true, text: chars.slice(start, end).join("") });
    cursor = end;
  }
  if (cursor < chars.length) pieces.push({ marked: false, text: chars.slice(cursor).join("") });
  return pieces;
}
