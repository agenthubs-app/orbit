"use client";

import { useEffect } from "react";

import { useToast } from "../ui";
import type { ToastInput } from "../ui/toast-model";

// R12: a toast that has to outlive the page that raised it (手入力 → 保存 → the contact's
// detail page, with 元に戻す for 5 s). A page's own ToastProvider unmounts with the page
// and disarms the undo; the shell stays mounted across next/link navigations, so the
// page hands the toast to the shell's provider through a window event. Same pattern as
// InboxEventBridge. Returns false outside the shell (signed-out frames, tests) so the
// caller can fall back to its own provider.
export const SHELL_TOAST_EVENT = "orbit-2026:shell-toast";

type ShellToastDetail = { input: ToastInput; handled: boolean };

export function showShellToast(input: ToastInput): boolean {
  if (typeof window === "undefined") return false;
  const detail: ShellToastDetail = { input, handled: false };
  window.dispatchEvent(new CustomEvent<ShellToastDetail>(SHELL_TOAST_EVENT, { detail }));
  return detail.handled;
}

export function ShellToastBridge() {
  const toast = useToast();
  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ShellToastDetail>).detail;
      if (!detail?.input?.message) return;
      detail.handled = true;
      const { kind = "success", message, ...options } = detail.input;
      toast[kind](message, options);
    };
    window.addEventListener(SHELL_TOAST_EVENT, onToast);
    return () => window.removeEventListener(SHELL_TOAST_EVENT, onToast);
  }, [toast]);
  return null;
}
