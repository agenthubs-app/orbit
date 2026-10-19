"use client";

import { z } from "zod";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { maintenanceDateParts, publicCopy } from "../copy/public";
import { pickCopy } from "../copy/types";
import { Icon, Orbit2026Scope } from "../ui";
import p from "./PublicInfoPage.module.css";
import s from "./MaintenanceView.module.css";

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
  return `${month}${maintenanceDateParts.month[language]}${day}${maintenanceDateParts.day[language]} ${time}${maintenanceDateParts.zone[language]}`;
}

export function maintenanceFromVersionResponse(value: unknown): { until?: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (response.success !== true || !response.data || typeof response.data !== "object" || Array.isArray(response.data)) return null;
  const maintenance = (response.data as Record<string, unknown>).maintenance;
  if (!maintenance || typeof maintenance !== "object" || Array.isArray(maintenance)) return null;
  const signal = maintenance as Record<string, unknown>;
  if (signal.active !== true) return null;
  return instant.safeParse(signal.until).success ? { until: signal.until as string } : {};
}

export async function readMaintenanceFromApi(
  fetcher: (input: string, init?: RequestInit) => Promise<Response>,
  signal?: AbortSignal,
): Promise<{ until?: string } | null> {
  try {
    const response = await fetcher("/api/app/version", { cache: "no-store", signal });
    if (!response.ok) return null;
    return maintenanceFromVersionResponse(await response.json());
  } catch {
    return null;
  }
}

export function MaintenanceView({ language, untilText, onRetry }: {
  language: OrbitLanguage;
  untilText: string | null;
  onRetry: () => void;
}) {
  const t = (key: keyof typeof publicCopy) => pickCopy(publicCopy[key], language);
  return <Orbit2026Scope language={language} className={s.page}>
    <header className={p.header}>
      <a className={p.brand} href="/" aria-label="Orbit"><span className={p.logo}>O</span><strong>Orbit</strong></a>
    </header>
    <main className={s.content}>
      <div className={s.icon} aria-hidden="true">🛠️</div>
      <h1>{t("maintenanceTitle")}</h1>
      <p className={s.description}>{t("maintenanceBody")}</p>
      <section className={s.schedule} aria-label={t("maintenanceSchedule")}>
        <div className={s.scheduleLabel}>{t("maintenanceSchedule")}</div>
        <p className={s.scheduleValue}>{untilText ?? t("maintenanceUnknown")}</p>
      </section>
      <button type="button" className={s.retry} onClick={onRetry}><Icon name="refresh" size={16} />{t("reload")}</button>
    </main>
  </Orbit2026Scope>;
}
