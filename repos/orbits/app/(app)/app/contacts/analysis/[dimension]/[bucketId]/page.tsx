import { redirect } from "next/navigation";
import { auth } from "../../../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../../../api/_shared/authenticated-actor";
import { getOrbitServerLanguage } from "../../../../orbit-language-server";
import { AccountTopNav } from "../../../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../../../orbit-visual-freeze-runtime";
import { loadContactsStructureDetail } from "../../contacts-structure-route-service";
import { ContactsStructureDetail } from "../../contacts-structure-detail";
import { NetworkShell } from "../../../network-0918/network-shell";

export default async function AppContactsStructureDetailPage({ params }: { params: Promise<{ dimension: string; bucketId: string }> }) {
  const { dimension, bucketId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    const next = `/app/contacts/analysis/${encodeURIComponent(dimension)}/${encodeURIComponent(bucketId)}`;
    redirect(`/app/account/login?next=${encodeURIComponent(next)}`);
  }
  const actor = await resolveAuthenticatedApiActorFromSession({ email: session.user.email, name: session.user.name, userId: session.user.id });
  if (!actor) throw new Error("Authenticated Orbit account membership is unavailable.");
  const view = await loadContactsStructureDetail({ actorId: actor.id, dimension, bucketId, language: await getOrbitServerLanguage() });
  // 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。
  return <><OrbitReferenceStyles /><OrbitVisualFreezeRuntime /><div data-orbit-real-page="network" data-orbit-route="app-contacts-structure-detail-route"><AccountTopNav active="cards" /><NetworkShell screen="analysis"><ContactsStructureDetail view={view} /></NetworkShell></div></>;
}
