/**
 * 联系人详情页的 route-level 聚合服务。
 *
 * 这个文件把联系人详情、关系证据和关系价值评分三个 capability service
 * 组合成页面需要的单一只读 view model。写入、消息和外部动作不属于页面
 * GET 组合边界。
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
import {
  createConfiguredEventRelationshipContactGraphReader,
  type EventRelationshipContactGraphReader,
} from "../../../../../features/contacts/storage/event-relationship-contact-reader";
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
import type { OrbitLanguage } from "../../orbit-language-core";

export const APP_CONTACT_DETAIL_CONTACT_ID = "demo-contact-1";
export const APP_CONTACT_DETAIL_CONNECTION_ID = "demo-connection-1";

export type AppContactDetailRouteScenario = "empty" | "pending" | "failure";
export type AppContactDetailRouteState =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export interface AppContactDetailRouteInput {
  actorId?: string | null;
  contactId: string;
  liveContactGraphProvider?: LiveContactsGraphProvider | null;
  eventRelationshipContactGraphReader?: EventRelationshipContactGraphReader | null;
  mode?: ModuleMode | string;
  scenario?: string | null;
}

export interface AppContactDetailSuccessModel {
  assessment: RelationshipValueAssessment | null;
  contact: ContactDetail;
  contactPayload: ContactDetailTagStatusPayload;
  connection: ConnectionRecord | null;
  connectionPayload: ConnectionEvidenceDetailPayload | null;
  evidenceTimeline: readonly ConnectionEvidenceTimelineItem[];
  relationshipEnrichmentState:
    | "available"
    | "not_recorded"
    | "pending"
    | "unavailable";
  routeState: "success";
  valuePayload: RelationshipValuePayload | null;
}

export interface AppContactDetailBoundaryModel {
  description: string;
  evidence: readonly string[];
  nextStep: string;
  recoveryActions: readonly {
    href: string;
    label: string;
    /**
     * Per-action guidance. UI-audit fix P0-1: the page used to pass the single
     * route-level `nextStep` to every action, so "Retry contact detail" and
     * "Return to contacts list" rendered the identical sentence and the second
     * one described the first one's behaviour.
     */
    recoveryCopy: string;
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

type BoundaryRouteState = Exclude<AppContactDetailRouteState, "success">;
type BoundaryCopy = Omit<AppContactDetailBoundaryModel, "routeState">;

interface LocalizedCopy {
  en: string;
  ja: string;
  zh: string;
}

interface LocalizedBoundaryCopy {
  description: LocalizedCopy;
  evidence: readonly string[];
  nextStep: LocalizedCopy;
  recoveryActions: readonly {
    href: string;
    label: LocalizedCopy;
    recoveryCopy: LocalizedCopy;
  }[];
  title: LocalizedCopy;
}

const returnToContactsListAction = {
  href: "/app/contacts",
  label: {
    en: "Return to contacts list",
    ja: "人脈リストに戻る",
    zh: "返回人脉列表",
  },
  recoveryCopy: {
    en: "Leave this relationship and keep working from the sourced list.",
    ja: "この関係を離れ、出典付きのリストから作業を続けます。",
    zh: "离开这位联系人，回到有来源的列表继续。",
  },
} as const;

// 三种非成功状态统一在这里维护文案和恢复动作，避免页面组件硬编码错误处理。
// 每条文案同时携带 en/zh/ja，route model 默认按英文生成（保持既有服务契约），
// 页面再按当前 UI 语言调用 localizeAppContactDetailBoundaryModel 选出单一语言。
const routeBoundaryLocalizedCopy = {
  empty: {
    description: {
      en: "Choose a contact with source evidence before reviewing tags, status, connection context, or relationship value.",
      ja: "タグ、ステータス、関係の背景、関係価値を確認する前に、出典の根拠がある連絡先を選んでください。",
      zh: "请先选择一位已有来源证据的联系人，再查看标签、状态、关系背景或关系价值。",
    },
    evidence: ["contact-detail-empty", "connection-evidence-empty"],
    nextStep: {
      en: "Return to the sourced contacts list and select a relationship with evidence.",
      ja: "出典付きの人脈リストに戻り、根拠のある関係を選んでください。",
      zh: "返回有来源的人脉列表，选择一位已有证据的联系人。",
    },
    recoveryActions: [
      {
        href: "/app/contacts",
        label: returnToContactsListAction.label,
        recoveryCopy: {
          en: "Go back to the sourced list and pick a relationship that already has evidence.",
          ja: "出典付きのリストに戻り、すでに根拠がある関係を選んでください。",
          zh: "回到有来源的列表，选择一位已有证据的联系人。",
        },
      },
    ],
    title: {
      en: "No contact detail is available",
      ja: "表示できる連絡先の詳細がありません",
      zh: "暂无可用的联系人详情",
    },
  },
  failure: {
    description: {
      en: "The local relationship detail boundary returned a controlled failure.",
      ja: "ローカルの関係詳細境界が制御されたエラーを返しました。",
      zh: "本地关系详情边界返回了受控失败。",
    },
    evidence: ["contact-detail-failure", "connection-evidence-failure"],
    nextStep: {
      en: "Retry the detail view after confirming the local capability boundary is available.",
      ja: "ローカルの能力境界が利用可能であることを確認してから、詳細を再試行してください。",
      zh: "确认本地能力边界可用后，重试详情页。",
    },
    recoveryActions: [
      {
        href: "/app/contacts/demo-contact-1",
        label: {
          en: "Retry contact detail",
          ja: "連絡先の詳細を再試行",
          zh: "重试联系人详情",
        },
        recoveryCopy: {
          en: "Load the detail again once the local capability boundary is available.",
          ja: "ローカルの能力境界が利用可能になったら、詳細を再度読み込みます。",
          zh: "本地能力边界可用后，重新加载详情。",
        },
      },
      returnToContactsListAction,
    ],
    title: {
      en: "Contact detail could not load",
      ja: "連絡先の詳細を読み込めませんでした",
      zh: "联系人详情加载失败",
    },
  },
  pending: {
    description: {
      en: "Orbit is waiting for local source evidence before exposing this relationship profile.",
      ja: "Orbit はローカルの出典根拠を待ってから、この関係プロフィールを表示します。",
      zh: "Orbit 正在等待本地来源证据，之后才会展示这份关系档案。",
    },
    evidence: ["contact-detail-pending", "connection-evidence-pending"],
    nextStep: {
      en: "Check the current detail once source evidence has settled.",
      ja: "出典の根拠が確定したら、現在の詳細を確認してください。",
      zh: "来源证据稳定后，再查看当前详情。",
    },
    recoveryActions: [
      {
        href: "/app/contacts/demo-contact-1",
        label: {
          en: "Check current detail",
          ja: "現在の詳細を確認",
          zh: "查看当前详情",
        },
        recoveryCopy: {
          en: "Re-read the detail after the pending source evidence settles.",
          ja: "保留中の出典根拠が確定したら、詳細を再読み込みします。",
          zh: "待处理的来源证据稳定后，重新读取详情。",
        },
      },
      returnToContactsListAction,
    ],
    title: {
      en: "Contact detail is loading",
      ja: "連絡先の詳細を読み込み中",
      zh: "联系人详情加载中",
    },
  },
} as const satisfies Record<BoundaryRouteState, LocalizedBoundaryCopy>;

function boundaryCopyForLanguage(
  routeState: BoundaryRouteState,
  language: OrbitLanguage,
): BoundaryCopy {
  const copy: LocalizedBoundaryCopy = routeBoundaryLocalizedCopy[routeState];

  return {
    description: copy.description[language],
    evidence: copy.evidence,
    nextStep: copy.nextStep[language],
    recoveryActions: copy.recoveryActions.map((action) => ({
      href: action.href,
      label: action.label[language],
      recoveryCopy: action.recoveryCopy[language],
    })),
    title: copy.title[language],
  };
}

// 服务层输出保持英文（既有测试与调用方契约），页面层按 UI 语言再本地化。
const routeBoundaryCopy: Record<BoundaryRouteState, BoundaryCopy> = {
  empty: boundaryCopyForLanguage("empty", "en"),
  failure: boundaryCopyForLanguage("failure", "en"),
  pending: boundaryCopyForLanguage("pending", "en"),
};

/**
 * 把 route boundary model 的展示文案换成指定 UI 语言。
 *
 * evidence id 与 recovery action 的 href（含已按 contact id 重写的 retry
 * 链接）原样保留，只替换 title / description / nextStep / label /
 * recoveryCopy，避免页面再出现“中文 / English”拼接。
 */
export function localizeAppContactDetailBoundaryModel(
  model: AppContactDetailBoundaryModel,
  language: OrbitLanguage,
): AppContactDetailBoundaryModel {
  if (language === "en") {
    return model;
  }

  const copy = boundaryCopyForLanguage(model.routeState, language);

  return {
    ...model,
    description: copy.description,
    nextStep: copy.nextStep,
    recoveryActions: model.recoveryActions.map((action, index) => {
      const localizedAction = copy.recoveryActions[index];

      return localizedAction
        ? {
            ...action,
            label: localizedAction.label,
            recoveryCopy: localizedAction.recoveryCopy,
          }
        : action;
    }),
    title: copy.title,
  };
}

function normalizeScenario(
  scenario?: string | null,
): AppContactDetailRouteScenario | null {
  // 只允许 route 明确支持的 scenario 进入下游 capability service。
  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function normalizeContactId(contactId: string): string {
  const rawContactId = contactId.trim();

  try {
    return decodeURIComponent(rawContactId);
  } catch {
    // Malformed percent encoding is still treated as an opaque route id.
    return rawContactId;
  }
}

function createBoundaryModel(
  routeState: Exclude<AppContactDetailRouteState, "success">,
  contactId: string,
  evidence: readonly string[] = routeBoundaryCopy[routeState].evidence,
): AppContactDetailBoundaryModel {
  const normalizedContactId = normalizeContactId(contactId);
  const retryHref = normalizedContactId
    ? `/app/contacts/${encodeURIComponent(normalizedContactId)}`
    : "/app/contacts";

  return {
    ...routeBoundaryCopy[routeState],
    evidence,
    recoveryActions: routeBoundaryCopy[routeState].recoveryActions.map(
      (action) =>
        action.href === `/app/contacts/${APP_CONTACT_DETAIL_CONTACT_ID}`
          ? { ...action, href: retryHref }
          : action,
    ),
    routeState,
  };
}

function resolveRouteServices(
  mode?: ModuleMode | string,
  contactId = APP_CONTACT_DETAIL_CONTACT_ID,
): AppContactDetailRouteServices | AppContactDetailBoundaryModel {
  // 任一 capability factory 无法解析时，整条 route 进入 failure boundary。
  const contactDetail = contactDetailServiceFactory.create(mode);

  if (contactDetail.success === false) {
    return createBoundaryModel("failure", contactId, [
      contactDetail.error.code,
    ]);
  }

  const connectionEvidence = connectionEvidenceServiceFactory.create(mode);

  if (connectionEvidence.success === false) {
    return createBoundaryModel("failure", contactId, [
      connectionEvidence.error.code,
    ]);
  }

  const relationshipValue = relationshipValueServiceFactory.create(mode);

  if (relationshipValue.success === false) {
    return createBoundaryModel("failure", contactId, [
      relationshipValue.error.code,
    ]);
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
    readContactDetailState: input.provider.readContactDetailState
      ? (contactId, actorId) =>
          input.provider.readContactDetailState!(contactId, actorId)
      : undefined,
    upsertContactDetailState: input.provider.upsertContactDetailState
      ? (state) => input.provider.upsertContactDetailState!(state)
      : undefined,
  };
}

function mergeFocusedContactGraphs(
  primary: LocalRemoteContactGraph,
  canonical: LocalRemoteContactGraph,
): LocalRemoteContactGraph {
  return {
    contacts: Array.from(
      new Map(
        [...primary.contacts, ...canonical.contacts].map((item) => [item.id, item]),
      ).values(),
    ),
    connections: Array.from(
      new Map(
        [...primary.connections, ...canonical.connections].map((item) => [item.id, item]),
      ).values(),
    ),
    evidence: Array.from(
      new Map(
        [...primary.evidence, ...canonical.evidence].map((item) => [item.id, item]),
      ).values(),
    ),
    generatedAt:
      primary.generatedAt > canonical.generatedAt
        ? primary.generatedAt
        : canonical.generatedAt,
  };
}

async function contactDetailCompositeProvider(input: {
  actorId: string;
  contactId: string;
  eventRelationshipContactGraphReader?: EventRelationshipContactGraphReader | null;
  provider: LiveContactsGraphProvider;
}): Promise<LiveContactsGraphProvider> {
  const graph = input.provider.readContactGraphForContact
    ? await input.provider.readContactGraphForContact(
        input.contactId,
        input.actorId,
      )
    : await input.provider.readContactGraph(input.actorId);
  if (graph.contacts.some((contact) => contact.id === input.contactId)) {
    return contactProviderForGraph({ graph, provider: input.provider });
  }
  const canonical =
    await input.eventRelationshipContactGraphReader?.readAcceptedContactGraph({
      actorId: input.actorId,
      contactId: input.contactId,
    });
  return contactProviderForGraph({
    graph: canonical ? mergeFocusedContactGraphs(graph, canonical) : graph,
    provider: input.provider,
  });
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
  actorId: string;
  contactId: string;
  provider: LiveContactsGraphProvider;
  eventRelationshipContactGraphReader?: EventRelationshipContactGraphReader | null;
}): Promise<AppContactDetailRouteServices> {
  const contactProvider = await contactDetailCompositeProvider({
    actorId: input.actorId,
    contactId: input.contactId.trim(),
    eventRelationshipContactGraphReader:
      input.eventRelationshipContactGraphReader,
    provider: input.provider,
  });
  const graph = await contactProvider.readContactGraph(input.actorId);
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
  actorId?: string | null;
  contactId: string;
  scenario?: string | null;
  services: AppContactDetailRouteServices;
}): Promise<AppContactDetailRouteModel> {
  const routeScenario = normalizeScenario(input.scenario);
  const contactResult = await input.services.contactDetail.getContactDetail({
    actorId: input.actorId,
    contactId: input.contactId,
    scenario: routeScenario,
  });

  if (contactResult.success === false) {
    return createBoundaryModel(
      contactResult.error.code === "CONTACT_DETAIL_NOT_FOUND"
        ? "empty"
        : "failure",
      input.contactId,
      contactResult.error.evidenceIds,
    );
  }

  if (contactResult.data.state === "pending") {
    return createBoundaryModel(
      "pending",
      input.contactId,
      contactResult.data.provenance.evidenceIds,
    );
  }

  if (!contactResult.data.contact) {
    return createBoundaryModel(
      "empty",
      input.contactId,
      contactResult.data.provenance.evidenceIds,
    );
  }

  const contactOnlySuccess = (
    relationshipEnrichmentState:
      | "not_recorded"
      | "pending"
      | "unavailable",
  ): AppContactDetailSuccessModel => ({
    assessment: null,
    contact: contactResult.data.contact!,
    contactPayload: contactResult.data,
    connection: null,
    connectionPayload: null,
    evidenceTimeline: [],
    relationshipEnrichmentState,
    routeState: "success",
    valuePayload: null,
  });

  const connectionListResult = await input.services.connectionEvidence.listConnections({
    actorId: input.actorId,
    scenario: routeScenario,
  });

  if (connectionListResult.success === false) {
    return contactOnlySuccess("unavailable");
  }

  const connectionId = connectionIdForContact(
    connectionListResult.data,
    input.contactId,
  );

  if (connectionId === null) {
    return contactOnlySuccess("not_recorded");
  }

  const connectionResult = await input.services.connectionEvidence.getConnection({
    actorId: input.actorId,
    connectionId,
    scenario: routeScenario,
  });
  const valueResult = await input.services.relationshipValue.getRelationshipValue({
    connectionId,
    scenario: routeScenario,
  });

  if (connectionResult.success === false || valueResult.success === false) {
    return contactOnlySuccess("unavailable");
  }

  const routeState = routeStateForPayloads(
    contactResult.data,
    connectionResult.data,
    valueResult.data,
  );

  if (routeState) {
    if (routeState === "pending") {
      return contactOnlySuccess("pending");
    }

    if (
      !connectionResult.data.connection ||
      !valueResult.data.assessment
    ) {
      return contactOnlySuccess("unavailable");
    }

    return createBoundaryModel(
      routeState,
      input.contactId,
      collectRouteEvidenceIds(contactResult.data, connectionResult.data, valueResult.data),
    );
  }

  return {
    assessment: valueResult.data.assessment,
    contact: contactResult.data.contact,
    contactPayload: contactResult.data,
    connection: connectionResult.data.connection,
    connectionPayload: connectionResult.data,
    evidenceTimeline: connectionResult.data.evidenceTimeline,
    relationshipEnrichmentState: "available",
    routeState: "success",
    valuePayload: valueResult.data,
  };
}

async function loadLiveAppContactDetailRoute(input: {
  actorId?: string | null;
  contactId: string;
  liveContactGraphProvider?: LiveContactsGraphProvider | null;
  eventRelationshipContactGraphReader?: EventRelationshipContactGraphReader | null;
  scenario?: string | null;
}): Promise<AppContactDetailRouteModel> {
  const actorId = input.actorId?.trim();
  if (!actorId) {
    return createBoundaryModel("failure", input.contactId, [
      "CONTACT_DETAIL_ACTOR_REQUIRED",
    ]);
  }

  const provider =
    input.liveContactGraphProvider ?? createConfiguredStorageContactGraphProvider();

  if (!provider) {
    return createBoundaryModel("failure", input.contactId, [
      "CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED",
    ]);
  }

  const services = await resolveLiveRouteServicesFromGraph({
    actorId,
    contactId: input.contactId,
    provider,
    eventRelationshipContactGraphReader:
      input.eventRelationshipContactGraphReader === undefined
        ? createConfiguredEventRelationshipContactGraphReader()
        : input.eventRelationshipContactGraphReader,
  });

  return loadComposedContactDetailRoute({
    actorId,
    contactId: input.contactId,
    scenario: input.scenario,
    services,
  });
}

export async function loadAppContactDetailRoute({
  actorId,
  contactId,
  liveContactGraphProvider,
  eventRelationshipContactGraphReader,
  mode,
  scenario,
}: AppContactDetailRouteInput): Promise<AppContactDetailRouteModel> {
  const normalizedContactId = normalizeContactId(contactId);

  // 主入口：live 模式先读取一次 focused graph，再复用现有 live capability
  // mappers；mock/hybrid 继续走原有 service composition。
  if (resolveModuleMode(mode) === "live") {
    return loadLiveAppContactDetailRoute({
      actorId,
      contactId: normalizedContactId,
      liveContactGraphProvider,
      eventRelationshipContactGraphReader,
      scenario,
    });
  }

  const services = resolveRouteServices(mode, normalizedContactId);

  if (isBoundaryModel(services)) {
    return services;
  }

  return loadComposedContactDetailRoute({
    actorId,
    contactId: normalizedContactId,
    scenario,
    services,
  });
}
