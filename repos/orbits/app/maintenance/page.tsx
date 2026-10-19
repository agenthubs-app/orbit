import { cookies, headers } from "next/headers";

import { resolveRequestOrbitLanguage } from "../(app)/app/orbit-language-core";
import { MaintenanceGate } from "../(app)/app/orbit-2026/auth-public/MaintenanceGate";

export default async function MaintenanceRoute() {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const language = resolveRequestOrbitLanguage({
    header: requestHeaders.get("x-orbit-lang"),
    cookie: cookieStore.get("orbit-lang")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });
  return <MaintenanceGate language={language} />;
}
