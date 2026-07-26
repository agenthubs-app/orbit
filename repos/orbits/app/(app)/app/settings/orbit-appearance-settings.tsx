"use client";

import { useEffect, useState } from "react";

import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";
import { getOrbitTheme, toggleOrbitTheme, type OrbitTheme } from "../orbit-theme";

export function OrbitAppearanceSettings() {
  const { t } = useOrbitLanguage();
  const [theme, setTheme] = useState<OrbitTheme | null>(null);

  useEffect(() => {
    setTheme(getOrbitTheme());
  }, []);

  function chooseTheme(nextTheme: OrbitTheme) {
    if (getOrbitTheme() !== nextTheme) {
      toggleOrbitTheme();
    }
    setTheme(nextTheme);
  }

  return (
    <section aria-labelledby="orbit-appearance-title" className="card" style={{ padding: 24 }}>
      <div style={{ alignItems: "flex-start", display: "flex", gap: 14 }}>
        <span
          aria-hidden="true"
          style={{
            alignItems: "center",
            background: "var(--accent-soft)",
            borderRadius: 12,
            color: "var(--accent)",
            display: "inline-flex",
            flex: "0 0 auto",
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Icon name="sun" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="orbit-appearance-title" style={{ color: "var(--ink)", fontSize: 18, margin: 0 }}>
            {t({ en: "Appearance", zh: "外观" })}
          </h2>
          <p style={{ color: "var(--text-3)", fontSize: 13.5, lineHeight: 1.6, margin: "6px 0 18px" }}>
            {t({
              en: "Choose the color mode used across Orbit on this device.",
              zh: "选择此设备上 Orbit 全站使用的明暗配色。",
            })}
          </p>
          <div
            aria-label={t({ en: "Color mode", zh: "颜色模式" })}
            role="group"
            style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
          >
            <button
              aria-pressed={theme === "light"}
              className={`btn btn-sm ${theme === "light" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => chooseTheme("light")}
              type="button"
            >
              <Icon name="sun" size={16} />
              {t({ en: "Light", zh: "浅色" })}
            </button>
            <button
              aria-pressed={theme === "dark"}
              className={`btn btn-sm ${theme === "dark" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => chooseTheme("dark")}
              type="button"
            >
              <Icon name="moon" size={16} />
              {t({ en: "Dark", zh: "深色" })}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
