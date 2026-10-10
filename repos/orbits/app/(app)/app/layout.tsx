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
import { CardBatchHost } from "./contacts/card-batch-0918/card-batch-host";
import { ContactDetailReturnRecorder } from "./contacts/network-0918/detail-return-recorder";
import { OrbitAskProvider } from "./orbit-global-ask/orbit-ask-context";
import { OrbitLanguageProvider } from "./orbit-language-context";
import { resolveRequestOrbitLanguage } from "./orbit-language-core";
import { OrbitResponsiveA11y } from "./orbit-responsive-a11y";
import { OrbitThemeRuntime, OrbitThemeStyles } from "./orbit-theme";
import { Orbit2026Shell } from "./orbit-2026/shell/Orbit2026Shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const session = await auth();
  const language = resolveRequestOrbitLanguage({
    header: requestHeaders.get("x-orbit-lang"),
    cookie: cookieStore.get("orbit-lang")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });

  return (
    <SessionProvider refetchOnWindowFocus={false} session={session}>
      <OrbitLanguageProvider initialLanguage={language}>
        <OrbitResponsiveA11y />
        <OrbitThemeStyles />
        <OrbitThemeRuntime />
        {/* iOrbit 提问的草稿与交接（R07 起由新壳的 ⌘K 面板使用）。挂在 layout：
            App Router 换页时只有 layout 存活，草稿要跨页保留就必须住在这一层。 */}
        <OrbitAskProvider>
          {/* R07 (RD-19)：所有已登录页面由新壳 Orbit2026Shell 统一挂导航（左栏、主标题区、右栏、⌘K）；
              页面不再自己挂顶栏。壳自己按路由决定是否出现（公开页、登录页、管理台不出现）。 */}
          <Orbit2026Shell language={language} signedIn={Boolean(session?.user)}>
            {children}
          </Orbit2026Shell>
          {/* 全站名片解析提醒：上传/识别在后台继续，完成后在任意页面弹出（新用户引导.dc.html 621–650）。 */}
          <CardBatchHost />
          {/* W0059：记下站内去联系人详情的一次性导航意图，详情关闭时据此后退回原页。 */}
          <ContactDetailReturnRecorder />
        </OrbitAskProvider>
      </OrbitLanguageProvider>
    </SessionProvider>
  );
}
