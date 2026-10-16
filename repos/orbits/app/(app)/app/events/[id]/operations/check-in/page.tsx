/**
 * R17 受付 kiosk（host DESIGN §2.6；b6 #10–#12）：不挂壳、不注册 ⌘K（shell-routes / orbit-ask-routes 已排除 /operations/check-in）。
 * 服务端只判登录；名单与权限（requireEventCapability `check_in.*`）走 GET /api/host/events/[id]/kiosk，无权限时页面显示说明，
 * 页面本身不读活动（不会把未公开活动的标题给任意登录用户）。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { getOrbitServerLanguage } from "../../../../orbit-language-server";
import { HostKiosk } from "../../../../orbit-2026/host/HostKiosk";

export const dynamic = "force-dynamic";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function EventOperationsCheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: routeId }, session, language] = await Promise.all([params, auth(), getOrbitServerLanguage()]);
  const eventId = routeEventId(routeId);
  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(`/app/events/${encodeURIComponent(eventId)}/operations/check-in`)}`);
  }
  return <HostKiosk eventId={eventId} language={language} />;
}
