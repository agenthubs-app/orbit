"use client";

import { use, useState } from "react";

import { useOrbitLanguage } from "../../../orbit-language-context";
import { AccountLayout } from "../../../orbit-2026/account/AccountLayout";
import { ScheduledTaskDetail, TASKS_HREF } from "../../../orbit-2026/account/ScheduledTasks";
import { scheduledTaskCopy } from "../../../orbit-2026/account/scheduled-tasks-copy";

/** Next hands the still-encoded segment; decode once (a malformed one is kept for the API's 404). */
function idOf(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// agent-design AG15 (approved draft 15-4): one scheduled task — switch, next and last run, how it runs, history.
export default function ScheduledTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { language } = useOrbitLanguage();
  const t = scheduledTaskCopy(language);
  const [title, setTitle] = useState<string | null>(null);
  return <AccountLayout active="tasks" title={title ?? undefined} back={{ href: TASKS_HREF, label: t("back") }}><ScheduledTaskDetail id={idOf(id)} onTitle={setTitle} /></AccountLayout>;
}
