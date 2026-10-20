"use client";

import { useEffect, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitThemePreference, setOrbitThemePreference, type OrbitThemePreference } from "../../orbit-theme";
import { Card, Segmented } from "../ui";
import { settingsCopy } from "./settings-copy";
import { rightsCopy } from "../account-rights/copy";
import styles from "./SettingsSecondary.module.css";

export function AppearanceSettings() {
  const { language, setLanguage } = useOrbitLanguage();
  const t = settingsCopy(language);
  const rights = rightsCopy(language);
  const [theme, setTheme] = useState<OrbitThemePreference>("system");
  useEffect(() => setTheme(getOrbitThemePreference()), []);
  const chooseTheme = (next: OrbitThemePreference) => { setOrbitThemePreference(next); setTheme(next); };
  return <div className={styles.page}>
      <Card title={t("theme")}><div className={styles.controlGroup}>
        <Segmented<OrbitThemePreference> label={t("theme")} segments={[{ key: "system", label: t("system") }, { key: "light", label: t("light") }, { key: "dark", label: t("dark") }]} value={theme} onChange={chooseTheme} wide />
      </div></Card>
      <Card title={t("language")}><div className={styles.controlGroup}>
        <Segmented<OrbitLanguage> label={t("language")} segments={[{ key: "zh", label: t("languageChinese") }, { key: "en", label: t("languageEnglish") }, { key: "ja", label: t("languageJapanese") }]} value={language} onChange={setLanguage} wide />
      </div></Card>
      <Card title={rights("account")}><div className={styles.controlGroup}>
        <a className={styles.back} href="/app/settings/exports">{rights("export")}</a>
        <a className={styles.back} href="/app/settings/account">{rights("deletion")}</a>
      </div></Card>
    </div>;
}
