"use client";

// 邮箱验证状态（顶部提醒与账号页共用一份）。开始值来自会话（不另查）；只在未验证时：
// 窗口回到前台重读一次会话，换页时看代理留下的 cookie。不轮询。
import { SessionContext } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useContext, useEffect, useSyncExternalStore } from "react";

import type { OrbitLanguage } from "../../../shared/contract/language";
import { EMAIL_NOTICE_COOKIE } from "./email-notice-cookie";

export type EmailSendState =
  | { kind: "idle" | "sending" | "sent" | "limit" | "fail" }
  | { kind: "wait"; seconds: number };

type State = { userId: string; verified: boolean; send: EmailSendState; mailed: boolean };

const REFRESH_GAP_MS = 3_000;
const RESEND_MS = 60_000;
let state: State | null = null;
let lastRefresh = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  if (!state) return;
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function cookieValue(): string | null {
  return document.cookie.split("; ").find((item) => item.startsWith(`${EMAIL_NOTICE_COOKIE}=`))?.slice(EMAIL_NOTICE_COOKIE.length + 1) ?? null;
}

function writeCookie(value: "pending" | null) {
  document.cookie = `${EMAIL_NOTICE_COOKIE}=${value ?? ""}; path=/; max-age=${value ? 86400 : 0}; samesite=lax`;
}

async function refresh(userId: string) {
  if (Date.now() - lastRefresh < REFRESH_GAP_MS) return;
  lastRefresh = Date.now();
  const session = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
    .then((response) => response.ok ? response.json() : null).catch(() => null) as { user?: { id?: string; emailVerification?: { verified?: boolean } | null } } | null;
  if (session?.user?.id === userId && session.user.emailVerification?.verified) { writeCookie(null); set({ verified: true }); }
}

function settle(send: EmailSendState, ms: number) {
  set({ send });
  if (timer) clearTimeout(timer);
  timer = ms ? setTimeout(() => set({ send: { kind: "idle" } }), ms) : null;
}

export async function sendVerificationMail(language: OrbitLanguage) {
  if (!state || state.send.kind === "sending") return;
  settle({ kind: "sending" }, 0);
  try {
    const response = await fetch("/api/account/email-verification/send", { body: JSON.stringify({ language }), credentials: "same-origin", headers: { "content-type": "application/json" }, method: "POST" });
    const body = await response.json().catch(() => null) as { success?: boolean; data?: { verified?: boolean }; error?: { context?: { reason?: string; retryAfterSeconds?: string } } } | null;
    if (response.ok && body?.success) {
      if (body.data?.verified) { writeCookie(null); set({ verified: true, send: { kind: "idle" } }); return; }
      set({ mailed: true });
      settle({ kind: "sent" }, RESEND_MS);
      return;
    }
    const reason = body?.error?.context?.reason;
    if (reason === "EMAIL_SEND_TOO_SOON") {
      const seconds = Math.max(1, Number(body?.error?.context?.retryAfterSeconds) || 60);
      settle({ kind: "wait", seconds }, seconds * 1000);
    } else settle({ kind: reason === "EMAIL_SEND_DAILY_LIMIT" ? "limit" : "fail" }, 0);
  } catch {
    settle({ kind: "fail" }, 0);
  }
}

/** null：未登录，或不知道验证状态（不提醒）。 */
export function useEmailVerification(): (State & { email: string }) | null {
  const user = useContext(SessionContext)?.data?.user;
  const flags = user?.emailVerification ?? null;
  const userId = user?.id ?? "";
  // 换了账号，或会话带来了更新的结果（整页重载、重新登录）就从会话重新开始；本页已经知道「已验证」的不退回去。
  if (typeof window !== "undefined" && flags && (!state || state.userId !== userId)) {
    state = { mailed: flags.sent, send: { kind: "idle" }, userId, verified: flags.verified };
  }
  const snapshot = useSyncExternalStore(subscribe, () => state, () => null);
  if (!user?.email || !flags) return null;
  const current = snapshot?.userId === userId ? snapshot : { mailed: flags.sent, send: { kind: "idle" as const }, userId, verified: flags.verified };
  return { ...current, email: user.email, verified: current.verified || flags.verified };
}

/** 挂在顶部提醒里，一页一份。 */
export function useEmailVerificationWatch(userId: string | null) {
  const pathname = usePathname();
  useEffect(() => {
    if (!userId) return;
    if (cookieValue() === "done") { writeCookie(null); set({ verified: true }); return; }
    writeCookie("pending");
  }, [userId, pathname]);
  useEffect(() => {
    if (!userId) return undefined;
    const onFront = () => { if (document.visibilityState === "visible") void refresh(userId); };
    window.addEventListener("focus", onFront);
    document.addEventListener("visibilitychange", onFront);
    return () => { window.removeEventListener("focus", onFront); document.removeEventListener("visibilitychange", onFront); };
  }, [userId]);
}
