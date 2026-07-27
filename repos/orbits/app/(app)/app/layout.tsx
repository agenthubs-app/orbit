/**
 * `/app` 分组 layout。
 *
 * 这里从请求头或 cookie 中恢复 Orbit 语言设置，然后把语言上下文提供给所有内部页面。
 *
 * 不 import `../../globals.css`：那是 `/dev` workbench 的内部样式表（裸
 * button/input/select/textarea 重置、`--orbit-*` token），规则全部收在
 * `.orbit-dev-root` 前缀下，产品页面不需要也不应该继承它。见
 * `.superpowers/sdd/p4-t8-report.md`。
 */
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { SessionProvider } from "next-auth/react";

import { auth } from "../../../auth";
import { OrbitLanguageProvider } from "./orbit-language-context";
import { normalizeOrbitLanguage } from "./orbit-language-core";
import { OrbitResponsiveA11y } from "./orbit-responsive-a11y";
import { OrbitThemeRuntime, OrbitThemeStyles } from "./orbit-theme";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const session = await auth();
  const language = normalizeOrbitLanguage(
    requestHeaders.get("x-orbit-lang") ?? cookieStore.get("orbit-lang")?.value,
  );

  return (
    <SessionProvider refetchOnWindowFocus={false} session={session}>
      <OrbitLanguageProvider initialLanguage={language}>
        <link href="/iorbit-starfield/fonts/desktop.css" rel="stylesheet" />
        <OrbitResponsiveA11y />
        <OrbitThemeStyles />
        <OrbitThemeRuntime />
        {children}
      </OrbitLanguageProvider>
    </SessionProvider>
  );
}
