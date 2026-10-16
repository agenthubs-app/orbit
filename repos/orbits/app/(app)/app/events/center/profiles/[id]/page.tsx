/** R17 主催者ページ（选中一份）：同 /app/events/center/profiles，左栏选中 [id]。 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { getOrbitServerLanguage } from "../../../../orbit-language-server";
import { HostProfiles } from "../../../../orbit-2026/host/HostProfiles";

export const dynamic = "force-dynamic";

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function HostProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session, language] = await Promise.all([params, auth(), getOrbitServerLanguage()]);
  const profileId = decode(id);
  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(`/app/events/center/profiles/${encodeURIComponent(profileId)}`)}`);
  }
  return <HostProfiles language={language} profileId={profileId} />;
}
