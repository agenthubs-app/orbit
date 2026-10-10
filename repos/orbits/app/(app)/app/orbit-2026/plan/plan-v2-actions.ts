"use client";

// R24: shared client helpers for the overview and the person-type page — the layout
// tier (1440 / 1024 / 390 per b8), and the write runner: every user action gets a
// fresh idempotency key, sends once (planApi retries a network failure once with the
// same key) and shows 「保存できませんでした」 when it fails. Writes happen only here,
// on a person's click.
import { useCallback, useEffect, useRef, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useStandardCopy, useToast } from "../ui";
import { newActionKey, planApi, type PlanApiResult } from "./plan-api";

export type LayoutTier = "wide" | "medium" | "narrow";

function tierNow(): LayoutTier {
  if (typeof window === "undefined" || !window.matchMedia) return "wide";
  if (window.matchMedia("(min-width: 1280px)").matches) return "wide";
  return window.matchMedia("(min-width: 768px)").matches ? "medium" : "narrow";
}

/** ≥1280 wide (web.html), 768–1279 medium (b8 1024), <768 narrow (b8 390). */
export function useLayoutTier(): LayoutTier {
  const [tier, setTier] = useState<LayoutTier>("wide");
  useEffect(() => {
    const update = () => setTier(tierNow());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return tier;
}

export const enc = encodeURIComponent;

/** `/v2/<planId>…` under /api/agent/plans. */
export function v2Path(planId: string, rest = ""): string {
  return `/v2/${enc(planId)}${rest}`;
}

type Write = { path: string; method?: "POST" | "DELETE"; body?: Record<string, unknown> };

/** Runs one write per click; `busy` names the running action so its button shows loading. */
export function usePlanWrites(language: OrbitLanguage) {
  const toast = useToast();
  const copy = useStandardCopy();
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef<string | null>(null);
  const run = useCallback(async <T,>(name: string, write: Write): Promise<T | null> => {
    if (running.current) return null;
    running.current = name;
    setBusy(name);
    try {
      const result: PlanApiResult<T> = await planApi<T>(write.path, { body: { ...(write.body ?? {}), idempotencyKey: newActionKey() }, language, method: write.method ?? "POST" });
      if (!result.ok) {
        toast.error(copy.toast.saveFailed);
        return null;
      }
      return result.data;
    } finally {
      running.current = null;
      setBusy(null);
    }
  }, [copy.toast.saveFailed, language, toast]);
  return { busy, run };
}

/** Copy text; a browser without clipboard access just does nothing visible. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
