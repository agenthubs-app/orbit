/**
 * R17 基本情報を編集（host DESIGN §2.2；b12 #398）：服务端只判登录；活动与权限（`event.edit`）走 GET /api/host/events/[id]，
 * 页面本身不读活动（不会把未公开活动的标题给任意登录用户）。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { HostEventForm } from "../../../orbit-2026/host/HostEventForm";

export const dynamic = "force-dynamic";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function HostEventEditPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: routeId }, session, language] = await Promise.all([params, auth(), getOrbitServerLanguage()]);
  const eventId = routeEventId(routeId);
  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(`/app/events/${encodeURIComponent(eventId)}/edit`)}`);
  }
  return <HostEventForm mode="edit" eventId={eventId} language={language} />;
}
