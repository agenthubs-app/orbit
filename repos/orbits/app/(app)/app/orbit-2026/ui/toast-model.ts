// R06 Web Toast rules (01-system ① / kit .toast + .toast-stack), as a pure model:
//   - up to 3 on screen, newest at the bottom; a 4th pushes the oldest out;
//   - success / info leave after 5 s (the countdown line); errors stay until closed;
//   - `undo` adds 元に戻す; `keep` makes an undo bar: no countdown, stays until closed;
//   - one optional action instead of undo (再試行 on an error, 開く on info);
//   - an undo / action whose owner (the component that showed it) unmounted is disarmed.
// Same input shape as the App (src/components/ui/toast-model.ts); the App shows one.
export type ToastKind = "success" | "error" | "info";
export type ToastAction = { label: string; onSelect: () => void };
export type ToastInput = { kind?: ToastKind; message: string; sub?: string; undo?: () => void; action?: ToastAction; keep?: boolean };
export type ToastState = { id: number; owner: number; kind: ToastKind; message: string; sub?: string; undo?: () => void; action?: ToastAction; keep: boolean; autoDismissMs: number | null };

export const TOAST_DURATION_MS = 5000;
export const TOAST_STACK_MAX = 3;
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
    ...(input.undo ? { undo: input.undo } : input.action ? { action: input.action } : {}),
    keep,
    autoDismissMs: kind === "error" || keep ? null : TOAST_DURATION_MS,
  };
}

export function pushToast(stack: readonly ToastState[], toast: ToastState): ToastState[] {
  return [...stack, toast].slice(-TOAST_STACK_MAX);
}

export function removeToast(stack: readonly ToastState[], id: number): ToastState[] {
  return stack.filter((toast) => toast.id !== id);
}

/** Toasts of an owner that unmounted stay visible with undo and action removed. */
export function disarmOwner(stack: readonly ToastState[], owner: number): ToastState[] {
  return stack.map((toast) => {
    if (toast.owner !== owner || (!toast.undo && !toast.action)) return toast;
    const { undo: _undo, action: _action, ...rest } = toast;
    return rest;
  });
}
