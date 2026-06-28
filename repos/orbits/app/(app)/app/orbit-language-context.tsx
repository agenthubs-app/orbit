"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { withOrbitLanguageHref, type OrbitLanguage } from "./orbit-language-core";

export type { OrbitLanguage } from "./orbit-language-core";

interface OrbitLanguageContextValue {
  language: OrbitLanguage;
  preserveHref: (href: string, nextLanguage?: OrbitLanguage) => string;
  setLanguage: (nextLanguage: OrbitLanguage) => void;
  t: (copy: { en: string; zh: string }) => string;
}

const OrbitLanguageContext = createContext<OrbitLanguageContextValue | null>(null);

function persistOrbitLanguage(language: OrbitLanguage) {
  document.cookie = `orbit-lang=${language}; path=/; max-age=31536000; SameSite=Lax`;
  localStorage.setItem("orbit-lang", language);
}

export function OrbitLanguageProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage: OrbitLanguage;
}) {
  const [language, setLanguageState] = useState<OrbitLanguage>(initialLanguage);

  const value = useMemo<OrbitLanguageContextValue>(() => {
    function preserveHref(href: string, nextLanguage = language) {
      return withOrbitLanguageHref(href, nextLanguage);
    }

    function setLanguage(nextLanguage: OrbitLanguage) {
      persistOrbitLanguage(nextLanguage);
      setLanguageState(nextLanguage);

      const orbitWindow = window as typeof window & { OrbitI18n?: { setLang?: (lang: OrbitLanguage) => void } };
      orbitWindow.OrbitI18n?.setLang?.(nextLanguage);

      window.location.href = withOrbitLanguageHref(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
        nextLanguage,
      );
    }

    function t(copy: { en: string; zh: string }) {
      return copy[language];
    }

    return { language, preserveHref, setLanguage, t };
  }, [language]);

  return <OrbitLanguageContext.Provider value={value}>{children}</OrbitLanguageContext.Provider>;
}

export function useOrbitLanguage() {
  const context = useContext(OrbitLanguageContext);

  if (!context) {
    return {
      language: "zh" as OrbitLanguage,
      preserveHref: (href: string) => href,
      setLanguage: () => undefined,
      t: (copy: { en: string; zh: string }) => copy.zh,
    };
  }

  return context;
}
