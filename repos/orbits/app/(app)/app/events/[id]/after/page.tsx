/** R27 会後のふりかえり（events DESIGN §2.7）：要登录；数据在客户端读 GET /api/events/[id]/after；✓ 的行才 POST /after/confirm。 */
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { AfterPage } from "../../../orbit-2026/events/AfterPage";

export const dynamic = "force-dynamic";

export default async function AppEventAfterPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, language] = await Promise.all([params, getOrbitServerLanguage()]);
  return <AfterPage eventId={decodeURIComponent(id)} language={language} />;
}
