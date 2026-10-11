/**
 * R15 招待：资料 → 共享值、联系人字段的读与写（DESIGN add-and-invite §2.6、§9 #17 #37）。Owner: 甲 (R15).
 * Used by: `service.ts`（兑换时建 / 统合联系人、解除时清字段）、`sync.ts`（资料同步）。
 *
 * - 值一律从本人资料按「共享的键」读（客户端只传键）：名字总是共享；`organization` = 会社 + 役職；
 *   `offering` / `seeking` 写进联系人 `publicProfile.offering / seeking`；`email` / `phone` 写 `primaryEmail / primaryPhone`。
 * - 标量字段走 R12 的 `applyContactFieldValues`（覆盖 + `fieldHistory`）；列表字段同样以「读 → 条件更新」写，
 *   旧值也进同一个 `fieldHistory`（`field: 'offering' | 'seeking'`，值按「、」拼成一行），供 R11 详情显示。
 */
import type { InviteSharedFieldKey, InviteSharedFields } from "../../shared/contract/invite-codes";
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { ownedByActor } from "../contacts/business-card-contact-match";
import {
  applyContactFieldValues,
  CONTACT_FIELD_HISTORY_LIMIT,
  CONTACT_FIELD_PAYLOAD_KEY,
  ContactFieldWriteError,
  type ContactFieldWriteSource,
  type ContactWritableField,
} from "../contacts/contact-field-write";
import { INVITE_KEY_FIELDS, type InviteProfile, type InviteSyncField } from "./contract";

type ContactRecord = LiveRecord<Record<string, unknown>>;
type ContactStore = Pick<LiveRecordStoreLike<Record<string, unknown>>, "getRecord" | "updateRecordIfCurrent">;

const LIST_FIELDS = ["offering", "seeking"] as const;
type ListField = (typeof LIST_FIELDS)[number];
const SCALAR_FIELDS: readonly ContactWritableField[] = ["displayName", "organization", "role", "email", "phone"];
const LIST_SEPARATOR = "\n";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** 列表：去空白、去重、最多 20 条（与契约 schema 一致）。 */
export function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const clean = text(item);
    if (clean && !seen.has(clean) && out.length < 20) {
      seen.add(clean);
      out.push(clean.slice(0, 200));
    }
  }
  return out;
}

function listValue(items: readonly string[]): string | null {
  return items.length ? items.join(LIST_SEPARATOR) : null;
}

/** 共享的键 → 要写 / 同步的联系人字段（名字总在里面）。 */
export function fieldsForKeys(keys: readonly InviteSharedFieldKey[]): InviteSyncField[] {
  return ["displayName", ...keys.flatMap((key) => INVITE_KEY_FIELDS[key])];
}

/** 资料里这个字段的值（空 = null）。 */
export function profileFieldValue(profile: InviteProfile, field: InviteSyncField): string | null {
  switch (field) {
    case "displayName":
      return text(profile.displayName);
    case "offering":
      return listValue(profile.offering);
    case "seeking":
      return listValue(profile.seeking);
    default:
      return text(profile[field]);
  }
}

/** 联系人上这个字段的当前值（空 = null）。 */
export function contactFieldValue(payload: Record<string, unknown>, field: InviteSyncField): string | null {
  if (field === "offering" || field === "seeking") {
    const publicProfile = payload.publicProfile as Record<string, unknown> | undefined;
    return listValue(cleanList(publicProfile?.[field]));
  }
  return text(payload[CONTACT_FIELD_PAYLOAD_KEY[field]]);
}

/**
 * 按键从资料取共享值（响应 / 预览用）。`includeContact = false` 时永远不含邮箱和电话（公开预览，§6 第 6 条）。
 * 资料里没有的项不出现（对方看不到空开关）。
 */
export function sharedFieldsFromProfile(profile: InviteProfile, keys: readonly InviteSharedFieldKey[], options: { includeContact: boolean }): InviteSharedFields {
  const fields: InviteSharedFields = { displayName: profile.displayName.slice(0, 80) };
  const has = (key: InviteSharedFieldKey) => keys.includes(key);
  if (has("organization")) {
    if (profile.organization) fields.organization = profile.organization.slice(0, 120);
    if (profile.role) fields.role = profile.role.slice(0, 80);
  }
  if (has("offering") && profile.offering.length) fields.offering = [...profile.offering];
  if (has("seeking") && profile.seeking.length) fields.seeking = [...profile.seeking];
  if (options.includeContact) {
    if (has("email") && profile.email) fields.email = profile.email.slice(0, 254);
    if (has("phone") && profile.phone) fields.phone = profile.phone.slice(0, 40);
  }
  return fields;
}

/** 招待新建联系人时的 payload 片段（只含共享且资料里有值的字段）。 */
export function contactPayloadFromProfile(profile: InviteProfile, keys: readonly InviteSharedFieldKey[]): Record<string, unknown> {
  const payload: Record<string, unknown> = { displayName: profile.displayName };
  for (const field of fieldsForKeys(keys)) {
    if (field === "displayName") continue;
    const value = profileFieldValue(profile, field);
    if (value === null) continue;
    if (field === "offering" || field === "seeking") {
      payload.publicProfile = { ...(payload.publicProfile as Record<string, unknown> | undefined), [field]: profile[field] };
    } else {
      payload[CONTACT_FIELD_PAYLOAD_KEY[field]] = value;
    }
  }
  return payload;
}

export interface InviteFieldWriteInput {
  store: ContactStore;
  workspaceId: string;
  actorId: string;
  contactId: string;
  /** 字段 → 新值（null = 清空；名字不能清空，传 null 会被忽略）。 */
  values: Partial<Record<InviteSyncField, string | null>>;
  source: ContactFieldWriteSource;
  now: () => Date;
}

function historyOf(payload: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(payload.fieldHistory) ? (payload.fieldHistory as Record<string, unknown>[]) : [];
}

async function writeListFields(input: InviteFieldWriteInput, values: Partial<Record<ListField, string | null>>): Promise<void> {
  const updateRecordIfCurrent = input.store.updateRecordIfCurrent?.bind(input.store);
  if (!updateRecordIfCurrent) throw new ContactFieldWriteError("UNSUPPORTED", "Contact storage does not support conditional updates.");
  for (let attempt = 0; attempt < 3; attempt++) {
    const record = await input.store.getRecord({ collectionName: "contacts", recordId: input.contactId, workspaceId: input.workspaceId });
    if (!record || record.lifecycleState !== "active" || !ownedByActor(record, input.actorId)) throw new ContactFieldWriteError("NOT_FOUND", "The contact was not found.");
    const updatedAt = new Date(Math.max(input.now().getTime(), Date.parse(record.updatedAt) + 1)).toISOString();
    const payload: Record<string, unknown> = { ...record.payload };
    const publicProfile: Record<string, unknown> = { ...((payload.publicProfile as Record<string, unknown> | undefined) ?? {}) };
    const history = historyOf(payload);
    let changed = false;
    for (const field of LIST_FIELDS) {
      if (!(field in values)) continue;
      const previous = contactFieldValue(payload, field);
      const next = values[field] ?? null;
      if (previous === next) continue;
      if (next === null) delete publicProfile[field];
      else publicProfile[field] = next.split(LIST_SEPARATOR);
      history.push({ at: updatedAt, field, next: next?.split(LIST_SEPARATOR).join("、") ?? null, previous: previous?.split(LIST_SEPARATOR).join("、") ?? null, source: input.source });
      changed = true;
    }
    if (!changed) return;
    if (Object.keys(publicProfile).length) payload.publicProfile = publicProfile;
    else delete payload.publicProfile;
    payload.fieldHistory = history.slice(-CONTACT_FIELD_HISTORY_LIMIT);
    payload.updatedAt = updatedAt;
    const written = await updateRecordIfCurrent({ ...record, payload, updatedAt }, { updatedAt: record.updatedAt, userId: record.userId ?? null });
    if (written) return;
  }
  throw new ContactFieldWriteError("CONFLICT", "The contact kept changing while saving.");
}

/** 覆盖写一组字段（标量走 `applyContactFieldValues`，列表同口径），旧值进 `fieldHistory`。 */
export async function writeInviteFields(input: InviteFieldWriteInput): Promise<void> {
  const scalar: Partial<Record<ContactWritableField, string | null>> = {};
  for (const field of SCALAR_FIELDS) {
    if (!(field in input.values)) continue;
    const value = input.values[field] ?? null;
    if (field === "displayName" && value === null) continue;
    scalar[field] = value;
  }
  if (Object.keys(scalar).length) {
    await applyContactFieldValues({
      actorId: input.actorId,
      contactId: input.contactId,
      now: input.now,
      source: input.source,
      store: input.store,
      values: scalar,
      workspaceId: input.workspaceId,
    });
  }
  const lists: Partial<Record<ListField, string | null>> = {};
  for (const field of LIST_FIELDS) if (field in input.values) lists[field] = input.values[field] ?? null;
  if (Object.keys(lists).length) await writeListFields(input, lists);
}

/** 这条联系人当前的同步字段值（只取 `fields` 里列的）。 */
export async function readContactValues(store: ContactStore, workspaceId: string, actorId: string, contactId: string): Promise<ContactRecord | null> {
  const record = await store.getRecord({ collectionName: "contacts", recordId: contactId, workspaceId });
  return record && record.lifecycleState === "active" && ownedByActor(record, actorId) ? record : null;
}

/**
 * 我自己改过、因此停止同步的键：这个键下任一字段「招待写过」（在 `values` 里）且联系人上的当前值与上次同步值不同。
 */
export function pausedKeys(payload: Record<string, unknown>, values: Partial<Record<InviteSyncField, string>>, keys: readonly InviteSharedFieldKey[]): InviteSharedFieldKey[] {
  return keys.filter((key) => INVITE_KEY_FIELDS[key].some((field) => field in values && contactFieldValue(payload, field) !== (values[field] ?? null)));
}
