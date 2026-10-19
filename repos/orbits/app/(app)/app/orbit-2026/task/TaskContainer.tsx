"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { memoCopy } from "../copy/memo";
import { Button, EmptyState, Orbit2026Scope, Segmented, Skeleton, ToastProvider, useStandardCopy } from "../ui";
import { monthHeading } from "../shell/month-heading";
import { ShellPage, useInShell } from "../shell/slots";
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
// Header (web.html wTaskHead): the tabs at the left, 「Task」 over the month's range,
// and the tab's ＋ add button at the right — only where the slot has an add flow
// (プラン → 目標を追加); the other slots' buttons come with their R20 screens.
// Under 768 the shell drops the header row and the tabs sit full width on top (b8).

/**
 * `plan`: the plan screen, `null` when the person has no plan yet (empty state), or
 * `undefined` while it has not been read — the server reads it only for ?tab=plan,
 * and switching to the tab re-requests the page.
 */
export function TaskContainer({ initialTab, calendar, todo, plan, memo, planStartHref = "/app/agent" }: { initialTab: TaskTab; calendar: ReactNode; todo: ReactNode; plan?: ReactNode | null; memo?: ReactNode; planStartHref?: string }) {
  const { language } = useOrbitLanguage();
  const router = useRouter();
  const pathname = usePathname() ?? "/app/tasks";
  const searchParams = useSearchParams();
  useTaskHistoryScroll(`${pathname}?${searchParams?.toString() ?? ""}`);
  const [tab, setTab] = useState<TaskTab>(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
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
  const inShell = useInShell();
  const tabs = <div data-task-bar="" className={styles.tabs}><TaskTabs tab={tab} onChange={choose} /></div>;
  // プラン: 「目標を追加」 only at ≥1280; b8 #6 / #16 (1024) keep just 「次の一手」 on the right.
  const add = tab === "plan" ? <TaskAddButton label={pickCopy(shellCopy.taskAddGoal, language)} onSelect={() => router.push(`${pathname}?tab=plan&new=1`)} className={styles.addWide} />
    : tab === "calendar" || tab === "todo" || tab === "memo" ? <TaskAddButton label={pickCopy(tab === "calendar" ? shellCopy.taskAddEvent : tab === "todo" ? shellCopy.taskAddTodo : memoCopy.add, language)} onSelect={startSlotAdd} /> : undefined;
  return (
    <>
      <ShellPage title={pickCopy(shellCopy.taskTitle, language)} subtitle={monthHeading(language).range} left={tabs} right={add} rightRail phoneFold />
      {/* Outside the shell (a page on its own) there is no header: the tabs stay on the page. */}
      <Orbit2026Scope language={language} className={inShell ? styles.bar : styles.barAlone}>
        <div data-task-bar="" className={styles.mobileTabs}>
          <TaskTabs tab={tab} onChange={choose} />
        </div>
      </Orbit2026Scope>
      <div data-task-slot={tab}>
        {tab === "calendar" ? calendar : tab === "todo" ? todo : tab === "memo" && memo ? memo : tab === "plan" && plan ? <PlanSlot>{plan}</PlanSlot> : (
          <Orbit2026Scope language={language} className={styles.empty}>
            <ToastProvider>{tab === "plan" ? (plan === undefined ? <Skeleton lines={4} /> : <PlanEmpty href={planStartHref} />) : <EmptyState title={pickCopy(shellCopy.memoEmptyTitle, language)} message={pickCopy(shellCopy.memoEmptyBody, language)} />}</ToastProvider>
          </Orbit2026Scope>
        )}
      </div>
    </>
  );
}

// A full-page Task link can return before streamed content is tall enough for
// the browser's automatic history scroll restoration. Remember only the numeric
// position for this history URL, then restore it when the page can reach it.
function useTaskHistoryScroll(routeKey: string) {
  const stopPending = useRef<() => void>(() => {});
  const previousRoute = useRef(routeKey);
  useEffect(() => {
    if (previousRoute.current !== routeKey) {
      previousRoute.current = routeKey;
      stopPending.current();
    }
  }, [routeKey]);
  useEffect(() => {
    const currentKey = () => `orbit-task-scroll:${window.location.pathname}${window.location.search}`;
    const save = () => {
      try { window.sessionStorage.setItem(currentKey(), String(window.scrollY)); } catch { /* storage may be unavailable */ }
    };
    window.addEventListener("pagehide", save);

    const navigation = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    let target = 0;
    if (navigation?.type === "back_forward") {
      try { target = Number(window.sessionStorage.getItem(currentKey())); } catch { /* storage may be unavailable */ }
    }
    if (!Number.isFinite(target) || target <= 0) return () => window.removeEventListener("pagehide", save);

    let active = true;
    const observer = new ResizeObserver(() => restore());
    const stop = () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("resize", restore);
      window.clearTimeout(timeout);
    };
    stopPending.current = stop;
    const restore = () => {
      if (!active || document.documentElement.scrollHeight - window.innerHeight < target) return;
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) <= 2) stop();
    };
    const timeout = window.setTimeout(stop, 10000);
    observer.observe(document.body);
    window.addEventListener("resize", restore);
    restore();
    return () => { stop(); window.removeEventListener("pagehide", save); };
  }, []);
}

// kit .btn.accent with ＋ (web.html k-wtadd).
function TaskAddButton({ label, onSelect, className }: { label: string; onSelect: () => void; className?: string }) {
  return <Button label={label} variant="accent" icon="plus" onClick={onSelect} className={className} />;
}

// カレンダー / To-do: the slot's own add flow, marked `data-task-add` (the schedule's
// 「new」 button, the To-do field) — clicked or focused, until R20 brings the new screens.
function startSlotAdd() {
  const target = document.querySelector<HTMLElement>("[data-task-slot] [data-task-add]");
  if (!target) return;
  target.scrollIntoView({ block: "center" });
  if (target instanceof HTMLInputElement) target.focus(); else target.click();
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
