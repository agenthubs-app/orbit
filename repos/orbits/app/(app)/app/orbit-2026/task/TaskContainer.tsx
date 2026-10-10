"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { EmptyState, Orbit2026Scope, Segmented, ToastProvider, useStandardCopy, useToast } from "../ui";
import { ShellPage } from "../shell/slots";
import { TASK_TABS, type TaskTab } from "./task-tabs";
import styles from "./task.module.css";

// R07 Web Task container (RD-20, frozen like the App's). Four slots in a fixed
// order; a feature Sprint replaces only its own slot:
//   calendar → R20 (now the existing personal schedule, /app/tasks/personal)
//   todo     → R20 (now the existing To-do workspace)
//   plan     → R25 (now the 「目標を決める」 empty state)
//   memo     → R20 (the Web has no notes page yet: an empty state)
// Tabs, ← → keys (outside text fields) and `?tab=` are the container's.

export function TaskContainer({ initialTab, calendar, todo }: { initialTab: TaskTab; calendar: ReactNode; todo: ReactNode }) {
  const { language } = useOrbitLanguage();
  const router = useRouter();
  const pathname = usePathname() ?? "/app/tasks";
  const [tab, setTab] = useState<TaskTab>(initialTab);
  const choose = (next: TaskTab) => {
    setTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      // Arrow keys belong to text fields and the tabs' own roving focus.
      if (target && (target.closest("input, textarea, select, [contenteditable='true'], [role='tablist'], [role='dialog']") )) return;
      const index = TASK_TABS.indexOf(tab);
      const next = TASK_TABS[(index + (event.key === "ArrowRight" ? 1 : TASK_TABS.length - 1)) % TASK_TABS.length]!;
      event.preventDefault();
      choose(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <>
      <ShellPage title={pickCopy(shellCopy.taskTitle, language)} />
      <Orbit2026Scope language={language} className={styles.bar}>
        <TaskTabs tab={tab} onChange={choose} />
      </Orbit2026Scope>
      <div data-task-slot={tab}>
        {tab === "calendar" ? calendar : tab === "todo" ? todo : (
          <Orbit2026Scope language={language} className={styles.empty}>
            <ToastProvider>{tab === "plan" ? <PlanEmpty /> : <EmptyState title={pickCopy(shellCopy.memoEmptyTitle, language)} message={pickCopy(shellCopy.memoEmptyBody, language)} />}</ToastProvider>
          </Orbit2026Scope>
        )}
      </div>
    </>
  );
}

function TaskTabs({ tab, onChange }: { tab: TaskTab; onChange: (tab: TaskTab) => void }) {
  const copy = useStandardCopy();
  return <Segmented<TaskTab> label={copy.nav.task} value={tab} onChange={onChange} segments={TASK_TABS.map((key) => ({ key, label: copy.taskSegments[key === "memo" ? "notes" : key] }))} />;
}

function PlanEmpty() {
  const { language } = useOrbitLanguage();
  const copy = useStandardCopy();
  const toast = useToast();
  return <EmptyState title={pickCopy(shellCopy.planEmptyTitle, language)} message={pickCopy(shellCopy.planEmptyBody, language)} action={{ label: pickCopy(shellCopy.planEmptyTitle, language), onSelect: () => toast.info(copy.homeEdit.comingSoon) }} />;
}
