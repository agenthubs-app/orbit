"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { publicCopy } from "../copy/public";
import { pickCopy } from "../copy/types";
import { Orbit2026Scope } from "../ui";
import { formatMaintenanceUntil, MaintenanceView, readMaintenanceFromApi } from "./MaintenanceView";
import s from "./MaintenanceView.module.css";

export function MaintenanceGate({ language }: { language: OrbitLanguage }) {
  const [signal, setSignal] = useState<{ until?: string } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const check = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    // A failed read (network error, timeout, non-2xx) returns null and is treated as "not in maintenance".
    const next = await readMaintenanceFromApi(fetch, controller.signal);
    clearTimeout(timeout);
    if (pending.current !== controller) return;
    if (next) setSignal(next);
    else window.location.replace("/");
  }, []);

  useEffect(() => {
    void check();
    return () => { pending.current?.abort(); pending.current = null; };
  }, [check]);

  if (!signal) return <Orbit2026Scope language={language} className={s.page}>
    <main className={s.content} role="status">{pickCopy(publicCopy.checkingStatus, language)}</main>
  </Orbit2026Scope>;
  return <MaintenanceView language={language} untilText={formatMaintenanceUntil(signal.until, language)} onRetry={() => { void check(); }} />;
}
