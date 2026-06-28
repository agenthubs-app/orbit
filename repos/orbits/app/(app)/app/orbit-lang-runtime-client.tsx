"use client";

import { useEffect } from "react";

interface OrbitI18nRuntime {
  getLang?: () => string;
  refresh?: () => void;
  setLang?: (lang: "zh" | "en") => void;
}

function refreshOrbitI18n() {
  const orbitWindow = window as typeof window & { OrbitI18n?: OrbitI18nRuntime };
  const activeLanguage = orbitWindow.OrbitI18n?.getLang?.() ?? localStorage.getItem("orbit-lang") ?? "zh";

  document.documentElement.lang = activeLanguage === "en" ? "en" : "zh";

  if (orbitWindow.OrbitI18n?.refresh) {
    orbitWindow.OrbitI18n.refresh();
  }
}

export function OrbitLangRuntimeClient({ script }: { script: string }) {
  useEffect(() => {
    const orbitWindow = window as typeof window & { OrbitI18n?: OrbitI18nRuntime };
    const existing = document.querySelector('script[data-orbit-prototype-i18n="true"]');

    if (!existing || !orbitWindow.OrbitI18n) {
      existing?.remove();

      const scriptElement = document.createElement("script");
      scriptElement.setAttribute("data-orbit-prototype-i18n", "true");
      scriptElement.text = script;
      document.body.appendChild(scriptElement);
    }

    refreshOrbitI18n();
    window.setTimeout(refreshOrbitI18n, 0);

    return undefined;
  }, [script]);

  useEffect(() => {
    function onLanguageClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest(".orbit-lang-fixed, .orbit-top-nav .mono, .orbit-lang-inline") : null;

      if (!target) return;

      const orbitWindow = window as typeof window & { OrbitI18n?: OrbitI18nRuntime };
      const next = orbitWindow.OrbitI18n?.getLang?.() === "en" ? "zh" : "en";

      orbitWindow.OrbitI18n?.setLang?.(next);
    }

    document.addEventListener("click", onLanguageClick);

    return () => {
      document.removeEventListener("click", onLanguageClick);
    };
  }, []);

  return null;
}
