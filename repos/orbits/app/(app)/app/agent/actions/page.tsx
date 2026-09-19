import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveAgentLedgerForServerPage } from "../../../../api/_shared/agent-request-context";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import type { OrbitLanguage } from "../../orbit-language-core";
import { AccountTopNav } from "../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitAgentActions } from "./orbit-agent-actions";
import {
  loadAgentActionsRouteViewModel,
  type AgentActionsSearchParams,
} from "./actions-route-view-model";

export const dynamic = "force-dynamic";

// renderToStaticMarkup(await Page()) 在测试里没有真实请求作用域，
// next/headers 会抛错——沿用 today/schedule 页同款回退。
async function getActionsPageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return "zh";
    }
    throw error;
  }
}

export default async function AgentActionsPage({
  searchParams,
}: {
  searchParams?: Promise<AgentActionsSearchParams>;
} = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fagent%2Factions");
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
  const viewModel = await loadAgentActionsRouteViewModel(
    await searchParams,
    { ledgerService },
  );
  const language = await getActionsPageLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <AccountTopNav active="agent" />
      <OrbitAgentActions language={language} viewModel={viewModel} />
    </>
  );
}
