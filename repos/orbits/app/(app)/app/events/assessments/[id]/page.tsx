// R26 評価結果 (events DESIGN §7): 1440 = the イベント page with this assessment in the right rail (web.html #12);
// 1024 = its own page (b8 #4); 390 = full screen (b8 #5). Signed-in only (`/app/**`).
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { EventsScreen } from "../../../orbit-2026/events/EventsScreen";
import { designFixtureNow } from "../../../../../../features/events/dev-clock";

export const dynamic = "force-dynamic";

export default async function EventAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, language] = await Promise.all([params, getOrbitServerLanguage()]);
  return <EventsScreen language={language} initialAssessmentId={decodeURIComponent(id)} nowIso={designFixtureNow() ?? new Date().toISOString()} />;
}
