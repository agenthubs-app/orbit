/**
 * R27 参加コード着地页 `/app/register/〈コード〉`（b12 #376，§30）。未登录 = 公开详情 + 参加コード卡（登录 / 注册后回到这里）；
 * 已登录 = 直接进参加登録。码找不到 = 公开活动列表上的提示。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import { PublicEventDetail, PublicInviteInvalid } from "../../orbit-2026/events/PublicEvents";

export const dynamic = "force-dynamic";

export default async function AppRegisterCodePage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, session, language] = await Promise.all([params, auth(), getOrbitServerLanguage()]);
  const inviteCode = decodeURIComponent(code).trim().toUpperCase();
  // 动态导入：查码走活动服务（示例模式时是 mock 服务），不把它静态带进页面模块图。
  const { resolveEventCode } = await import("../../../../../features/events/journey/handlers");
  const eventId = await resolveEventCode(inviteCode);
  if (!eventId) return <PublicInviteInvalid language={language} />;
  if (session?.user?.id) redirect(`/app/events/${encodeURIComponent(eventId)}/register`);
  return <PublicEventDetail eventId={eventId} language={language} inviteCode={inviteCode} />;
}
