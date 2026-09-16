export type BrowserApiBaseUrlResult =
  | { success: true; value: string }
  | { error: string; success: false };

function rootHttpOrigin(value: string): string | null {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  return url.origin;
}

export function normalizeOrbitApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

export function validateOrbitApiBaseUrl(value: string): BrowserApiBaseUrlResult {
  const origin = rootHttpOrigin(value);

  return origin
    ? { success: true, value: origin }
    : { error: "请输入有效的网站地址。", success: false };
}

export function resolveBrowserApiBaseUrl(input: {
  browserOrigin: string | undefined;
  configuredBaseUrl?: string;
}): BrowserApiBaseUrlResult {
  const browserOrigin = input.browserOrigin
    ? rootHttpOrigin(input.browserOrigin)
    : null;

  if (!browserOrigin) {
    return { error: "无法读取当前网站地址。", success: false };
  }

  if (input.configuredBaseUrl === undefined) {
    return { success: true, value: browserOrigin };
  }

  const configuredOrigin = rootHttpOrigin(input.configuredBaseUrl);
  if (!configuredOrigin) {
    return { error: "浏览器服务器地址无效。", success: false };
  }
  if (configuredOrigin !== browserOrigin) {
    return { error: "浏览器服务器地址必须与当前网站一致。", success: false };
  }

  return { success: true, value: configuredOrigin };
}
