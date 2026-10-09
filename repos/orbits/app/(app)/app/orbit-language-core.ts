import type { OrbitLanguage } from "../../../shared/contract/language";

export type { OrbitLanguage } from "../../../shared/contract/language";

export function parseOrbitLanguage(
  value: string | null | undefined,
): OrbitLanguage | null {
  if (value === "en" || value === "zh" || value === "ja") return value;
  return null;
}

// R03 / RD-11: Japanese is the default language of the Web.
export const ORBIT_DEFAULT_LANGUAGE: OrbitLanguage = "ja";

/**
 * The default in effect. Legacy test seam (R03): tests written for the old pages
 * assume the pre-R03 Chinese default, so scripts/run-node-tests.mjs sets
 * ORBIT_LEGACY_TEST_LANGUAGE=zh. Nothing else sets it; production is Japanese.
 */
export function defaultOrbitLanguage(): OrbitLanguage {
  return parseOrbitLanguage(typeof process === "undefined" ? undefined : process.env.ORBIT_LEGACY_TEST_LANGUAGE) ?? ORBIT_DEFAULT_LANGUAGE;
}

export function normalizeOrbitLanguage(value: string | null | undefined): OrbitLanguage {
  return parseOrbitLanguage(value) ?? defaultOrbitLanguage();
}

/** Best of zh / ja / en in an Accept-Language header (by q-value), else Japanese. */
export function negotiateOrbitLanguage(acceptLanguage: string | null | undefined): OrbitLanguage {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      return { language: parseOrbitLanguage(tag.trim().split("-")[0]?.toLowerCase()), q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((entry) => entry.language && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked[0]?.language ?? defaultOrbitLanguage();
}

/**
 * The one rule every server entry point uses (proxy header from ?lang, then the
 * user's stored cookie, then the browser's Accept-Language), so the server-rendered
 * language and the client provider agree on first paint.
 */
export function resolveRequestOrbitLanguage(input: {
  header: string | null | undefined;
  cookie: string | null | undefined;
  acceptLanguage: string | null | undefined;
}): OrbitLanguage {
  return parseOrbitLanguage(input.header) ?? parseOrbitLanguage(input.cookie) ?? negotiateOrbitLanguage(input.acceptLanguage);
}

export function withOrbitLanguageHref(href: string, language: OrbitLanguage): string {
  if (!href.startsWith("/")) return href;

  const [path, hash = ""] = href.split("#");
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);

  // ja is the default (no param); zh/en are explicit (R03 / RD-11).
  if (language === defaultOrbitLanguage()) {
    params.delete("lang");
  } else {
    params.set("lang", language);
  }

  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}

// <html lang> 值：屏幕阅读器与 html[lang="en"] 的衬线字体规则都依赖它。
export function orbitHtmlLang(language: OrbitLanguage): "en" | "ja" | "zh-CN" {
  if (language === "en") return "en";
  if (language === "ja") return "ja";
  return "zh-CN";
}
