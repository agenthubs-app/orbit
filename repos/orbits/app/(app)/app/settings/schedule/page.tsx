"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout } from "../../orbit-2026/account/AccountLayout";
import { ScheduleSettings } from "../../orbit-2026/account/ScheduleSettings";
import { taskCopy } from "../../orbit-2026/copy/task";
import { pickCopy } from "../../orbit-2026/copy/types";

// contact-reach R41 ⑤ 設定 › 日程 (可約時間).
export default function ScheduleSettingsPage() {
  const { language } = useOrbitLanguage();
  return <AccountLayout active="schedule" title={pickCopy(taskCopy.scheduleTitle, language)}><ScheduleSettings /></AccountLayout>;
}
