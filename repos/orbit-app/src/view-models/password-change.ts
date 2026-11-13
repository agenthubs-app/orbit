// 首次登录强制改密（与 Web features/auth/password-change*.ts、auth-public/password-change-client.ts、use-password-change.ts 同规则）。
// - GET  /api/auth/password/status → `{ mustChangePassword }`（不是 success 信封，所以不走 OrbitApiClient）；读不到时不挡登录。
// - POST /api/auth/password/change → `{ currentPassword, newPassword }`，要求已登录；成功后旧会话随 passwordChangedAt 失效，
//   App 用新密码重新走 /api/auth/mobile/credentials（AuthSessionProvider.signIn）存新的 Cookie。
// 软强制：只在邮箱密码登录成功后查一次（Google 登录不查），不做全站拦截。
import { normalizeOrbitApiBaseUrl } from "../api/base-url";
import type { MessageKey } from "../i18n/messages";
import { nextHrefForAccountAuthSubmit, normalizedNext } from "./account-auth";

export const CHANGE_PASSWORD_ROUTE = "/account/change-password";
const MAX_PASSWORD_BYTES = 72;
const MIN_PASSWORD_LENGTH = 8;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function authHeaders(cookieHeader: string): { credentials: RequestCredentials; headers: Record<string, string> } {
  const cookie = cookieHeader.trim();
  return { credentials: cookie ? "omit" : "include", headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) } };
}

/** 账号是否带 `mustChangePassword`。网络错误、401 / 503、格式不对一律当作 false（不挡登录）。 */
export async function readMustChangePassword({ baseUrl, cookieHeader, fetchImpl = fetch }: { baseUrl: string; cookieHeader: string; fetchImpl?: FetchLike }): Promise<boolean> {
  try {
    const { credentials, headers } = authHeaders(cookieHeader);
    const response = await fetchImpl(`${normalizeOrbitApiBaseUrl(baseUrl)}/api/auth/password/status`, { cache: "no-store", credentials, headers, method: "GET" });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null) as { mustChangePassword?: unknown } | null;
    return body?.mustChangePassword === true;
  } catch {
    return false;
  }
}

export type PasswordChangeFailure = "CONFLICT" | "INVALID_INPUT" | "NO_PASSWORD" | "SAME_PASSWORD" | "UNAUTHORIZED" | "WRONG_PASSWORD" | "NETWORK" | "UNKNOWN";
export type PasswordChangeResult = { ok: true } | { ok: false; code: PasswordChangeFailure };
const KNOWN_FAILURES = new Set<PasswordChangeFailure>(["CONFLICT", "INVALID_INPUT", "NO_PASSWORD", "SAME_PASSWORD", "UNAUTHORIZED", "WRONG_PASSWORD"]);

export async function submitPasswordChange({ baseUrl, cookieHeader, currentPassword, newPassword, fetchImpl = fetch }: { baseUrl: string; cookieHeader: string; currentPassword: string; newPassword: string; fetchImpl?: FetchLike }): Promise<PasswordChangeResult> {
  let response: Response;
  try {
    const { credentials, headers } = authHeaders(cookieHeader);
    response = await fetchImpl(`${normalizeOrbitApiBaseUrl(baseUrl)}/api/auth/password/change`, {
      body: JSON.stringify({ currentPassword, newPassword }),
      cache: "no-store",
      credentials,
      headers: { ...headers, "Content-Type": "application/json" },
      method: "POST"
    });
  } catch {
    return { code: "NETWORK", ok: false };
  }
  const body = await response.json().catch(() => null) as { success?: unknown; error?: { code?: unknown } } | null;
  if (response.ok && body?.success === true) return { ok: true };
  const code = typeof body?.error?.code === "string" ? body.error.code as PasswordChangeFailure : null;
  return { code: code && KNOWN_FAILURES.has(code) ? code : "UNKNOWN", ok: false };
}

export type PasswordChangeProblem = "current-required" | "too-short" | "too-long" | "same";

/** 本地校验（零网络）：当前密码必填；新密码至少 8 位、UTF-8 不超过 72 字节；不能与当前相同。 */
export function validatePasswordChange(currentPassword: string, newPassword: string): PasswordChangeProblem | null {
  if (!currentPassword) return "current-required";
  if (newPassword.length < MIN_PASSWORD_LENGTH) return "too-short";
  if (new TextEncoder().encode(newPassword).byteLength > MAX_PASSWORD_BYTES) return "too-long";
  if (newPassword === currentPassword) return "same";
  return null;
}

export function passwordChangeProblemKey(problem: PasswordChangeProblem): MessageKey {
  return ({ "current-required": "auth.changeCurrentRequired", same: "auth.changeSamePassword", "too-long": "reset.tooLong", "too-short": "reset.tooShort" } as const)[problem];
}

export function passwordChangeFailureKey(code: PasswordChangeFailure): MessageKey {
  return ({
    CONFLICT: "auth.changeConflict",
    INVALID_INPUT: "auth.changeInvalidInput",
    NETWORK: "auth.networkFailure",
    NO_PASSWORD: "auth.changeNoPassword",
    SAME_PASSWORD: "auth.changeSamePassword",
    UNAUTHORIZED: "auth.changeUnauthorized",
    UNKNOWN: "auth.changeFailed",
    WRONG_PASSWORD: "auth.changeWrongPassword"
  } as const)[code];
}

/** 改密页地址；`first` = 批量建账户的初始密码首次登录（只换副标题）。 */
export function changePasswordHref(next: string, first = false): string {
  return `${CHANGE_PASSWORD_ROUTE}?next=${encodeURIComponent(normalizedNext(next))}${first ? "&first=1" : ""}`;
}

/** 邮箱密码登录成功后去哪：带 `mustChangePassword` 时先去改密页（带原来的 next），否则照常。 */
export function credentialsLandingHref(mustChangePassword: boolean, next: string): string {
  return mustChangePassword ? changePasswordHref(next, true) : nextHrefForAccountAuthSubmit({ mode: "login", next });
}

/**
 * 粘贴进密码框时去掉粘贴内容的首尾空白（与 Web trimPastedPassword 一致：只处理这一次插入的文字，手动输入不受影响）。
 * RN 没有 onPaste：一次 onChangeText 里插入了 2 个以上字符就当作粘贴（或钥匙串自动填充），只修剪插入的那一段。
 */
export function trimPastedPassword(previous: string, next: string): string {
  let start = 0;
  const limit = Math.min(previous.length, next.length);
  while (start < limit && previous[start] === next[start]) start += 1;
  let end = 0;
  while (end < limit - start && previous[previous.length - 1 - end] === next[next.length - 1 - end]) end += 1;
  const inserted = next.slice(start, next.length - end);
  if (inserted.length < 2) return next;
  const trimmed = inserted.trim();
  return trimmed === inserted ? next : `${next.slice(0, start)}${trimmed}${next.slice(next.length - end)}`;
}
