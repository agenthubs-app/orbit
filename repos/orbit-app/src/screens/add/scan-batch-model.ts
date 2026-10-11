// R12 名刺 · 読み取り → 自動で人脈へ → まとめて確認 → 完成 (DESIGN §2.2 steps 4–7, App).
// Pure rules over the v2 batch detail: each card's facts for the shared auto-import rule
// (src/api/compute/card-auto-import.ts — the same rule Web's useCardBatch uses), the
// reading list marks, the まとめて確認 sections (重複 / 要確認 by issue code / そのまま
// 追加 / 読み取れず), the confirmation body and the 完成 counts. No React, no IO, no clock.
import { decideCardAutoAction, isCardAutoImportEligible, type CardAutoAction, type CardAutoImportFacts } from "../../api/compute/card-auto-import";
import type { IngestBatchDetailContract, IngestContactCandidateContract, IngestItemContract } from "../../api/contract/business-card-batch";
import { isIndustryIdCode, sanitizeIndustryPair } from "../../api/domain/industries";
import type { BusinessCardReviewCardDraft, BusinessCardReviewFields } from "../../view-models/business-card-batch";
import { cardConfirmationSnapshot, ingestCards, ingestExpired, type IngestCard } from "../../view-models/business-card-ingest";
import type { BatchAttribution, CardMatchFields } from "./add-api";
import type { ScanLedger } from "./add-storage";

// ── 業界・職位レベル・地域 (W0045): one value when the sides agree, a choice when they differ ──

export interface IndustryPick { primaryIndustryId: string; secondaryIndustryId: string | null }
export interface RegionPick { countryCode: string; city: string | null }

export interface EnrichmentDraft {
  industry: { value: IndustryPick | null; conflicted: boolean; choices: IndustryPick[] };
  seniority: { value: string | null; conflicted: boolean; choices: string[] };
  region: { value: RegionPick | null; conflicted: boolean; choices: RegionPick[] };
}

function orderedSides(items: readonly IngestItemContract[]): IngestItemContract[] {
  return [...items].sort((a, b) => (a.side === b.side ? a.seq - b.seq : a.side === "front" ? -1 : 1));
}

/** Same merge as Web's initial industry / seniority / region drafts (ingest-v2-route-view-model). */
export function initialEnrichment(items: readonly IngestItemContract[]): EnrichmentDraft {
  const sides = orderedSides(items);
  const industries: IndustryPick[] = [];
  const seenIndustry = new Set<string>();
  for (const item of sides) {
    const pair = sanitizeIndustryPair(item.extraction?.primaryIndustryId, item.extraction?.secondaryIndustryId);
    const key = `${pair.primaryIndustryId}|${pair.secondaryIndustryId}`;
    if (pair.primaryIndustryId === null || seenIndustry.has(key)) continue;
    seenIndustry.add(key);
    industries.push({ primaryIndustryId: pair.primaryIndustryId, secondaryIndustryId: pair.secondaryIndustryId });
  }
  const primaries = new Set(industries.map((pair) => pair.primaryIndustryId));
  const secondaries = new Set(industries.map((pair) => pair.secondaryIndustryId).filter((id) => id !== null));
  const industryConflict = primaries.size > 1 || secondaries.size > 1;

  const levels = [...new Set(sides.flatMap((item) => (item.extraction?.seniorityLevel ? [item.extraction.seniorityLevel] : [])))];

  const regions: RegionPick[] = [];
  const seenRegion = new Set<string>();
  for (const item of sides) {
    const countryCode = item.extraction?.regionCountryCode ?? null;
    if (!countryCode) continue;
    const city = item.extraction?.regionCity?.trim() || null;
    const key = `${countryCode}|${city ?? ""}`;
    if (seenRegion.has(key)) continue;
    seenRegion.add(key);
    regions.push({ city, countryCode });
  }
  const countries = new Set(regions.map((region) => region.countryCode));
  const cities = new Set(regions.map((region) => region.city).filter((city) => city !== null));
  const regionConflict = countries.size > 1 || cities.size > 1;

  return {
    industry: industryConflict
      ? { choices: industries, conflicted: true, value: null }
      : { choices: industries, conflicted: false, value: industries[0] ? { primaryIndustryId: industries[0].primaryIndustryId, secondaryIndustryId: [...secondaries][0] ?? null } : null },
    region: regionConflict
      ? { choices: regions, conflicted: true, value: null }
      : { choices: regions, conflicted: false, value: regions[0] ? { city: [...cities][0] ?? null, countryCode: regions[0].countryCode } : null },
    seniority: levels.length > 1 ? { choices: levels, conflicted: true, value: null } : { choices: levels, conflicted: false, value: levels[0] ?? null },
  };
}

export function enrichmentNeedsReview(enrichment: EnrichmentDraft): boolean {
  return enrichment.industry.conflicted || enrichment.seniority.conflicted || enrichment.region.conflicted;
}

// ── facts for the shared rule ──

export const isCardSkipped = (card: IngestCard) => card.items.every((item) => item.status === "skipped" || item.status === "excluded");
export const isCardConfirmed = (card: IngestCard) => card.items.every((item) => item.status === "confirmed") && new Set(card.items.map((item) => item.confirmedContactId)).size === 1 && Boolean(card.front.confirmedContactId);
export const isCardReviewable = (card: IngestCard) => card.items.every((item) => item.status === "extracted" || item.status === "terminal_failed");
export const hasTerminalFailure = (card: IngestCard) => card.items.some((item) => item.status === "terminal_failed");
export const cardIssues = (card: IngestCard) => card.items.flatMap((item) => item.reviewIssues);

export function cardAutoImportFacts(card: IngestCard, draft: BusinessCardReviewCardDraft, enrichment: EnrichmentDraft): CardAutoImportFacts {
  return {
    allConfirmed: isCardConfirmed(card),
    allExtracted: card.items.every((item) => item.status === "extracted"),
    conflictedFieldCount: draft.unresolvedConflicts.length,
    displayName: draft.fields.displayName,
    enrichmentNeedsReview: enrichmentNeedsReview(enrichment),
    hasMissingImageDigest: card.items.some((item) => item.imageDigest === null),
    hasTerminalFailure: hasTerminalFailure(card),
    // ingestCards() only returns cards with one front and at most one back.
    invalidStructure: false,
    issueCount: cardIssues(card).length,
    reviewable: isCardReviewable(card),
    // The App draft follows the current item versions (reconcileBusinessCardReviewCard), so no source goes stale.
    staleFieldCount: 0,
  };
}

/** The fields the duplicate lookup compares; the App draft keeps the address in the notes. */
export function cardMatchFields(draft: BusinessCardReviewCardDraft): CardMatchFields {
  const { displayName, email, organization, phone, role } = draft.fields;
  return { address: "", displayName, email, organization, phone, role };
}

// ── what the screen draws ──

/** One card in the reading list (b11 A1 ③). */
export type ScanCardKind = "uploading" | "queued" | "reading" | "duplicate" | "guess" | "failed" | "ready" | "added" | "skipped";
export type ScanSection = "duplicate" | "review" | "ready" | "failed";
export type ScanIssueGroup = "name" | "orgSuffix" | "misread" | "sides" | "enrichment" | "format" | "other";
export type ScanFailure = "image" | "busy";
export type ScanPhase = "loading" | "missing" | "expired" | "cancelled" | "uploading" | "reading" | "importing" | "review" | "done";

export const ISSUE_GROUP_ORDER: readonly ScanIssueGroup[] = ["name", "sides", "misread", "orgSuffix", "format", "enrichment", "other"];

export interface ScanCardView {
  cardId: string;
  kind: ScanCardKind;
  name: string;
  organization: string;
  role: string;
  twoSided: boolean;
  fileName: string;
  section: ScanSection | null;
  issueGroup: ScanIssueGroup | null;
  failure: ScanFailure | null;
  candidate: IngestContactCandidateContract | null;
  card: IngestCard;
  draft: BusinessCardReviewCardDraft | null;
  enrichment: EnrichmentDraft | null;
  flagged: readonly (keyof BusinessCardReviewFields)[];
}

export interface ScanBatchInput {
  detail: IngestBatchDetailContract | null;
  loadFailed: boolean;
  now: number;
  drafts: Readonly<Record<string, BusinessCardReviewCardDraft>>;
  enrichment: Readonly<Record<string, EnrichmentDraft>>;
  /** cardId → candidate (null = looked up, none). A missing key = not looked up yet. */
  matches: Readonly<Record<string, IngestContactCandidateContract | null>>;
  /** True once every lookup reflects the current drafts. */
  matchesReady: boolean;
  attribution: BatchAttribution | null;
  ledger: ScanLedger;
  /** Cards the automatic pass already tried (never twice). */
  autoAttempted: ReadonlySet<string>;
  autoRunning: boolean;
  selectedEventId: string | null;
}

export interface ScanBatchView {
  phase: ScanPhase;
  createdAt: string | null;
  completed: boolean;
  photos: number;
  uploaded: number;
  settled: number;
  cards: readonly ScanCardView[];
  counts: {
    duplicate: number;
    review: number;
    asIs: number;
    autoAdded: number;
    held: number;
    failed: number;
    created: number;
    merged: number;
    unreadable: number;
  };
  events: readonly { eventId: string; title: string; startsAt: string }[];
}

const MISREAD = new Set(["VERIFICATION_MISMATCH"]);
const FORMAT = new Set(["INVALID_EMAIL", "INVALID_PHONE", "SHARED_CONTACT_VALUE", "MULTIPLE_OFFICES"]);
const ISSUE_FIELD: Record<string, keyof BusinessCardReviewFields> = {
  contactPoints: "phone", email: "email", emails: "email", fullName: "displayName", nativeFullName: "displayName",
  organization: "organization", phones: "phone", role: "role", romanizedFullName: "displayName", title: "role",
};

/** 要確認 groups by the existing issue codes (DESIGN §2.2 step 6; no new OCR categories). */
export function issueGroupFor(card: IngestCard, draft: BusinessCardReviewCardDraft, enrichment: EnrichmentDraft): ScanIssueGroup {
  if (!draft.fields.displayName.trim()) return "name";
  if (draft.unresolvedConflicts.length) return "sides";
  if (enrichmentNeedsReview(enrichment)) return "enrichment";
  const issue = cardIssues(card)[0];
  if (!issue) return "other";
  if (issue.code === "IDENTITY_MISSING" || issue.code === "NATIVE_ROMANIZED_NAME_CONFLICT") return "name";
  if (issue.code === "ORG_SUFFIX_MISSING") return "orgSuffix";
  if (MISREAD.has(issue.code)) return "misread";
  if (FORMAT.has(issue.code)) return "format";
  return "other";
}

/** 読み取れず: the codes only tell 画像を読み取れません from 混み合っていて失敗 (§2.2 step 8). */
export function failureFor(card: IngestCard): ScanFailure | null {
  const failed = card.items.find((item) => item.status === "terminal_failed");
  if (!failed) return null;
  return failed.errorCode === "IMAGE_INVALID" || failed.errorCode === "OCR_INVALID_OUTPUT" ? "image" : "busy";
}

export function flaggedFields(card: IngestCard, draft: BusinessCardReviewCardDraft): (keyof BusinessCardReviewFields)[] {
  const flagged = new Set<keyof BusinessCardReviewFields>();
  for (const issue of cardIssues(card)) {
    const field = ISSUE_FIELD[issue.field];
    if (field) flagged.add(field);
  }
  for (const field of draft.unresolvedConflicts) flagged.add(field);
  if (!draft.fields.displayName.trim()) flagged.add("displayName");
  return [...flagged];
}

/** The cards that still wait for the person (reviewable, not confirmed, not skipped). */
export function lookupTargets(cards: readonly IngestCard[], drafts: Readonly<Record<string, BusinessCardReviewCardDraft>>): IngestCard[] {
  return cards.filter((card) => isCardReviewable(card) && !isCardConfirmed(card) && !isCardSkipped(card) && Boolean(drafts[card.cardId]));
}

const READY = new Set(["ready_for_review", "completed"]);

/**
 * The automatic pass (§2.2 step 5): once reading is over, the duplicate lookup and the
 * event attribution are both known, each card not tried yet goes through the shared rule.
 */
export function autoEligible(input: ScanBatchInput): { cardId: string; action: Exclude<CardAutoAction, "review">; mergeInto: string | null }[] {
  const { detail, attribution } = input;
  if (!detail || detail.batch.status !== "ready_for_review" || !input.matchesReady || !attribution) return [];
  return ingestCards(detail).flatMap((card) => {
    const draft = input.drafts[card.cardId];
    const enrichment = input.enrichment[card.cardId];
    if (!draft || !enrichment || input.autoAttempted.has(card.cardId) || !(card.cardId in input.matches)) return [];
    const candidate = input.matches[card.cardId] ?? null;
    const action = decideCardAutoAction({
      ...cardAutoImportFacts(card, draft, enrichment),
      candidate,
      hasEventCandidate: Boolean(attribution.cards[card.cardId]),
      skipped: isCardSkipped(card),
    });
    if (action === "review") return [];
    return [{ action, cardId: card.cardId, mergeInto: action === "merge" ? candidate!.contactId : null }];
  });
}

function kindFor(card: IngestCard, candidate: IngestContactCandidateContract | null, needsLook: boolean): ScanCardKind {
  const statuses = card.items.map((item) => item.status);
  if (isCardConfirmed(card)) return "added";
  if (isCardSkipped(card)) return "skipped";
  if (statuses.some((status) => status === "awaiting_upload" || status === "uploaded")) return "uploading";
  if (statuses.some((status) => status === "processing")) return "reading";
  if (statuses.some((status) => status === "queued")) return "queued";
  if (hasTerminalFailure(card)) return "failed";
  if (candidate) return "duplicate";
  return needsLook ? "guess" : "ready";
}

export function buildScanView(input: ScanBatchInput): ScanBatchView {
  const { detail } = input;
  const cards = detail ? ingestCards(detail) : [];
  const pendingIds = new Set(lookupTargets(cards, input.drafts).map((card) => card.cardId));
  const views: ScanCardView[] = cards.map((card) => {
    const draft = input.drafts[card.cardId] ?? null;
    const enrichment = input.enrichment[card.cardId] ?? null;
    const candidate = input.matches[card.cardId] ?? null;
    const needsLook = Boolean(draft && enrichment) && !isCardAutoImportEligible(cardAutoImportFacts(card, draft!, enrichment!));
    let section: ScanSection | null = null;
    if (pendingIds.has(card.cardId)) section = hasTerminalFailure(card) ? "failed" : candidate ? "duplicate" : needsLook ? "review" : "ready";
    return {
      candidate,
      card,
      cardId: card.cardId,
      draft,
      enrichment,
      failure: failureFor(card),
      fileName: card.front.sourceFileName,
      flagged: draft ? flaggedFields(card, draft) : [],
      issueGroup: section === "review" && draft && enrichment ? issueGroupFor(card, draft, enrichment) : null,
      kind: kindFor(card, candidate, needsLook),
      name: draft?.fields.displayName.trim() ?? "",
      organization: draft?.fields.organization.trim() ?? "",
      role: draft?.fields.role.trim() ?? "",
      section,
      twoSided: Boolean(card.back),
    };
  });
  const count = (section: ScanSection) => views.filter((card) => card.section === section).length;
  const auto = new Set(input.ledger.auto);
  const merged = new Set(input.ledger.merged);
  const confirmed = cards.filter(isCardConfirmed);
  const autoAdded = confirmed.filter((card) => auto.has(card.cardId)).length;
  const held = count("ready");
  const items = cards.flatMap((card) => card.items);
  const candidateEvents = new Set(Object.values(input.attribution?.cards ?? {}).filter((value): value is string => Boolean(value)));
  const mergedCount = confirmed.filter((card) => merged.has(card.cardId)).length;
  return {
    cards: views,
    completed: detail?.batch.status === "completed",
    counts: {
      asIs: autoAdded + held,
      autoAdded,
      created: confirmed.length - mergedCount,
      duplicate: count("duplicate"),
      failed: count("failed"),
      held,
      merged: mergedCount,
      review: count("review"),
      // 読み取れず is never counted as added: an unreadable card not completed by 手入力で補う.
      unreadable: cards.filter((card) => !isCardConfirmed(card) && card.items.some((item) => item.errorCode !== null && (item.status === "terminal_failed" || item.status === "skipped"))).length,
    },
    createdAt: detail?.batch.createdAt ?? null,
    events: (input.attribution?.events ?? []).filter((event) => candidateEvents.has(event.eventId)),
    phase: phaseFor(input, pendingIds.size, [...pendingIds].some((cardId) => !input.autoAttempted.has(cardId))),
    photos: items.length,
    settled: cards.filter((card) => !card.items.some((item) => ["awaiting_upload", "uploaded", "queued", "processing"].includes(item.status))).length,
    uploaded: items.filter((item) => item.status !== "awaiting_upload").length,
  };
}

/**
 * `undecided`: some waiting card has not been through the automatic pass yet. Only then does the
 * page wait for the lookups (an edit that re-runs the duplicate lookup never hides まとめて確認).
 */
function phaseFor(input: ScanBatchInput, pending: number, undecided: boolean): ScanPhase {
  const { detail } = input;
  if (!detail) return input.loadFailed ? "missing" : "loading";
  if (detail.batch.status === "expired" || ingestExpired(detail, input.now)) return "expired";
  if (detail.batch.status === "cancelled") return "cancelled";
  if (detail.batch.status === "collecting") return "uploading";
  if (detail.batch.status === "processing") return "reading";
  if (!READY.has(detail.batch.status)) return "reading";
  if (detail.batch.status === "ready_for_review" && (input.autoRunning || autoEligible(input).length > 0 || (undecided && (!input.attribution || !input.matchesReady)))) return "importing";
  return pending > 0 ? "review" : "done";
}

// ── confirmation ──

/** 会った場所: only the card's own candidate event, and only when the batch choice is that event. */
export function metEventFor(cardId: string, attribution: BatchAttribution | null, selectedEventId: string | null): string | null {
  const candidate = attribution?.cards[cardId] ?? null;
  return candidate && candidate === selectedEventId ? candidate : null;
}

/** Why a card cannot be confirmed as it is (the screen says which). */
export type ConfirmBlock = "name" | "sides" | "enrichment" | null;

export function confirmBlock(draft: BusinessCardReviewCardDraft, enrichment: EnrichmentDraft): ConfirmBlock {
  if (!draft.fields.displayName.trim()) return "name";
  if (draft.unresolvedConflicts.length) return "sides";
  if (enrichmentNeedsReview(enrichment)) return "enrichment";
  return null;
}

/** POST …/items/[itemId]/confirm (or manual-entry) body — the same fields the old review page sent, plus W0015 / W0045. */
export function confirmBody(card: IngestCard, draft: BusinessCardReviewCardDraft, enrichment: EnrichmentDraft, intentId: string, options: { allowDuplicate?: boolean; mergeInto?: string | null; metEventId?: string | null } = {}): Record<string, unknown> {
  const industry = enrichment.industry.value;
  const region = enrichment.region.value;
  return {
    ...draft.fields,
    ...cardConfirmationSnapshot(card.items, intentId, draft.sources),
    allowDuplicate: options.allowDuplicate === true,
    ...(options.mergeInto ? { mergeIntoContactId: options.mergeInto } : {}),
    ...(options.metEventId ? { metEventId: options.metEventId } : {}),
    ...(industry && isIndustryIdCode(industry.primaryIndustryId) ? { primaryIndustryId: industry.primaryIndustryId, secondaryIndustryId: industry.secondaryIndustryId } : {}),
    ...(enrichment.seniority.value ? { seniorityLevel: enrichment.seniority.value } : {}),
    ...(region ? { regionCity: region.city, regionCountryCode: region.countryCode } : {}),
  };
}

/** A stable fingerprint of one confirmation: the same intent id is reused while it is unchanged (idempotent replay). */
export function confirmSeed(card: IngestCard, draft: BusinessCardReviewCardDraft, enrichment: EnrichmentDraft, options: { allowDuplicate?: boolean; mergeInto?: string | null; metEventId?: string | null }): string {
  return JSON.stringify({ draft: draft.fields, enrichment, items: card.items.map((item) => [item.id, item.version]), options, sources: draft.sources });
}

/** The card side a confirmation is posted on (the server resolves the whole card from it). */
export function confirmTarget(card: IngestCard): { itemId: string; manual: boolean } {
  return { itemId: card.front.id, manual: hasTerminalFailure(card) || !card.items.every((item) => item.status === "extracted") };
}

/** The side 撮り直す replaces: the failed one (the front when both failed). */
export function replaceTarget(card: IngestCard): IngestItemContract | null {
  return card.items.find((item) => item.status === "terminal_failed") ?? null;
}

/** The side もう一度読み取る retries: a failed side that failed while busy. */
export function retryTarget(card: IngestCard): IngestItemContract | null {
  return card.items.find((item) => item.status === "terminal_failed" && item.errorCode !== "IMAGE_INVALID" && item.errorCode !== "OCR_INVALID_OUTPUT") ?? null;
}
