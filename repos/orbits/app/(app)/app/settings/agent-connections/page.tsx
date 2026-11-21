"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout } from "../../orbit-2026/account/AccountLayout";
import { AgentConnectionsSettings } from "../../orbit-2026/account/AgentConnectionsSettings";
import { agentConnectionsWords } from "../../orbit-2026/copy/agent-connections";

// agent-design AG17（视觉稿第 7、8 组，D3）：设置 › 外部 AI 助手。
export default function AgentConnectionsSettingsPage() {
  const { language } = useOrbitLanguage();
  const t = agentConnectionsWords(language);
  return <AccountLayout active="agentConnections" title={t("settingsTitle")} subtitle={t("settingsIntro")}><AgentConnectionsSettings /></AccountLayout>;
}
