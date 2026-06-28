"use client";

import { useEffect } from "react";

interface OrbitI18nRuntime {
  getLang?: () => string;
  refresh?: () => void;
  setLang?: (lang: "zh" | "en") => void;
}

const orbitTextOverrides = [
  ["退出活动", "Leave event"],
  ["活动现场", "Event live"],
  ["你的座位", "Your seat"],
  ["现场主页", "Live home"],
  ["推荐给你", "Recommended for you"],
  ["全部参会者", "All attendees"],
  ["AllAttendees", "All attendees"],
  ["分组", "Groups"],
  ["关系图谱", "Relationship graph"],
  ["流程议程", "Agenda"],
  ["已结束", "Ended"],
  ["签到", "Check-in"],
] as const;

function activeOrbitLanguage() {
  const orbitWindow = window as typeof window & { OrbitI18n?: OrbitI18nRuntime };
  const urlLanguage = new URLSearchParams(window.location.search).get("lang");
  const cookieLanguage = document.cookie
    .split("; ")
    .find((item) => item.startsWith("orbit-lang="))
    ?.split("=")[1];

  if (urlLanguage === "en" || urlLanguage === "zh") return urlLanguage;
  if (cookieLanguage === "en" || cookieLanguage === "zh") return cookieLanguage;

  return orbitWindow.OrbitI18n?.getLang?.() ?? localStorage.getItem("orbit-lang") ?? "zh";
}

function applyOrbitTextOverrides(activeLanguage: string) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();

  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    let value = textNode.nodeValue;

    if (!value) return;

    if (activeLanguage === "en") {
      orbitTextOverrides.forEach(([zh, en]) => {
        value = value?.replaceAll(zh, en) ?? value;
      });
      value = value.replaceAll("On-site check-in", "Check-in");
      value = value.replaceAll("EventsLive", "Event live");
    } else {
      value = value.replaceAll("EventsLive", "活动现场");
      orbitTextOverrides.forEach(([zh, en]) => {
        value = value?.replaceAll(en, zh) ?? value;
      });
    }

    textNode.nodeValue = value;
  });
}

function refreshOrbitI18n() {
  const orbitWindow = window as typeof window & { OrbitI18n?: OrbitI18nRuntime };
  const activeLanguage = activeOrbitLanguage();

  document.documentElement.lang = activeLanguage === "en" ? "en" : "zh";

  if (orbitWindow.OrbitI18n?.refresh) {
    orbitWindow.OrbitI18n.refresh();
  }

  document.querySelectorAll(".orbit-lang-fixed").forEach((node) => node.remove());
  applyOrbitTextOverrides(activeLanguage);
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
      const target = event.target instanceof Element ? event.target.closest(".orbit-lang-inline") : null;

      if (!target) return;

      const orbitWindow = window as typeof window & { OrbitI18n?: OrbitI18nRuntime };
      const next = orbitWindow.OrbitI18n?.getLang?.() === "en" ? "zh" : "en";

      document.cookie = `orbit-lang=${next}; path=/; max-age=31536000; SameSite=Lax`;
      localStorage.setItem("orbit-lang", next);
      orbitWindow.OrbitI18n?.setLang?.(next);
      window.setTimeout(() => applyOrbitTextOverrides(next), 0);
    }

    document.addEventListener("click", onLanguageClick);

    return () => {
      document.removeEventListener("click", onLanguageClick);
    };
  }, []);

  useEffect(() => {
    const activeLanguage = activeOrbitLanguage();
    document.cookie = `orbit-lang=${activeLanguage}; path=/; max-age=31536000; SameSite=Lax`;
    localStorage.setItem("orbit-lang", activeLanguage);

    return undefined;
  }, []);

  return null;
}
