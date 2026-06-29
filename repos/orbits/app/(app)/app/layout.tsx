import "../../globals.css";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";

import { OrbitLanguageProvider } from "./orbit-language-context";
import { normalizeOrbitLanguage } from "./orbit-language-core";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const language = normalizeOrbitLanguage(
    requestHeaders.get("x-orbit-lang") ?? cookieStore.get("orbit-lang")?.value,
  );

  return <OrbitLanguageProvider initialLanguage={language}>{children}</OrbitLanguageProvider>;
}
