import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { en } from "../../../../../shared/copy/en";
import { ja } from "../../../../../shared/copy/ja";
import { zh } from "../../../../../shared/copy/zh";

// R03 contract A: the Web side of the standard wording. The App reads the same
// source through its synced copy (src/i18n/standard-copy.ts), so changing a line in
// shared/copy changes both clients.
type CopyShape<T> = { readonly [Group in keyof T]: { readonly [Key in keyof T[Group]]: string } };
export type StandardCopy = CopyShape<typeof ja>;

// zh and en must carry every ja group and key (a missing one is a type error).
export const standardCopy: Readonly<Record<OrbitLanguage, StandardCopy>> = { ja, zh, en };

export function standardCopyFor(language: OrbitLanguage): StandardCopy {
  return standardCopy[language];
}
