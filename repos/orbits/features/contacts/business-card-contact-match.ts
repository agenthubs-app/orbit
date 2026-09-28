/**
 * 名片 ↔ 已有联系人：找「可能是同一个人」的候选、判断是否完全一致、把名片并入已有联系人。
 *
 * 读写都直接用联系人记录的原始 payload——ContactDTO 读取器只映射了部分字段
 * （location / notes / 行业 / 标签都不在里面），用它读出来再整条写回会把这些字段抹掉。
 */
import type { IngestContactCandidateContract } from "../../shared/contract/business-card-batch";
import type { IndustrySelectionContract } from "../../shared/contract/industries";
import { sanitizeIndustryPair } from "../../shared/domain/industries";
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";

export interface CardContactFields {
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  address: string;
}

export type ContactMatchReason = "email" | "phone" | "name_organization";

export type ContactCandidate = IngestContactCandidateContract;

type ContactRecord = LiveRecord<Record<string, unknown>>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function compactName(value: string): string {
  return normalized(value).replace(/\s/g, "");
}

/** 备注去重用：去掉空白与标点、统一大小写与全半角。 */
function comparable(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function contactFields(payload: Record<string, unknown>): CardContactFields {
  return {
    address: text(payload.location),
    displayName: text(payload.displayName),
    email: text(payload.primaryEmail),
    organization: text(payload.organization),
    phone: text(payload.primaryPhone),
    role: text(payload.role),
  };
}

function sameField(field: keyof CardContactFields, left: string, right: string): boolean {
  if (field === "phone") return phoneDigits(left) === phoneDigits(right);
  if (field === "displayName") return compactName(left) === compactName(right);
  return normalized(left) === normalized(right);
}

const FIELDS: readonly (keyof CardContactFields)[] = ["displayName", "organization", "role", "email", "phone", "address"];

export function contactFieldsIdentical(existing: CardContactFields, card: CardContactFields): boolean {
  return FIELDS.every((field) => sameField(field, existing[field], card[field]));
}

export function ownedByActor(record: ContactRecord, actorId: string): boolean {
  return record.userId === actorId && (record.payload.accountId == null || record.payload.accountId === actorId);
}

function matchReasons(existing: CardContactFields, card: CardContactFields): ContactMatchReason[] {
  const reasons: ContactMatchReason[] = [];
  if (card.email && existing.email && sameField("email", existing.email, card.email)) reasons.push("email");
  const digits = phoneDigits(card.phone);
  if (digits.length >= 7 && digits === phoneDigits(existing.phone)) reasons.push("phone");
  if (
    card.displayName &&
    card.organization &&
    sameField("displayName", existing.displayName, card.displayName) &&
    sameField("organization", existing.organization, card.organization)
  ) {
    reasons.push("name_organization");
  }
  return reasons;
}

/**
 * 同邮箱、同电话、或同名同公司 → 候选。命中理由最多的排前面；完全一致的优先。
 * 与联系人写入服务的重复判定（同邮箱 / 同名同公司）是超集关系：这里没有候选时，服务端也不会判重。
 */
export function findContactCandidate(
  records: readonly ContactRecord[],
  actorId: string,
  card: CardContactFields,
): ContactCandidate | null {
  let best: ContactCandidate | null = null;
  for (const record of records) {
    if (!ownedByActor(record, actorId) || record.lifecycleState !== "active") continue;
    const existing = contactFields(record.payload);
    const matchedOn = matchReasons(existing, card);
    if (!matchedOn.length) continue;
    const candidate: ContactCandidate = {
      ...existing,
      contactId: record.recordId,
      identical: contactFieldsIdentical(existing, card),
      matchedOn,
    };
    const better =
      !best ||
      (candidate.identical && !best.identical) ||
      (candidate.identical === best.identical && candidate.matchedOn.length > best.matchedOn.length);
    if (better) best = candidate;
  }
  return best;
}

const CONTACT_MATCH_READ_LIMIT = 20_000;
const MATCH_PAYLOAD_FIELDS = ["id", "accountId", "displayName", "organization", "role", "primaryEmail", "primaryPhone", "location"] as const;

export async function listActorContactRecords(
  store: Pick<LiveRecordStoreLike<Record<string, unknown>>, "listRecords">,
  workspaceId: string,
  actorId: string,
): Promise<readonly ContactRecord[]> {
  // 只取比对需要的字段；上限远高于单个用户的人脉规模，超出部分不参与查重（确认时服务端仍按原规则判重）。
  const records = await store.listRecords({
    collectionName: "contacts",
    lifecycleState: "active",
    limit: CONTACT_MATCH_READ_LIMIT,
    payloadFields: MATCH_PAYLOAD_FIELDS,
    userId: actorId,
    workspaceId,
  });
  return records.filter((record) => ownedByActor(record, actorId));
}

const PAYLOAD_KEY: Record<Exclude<keyof CardContactFields, "displayName">, string> = {
  address: "location",
  email: "primaryEmail",
  organization: "organization",
  phone: "primaryPhone",
  role: "role",
};

const FIELD_LABEL: Record<keyof CardContactFields, string> = {
  address: "地址",
  displayName: "姓名",
  email: "邮箱",
  organization: "公司",
  phone: "电话",
  role: "职位",
};

export class ContactMergeRejected extends Error {}

function emptyValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

/**
 * 行业只补空、不覆盖：联系人没有一级行业（也没有二级）时整对写入；一级相同且二级为空时只补二级。
 * 一级不同一律不动——名片上的判断不能推翻用户已有的分类。
 */
function fillEmptyIndustry(payload: Record<string, unknown>, industry: IndustrySelectionContract | undefined): void {
  const card = sanitizeIndustryPair(industry?.primaryIndustryId, industry?.secondaryIndustryId);
  if (!card.primaryIndustryId) return;
  if (emptyValue(payload.primaryIndustryId)) {
    if (!emptyValue(payload.secondaryIndustryId)) return;
    payload.primaryIndustryId = card.primaryIndustryId;
    if (card.secondaryIndustryId) payload.secondaryIndustryId = card.secondaryIndustryId;
    return;
  }
  if (payload.primaryIndustryId === card.primaryIndustryId && emptyValue(payload.secondaryIndustryId) && card.secondaryIndustryId) {
    payload.secondaryIndustryId = card.secondaryIndustryId;
  }
}

/** W0015：「在该活动认识」只补空：联系人已经记着一场活动（哪怕是别的）就不动。 */
function fillEmptyMetEvent(payload: Record<string, unknown>, metEvent: { eventId: string; title: string } | null | undefined): void {
  const eventId = metEvent?.eventId.trim();
  if (!eventId || !emptyValue(payload.metEventId)) return;
  payload.metEventId = eventId;
  const title = metEvent?.title.trim();
  if (title) payload.metEventTitle = title;
}

/**
 * 把名片并入已有联系人：联系人空着的字段（含行业）用名片补上；两边都有且不同的不覆盖，
 * 写进备注「名片补充」一段；名片备注里联系人还没有的行（传真、微信…）也补进去。
 * 已有内容一律不删不改。按 updatedAt 条件更新，期间联系人被改过就拒绝（调用方回滚整个确认）。
 */
export async function mergeCardIntoContact(input: {
  store: Pick<LiveRecordStoreLike<Record<string, unknown>>, "getRecord" | "updateRecordIfCurrent">;
  workspaceId: string;
  actorId: string;
  contactId: string;
  card: CardContactFields;
  cardNotes: string;
  evidenceIds: readonly string[];
  /** 审阅页确认的行业；只补联系人空着的行业字段。 */
  industry?: IndustrySelectionContract;
  /** 服务端核实过的「在该活动认识」；只补联系人空着的来源活动。 */
  metEvent?: { eventId: string; title: string } | null;
  now?: () => Date;
}): Promise<string> {
  const record = await input.store.getRecord({ collectionName: "contacts", recordId: input.contactId, workspaceId: input.workspaceId });
  if (!record || !ownedByActor(record, input.actorId) || record.lifecycleState !== "active") {
    throw new ContactMergeRejected("The contact to merge into was not found.");
  }
  if (!input.store.updateRecordIfCurrent) {
    throw new ContactMergeRejected("Contact storage does not support conditional updates.");
  }
  const payload: Record<string, unknown> = { ...record.payload };
  const existing = contactFields(payload);
  const supplements: string[] = [];

  if (input.card.displayName && !sameField("displayName", existing.displayName, input.card.displayName)) {
    supplements.push(`${FIELD_LABEL.displayName}: ${input.card.displayName}`);
  }
  for (const field of Object.keys(PAYLOAD_KEY) as (keyof typeof PAYLOAD_KEY)[]) {
    const value = input.card[field].trim();
    if (!value) continue;
    if (!existing[field]) payload[PAYLOAD_KEY[field]] = value;
    else if (!sameField(field, existing[field], value)) supplements.push(`${FIELD_LABEL[field]}: ${value}`);
  }
  fillEmptyIndustry(payload, input.industry);
  fillEmptyMetEvent(payload, input.metEvent);

  const currentNotes = text(payload.notes);
  // 按「值」去重：同一个号码换了标签（「传真」/「传真(Fax)」）不算新信息；
  // 联系人字段里已有的值（包括刚补上的）也不再写进备注。
  const known = [currentNotes, ...Object.values(contactFields(payload))].map(comparable).join("\n");
  const noteLines = input.cardNotes
    .split(/\r?\n/)
    .map((line) => line.trim())
    // 「正面 · 文件名」是确认页给人看的分组标题，不是名片内容。
    .filter((line) => line && !/^(正面|反面) · /.test(line))
    .filter((line) => {
      const value = comparable(line.slice(line.search(/[:：]/) + 1));
      return value && !known.includes(value);
    });
  const added = [...supplements, ...noteLines.filter((line) => !supplements.includes(line))];
  const now = input.now?.() ?? new Date();
  if (added.length) {
    const block = `名片补充 · ${now.toISOString().slice(0, 10)}\n${added.join("\n")}`;
    payload.notes = currentNotes ? `${currentNotes}\n\n${block}` : block;
  }

  const evidenceIds = [...new Set([...record.evidenceIds, ...input.evidenceIds].map((id) => id.trim()).filter(Boolean))];
  payload.evidenceIds = evidenceIds;
  const updatedAt = new Date(Math.max(now.getTime(), Date.parse(record.updatedAt) + 1)).toISOString();
  payload.updatedAt = updatedAt;
  const merged = contactFields(payload);
  const updated = await input.store.updateRecordIfCurrent(
    {
      ...record,
      evidenceIds,
      payload,
      searchText: [merged.displayName, merged.organization, merged.role, merged.email, merged.phone, merged.address, text(payload.profileSnippet), text(payload.notes)]
        .filter(Boolean)
        .join(" "),
      updatedAt,
    },
    { updatedAt: record.updatedAt, userId: record.userId ?? null },
  );
  if (!updated) throw new ContactMergeRejected("The contact changed while merging. Refresh and try again.");
  return record.recordId;
}
