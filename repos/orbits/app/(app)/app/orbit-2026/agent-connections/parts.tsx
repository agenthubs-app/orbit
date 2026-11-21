"use client";

/**
 * agent-design AG17: small pieces the consent page, the confirm page, settings › 外部 AI 助手 and the inbox line share —
 * the client's initial tile (no brand mark; the draft uses initials), times in the reader's words («今天 14:20»,
 * «明天 14:20», «11月20日（周五）14:20»), and the three levels of a domain read from and written to scope names.
 */
import { useSyncExternalStore, type ReactNode } from "react";

import type { AgentConnectionScopeOptionContract } from "../../../../../shared/contract/agent-v1";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { Bone, MacTile } from "../ui";
import { agentConnectionsWords, type ConnectionDomain } from "../copy/agent-connections";

const subscribeNever = () => () => undefined;

/**
 * A time in the reader's own zone. The server does not know that zone, so the server-rendered page holds a bone of
 * about the same width in its place and the browser writes the time in at hydration (no line moves).
 */
export function LocalTime({ render, width = 72 }: { render: () => ReactNode; width?: number }) {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  return hydrated ? <>{render()}</> : <span style={{ display: "inline-flex", verticalAlign: "middle" }}><Bone width={width} height={13} /></span>;
}

/** Claude apricot, any other client blue (the draft's two tiles). */
export function ClientTile({ name, size = "md" }: { name: string; size?: "md" | "sm" }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return <MacTile emoji={initial} tone={/^claude$/iu.test(name.trim()) ? "apricot" : "blue"} size={size} />;
}

const dayKey = (at: Date, zone: string) => new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: zone, year: "numeric" }).format(at);
const zoneOf = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** «今天 14:20» / «明天 14:20» / «昨天 14:20» / «11月20日（周五）14:20» in the reader's zone (board 10). */
export function whenText(iso: string, language: OrbitLanguage, now: Date = new Date(), zone: string = zoneOf()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const t = agentConnectionsWords(language);
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone: zone }).format(at);
  const day = dayKey(at, zone);
  const offset = (days: number) => dayKey(new Date(now.getTime() + days * 86_400_000), zone);
  if (day === offset(0)) return `${t("today")} ${clock}`;
  if (day === offset(1)) return `${t("tomorrow")} ${clock}`;
  if (day === offset(-1)) return `${t("yesterday")} ${clock}`;
  return `${dateText(iso, language, zone, true)} ${clock}`;
}

/** «11月12日» (with the weekday when asked: «11月20日（周五）»). */
export function dateText(iso: string, language: OrbitLanguage, zone: string = zoneOf(), weekday = false): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "numeric", timeZone: zone, weekday: "short" }).formatToParts(at);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const dayOfMonth = parts.find((part) => part.type === "day")?.value ?? "";
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((part) => part.type === "weekday")?.value ?? "");
  if (language === "en") {
    const label = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: zone, ...(weekday ? { weekday: "short" as const } : {}) }).format(at);
    return label;
  }
  const t = agentConnectionsWords(language);
  const names = t("weekdayNames").split(",");
  const base = t("monthDay", { d: dayOfMonth, m: month });
  if (!weekday || index < 0) return base;
  return language === "ja" ? `${base}(${names[index]})` : `${base}（${names[index]}）`;
}

export type Level = "none" | "read" | "propose";

/** What a set of scopes means for one domain. */
export function levelOf(option: AgentConnectionScopeOptionContract, scopes: ReadonlySet<string> | readonly string[]): Level {
  const has = (scope: string) => (scopes instanceof Set ? scopes.has(scope) : (scopes as readonly string[]).includes(scope));
  if (option.propose && has(option.propose)) return "propose";
  return has(option.read) ? "read" : "none";
}

/**
 * The scopes the page sends: each domain's level («可以提修改» includes reading), and «look at what it proposed» whenever
 * it may propose anything or asked to look (it has no row of its own: it only shows the client its own proposals).
 */
export function scopesFrom(options: readonly AgentConnectionScopeOptionContract[], levels: Readonly<Record<string, Level>>, askedForProposals: boolean): string[] {
  const scopes: string[] = [];
  for (const option of options) {
    const level = levels[option.domain] ?? "none";
    if (level === "none") continue;
    scopes.push(option.read);
    if (level === "propose" && option.propose) scopes.push(option.propose);
  }
  if (scopes.length && (askedForProposals || scopes.some((scope) => scope.endsWith(":propose")))) scopes.push("proposals:read");
  return scopes;
}

/** «联系人、待办、笔记» — the domains at least at `level`, in the page's order. */
export function domainNames(options: readonly AgentConnectionScopeOptionContract[], scopes: readonly string[], level: "read" | "propose", language: OrbitLanguage): string[] {
  const t = agentConnectionsWords(language);
  return options.filter((option) => {
    const has = levelOf(option, scopes);
    return level === "read" ? has !== "none" : has === "propose";
  }).map((option) => t(`domain_${option.domain as ConnectionDomain}`));
}
