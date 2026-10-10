import { cookies, headers } from "next/headers";

import { resolveRequestOrbitLanguage } from "../../(app)/app/orbit-language-core";
import { ComponentShowcase } from "./ComponentShowcase";

export const metadata = { title: "Components · Orbit showcase", robots: { index: false } };

// R06 / RD-15: every Web component and state for side-by-side checks against the
// design kit. Visible locally and on preview / staging (app/showcase/layout.tsx).
export default async function ComponentShowcasePage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const { lang } = await searchParams;
  const language = resolveRequestOrbitLanguage({
    header: lang ?? requestHeaders.get("x-orbit-lang"),
    cookie: cookieStore.get("orbit-lang")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });
  return <ComponentShowcase language={language} />;
}
