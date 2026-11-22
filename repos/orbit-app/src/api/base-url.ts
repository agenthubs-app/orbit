// Release builds (__DEV__ false) talk to production unless EXPO_PUBLIC_ORBIT_API_BASE_URL says otherwise;
// development builds and Node tests keep the local server.
// React Native defines __DEV__; the Web project's typecheck also reads this file, so declare it here.
import { currentTranslator } from "../i18n/messages";

declare const __DEV__: boolean | undefined;
export const PRODUCTION_ORBIT_API_BASE_URL = "https://orbitailink.com";
const releaseBuild = typeof __DEV__ !== "undefined" && !__DEV__;
export const DEFAULT_ORBIT_API_BASE_URL =
  process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL ?? (releaseBuild ? PRODUCTION_ORBIT_API_BASE_URL : "http://localhost:3000");

export type OrbitApiBaseUrlValidation =
  | {
      success: true;
      value: string;
    }
  | {
      error: string;
      success: false;
    };

export function normalizeOrbitApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

export function validateOrbitApiBaseUrl(
  value: string
): OrbitApiBaseUrlValidation {
  const normalizedValue = normalizeOrbitApiBaseUrl(value);

  if (!normalizedValue) {
    return {
      error: currentTranslator()("common.serverUrlRequired"),
      success: false
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch {
    return {
      error: currentTranslator()("common.serverUrlInvalid"),
      success: false
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      error: currentTranslator()("common.serverUrlScheme"),
      success: false
    };
  }

  return {
    success: true,
    value: normalizedValue
  };
}
