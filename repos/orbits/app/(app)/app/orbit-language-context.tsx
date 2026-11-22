"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { parseOrbitLanguage, withOrbitLanguageHref, orbitHtmlLang, type OrbitLanguage } from "./orbit-language-core";

export type { OrbitLanguage } from "./orbit-language-core";

interface OrbitLanguageContextValue {
  language: OrbitLanguage;
  preserveHref: (href: string, nextLanguage?: OrbitLanguage) => string;
  setLanguage: (nextLanguage: OrbitLanguage) => void;
  t: (copy: { en: string; zh: string; ja?: string }) => string;
}

const OrbitLanguageContext = createContext<OrbitLanguageContextValue | null>(null);

// 语言选择同时写 cookie 和 localStorage：server 首屏和 client 后续导航都能读取同一偏好。
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

  useEffect(() => {
    document.documentElement.lang = orbitHtmlLang(language);
  }, [language]);

  // 布局（导航栏）只在整页加载时定语言，页面每次换页按 cookie 重新定。两者一旦不同（别的标签页切了语言、
  // 带 `?lang=` 的链接），同一屏就会一半一种语言：换页后发现 cookie 与当前语言不同，就整页重载，让全屏同一种语言。
  const pathname = usePathname();
  useEffect(() => {
    const cookie = typeof document === "undefined" ? "" : document.cookie;
    if (typeof cookie !== "string") return;
    const stored = parseOrbitLanguage(
      cookie
        .split("; ")
        .find((item) => item.startsWith("orbit-lang="))
        ?.slice("orbit-lang=".length),
    );
    if (stored && stored !== language) window.location.reload();
  }, [pathname, language]);

  const value = useMemo<OrbitLanguageContextValue>(() => {
    // preserveHref 在生成站内链接时保留当前语言参数，避免页面切换后语言回退。
    function preserveHref(href: string, nextLanguage = language) {
      return withOrbitLanguageHref(href, nextLanguage);
    }

    function setLanguage(nextLanguage: OrbitLanguage) {
      // 先持久化再通知旧 prototype i18n runtime，最后用带 lang 的 URL 刷新当前页面。
      persistOrbitLanguage(nextLanguage);
      setLanguageState(nextLanguage);

      const orbitWindow = window as typeof window & { OrbitI18n?: { setLang?: (lang: OrbitLanguage) => void } };
      orbitWindow.OrbitI18n?.setLang?.(nextLanguage);

      window.location.href = withOrbitLanguageHref(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
        nextLanguage,
      );
    }

    function t(copy: { en: string; zh: string; ja?: string }) {
      // 调用方传入多语 copy，这里只做简单选择，不承载翻译表。
      // ja 缺省时回退英文（产品 chrome 尚未全量日文；活动数据是完整三语）。
      if (language === "ja") return copy.ja ?? copy.en;
      return language === "zh" ? copy.zh : copy.en;
    }

    return { language, preserveHref, setLanguage, t };
  }, [language]);

  return <OrbitLanguageContext.Provider value={value}>{children}</OrbitLanguageContext.Provider>;
}

export function useOrbitLanguage() {
  const context = useContext(OrbitLanguageContext);

  if (!context) {
    // 没有 provider 时回退中文，避免服务端/测试环境里出现 undefined context。
    return {
      language: "zh" as OrbitLanguage,
      preserveHref: (href: string) => href,
      setLanguage: () => undefined,
      t: (copy: { en: string; zh: string; ja?: string }) => copy.zh,
    };
  }

  return context;
}
