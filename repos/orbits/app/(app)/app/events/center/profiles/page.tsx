/** R17 主催者ページ 一覧と編集（host DESIGN §2.11；b12 #412）：要登录；读写都在客户端（/api/host/organizer-profiles）。 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { getOrbitServerLanguage } from "../../../orbit-language-server";
import { HostProfiles } from "../../../orbit-2026/host/HostProfiles";

export const dynamic = "force-dynamic";

export default async function HostProfilesPage() {
  const [session, language] = await Promise.all([auth(), getOrbitServerLanguage()]);
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fevents%2Fcenter%2Fprofiles");
  }
  return <HostProfiles language={language} />;
}
