/**
 * R12（DESIGN §3.1、§9 #37，复核 M5）：联系人「按字段覆盖 + 历史」写入。
 * Owner: 甲 (R12). Used by: 手入力统合（`manual-contact-v2`）；R15 招待统合 / 同步、R16 あとで補完 会复用。
 *
 * - 按字段写：值为字符串 → 覆盖（去首尾空白；空串等同清空），`null` → 清空；没列的字段不动。
 *   姓名不能清空（联系人必须有名字）。
 * - 乐观并发：读 → 改 → `updateRecordIfCurrent`（以读到的 updatedAt 为前提）；别人先改了就重读重试，
 *   最多 3 次，仍冲突抛 `ContactFieldWriteError('CONFLICT')`。
 * - 被覆盖 / 清空的旧值写进联系人 payload 的 `fieldHistory`（每条 `{ field, previous, next, source, at }`，
 *   最多 50 条，超出丢最旧）。开工核对：`contacts` 记录的读取方（ContactDTO 映射、同步 `deviceContactDetail`、
 *   列表 / 首页 / 计划的 SQL 读取）都按键取值，没有 exactKeys 一类的键白名单，payload 多一个数组是安全的。
 * - 只改本人、未删除的联系人；别人的 / 不存在的 / 已删除的一律 `NOT_FOUND`（不泄露存在与否）。
 * - 现有 `mergeCardIntoContact`（只补空字段）不改，名片继续用它。
 */
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { ownedByActor } from "./business-card-contact-match";

export type ContactWritableField = "displayName" | "organization" | "role" | "email" | "phone";
export type ContactFieldWriteSource = "manual" | "invite" | "invite_sync" | "completion";

export interface ContactFieldHistoryEntry {
  field: ContactWritableField;
  previous: string | null;
  next: string | null;
  source: ContactFieldWriteSource;
  at: string;
}

export const CONTACT_FIELD_HISTORY_LIMIT = 50;
export const CONTACT_FIELD_WRITE_MAX_ATTEMPTS = 3;

/** 字段 → 联系人 payload 的键（与 ContactDTO 同名）。 */
export const CONTACT_FIELD_PAYLOAD_KEY: Readonly<Record<ContactWritableField, string>> = {
  displayName: "displayName",
  email: "primaryEmail",
  organization: "organization",
  phone: "primaryPhone",
  role: "role",
};

const FIELDS: readonly ContactWritableField[] = ["displayName", "organization", "role", "email", "phone"];

export type ContactFieldWriteErrorCode = "NOT_FOUND" | "CONFLICT" | "INVALID" | "UNSUPPORTED";

export class ContactFieldWriteError extends Error {
  readonly code: ContactFieldWriteErrorCode;

  constructor(code: ContactFieldWriteErrorCode, message: string) {
    super(message);
    this.name = "ContactFieldWriteError";
    this.code = code;
  }
}

export interface ApplyContactFieldValuesInput {
  store: Pick<LiveRecordStoreLike<Record<string, unknown>>, "getRecord" | "updateRecordIfCurrent">;
  workspaceId: string;
  actorId: string;
  contactId: string;
  values: Partial<Record<ContactWritableField, string | null>>;
  source: ContactFieldWriteSource;
  /** 追加到联系人备注末尾的几行（已有备注里出现过的行不重复追加）。不进字段历史。 */
  appendNoteLines?: readonly string[];
  /** 「在该活动认识」：联系人还没记着活动时才补上（与名片 `fillEmptyMetEvent` 同一口径）。 */
  fillMetEvent?: { eventId: string; title?: string | null } | null;
  now?: () => Date;
}

export interface ApplyContactFieldValuesResult {
  contactId: string;
  /** 实际发生变化的字段。 */
  changed: ContactWritableField[];
  /** 没有任何变化时为 false（不写库）。 */
  written: boolean;
  updatedAt: string;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readHistory(value: unknown): ContactFieldHistoryEntry[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is ContactFieldHistoryEntry => typeof entry === "object" && entry !== null && typeof (entry as { field?: unknown }).field === "string")
    : [];
}

function searchTextFor(payload: Record<string, unknown>): string {
  return [payload.displayName, payload.organization, payload.role, payload.primaryEmail, payload.primaryPhone, payload.location, payload.profileSnippet, payload.notes]
    .map(text)
    .filter(Boolean)
    .join(" ");
}

type ContactRecord = LiveRecord<Record<string, unknown>>;

/** 一次尝试：基于 `record` 算出新 payload；没有变化返回 null。 */
function nextPayload(record: ContactRecord, input: ApplyContactFieldValuesInput, at: string): { payload: Record<string, unknown>; changed: ContactWritableField[] } | null {
  const payload: Record<string, unknown> = { ...record.payload };
  const changed: ContactWritableField[] = [];
  const history = readHistory(payload.fieldHistory);
  for (const field of FIELDS) {
    const raw = input.values[field];
    if (raw === undefined) continue;
    if (raw !== null && typeof raw !== "string") throw new ContactFieldWriteError("INVALID", `${field} must be a string or null.`);
    const next = raw === null ? null : text(raw);
    if (field === "displayName" && next === null) throw new ContactFieldWriteError("INVALID", "A contact must keep a name.");
    const key = CONTACT_FIELD_PAYLOAD_KEY[field];
    const previous = text(payload[key]);
    // 覆盖语义：去首尾空白后逐字相同才算没变（用户选了「这次的写法」就照写）。
    if (previous === next) continue;
    if (next === null) delete payload[key];
    else payload[key] = next;
    changed.push(field);
    history.push({ at, field, next, previous, source: input.source });
  }

  let notesChanged = false;
  const lines = (input.appendNoteLines ?? []).map((line) => line.trim()).filter(Boolean);
  if (lines.length) {
    const current = typeof payload.notes === "string" ? payload.notes : "";
    const existing = new Set(current.split(/\r?\n/).map((line) => line.trim()));
    const added = lines.filter((line, index) => !existing.has(line) && lines.indexOf(line) === index);
    if (added.length) {
      payload.notes = current.trim() ? `${current.trimEnd()}\n${added.join("\n")}` : added.join("\n");
      notesChanged = true;
    }
  }

  let metEventChanged = false;
  const eventId = input.fillMetEvent?.eventId.trim();
  if (eventId && !text(payload.metEventId)) {
    payload.metEventId = eventId;
    const title = text(input.fillMetEvent?.title);
    if (title) payload.metEventTitle = title;
    metEventChanged = true;
  }

  if (!changed.length && !notesChanged && !metEventChanged) return null;
  if (changed.length) payload.fieldHistory = history.slice(-CONTACT_FIELD_HISTORY_LIMIT);
  return { changed, payload };
}

export async function applyContactFieldValues(input: ApplyContactFieldValuesInput): Promise<ApplyContactFieldValuesResult> {
  const updateRecordIfCurrent = input.store.updateRecordIfCurrent?.bind(input.store);
  if (!updateRecordIfCurrent) throw new ContactFieldWriteError("UNSUPPORTED", "Contact storage does not support conditional updates.");
  for (let attempt = 0; attempt < CONTACT_FIELD_WRITE_MAX_ATTEMPTS; attempt++) {
    const record = await input.store.getRecord({ collectionName: "contacts", recordId: input.contactId, workspaceId: input.workspaceId });
    if (!record || record.lifecycleState !== "active" || !ownedByActor(record, input.actorId)) {
      throw new ContactFieldWriteError("NOT_FOUND", "The contact was not found.");
    }
    const now = input.now?.() ?? new Date();
    // 条件更新要求新的 updatedAt 严格大于旧值（同一毫秒内的连续写也成立）。
    const updatedAt = new Date(Math.max(now.getTime(), Date.parse(record.updatedAt) + 1)).toISOString();
    const next = nextPayload(record, input, updatedAt);
    if (!next) return { changed: [], contactId: record.recordId, updatedAt: record.updatedAt, written: false };
    next.payload.updatedAt = updatedAt;
    const written = await updateRecordIfCurrent(
      { ...record, payload: next.payload, searchText: searchTextFor(next.payload), updatedAt },
      { updatedAt: record.updatedAt, userId: record.userId ?? null },
    );
    if (written) return { changed: next.changed, contactId: record.recordId, updatedAt, written: true };
  }
  throw new ContactFieldWriteError("CONFLICT", "The contact kept changing while saving. Refresh and try again.");
}
