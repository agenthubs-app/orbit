"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout } from "../../orbit-2026/account/AccountLayout";
import { HelpCenterBody } from "../../orbit-2026/auth-public/PublicInfoPage";
import { publicCopy } from "../../orbit-2026/copy/public";
import { pickCopy } from "../../orbit-2026/copy/types";

// 設定 › ヘルプ (b7 #57): the help center inside the settings frame, not a jump to the public /help page
// (which dropped the shell, and Back landed on this route and was sent to /help again).
export default function SettingsHelpPage() {
  const { language } = useOrbitLanguage();
  return <AccountLayout active="help" title={pickCopy(publicCopy.helpTitle, language)} subtitle={pickCopy(publicCopy.helpIntro, language)}>
    <HelpCenterBody language={language} layout="settings" />
  </AccountLayout>;
}
