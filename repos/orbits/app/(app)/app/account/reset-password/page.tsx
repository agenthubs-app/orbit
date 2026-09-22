import type { Metadata } from "next";
import { OrbitLanding0918 } from "../../orbit-landing-0918";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { AuthModal } from "../auth-0918/auth-modal";

export const metadata: Metadata = { title: "重置密码 · Orbit", robots: { index: false, follow: false }, referrer: "no-referrer" };

// 认证弹窗 任务 3（审阅修订 5）：邮件链接页——不加 auth()（已登录用户也可用重置链接）、无 route model；
// 落地页在下（`authenticated={false}`：顶栏真实态由 SessionProvider 决定）、新密码弹窗在上（设计 422–463）；
// 补 `OrbitVisualFreezeRuntime`（像素冻结需要）。
export default function PasswordResetPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <div data-orbit-route="app-account-reset-route">
        <OrbitLanding0918 authenticated={false} />
        <AuthModal view="reset" />
      </div>
      <OrbitVisualFreezeRuntime />
    </>
  );
}
