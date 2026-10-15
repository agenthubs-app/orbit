/** R27 参加登録（events DESIGN §2.4）：要登录；问题 / 资料 / 提交走 /api/events/[id]/join/*（现有 AI 访谈与报名的门面）。 */
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { RegisterFlow } from "../../../orbit-2026/events/RegisterFlow";

export const dynamic = "force-dynamic";

export default async function AppEventRegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, language] = await Promise.all([params, getOrbitServerLanguage()]);
  return <RegisterFlow eventId={decodeURIComponent(id)} language={language} />;
}
