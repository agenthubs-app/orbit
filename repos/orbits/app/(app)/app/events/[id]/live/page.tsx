/**
 * R27 会場モード（events DESIGN §2.6）：要登录（app-auth-routing）；数据在客户端读 GET /api/events/[id]/venue（只读组合，
 * 服务端时钟算好的状态，页面不取 new Date()）。390 宽显示「会場モードは App で」（§10 A7）。
 */
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { VenuePage } from "../../../orbit-2026/events/VenuePage";

export const dynamic = "force-dynamic";

export default async function AppEventLivePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, language] = await Promise.all([params, getOrbitServerLanguage()]);
  return <VenuePage eventId={decodeURIComponent(id)} language={language} />;
}
