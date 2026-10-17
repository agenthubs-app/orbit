"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout } from "../../orbit-2026/account/AccountLayout";
import { IntegrationsSettings } from "../../orbit-2026/account/IntegrationsSettings";
import { settingsCopy } from "../../orbit-2026/account/settings-copy";

export default function IntegrationsSettingsPage() {
  const { language } = useOrbitLanguage();
  const t = settingsCopy(language);
  return <AccountLayout active="integrations" title={t("integrations")} subtitle={t("integrationIntro")}><IntegrationsSettings /></AccountLayout>;
}
