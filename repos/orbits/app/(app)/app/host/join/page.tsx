/** R17 共同運営に参加 · 输码（host DESIGN §2.8；運営センター「共同運営に参加」）。未登录也能打开（不在登录前缀表里）。 */
import { resolveAuthenticatedApiActor } from "../../../../api/_shared/authenticated-actor";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import { HostJoin } from "../../orbit-2026/host/HostJoin";

export const dynamic = "force-dynamic";

export default async function HostJoinCodePage() {
  const [actor, language] = await Promise.all([resolveAuthenticatedApiActor().catch(() => null), getOrbitServerLanguage()]);
  return <HostJoin signedIn={Boolean(actor)} language={language} />;
}
