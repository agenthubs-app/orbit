import type { OrbitLanguage } from "../api/contract/language";
import type { OrbitLanguagePreferenceContract } from "../api/contract/account-language-preference";

export interface DeviceLocaleLike {
  languageCode?: string | null;
  languageTag?: string | null;
}

export type OrbitLanguageSource = "account" | "device" | "session-unsynced";

export function languageFromDeviceLocales(
  locales: readonly DeviceLocaleLike[],
): OrbitLanguage {
  for (const locale of locales) {
    const code = locale.languageCode?.toLowerCase()
      ?? locale.languageTag?.split(/[-_]/, 1)[0]?.toLowerCase();
    if (code === "zh" || code === "ja" || code === "en") return code;
  }
  return "zh";
}

export function resolveEffectiveLanguage(input: {
  deviceLanguage: OrbitLanguage;
  preference: OrbitLanguagePreferenceContract;
}): { language: OrbitLanguage; source: "account" | "device" } {
  return input.preference.mode === "manual"
    ? { language: input.preference.language, source: "account" }
    : { language: input.deviceLanguage, source: "device" };
}
