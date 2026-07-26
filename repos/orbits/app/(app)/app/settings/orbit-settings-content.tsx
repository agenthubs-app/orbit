"use client";

import { useOrbitLanguage } from "../orbit-language-context";
import { OrbitAgentAutomationSettings } from "./orbit-agent-automation-settings";
import { OrbitAppearanceSettings } from "./orbit-appearance-settings";

export function OrbitSettingsContent() {
  const { t } = useOrbitLanguage();

  return (
    <>
      <header style={{ marginBottom: 24 }}>
        <div className="eyebrow">Orbit</div>
        <h1
          style={{
            color: "var(--ink)",
            fontSize: 28,
            lineHeight: 1.25,
            margin: "10px 0 8px",
          }}
        >
          {t({ en: "Settings", zh: "设置" })}
        </h1>
        <p
          style={{
            color: "var(--text-3)",
            fontSize: 14,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {t({
            en: "Manage how Orbit looks and behaves on this device.",
            zh: "管理你在当前设备上的 Orbit 使用偏好。",
          })}
        </p>
      </header>
      <OrbitAppearanceSettings />
      <OrbitAgentAutomationSettings />
    </>
  );
}
