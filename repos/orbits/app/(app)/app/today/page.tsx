import { redirect } from "next/navigation";

import { auth } from "../../../../auth";
import { resolveAgentLedgerForServerPage } from "../../../api/_shared/agent-request-context";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import type { AppTodayMergedSearchParams } from "./compose-app-today-from-agent-ledger/today-merged-view-model";
import AppTodayPageContent from "./today-page-content";

export const dynamic = "force-dynamic";

export default async function AppTodayPage({
  searchParams,
}: {
  searchParams?: Promise<AppTodayMergedSearchParams>;
} = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Ftoday");
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }

  const ledgerService = await resolveAgentLedgerForServerPage(undefined, {
    authenticate: async () => session,
  });

  return AppTodayPageContent({
    actorId: actor.id,
    ledgerService,
    searchParams,
  });
}
