/**
 * R17 イベント運営（host DESIGN §2.3–§2.9）：`?tab=overview|matching|people|setup|report`，`&drawer=cohosts`。
 * 服务端只判登录；数据与权限（requireEventCapability）走 GET /api/host/events/[id]/overview，无权限时页面显示说明。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { HostConsole } from "../../../orbit-2026/host/HostConsole";

export const dynamic = "force-dynamic";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function AppEventOperationsAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: routeId }, session, language] = await Promise.all([params, auth(), getOrbitServerLanguage()]);
  const eventId = routeEventId(routeId);
  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(`/app/events/${eventId}/operations`)}`);
  }
  return <HostConsole eventId={eventId} language={language} />;
}
