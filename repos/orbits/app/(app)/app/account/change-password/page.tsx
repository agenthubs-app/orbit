import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { normalizeOrbitAuthReturnPath } from "../../../../../features/auth/app-auth-routing";
import { enabledOAuthProviders } from "../../../../../features/auth/oauth-providers";
import { LandingPage } from "../../orbit-2026/auth-public/LandingPage";
import { AuthModal } from "../../orbit-2026/auth-public/auth-modal";
import { authRoutePath } from "../../orbit-2026/auth-public/auth-model";
import { getOrbitServerLanguage, makeOrbitServerT } from "../../orbit-language-server";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = makeOrbitServerT(await getOrbitServerLanguage());
  return { title: `${t({ en: "Change password", ja: "パスワードを変更", zh: "修改密码" })} · Orbit`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

type ChangePasswordSearchParams = { first?: string | string[]; next?: string | string[] };

/**
 * 登录后修改密码（批量建账户的首次改密也落在这里，`?first=1` 只换副标题）。
 * 与重置密码页同一画面：落地页在下、新密码弹窗在上；未登录先去登录（带 next，登录后会再判断是否需要改密）。
 */
export default async function ChangePasswordPage({ searchParams }: { searchParams?: Promise<ChangePasswordSearchParams> } = {}) {
  const params = await searchParams;
  const next = normalizeOrbitAuthReturnPath(params?.next);
  const session = await auth();
  const email = session?.user?.email;
  if (!session?.user?.id || !email) redirect(authRoutePath("login", next));
  const first = (Array.isArray(params?.first) ? params.first[0] : params?.first) === "1";

  return (
    <>
      <div data-orbit-route="app-account-change-password-route">
        <LandingPage googleEnabled={enabledOAuthProviders().includes("google")} />
        <AuthModal changePassword={{ email, first, next }} closeHref={next} view="change-password" />
      </div>
      <OrbitVisualFreezeRuntime />
    </>
  );
}
