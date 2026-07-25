"use client";

import { useEffect } from "react";

export function OrbitTodayItemOpened({ actionId }: { actionId: string }) {
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/agent/actions/${encodeURIComponent(actionId)}/view`,
      {
        method: "POST",
        signal: controller.signal,
      },
    ).catch(() => undefined);
    return () => controller.abort();
  }, [actionId]);

  return null;
}
