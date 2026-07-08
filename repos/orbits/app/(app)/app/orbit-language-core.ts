export type OrbitLanguage = "en" | "zh";

export function normalizeOrbitLanguage(value: string | null | undefined): OrbitLanguage {
  return value === "en" ? "en" : "zh";
}

export function withOrbitLanguageHref(href: string, language: OrbitLanguage): string {
  if (!href.startsWith("/")) return href;

  const [path, hash = ""] = href.split("#");
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);

  if (language === "en") {
    params.set("lang", "en");
  } else {
    params.delete("lang");
  }

  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}
