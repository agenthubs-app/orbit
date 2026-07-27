import { redirect } from "next/navigation";

import { auth } from "../../../../auth";
import { resolveAgentLedgerForServerPage } from "../../../api/_shared/agent-request-context";
import type { AppTodayMergedSearchParams } from "./compose-app-today-from-agent-ledger/today-merged-view-model";
import AppTodayPageContent from "./today-page-content";

export const dynamic = "force-dynamic";

export default async function AppTodayPage({
  searchParams,
}: {
  searchParams?: Promise<AppTodayMergedSearchParams>;
} = {}) {
  const session = await auth();
  const actorId = session?.user?.id;
  if (!actorId) {
    redirect("/app/account/login?next=%2Fapp%2Ftoday");
  }

  const ledgerService = await resolveAgentLedgerForServerPage(undefined, {
    authenticate: async () => session,
  });

  return AppTodayPageContent({
    actorId,
    ledgerService,
    searchParams,
  });
}
