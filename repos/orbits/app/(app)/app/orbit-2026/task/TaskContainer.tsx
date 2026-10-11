"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { EmptyState, Orbit2026Scope, Segmented, Skeleton, ToastProvider, useStandardCopy } from "../ui";
import { ShellPage } from "../shell/slots";
import { TASK_TABS, type TaskTab } from "./task-tabs";
import styles from "./task.module.css";

// R07 Web Task container (RD-20, frozen like the App's). Four slots in a fixed
// order; a feature Sprint replaces only its own slot:
//   calendar → R20 (now the existing personal schedule, /app/tasks/personal)
//   todo     → R20 (now the existing To-do workspace)
//   plan     → R25 (now the existing plan screen; 「目標を決める」 only without a plan —
//              product decision (a), R07 review M5)
//   memo     → R20 (the Web has no notes page yet: an empty state)
// Tabs, ← → keys (outside text fields) and `?tab=` are the container's.

/**
 * `plan`: the plan screen, `null` when the person has no plan yet (empty state), or
 * `undefined` while it has not been read — the server reads it only for ?tab=plan,
 * and switching to the tab re-requests the page.
 */
export function TaskContainer({ initialTab, calendar, todo, plan, planStartHref = "/app/agent" }: { initialTab: TaskTab; calendar: ReactNode; todo: ReactNode; plan?: ReactNode | null; planStartHref?: string }) {
  const { language } = useOrbitLanguage();
  const router = useRouter();
  const pathname = usePathname() ?? "/app/tasks";
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TaskTab>(initialTab);
  const choose = (next: TaskTab) => {
    setTab(next);
    // Keep the slot's own parameters (for example the To-do view) when switching tabs.
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const latest = useRef({ tab, choose });
  latest.current = { tab, choose };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      // ← → switch tabs only when nothing on the page wants the arrow keys: focus on
      // the page itself or on the Task bar. Text fields, radio groups, lists, menus,
      // sliders, grids and dialogs in the slots keep their own arrow keys.
      const target = event.target as HTMLElement | null;
      const onPage = !target || target === document.body || target === document.documentElement || Boolean(target.closest("[data-task-bar]"));
      if (!onPage || target?.closest("[role='tablist'], [role='dialog']")) return;
      const { tab: current, choose: go } = latest.current;
      const index = TASK_TABS.indexOf(current);
      event.preventDefault();
      go(TASK_TABS[(index + (event.key === "ArrowRight" ? 1 : TASK_TABS.length - 1)) % TASK_TABS.length]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <ShellPage title={pickCopy(shellCopy.taskTitle, language)} />
      <Orbit2026Scope language={language} className={styles.bar}>
        <div data-task-bar="">
          <TaskTabs tab={tab} onChange={choose} />
        </div>
      </Orbit2026Scope>
      <div data-task-slot={tab}>
        {tab === "calendar" ? calendar : tab === "todo" ? todo : tab === "plan" && plan ? <PlanSlot>{plan}</PlanSlot> : (
          <Orbit2026Scope language={language} className={styles.empty}>
            <ToastProvider>{tab === "plan" ? (plan === undefined ? <Skeleton lines={4} /> : <PlanEmpty href={planStartHref} />) : <EmptyState title={pickCopy(shellCopy.memoEmptyTitle, language)} message={pickCopy(shellCopy.memoEmptyBody, language)} />}</ToastProvider>
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

// No plan yet: the button goes where the old empty plan pointed (the guide's step 3,
// or iOrbit, which builds the first plan).
function PlanEmpty({ href }: { href: string }) {
  const { language } = useOrbitLanguage();
  const router = useRouter();
  return <EmptyState title={pickCopy(shellCopy.planEmptyTitle, language)} message={pickCopy(shellCopy.planEmptyBody, language)} action={{ label: pickCopy(shellCopy.planEmptyTitle, language), onSelect: () => router.push(href) }} />;
}

// The plan screen with its anchors: /app/tasks?tab=plan#plan-… scrolls to that row once
// the screen is there — a client-side tab switch does not get the browser's own
// fragment scroll. (R25: links no longer promise an anchor; one that matches still scrolls.)
function PlanSlot({ children }: { children: ReactNode }) {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id.startsWith("plan-")) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const target = document.getElementById(id);
      if (target || ++tries > 20) { window.clearInterval(timer); target?.scrollIntoView({ block: "center" }); }
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
  return <div data-task-plan="">{children}</div>;
}
