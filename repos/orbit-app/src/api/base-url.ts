export const DEFAULT_ORBIT_API_BASE_URL =
  process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL ?? "http://localhost:3000";

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
      error: "Enter a server address.",
      success: false
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch {
    return {
      error: "Enter a valid server address.",
      success: false
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      error: "Use an http:// or https:// server address.",
      success: false
    };
  }

  return {
    success: true,
    value: normalizedValue
  };
}
