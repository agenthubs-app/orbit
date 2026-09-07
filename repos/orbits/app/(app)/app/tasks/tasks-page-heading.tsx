"use client";

import { useOrbitLanguage } from "../orbit-language-context";

export function TasksPageHeading({ detail }: { detail: boolean }) {
  const { t, preserveHref } = useOrbitLanguage();
  return <header>
    <a href={preserveHref("/app/today")} style={{ color: "var(--text-2)", fontSize: 13 }}>{t({ zh: "返回今天", en: "Back to today" })}</a>
    <h1>{detail ? t({ zh: "待办详情", en: "Task details" }) : t({ zh: "待办事项", en: "Tasks" })}</h1>
  </header>;
}
