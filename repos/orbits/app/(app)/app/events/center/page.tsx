/** R17 運営センター（host DESIGN §2.1）：要登录；数据在客户端读 GET /api/host/center。 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import { HostCenter } from "../../orbit-2026/host/HostCenter";

export const dynamic = "force-dynamic";

export default async function EventCenterPage() {
  const [session, language] = await Promise.all([auth(), getOrbitServerLanguage()]);
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fevents%2Fcenter");
  }
  return <HostCenter language={language} />;
}
