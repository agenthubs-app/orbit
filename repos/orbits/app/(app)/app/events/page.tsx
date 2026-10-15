/**
 * イベント一级页（events DESIGN §2.1 / §2.2 / §7）。
 * - 已登录：評価 / 参加予定 / 探す 三个页签（R26 EventsScreen，探す = R27 DiscoverTab）。
 * - 未登录（R26-08）：公开活动列表（b1 公开顶栏，「すべて」一组、没有分数），评估与参加予定要登录。
 * 「今」由服务端给（designFixtureNow 只在本机示例时生效），首帧与客户端一致（SC-R26-12，无水合警告）。
 */
import { auth } from "../../../../auth";
import { designFixtureNow } from "../../../../features/events/dev-clock";
import { getOrbitServerLanguage } from "../orbit-language-server";
import { EventsScreen } from "../orbit-2026/events/EventsScreen";
import { PublicEventList } from "../orbit-2026/events/PublicEvents";

export const dynamic = "force-dynamic";

export default async function AppEventsPage() {
  const [session, language] = await Promise.all([auth(), getOrbitServerLanguage()]);
  const nowIso = designFixtureNow() ?? new Date().toISOString();
  if (!session?.user?.id) return <PublicEventList language={language} nowIso={nowIso} />;
  return <EventsScreen language={language} nowIso={nowIso} />;
}
