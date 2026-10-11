/**
 * R12 手入力で人脈を追加（DESIGN §2.3、§3.1、§4.1、§9 #10 #14 #37）。
 * Owner: 甲 (R12). Used by: `app/api/contacts/manual/**`（两端「手入力」）。
 *
 * - 查重 = `findContactCandidate`（名片同一规则）+「同名」规则；手入力**不自动统合**（完全相同也返回候选），≤3 条。
 * - 新建走现有 `saveContact`（`orbit_records` 的 `contacts` 集合，与名片同一写入方式，`source.type = 'manual'`），
 *   记录带 `createdVia: 'manual_v2'`；「出会った場所」= 活动时写 `metEventId`（与名片同字段），紹介 / その他 写进备注一行「出会い：…」。
 * - 统合 = `mergeIntoContactId` + `fieldChoices`，经 `applyContactFieldValues`（逐字段覆盖 + `fieldHistory`）。
 * - 幂等：`idempotencyKey` 的回执存 `orbit_records`（集合 `manual_contact_commands`，同 `task_mutations` 的做法）；
 *   重放返回第一次的结果，同键不同内容 → `IDEMPOTENCY_CONFLICT`。`duplicate_review` 没有写入，不留回执
 *   （用户选「別の人として保存」时可以带同一个键重发）。
 * - 建完 / 统合后入队计划候补（`enqueuePlanMatchJob`，与单张名片同一种「东京当天」任务）；入队失败只记日志。
 * - 撤销：10 分钟内、本接口新建、之后没被改过 → 墓碑删除（`deleteRecord`，以 updatedAt 为前提）并撤掉待处理的计划候补；
 *   否则 `UNDO_EXPIRED`。
 * - 写操作在 `storage.write` 里整体执行（live：同一个 PostgreSQL 事务 + 按人的 advisory 锁）。
 */
import { createHash } from "node:crypto";

import type {
  ManualContactCreateInput,
  ManualContactCreateResult,
  ManualContactDuplicateCheckInput,
  ManualContactDuplicateCheckResult,
  ManualContactMergeField,
  ManualContactOrganizationSuggestionsResult,
  ManualContactUndoResult,
} from "../../../shared/contract/manual-contact";
import type { ContactDTO } from "../../../shared/domain/contracts";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { listActorContactRecords, ownedByActor, type CardContactFields } from "../business-card-contact-match";
import { findManualContactCandidates } from "../contact-duplicate-candidates";
import { applyContactFieldValues, CONTACT_FIELD_PAYLOAD_KEY, ContactFieldWriteError, type ContactWritableField } from "../contact-field-write";
import { createStorageBusinessCardContactWriteProvider } from "../storage/contact-write-live-record-provider";

export const MANUAL_CONTACT_CREATED_VIA = "manual_v2";
export const MANUAL_CONTACT_UNDO_WINDOW_MS = 10 * 60 * 1000;
export const MANUAL_CONTACT_CANDIDATE_LIMIT = 3;
export const MANUAL_CONTACT_ORGANIZATION_LIMIT = 5;
export const MANUAL_CONTACT_RECEIPT_COLLECTION = "manual_contact_commands";
export const MANUAL_CONTACT_RECORD_PROVIDER = "orbit-manual-contact-v2";
/** 联系人来源标签（展示层按 source.type 本地化，这里只是固定的英文兜底）。 */
export const MANUAL_CONTACT_SOURCE_LABEL = "Manual entry";

const MERGE_FIELDS: readonly ManualContactMergeField[] = ["displayName", "organization", "role", "email", "phone"];

export type ManualContactV2ErrorCode = "INVALID" | "NOT_FOUND" | "UNDO_EXPIRED" | "IDEMPOTENCY_CONFLICT" | "CONFLICT";

export class ManualContactV2Error extends Error {
  readonly code: ManualContactV2ErrorCode;

  constructor(code: ManualContactV2ErrorCode, message: string) {
    super(message);
    this.name = "ManualContactV2Error";
    this.code = code;
  }
}

/** 计划候补的入队 / 撤销（live：在写事务里调用 `enqueuePlanMatchJob` / `cancelPendingPlanMatchForContact`）。 */
export interface ManualContactPlanMatchPort {
  enqueue(input: { actorId: string; contactId: string }): Promise<void>;
  cancel(input: { actorId: string; contactId: string }): Promise<void>;
}

export interface ManualContactV2Unit {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  planMatch: ManualContactPlanMatchPort | null;
}

export interface ManualContactV2Storage {
  workspaceId: string;
  /** 只读查询。 */
  read<T>(fn: (store: LiveRecordStoreLike<Record<string, unknown>>) => Promise<T>): Promise<T>;
  /** 写：同一个人的写操作串行、整体成功或整体失败。 */
  write<T>(actorId: string, fn: (unit: ManualContactV2Unit) => Promise<T>): Promise<T>;
}

export interface ManualContactV2Service {
  checkDuplicates(actorId: string, input: ManualContactDuplicateCheckInput): Promise<ManualContactDuplicateCheckResult>;
  suggestOrganizations(actorId: string, query: string): Promise<ManualContactOrganizationSuggestionsResult>;
  create(actorId: string, input: ManualContactCreateInput): Promise<ManualContactCreateResult>;
  undo(actorId: string, contactId: string): Promise<ManualContactUndoResult>;
}

export interface ManualContactV2ServiceOptions {
  storage: ManualContactV2Storage;
  now?: () => Date;
  log?: (line: string) => void;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function digest(parts: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function incomingFields(input: { displayName: string; organization?: string; role?: string; email?: string; phone?: string }): CardContactFields {
  return {
    address: "",
    displayName: text(input.displayName),
    email: text(input.email),
    organization: text(input.organization),
    phone: text(input.phone),
    role: text(input.role),
  };
}

/** 公司名比较用：NFKC、小写、空白折叠。 */
function organizationKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** 「出会った場所」是紹介 / その他 时写进备注的一行；活动走 metEventId，不写备注。 */
function meetingNoteLine(input: ManualContactCreateInput): string | null {
  const context = input.metContext;
  if (!context || context.kind === "event") return null;
  const label = text(context.label);
  if (context.kind === "intro") return label ? `出会い：紹介（${label}）` : "出会い：紹介";
  return label ? `出会い：${label}` : null;
}

function noteLines(input: ManualContactCreateInput): string[] {
  const meeting = meetingNoteLine(input);
  const note = text(input.note);
  return [...(meeting ? [meeting] : []), ...(note ? note.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim()) : [])];
}

function metEventOf(input: ManualContactCreateInput): { eventId: string; title: string | null } | null {
  const context = input.metContext;
  const eventId = context?.kind === "event" ? text(context.eventId) : "";
  return eventId ? { eventId, title: text(context?.label) || null } : null;
}

/** 统合时逐字段的写入值：选「existing」不动；选「incoming」照这次输入写（空 = 清空，姓名除外）；没选的只补空。 */
export function mergeFieldValues(
  existingPayload: Record<string, unknown>,
  input: ManualContactCreateInput,
): Partial<Record<ContactWritableField, string | null>> {
  const values: Partial<Record<ContactWritableField, string | null>> = {};
  for (const field of MERGE_FIELDS) {
    const incoming = text(input[field]);
    const choice = input.fieldChoices?.[field];
    if (choice === "existing") continue;
    if (choice === "incoming") {
      if (field === "displayName" && !incoming) continue;
      values[field] = incoming || null;
      continue;
    }
    if (incoming && !text(existingPayload[CONTACT_FIELD_PAYLOAD_KEY[field]])) values[field] = incoming;
  }
  return values;
}

export function createManualContactV2Service({ storage, now = () => new Date(), log = (line) => console.warn(line) }: ManualContactV2ServiceOptions): ManualContactV2Service {
  const workspaceId = storage.workspaceId;

  async function enqueueBestEffort(unit: ManualContactV2Unit, actorId: string, contactId: string): Promise<void> {
    if (!unit.planMatch) return;
    try {
      await unit.planMatch.enqueue({ actorId, contactId });
    } catch (error) {
      // 计划候补是附带效果：入队失败不让保存失败（live 的入队在 savepoint 里，已回滚到入队之前）。
      log(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "manual_contact_plan_match_enqueue_failed" }));
    }
  }

  async function createContact(unit: ManualContactV2Unit, actorId: string, input: ManualContactCreateInput, key: string): Promise<ManualContactCreateResult> {
    const fields = incomingFields(input);
    const at = now().toISOString();
    const id = digest([actorId, key]).slice(0, 24);
    const contactId = `contact:manual-v2:${id}`;
    const metEvent = metEventOf(input);
    const notes = noteLines(input).join("\n");
    const contact = {
      id: contactId,
      displayName: fields.displayName,
      ...(fields.organization ? { organization: fields.organization } : {}),
      ...(fields.role ? { role: fields.role } : {}),
      ...(fields.email ? { primaryEmail: fields.email } : {}),
      ...(fields.phone ? { primaryPhone: fields.phone } : {}),
      ...(notes ? { notes } : {}),
      ...(metEvent ? { metEventId: metEvent.eventId, ...(metEvent.title ? { metEventTitle: metEvent.title } : {}) } : {}),
      stage: "captured",
      source: { id: `manual-v2:${id}`, label: MANUAL_CONTACT_SOURCE_LABEL, type: "manual" },
      evidenceIds: [`evidence:manual-contact-v2:${id}`],
      createdAt: at,
      updatedAt: at,
      createdVia: MANUAL_CONTACT_CREATED_VIA,
    } as ContactDTO & { createdVia: string };
    const provider = createStorageBusinessCardContactWriteProvider({ recordProvider: MANUAL_CONTACT_RECORD_PROVIDER, store: unit.store, workspaceId });
    await provider.saveContact(contact, actorId);
    return {
      contactId,
      outcome: "created",
      undoUntil: new Date(Date.parse(at) + MANUAL_CONTACT_UNDO_WINDOW_MS).toISOString(),
    };
  }

  async function mergeContact(unit: ManualContactV2Unit, actorId: string, input: ManualContactCreateInput, contactId: string): Promise<ManualContactCreateResult> {
    const record = await unit.store.getRecord({ collectionName: "contacts", recordId: contactId, workspaceId });
    if (!record || record.lifecycleState !== "active" || !ownedByActor(record, actorId)) {
      throw new ManualContactV2Error("NOT_FOUND", "The contact to merge into was not found.");
    }
    try {
      await applyContactFieldValues({
        actorId,
        appendNoteLines: noteLines(input),
        contactId,
        fillMetEvent: metEventOf(input),
        now,
        source: "manual",
        store: unit.store,
        values: mergeFieldValues(record.payload, input),
        workspaceId,
      });
    } catch (error) {
      if (error instanceof ContactFieldWriteError) {
        if (error.code === "NOT_FOUND") throw new ManualContactV2Error("NOT_FOUND", error.message);
        if (error.code === "CONFLICT") throw new ManualContactV2Error("CONFLICT", error.message);
        throw new ManualContactV2Error("INVALID", error.message);
      }
      throw error;
    }
    return { contactId, outcome: "merged" };
  }

  return {
    async checkDuplicates(actorId, input) {
      const fields = incomingFields(input);
      if (!fields.displayName) throw new ManualContactV2Error("INVALID", "displayName is required.");
      const records = await storage.read((store) => listActorContactRecords(store, workspaceId, actorId));
      return { candidates: findManualContactCandidates(records, actorId, fields, MANUAL_CONTACT_CANDIDATE_LIMIT) };
    },

    async suggestOrganizations(actorId, query) {
      const prefix = organizationKey(query);
      if (prefix.length < 1) return { organizations: [] };
      const records = await storage.read((store) => listActorContactRecords(store, workspaceId, actorId));
      const groups = new Map<string, { names: Map<string, number>; count: number }>();
      for (const record of records) {
        if (record.lifecycleState !== "active" || !ownedByActor(record, actorId)) continue;
        const name = text(record.payload.organization);
        const key = organizationKey(name);
        if (!key.startsWith(prefix)) continue;
        const group = groups.get(key) ?? { count: 0, names: new Map<string, number>() };
        group.count += 1;
        group.names.set(name, (group.names.get(name) ?? 0) + 1);
        groups.set(key, group);
      }
      const organizations = [...groups.values()]
        .map((group) => ({
          contactCount: group.count,
          // 同一家公司的不同写法里取最常见的那个（并列取字典序靠前的，结果稳定）。
          name: [...group.names.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]![0],
        }))
        .sort((left, right) => right.contactCount - left.contactCount || left.name.localeCompare(right.name))
        .slice(0, MANUAL_CONTACT_ORGANIZATION_LIMIT);
      return { organizations };
    },

    async create(actorId, input) {
      const fields = incomingFields(input);
      const key = text(input.idempotencyKey);
      if (!fields.displayName) throw new ManualContactV2Error("INVALID", "displayName is required.");
      if (!key) throw new ManualContactV2Error("INVALID", "idempotencyKey is required.");
      const { idempotencyKey: _key, ...intent } = input;
      const fingerprint = digest([JSON.stringify(canonical(intent))]);
      const receiptId = digest([actorId, key]);
      return storage.write(actorId, async (unit) => {
        const receiptQuery = { collectionName: MANUAL_CONTACT_RECEIPT_COLLECTION, recordId: receiptId, workspaceId };
        const receipt = await unit.store.getRecord({ ...receiptQuery, includeDeleted: true });
        if (receipt) {
          if (receipt.userId !== actorId || receipt.payload.fingerprint !== fingerprint) {
            throw new ManualContactV2Error("IDEMPOTENCY_CONFLICT", "The idempotency key was already used with different content.");
          }
          return receipt.payload.result as ManualContactCreateResult;
        }

        let result: ManualContactCreateResult;
        const mergeInto = text(input.mergeIntoContactId);
        if (mergeInto) {
          result = await mergeContact(unit, actorId, input, mergeInto);
        } else {
          if (input.allowDuplicate !== true) {
            const records = await listActorContactRecords(unit.store, workspaceId, actorId);
            const candidates = findManualContactCandidates(records, actorId, fields, MANUAL_CONTACT_CANDIDATE_LIMIT);
            // 手入力不自动统合：完全相同的也交给用户选。没有写入，不留回执。
            if (candidates.length) return { candidates, outcome: "duplicate_review" };
          }
          result = await createContact(unit, actorId, input, key);
        }

        await enqueueBestEffort(unit, actorId, result.contactId!);
        const at = now().toISOString();
        await unit.store.upsertRecord({
          ...receiptQuery,
          createdAt: at,
          evidenceIds: [],
          lifecycleState: "active",
          payload: { fingerprint, result },
          searchText: "",
          sourceId: `manual-contact-command:${receiptId}`,
          sourceType: "manual",
          updatedAt: at,
          userId: actorId,
        });
        return result;
      });
    },

    async undo(actorId, contactId) {
      return storage.write(actorId, async (unit) => {
        const record = await unit.store.getRecord({ collectionName: "contacts", recordId: contactId, workspaceId });
        if (!record || record.lifecycleState !== "active" || !ownedByActor(record, actorId)) {
          throw new ManualContactV2Error("NOT_FOUND", "The contact was not found.");
        }
        const createdAt = Date.parse(record.createdAt);
        const untouched = Date.parse(record.updatedAt) === createdAt && text(record.payload.updatedAt) === text(record.payload.createdAt);
        const withinWindow = Number.isFinite(createdAt) && now().getTime() - createdAt <= MANUAL_CONTACT_UNDO_WINDOW_MS;
        if (record.payload.createdVia !== MANUAL_CONTACT_CREATED_VIA || !untouched || !withinWindow) {
          throw new ManualContactV2Error("UNDO_EXPIRED", "This contact can no longer be undone.");
        }
        const deletedAt = new Date(Math.max(now().getTime(), createdAt + 1)).toISOString();
        const deleted = await unit.store.deleteRecord({
          collectionName: "contacts",
          deletedAt,
          expectedUpdatedAt: record.updatedAt,
          recordId: contactId,
          userId: actorId,
          workspaceId,
        });
        if (!deleted) throw new ManualContactV2Error("UNDO_EXPIRED", "This contact changed and can no longer be undone.");
        // 撤销后计划候补里不能还留着这个人：与删除同一个事务，失败就整体回滚。
        await unit.planMatch?.cancel({ actorId, contactId });
        return { outcome: "undone" };
      });
    },
  };
}
