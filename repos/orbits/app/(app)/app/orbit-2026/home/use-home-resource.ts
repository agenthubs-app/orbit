"use client";

import { useCallback, useEffect, useState } from "react";
import type { ZodType } from "zod";

export type HomeResource<T> = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: T; readAt: string };

/** Mounted cards alone subscribe to their domain. A failed domain leaves other cards alone. */
export function useHomeResource<T>(path: string, schema: ZodType<T>): HomeResource<T> & { retry: () => void } {
  const [version, setVersion] = useState(0);
  const [resource, setResource] = useState<HomeResource<T>>({ kind: "loading" });
  const retry = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    const read = async () => {
      try {
        const response = await fetch(path, { cache: "no-store" });
        const body = await response.json() as { success?: boolean; data?: unknown };
        const parsed = schema.safeParse(body.data);
        if (!active) return;
        setResource(response.ok && body.success && parsed.success
          ? { kind: "ready", data: parsed.data, readAt: new Date().toISOString() } : { kind: "error" });
      } catch { if (active) setResource({ kind: "error" }); }
    };
    void read();
    // No window (server render / Node test renderers): read once, no focus refresh.
    if (typeof window === "undefined") return () => { active = false; };
    const onFocus = () => { if (document.visibilityState === "visible") void read(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { active = false; window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [path, schema, version]);
  return { ...resource, retry };
}
