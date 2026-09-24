/**
 * 活动现场屏 route adapter（Orbit_0918，取代 /app/party*）。
 *
 * 只连接既有 party loader（`loadAppPartyRouteViewModel`）和 `EventLive`；
 * 现场交互逻辑不写在这里。`/app/events` 不在 ORBIT_PRIVATE_APP_PREFIXES，
 * 所以未登录由页面自行回跳登录页并带 next。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { createConfiguredEventCoreService } from "../../../../../../features/events/core/runtime";
import { StateView } from "../../../../../../shared/ui/state-view";
import { AccountTopNav } from "../../../orbit-account-shell";
import { normalizeOrbitLanguage, type OrbitLanguage } from "../../../orbit-language-core";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../../orbit-language-server";
import { OrbitReferenceStyles } from "../../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../../orbit-visual-freeze-runtime";
import { EventLive } from "../../events-0918/event-live";
import { liveReturnPath, liveTabFrom } from "../../events-0918/events-model";
import {
  loadAppPartyRouteViewModel,
  type AppPartyRouteStateViewModel,
} from "./compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model";

export type AppEventLivePageSearchParams = Record<string, string | string[] | undefined>;

function readSearchParam(searchParams: AppEventLivePageSearchParams | undefined, key: string): string | undefined {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function eventRouteId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function getEventLivePageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (error instanceof Error && error.message.includes("outside a request scope")) {
      return "zh";
    }
    throw error;
  }
}

/** 列表 / 详情以公开码寻址（`/app/events/SMALL-STAGING/live`）；现场 loader 只认 canonical event id。 */
async function canonicalEventIdFor(routeId: string): Promise<string> {
  const eventCore = createConfiguredEventCoreService();
  if (!eventCore) return routeId;
  try {
    return (await eventCore.getEvent(routeId))?.eventId ?? routeId;
  } catch {
    return routeId;
  }
}

function EventLiveRouteStateBoundary({ routeState }: { routeState: AppPartyRouteStateViewModel }) {
  return (
    <div data-orbit-route="app-event-live-route-state">
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow={routeState.copy.eyebrow}
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={routeState.recoveryActions.map((action) => ({
          id: action.id,
          label: action.label,
          recoveryCopy: action.recoveryCopy,
          href: action.href,
        }))}
        title={routeState.copy.title}
      />
    </div>
  );
}

export default async function AppEventLivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<AppEventLivePageSearchParams>;
}) {
  const [{ id: routeId }, query, session] = await Promise.all([params, searchParams, auth()]);
  const id = eventRouteId(routeId);

  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(liveReturnPath(id, query))}`);
  }

  const language = normalizeOrbitLanguage(readSearchParam(query, "language") ?? (await getEventLivePageLanguage()));
  const eventId = await canonicalEventIdFor(id);
  const routeModel = await loadAppPartyRouteViewModel({
    actor: {
      displayName: session.user.name?.trim() || session.user.email?.trim() || "Orbit member",
      email: session.user.email,
      id: session.user.id,
    },
    eventId,
    language,
    searchParams: query,
  });

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.state === "success" ? (
        // 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx）；登录页用 AccountTopNav。
        <div data-orbit-real-page="events-0918" data-orbit-route="app-event-live-page">
          <AccountTopNav active="events" />
          <EventLive
            initialTab={liveTabFrom(readSearchParam(query, "tab"))}
            now={new Date().toISOString()}
            viewModel={localizeOrbitTree(routeModel.party, language)}
          />
        </div>
      ) : (
        <EventLiveRouteStateBoundary routeState={routeModel.routeState} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
