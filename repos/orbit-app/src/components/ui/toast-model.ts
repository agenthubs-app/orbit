// R04 Toast rules (01-system ① / kit .toast), as a pure model:
//   - one at a time: a new toast replaces the one on screen;
//   - success / info leave after 5 s (the countdown line); errors stay until closed;
//   - an `undo` adds 元に戻す (5 s); `keep` makes it an undo bar: no countdown, stays
//     until closed, says until when (sub line);
//   - an undo whose owner (the screen that showed it) has unmounted is disarmed, so
//     a callback never runs into a screen that is gone.
export type ToastKind = "success" | "error" | "info";
export type ToastInput = { kind?: ToastKind; message: string; sub?: string; undo?: () => void; keep?: boolean };
export type ToastState = { id: number; owner: number; kind: ToastKind; message: string; sub?: string; undo?: () => void; keep: boolean; autoDismissMs: number | null };

export const TOAST_DURATION_MS = 5000;
let nextId = 1;

export function createToast(input: ToastInput, owner: number): ToastState {
  const kind = input.kind ?? "success";
  const keep = Boolean(input.keep);
  return {
    id: nextId++,
    owner,
    kind,
    message: input.message,
    ...(input.sub ? { sub: input.sub } : {}),
    ...(input.undo ? { undo: input.undo } : {}),
    keep,
    autoDismissMs: kind === "error" || keep ? null : TOAST_DURATION_MS,
  };
}

/** The current toast once its owner unmounts: still visible, undo removed. */
export function disarmOwner(current: ToastState | null, owner: number): ToastState | null {
  if (!current || current.owner !== owner || !current.undo) return current;
  const { undo: _removed, ...rest } = current;
  return rest;
}

/** Bottom offset: above the tab bar (100) or near the edge without one (40). */
export function toastBottom(hasTabBar: boolean): number {
  return hasTabBar ? 100 : 40;
}
