/**
 * Owner: 乙 (R11a 人脈; list cards since sprint 0116). Used by: Web 人脈 (/app/contacts), App 人脈 (sync mirror), R10 home.
 * The R11a fields are optional and read tolerantly (contract rule 10); older deployments omit them.
 */
export type ContactCardSourceChip = "meishi" | "linkedin" | "phone" | "manual" | "self" | "event";
export type ContactCardMetKind = "event" | "referral" | "visit" | "other";
/**
 * Order of GET /api/contacts/page (`sort=` query) and of the device's local directory (RD-33, for R10 home 「最近 4 人」):
 * `recent` (default, omitted) = the contact's occurred-at / update time, newest first; `added` = when the person joined
 * 人脈 (`addedAt`: the earlier of the contact's createdAt and LinkedIn connected-on), newest first. Ties: update time, id.
 */
export type ContactCardSort = "recent" | "added";

/** Bounded list previews, not contact details or an offline contact replica. */
export interface ContactCardDTO {
  id: string;
  displayName: string;
  organization: string;
  role: string;
  sourceType: string;
  status: "active" | "needs_follow_up" | "nurture" | "archived";
  pendingInitialization: boolean;
  nextActionPreview: string;
  /** Bounded distinct labels; older page deployments may omit this field. */
  valueTypes?: ("strategic_fit" | "commercial_opportunity" | "knowledge_exchange" | "referral_path" | "community_context")[];
  updatedAt: string;
  /**
   * W0051：该联系人洞察「和你目标的关系」一句，中英各截 60 字。只在 Web 列表请求（带 `insights=1`）时附带；
   * App 与离线同步不带，旧部署可省略。`nextActionPreview` 语义不变。
   */
  insightPreview?: { zh: string; en: string } | undefined;
  /**
   * R11a: information density (D-10) without the plan link. The plan link is merged on read
   * (`goalRelated` on the page; the cached goal-related ids on the App): plan-related people read 3.
   * Self-reported (invite-linked) people already read 3 here.
   */
  density?: 1 | 2 | 3 | undefined;
  /** R11a: where the person came from (shared/compute/contact-source-chip.ts); unknown values read as `manual`. */
  sourceChip?: ContactCardSourceChip | undefined;
  primaryIndustryId?: string | undefined;
  secondaryIndustryId?: string | undefined;
  /** R11a: the normalized region (W0045): ISO country code + canonical English city. */
  region?: { countryCode: string; city?: string | null | undefined } | undefined;
  /** R11a: where we met (出会った場所); unknown values read as `other`. */
  metKind?: ContactCardMetKind | undefined;
  /** R11a: when the person joined the network (R16 #2: the earlier of the LinkedIn connection date and the entry time). */
  addedAt?: string | undefined;
  /** R11a: the latest recorded interaction (contact detail state), for 最終接点. */
  lastInteractionAt?: string | undefined;
  /** R11a: linked to an active plan goal. Only on GET /api/contacts/page (not in the sync mirror). */
  goalRelated?: boolean | undefined;
}

export interface ContactCardPageDTO {
  items: ContactCardDTO[];
  nextCursor: string | null;
  hasMore: boolean;
  asOf: string;
}

export interface ContactCardSummaryDTO {
  /**
   * Matches of the request's query / filters / tab (R11a REVIEW m). With no query or filter it is everyone: the
   * 「N人」 header and the R11b page lock read it that way. The facets below are always counted over every contact.
   */
  total: number;
  sources: Record<string, number>;
  statuses: Record<string, number>;
  values: Record<string, number>;
  /** First 50 global tags; never infer a complete tag catalogue from this. */
  tags: { value: string; count: number }[];
  hasMoreTags: boolean;
  asOf: string;
  /** R08 (R11 owns): people per density 1 / 2 / 3. */
  densityCounts?: { 1: number; 2: number; 3: number } | undefined;
  /** R08 (R11): people added this calendar month. */
  addedThisMonth?: number | undefined;
  /**
   * R11a: the 人脈 tabs. Like the other facets, counted over every contact (not narrowed by the query,
   * filters or tab): goal-related people, and people with an open follow-up (shared/compute/follow-up-task.ts).
   */
  tabCounts?: { goalRelated: number; needsFollowUp: number } | undefined;
  /** R11a facets over every contact: by source chip, primary industry id (`none` = unset), city (`none` = unset), where we met. */
  sourceChips?: Record<string, number> | undefined;
  industries?: Record<string, number> | undefined;
  regions?: Record<string, number> | undefined;
  metKinds?: Record<string, number> | undefined;
}
