"use client";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { TodoNextMovesRail } from "../todo/TodoNextMovesRail";
import { todoPageView } from "../todo/todo-view-model";
import { useTodoPage } from "../todo/useTodoPage";

/** web.html #13: the calendar's rail is the same 「次の一手 · Task から」 rail as To-do (not the day's agenda,
 *  which the day column already shows). A draft opens in To-do, where the drafting drawer lives. */
export function CalendarNextMovesRail({ language, timeZone, today }: { language: OrbitLanguage; timeZone: string; today: string }) {
  const { account } = useSharedReadAccount();
  const resource = useTodoPage(timeZone, today);
  const view = resource.page ? todoPageView(resource.page) : null;
  return <TodoNextMovesRail account={account} language={language} state={resource.state} view={view} onRetry={() => { void resource.refresh(); }}
    onDraft={() => { window.location.assign("/app/tasks?tab=todo"); }} />;
}
