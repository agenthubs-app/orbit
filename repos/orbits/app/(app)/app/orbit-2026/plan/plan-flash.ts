"use client";

// R25: a one-shot note carried across a navigation (確定 → プラン概要 shows
// 「方案を更新しました」). Session storage only; a browser that blocks it just shows no
// toast — the plan itself is already saved on the server.
const KEY = "orbit:plan-flash";

export type PlanFlash = "updated" | "goalSaved";

export function setPlanFlash(flash: PlanFlash): void {
  try {
    window.sessionStorage.setItem(KEY, flash);
  } catch {
    // Storage blocked (private mode, tests): nothing to carry.
  }
}

/** Reads and clears the note (once). */
export function takePlanFlash(): PlanFlash | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return value === "updated" || value === "goalSaved" ? value : null;
  } catch {
    return null;
  }
}
