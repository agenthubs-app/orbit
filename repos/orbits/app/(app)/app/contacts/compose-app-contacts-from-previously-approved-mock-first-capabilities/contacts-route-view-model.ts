import type {
  ContactListItem,
  ContactsListSearchFilterInput,
  ContactsListSearchPayload,
  ContactsListSearchResult,
} from "../../../../../features/contacts/contract";
import type {
  ContactsListSearchAndFilterService,
  ContactsListSearchServiceResult,
} from "../../../../../features/contacts/service";
import { createAppContactsListSearchAndFilterService } from "./contacts-service-factory";

// Contacts route view model 是服务 contract 到页面 UI 的转换层。
// 它不直接访问数据库或外部服务，只读取 contacts service 返回的 mock-first/hybrid payload。
// service factory 会根据 module mode 决定使用静态 mock 还是 local-remote hybrid 数据源。
export type AppContactsSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppContactsRouteScenario = "empty" | "pending" | "failure";

type SourceType = ContactListItem["source"]["type"];
type StatusType = ContactListItem["status"];
type ValueType = ContactListItem["value"]["valueTypes"][number];

// 这些 view model 类型专门服务页面渲染：
// 字段名偏 UI 语义，避免 React 组件理解底层 contract 的 provenance 结构。
export interface AppContactsFilterOptionViewModel {
  count: number;
  label: string;
  selected: boolean;
  value: string;
}

export interface AppContactsAppliedFiltersViewModel {
  query: string;
  sourceFilters: readonly string[];
  statusFilters: readonly string[];
  tagFilters: readonly string[];
  valueFilters: readonly string[];
}

export interface AppContactListItemViewModel {
  databaseQueryExecuted: boolean;
  detailHref: string;
  displayName: string;
  evidenceIds: readonly string[];
  externalServicesContacted: boolean;
  id: string;
  location: string;
  needsAttention: boolean;
  nextAction: string;
  organization: string;
  profileSnippet: string;
  relationshipContextCopy: string;
  relationshipValueLabels: readonly string[];
  relationshipValueSummary: string;
  role: string;
  searchIndexReadExecuted: boolean;
  sourceLabel: string;
  statusLabel: string;
  tags: readonly string[];
  valueRationale: string;
}

export interface AppContactsPayloadViewModel {
  appliedFilters: AppContactsAppliedFiltersViewModel;
  availableFilters: {
    sources: readonly AppContactsFilterOptionViewModel[];
    statuses: readonly AppContactsFilterOptionViewModel[];
    values: readonly AppContactsFilterOptionViewModel[];
  };
  contacts: readonly AppContactListItemViewModel[];
  ledger: {
    knownPeople: number;
    needsAttention: number;
    sourceFilters: number;
    valueTags: number;
  };
  listEvidenceIds: readonly string[];
  listSummary: string;
  reviewActionRequested: boolean;
}

export interface AppContactsRouteStateViewModel {
  copy: {
    description: string;
    emptyState: string;
    eyebrow: string;
    guardrail: string;
    nextStep: string;
    purpose: string;
    title: string;
  };
  evidenceIds: readonly string[];
  recoveryActions: readonly { href: string; label: string }[];
  scenario: AppContactsRouteScenario;
}

export type AppContactsRouteViewModel =
  | {
      state: "success";
      payload: AppContactsPayloadViewModel;
    }
  | {
      state: "route-state";
      routeState: AppContactsRouteStateViewModel;
    }
  | {
      state: "failure";
      failure: AppContactsRouteStateViewModel["copy"] & {
        evidenceIds: readonly string[];
      };
    };

export interface AppContactsRouteViewModelOptions {
  contactsService?: ContactsListSearchAndFilterService;
}

function contactsServiceFor(
  options: AppContactsRouteViewModelOptions,
): ContactsListSearchAndFilterService {
  return options.contactsService ?? createAppContactsListSearchAndFilterService();
}

function readSearchParam(
  searchParams: AppContactsSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readSearchParamList(
  searchParams: AppContactsSearchParams | undefined,
  key: string,
): readonly string[] {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .flatMap((item) => item.split(","))
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function readRouteScenario(
  searchParams: AppContactsSearchParams | undefined,
): AppContactsRouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function readContactsInput(
  searchParams: AppContactsSearchParams | undefined,
): ContactsListSearchFilterInput {
  return {
    query: readSearchParam(searchParams, "query"),
    sourceFilters: readSearchParamList(searchParams, "source"),
    statusFilters: readSearchParamList(searchParams, "status"),
    tagFilters: readSearchParamList(searchParams, "tag"),
    valueFilters: readSearchParamList(searchParams, "value"),
  };
}

function firstEvidence(evidenceIds: readonly string[] | undefined): string {
  return evidenceIds?.[0] ?? "evidence:unavailable";
}

// evidenceFromContactsResult 让成功/失败两种 contract 都能进入统一状态页证据展示。
function evidenceFromContactsResult(
  result: ContactsListSearchResult,
): string[] {
  if (result.success === false) {
    return [result.error.code];
  }

  return Array.from(result.data.provenance.evidenceIds);
}

async function resolveContactsListSearchResult(
  result: ContactsListSearchServiceResult<ContactsListSearchResult>,
): Promise<ContactsListSearchResult> {
  return result;
}

function sourceLabel(sourceType: SourceType): string {
  const labels: Record<SourceType, string> = {
    business_card_ocr: "Business card OCR",
    calendar_signal: "Calendar signal",
    email_signal: "Email signal",
    event_import: "Event import",
    external_contacts: "External contacts",
    manual: "Manual note",
    qr_scan: "QR scan",
    referral: "Referral",
  };

  return labels[sourceType];
}

function statusLabel(status: StatusType): string {
  const labels: Record<StatusType, string> = {
    active: "Active",
    archived: "Archived",
    needs_follow_up: "Needs follow-up",
    nurture: "Nurture",
  };

  return labels[status];
}

function valueLabel(valueType: ValueType): string {
  const labels: Record<ValueType, string> = {
    commercial_opportunity: "Commercial opportunity",
    community_context: "Community context",
    knowledge_exchange: "Knowledge exchange",
    referral_path: "Referral path",
    strategic_fit: "Strategic fit",
  };

  return labels[valueType];
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

// listSummary 额外识别 hybrid/local 查询，避免把底层 generationMethod 原样暴露给 UI。
function listSummary(payload: ContactsListSearchPayload): string {
  if (payload.contacts.length === 0) {
    return "No source-backed contacts matched the current local search and filter rules.";
  }

  if (
    payload.appliedFilters.query ||
    payload.provenance.generationMethod ===
      "rule-based-contacts-list-search-filter"
  ) {
    return `${formatCount(payload.contacts.length, "source-backed contact")} matched the current local search and filter rules.`;
  }

  return `${formatCount(payload.contacts.length, "source-backed contact")} are available from manual, external, email, and event evidence.`;
}

// detail href 兼容旧 demo 联系人的固定路由，其它联系人按 id 映射。
function contactDetailHref(contact: ContactListItem): string {
  if (contact.displayName === "Kenji Watanabe") {
    return "/app/contacts/demo-contact-1";
  }

  return `/app/contacts/${contact.id.replace(/^contact:/, "")}`;
}

function humanList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function relationshipContextCopy(contact: ContactListItem): string {
  return contact.relationshipContext.replace(
    "climate founders dinner",
    "Climate founders dinner",
  );
}

// externalServicesContacted 是 UI 安全账本聚合字段，任何外部 provider 触发都会显示出来。
function externalServicesContacted(contact: ContactListItem): boolean {
  return (
    contact.externalNetworkRequested ||
    contact.aiProviderRequested ||
    contact.calendarProviderRequested ||
    contact.emailProviderRequested ||
    contact.notificationDelivered
  );
}

// 单条联系人转换：把 contract 字段翻译成卡片需要的 copy、链接、标签和安全账本。
function contactViewModel(contact: ContactListItem): AppContactListItemViewModel {
  const relationshipValueLabels = contact.value.valueTypes.map(valueLabel);

  return {
    databaseQueryExecuted: contact.databaseQueryExecuted,
    detailHref: contactDetailHref(contact),
    displayName: contact.displayName,
    evidenceIds: contact.evidence.map((evidence) => evidence.evidenceId),
    externalServicesContacted: externalServicesContacted(contact),
    id: contact.id,
    location: contact.location,
    needsAttention: contact.status === "needs_follow_up",
    nextAction: contact.nextAction,
    organization: contact.organization,
    profileSnippet: contact.profileSnippet,
    relationshipContextCopy: relationshipContextCopy(contact),
    relationshipValueLabels,
    relationshipValueSummary: `${humanList(relationshipValueLabels)}. ${
      contact.value.rationale
    }`,
    role: contact.role,
    searchIndexReadExecuted: contact.searchIndexReadExecuted,
    sourceLabel: sourceLabel(contact.source.type),
    statusLabel: statusLabel(contact.status),
    tags: contact.tags,
    valueRationale: contact.value.rationale,
  };
}

function contactsPayloadViewModel(input: {
  payload: ContactsListSearchPayload;
  reviewActionRequested: boolean;
}): AppContactsPayloadViewModel {
  // payload 级 view model 聚合列表统计和筛选态，供页面顶部 ledger 与卡片列表共用。
  const contacts = input.payload.contacts.map(contactViewModel);
  const needsAttention = contacts.filter((contact) => contact.needsAttention).length;

  return {
    appliedFilters: {
      query: input.payload.appliedFilters.query,
      sourceFilters: input.payload.appliedFilters.sourceFilters,
      statusFilters: input.payload.appliedFilters.statusFilters,
      tagFilters: input.payload.appliedFilters.tagFilters,
      valueFilters: input.payload.appliedFilters.valueFilters,
    },
    availableFilters: {
      sources: input.payload.availableFilters.sources,
      statuses: input.payload.availableFilters.statuses,
      values: input.payload.availableFilters.values,
    },
    contacts,
    ledger: {
      knownPeople: contacts.length,
      needsAttention,
      sourceFilters: input.payload.availableFilters.sources.length,
      valueTags: input.payload.availableFilters.values.length,
    },
    listEvidenceIds: input.payload.provenance.evidenceIds,
    listSummary: listSummary(input.payload),
    reviewActionRequested: input.reviewActionRequested,
  };
}

function routeRecoveryActions(
  scenario: AppContactsRouteScenario,
): readonly { href: string; label: string }[] {
  if (scenario === "empty") {
    return [
      { href: "/app/contacts", label: "Show all sourced contacts" },
      { href: "/app/contacts?query=storage", label: "Try storage filter" },
    ];
  }

  if (scenario === "pending") {
    return [
      { href: "/app/contacts", label: "Return to available contacts" },
    ];
  }

  return [
    { href: "/app/contacts", label: "Reload contacts list" },
    { href: "/app/contacts?scenario=pending", label: "Check source status" },
  ];
}

async function routeStateViewModel(
  scenario: AppContactsRouteScenario,
  options: AppContactsRouteViewModelOptions,
): Promise<AppContactsRouteStateViewModel> {
  const contactsService = contactsServiceFor(options);

  if (scenario === "empty") {
    const emptyState = await resolveContactsListSearchResult(
      contactsService.listContacts({ scenario: "empty" }),
    );

    return {
      copy: {
        description:
          "Clear the search and filters, or add a contact with source evidence before reviewing follow-up.",
        emptyState: "No source-backed contact rows are ready for review.",
        eyebrow: "No contacts",
        guardrail:
          "Orbit cannot create contacts, tasks, messages, or merges from an empty list.",
        nextStep: emptyState.success
          ? "Clear the search and filters, or add a contact with source evidence before reviewing follow-up."
          : "Reload contacts before reviewing the list.",
        purpose:
          "Keep the contacts page useful when no relationship row is reviewable.",
        title: "No contacts match this view",
      },
      evidenceIds: evidenceFromContactsResult(emptyState),
      recoveryActions: routeRecoveryActions(scenario),
      scenario,
    };
  }

  if (scenario === "pending") {
    const pendingState = await resolveContactsListSearchResult(
      contactsService.listContacts({ scenario: "pending" }),
    );

    return {
      copy: {
        description:
          "Contact rows stay hidden until their source evidence is ready.",
        emptyState:
          "Contact rows stay hidden until source evidence is ready.",
        eyebrow: "Checking sources",
        guardrail:
          "Checking contacts cannot read a search index, query a database, send messages, or deliver notifications.",
        nextStep: "Wait for sourced contacts before taking action.",
        purpose:
          "Keep the contacts page visible while search and filter state resolves.",
        title: "Checking contact sources",
      },
      evidenceIds: evidenceFromContactsResult(pendingState),
      recoveryActions: routeRecoveryActions(scenario),
      scenario,
    };
  }

  const failureState = await resolveContactsListSearchResult(
    contactsService.searchContacts({ scenario: "failure" }),
  );

  return {
    copy: {
      description:
        "Contacts list search and filter is unavailable while local source evidence is being checked.",
      emptyState:
        "No contact, task, message, notification, database, or outside account changed.",
      eyebrow: "Needs retry",
      guardrail:
        "Retry keeps search, storage, email, calendar, AI, notification, and messaging disconnected.",
      nextStep: "Reload the contacts list before reviewing follow-up actions.",
      purpose: "Show a contacts recovery state without side effects.",
      title: "Contacts could not load",
    },
    evidenceIds:
      failureState.success === false
        ? [firstEvidence(failureState.error.evidenceIds)]
        : ["contacts-expected-failure-not-returned"],
    recoveryActions: routeRecoveryActions(scenario),
    scenario,
  };
}

export async function loadAppContactsRouteViewModel(
  searchParams?: AppContactsSearchParams,
  options: AppContactsRouteViewModelOptions = {},
): Promise<AppContactsRouteViewModel> {
  const requestedScenario = readRouteScenario(searchParams);

  if (requestedScenario) {
    return {
      state: "route-state",
      routeState: await routeStateViewModel(requestedScenario, options),
    };
  }

  const contactsService = contactsServiceFor(options);
  const input = readContactsInput(searchParams);
  const reviewActionRequested =
    readSearchParam(searchParams, "action") === "review-filtered-contact";
  const result = reviewActionRequested
    ? await resolveContactsListSearchResult(contactsService.searchContacts(input))
    : await resolveContactsListSearchResult(contactsService.listContacts(input));

  if (result.success === false) {
    return {
      state: "failure",
      failure: {
        description:
          "The contacts page could not compose the local contacts list search and filter state.",
        emptyState:
          "A contacts filter or list boundary returned an unexpected state.",
        evidenceIds: [result.error.code, firstEvidence(result.error.evidenceIds)],
        eyebrow: "Contacts",
        guardrail: "No external action can run when contacts composition fails.",
        nextStep: "Inspect GET /api/contacts.",
        purpose:
          "Stop contacts review when source evidence cannot be composed.",
        title: "Contacts relationship console could not load",
      },
    };
  }

  return {
    state: "success",
    payload: contactsPayloadViewModel({
      payload: result.data,
      reviewActionRequested,
    }),
  };
}
