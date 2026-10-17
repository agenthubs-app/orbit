"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout } from "../../orbit-2026/account/AccountLayout";
import { IorbitSettings } from "../../orbit-2026/account/IorbitSettings";
import { settingsCopy } from "../../orbit-2026/account/settings-copy";

export default function IorbitSettingsPage() {
  const { language } = useOrbitLanguage();
  const t = settingsCopy(language);
  return <AccountLayout active="iorbit" title={t("iorbit")} subtitle={t("memoryIntro")}><IorbitSettings /></AccountLayout>;
}
