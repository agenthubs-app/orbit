// Phone sweep (tests/ui/phone-layout-sweep.test.tsx): every user-side page the sweep renders, picked by
// window.shellFixture.page. Real page components inside the real shell; fetch is answered from
// window.shellFixture.handlers ([method, url regexp, data]).
import React from "react";

import { HomePlaceholder } from "../../../app/(app)/app/orbit-2026/home/HomePlaceholder";
import { RelationshipInboxPage } from "../../../app/(app)/app/inbox/relationship-inbox-panel.tsx";
import { NetworkScreen } from "../../../app/(app)/app/orbit-2026/network/NetworkScreen";
import { EventsScreen } from "../../../app/(app)/app/orbit-2026/events/EventsScreen";
import { EventDetailScreen } from "../../../app/(app)/app/orbit-2026/events/EventDetail";
import { RegisterFlow } from "../../../app/(app)/app/orbit-2026/events/RegisterFlow";
import { PrepPage } from "../../../app/(app)/app/orbit-2026/events/PrepPage";
import { AfterPage } from "../../../app/(app)/app/orbit-2026/events/AfterPage";
import { EventPeopleScreen } from "../../../app/(app)/app/orbit-2026/events/EventPeople";
import { AccountProfilePage } from "../../../app/(app)/app/orbit-2026/account/AccountProfilePage";
import { AccountOverviewPage } from "../../../app/(app)/app/orbit-2026/account-rights/AccountOverviewPage";
import { ExportsPage } from "../../../app/(app)/app/orbit-2026/account-rights/ExportsPage";
import { NotificationSettingsPageClient } from "../../../app/(app)/app/settings/notifications/NotificationSettingsPageClient";
import SettingsTasks from "../../../app/(app)/app/settings/tasks/page";
import SettingsSchedule from "../../../app/(app)/app/settings/schedule/page";
import SettingsAppearance from "../../../app/(app)/app/settings/appearance/page";
import SettingsIntegrations from "../../../app/(app)/app/settings/integrations/page";
import SettingsIorbit from "../../../app/(app)/app/settings/iorbit/page";
import SettingsAgentConnections from "../../../app/(app)/app/settings/agent-connections/page";
import SettingsHelp from "../../../app/(app)/app/settings/help/page";
import { TaskContainer } from "../../../app/(app)/app/orbit-2026/task/TaskContainer";
import { TodoTaskSlot } from "../../../app/(app)/app/orbit-2026/todo/TodoTaskSlot";
import { CalendarTaskSlot } from "../../../app/(app)/app/orbit-2026/calendar/CalendarTaskSlot";
import { MemoTaskSlot } from "../../../app/(app)/app/orbit-2026/memo/MemoWorkspace";
import { PlanTypeDetailScreen } from "../../../app/(app)/app/orbit-2026/plan/PlanTypeDetailScreen";

const NOW = "2026-11-27T03:00:00.000Z";
const tasks = (tab: "todo" | "calendar" | "memo", todo: React.ReactNode = <TodoTaskSlot actorId="u1" />) => (
  <TaskContainer initialTab={tab} todo={todo} calendar={<CalendarTaskSlot actorId="u1" />} memo={<MemoTaskSlot />} plan={null} />
);

export const SWEEP_PAGES: Record<string, () => React.ReactNode> = {
  home: () => <HomePlaceholder />,
  inbox: () => <RelationshipInboxPage />,
  network: () => <NetworkScreen language="zh" nowIso={NOW} />,
  discover: () => <EventsScreen language="zh" nowIso={NOW} />,
  going: () => <EventsScreen language="zh" nowIso={NOW} />,
  assess: () => <EventsScreen language="zh" nowIso={NOW} />,
  eventDetail: () => <EventDetailScreen eventId="e1" language="zh" />,
  register: () => <RegisterFlow eventId="e1" language="zh" />,
  prep: () => <PrepPage eventId="e1" language="zh" />,
  after: () => <AfterPage eventId="e1" language="zh" />,
  people: () => <EventPeopleScreen eventId="e1" language="zh" />,
  profile: () => <AccountProfilePage />,
  settings: () => <AccountProfilePage active="home" />,
  settingsAccount: () => <AccountOverviewPage />,
  settingsExports: () => <ExportsPage />,
  settingsNotifications: () => <NotificationSettingsPageClient />,
  settingsTasks: () => <SettingsTasks />,
  settingsSchedule: () => <SettingsSchedule />,
  settingsAppearance: () => <SettingsAppearance />,
  settingsIntegrations: () => <SettingsIntegrations />,
  settingsIorbit: () => <SettingsIorbit />,
  settingsAgentConnections: () => <SettingsAgentConnections />,
  settingsHelp: () => <SettingsHelp />,
  todo: () => tasks("todo"),
  taskList: () => tasks("todo", <TodoTaskSlot actorId="u1" initialList />),
  taskListDone: () => tasks("todo", <TodoTaskSlot actorId="u1" initialList initialCompleted />),
  calendar: () => tasks("calendar"),
  memo: () => tasks("memo"),
  planType: () => <PlanTypeDetailScreen planId="p1" itemId="i1" />,
};
