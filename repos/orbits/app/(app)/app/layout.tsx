import "../../globals.css";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";

import { OrbitLanguageProvider } from "./orbit-language-context";
import { normalizeOrbitLanguage } from "./orbit-language-core";
import { OrbitResponsiveA11y } from "./orbit-responsive-a11y";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const language = normalizeOrbitLanguage(
    requestHeaders.get("x-orbit-lang") ?? cookieStore.get("orbit-lang")?.value,
  );

  return (
    <OrbitLanguageProvider initialLanguage={language}>
      {/* Starfield font pack (Noto Sans/Serif SC, JetBrains Mono, Newsreader):
          the product theme layer maps --ff/--ff-tight/--ff-mono onto these so
          every screen shares the homepage's typography. Subsets load on demand
          via unicode-range. */}
      <link href="/iorbit-starfield/fonts/desktop.css" rel="stylesheet" />
      <OrbitResponsiveA11y />
      {children}
    </OrbitLanguageProvider>
  );
}
