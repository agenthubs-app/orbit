"use client";

import type { ReactNode } from "react";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { TodoNextMovesRail, useTodoRailSlot } from "../todo/TodoNextMovesRail";
import { todoPageView } from "../todo/todo-view-model";
import { useTodoPage } from "../todo/useTodoPage";

/** web.html #13: the calendar's rail is the same 「次の一手 · Task から」 rail as To-do (not the day's agenda,
 *  which the day column already shows). A draft opens in To-do, where the drafting drawer lives.
 *  Read by the page (not inside the rail): the rail slot stays `undefined` — the shell's rail skeleton —
 *  until the To-do read and the recent conversations have answered, then the complete rail goes in once. */
export function useCalendarNextMovesRail({ language, timeZone, today, enabled }: { language: OrbitLanguage; timeZone: string; today: string; enabled: boolean }): { slot: ReactNode | false | undefined; probe: ReactNode } {
  const { account } = useSharedReadAccount();
  // Read only where the rail is drawn: in the shell, in week mode (outside the shell the rail never mounted).
  const resource = useTodoPage(timeZone, today, enabled);
  const view = resource.page ? todoPageView(resource.page) : null;
  return useTodoRailSlot(resource.state, () => <TodoNextMovesRail account={account} language={language} state={resource.state} view={view} onRetry={() => { void resource.refresh(); }}
    onDraft={() => { window.location.assign("/app/tasks?tab=todo"); }} />, enabled);
}
