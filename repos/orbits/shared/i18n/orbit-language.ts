import type { OrbitLanguage } from "../contract/language";
import { ORBIT_LANGUAGES } from "../domain/language";

export { ORBIT_LANGUAGES, type OrbitLanguage };

const supportedLanguages = new Set<string>(ORBIT_LANGUAGES);

export function parseOrbitLanguage(
  value: string | null | undefined,
): OrbitLanguage | null {
  return value && supportedLanguages.has(value)
    ? (value as OrbitLanguage)
    : null;
}

export function resolveOrbitLanguage(input: {
  requestLanguage?: string | null;
  preferredLanguage?: string | null;
  fallbackLanguage?: OrbitLanguage;
}): OrbitLanguage {
  return (
    parseOrbitLanguage(input.requestLanguage) ??
    parseOrbitLanguage(input.preferredLanguage) ??
    input.fallbackLanguage ??
    "zh"
  );
}
