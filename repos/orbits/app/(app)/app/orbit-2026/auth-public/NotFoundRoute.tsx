import { cookies, headers } from "next/headers";

import { auth } from "../../../../../auth";
import { resolveRequestOrbitLanguage } from "../../orbit-language-core";
import { NotFoundPage } from "./NotFoundPage";

export async function NotFoundRoute({ insideApp }: { insideApp: boolean }) {
  const [session, requestHeaders, cookieStore] = await Promise.all([auth(), headers(), cookies()]);
  const language = resolveRequestOrbitLanguage({
    header: requestHeaders.get("x-orbit-lang"),
    cookie: cookieStore.get("orbit-lang")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });
  return <NotFoundPage language={language} signedIn={Boolean(session?.user?.id)} insideApp={insideApp} />;
}
