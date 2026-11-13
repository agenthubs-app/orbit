/**
 * 修改密码页的路径与登录后的「是否要先改密码」判断（软强制：只在 credentials 登录成功后查一次，不做全站拦截）。
 */
import { profileContinuationPath } from "../../profile/profile-onboarding-navigation";

export const CHANGE_PASSWORD_ROUTE = "/app/account/change-password";

/** `first`：批量建账户的初始密码首次登录（只影响副标题文案）。 */
export function changePasswordPath(next: string, first = false): string {
  const params = new URLSearchParams();
  if (next) params.set("next", next);
  if (first) params.set("first", "1");
  const query = params.toString();
  return query ? `${CHANGE_PASSWORD_ROUTE}?${query}` : CHANGE_PASSWORD_ROUTE;
}

/**
 * credentials 登录成功后去哪：账户带 `mustChangePassword` 时先去改密页（带原来的 next），否则照常走资料续接。
 * 状态读不到（网络 / 503）时不挡登录，照常续接。
 */
export async function credentialsLandingPath(next: string, fetcher: typeof fetch = fetch): Promise<string> {
  try {
    const response = await fetcher("/api/auth/password/status", { cache: "no-store", credentials: "same-origin" });
    const body = response.ok ? await response.json().catch(() => null) as { mustChangePassword?: unknown } | null : null;
    if (body?.mustChangePassword === true) return changePasswordPath(next, true);
  } catch {
    // Soft enforcement: an unreadable status never blocks sign-in.
  }
  return profileContinuationPath(next);
}
