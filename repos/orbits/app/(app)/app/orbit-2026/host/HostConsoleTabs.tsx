"use client";

// R17 イベント運営の页签。概要 在 HostConsole.tsx；マッチング（HostMatching）/ 参加者（HostPeople）是真组件；
// 申込設定 / レポート 仍是占位（后续子代理在 HostTabContent 里换成对应组件即可，路由与页头不用动）。受付 是独立的 kiosk 页面（/operations/check-in，不挂壳）。
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { HostMatchingTab } from "./HostMatching";
import { HostPeopleTab } from "./HostPeople";
import { hostTranslator, type HostT } from "./host-model";
import s from "./host.module.css";

export const HOST_CONSOLE_TABS = ["overview", "matching", "people", "checkin", "setup", "report"] as const;
export type HostConsoleTab = Exclude<(typeof HOST_CONSOLE_TABS)[number], "checkin"> | "checkin";

const ROUTED = new Set<string>(["overview", "matching", "people", "setup", "report"]);

/** `?tab=` → 页签；不认识的值回到概要（受付不是页内页签，走 kiosk 页面）。 */
export function parseConsoleTab(value: string | null | undefined): Exclude<HostConsoleTab, "checkin"> {
  return value && ROUTED.has(value) ? (value as Exclude<HostConsoleTab, "checkin">) : "overview";
}

export function HostTabPlaceholder({ tab, t }: { tab: HostConsoleTab; t: HostT }) {
  return <div className={`${s.card} ${s.span12} ${s.empty}`} data-host-tab-placeholder={tab}>{t("tabSoon")}</div>;
}

/** 概要以外の页签内容（各自读写；`onChanged` 让壳重读概要，刷新页签角标）。 */
export function HostTabContent({ tab, eventId, language, incomplete = false, onChanged }: { tab: HostConsoleTab; eventId: string; language: OrbitLanguage; incomplete?: boolean; onChanged?: () => void }) {
  if (tab === "matching") return <HostMatchingTab eventId={eventId} language={language} onChanged={onChanged} />;
  if (tab === "people") return <HostPeopleTab eventId={eventId} language={language} initialIncomplete={incomplete} onChanged={onChanged} />;
  return <HostTabPlaceholder tab={tab} t={hostTranslator(language)} />;
}
