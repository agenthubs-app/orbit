import type { OrbitLanguage } from "../api/contract/language";
import { currentOrbitLanguage } from "./locale-core";
import { en } from "./en";
import { ja } from "./ja";
import { zh } from "./zh";

// R03: the dictionaries are split by key prefix into src/i18n/<locale>/<domain>.ts.
// The Chinese dictionary is the key source; ja and en must satisfy the same keys.
export const messageKeys = Object.keys(zh) as (keyof typeof zh)[];

export type MessageKey = keyof typeof zh;
export type MessageDictionary = Readonly<Record<MessageKey, string>>;
export type MessageValues = Readonly<Record<string, string | number>>;

const dictionaries: Record<OrbitLanguage, MessageDictionary> = { en, ja, zh };

function interpolate(template: string, values: MessageValues | undefined): string {
  if (!values) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export interface OrbitTranslator {
  (key: MessageKey, values?: MessageValues): string;
  literal(value: string): string;
}

export function createTranslator(language: OrbitLanguage): OrbitTranslator {
  const translate = ((key: MessageKey, values?: MessageValues) =>
    interpolate(dictionaries[language][key], values)) as OrbitTranslator;
  translate.literal = (value: string) => value;
  return translate;
}

/** Translator for code above OrbitLocaleProvider: follows the language it publishes. */
export function currentTranslator(): OrbitTranslator {
  return createTranslator(currentOrbitLanguage());
}
