import type { OrbitLanguage } from "./language";

export type OrbitLanguagePreferenceContract =
  | {
      mode: "system";
      language: null;
      updatedAt: string | null;
    }
  | {
      mode: "manual";
      language: OrbitLanguage;
      updatedAt: string;
    };

export interface AccountLanguagePreferenceSaveContract {
  expectedUpdatedAt: string | null;
  language: OrbitLanguage | null;
  mode: "manual" | "system";
  mutationId: string;
}

export type AccountLanguagePreferenceSaveReceiptContract =
  OrbitLanguagePreferenceContract & {
    mutationId: string;
  };
