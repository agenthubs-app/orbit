// 跨客户端契约的公开出口。
// 网页版、API route 与 iOS App 都从这里（或它拷贝出去的副本）取响应形状。
// 新增领域时在这里补一行 export，并同步 repos/orbit-app 的契约副本。

export type {
  ApiEnvelopeContract,
  ApiErrorBodyContract,
  ApiErrorCodeContract,
  ApiFailureEnvelopeContract,
  ApiSuccessEnvelopeContract
} from "./envelope";

export type {
  RelationshipStageCode,
  RelationshipValueTypeCode,
  SourceReferenceContract,
  SourceTypeCode
} from "./source";

export type {
  ContactEvidenceContract,
  ContactFilterOptionContract,
  ContactListItemContract,
  ContactRelationshipValueContract,
  ContactSourceFilterCode,
  ContactSourceReferenceContract,
  ContactStatusFilterCode,
  ContactTagFilterCode,
  ContactValueFilterCode,
  ContactsAppliedFiltersContract,
  ContactsAvailableFiltersContract,
  ContactsListPayloadContract,
  ContactsListProvenanceContract,
  ContactsListStateCode
} from "./contacts";
