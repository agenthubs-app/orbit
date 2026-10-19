"use client";

import { useEffect, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { publicCopy } from "../copy/public";
import { pickCopy } from "../copy/types";
import { Button } from "../ui/Button";
import { dismissWebBuildId, readDismissedWebBuildId, readWebVersionBuildId, shouldShowWebVersionBanner } from "./web-version-banner";
import s from "./WebVersionBanner.module.css";

let dismissedWithoutStorage: string | undefined;

function dismissedBuildId(): string | undefined {
  try {
    return readDismissedWebBuildId(window.localStorage) ?? dismissedWithoutStorage;
  } catch {
    return dismissedWithoutStorage;
  }
}

export function WebVersionBannerView({ language, onDismiss, onReload }: {
  language: OrbitLanguage;
  onDismiss: () => void;
  onReload: () => void;
}) {
  const t = (key: keyof typeof publicCopy) => pickCopy(publicCopy[key], language);
  return <aside className={s.banner} role="status" aria-label={t("webVersionTitle")}>
    <div className={s.heading}>
      <span className={s.icon} aria-hidden="true">✨</span>
      <div>
        <strong>{t("webVersionTitle")}</strong>
        <p>{t("webVersionBody")}</p>
      </div>
    </div>
    <div className={s.actions}>
      <Button variant="ghost" size="sm" label={t("webVersionLater")} onClick={onDismiss} />
      <Button variant="primary" size="sm" icon="refresh" label={t("reload")} onClick={onReload} />
    </div>
  </aside>;
}

/** D's shell supplies the build ID that was embedded in this page's response. */
export function WebVersionBannerGate({ currentBuildId, language }: {
  currentBuildId?: string;
  language: OrbitLanguage;
}) {
  const [targetBuildId, setTargetBuildId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentBuildId) return;
    let pending: AbortController | null = null;
    const check = () => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      void readWebVersionBuildId(fetch, controller.signal).then((nextBuildId) => {
        if (controller.signal.aborted) return;
        setTargetBuildId(shouldShowWebVersionBanner(currentBuildId, { webBuildId: nextBuildId }, dismissedBuildId()) ? nextBuildId : null);
      });
    };
    const onVisible = () => { if (!document.hidden) check(); };
    check();
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(check, 300_000);
    return () => {
      pending?.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [currentBuildId]);

  if (!targetBuildId) return null;
  return <WebVersionBannerView language={language} onDismiss={() => {
    dismissedWithoutStorage = targetBuildId;
    try { dismissWebBuildId(window.localStorage, targetBuildId); } catch { /* storage unavailable */ }
    setTargetBuildId(null);
  }} onReload={() => window.location.reload()} />;
}
