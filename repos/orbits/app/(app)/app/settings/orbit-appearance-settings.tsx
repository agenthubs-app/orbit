"use client";

import { useEffect, useState } from "react";

import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";
import { getOrbitThemePreference, setOrbitThemePreference, type OrbitThemePreference } from "../orbit-theme";

export function OrbitAppearanceSettings() {
  const { t } = useOrbitLanguage();
  const [preference, setPreference] = useState<OrbitThemePreference | null>(null);

  useEffect(() => {
    setPreference(getOrbitThemePreference());
  }, []);

  function choosePreference(next: OrbitThemePreference) {
    setOrbitThemePreference(next);
    setPreference(next);
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
            color: "var(--accent-text)",
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
          <p style={{ color: "var(--ink-3-text)", fontSize: 14, lineHeight: 1.6, margin: "6px 0 18px" }}>
            {t({
              en: "Follows your device's light or dark setting by default. A manual choice is saved on this device.",
              zh: "默认跟随系统的浅色 / 深色设置；手动选择会保存在这台设备上。",
            })}
          </p>
          <div
            aria-label={t({ en: "Color mode", zh: "颜色模式" })}
            role="group"
            style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
          >
            <button
              aria-pressed={preference === "system"}
              className={`btn btn-sm ${preference === "system" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => choosePreference("system")}
              type="button"
            >
              {t({ en: "Automatic", zh: "跟随系统" })}
            </button>
            <button
              aria-pressed={preference === "light"}
              className={`btn btn-sm ${preference === "light" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => choosePreference("light")}
              type="button"
            >
              <Icon name="sun" size={16} />
              {t({ en: "Light", zh: "浅色" })}
            </button>
            <button
              aria-pressed={preference === "dark"}
              className={`btn btn-sm ${preference === "dark" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => choosePreference("dark")}
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
