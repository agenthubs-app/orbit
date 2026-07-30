import {
  orbitHtmlLang,
  parseOrbitLanguage,
  withOrbitLanguageHref,
  type OrbitLanguage,
} from "./orbit-language-core";

export type StarfieldLanguage = "en" | "zh";

export function resolveStarfieldCanonicalLanguage(
  ...values: Array<string | null | undefined>
): OrbitLanguage {
  for (const value of values) {
    const language = parseOrbitLanguage(value);
    if (language) return language;
  }

  return "zh";
}

export function starfieldPresentationLanguage(
  language: OrbitLanguage,
): StarfieldLanguage {
  // The migrated reference currently has only Chinese and English copy.
  // Preserve Japanese as the canonical product language while presenting the
  // documented English fallback instead of rewriting the preference to en.
  return language === "zh" ? "zh" : "en";
}

export function starfieldNavigationHref(
  href: string,
  language: OrbitLanguage,
): string {
  return withOrbitLanguageHref(href, language);
}

export function starfieldLocationHref(
  pathname: string,
  search: string,
  hash: string,
  language: OrbitLanguage,
): string {
  return withOrbitLanguageHref(`${pathname}${search}${hash}`, language);
}

export function resolveStarfieldLanguage(
  canonical: string | null | undefined,
  cookie: string | null | undefined,
  legacy: string | null | undefined,
  host: string | null | undefined,
): StarfieldLanguage {
  return starfieldPresentationLanguage(
    resolveStarfieldCanonicalLanguage(canonical, cookie, legacy, host),
  );
}

function cookieLanguage(): string | null {
  const match = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("orbit-lang="));

  return match ? decodeURIComponent(match.slice("orbit-lang=".length)) : null;
}

function preserveStarfieldNavigation(language: OrbitLanguage): void {
  document
    .querySelectorAll<HTMLAnchorElement>(
      '[data-orbit-real-page="starfield-home"] a[href]',
    )
    .forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (href) {
        anchor.setAttribute("href", starfieldNavigationHref(href, language));
      }
    });
}

export function persistStarfieldLanguage(language: OrbitLanguage): void {
  document.cookie = `orbit-lang=${language}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = orbitHtmlLang(language);
  preserveStarfieldNavigation(language);
  window.history.replaceState(
    window.history.state,
    "",
    starfieldLocationHref(
      window.location.pathname,
      window.location.search,
      window.location.hash,
      language,
    ),
  );

  try {
    localStorage.setItem("orbit-lang", language);
    // Keep the legacy reference key synchronized during migration.
    localStorage.setItem("iorbit_lang", language);
  } catch {
    // Cookie and document language remain authoritative when storage is blocked.
  }
}

export function initializeStarfieldLanguage(
  host: HTMLElement,
): StarfieldLanguage {
  let query: string | null = null;
  let canonical: string | null = null;
  let legacy: string | null = null;

  try {
    query = new URLSearchParams(window.location.search).get("lang");
    canonical = localStorage.getItem("orbit-lang");
    legacy = localStorage.getItem("iorbit_lang");
  } catch {
    // Cookie and server-rendered host language remain available.
  }

  const canonicalLanguage = resolveStarfieldCanonicalLanguage(
    query,
    canonical,
    cookieLanguage(),
    legacy,
    host.getAttribute("data-lang"),
  );
  const language = starfieldPresentationLanguage(canonicalLanguage);

  persistStarfieldLanguage(canonicalLanguage);
  host.setAttribute("data-orbit-language", canonicalLanguage);
  host.setAttribute("data-lang", language);
  return language;
}
