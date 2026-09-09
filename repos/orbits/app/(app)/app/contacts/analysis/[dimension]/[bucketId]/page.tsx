import { redirect } from "next/navigation";
import { auth } from "../../../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../../../api/_shared/authenticated-actor";
import { getOrbitServerLanguage } from "../../../../orbit-language-server";
import { OrbitReferenceStyles } from "../../../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../../../orbit-visual-freeze-runtime";
import { loadContactsStructureDetail } from "../../contacts-structure-route-service";
import { ContactsStructureDetail } from "../../contacts-structure-detail";
import { ContactsAnalysisShell } from "../../contacts-analysis-workspace";

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
  return <><OrbitReferenceStyles /><OrbitVisualFreezeRuntime /><ContactsAnalysisShell count={view.state === "ready" ? view.total : undefined}><ContactsStructureDetail view={view} /></ContactsAnalysisShell></>;
}
