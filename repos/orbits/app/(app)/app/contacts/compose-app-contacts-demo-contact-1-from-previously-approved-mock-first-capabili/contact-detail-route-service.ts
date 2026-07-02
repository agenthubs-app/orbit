/**
 * 联系人详情页的 route-level 聚合服务。
 *
 * 这个文件把联系人详情、关系证据和关系价值评分三个 capability service
 * 组合成页面需要的单一 view model。它不直接读写数据库；即使用户触发
 * `prepare-follow-up`，也只生成本地草稿和证据结果，不发送消息或执行外部动作。
 */
import { createLiveRelationshipValueScoringService } from "../../../../../features/analysis/live-value-service";
import { createRelationshipValueScoringService } from "../../../../../features/analysis/service-factory";
import type { LiveRelationshipValueProvider } from "../../../../../features/analysis/storage/relationship-value-live-record-provider";
import type {
  RelationshipValueAssessment,
  RelationshipValuePayload,
  RelationshipValueResult,
  RelationshipValueScoringService,
  RelationshipValueServiceResult,
} from "../../../../../features/analysis/value-contract";
import { createLiveConnectionEvidenceService } from "../../../../../features/connections/live-service";
import { createConnectionEvidenceService } from "../../../../../features/connections/service-factory";
import type { LiveConnectionEvidenceProvider } from "../../../../../features/connections/live-service";
import type { LiveConnectionEvidenceGraph } from "../../../../../features/connections/storage/connection-live-record-provider";
import type {
  ConnectionEvidenceDetailPayload,
  ConnectionEvidenceListPayload,
  ConnectionEvidenceTimelineItem,
  ConnectionRecord,
} from "../../../../../features/connections/contract";
import type {
  ConnectionEvidenceService,
  ConnectionEvidenceServiceResult,
} from "../../../../../features/connections/service";
import { createLiveContactDetailTagStatusService } from "../../../../../features/contacts/live-detail-service";
import type { LiveContactsGraphProvider } from "../../../../../features/contacts/live-service";
import { createContactDetailTagStatusService } from "../../../../../features/contacts/service-factory";
import { createConfiguredStorageContactGraphProvider } from "../../../../../features/contacts/storage/contact-live-record-provider";
import type {
  ContactDetail,
  ContactDetailTagStatusPayload,
  ContactDetailTagStatusResult,
  ContactDetailTagStatusService,
  ContactDetailTagStatusServiceResult,
} from "../../../../../features/contacts/detail-contract";
import type { LocalRemoteContactGraph } from "../../../../../features/contacts/contacts-list-search-and-filter-mock/providers/contact-local-remote-provider";
import {
  createModuleServiceFactory,
  resolveModuleMode,
  type ModuleMode,
} from "../../../../../shared/services/module-mode";

export const APP_CONTACT_DETAIL_CONTACT_ID = "demo-contact-1";
export const APP_CONTACT_DETAIL_CONNECTION_ID = "demo-connection-1";

export type AppContactDetailRouteScenario = "empty" | "pending" | "failure";
export type AppContactDetailRouteAction = "prepare-follow-up";
export type AppContactDetailRouteState =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export interface AppContactDetailRouteInput {
  action?: string | null;
  contactId: string;
  liveContactGraphProvider?: LiveContactsGraphProvider | null;
  mode?: ModuleMode | string;
  scenario?: string | null;
}

export interface AppContactDetailLocalActionResult {
  databaseQueryExecuted: false;
  evidenceId: string;
  excerpt: string;
  draftBody: string;
  draftSubject: string;
  notificationDelivered: false;
  productionAuditLogWriteExecuted: false;
  databaseWriteExecuted: false;
  externalNetworkRequested: false;
  localNextStep: string;
  messageSent: false;
  searchIndexReadExecuted: false;
  sideEffectsLabel: "none";
  title: string;
}

export interface AppContactDetailSuccessModel {
  actionResult: AppContactDetailLocalActionResult | null;
  assessment: RelationshipValueAssessment;
  contact: ContactDetail;
  contactPayload: ContactDetailTagStatusPayload;
  connection: ConnectionRecord;
  connectionPayload: ConnectionEvidenceDetailPayload;
  evidenceTimeline: readonly ConnectionEvidenceTimelineItem[];
  routeState: "success";
  valuePayload: RelationshipValuePayload;
}

export interface AppContactDetailBoundaryModel {
  description: string;
  evidence: readonly string[];
  nextStep: string;
  recoveryActions: readonly {
    href: string;
    label: string;
  }[];
  routeState: Exclude<AppContactDetailRouteState, "success">;
  title: string;
}

export type AppContactDetailRouteModel =
  | AppContactDetailSuccessModel
  | AppContactDetailBoundaryModel;

interface AppContactDetailRouteServices {
  connectionEvidence: ConnectionEvidenceService;
  contactDetail: ContactDetailTagStatusService;
  relationshipValue: RelationshipValueScoringService;
}

const contactDetailServiceFactory =
  // route 通过 module factory 获取 service，后续可切换 mock/hybrid/live，而页面不用改。
  createModuleServiceFactory<ContactDetailTagStatusService>({
    capabilityId: "app-contacts-demo-contact-1.contact-detail",
    implementations: {
      hybrid: ({ requestedMode }) =>
        createContactDetailTagStatusService(requestedMode),
      live: ({ requestedMode }) => createContactDetailTagStatusService(requestedMode),
      mock: ({ requestedMode }) => createContactDetailTagStatusService(requestedMode),
    },
  });

const connectionEvidenceServiceFactory =
  createModuleServiceFactory<ConnectionEvidenceService>({
    capabilityId: "app-contacts-demo-contact-1.connection-evidence",
    implementations: {
      hybrid: ({ requestedMode }) => createConnectionEvidenceService(requestedMode),
      live: ({ requestedMode }) => createConnectionEvidenceService(requestedMode),
      mock: ({ requestedMode }) => createConnectionEvidenceService(requestedMode),
    },
  });

const relationshipValueServiceFactory =
  createModuleServiceFactory<RelationshipValueScoringService>({
    capabilityId: "app-contacts-demo-contact-1.relationship-value",
    implementations: {
      hybrid: ({ requestedMode }) =>
        createRelationshipValueScoringService(requestedMode),
      live: ({ requestedMode }) =>
        createRelationshipValueScoringService(requestedMode),
      mock: ({ requestedMode }) =>
        createRelationshipValueScoringService(requestedMode),
    },
  });

const routeBoundaryCopy = {
  // 三种非成功状态统一在这里维护文案和恢复动作，避免页面组件硬编码错误处理。
  empty: {
    description:
      "Choose a contact with source evidence before reviewing tags, status, connection context, or relationship value.",
    evidence: ["contact-detail-empty", "connection-evidence-empty"],
    nextStep: "Return to the sourced contacts list and select a relationship with evidence.",
    recoveryActions: [
      {
        href: "/app/contacts",
        label: "Return to contacts list",
      },
      {
        href: "/app/contacts/demo-contact-1",
        label: "Open Kenji detail",
      },
    ],
    title: "No contact detail is available",
  },
  failure: {
    description:
      "The local relationship detail boundary returned a controlled failure.",
    evidence: ["contact-detail-failure", "connection-evidence-failure"],
    nextStep:
      "Retry the detail view after confirming the local capability boundary is available.",
    recoveryActions: [
      {
        href: "/app/contacts/demo-contact-1",
        label: "Retry contact detail",
      },
      {
        href: "/app/contacts",
        label: "Return to contacts list",
      },
    ],
    title: "Contact detail could not load",
  },
  pending: {
    description:
      "Orbit is waiting for local source evidence before exposing this relationship profile.",
    evidence: ["contact-detail-pending", "connection-evidence-pending"],
    nextStep: "Check the current detail once source evidence has settled.",
    recoveryActions: [
      {
        href: "/app/contacts/demo-contact-1",
        label: "Check current detail",
      },
      {
        href: "/app/contacts",
        label: "Return to contacts list",
      },
    ],
    title: "Contact detail is loading",
  },
} as const satisfies Record<
  Exclude<AppContactDetailRouteState, "success">,
  Omit<AppContactDetailBoundaryModel, "routeState">
>;

function normalizeScenario(
  scenario?: string | null,
): AppContactDetailRouteScenario | null {
  // 只允许 route 明确支持的 scenario 进入下游 capability service。
  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function normalizeAction(action?: string | null): AppContactDetailRouteAction | null {
  // 历史 query 名称 `stage-local-review` 也映射到同一个本地 follow-up 准备动作。
  if (action === "prepare-follow-up" || action === "stage-local-review") {
    return "prepare-follow-up";
  }

  return null;
}

function createBoundaryModel(
  routeState: Exclude<AppContactDetailRouteState, "success">,
  evidence: readonly string[] = routeBoundaryCopy[routeState].evidence,
): AppContactDetailBoundaryModel {
  return {
    ...routeBoundaryCopy[routeState],
    evidence,
    routeState,
  };
}

function resolveRouteServices(
  mode?: ModuleMode | string,
): AppContactDetailRouteServices | AppContactDetailBoundaryModel {
  // 任一 capability factory 无法解析时，整条 route 进入 failure boundary。
  const contactDetail = contactDetailServiceFactory.create(mode);

  if (contactDetail.success === false) {
    return createBoundaryModel("failure", [contactDetail.error.code]);
  }

  const connectionEvidence = connectionEvidenceServiceFactory.create(mode);

  if (connectionEvidence.success === false) {
    return createBoundaryModel("failure", [connectionEvidence.error.code]);
  }

  const relationshipValue = relationshipValueServiceFactory.create(mode);

  if (relationshipValue.success === false) {
    return createBoundaryModel("failure", [relationshipValue.error.code]);
  }

  return {
    connectionEvidence: connectionEvidence.service,
    contactDetail: contactDetail.service,
    relationshipValue: relationshipValue.service,
  };
}

function isBoundaryModel(
  value: AppContactDetailRouteServices | AppContactDetailBoundaryModel,
): value is AppContactDetailBoundaryModel {
  return "routeState" in value;
}

function collectRouteEvidenceIds(
  contactPayload: ContactDetailTagStatusPayload,
  connectionPayload: ConnectionEvidenceDetailPayload,
  valuePayload: RelationshipValuePayload,
): string[] {
  // 页面顶部只需要一组合并后的 evidence id，重复证据在这里去重。
  return Array.from(
    new Set([
      ...contactPayload.provenance.evidenceIds,
      ...connectionPayload.provenance.evidenceIds,
      ...valuePayload.provenance.evidenceIds,
    ]),
  );
}

function connectionIdForContact(
  connectionsPayload: ConnectionEvidenceListPayload,
  contactId: string,
): string | null {
  return (
    connectionsPayload.connections.find(
      (connection) => connection.contactId === contactId,
    )?.id ?? (contactId === APP_CONTACT_DETAIL_CONTACT_ID
      ? APP_CONTACT_DETAIL_CONNECTION_ID
      : null)
  );
}

async function buildLocalActionResult(
  connectionEvidence: ConnectionEvidenceService,
  connectionId: string,
): Promise<AppContactDetailLocalActionResult | null> {
  // 本地 action 只向 mock connection evidence 追加一条可复核证据。
  // 返回的 actionResult 明确标记无数据库查询、无写入、无通知、无消息发送。
  const result = await connectionEvidence.addEvidence({
    connectionId,
    contribution: "follow_up_signal",
    occurredAt: "2026-06-25T19:20:00.000Z",
    sourceLabel: "Operator follow-up note",
    sourceType: "manual",
    title: "Operator confirmed warm introduction path",
    excerpt:
      "Kenji wants the storage pilot operator intro before the partner review call.",
  });

  if (result.success === false) {
    return null;
  }

  const addedEvidence = result.data.evidenceTimeline[
    result.data.evidenceTimeline.length - 1
  ];
  const connection = result.data.connection;

  if (!addedEvidence || !connection) {
    return null;
  }

  return {
    databaseQueryExecuted: false,
    evidenceId: addedEvidence.evidenceId,
    excerpt: addedEvidence.excerpt,
    draftBody:
      "Kenji, I can introduce you to the operator team that validated the storage pilot path after the climate founders dinner. I will keep the context tied to the partner review call and wait for your confirmation before anything leaves Orbit.",
    draftSubject: "Warm intro for storage pilot operators",
    notificationDelivered: false,
    productionAuditLogWriteExecuted: false,
    databaseWriteExecuted: false,
    externalNetworkRequested: false,
    localNextStep:
      "Choose where to stage this draft. Orbit keeps it local and does not send, notify, write, query, or sync.",
    messageSent: false,
    searchIndexReadExecuted: false,
    sideEffectsLabel: "none",
    title: addedEvidence.title,
  };
}

function routeStateForPayloads(
  contactPayload: ContactDetailTagStatusPayload,
  connectionPayload: ConnectionEvidenceDetailPayload,
  valuePayload: RelationshipValuePayload,
): Exclude<AppContactDetailRouteState, "success"> | null {
  // 任一组成 payload 还在 pending，就让整个 route 展示 pending 边界。
  if (
    contactPayload.state === "pending" ||
    connectionPayload.state === "pending" ||
    valuePayload.state === "pending"
  ) {
    return "pending";
  }

  if (!contactPayload.contact || !connectionPayload.connection || !valuePayload.assessment) {
    return "empty";
  }

  return null;
}

function contactProviderForGraph(input: {
  graph: LocalRemoteContactGraph;
  provider: LiveContactsGraphProvider;
}): LiveContactsGraphProvider {
  return {
    source: input.provider.source,
    sourceLabel: input.provider.sourceLabel,
    readContactGraph: () => input.graph,
    readContactGraphForContact: () => input.graph,
    readContactGraphForList: () => input.graph,
  };
}

function connectionProviderForGraph(input: {
  graph: LiveConnectionEvidenceGraph;
  provider: LiveContactsGraphProvider;
}): LiveConnectionEvidenceProvider {
  return {
    source: input.provider.source.replace(":contacts:", ":connections:"),
    sourceLabel: input.provider.sourceLabel,
    readConnectionEvidenceGraph: () => input.graph,
    readConnectionEvidenceGraphForConnection: () => input.graph,
  };
}

function relationshipValueProviderForGraph(input: {
  graph: LiveConnectionEvidenceGraph;
  provider: LiveContactsGraphProvider;
}): LiveRelationshipValueProvider {
  return {
    source: input.provider.source.replace(":contacts:", ":relationship-value:"),
    sourceLabel: input.provider.sourceLabel,
    readRelationshipGraph: () => input.graph,
    readRelationshipGraphForConnection: () => input.graph,
  };
}

async function resolveLiveRouteServicesFromGraph(input: {
  contactId: string;
  provider: LiveContactsGraphProvider;
}): Promise<AppContactDetailRouteServices> {
  const graph = input.provider.readContactGraphForContact
    ? await input.provider.readContactGraphForContact(input.contactId.trim())
    : await input.provider.readContactGraph();
  const contactProvider = contactProviderForGraph({
    graph,
    provider: input.provider,
  });
  const connectionProvider = connectionProviderForGraph({
    graph,
    provider: input.provider,
  });
  const relationshipValueProvider = relationshipValueProviderForGraph({
    graph,
    provider: input.provider,
  });

  return {
    contactDetail: createLiveContactDetailTagStatusService({
      provider: contactProvider,
    }),
    connectionEvidence: createLiveConnectionEvidenceService({
      provider: connectionProvider,
    }),
    relationshipValue: createLiveRelationshipValueScoringService({
      provider: relationshipValueProvider,
    }),
  };
}

async function loadComposedContactDetailRoute(input: {
  action?: string | null;
  contactId: string;
  scenario?: string | null;
  services: AppContactDetailRouteServices;
}): Promise<AppContactDetailRouteModel> {
  const routeScenario = normalizeScenario(input.scenario);
  const contactResult = await input.services.contactDetail.getContactDetail({
    contactId: input.contactId,
    scenario: routeScenario,
  });
  const connectionListResult = await input.services.connectionEvidence.listConnections({
    scenario: routeScenario,
  });
  const connectionId =
    connectionListResult.success === true
      ? connectionIdForContact(connectionListResult.data, input.contactId)
      : APP_CONTACT_DETAIL_CONNECTION_ID;
  const connectionResult = await input.services.connectionEvidence.getConnection({
    connectionId: connectionId ?? APP_CONTACT_DETAIL_CONNECTION_ID,
    scenario: routeScenario,
  });
  const valueResult = await input.services.relationshipValue.getRelationshipValue({
    connectionId: connectionId ?? APP_CONTACT_DETAIL_CONNECTION_ID,
    scenario: routeScenario,
  });

  if (
    contactResult.success === false ||
    connectionListResult.success === false ||
    connectionId === null ||
    connectionResult.success === false ||
    valueResult.success === false
  ) {
    const evidence = [
      ...(contactResult.success === false ? contactResult.error.evidenceIds : []),
      ...(connectionListResult.success === false
        ? connectionListResult.error.evidenceIds
        : []),
      ...(connectionId === null ? ["contact-detail-no-live-connection"] : []),
      ...(connectionResult.success === false
        ? connectionResult.error.evidenceIds
        : []),
      ...(valueResult.success === false ? valueResult.error.evidenceIds : []),
    ];

    return createBoundaryModel("failure", evidence);
  }

  const routeState = routeStateForPayloads(
    contactResult.data,
    connectionResult.data,
    valueResult.data,
  );

  if (routeState) {
    return createBoundaryModel(
      routeState,
      collectRouteEvidenceIds(contactResult.data, connectionResult.data, valueResult.data),
    );
  }

  return {
    actionResult:
      normalizeAction(input.action) === "prepare-follow-up"
        ? await buildLocalActionResult(input.services.connectionEvidence, connectionId)
        : null,
    assessment: valueResult.data.assessment,
    contact: contactResult.data.contact,
    contactPayload: contactResult.data,
    connection: connectionResult.data.connection,
    connectionPayload: connectionResult.data,
    evidenceTimeline: connectionResult.data.evidenceTimeline,
    routeState: "success",
    valuePayload: valueResult.data,
  };
}

async function loadLiveAppContactDetailRoute(input: {
  action?: string | null;
  contactId: string;
  liveContactGraphProvider?: LiveContactsGraphProvider | null;
  scenario?: string | null;
}): Promise<AppContactDetailRouteModel> {
  const provider =
    input.liveContactGraphProvider ?? createConfiguredStorageContactGraphProvider();

  if (!provider) {
    return createBoundaryModel("failure", [
      "CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED",
    ]);
  }

  const services = await resolveLiveRouteServicesFromGraph({
    contactId: input.contactId,
    provider,
  });

  return loadComposedContactDetailRoute({
    action: input.action,
    contactId: input.contactId,
    scenario: input.scenario,
    services,
  });
}

export async function loadAppContactDetailRoute({
  action,
  contactId,
  liveContactGraphProvider,
  mode,
  scenario,
}: AppContactDetailRouteInput): Promise<AppContactDetailRouteModel> {
  // 主入口：live 模式先读取一次 focused graph，再复用现有 live capability
  // mappers；mock/hybrid 继续走原有 service composition。
  if (resolveModuleMode(mode) === "live") {
    return loadLiveAppContactDetailRoute({
      action,
      contactId,
      liveContactGraphProvider,
      scenario,
    });
  }

  const services = resolveRouteServices(mode);

  if (isBoundaryModel(services)) {
    return services;
  }

  return loadComposedContactDetailRoute({
    action,
    contactId,
    scenario,
    services,
  });
}
