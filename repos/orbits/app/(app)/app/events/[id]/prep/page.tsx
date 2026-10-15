/** R27 会う準備（events DESIGN §2.5）：要登录；数据在客户端读 GET /api/events/[id]/prep（规则，不调 AI）。 */
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { PrepPage } from "../../../orbit-2026/events/PrepPage";

export const dynamic = "force-dynamic";

export default async function AppEventPrepPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, language] = await Promise.all([params, getOrbitServerLanguage()]);
  return <PrepPage eventId={decodeURIComponent(id)} language={language} />;
}
