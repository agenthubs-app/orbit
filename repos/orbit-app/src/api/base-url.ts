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
      error: "请输入服务器地址。",
      success: false
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch {
    return {
      error: "请输入有效的服务器地址。",
      success: false
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      error: "请使用 http:// 或 https:// 开头的服务器地址。",
      success: false
    };
  }

  return {
    success: true,
    value: normalizedValue
  };
}
