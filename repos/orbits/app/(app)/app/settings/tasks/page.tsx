"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout } from "../../orbit-2026/account/AccountLayout";
import { ScheduledTaskList } from "../../orbit-2026/account/ScheduledTasks";
import { scheduledTaskCopy } from "../../orbit-2026/account/scheduled-tasks-copy";

// agent-design AG15 (approved draft 15-3, D15-1): 设置 › 定时任务.
export default function ScheduledTasksPage() {
  const { language } = useOrbitLanguage();
  const t = scheduledTaskCopy(language);
  return <AccountLayout active="tasks" title={t("title")} subtitle={t("subtitle")}><ScheduledTaskList /></AccountLayout>;
}
