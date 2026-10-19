import { z } from "zod";

import type { OrbitLanguage } from "../api/contract/language";
import type { AppVersionGateDecision } from "./app-version-policy";

const instant = z.string().datetime({ offset: true });

export function formatMaintenanceUntil(until: string | undefined, language: OrbitLanguage): string | null {
  if (!instant.safeParse(until).success) return null;
  const date = new Date(until!);
  if (!Number.isFinite(date.valueOf())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const month = part("month");
  const day = part("day");
  const time = `${part("hour")}:${part("minute")}`;
  if (language === "en") {
    const monthName = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", month: "short" }).format(date);
    return `${monthName} ${day}, ${time} (JST)`;
  }
  return `${month}月${day}日 ${time}${language === "zh" ? "（日本时间）" : "（日本時間）"}`;
}

export function maintenanceRouteTarget(decision: AppVersionGateDecision, signedIn: boolean): "/" | "/home" | "/force-update" | null {
  if (decision.kind === "maintenance") return null;
  if (decision.kind === "force-update") return "/force-update";
  return signedIn ? "/home" : "/";
}
