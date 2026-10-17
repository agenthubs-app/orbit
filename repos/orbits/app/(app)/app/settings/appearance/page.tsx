"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout } from "../../orbit-2026/account/AccountLayout";
import { AppearanceSettings } from "../../orbit-2026/account/AppearanceSettings";
import { settingsCopy } from "../../orbit-2026/account/settings-copy";

export default function AppearanceSettingsPage() {
  const { language } = useOrbitLanguage();
  const t = settingsCopy(language);
  return <AccountLayout active="appearance" title={t("appearance")}><AppearanceSettings /></AccountLayout>;
}
