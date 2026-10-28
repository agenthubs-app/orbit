"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type FormEvent } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import { ORBIT_Z } from "../../orbit-z";
import { DemoModeProvider, useDemoMode, type DemoModeView } from "../../_demo/demo-mode-core";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { memoCopy } from "../copy/memo";
import { taskCopy } from "../copy/task";
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
//   memo     → R20b Memo workspace
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
async function memoServiceAvailable(signal?: AbortSignal): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    const response = await fetch("/api/notes?limit=1&noteKind=all", { credentials: "same-origin", cache: "no-store", signal });
    if (!response.ok) return false;
    const value: unknown = await response.json();
    return typeof value === "object" && value !== null && "success" in value && value.success === true
      && "data" in value && typeof value.data === "object" && value.data !== null
      && "notes" in value.data && Array.isArray(value.data.notes);
  } catch { return false; }
}

type TaskContainerProps = { initialTab: TaskTab; calendar: ReactNode; todo: ReactNode; plan?: ReactNode | null;
  memo?: ReactNode; planStartHref?: string; demo?: DemoModeView | null };

export function TaskContainer(props: TaskContainerProps) {
  return props.demo ? <DemoModeProvider view={props.demo}><TaskContainerContent {...props} /></DemoModeProvider>
    : <TaskContainerContent {...props} />;
}

function TaskContainerContent({ initialTab, calendar, todo, plan, memo, planStartHref = "/app/agent" }: TaskContainerProps) {
  const { language } = useOrbitLanguage();
  const demo = useDemoMode();
  const router = useRouter();
  const pathname = usePathname() ?? "/app/tasks";
  const searchParams = useSearchParams();
  useTaskHistoryScroll(`${pathname}?${searchParams?.toString() ?? ""}`);
  const [tab, setTab] = useState<TaskTab>(initialTab);
  const [memoOnline, setMemoOnline] = useState(false);
  useEffect(() => { setTab(initialTab); setMemoOnline(false); }, [initialTab]);
  useEffect(() => {
    if (tab !== "memo") return;
    let active = true;
    let latest = 0;
    const controller = new AbortController();
    const probe = () => {
      const current = ++latest;
      void memoServiceAvailable(controller.signal).then(available => {
        if (active && current === latest) setMemoOnline(available);
      });
    };
    const offline = () => { latest++; setMemoOnline(false); };
    probe();
    // Focus probes again, so a tab in the background skips its turns.
    const timer = window.setInterval(() => { if (typeof document !== "undefined" && document.visibilityState === "hidden") return; probe(); }, 15_000);
    window.addEventListener("focus", probe);
    window.addEventListener("online", probe);
    window.addEventListener("offline", offline);
    return () => {
      active = false; controller.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", probe);
      window.removeEventListener("online", probe);
      window.removeEventListener("offline", offline);
    };
  }, [tab]);
  const choose = (next: TaskTab) => {
    if (next === "memo") setMemoOnline(false);
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
  const add = tab === "plan" ? <TaskAddButton label={pickCopy(shellCopy.taskAddGoal, language)} onSelect={() => demo ? demo.guardWrite(pickCopy(shellCopy.taskAddGoal, language)) : router.push(`${pathname}?tab=plan&new=1`)} className={styles.addWide} disabled={initialTab !== "plan"} />
    : tab === "memo" ? <TaskAddButton label={pickCopy(memoCopy.add, language)} onSelect={() => {
      setMemoOnline(false);
      void memoServiceAvailable().then(available => {
        setMemoOnline(available);
        if (available && latest.current.tab === "memo") router.push(`${pathname}?tab=memo&new=1`);
      });
    }} disabled={!memoOnline} title={!memoOnline ? pickCopy(memoCopy.needsNetwork, language) : undefined} />
    : tab === "calendar" || tab === "todo" ? <TaskAddButton label={pickCopy(tab === "calendar" ? shellCopy.taskAddEvent : shellCopy.taskAddTodo, language)} onSelect={startSlotAdd} /> : undefined;
  // The rail belongs to the open slot: カレンダー / To-do / a plan screen put their own rail in once its data
  // is complete, and until then the shell keeps the route's rail skeleton (rightRail undefined). Only a tab
  // whose final rail is the shell's iOrbit card (メモ, no plan yet, no slot) says so here.
  const slotRail = tab === "calendar" ? Boolean(calendar) : tab === "todo" ? Boolean(todo) : tab === "plan" ? plan !== null : false;
  return (
    <>
      <ShellPage title={pickCopy(shellCopy.taskTitle, language)} subtitle={monthHeading(language).range} left={tabs} right={add} rightRail={slotRail ? undefined : true} phoneFold />
      {/* Outside the shell (a page on its own) there is no header: the tabs stay on the page. */}
      <Orbit2026Scope language={language} className={inShell ? styles.bar : styles.barAlone}>
        <div data-task-bar="" className={styles.mobileTabs}>
          <TaskTabs tab={tab} onChange={choose} />
        </div>
      </Orbit2026Scope>
      {tab === "plan" && demo ? <TaskDemoNotice /> : null}
      <div data-task-slot={tab} onClickCapture={tab === "plan" && demo ? (event) => guardDemoClick(event, demo.guardWrite, pickCopy(shellCopy.taskTitle, language)) : undefined}
        onSubmitCapture={tab === "plan" && demo ? (event) => guardDemoSubmit(event, demo.guardWrite, pickCopy(shellCopy.taskTitle, language)) : undefined}>
        {tab === "calendar" ? calendar : tab === "todo" ? todo : tab === "memo" && memo ? memo : tab === "plan" && plan ? <PlanSlot>{plan}</PlanSlot> : (
          <Orbit2026Scope language={language} className={styles.empty}>
            <ToastProvider>{tab === "plan" ? (plan === undefined ? <Skeleton lines={4} /> : <PlanEmpty href={planStartHref} />) : <EmptyState title={pickCopy(shellCopy.memoEmptyTitle, language)} message={pickCopy(shellCopy.memoEmptyBody, language)} />}</ToastProvider>
          </Orbit2026Scope>
        )}
      </div>
      {demo?.intercept ? <TaskDemoDialog /> : null}
    </>
  );
}

function guardDemoClick(event: MouseEvent<HTMLDivElement>, guardWrite: (label: string) => void, fallback: string) {
  const control = (event.target as HTMLElement).closest("button,a,input,select,textarea,[role='button']");
  if (!control) return;
  event.preventDefault();
  event.stopPropagation();
  guardWrite(control.textContent?.trim() || fallback);
}

function guardDemoSubmit(event: FormEvent<HTMLDivElement>, guardWrite: (label: string) => void, label: string) {
  event.preventDefault();
  event.stopPropagation();
  guardWrite(label);
}

function TaskDemoNotice() {
  const demo = useDemoMode();
  const { language } = useOrbitLanguage();
  if (!demo) return null;
  const copy = { sample: pickCopy(taskCopy.demoSample, language), body: pickCopy(taskCopy.demoBody, language),
    guide: pickCopy(taskCopy.demoGuide, language), collapse: pickCopy(taskCopy.demoCollapse, language),
    expand: pickCopy(taskCopy.demoExpand, language), progress: pickCopy(taskCopy.demoProgress, language).replace("{count}", String(demo.view.completed)) };
  return <Orbit2026Scope language={language} className={styles.demoArea}>
    {demo.collapsed ? <div className={styles.demoPillRow} data-task-demo-pill>
      <Button size="sm" variant="secondary" className={styles.demoPill} onClick={() => demo.setCollapsed(false)} label={`${copy.expand} · ${copy.progress}`} />
      <a href="/app/start">{copy.guide} →</a>
    </div> : <div className={styles.demoBanner} data-task-demo-banner role="note">
      <span className={styles.demoTag}>{copy.sample}</span>
      <span className={styles.demoMessage}>{copy.body}<small>{copy.progress}</small></span>
      <a className={styles.demoGuide} href="/app/start">{copy.guide} →</a>
      <Button size="sm" variant="ghost" className={styles.demoCollapse} onClick={() => demo.setCollapsed(true)} label={copy.collapse} />
    </div>}
  </Orbit2026Scope>;
}

function TaskDemoDialog() {
  const demo = useDemoMode();
  const { language } = useOrbitLanguage();
  const close = () => demo?.closeIntercept();
  const cardRef = useOrbitModalA11y(close);
  if (!demo?.intercept) return null;
  const copy = { title: pickCopy(taskCopy.demoBlockedTitle, language), body: pickCopy(taskCopy.demoBlockedBody, language),
    close: pickCopy(taskCopy.demoClose, language), guide: pickCopy(taskCopy.demoGuide, language) };
  return <div className={styles.demoScrim} style={{ zIndex: ORBIT_Z.modal }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.demoDialog} role="dialog" aria-modal="true" aria-labelledby="task-demo-dialog-title" ref={cardRef} tabIndex={-1}>
      <h2 id="task-demo-dialog-title">{copy.title}</h2><p>{copy.body}</p>
      <div><Button size="sm" variant="ghost" onClick={close} label={copy.close} /><a href="/app/start">{copy.guide} →</a></div>
    </div>
  </div>;
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
function TaskAddButton({ label, onSelect, className, disabled, title }: { label: string; onSelect: () => void; className?: string; disabled?: boolean; title?: string }) {
  return <Button label={label} variant="accent" icon="plus" onClick={onSelect} className={className} disabled={disabled} title={title} />;
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
