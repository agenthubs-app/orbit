import type { OrbitLanguage } from "../../../../../shared/contract/language";

// R03 contract D: every redesign Web string is written in all three languages.
// `ja` is required (RD-11: Japanese is the default); a table that leaves it out
// does not type-check. Files in this folder are checked by `npm run copy:qa`.
export type OrbitCopyEntry = {
  readonly ja: string;
  readonly zh: string;
  readonly en: string;
  /** Component kind for copy-qa length and tone rules (chip, button, toast …). */
  readonly kind?: string;
};

export type OrbitCopyTable = Readonly<Record<string, OrbitCopyEntry>>;

export function pickCopy(entry: OrbitCopyEntry, language: OrbitLanguage): string {
  return entry[language];
}
