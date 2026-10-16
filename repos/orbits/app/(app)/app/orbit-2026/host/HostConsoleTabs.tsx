"use client";

// R17 イベント運営の页签。概要 在 HostConsole.tsx；マッチング / 参加者 / 申込設定 / レポート 本段先放占位，后续子代理各自替换成真组件
// （在这里把 HostTabPlaceholder 换成对应组件即可，路由与页头不用动）。受付 是独立的 kiosk 页面（/operations/check-in，不挂壳）。
import type { HostT } from "./host-model";
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
