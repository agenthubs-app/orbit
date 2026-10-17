// R04 Toast rules (01-system ① / kit .toast), as a pure model:
//   - one at a time: a new toast replaces the one on screen;
//   - success / info leave after 5 s (the countdown line); errors stay until closed;
//   - an `undo` adds 元に戻す (5 s); `keep` makes it an undo bar: no countdown, stays
//     until closed, says until when (sub line);
//   - one optional action button instead of undo: 再試行 on an error, 開く on info;
//   - an undo or action whose owner (the screen that showed it) has unmounted is
//     disarmed, so a callback never runs into a screen that is gone.
export type ToastKind = "success" | "error" | "info";
/** `icon`: a line icon before the label (01-system ①: refresh before 再試行). */
export type ToastAction = { label: string; onPress: () => void; icon?: string };
/** `icon`: the status mark's line icon (01-system ①: clock for 明日に移動, plus for 追加, wifioff for offline); default by kind. */
/** `stay`: no countdown, stays until tapped, but keeps the capsule shape (01-system ① offline: 接続後に同期します). */
export type ToastInput = { kind?: ToastKind; message: string; sub?: string; undo?: () => void; action?: ToastAction; keep?: boolean; stay?: boolean; icon?: string };
export type ToastState = { id: number; owner: number; kind: ToastKind; message: string; sub?: string; undo?: () => void; action?: ToastAction; keep: boolean; autoDismissMs: number | null; icon?: string };

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
    ...(input.icon ? { icon: input.icon } : {}),
    ...(input.undo ? { undo: input.undo } : input.action ? { action: input.action } : {}),
    keep,
    autoDismissMs: kind === "error" || keep || input.stay ? null : TOAST_DURATION_MS,
  };
}

/** The current toast once its owner unmounts: still visible, undo and action removed. */
export function disarmOwner(current: ToastState | null, owner: number): ToastState | null {
  if (!current || current.owner !== owner || (!current.undo && !current.action)) return current;
  const { undo: _undo, action: _action, ...rest } = current;
  return rest;
}

/**
 * Bottom offset (kit .toast.pos / .notab): above a tab bar (100) or near the edge without one (40). R31a: a page
 * that draws its own bottom bar (会場 5-tab glass bar) declares it with usePageBottomBar(), and counts as a tab bar.
 */
export function toastBottom(hasTabBar: boolean, pageBars = 0): number {
  return hasTabBar || pageBars > 0 ? 100 : 40;
}

/** kit color-mix(in srgb, <over> p%, <base>): the toast's mark and button tints, from the theme's tokens. */
export function mixHex(over: string, base: string, p: number): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [a, b] = [channels(over), channels(base)];
  return `#${a.map((v, i) => Math.round(v * p + b[i]! * (1 - p)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
