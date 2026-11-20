/** 2026-11-21 参加者全名单页（event-detail-ia-proposal A6 / P6）：数据在客户端读 GET /api/events/[id]/overview?attendees=all。未登录 → 登录后回到这里。 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { EventPeopleScreen } from "../../../orbit-2026/events/EventPeople";

export const dynamic = "force-dynamic";

export default async function AppEventPeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session, language] = await Promise.all([params, auth(), getOrbitServerLanguage()]);
  const eventId = (() => { try { return decodeURIComponent(id); } catch { return id; } })();
  if (!session?.user?.id) redirect(`/app/account/login?next=${encodeURIComponent(`/app/events/${encodeURIComponent(eventId)}/people`)}`);
  return <EventPeopleScreen eventId={eventId} language={language} />;
}
