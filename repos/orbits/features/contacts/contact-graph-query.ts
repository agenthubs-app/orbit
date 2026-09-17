import {
  CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS,
  CONTACT_SOURCE_FILTERS,
  CONTACT_STATUS_FILTERS,
  CONTACT_TAG_FILTERS,
  CONTACT_VALUE_FILTERS,
  type ContactEvidence,
  type ContactFilterOption,
  type ContactListItem,
  type ContactSourceFilter,
  type ContactSourceReference,
  type ContactStatusFilter,
  type ContactTagFilter,
  type ContactValueFilter,
  type ContactsAppliedFilters,
  type ContactsAvailableFilters,
  type ContactsListSearchFailure,
  type ContactsListSearchFilterErrorCode,
  type ContactsListSearchFilterInput,
  type ContactsListSearchFilterScenario,
  type ContactsListSearchPayload,
  type ContactsListSearchProvenance,
  type ContactsListSearchResult,
} from "./contract";
import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import { ORBIT_LOCAL_REMOTE_DATABASE_KEY } from "../../shared/local-remote-store/orbit-database";
import type { OrbitLocalRemoteDatabase } from "../../shared/local-remote-store/orbit-database";
import type { ContactsListSearchAndFilterService } from "./service";
import {
  createContactLocalRemoteProvider,
  type ContactLocalRemoteProvider,
  type LocalRemoteContactGraph,
} from "./contact-graph-provider";

// Hybrid contacts service 把 local-remote database 的表形数据映射回现有 contacts contract。
// 它是 mock 与未来远程数据库之间的过渡层：会读本地 store，但不读搜索索引、不联网、不调用 AI。
const supportedScenarios = new Set<ContactsListSearchFilterScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedSources = new Set<ContactSourceFilter>(CONTACT_SOURCE_FILTERS);
const supportedValues = new Set<ContactValueFilter>(CONTACT_VALUE_FILTERS);
const supportedStatuses = new Set<ContactStatusFilter>(CONTACT_STATUS_FILTERS);

// label 表只服务 UI filter 展示；实际合法值仍以 contract 中的枚举为准。
const sourceLabels: Record<ContactSourceFilter, string> = {
  business_card_ocr: "Business card OCR",
  calendar_signal: "Calendar signal",
  email_signal: "Email signal",
  event_import: "Event import",
  external_contacts: "External contacts",
  manual: "Manual note",
  qr_scan: "QR scan",
  referral: "Referral",
};

const tagLabels: Record<string, string> = {
  "event:climate-founders-dinner": "Climate founders dinner",
  "priority:nurture": "Nurture priority",
  "priority:warm-follow-up": "Warm follow-up",
  "source:business-card": "Business card source",
  "source:event-import": "Event import source",
  "source:external-import": "External import source",
  "topic:community": "Community context",
  "topic:storage-pilots": "Storage pilots",
  "topic:venture-ecosystem": "Venture ecosystem",
};

const valueLabels: Record<ContactValueFilter, string> = {
  commercial_opportunity: "Commercial opportunity",
  community_context: "Community context",
  knowledge_exchange: "Knowledge exchange",
  referral_path: "Referral path",
  strategic_fit: "Strategic fit",
};

const statusLabels: Record<ContactStatusFilter, string> = {
  active: "Active",
  archived: "Archived",
  needs_follow_up: "Needs follow-up",
  nurture: "Nurture",
};

export interface HybridContactsListSearchAndFilterServiceOptions {
  database?: OrbitLocalRemoteDatabase;
  provider?: ContactLocalRemoteProvider;
}

export interface ContactsGraphQueryContext {
  databaseQueryExecuted: boolean;
  generationMethod: ContactsListSearchProvenance["generationMethod"];
  honorScenarios?: boolean;
  privacy: ContactsListSearchProvenance["privacy"];
  source: string;
  sourceLabel: string;
}

const hybridGraphQueryContext: ContactsGraphQueryContext = {
  databaseQueryExecuted: true,
  generationMethod: "local-remote-store-query",
  honorScenarios: true,
  privacy: "demo-contacts-list-search-filter-only",
  source: `local-remote-store:${ORBIT_LOCAL_REMOTE_DATABASE_KEY}`,
  sourceLabel: "Hybrid local remote contacts database",
};

// service 返回前 clone payload，避免 UI/test 修改返回对象影响内部计算结果。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

// scenario 只接受 contract 支持的状态；未知字符串回到 success，避免随意分支。
function normalizeScenario(
  scenario?: ContactsListSearchFilterInput["scenario"],
): ContactsListSearchFilterScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ContactsListSearchFilterScenario)
  ) {
    return scenario as ContactsListSearchFilterScenario;
  }

  return "success";
}

// 过滤器输入允许来自 querystring/form，所以这里统一 trim 并去掉空值。
function normalizedValues(values?: readonly (string | null)[] | null): string[] {
  return (
    values
      ?.map((value) => value?.trim() ?? "")
      .filter((value) => value.length > 0) ?? []
  );
}

function hasUnsupportedValue<TValue extends string>(
  values: readonly string[],
  supportedValuesSet: ReadonlySet<TValue>,
): boolean {
  return values.some((value) => !supportedValuesSet.has(value as TValue));
}

// 任何不在枚举里的过滤器都会变成领域失败，而不是被静默忽略。
function unsupportedFilterFailure(
  input: ContactsListSearchFilterInput,
  context: ContactsGraphQueryContext,
): ContactsListSearchFailure | null {
  if (
    (input.limit !== undefined && input.limit !== null && (!Number.isSafeInteger(input.limit) || input.limit < 1)) ||
    normalizedValues(input.tagFilters).length > 20 ||
    normalizedValues(input.tagFilters).some((tag) => Array.from(tag).length > 32) ||
    hasUnsupportedValue(
      normalizedValues(input.sourceFilters),
      supportedSources,
    ) ||
    hasUnsupportedValue(normalizedValues(input.valueFilters), supportedValues) ||
    hasUnsupportedValue(normalizedValues(input.statusFilters), supportedStatuses)
  ) {
    return failure("CONTACTS_FILTER_NOT_SUPPORTED", [], context);
  }

  return null;
}

// local remote store 的 source type 可能比 contacts filter 更宽；这里收窄到 contacts contract。
function isContactSourceFilter(value: string): value is ContactSourceFilter {
  return supportedSources.has(value as ContactSourceFilter);
}

// 将 shared/domain 的 ContactDTO 转成 contacts contract 的 source reference。
function toContactSource(
  contact: ContactDTO,
  evidenceIds: readonly string[],
): ContactSourceReference {
  const type = isContactSourceFilter(contact.source.type)
    ? contact.source.type
    : "manual";

  return {
    type,
    id: contact.source.id,
    label: contact.source.label ?? sourceLabels[type],
    evidenceId: evidenceIds[0] ?? `evidence:${contact.id}`,
  };
}

// 新采集的联系人还没有进入推进阶段；应进入待跟进，而不是被误标成 active。
// reviewing 表示已经开始处理，映射为 active。其余受支持状态保持原值。
function toContactStatus(contact: ContactDTO): ContactStatusFilter {
  if (contact.stage === "captured") {
    return "needs_follow_up";
  }

  if (contact.stage === "reviewing") {
    return "active";
  }

  return supportedStatuses.has(contact.stage as ContactStatusFilter)
    ? (contact.stage as ContactStatusFilter)
    : "active";
}

// 把 evidence 表记录嵌入到 ContactListItem；缺失摘要时保留可见 fallback。
function evidenceForContact(
  contact: ContactDTO,
  source: ContactSourceReference,
  evidence: readonly RelationshipEvidenceDTO[],
): readonly ContactEvidence[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  return contact.evidenceIds.map((evidenceId) => {
    const evidenceRecord = evidenceById.get(evidenceId);

    return {
      evidenceId,
      source,
      excerpt:
        evidenceRecord?.summary ??
        "Local remote database contact evidence is present but has no summary.",
      capturedAt: evidenceRecord?.occurredAt ?? contact.updatedAt,
      createdBy: "hybrid-contacts-list-search-and-filter-service",
    };
  });
}

// 当前 value score 是轻量规则分数，用于本地列表排序/展示，不是 AI 或分析 job 输出。
function valueScore(valueTypes: readonly ContactValueFilter[]): number {
  return Math.min(95, 60 + valueTypes.length * 12);
}

// profileSnippet 兼容旧数据：没有专门摘要时用 role/organization 拼出可读描述。
function profileSnippetFor(contact: ContactDTO): string {
  if (contact.profileSnippet?.trim()) {
    return contact.profileSnippet;
  }

  if (contact.role && contact.organization) {
    return `${contact.role} at ${contact.organization}.`;
  }

  return "Source-backed contact from the local remote database.";
}

// nextAction 保持可复核语气，提醒使用者 agent 执行前仍需要证据检查。
function nextActionFor(contact: ContactDTO): string {
  if (contact.nextAction?.text.trim()) {
    return contact.nextAction.text.trim();
  }

  if (contact.stage === "needs_follow_up") {
    return `Review the next follow-up for ${contact.displayName}.`;
  }

  return `Review ${contact.displayName} with source evidence before agent use.`;
}

// 核心映射函数：把 contact + connection + evidence 三张表合成列表页 DTO。
function toContactListItems(graph: LocalRemoteContactGraph): ContactListItem[] {
  const connectionsByContactId = new Map(
    graph.connections.map((connection) => [connection.contactId, connection]),
  );

  return graph.contacts.map((contact) => {
    const connection = connectionsByContactId.get(contact.id);
    const source = toContactSource(contact, contact.evidenceIds);
    const valueTypes =
      connection?.valueTypes.filter((value): value is ContactValueFilter =>
        supportedValues.has(value as ContactValueFilter),
      ) ?? [];

    return {
      id: contact.id,
      displayName: contact.displayName,
      role: contact.role ?? "",
      organization: contact.organization ?? "",
      location: contact.location ?? "",
      profileSnippet: profileSnippetFor(contact),
      relationshipContext:
        connection?.summary ??
        "Source-backed contact loaded from the local remote database.",
      lastInteractionAt: contact.updatedAt,
      nextAction: nextActionFor(contact),
      source,
      evidence: evidenceForContact(contact, source, graph.evidence),
      tags: contact.customTags ?? [],
      primaryIndustryId: contact.primaryIndustryId,
      secondaryIndustryId: contact.secondaryIndustryId,
      value: {
        score: valueScore(valueTypes),
        valueTypes,
        rationale:
          connection?.summary ??
          "Relationship value is derived from local remote database records.",
        evidenceIds: contact.evidenceIds,
      },
      status: toContactStatus(contact),
      lifecycleInitialization: contact.lifecycleInitialization,
      databaseQueryExecuted: true,
      searchIndexReadExecuted: false,
      externalNetworkRequested: false,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
    };
  });
}

function selectedValues<TValue extends string>(
  values?: readonly (TValue | string)[] | null,
): readonly string[] {
  return values?.filter((value) => value.trim().length > 0) ?? [];
}

// 从输入构造实际生效的 filter 集合；query 统一转小写便于本地 includes 匹配。
function appliedFiltersFromInput(
  input: ContactsListSearchFilterInput = {},
): ContactsAppliedFilters {
  return {
    query: input.query?.trim().toLowerCase() ?? "",
    sourceFilters: selectedValues(input.sourceFilters) as ContactSourceFilter[],
    statusFilters: selectedValues(input.statusFilters) as ContactStatusFilter[],
    tagFilters: selectedValues(input.tagFilters) as ContactTagFilter[],
    valueFilters: selectedValues(input.valueFilters) as ContactValueFilter[],
  };
}

// 简单本地全文匹配：只在已经映射好的 ContactListItem 字段内搜索，不读外部索引。
function includesText(contact: ContactListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  return [
    contact.displayName,
    contact.role,
    contact.organization,
    contact.location,
    contact.profileSnippet,
    contact.relationshipContext,
    contact.nextAction,
    contact.tags.join(" "),
    contact.value.valueTypes.join(" "),
    contact.evidence.map((evidence) => evidence.excerpt).join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

// 所有过滤条件在内存中执行；没有搜索索引，也没有远程 query planner。
function contactMatchesFilters(
  contact: ContactListItem,
  appliedFilters: ContactsAppliedFilters,
): boolean {
  return (
    appliedFilters.tagFilters.every((tag) => contact.tags.includes(tag)) &&
    (appliedFilters.sourceFilters.length === 0 ||
      appliedFilters.sourceFilters.includes(contact.source.type)) &&
    appliedFilters.valueFilters.every((value) =>
      contact.value.valueTypes.includes(value),
    ) &&
    (appliedFilters.statusFilters.length === 0 ||
      (contact.lifecycleInitialization !== "pending" && appliedFilters.statusFilters.includes(contact.status)))
  );
}

function paginationScope(input: ContactsListSearchFilterInput): string {
  return JSON.stringify({
    query: input.query?.trim().toLocaleLowerCase() ?? "",
    sourceFilters: selectedValues(input.sourceFilters),
    statusFilters: selectedValues(input.statusFilters),
    tagFilters: selectedValues(input.tagFilters),
    valueFilters: selectedValues(input.valueFilters),
    contextEventId: input.contextEventId?.trim() ?? "",
  });
}

function pageOffset(input: ContactsListSearchFilterInput): number {
  if (!input.cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as { offset?: unknown; scope?: unknown };
    return Number.isSafeInteger(value.offset) && Number(value.offset) >= 0 && value.scope === paginationScope(input)
      ? Number(value.offset)
      : 0;
  } catch {
    return 0;
  }
}

function nextPageCursor(offset: number, input: ContactsListSearchFilterInput): string {
  return Buffer.from(JSON.stringify({ offset, scope: paginationScope(input) }), "utf8").toString("base64url");
}

interface ContactListFallbackSortKey {
  occurredAt: string;
  recordId: string;
  storageOrder: number;
  updatedAt: string;
  storageAfter?: boolean;
}

interface ContactListFallbackMetadata {
  cursorScope: string;
  sortKeys: readonly ContactListFallbackSortKey[];
}

interface ContactListKeysetCursor {
  last: {
    occurredAt: string;
    prefixRank: number;
    recordId: string;
    updatedAt: string;
  };
  scope: string;
  version: 1;
}

const CONTACT_LIST_CURSOR_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

function validContactListCursorTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = CONTACT_LIST_CURSOR_TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const zone = match[8];
  const offsetHour = zone === "Z" ? 0 : Number(zone.slice(1, 3));
  const offsetMinute = zone === "Z" ? 0 : Number(zone.slice(4, 6));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12 &&
    day >= 1 && day <= (daysInMonth ?? 0) &&
    hour >= 0 && hour <= 23 &&
    minute >= 0 && minute <= 59 &&
    second >= 0 && second <= 59 &&
    year >= 1 &&
    offsetHour >= 0 && offsetHour <= 15 &&
    offsetMinute >= 0 && offsetMinute <= 59
    ? value
    : null;
}

function decodeContactListKeysetCursor(
  cursor: string | null | undefined,
  scope: string,
): ContactListKeysetCursor["last"] | null {
  if (!cursor || !scope) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<ContactListKeysetCursor>;
    if (
      parsed.version !== 1 ||
      parsed.scope !== scope ||
      !parsed.last ||
      typeof parsed.last !== "object" ||
      Array.isArray(parsed.last)
    ) {
      return null;
    }
    const last = parsed.last;
    const prefixRank = Number(last.prefixRank);
    const occurredAt = validContactListCursorTimestamp(last.occurredAt);
    const updatedAt = validContactListCursorTimestamp(last.updatedAt);
    if (
      !Number.isSafeInteger(prefixRank) ||
      prefixRank < 0 ||
      prefixRank > 1 ||
      !occurredAt ||
      !updatedAt ||
      typeof last.recordId !== "string" ||
      last.recordId.trim().length === 0
    ) {
      return null;
    }
    return { occurredAt, prefixRank, recordId: last.recordId, updatedAt };
  } catch {
    return null;
  }
}

function nextContactListKeysetCursor(
  last: ContactListKeysetCursor["last"],
  scope: string,
): string {
  return Buffer.from(JSON.stringify({ version: 1, scope, last }), "utf8").toString("base64url");
}

function fallbackContactListMetadata(
  graph: LocalRemoteContactGraph,
): ContactListFallbackMetadata | null {
  const metadata = (graph as LocalRemoteContactGraph & {
    contactListFallback?: ContactListFallbackMetadata;
  }).contactListFallback;
  return metadata && metadata.cursorScope && metadata.sortKeys.length === graph.contacts.length
    ? metadata
    : null;
}

function fallbackPrefixRank(
  contact: ContactListItem,
  query: string,
): 0 | 1 {
  return contact.displayName.toLowerCase().startsWith(query) ? 0 : 1;
}

// 计算 filter option 的 count 和 selected 状态，供 UI 直接渲染筛选器。
function filterOption<TValue extends string>(
  value: TValue,
  label: string,
  count: number,
  selected: readonly string[],
): ContactFilterOption<TValue> {
  return {
    value,
    label,
    count,
    selected: selected.includes(value),
  };
}

export interface ContactsFacetCounts {
  tags: readonly { value: string; count: number }[];
  sources: Readonly<Record<string, number>>;
  values: Readonly<Record<string, number>>;
  statuses: Readonly<Record<string, number>>;
}

// SQL readers return counts over the complete authorized graph. Keep the
// contract labels/order in this mapper so storage never invents a second DTO.
export function buildAvailableFiltersFromFacetCounts(
  counts: ContactsFacetCounts,
  appliedFilters: ContactsAppliedFilters,
): ContactsAvailableFilters {
  const tagCounts = new Map(counts.tags.map((item) => [item.value, item.count]));
  const tags = [
    ...CONTACT_TAG_FILTERS,
    ...counts.tags
      .map((item) => item.value)
      .filter((value) => !CONTACT_TAG_FILTERS.includes(value as never)),
  ];

  return {
    tags: Array.from(new Set(tags)).map((tag) =>
      filterOption(
        tag,
        tagLabels[tag] ?? tag,
        tagCounts.get(tag) ?? 0,
        appliedFilters.tagFilters,
      ),
    ),
    sources: CONTACT_SOURCE_FILTERS.map((source) =>
      filterOption(
        source,
        sourceLabels[source],
        counts.sources[source] ?? 0,
        appliedFilters.sourceFilters,
      ),
    ),
    values: CONTACT_VALUE_FILTERS.map((value) =>
      filterOption(
        value,
        valueLabels[value],
        counts.values[value] ?? 0,
        appliedFilters.valueFilters,
      ),
    ),
    statuses: CONTACT_STATUS_FILTERS.map((status) =>
      filterOption(
        status,
        statusLabels[status],
        counts.statuses[status] ?? 0,
        appliedFilters.statusFilters,
      ),
    ),
  };
}

// availableFilters 基于“全量本地 contacts”计算，便于用户看到每个筛选项的总体数量。
function buildAvailableFilters(
  contacts: readonly ContactListItem[],
  appliedFilters: ContactsAppliedFilters,
): ContactsAvailableFilters {
  const tagCounts = new Map<string, number>();
  const sourceCounts: Record<string, number> = {};
  const valueCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};

  for (const contact of contacts) {
    for (const tag of new Set(contact.tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    sourceCounts[contact.source.type] = (sourceCounts[contact.source.type] ?? 0) + 1;
    for (const value of new Set(contact.value.valueTypes)) {
      valueCounts[value] = (valueCounts[value] ?? 0) + 1;
    }
    if (contact.lifecycleInitialization !== "pending") {
      statusCounts[contact.status] = (statusCounts[contact.status] ?? 0) + 1;
    }
  }

  return buildAvailableFiltersFromFacetCounts({
    tags: Array.from(tagCounts, ([value, count]) => ({ value, count })),
    sources: sourceCounts,
    values: valueCounts,
    statuses: statusCounts,
  }, appliedFilters);
}

// provenance 至少需要一个 evidenceId；空结果用稳定 evidence id 表示“查询确实执行过”。
function evidenceIdsForContacts(
  contacts: readonly ContactListItem[],
): readonly string[] {
  const evidenceIds = contacts.flatMap((contact) =>
    contact.evidence.map((evidence) => evidence.evidenceId),
  );

  return evidenceIds.length > 0
    ? evidenceIds
    : ["evidence:contacts-local-remote-empty"];
}

// provenance 明确这是 local-remote-store 查询，并标记 searchIndexReadExecuted=false。
function buildProvenance(
  graph: LocalRemoteContactGraph,
  contacts: readonly ContactListItem[],
  context: ContactsGraphQueryContext,
): ContactsListSearchProvenance {
  return {
    source: context.source,
    sourceLabel: context.sourceLabel,
    evidenceIds: evidenceIdsForContacts(contacts),
    collectedAt: graph.generatedAt,
    privacy: context.privacy,
    generationMethod: context.generationMethod,
    searchIndexReadExecuted: false,
    databaseQueryExecuted: context.databaseQueryExecuted,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

// buildPayload 是查询主入口：映射表数据、应用过滤器、生成 UI summary 和 nextAction。
function buildPayload(
  graph: LocalRemoteContactGraph,
  input: ContactsListSearchFilterInput = {},
  context: ContactsGraphQueryContext = hybridGraphQueryContext,
): ContactsListSearchPayload {
  const allContacts = toContactListItems(graph);
  const appliedFilters = appliedFiltersFromInput(input);
  const ambiguousContactIds = (graph as LocalRemoteContactGraph & {
    ambiguousContactIds?: readonly string[];
  }).ambiguousContactIds ?? [];
  const ambiguousContactIdSet = new Set(ambiguousContactIds);
  const paged = input.limit !== undefined && input.limit !== null;
  const queryMatchedContacts = allContacts.filter((contact) =>
    includesText(contact, appliedFilters.query),
  );
  if (
    !paged &&
    queryMatchedContacts.some((contact) => ambiguousContactIdSet.has(contact.id))
  ) {
    throw new Error("CONTACT_DETAIL_AMBIGUOUS_CONNECTION");
  }
  const matchedContacts = queryMatchedContacts.filter((contact) =>
    contactMatchesFilters(contact, appliedFilters),
  );
  const matchedContactSet = new Set(matchedContacts);
  const limit = paged ? Math.min(50, Math.max(1, Math.floor(input.limit!))) : matchedContacts.length;
  const fallbackMetadata = paged ? fallbackContactListMetadata(graph) : null;
  const fallbackEntries = fallbackMetadata
    ? allContacts.map((contact, index) => ({
        contact,
        sortKey: fallbackMetadata.sortKeys[index]!,
      }))
    : null;
  const contactsWithFallbackOrder = fallbackEntries
    ? fallbackEntries.filter(({ contact }) => matchedContactSet.has(contact))
    : null;
  const orderedFallbackEntries = contactsWithFallbackOrder
    ? [...contactsWithFallbackOrder].sort((left, right) => {
        const leftPrefixRank = fallbackPrefixRank(left.contact, appliedFilters.query);
        const rightPrefixRank = fallbackPrefixRank(right.contact, appliedFilters.query);
        return leftPrefixRank - rightPrefixRank ||
          left.sortKey.storageOrder - right.sortKey.storageOrder;
      })
    : null;
  const fallbackCursor = fallbackMetadata
    ? decodeContactListKeysetCursor(input.cursor, fallbackMetadata.cursorScope)
    : null;
  const fallbackCursorHasStorageBoundary = Boolean(
    fallbackCursor &&
    orderedFallbackEntries?.every(({ sortKey }) => typeof sortKey.storageAfter === "boolean"),
  );
  const fallbackPageEntries = orderedFallbackEntries
    ? orderedFallbackEntries.filter(({ contact, sortKey }) => {
        if (!fallbackCursor || !fallbackCursorHasStorageBoundary) return true;
        const prefixRank = fallbackPrefixRank(contact, appliedFilters.query);
        return prefixRank > fallbackCursor.prefixRank ||
          (prefixRank === fallbackCursor.prefixRank && sortKey.storageAfter === true);
      })
    : null;
  const offset = paged && !fallbackPageEntries ? pageOffset(input) : 0;
  const contacts = fallbackPageEntries
    ? fallbackPageEntries.slice(0, limit).map(({ contact }) => contact)
    : matchedContacts.slice(offset, offset + limit);
  if (contacts.some((contact) => ambiguousContactIdSet.has(contact.id))) {
    throw new Error("CONTACT_DETAIL_AMBIGUOUS_CONNECTION");
  }
  const nextOffset = offset + contacts.length;
  const hasMoreFallback = fallbackPageEntries
    ? fallbackPageEntries.length > limit
    : false;
  const nextFallbackEntry = fallbackPageEntries?.[limit - 1];
  const nextCursor = fallbackPageEntries
    ? nextFallbackEntry && hasMoreFallback
      ? nextContactListKeysetCursor({
          occurredAt: nextFallbackEntry.sortKey.occurredAt,
          prefixRank: fallbackPrefixRank(nextFallbackEntry.contact, appliedFilters.query),
          recordId: nextFallbackEntry.sortKey.recordId,
          updatedAt: nextFallbackEntry.sortKey.updatedAt,
        }, fallbackMetadata!.cursorScope)
      : undefined
    : paged && nextOffset < matchedContacts.length
      ? nextPageCursor(nextOffset, input)
      : undefined;

  return {
    state: contacts.length > 0 ? "success" : "empty",
    query: appliedFilters.query,
    appliedFilters,
    availableFilters: buildAvailableFilters(allContacts, appliedFilters),
    contacts,
    total: matchedContacts.length,
    ...(nextCursor ? { nextCursor } : {}),
    summary:
      matchedContacts.length > 0
        ? `${matchedContacts.length} contacts matched the hybrid local remote database query.`
        : "No contacts matched the hybrid local remote database query.",
    provenance: buildProvenance(graph, contacts, context),
    nextAction:
      contacts.length > 0
        ? "Use the source-backed local database contacts for agent workflow testing."
        : "Add contacts to the local remote database or clear the filters.",
  };
}

function success(
  payload: ContactsListSearchPayload,
): ContactsListSearchResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

// failure 也走同一个 contacts contract，方便 API route 统一转 envelope。
function failure(
  code: ContactsListSearchFilterErrorCode,
  evidenceIds: readonly string[],
  context: ContactsGraphQueryContext = hybridGraphQueryContext,
): ContactsListSearchFailure {
  const definition = CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS[code];
  const provenance: ContactsListSearchProvenance = {
    source: context.source,
    sourceLabel: `${context.sourceLabel} failure`,
    evidenceIds:
      evidenceIds.length > 0
        ? evidenceIds
        : ["evidence:contacts-local-remote-failure"],
    collectedAt: new Date(0).toISOString(),
    privacy: context.privacy,
    generationMethod: context.generationMethod,
    searchIndexReadExecuted: false,
    databaseQueryExecuted: context.databaseQueryExecuted,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };

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

// scenario 只服务测试/演示状态；success 返回 null 继续执行真实 hybrid 查询。
function scenarioResult(
  graph: LocalRemoteContactGraph,
  scenario: ContactsListSearchFilterScenario,
  context: ContactsGraphQueryContext,
): ContactsListSearchResult | null {
  switch (scenario) {
    case "empty":
      return success({
        ...buildPayload(graph, {}, context),
        contacts: [],
        state: "empty",
        summary: "The hybrid local remote contacts database returned no rows.",
      });
    case "pending":
      return success({
        ...buildPayload(graph, {}, context),
        contacts: [],
        state: "pending",
        summary:
          "The hybrid local remote contacts database is waiting for seed review.",
      });
    case "failure":
      return failure("CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED", [], context);
    case "success":
    default:
      return null;
  }
}

// 查询顺序：读 graph -> scenario 短路 -> 过滤器校验 -> 生成成功 payload。
export function runContactsGraphQuery(
  graph: LocalRemoteContactGraph,
  input: ContactsListSearchFilterInput = {},
  context: ContactsGraphQueryContext = hybridGraphQueryContext,
): ContactsListSearchResult {
  const scenario =
    context.honorScenarios === false
      ? null
      : scenarioResult(graph, normalizeScenario(input.scenario), context);

  if (scenario) {
    return scenario;
  }

  const unsupported = unsupportedFilterFailure(input, context);

  if (unsupported) {
    return unsupported;
  }

  return success(buildPayload(graph, input, context));
}

function runHybridContactsQuery(
  provider: ContactLocalRemoteProvider,
  input: ContactsListSearchFilterInput = {},
): ContactsListSearchResult {
  return runContactsGraphQuery(
    provider.readContactGraph(),
    input,
    hybridGraphQueryContext,
  );
}

// 对外暴露仍然是 ContactsListSearchAndFilterService，调用方不需要知道是否 hybrid。
export function createHybridContactsListSearchAndFilterService(
  options: HybridContactsListSearchAndFilterServiceOptions = {},
): ContactsListSearchAndFilterService {
  const provider =
    options.provider ??
    createContactLocalRemoteProvider({
      database: options.database,
    });

  return {
    listContacts(input = {}): ContactsListSearchResult {
      return runHybridContactsQuery(provider, input);
    },

    searchContacts(input = {}): ContactsListSearchResult {
      return runHybridContactsQuery(provider, input);
    },
  };
}
