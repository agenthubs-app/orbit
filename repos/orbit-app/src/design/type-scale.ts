/**
 * UX-1 (user 2026-10-25: "字体整体偏小"): the App's type follows the iOS text styles instead of
 * the web kit's denser scale. Body copy reads at 17pt, secondary at 14–15, footnotes at 13 and
 * nothing is set below 11 — the sizes Apple's own apps use at the default Dynamic Type setting
 * (Large Title 34, Title 1 28, Title 2 22, Title 3 20, Headline/Body 17, Callout 16,
 * Subheadline 15, Footnote 13, Caption 12/11).
 *
 * The web kit sizes (tokens.json, shared with the Web app) stay as they are; this table maps a
 * kit size to the App size. Literal sizes in App styles were rewritten with the same table, so
 * a kit value and its App value never disagree.
 */
export const APP_TYPE_SCALE: Readonly<Record<number, number>> = Object.freeze({
  8: 11, 9: 11, 9.5: 12, 10: 12, 10.5: 12, 11: 13, 11.5: 13, 12: 14, 12.5: 15, 13: 15, 13.5: 16, 14: 17, 14.5: 17, 15: 17, 15.5: 17, 16: 18, 17: 19, 18: 20, 19: 21, 20: 22, 21: 23, 22: 24, 23: 25, 24: 28, 25: 28, 26: 28, 27: 30, 28: 30,
});

/** The App size for a kit size; sizes outside the table (large display numbers) are kept. */
export function appTypeSize(kitSize: number): number {
  return APP_TYPE_SCALE[kitSize] ?? kitSize;
}

export function appTypeScale<T extends Record<string, number>>(kitSizes: T): { readonly [K in keyof T]: number } {
  return Object.fromEntries(Object.entries(kitSizes).map(([name, size]) => [name, appTypeSize(size)])) as { [K in keyof T]: number };
}
