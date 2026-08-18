/**
 * Agent 页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable Orbit AI 聊天入口挂到 `/app/agent`。
 * 数据仍走 live 的 chat route view model；视觉组件采用统一后的 OrbitRealAgent。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import type { OrbitLanguage } from "../orbit-language-core";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { StateView } from "../../../../shared/ui/state-view";
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import {
  loadAppChatRouteViewModel,
  type AppChatRouteStateViewModel,
  type AppChatSearchParams,
} from "../chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";
import { composeOrbitAgentEntryViewModel } from "../chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter";
import { OrbitRealAgent } from "./orbit-real-agent";
import { loadAppHomeRouteViewModel } from "../home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import { presentOrbitEvents } from "../orbit-event-presentation";
import { readRuntimeEventRegistrationStates } from "../../../../features/events/registration/runtime";
import { resolveConfiguredActorEventCanonicalIds } from "../canonical-event-detail-view";

export type AppAgentSearchParams = AppChatSearchParams & {
  lang?: string | string[];
  q?: string | string[];
};

async function getAgentPageLanguage(): Promise<OrbitLanguage> {
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

function AgentRouteStateBoundary({
  routeState,
}: {
  routeState: AppChatRouteStateViewModel;
}) {
  return (
    <main
      className="orbit-page"
      data-orbit-route="app-agent-route-state"
      style={{ background: "var(--bg)", minHeight: "100dvh", padding: 24 }}
    >
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow="Orbit AI"
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={[
          {
            href: "/app/agent",
            id: "agent-recovery-reload",
            label: "Reload Orbit AI",
            recoveryCopy: routeState.copy.nextStep,
          },
          {
            href: "/app/chat",
            id: "agent-recovery-chat",
            label: "Open chat workspace",
            recoveryCopy:
              "Use the Chat workspace to review conversation records and privacy controls directly.",
          },
        ]}
        title={routeState.copy.title}
      />
    </main>
  );
}

function firstSearchParam(
  searchParams: AppAgentSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];
  const first = Array.isArray(value) ? value[0] : value;

  return typeof first === "string" && first.trim() ? first.trim() : null;
}

function languageSearchParam(
  searchParams: AppAgentSearchParams | undefined,
): OrbitLanguage | null {
  const value = firstSearchParam(searchParams, "lang");

  return value === "en" || value === "zh" ? value : null;
}

export default async function AppAgentPage({
  searchParams,
}: {
  searchParams?: Promise<AppAgentSearchParams>;
} = {}) {
  const session = await auth();
  const actorId = session?.user?.id;
  if (!actorId) {
    redirect("/app/account/login?next=%2Fapp%2Fagent");
  }

  const resolvedSearchParams = await searchParams;
  const requestedLanguage = languageSearchParam(resolvedSearchParams);
  const routeModel = await loadAppChatRouteViewModel(resolvedSearchParams, {
    actorId,
  });
  // iOrbit 工作台首屏（dashboard）与旧 /app/home 同源的数据：账户、统计、活动旅程。
  const homeModel = await loadAppHomeRouteViewModel(undefined, {
    displayName:
      session?.user?.name?.trim() ||
      session?.user?.email?.trim() ||
      "Orbit member",
    email: session?.user?.email,
    id: actorId,
  });
  const registrationEventIds =
    homeModel.state === "success"
      ? homeModel.home.events.map((event) => event.id)
      : [];
  const canonicalEventIdsByRouteId = await resolveConfiguredActorEventCanonicalIds({
    actorId,
    eventIds: registrationEventIds,
  });
  const canonicalRegistrationStates = await readRuntimeEventRegistrationStates({
    eventIds: registrationEventIds.map(
      (routeId) => canonicalEventIdsByRouteId[routeId] ?? routeId,
    ),
    userId: actorId,
  });
  const registrationStates = Object.fromEntries(
    registrationEventIds.map((routeId) => {
      const canonicalId = canonicalEventIdsByRouteId[routeId] ?? routeId;
      return [
        routeId,
        canonicalRegistrationStates[canonicalId] ?? {
          availability: "unavailable" as const,
          registered: false,
        },
      ];
    }),
  );
  const entryModel = composeOrbitAgentEntryViewModel(routeModel);
  const language =
    entryModel.state === "ready"
      ? requestedLanguage ?? (await getAgentPageLanguage())
      : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {entryModel.state === "ready" ? (
        <div data-orbit-route="app-agent-route">
          <OrbitRealAgent
            registrationAvailabilityByEventId={Object.fromEntries(
              Object.entries(registrationStates).map(([eventId, state]) => [
                eventId,
                state.availability,
              ]),
            )}
            home={
              homeModel.state === "success"
                ? localizeOrbitTree(
                    {
                      ...homeModel.home,
                      events: presentOrbitEvents(
                        homeModel.home.events.map((event) => {
                          const registered =
                            registrationStates[event.id]?.registered ?? false;
                          return {
                            ...event,
                            stats: {
                              ...event.stats,
                              youRsvped: registered,
                            },
                            youRsvped: registered,
                          };
                        }),
                        language,
                      ),
                    },
                    language,
                  )
                : null
            }
            viewModel={localizeOrbitTree(
              entryModel.viewModel,
              language,
            )}
          />
        </div>
      ) : (
        <AgentRouteStateBoundary routeState={entryModel.routeState} />
      )}
    </>
  );
}
