/** R17 建活动（host DESIGN §2.2；b12 #396）：要登录；读资料 / 写草稿都在客户端（POST /api/host/events）。`?from=template` 显示模板。 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { HostEventForm } from "../../../orbit-2026/host/HostEventForm";

export const dynamic = "force-dynamic";

export default async function HostEventCreatePage() {
  const [session, language] = await Promise.all([auth(), getOrbitServerLanguage()]);
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fevents%2Fcenter%2Fnew");
  }
  return <HostEventForm mode="create" language={language} />;
}
