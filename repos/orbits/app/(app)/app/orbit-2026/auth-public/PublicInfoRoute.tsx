import { cookies, headers } from "next/headers";

import { auth } from "../../../../../auth";
import { resolveRequestOrbitLanguage } from "../../orbit-language-core";
import { PublicInfoPage, type PublicInfoKind } from "./PublicInfoPage";

// These pages stay public. A session changes only the way back to settings.
export async function PublicInfoRoute({ kind }: { kind: PublicInfoKind }) {
  const [session, requestHeaders, cookieStore] = await Promise.all([auth(), headers(), cookies()]);
  const language = resolveRequestOrbitLanguage({
    header: requestHeaders.get("x-orbit-lang"),
    cookie: cookieStore.get("orbit-lang")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });
  return <PublicInfoPage kind={kind} language={language} signedIn={Boolean(session?.user?.id)} />;
}
