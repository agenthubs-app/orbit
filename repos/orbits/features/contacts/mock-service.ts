/**
 * 联系人列表搜索和筛选的 mock 服务。
 *
 * 这里模拟联系人列表页的两种入口：直接列出联系人，以及按查询/筛选条件搜索。
 * 没有筛选条件时返回标准 fixture；有筛选条件时交给 fixture builder 生成确定性结果。
 */
import {
  CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS,
  CONTACT_SOURCE_FILTERS,
  CONTACT_STATUS_FILTERS,
  CONTACT_TAG_FILTERS,
  CONTACT_VALUE_FILTERS,
  type ContactSourceFilter,
  type ContactStatusFilter,
  type ContactTagFilter,
  type ContactValueFilter,
  type ContactsListSearchFailure,
  type ContactsListSearchFilterErrorCode,
  type ContactsListSearchFilterInput,
  type ContactsListSearchFilterScenario,
  type ContactsListSearchPayload,
  type ContactsListSearchResult,
  type ContactsListSearchSuccess,
} from "./contract";
import {
  buildContactsListSearchPayload,
  mockContactsListFailureProvenance,
  mockContactsListFixture,
  mockEmptyContactsListFixture,
  mockPendingContactsListFixture,
} from "./fixtures";
import type { ContactsListSearchAndFilterService } from "./service";

const supportedScenarios = new Set<ContactsListSearchFilterScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedTags = new Set<ContactTagFilter>(CONTACT_TAG_FILTERS);
const supportedSources = new Set<ContactSourceFilter>(CONTACT_SOURCE_FILTERS);
const supportedValues = new Set<ContactValueFilter>(CONTACT_VALUE_FILTERS);
const supportedStatuses = new Set<ContactStatusFilter>(CONTACT_STATUS_FILTERS);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // 列表 payload 里有联系人数组，返回 clone 可以避免 UI 测试修改全局 fixture。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ContactsListSearchPayload,
): ContactsListSearchSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: ContactsListSearchFilterErrorCode,
): ContactsListSearchFailure {
  // 失败结构从 contract 定义生成，确保 mock 与真实实现的 envelope 兼容。
  const definition = CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockContactsListFailureProvenance,
      evidenceIds: mockContactsListFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ContactsListSearchFilterInput["scenario"],
): ContactsListSearchFilterScenario {
  // scenario 只作为测试状态开关，未知值不会创建新分支。
  if (
    scenario &&
    supportedScenarios.has(scenario as ContactsListSearchFilterScenario)
  ) {
    return scenario as ContactsListSearchFilterScenario;
  }

  return "success";
}

function normalizedValues(values?: readonly (string | null)[] | null): string[] {
  // filter query 可能来自 URL 参数数组；先清理空值再校验白名单。
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

function unsupportedFilterFailure(
  input: ContactsListSearchFilterInput,
): ContactsListSearchFailure | null {
  // 任何一个筛选维度出现未支持值，都返回同一个“筛选不支持”错误。
  if (
    hasUnsupportedValue(normalizedValues(input.tagFilters), supportedTags) ||
    hasUnsupportedValue(
      normalizedValues(input.sourceFilters),
      supportedSources,
    ) ||
    hasUnsupportedValue(normalizedValues(input.valueFilters), supportedValues) ||
    hasUnsupportedValue(normalizedValues(input.statusFilters), supportedStatuses)
  ) {
    return failure("CONTACTS_FILTER_NOT_SUPPORTED");
  }

  return null;
}

function scenarioResult(
  scenario: ContactsListSearchFilterScenario,
): ContactsListSearchResult | null {
  // success 返回 null 代表继续执行正常列表/搜索逻辑。
  switch (scenario) {
    case "empty":
      return success(mockEmptyContactsListFixture);
    case "pending":
      return success(mockPendingContactsListFixture);
    case "failure":
      return failure("CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function runContactsListSearch(
  input: ContactsListSearchFilterInput = {},
): ContactsListSearchResult {
  // listContacts 和 searchContacts 共用这条路径，保持搜索与列表筛选行为一致。
  const resolvedScenario = scenarioResult(normalizeScenario(input.scenario));

  if (resolvedScenario) {
    return resolvedScenario;
  }

  const unsupported = unsupportedFilterFailure(input);

  if (unsupported) {
    return unsupported;
  }

  if (
    !input.query &&
    !input.tagFilters?.length &&
    !input.sourceFilters?.length &&
    !input.valueFilters?.length &&
    !input.statusFilters?.length
  ) {
    return success(mockContactsListFixture);
  }

  return success(buildContactsListSearchPayload(input));
}

export function createMockContactsListSearchAndFilterService(): ContactsListSearchAndFilterService {
  // 两个 public 方法都返回同一个 contract 结果，差异只在调用语义上。
  return {
    listContacts(input = {}): ContactsListSearchResult {
      return runContactsListSearch(input);
    },

    searchContacts(input = {}): ContactsListSearchResult {
      return runContactsListSearch(input);
    },
  };
}

export type { ContactsListSearchResult };
