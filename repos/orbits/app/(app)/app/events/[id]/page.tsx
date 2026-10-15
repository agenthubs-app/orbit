/**
 * R27 イベント詳細（events DESIGN §2.3）。已登录 = 新详情（壳内、右栏会えそうな人）；未登录 = 公开详情（公开顶栏，R26-08）。
 * 数据都在客户端读 GET /api/events/[id]/overview（规则评估，不调 AI）。
 */
import { auth } from "../../../../../auth";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import { EventDetailScreen } from "../../orbit-2026/events/EventDetail";
import { PublicEventDetail } from "../../orbit-2026/events/PublicEvents";

export const dynamic = "force-dynamic";

export default async function AppEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session, language] = await Promise.all([params, auth(), getOrbitServerLanguage()]);
  const eventId = decodeURIComponent(id);
  if (!session?.user?.id) return <PublicEventDetail eventId={eventId} language={language} />;
  return <EventDetailScreen eventId={eventId} language={language} />;
}
