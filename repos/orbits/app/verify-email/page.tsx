import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { VerifyEmailPage } from "../(app)/app/orbit-2026/email-verification/VerifyEmailPage";
import { resolveRequestOrbitLanguage } from "../(app)/app/orbit-language-core";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };

/** Public: the link in the verification mail. Reads no session. */
export default async function VerifyEmailRoute({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const [{ lang }, requestHeaders, cookieStore] = await Promise.all([searchParams, headers(), cookies()]);
  return <VerifyEmailPage language={resolveRequestOrbitLanguage({
    header: lang ?? requestHeaders.get("x-orbit-lang"),
    cookie: cookieStore.get("orbit-lang")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  })} />;
}
