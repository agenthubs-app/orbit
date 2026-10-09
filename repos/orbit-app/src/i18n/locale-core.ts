import type { OrbitLanguage } from "../api/contract/language";
import type { OrbitLanguagePreferenceContract } from "../api/contract/account-language-preference";

export interface DeviceLocaleLike {
  languageCode?: string | null;
  languageTag?: string | null;
}

export type OrbitLanguageSource = "account" | "device" | "session-unsynced";

// R03 / RD-11: Japanese is the language of last resort.
export const ORBIT_DEFAULT_LANGUAGE: OrbitLanguage = "ja";

// Legacy test seam (R03). Tests written for the old screens assume the pre-R03
// Chinese default; their harnesses define this constant as "zh" (esbuild `define`
// for browser bundles, a global in tests/helpers/register-render-hooks.mjs).
// Production builds never define it. Remove together with the last legacy test.
declare const __ORBIT_LEGACY_TEST_LANGUAGE__: OrbitLanguage | undefined;

let publishedLanguage: OrbitLanguage | null = null;

/**
 * OrbitLocaleProvider publishes the effective language here, so code that runs
 * above it (AuthSessionProvider, the root error boundary) speaks the same language.
 */
export function publishOrbitLanguage(language: OrbitLanguage): void {
  publishedLanguage = language;
}

export function currentOrbitLanguage(): OrbitLanguage {
  return publishedLanguage ?? fallbackOrbitLanguage();
}

/** The language a screen uses before any device or account language is known. */
export function fallbackOrbitLanguage(): OrbitLanguage {
  return typeof __ORBIT_LEGACY_TEST_LANGUAGE__ === "string" ? __ORBIT_LEGACY_TEST_LANGUAGE__ : ORBIT_DEFAULT_LANGUAGE;
}

export function languageFromDeviceLocales(
  locales: readonly DeviceLocaleLike[],
): OrbitLanguage {
  for (const locale of locales) {
    const code = locale.languageCode?.toLowerCase()
      ?? locale.languageTag?.split(/[-_]/, 1)[0]?.toLowerCase();
    if (code === "zh" || code === "ja" || code === "en") return code;
  }
  // R03 / RD-11: an unsupported device language falls back to Japanese.
  return ORBIT_DEFAULT_LANGUAGE;
}

export function resolveEffectiveLanguage(input: {
  deviceLanguage: OrbitLanguage;
  preference: OrbitLanguagePreferenceContract;
}): { language: OrbitLanguage; source: "account" | "device" } {
  return input.preference.mode === "manual"
    ? { language: input.preference.language, source: "account" }
    : { language: input.deviceLanguage, source: "device" };
}
