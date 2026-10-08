import {
  CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS,
  type ContactsListSearchFailure,
  type ContactsListSearchFilterInput,
  type ContactsListSearchProvenance,
  type ContactsListSearchResult,
} from "./contract";
import {
  buildAvailableFiltersFromFacetCounts,
  runContactsGraphQuery,
  type ContactsFacetCounts,
  type ContactsGraphQueryContext,
} from "./contact-graph-query";
import type { LocalRemoteContactGraph } from "./contact-graph-provider";
import type { ContactDTO, ContactRegionDTO } from "../../shared/domain/contracts";
import type { SeniorityLevel } from "../../shared/domain/source-types";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../shared/contract/industries";
import type { ContactsListSearchAndFilterService } from "./service";
import type { AppliedEnrichmentField, EnrichedValue } from "./enrichment/apply-enrichment";

type LiveContactsProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveContactDetailStoredNote {
  authorLabel: string;
  body: string;
  createdAt: string;
  noteId: string;
  privacy?: "private" | "relationship_shared";
  sourceLabel?: string;
  /** W0046 memo：用户选的东京日期 `YYYY-MM-DD`；时间线按它排序（day 精度）。 */
  occurredAt?: string;
  /** W0046 memo：关联活动 id。 */
  eventId?: string;
  /** W0046：`"memo"` = 「写 memo」写入。 */
  kind?: "memo";
}

export interface LiveContactDetailStoredInteraction {
  channel: string;
  occurredAt: string;
  summary: string;
}

export interface LiveContactDetailState {
  actorId: string;
  contactId: string;
  lastInteraction?: LiveContactDetailStoredInteraction;
  notes: readonly LiveContactDetailStoredNote[];
  status: string;
  tags: readonly string[];
  updatedAt: string;
}

export interface LiveContactsGraphProvider {
  source: string;
  sourceLabel: string;
  readContactGraph: (
    actorId?: string,
  ) => LiveContactsProviderResult<LocalRemoteContactGraph>;
  readContactGraphForList?: (
    input: ContactsListSearchFilterInput,
    actorId?: string,
  ) => LiveContactsProviderResult<LocalRemoteContactGraph>;
  readContactGraphForContact?: (
    contactId: string,
    actorId?: string,
  ) => LiveContactsProviderResult<LocalRemoteContactGraph>;
  readContactDetailState?: (
    contactId: string,
    actorId: string,
  ) => LiveContactsProviderResult<LiveContactDetailState | null>;
  /**
   * W0046：`expected` 为乐观锁前提——undefined = 无条件写（旧调用方）；null = 行必须不存在；
   * `{ updatedAt }` = 存储里的 state.updatedAt 必须仍等于它。前提不成立抛 AppError CONFLICT。
   */
  upsertContactDetailState?: (
    state: LiveContactDetailState,
    expected?: { updatedAt: string } | null,
  ) => LiveContactsProviderResult<LiveContactDetailState>;
  updateContactPrimaryIndustry?: (
    contactId: string,
    actorId: string,
    primaryIndustryId: IndustryIdCode | null,
    secondaryIndustryId?: SecondaryIndustryIdCode | null,
  ) => LiveContactsProviderResult<ContactDTO>;
  /**
   * W0045：联系人编辑改行业／职级／地区——同一联系人 payload 的这几项一次条件更新（一次 CAS），
   * 并把改动字段的来源记为 `user`（via contact_edit）。null = 清空；期间被改过抛 AppError CONFLICT。
   */
  updateContactEnrichment?: (
    contactId: string,
    actorId: string,
    update: ContactEnrichmentEdit,
  ) => LiveContactsProviderResult<ContactDTO>;
  /**
   * W0046：memo 提取结果写回专长／需求／话题（publicProfile.offering／seeking／topics）。
   * 逐项过 canWriteEnrichedValue（只补空或替换 ai 值，user／card／存量无来源值不覆盖），来源记 ai／memo_extraction；
   * 一次条件更新，没有可写项时不写；返回实际写入的字段。期间被改过抛 AppError CONFLICT。
   */
  applyContactMemoExtraction?: (
    contactId: string,
    actorId: string,
    values: readonly EnrichedValue[],
    at: string,
  ) => LiveContactsProviderResult<readonly AppliedEnrichmentField[]>;
  /**
   * W0058：洞察同一调用产出的名片推测写回 offering／seeking／topics（来源 ai／card_inference）。
   * 完整来源判定：用户手改或清空、memo 提取、存量无来源值都不覆盖；只替换空栏或旧的 card_inference。
   * 条件更新冲突重读最多再试 2 次，仍冲突抛 AppError CONFLICT。
   */
  applyContactCardInference?: (
    contactId: string,
    actorId: string,
    values: readonly EnrichedValue[],
    at: string,
  ) => LiveContactsProviderResult<readonly AppliedEnrichmentField[]>;
}

export interface ContactEnrichmentEdit {
  /** 行业整对（已按分类校验）；primaryIndustryId 为 null 表示清空。 */
  industry?: { primaryIndustryId: IndustryIdCode | null; secondaryIndustryId: SecondaryIndustryIdCode | null };
  seniorityLevel?: SeniorityLevel | null;
  region?: ContactRegionDTO | null;
}

export interface LiveContactsListSearchAndFilterServiceOptions {
  provider?: LiveContactsGraphProvider | null;
}

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function unconfiguredProvenance(): ContactsListSearchProvenance {
  return {
    source: "live-record-store:contacts:unconfigured",
    sourceLabel: "Unconfigured Contacts live store",
    evidenceIds: ["evidence:contacts-live-store-unconfigured"],
    collectedAt: new Date(0).toISOString(),
    privacy: "live-contacts-list-search-filter",
    generationMethod: "live-store-query",
    searchIndexReadExecuted: false,
    databaseQueryExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function unconfiguredFailure(): ContactsListSearchFailure {
  const definition =
    CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS.CONTACTS_LIVE_STORE_UNCONFIGURED;
  const provenance = unconfiguredProvenance();

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function actorRequiredFailure(): ContactsListSearchFailure {
  const definition =
    CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS.CONTACTS_ACTOR_REQUIRED;
  const provenance = unconfiguredProvenance();

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: ["evidence:contacts-actor-required"],
    },
  };
}

function graphQueryContext(
  provider: LiveContactsGraphProvider,
): ContactsGraphQueryContext {
  return {
    databaseQueryExecuted: true,
    generationMethod: "live-store-query",
    honorScenarios: false,
    privacy: "live-contacts-list-search-filter",
    source: provider.source,
    sourceLabel: provider.sourceLabel,
  };
}

async function runLiveContactsQuery(
  provider: LiveContactsGraphProvider | null,
  input: ContactsListSearchFilterInput = {},
): Promise<ContactsListSearchResult> {
  if (!provider) {
    return unconfiguredFailure();
  }

  const actorId = input.actorId?.trim();
  if (!actorId) {
    return actorRequiredFailure();
  }

  const graph: LocalRemoteContactGraph = input.contactIds?.length === 0
    ? { contacts: [], connections: [], evidence: [], generatedAt: new Date(0).toISOString() }
    : provider.readContactGraphForList
      ? await provider.readContactGraphForList(input, actorId)
      : await provider.readContactGraph(actorId);

  const boundedPage = (graph as LocalRemoteContactGraph & {
    boundedPage?: {
      facetCounts?: ContactsFacetCounts;
      nextCursor?: string;
      total: number;
    };
  }).boundedPage;
  const graphQueryInput = boundedPage?.facetCounts
    ? { ...input, cursor: null }
    : boundedPage
      ? { ...input, query: null, cursor: null, limit: null }
      : input;
  const result = runContactsGraphQuery(
    graph,
    graphQueryInput,
    graphQueryContext(provider),
  );
  if (result.success && boundedPage) {
    if (boundedPage.facetCounts) {
      result.data.availableFilters = buildAvailableFiltersFromFacetCounts(
        boundedPage.facetCounts,
        result.data.appliedFilters,
      );
    }
    result.data.total = boundedPage.total;
    result.data.summary = `${boundedPage.total} contacts matched the live database query.`;
    if (boundedPage.nextCursor) result.data.nextCursor = boundedPage.nextCursor;
    else delete result.data.nextCursor;
  }
  return clonePayload(result);
}

export function createLiveContactsListSearchAndFilterService({
  provider = null,
}: LiveContactsListSearchAndFilterServiceOptions = {}): ContactsListSearchAndFilterService {
  return {
    listContacts(input = {}) {
      return runLiveContactsQuery(provider, input);
    },

    searchContacts(input = {}) {
      return runLiveContactsQuery(provider, input);
    },
  };
}
