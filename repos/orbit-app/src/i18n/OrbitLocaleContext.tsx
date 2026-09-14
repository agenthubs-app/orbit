import { createContext, useContext } from "react";

import type { OrbitLanguagePreferenceContract } from "../api/contract/account-language-preference";
import type { OrbitLanguage } from "../api/contract/language";
import type { OrbitLanguageSource } from "./locale-core";
import { createTranslator, type OrbitTranslator } from "./messages";

export type OrbitLanguageChoice = OrbitLanguage | "system";
export type OrbitLocaleSyncState = "conflict" | "error" | "idle" | "loading" | "saving";

export interface OrbitLocaleContextValue {
  choice: OrbitLanguageChoice;
  deviceLanguage: OrbitLanguage;
  error: string | null;
  language: OrbitLanguage;
  preference: OrbitLanguagePreferenceContract;
  retryLanguageSave(): Promise<void>;
  setLanguage(choice: OrbitLanguageChoice): Promise<void>;
  source: OrbitLanguageSource;
  syncState: OrbitLocaleSyncState;
  t: OrbitTranslator;
}

const fallbackLanguage = "zh" as const;
const fallbackContext: OrbitLocaleContextValue = {
  choice: "system",
  deviceLanguage: fallbackLanguage,
  error: null,
  language: fallbackLanguage,
  preference: {
    mode: "system",
    language: null,
    updatedAt: null,
  },
  retryLanguageSave: async () => undefined,
  setLanguage: async () => undefined,
  source: "device",
  syncState: "idle",
  t: createTranslator(fallbackLanguage),
};

export const OrbitLocaleContext = createContext<OrbitLocaleContextValue | null>(null);

export function useOrbitLocale(): OrbitLocaleContextValue {
  return useContext(OrbitLocaleContext) ?? fallbackContext;
}
