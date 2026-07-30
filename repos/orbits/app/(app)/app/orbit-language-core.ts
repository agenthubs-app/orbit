export type OrbitLanguage = "en" | "zh" | "ja";

export function parseOrbitLanguage(
  value: string | null | undefined,
): OrbitLanguage | null {
  if (value === "en" || value === "zh" || value === "ja") return value;
  return null;
}

export function normalizeOrbitLanguage(value: string | null | undefined): OrbitLanguage {
  return parseOrbitLanguage(value) ?? "zh";
}

export function withOrbitLanguageHref(href: string, language: OrbitLanguage): string {
  if (!href.startsWith("/")) return href;

  const [path, hash = ""] = href.split("#");
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);

  // zh is the default (no param); en/ja are explicit.
  if (language === "zh") {
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
