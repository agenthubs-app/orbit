import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { loadContactsAnalysis } from "../analysis/contacts-analysis-route-service";
import { ContactsAnalysisWorkspace } from "../analysis/contacts-analysis-workspace";

export default async function AppContactsDashboardPage({ searchParams }: {
  searchParams?: Promise<{ tab?: string | string[] }>;
} = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fcontacts%2Fdashboard");
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }

  const [language, params] = await Promise.all([
    getOrbitServerLanguage(),
    searchParams,
  ]);
  const view = await loadContactsAnalysis(actor.id, language);
  const tab = params?.tab === "structure" || params?.tab === "opportunities" ? params.tab : "overview";

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <ContactsAnalysisWorkspace initialView={view} initialTab={tab} />
    </>
  );
}
