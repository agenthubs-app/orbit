/**
 * `/app` 分组 layout。
 *
 * 这里从请求头或 cookie 中恢复 Orbit 语言设置，然后把语言上下文提供给所有内部页面。
 */
import "../../globals.css";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";

import { OrbitLanguageProvider } from "./orbit-language-context";
import { normalizeOrbitLanguage } from "./orbit-language-core";
import { OrbitResponsiveA11y } from "./orbit-responsive-a11y";
import { OrbitThemeStyles, OrbitThemeToggle } from "./orbit-theme";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const language = normalizeOrbitLanguage(
    requestHeaders.get("x-orbit-lang") ?? cookieStore.get("orbit-lang")?.value,
  );

  return (
    <OrbitLanguageProvider initialLanguage={language}>
      <link href="/iorbit-starfield/fonts/desktop.css" rel="stylesheet" />
      <OrbitResponsiveA11y />
      <OrbitThemeStyles />
      {children}
      <OrbitThemeToggle />
    </OrbitLanguageProvider>
  );
}
