"use client";

import { useOrbitLanguage } from "../orbit-language-context";

export function TasksPageHeading({ detail }: { detail: boolean }) {
  const { t, preserveHref } = useOrbitLanguage();
  return <header>
    <a href={preserveHref("/app/agent")} style={{ color: "var(--text-2)", fontSize: 13 }}>{t({ zh: "返回 iOrbit", en: "Back to iOrbit" })}</a>
    <h1>{detail ? t({ zh: "待办详情", en: "Task details" }) : t({ zh: "待办事项", en: "Tasks" })}</h1>
    <a href={preserveHref("/app/tasks/personal")}>{t({ zh: "个人日程", en: "Personal schedule" })}</a>
  </header>;
}
