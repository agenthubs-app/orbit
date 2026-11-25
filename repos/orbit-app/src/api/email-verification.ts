// Email verification (2026-11-25): blocks nothing, only reminds. The status comes with GET /api/account/me — the same
// read that checks the session, never a query of its own — and is kept per server and account while the App runs.
import type { OrbitApiClient } from "./client";
import type { EmailVerificationSendResult, EmailVerificationSendFailureReason, EmailVerificationStatusContract } from "./contract/email-verification";
import { normalizeOrbitApiBaseUrl } from "./base-url";
import { ORBIT_API_ENDPOINTS } from "./endpoints";

export interface AccountEmailVerification extends EmailVerificationStatusContract {
  scope: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** No field = not known (an older server, a demo account): neither reminded nor taken as verified. */
export function emailVerificationFromPayload(payload: unknown): EmailVerificationStatusContract | null {
  const value = isRecord(payload) ? payload.emailVerification : null;
  if (!isRecord(value) || typeof value.email !== "string" || !value.email || typeof value.verified !== "boolean") return null;
  return { email: value.email, verified: value.verified, ...(typeof value.sent === "boolean" ? { sent: value.sent } : {}) };
}

export function emailVerificationScope(baseUrl: string, accountId: string): string {
  return `${normalizeOrbitApiBaseUrl(baseUrl)}\u0000${accountId}`;
}

let current: AccountEmailVerification | null = null;
const listeners = new Set<() => void>();

export function emailVerificationSnapshot(): AccountEmailVerification | null {
  return current;
}

export function subscribeEmailVerification(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function set(next: AccountEmailVerification | null): void {
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  listeners.forEach(listener => listener());
}

/** Called with every account/me answer. */
export function publishEmailVerification(baseUrl: string, payload: unknown): void {
  const accountId = isRecord(payload) && isRecord(payload.account) && typeof payload.account.id === "string" ? payload.account.id.trim() : "";
  if (!accountId) return;
  const status = emailVerificationFromPayload(payload);
  set(status ? { ...status, scope: emailVerificationScope(baseUrl, accountId) } : null);
}

export function patchEmailVerification(scope: string, patch: Partial<Pick<AccountEmailVerification, "sent" | "verified">>): void {
  if (current?.scope === scope) set({ ...current, ...patch });
}

export type EmailSendState = { kind: "idle" | "sending" | "sent" | "limit" | "fail" } | { kind: "wait"; seconds: number };
export type EmailSendOutcome = { kind: "sent" | "verified" | "limit" | "fail" } | { kind: "wait"; seconds: number };

/** One mail a minute, five a day; which limit it was is in `error.context.reason`. */
export async function sendVerificationMail(client: OrbitApiClient, language: "zh" | "ja" | "en"): Promise<EmailSendOutcome> {
  const result = await client.post<EmailVerificationSendResult>(ORBIT_API_ENDPOINTS.accountEmailVerificationSend, { body: { language } });
  if (result.success) return { kind: result.data?.verified ? "verified" : "sent" };
  const reason = result.error.context?.reason as EmailVerificationSendFailureReason | undefined;
  if (reason === "EMAIL_SEND_TOO_SOON") return { kind: "wait", seconds: Math.max(1, Number(result.error.context?.retryAfterSeconds) || 60) };
  return { kind: reason === "EMAIL_SEND_DAILY_LIMIT" ? "limit" : "fail" };
}
