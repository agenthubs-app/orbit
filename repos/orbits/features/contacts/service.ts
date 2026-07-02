import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  ContactsListSearchFailure,
  ContactsListSearchFilterInput,
  ContactsListSearchResult,
} from "./contract";

// ContactsListSearchAndFilterService 是联系人列表页的读模型边界。
// 它只处理列表、搜索和过滤，不负责联系人详情编辑或关系证据写入。
export interface ContactsListSearchAndFilterService {
  // 根据筛选条件读取联系人列表。
  listContacts: (
    input?: ContactsListSearchFilterInput,
  ) => ContactsListSearchServiceResult<ContactsListSearchResult>;
  // 搜索联系人；当前 contract 与列表复用同一输入结构。
  searchContacts: (
    input?: ContactsListSearchFilterInput,
  ) => ContactsListSearchServiceResult<ContactsListSearchResult>;
}

export type ContactsListSearchServiceResult<TResult> =
  TResult | Promise<TResult>;

// 将联系人列表失败转换成统一 AppError。
export function contactsListSearchFailureToAppError(
  failure: ContactsListSearchFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

function isLiveFailure(failure: ContactsListSearchFailure): boolean {
  return failure.error.provenance.generationMethod === "live-store-query";
}

// API route 使用该上下文补充 mock 来源、隐私边界和 feature mode。
export function contactsListSearchFailureContext(
  failure: ContactsListSearchFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const liveFailure = isLiveFailure(failure);

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    contactsListSearchFilterErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      liveFailure
        ? "Contacts list search failure came from the live storage boundary."
        : "Mock contacts list search and filter failure came from deterministic fixture rules.",
    service: liveFailure
      ? "contacts-list-search-filter-live"
      : "contacts-list-search-and-filter-mock",
  };
}

export type { ContactsListSearchResult };
