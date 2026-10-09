import { en } from "../api/copy/en";
import { ja } from "../api/copy/ja";
import { zh } from "../api/copy/zh";
import type { OrbitLanguage } from "../api/contract/language";
import { currentOrbitLanguage } from "./locale-core";
import { useOrbitLocale } from "./OrbitLocaleContext";

// R03 contract A: the fixed phrases (navigation, chips, toasts, confirm dialogs,
// offline / error / loading states, draft boundary …) come from the synced copy of
// orbits/shared/copy — the same source the Web uses. Never write them inline.
// Glossary and style: docs/designs/redesign-2026-10/sprints/R03-copy-and-ja/.
type CopyShape<T> = { readonly [Group in keyof T]: { readonly [Key in keyof T[Group]]: string } };
export type StandardCopy = CopyShape<typeof ja>;

// zh and en must carry every ja group and key (a missing one is a type error).
export const standardCopy: Readonly<Record<OrbitLanguage, StandardCopy>> = { ja, zh, en };

export function useStandardCopy(): StandardCopy {
  return standardCopy[useOrbitLocale().language];
}

/** For code above OrbitLocaleProvider: the wording in the language it publishes. */
export function currentStandardCopy(): StandardCopy {
  return standardCopy[currentOrbitLanguage()];
}

/** Fill `{name}` placeholders; unknown names stay as written. */
export function fillCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match));
}
