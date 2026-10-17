/**
 * R17 主催的服务接口（mock = `mock.ts` 示例世界；live = `live.ts`，Postgres + 现有 admission / operations / experience / access）。
 * Owner: 甲 (R17). DESIGN §4。
 * - 每个方法第一个参数是当前 actor；授权在实现里按 `requireEventCapability`（主办侧不走参加者的名单规则 A）。
 * - 失败用 `HostError`（handlers 映射成 AppError + context.reason）。
 */
import type {
  HostCenterFilter,
  HostCenterResponse,
  HostCenterSummary,
  HostDesktopLinkResult,
  HostEventArchiveInput,
  HostEventCancelInput,
  HostEventCodeReissueInput,
  HostEventInput,
  HostEventPublishInput,
  HostEventUpdateInput,
  HostEventView,
  HostEventWriteResult,
} from "../../../shared/contract/host-events";
import type {
  HostAdmitOnSiteInput,
  HostCheckInResult,
  HostCheckInScanInput,
  HostCheckInUndoInput,
  HostKioskHeartbeatInput,
  HostKioskHeartbeatResult,
  HostKioskResponse,
  HostRosterMatchInput,
  HostRosterMatchResponse,
  HostKioskRosterResponse,
  HostMatchingGenerateInput,
  HostMatchingOverridesInput,
  HostMatchingPublishInput,
  HostMatchingResponse,
  HostOverviewResponse,
  HostPeopleBucket,
  HostPeopleDecisionInput,
  HostPeopleDecisionResult,
  HostPeopleResponse,
  HostReportResponse,
  HostSetupDraftInput,
  HostSetupHostNoteInput,
  HostSetupPublishInput,
  HostSetupResponse,
} from "../../../shared/contract/host-console";
import type {
  HostCheckInEventsResponse,
  HostCohostAcceptResult,
  HostCohostInviteInput,
  HostCohostInvitePreview,
  HostCohostInviteResult,
  HostCohostRemoveInput,
  HostCohostRoleInput,
  HostCohostsResponse,
} from "../../../shared/contract/host-cohosts";
import type { HostNoticePreview, HostNoticeSendInput, HostNoticeSendResult, HostSendableNoticeKind } from "../../../shared/contract/host-notices";
import type { OrganizerProfile, OrganizerProfileInput, OrganizerProfileListResponse, OrganizerPublicResponse } from "../../../shared/contract/organizer-profile";

export type HostErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VERSION_CONFLICT"
  | "INVALID_STATE"
  | "VALIDATION"
  | "CAPACITY_FULL"
  | "GENERATION_LIMIT"
  | "UNDO_EXPIRED"
  | "TOKEN_INVALID"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED";

export class HostError extends Error {
  constructor(readonly code: HostErrorCode, message: string = code) {
    super(message);
    this.name = "HostError";
  }
}

export interface HostCenterQuery {
  filter: HostCenterFilter;
  q: string;
  page: number;
}

export interface HostPeopleQuery {
  bucket: HostPeopleBucket;
  q: string;
  incomplete: boolean;
  cursor: string | null;
}

export interface HostService {
  center(actorId: string, query: HostCenterQuery): Promise<HostCenterResponse>;
  centerSummary(actorId: string): Promise<HostCenterSummary>;
  event(actorId: string, eventId: string): Promise<HostEventView | null>;
  createEvent(actorId: string, input: HostEventInput): Promise<HostEventWriteResult>;
  updateEvent(actorId: string, eventId: string, input: HostEventUpdateInput): Promise<HostEventWriteResult>;
  publishEvent(actorId: string, eventId: string, input: HostEventPublishInput): Promise<HostEventWriteResult>;
  cancelEvent(actorId: string, eventId: string, input: HostEventCancelInput): Promise<HostEventWriteResult>;
  archiveEvent(actorId: string, eventId: string, input: HostEventArchiveInput): Promise<HostEventWriteResult>;
  reissueCode(actorId: string, eventId: string, input: HostEventCodeReissueInput): Promise<HostEventWriteResult>;

  overview(actorId: string, eventId: string): Promise<HostOverviewResponse | null>;
  matching(actorId: string, eventId: string, round: number): Promise<HostMatchingResponse | null>;
  generateMatching(actorId: string, eventId: string, input: HostMatchingGenerateInput): Promise<HostMatchingResponse>;
  saveOverrides(actorId: string, eventId: string, input: HostMatchingOverridesInput): Promise<HostMatchingResponse>;
  publishMatching(actorId: string, eventId: string, input: HostMatchingPublishInput): Promise<HostMatchingResponse>;

  people(actorId: string, eventId: string, query: HostPeopleQuery): Promise<HostPeopleResponse | null>;
  decide(actorId: string, eventId: string, applicantActorId: string, input: HostPeopleDecisionInput): Promise<HostPeopleDecisionResult>;

  kiosk(actorId: string, eventId: string, q: string): Promise<HostKioskResponse | null>;
  /** R17-11 名簿照合（邮箱哈希 → 申込済み / 登録済み / 未登録）。 */
  rosterMatch(actorId: string, eventId: string, input: HostRosterMatchInput): Promise<HostRosterMatchResponse>;
  kioskRoster(actorId: string, eventId: string): Promise<HostKioskRosterResponse | null>;
  scanCheckIn(actorId: string, eventId: string, input: HostCheckInScanInput): Promise<HostCheckInResult>;
  checkIn(actorId: string, eventId: string, participantId: string, idempotencyKey: string): Promise<HostCheckInResult>;
  undoCheckIn(actorId: string, eventId: string, participantId: string, input: HostCheckInUndoInput): Promise<HostCheckInResult>;
  admitOnSite(actorId: string, eventId: string, participantId: string, input: HostAdmitOnSiteInput): Promise<HostCheckInResult>;
  heartbeat(actorId: string, eventId: string, input: HostKioskHeartbeatInput): Promise<HostKioskHeartbeatResult>;

  setup(actorId: string, eventId: string): Promise<HostSetupResponse | null>;
  saveSetup(actorId: string, eventId: string, input: HostSetupDraftInput): Promise<HostSetupResponse>;
  publishSetup(actorId: string, eventId: string, input: HostSetupPublishInput): Promise<HostSetupResponse>;
  saveHostNote(actorId: string, eventId: string, input: HostSetupHostNoteInput): Promise<HostSetupResponse>;

  report(actorId: string, eventId: string, view: "all" | "mine"): Promise<HostReportResponse | null>;

  cohosts(actorId: string, eventId: string): Promise<HostCohostsResponse | null>;
  inviteCohost(actorId: string, eventId: string, input: HostCohostInviteInput): Promise<HostCohostInviteResult>;
  revokeInvite(actorId: string, eventId: string, inviteId: string): Promise<HostCohostsResponse>;
  changeCohostRole(actorId: string, eventId: string, subjectActorId: string, input: HostCohostRoleInput): Promise<HostCohostsResponse>;
  removeCohost(actorId: string, eventId: string, subjectActorId: string, input: HostCohostRemoveInput): Promise<HostCohostsResponse>;
  invitePreview(actorId: string | null, code: string, clientKey: string): Promise<HostCohostInvitePreview>;
  acceptInvite(actorId: string, code: string, clientKey: string): Promise<HostCohostAcceptResult>;
  checkInEvents(actorId: string): Promise<HostCheckInEventsResponse>;

  noticePreview(actorId: string, eventId: string, kind: HostSendableNoticeKind): Promise<HostNoticePreview | null>;
  sendNotice(actorId: string, eventId: string, input: HostNoticeSendInput): Promise<HostNoticeSendResult>;
  desktopLink(actorId: string, path: string): Promise<HostDesktopLinkResult>;

  profiles(actorId: string): Promise<OrganizerProfileListResponse>;
  createProfile(actorId: string, input: OrganizerProfileInput): Promise<OrganizerProfile>;
  updateProfile(actorId: string, profileId: string, input: OrganizerProfileInput): Promise<OrganizerProfile>;
  organizerPublic(viewerActorId: string | null, slug: string): Promise<OrganizerPublicResponse | null>;
  /** 旧链接 `/app/o/<eventId|publicCode>` → 所属资料的 slug。 */
  organizerSlugForEvent(alias: string): Promise<string | null>;
  /** 申込页短链 `/e/<slug>` → eventId。 */
  eventIdForSlug(slug: string): Promise<string | null>;
}
