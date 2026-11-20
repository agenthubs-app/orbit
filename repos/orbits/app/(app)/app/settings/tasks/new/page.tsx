"use client";

import { useOrbitLanguage } from "../../../orbit-language-context";
import { AccountLayout } from "../../../orbit-2026/account/AccountLayout";
import { NewScheduledTask, TASKS_HREF } from "../../../orbit-2026/account/ScheduledTasks";
import { scheduledTaskCopy } from "../../../orbit-2026/account/scheduled-tasks-copy";

// agent-design AG15 (approved draft 15-3 「用表单新建」): the task form, empty.
export default function NewScheduledTaskPage() {
  const { language } = useOrbitLanguage();
  const t = scheduledTaskCopy(language);
  return <AccountLayout active="tasks" title={t("formNew")} back={{ href: TASKS_HREF, label: t("back") }}><NewScheduledTask /></AccountLayout>;
}
