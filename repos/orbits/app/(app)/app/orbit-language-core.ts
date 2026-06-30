export type OrbitLanguage = "en" | "zh";

export function normalizeOrbitLanguage(value: string | null | undefined): OrbitLanguage {
  // Orbit 默认中文；只有明确传入 en 时才切到英文。
  return value === "en" ? "en" : "zh";
}

export function withOrbitLanguageHref(href: string, language: OrbitLanguage): string {
  // 外部链接或非站内 href 不改写，避免破坏 mailto、https 等目标。
  if (!href.startsWith("/")) return href;

  const [path, hash = ""] = href.split("#");
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);

  // 英文用 ?lang=en 显式保留；中文作为默认语言时删除 lang 参数。
  if (language === "en") {
    params.set("lang", "en");
  } else {
    params.delete("lang");
  }

  const search = params.toString();
  // 保留原始 hash，避免语言切换时丢失页面内锚点。
  return `${pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}
