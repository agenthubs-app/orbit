"use client";

import { useEffect, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitThemePreference, setOrbitThemePreference, type OrbitThemePreference } from "../../orbit-theme";
import { Icon } from "../ui";
import { settingsCopy } from "./settings-copy";
import { rightsCopy } from "../account-rights/copy";
import styles from "./SettingsSecondary.module.css";

// b12 W-R18a-03 / b5 #31: 言語 (three tiles, the native name over the UI-language name), 外観
// (three preview tiles), アカウント (avatar row with export and delete).
// The current language's own tile is subtitled with its English name (「日本語 / Japanese」).
const LANGUAGES: readonly { key: OrbitLanguage; native: "nativeJa" | "English" | "nativeZh"; sub: "jaSub" | "enSub" | "zhSub" }[] = [
  { key: "ja", native: "nativeJa", sub: "jaSub" }, { key: "en", native: "English", sub: "enSub" }, { key: "zh", native: "nativeZh", sub: "zhSub" },
];
function englishName(key: OrbitLanguage): string {
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(key) ?? key; } catch { return key; }
}

function useAccountIdentity() {
  const [identity, setIdentity] = useState<{ name: string; email: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/profile", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then((body: { data?: { profile?: { displayName?: string; handles?: { email?: string } } } } | null) => {
      const profile = body?.data?.profile;
      if (alive && profile?.displayName) setIdentity({ name: profile.displayName, email: profile.handles?.email ?? "" });
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return identity;
}

export function AppearanceSettings() {
  const { language, setLanguage } = useOrbitLanguage();
  const t = settingsCopy(language);
  const rights = rightsCopy(language);
  const identity = useAccountIdentity();
  const [theme, setTheme] = useState<OrbitThemePreference>("system");
  useEffect(() => setTheme(getOrbitThemePreference()), []);
  const chooseTheme = (next: OrbitThemePreference) => { setOrbitThemePreference(next); setTheme(next); };
  const themes: readonly { key: OrbitThemePreference; label: string; note?: string }[] = [
    { key: "light", label: t("light") }, { key: "dark", label: t("dark") }, { key: "system", label: t("auto"), note: t("autoNote") },
  ];
  return <div className={styles.appearance}>
    <section className={styles.setCard}>
      <div className={styles.setCardHead}><h2>{t("language")}</h2><span>{t("languageNote")}</span></div>
      <div className={styles.grid3} role="radiogroup" aria-label={t("language")}>
        {LANGUAGES.map(item => <button key={item.key} type="button" role="radio" aria-checked={language === item.key} className={`btn ${styles.tile} ${language === item.key ? styles.tileOn : ""}`} onClick={() => setLanguage(item.key)}>
          <span className={styles.tileRow}><b className={styles.tileName}>{item.native === "English" ? item.native : t(item.native)}</b>{language === item.key ? <span className={styles.tileCheck} aria-hidden><Icon name="check" size={16} /></span> : null}</span>
          <span className={styles.tileSub}>{language === item.key ? englishName(item.key) : t(item.sub)}</span>
        </button>)}
      </div>
    </section>
    <section className={styles.setCard}>
      <div className={styles.setCardHead}><h2>{t("appearanceTitle")}</h2></div>
      <div className={styles.grid3} role="radiogroup" aria-label={t("appearanceTitle")}>
        {themes.map(item => <button key={item.key} type="button" role="radio" aria-checked={theme === item.key} className={`btn ${styles.tile} ${theme === item.key ? styles.tileOn : ""}`} onClick={() => chooseTheme(item.key)}>
          <span className={`${styles.prev} ${styles[`prev_${item.key}`]}`} aria-hidden>{item.key === "system" ? null : <><i /><span><i /><i /><i /></span></>}</span>
          <span className={styles.tileRow}><b>{item.label}</b>{item.note ? <span className={styles.tileSub}>{item.note}</span> : null}</span>
        </button>)}
      </div>
    </section>
    <section className={styles.setCard}>
      <div className={styles.setCardHead}><h2>{rights("account")}</h2></div>
      <div className={styles.accountRow}>
        <span className={styles.accountAvatar} aria-hidden>{identity?.name.slice(0, 1) ?? <Icon name="user" size={20} />}</span>
        <div className={styles.accountText}><b>{identity?.name ?? ""}</b>{identity?.email ? <span>{identity.email}</span> : null}</div>
        <a className={`btn ${styles.accountButton}`} href="/app/settings/exports" aria-label={rights("export")}>{rights("export")}</a>
        <a className={`btn ${styles.accountButton} ${styles.accountDanger}`} href="/app/settings/account" aria-label={rights("deletion")}>{rights("deletion")}</a>
      </div>
    </section>
  </div>;
}
