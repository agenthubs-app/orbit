/**
 * R15 招待コード服务（DESIGN add-and-invite §2.4–2.6、§3.2、§6、§9 #15–#19 #22 #33 #35–#37）。
 * Owner: 甲 (R15). Used by: `handlers.ts`（live 路由）、`sync.ts`（同步与解除共用字段写入）、R11（`linkedContactIds`）。
 *
 * - 发码：同一个写单元里先给本人未作废、未替换的码写 `superseded_at` 再建新码；码用 `crypto.randomInt` 从字母表生成，
 *   全局唯一冲突重试 ≤5；只认 `sharedKeys`（缺省 = 会社・役職 / 提供できること / 求めていること），忽略客户端传来的
 *   `shared` 值，响应里的 `shared` 由服务端从本人资料读；`maxUses` 1–10；有效 7 天；同一个幂等键重放第一次的码。
 * - 改当前码的共享项目（R15 P1）：只改码行上的 `shared_keys`，码 / 链接 / 期限 / 人数不变；之后的预览与兑换读新键，已有连接各自的共享项目不动。
 * - 预览：不存在 / 作废 / 被替换 / 过期超过 30 天 → `UNAVAILABLE`（路由统一 404）；过期 30 天内与满员返回带 status 的预览；
 *   永不返回邮箱电话；登录时算 `inviterAlreadyConnected`、`isOwnCode`。
 * - 兑换：一个写单元（live = 一个数据库事务）里：校验 → 同一对人已有生效连接则 `already_connected`（不占用量）→
 *   条件更新占用量 → 双方各建或统合一条联系人（值从双方资料按共享键读）→ 连接行 → 双方入队计划候补（savepoint，失败不影响）。
 *   事务提交后给邀请人写一条站内通知（推送由现有投递管线按每日频控发出）；接收方不通知（完成页代替，§9 #33）。
 * - 复核 S1（安全修订，DESIGN §2.6）：对方的资料是自报的、未经验证，兑换时**两边都不改已有联系人**：总是新建一条「本人入力」；
 *   用 R12 的查重口径 `findContactCandidate`（邮箱 / 电话 / 姓名 + 公司，只拿对方「共享了」的值去比；已属于另一条生效招待连接的联系人不算）
 *   查到可能是同一人的已有联系人时，只在连接上记一条建议（`{ contactId, matchedOn }`）。所有者确认（`mergeConnection`）才统合：
 *   已有字段只补空、不同的不覆盖（记成「我改过」，停止同步）、统合前的原值记进 `before`，招待新建那条墓碑删除；「別の人」（`dismissMerge`）只去掉建议。
 * - 解除：连接记 `unlinked_at`；我这边按 `keepAsContact` 只留名字和公司或墓碑删除。「保留」只清招待写入且之后没被我改过的字段，
 *   统合前原有的值（`before`）恢复、不清（复核 M1）。对方那边招待新建的墓碑删除、统合的只结束连接；不通知。
 */
import { createHash, randomInt, randomUUID } from "node:crypto";

import type {
  InviteCodeContract,
  InviteCodeCreateInput,
  InviteCodeHistoryItem,
  InviteCodeHistoryResponse,
  InviteCodePreview,
  InviteCodeRedeemInput,
  InviteCodeRedeemResult,
  InviteCodeShareUpdateInput,
  InviteConnectionView,
  InviteMergeInput,
  InviteMergeSuggestion,
  InviteSharedFieldKey,
  InviteShareUpdateInput,
  InviteUnlinkInput,
  InviteUnlinkResult,
} from "../../shared/contract/invite-codes";
import { formatInviteCode, INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, INVITE_DEFAULT_SHARED_KEYS, INVITE_SHARED_FIELD_KEYS, normalizeInviteCode } from "../../shared/compute/invite-code-format";
import type { ContactDTO } from "../../shared/domain/contracts";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { findContactCandidate, listActorContactRecords, ownedByActor, type CardContactFields } from "../contacts/business-card-contact-match";
import { ContactFieldWriteError } from "../contacts/contact-field-write";
import { createStorageBusinessCardContactWriteProvider } from "../contacts/storage/contact-write-live-record-provider";
import {
  INVITE_CODE_GENERATE_ATTEMPTS,
  INVITE_CODE_TTL_MS,
  INVITE_DEFAULT_MAX_USES,
  INVITE_EXPIRED_PREVIEW_MS,
  INVITE_HISTORY_LIMIT,
  InviteCodeError,
  perspectiveOf,
  type InviteCodeRow,
  type InviteConnectionRow,
  type InviteMergeSuggestionRow,
  type InviteProfile,
  type InviteSyncedState,
  type InviteSyncField,
} from "./contract";
import {
  contactFieldValue,
  contactPayloadFromProfile,
  fieldsForKeys,
  pausedKeys,
  profileFieldValue,
  readContactValues,
  sharedFieldsFromProfile,
  writeInviteFields,
} from "./invite-fields";
import type { InviteProfileReader } from "./profile-reader";
import type { InviteCodeRepository } from "./repository";

export const INVITE_CONTACT_RECORD_PROVIDER = "orbit-invite-codes";
/** 联系人来源标签（展示层按 source.type 本地化，这里只是固定的英文兜底）。 */
export const INVITE_CONTACT_SOURCE_LABEL = "Invite code";
export const INVITE_CONTACT_CREATED_VIA = "invite_code";
export const DEFAULT_INVITE_LINK_ORIGIN = "https://orbitailink.com";

/** 计划候补的入队 / 撤销（live：在写事务里，各自一个 savepoint）。 */
export interface InvitePlanMatchPort {
  enqueue(input: { actorId: string; contactId: string }): Promise<void>;
  cancel(input: { actorId: string; contactId: string }): Promise<void>;
}

export interface InviteCodeUnit {
  repo: InviteCodeRepository;
  contacts: LiveRecordStoreLike<Record<string, unknown>>;
  profiles: InviteProfileReader;
  planMatch: InvitePlanMatchPort | null;
}

export interface InviteCodeStorage {
  workspaceId: string;
  /** 只读。 */
  read<T>(fn: (unit: InviteCodeUnit) => Promise<T>): Promise<T>;
  /** 写：整体成功或整体失败（live：一个 read committed 事务）。 */
  write<T>(fn: (unit: InviteCodeUnit) => Promise<T>): Promise<T>;
}

/** 有人用码连上后通知邀请人（站内通知；推送由现有投递管线按频控发出）。 */
export interface InviteConnectedNotice {
  connectionId: string;
  inviterActorId: string;
  inviterContactId: string;
  redeemerDisplayName: string;
  at: string;
}

export interface InviteCodeNotifier {
  connected(notice: InviteConnectedNotice): Promise<void>;
}

export interface InviteCodeService {
  create(actorId: string, input: InviteCodeCreateInput): Promise<InviteCodeContract>;
  current(actorId: string): Promise<InviteCodeContract | null>;
  history(actorId: string): Promise<InviteCodeHistoryResponse>;
  revoke(actorId: string, code: string): Promise<InviteCodeContract>;
  /**
   * R15 P1：改当前码共享哪些项目（码、链接、期限、人数都不变；之后的预览 / 兑换读新键，已有连接不受影响）。
   * 没有可用的当前码 → NOT_FOUND；资料没名字 → PROFILE_REQUIRED。PUT 语义：同样的请求再来一次得到同样的结果。
   */
  updateCurrentShare(actorId: string, input: InviteCodeShareUpdateInput): Promise<InviteCodeContract>;
  preview(code: string, viewerActorId: string | null): Promise<InviteCodePreview>;
  redeem(actorId: string, code: string, input: InviteCodeRedeemInput): Promise<InviteCodeRedeemResult>;
  connection(actorId: string, contactId: string): Promise<InviteConnectionView>;
  updateShare(actorId: string, contactId: string, input: InviteShareUpdateInput): Promise<InviteConnectionView>;
  unlink(actorId: string, contactId: string, input: InviteUnlinkInput): Promise<InviteUnlinkResult>;
  /** 复核 S1：我确认是同一人——把招待新建的 `contactId` 统合进建议里已有的那条（只补空）。 */
  mergeConnection(actorId: string, contactId: string, input: InviteMergeInput): Promise<InviteConnectionView>;
  /** 复核 S1：不是同一人——去掉建议（幂等）。 */
  dismissMerge(actorId: string, contactId: string, input: InviteMergeInput): Promise<InviteConnectionView>;
  /** 我人脈里属于生效招待连接的联系人 id（R11 的「本人入力」）。 */
  linkedContactIds(actorId: string): Promise<string[]>;
}

export interface InviteCodeServiceOptions {
  storage: InviteCodeStorage;
  notifier?: InviteCodeNotifier | null;
  now?: () => Date;
  /** 链接的站点（`ORBIT_PUBLIC_ORIGIN`）；缺省 `https://orbitailink.com`。 */
  linkOrigin?: string;
  /** 测试可换（例如制造码冲突）；缺省 = `crypto.randomInt` 从字母表取 8 位。 */
  generateCode?: () => string;
  log?: (line: string) => void;
}

export function generateInviteCode(): string {
  let code = "";
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) code += INVITE_CODE_ALPHABET[randomInt(0, INVITE_CODE_ALPHABET.length)];
  return code;
}

/** 去重并按固定顺序排列；不认识的键丢掉。 */
export function canonicalKeys(keys: readonly string[] | undefined): InviteSharedFieldKey[] {
  const source = keys ?? INVITE_DEFAULT_SHARED_KEYS;
  return INVITE_SHARED_FIELD_KEYS.filter((key) => source.includes(key));
}

function digest(parts: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function codeStatus(row: InviteCodeRow, now: number): InviteCodeHistoryItem["status"] {
  if (row.revokedAt) return "revoked";
  if (row.supersededAt) return "superseded";
  if (Date.parse(row.expiresAt) <= now) return "expired";
  return row.usedCount >= row.maxUses ? "full" : "active";
}

const unavailable = () => new InviteCodeError("UNAVAILABLE", "This invite code cannot be used.");

const MERGE_MATCH_REASONS = ["email", "phone", "name_organization"] as const;

/** 只用对方「共享了」的值做查重（没共享的邮箱 / 电话不拿来比）。 */
function matchFields(profile: InviteProfile, keys: readonly InviteSharedFieldKey[]): CardContactFields {
  const shared = (key: InviteSharedFieldKey) => keys.includes(key);
  return {
    address: "",
    displayName: profile.displayName,
    email: shared("email") ? profile.email ?? "" : "",
    organization: shared("organization") ? profile.organization ?? "" : "",
    phone: shared("phone") ? profile.phone ?? "" : "",
    role: shared("organization") ? profile.role ?? "" : "",
  };
}

export function createInviteCodeService({
  storage,
  notifier = null,
  now = () => new Date(),
  linkOrigin = DEFAULT_INVITE_LINK_ORIGIN,
  generateCode = generateInviteCode,
  log = (line) => console.warn(line),
}: InviteCodeServiceOptions): InviteCodeService {
  const workspaceId = storage.workspaceId;
  const origin = linkOrigin.replace(/\/+$/u, "");

  function contractOf(row: InviteCodeRow, profile: InviteProfile | null): InviteCodeContract {
    const code = formatInviteCode(row.code)!;
    return {
      code,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      link: `${origin}/i/${code}`,
      maxUses: row.maxUses,
      ...(row.revokedAt ? { revokedAt: row.revokedAt } : {}),
      // 自己看自己的码：显示我共享出去的全部值（含連絡先）。
      shared: profile ? sharedFieldsFromProfile(profile, row.sharedKeys, { includeContact: true }) : { displayName: "Orbit" },
      usedCount: Math.min(row.usedCount, row.maxUses),
    };
  }

  async function enqueueBestEffort(unit: InviteCodeUnit, actorId: string, contactId: string): Promise<void> {
    if (!unit.planMatch) return;
    try {
      await unit.planMatch.enqueue({ actorId, contactId });
    } catch (error) {
      // 计划候补是附带效果：入队在 savepoint 里，失败已回滚到入队之前，不让兑换失败。
      log(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "invite_code_plan_match_enqueue_failed" }));
    }
  }

  async function cancelBestEffort(unit: InviteCodeUnit, actorId: string, contactId: string): Promise<void> {
    if (!unit.planMatch) return;
    try {
      await unit.planMatch.cancel({ actorId, contactId });
    } catch (error) {
      log(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "invite_code_plan_match_cancel_failed" }));
    }
  }

  /**
   * 在 `ownerId` 的人脈里新建对方（`peer`，只含 `keys` 共享的值）。复核 S1：不改任何已有联系人；
   * 可能是同一人的已有联系人（不属于另一条生效招待连接）只作为建议返回，由所有者确认后才统合。
   */
  async function placePeer(unit: InviteCodeUnit, input: {
    ownerId: string;
    peer: InviteProfile;
    keys: InviteSharedFieldKey[];
    connectionId: string;
    code: string;
    at: string;
  }): Promise<{ contactId: string; synced: InviteSyncedState; suggestion: InviteMergeSuggestionRow | null }> {
    const { ownerId, peer, keys, at } = input;
    const linked = new Set(await unit.repo.listLinkedContactIds(ownerId));
    const records = (await listActorContactRecords(unit.contacts, workspaceId, ownerId)).filter((record) => !linked.has(record.recordId));
    const candidate = findContactCandidate(records, ownerId, matchFields(peer, keys));
    const values: Partial<Record<InviteSyncField, string>> = {};
    for (const field of fieldsForKeys(keys)) {
      const value = profileFieldValue(peer, field);
      // 对方资料里没有的值不记成「招待写过」（同步不会去碰它）。
      if (value !== null) values[field] = value;
    }
    const id = digest([ownerId, input.connectionId]).slice(0, 24);
    const contactId = `contact:invite:${id}`;
    const contact = {
      ...contactPayloadFromProfile(peer, keys),
      acquisition: { code: formatInviteCode(input.code), via: INVITE_CONTACT_CREATED_VIA },
      createdAt: at,
      createdVia: INVITE_CONTACT_CREATED_VIA,
      evidenceIds: [`evidence:invite-code:${id}`],
      id: contactId,
      source: { id: `invite-code:${id}`, label: INVITE_CONTACT_SOURCE_LABEL, type: "referral" },
      stage: "captured",
      updatedAt: at,
    } as unknown as ContactDTO;
    const provider = createStorageBusinessCardContactWriteProvider({ recordProvider: INVITE_CONTACT_RECORD_PROVIDER, store: unit.contacts, workspaceId });
    await provider.saveContact(contact, ownerId);
    return {
      contactId,
      suggestion: candidate ? { contactId: candidate.contactId, matchedOn: MERGE_MATCH_REASONS.filter((reason) => candidate.matchedOn.includes(reason)) } : null,
      synced: { at, keys: [...keys], profileUpdatedAt: peer.updatedAt, values },
    };
  }

  /**
   * 把建议变成契约里的样子：已有那条还在、还是我的、还不属于别的生效招待连接时才给；显示名用我自己存的值（不是对方报的）。
   * `records` 是预先批量读好的（履历一次读完，复核 m5）。
   */
  function suggestionView(row: InviteMergeSuggestionRow | null, records: ReadonlyMap<string, Record<string, unknown>>, linked: ReadonlySet<string>): InviteMergeSuggestion | undefined {
    if (!row || linked.has(row.contactId)) return undefined;
    const payload = records.get(row.contactId);
    const displayName = payload ? contactFieldValue(payload, "displayName") : null;
    return payload && displayName ? { contactId: row.contactId, displayName, matchedOn: [...row.matchedOn] } : undefined;
  }

  /** 一次读出我的这些联系人（生效、属于我），id → payload。 */
  async function readMyContacts(unit: InviteCodeUnit, actorId: string, ids: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const records = await unit.contacts.listRecords({ collectionName: "contacts", lifecycleState: "active", limit: unique.length, recordIds: unique, userId: actorId, workspaceId });
    return new Map(records.filter((record) => record.lifecycleState === "active" && ownedByActor(record, actorId)).map((record) => [record.recordId, record.payload]));
  }

  async function viewOf(unit: InviteCodeUnit, row: InviteConnectionRow, actorId: string): Promise<InviteConnectionView> {
    const side = perspectiveOf(row, actorId);
    if (!side) throw new InviteCodeError("NOT_FOUND", "This contact is not an invite connection.");
    const record = await readContactValues(unit.contacts, workspaceId, actorId, side.myContactId);
    const suggestionRow = side.myMergeSuggestion;
    const mergeSuggestion = suggestionRow
      ? suggestionView(suggestionRow, await readMyContacts(unit, actorId, [suggestionRow.contactId]), new Set(await unit.repo.listLinkedContactIds(actorId)))
      : undefined;
    return {
      connectedAt: row.createdAt,
      contactId: side.myContactId,
      pausedFields: record ? pausedKeys(record.payload, side.mySynced.values, side.sharedByPeer) : [],
      sharedByMe: [...side.sharedByMe],
      sharedByPeer: [...side.sharedByPeer],
      via: { code: formatInviteCode(row.code) ?? row.code },
      ...(mergeSuggestion ? { mergeSuggestion } : {}),
    };
  }

  return {
    async create(actorId, input) {
      const key = input.idempotencyKey.trim();
      if (!key) throw new InviteCodeError("INVALID", "idempotencyKey is required.");
      const keys = canonicalKeys(input.sharedKeys);
      const maxUses = Number.isInteger(input.maxUses) ? Math.min(10, Math.max(1, input.maxUses)) : INVITE_DEFAULT_MAX_USES;
      return storage.write(async (unit) => {
        await unit.repo.lockActor(actorId);
        const profile = await unit.profiles.read(actorId);
        const replay = await unit.repo.findCodeByIdempotencyKey(actorId, key);
        if (replay) {
          // R15 P1 复核 m1（已知例外，不改）：比对的是这张码**现在**的 sharedKeys。发码后用 `PUT /current/share` 改过共享项目，
          // 再用同一个键重放发码会得到 409（而不是原样重放）。成熟做法（按键存原请求指纹再比）要给 invite_codes 加列 =
          // 生产迁移；两端界面在发码失败后都会清掉键、重试用新键（InviteCodeModal / InviteSenderScreen），现实中碰不到，
          // 409 也是安全一侧（不会悄悄返回与请求不同的码）。mock 的重放返回码现在的样子，不做冲突判断。
          if (replay.maxUses !== maxUses || replay.sharedKeys.join(",") !== keys.join(",")) {
            throw new InviteCodeError("IDEMPOTENCY_CONFLICT", "The idempotency key was already used with different content.");
          }
          return contractOf(replay, profile);
        }
        if (!profile) throw new InviteCodeError("PROFILE_REQUIRED", "Add your name to your profile before creating an invite code.");
        const at = now();
        const createdAt = at.toISOString();
        await unit.repo.supersedeActorCodes(actorId, createdAt);
        for (let attempt = 0; attempt < INVITE_CODE_GENERATE_ATTEMPTS; attempt += 1) {
          const code = normalizeInviteCode(generateCode());
          if (!code) continue;
          const row = await unit.repo.insertCode({
            actorId,
            code,
            createdAt,
            expiresAt: new Date(at.getTime() + INVITE_CODE_TTL_MS).toISOString(),
            id: randomUUID(),
            idempotencyKey: key,
            maxUses,
            sharedKeys: keys,
          });
          if (row) return contractOf(row, profile);
        }
        throw new InviteCodeError("CONFLICT", "Could not create a unique invite code. Try again.");
      });
    },

    async current(actorId) {
      return storage.read(async (unit) => {
        const row = await unit.repo.findUsableCode(actorId);
        if (!row || Date.parse(row.expiresAt) <= now().getTime()) return null;
        return contractOf(row, await unit.profiles.read(actorId));
      });
    },

    async history(actorId) {
      return storage.read(async (unit) => {
        const rows = await unit.repo.listActorCodes(actorId, INVITE_HISTORY_LIMIT);
        const connections = (await unit.repo.listConnectionsForCodes(rows.map((row) => row.id))).filter((item) => item.inviterActorId === actorId);
        // 复核 m5：加入的人与建议里的已有联系人一次读完（不再每人读一次）。
        const contacts = await readMyContacts(unit, actorId, connections.flatMap((item) => [
          item.inviterContactId,
          ...(item.unlinkedAt === null && item.inviterMergeSuggestion ? [item.inviterMergeSuggestion.contactId] : []),
        ]));
        const linked = connections.some((item) => item.unlinkedAt === null && item.inviterMergeSuggestion)
          ? new Set(await unit.repo.listLinkedContactIds(actorId))
          : new Set<string>();
        const at = now().getTime();
        const items: InviteCodeHistoryItem[] = [];
        for (const row of rows) {
          const joined: InviteCodeHistoryItem["joined"] = [];
          for (const connection of connections.filter((item) => item.codeId === row.id)) {
            // 点名字进联系人详情：联系人已经删掉（解除时选了删除）的人不列。
            const payload = contacts.get(connection.inviterContactId);
            const displayName = payload ? contactFieldValue(payload, "displayName") : null;
            if (!payload || !displayName) continue;
            const mergeSuggestion = connection.unlinkedAt === null ? suggestionView(connection.inviterMergeSuggestion, contacts, linked) : undefined;
            joined.push({ contactId: connection.inviterContactId, displayName, joinedAt: connection.createdAt, ...(mergeSuggestion ? { mergeSuggestion } : {}) });
          }
          items.push({
            code: formatInviteCode(row.code)!,
            createdAt: row.createdAt,
            expiresAt: row.expiresAt,
            joined,
            maxUses: row.maxUses,
            status: codeStatus(row, at),
            usedCount: Math.min(row.usedCount, row.maxUses),
          });
        }
        return { items };
      });
    },

    async revoke(actorId, code) {
      const normalized = normalizeInviteCode(code);
      if (!normalized) throw new InviteCodeError("NOT_FOUND", "The invite code was not found.");
      return storage.write(async (unit) => {
        await unit.repo.lockActor(actorId);
        const row = await unit.repo.revokeCode(actorId, normalized, now().toISOString());
        if (!row) throw new InviteCodeError("NOT_FOUND", "The invite code was not found.");
        return contractOf(row, await unit.profiles.read(actorId));
      });
    },

    async updateCurrentShare(actorId, input) {
      if (!input.idempotencyKey.trim()) throw new InviteCodeError("INVALID", "idempotencyKey is required.");
      const keys = canonicalKeys(input.sharedKeys);
      return storage.write(async (unit) => {
        // 与发码 / 作废同一把锁：不会和「发新码」交错（改到刚被替换的旧码上）。
        await unit.repo.lockActor(actorId);
        const row = await unit.repo.findUsableCode(actorId);
        // 与 `current` 同一口径：过期的码不算当前码。
        if (!row || Date.parse(row.expiresAt) <= now().getTime()) throw new InviteCodeError("NOT_FOUND", "There is no current invite code.");
        const profile = await unit.profiles.read(actorId);
        if (!profile) throw new InviteCodeError("PROFILE_REQUIRED", "Add your name to your profile before sharing an invite code.");
        if (row.sharedKeys.join(",") === keys.join(",")) return contractOf(row, profile);
        const updated = await unit.repo.updateUsableCodeSharedKeys(actorId, row.id, keys);
        if (!updated) throw new InviteCodeError("NOT_FOUND", "There is no current invite code.");
        return contractOf(updated, profile);
      });
    },

    async preview(code, viewerActorId) {
      const normalized = normalizeInviteCode(code);
      if (!normalized) throw unavailable();
      return storage.read(async (unit) => {
        const row = await unit.repo.findCodeByCode(normalized);
        if (!row || row.revokedAt || row.supersededAt) throw unavailable();
        const at = now().getTime();
        const expiredFor = at - Date.parse(row.expiresAt);
        if (expiredFor >= 0 && expiredFor > INVITE_EXPIRED_PREVIEW_MS) throw unavailable();
        const profile = await unit.profiles.read(row.actorId);
        if (!profile) throw unavailable();
        const status = codeStatus(row, at) as "active" | "expired" | "full";
        const visibility = profile.publicFields ?? { companyRole: true, offeringSeeking: true, intro: true };
        const publicKeys = row.sharedKeys.filter((key) =>
          key === "organization" ? visibility.companyRole
            : key === "offering" || key === "seeking" ? visibility.offeringSeeking : true);
        const preview: InviteCodePreview = {
          code: formatInviteCode(row.code)!,
          expiresAt: row.expiresAt,
          // 兑换前的公开预览还要遵守资料可见性；邮箱和电话始终不出现（§6 第 6 条）。
          shared: sharedFieldsFromProfile(profile, publicKeys, { includeContact: false }),
          status,
        };
        if (viewerActorId) {
          preview.isOwnCode = viewerActorId === row.actorId;
          preview.inviterAlreadyConnected = !preview.isOwnCode && (await unit.repo.findActiveConnectionBetween(viewerActorId, row.actorId)) !== null;
        }
        return preview;
      });
    },

    async redeem(actorId, code, input) {
      const normalized = normalizeInviteCode(code);
      if (!normalized) throw unavailable();
      const key = input.idempotencyKey.trim();
      if (!key) throw new InviteCodeError("INVALID", "idempotencyKey is required.");
      const myKeys = canonicalKeys(input.sharedKeys);
      const outcome = await storage.write(async (unit) => {
        const replay = await unit.repo.findConnectionByRedeemKey(actorId, key);
        if (replay) {
          if (replay.code !== normalized) throw new InviteCodeError("IDEMPOTENCY_CONFLICT", "The idempotency key was already used with a different code.");
          const inviter = await unit.profiles.read(replay.inviterActorId);
          return {
            notice: null,
            result: {
              contactId: replay.redeemerContactId,
              // 兑换总是新建；之后我确认统合过，重放给的是统合后的那条。
              outcome: replay.redeemerContactCreated ? "connected" : "merged",
              ...(inviter ? { peer: sharedFieldsFromProfile(inviter, replay.inviterSharedKeys, { includeContact: true }) } : {}),
            } satisfies InviteCodeRedeemResult,
          };
        }
        const row = await unit.repo.findCodeByCode(normalized, { forUpdate: true });
        if (!row || row.revokedAt || row.supersededAt) throw unavailable();
        const at = now();
        const expiredFor = at.getTime() - Date.parse(row.expiresAt);
        if (expiredFor >= 0 && expiredFor > INVITE_EXPIRED_PREVIEW_MS) throw unavailable();
        if (row.actorId === actorId) throw new InviteCodeError("OWN_CODE", "This is your own invite code.");
        await unit.repo.lockPair(row.actorId, actorId);
        const inviter = await unit.profiles.read(row.actorId);
        if (!inviter) throw unavailable();
        const existing = await unit.repo.findActiveConnectionBetween(row.actorId, actorId);
        if (existing) {
          const side = perspectiveOf(existing, actorId)!;
          return {
            notice: null,
            result: { contactId: side.myContactId, outcome: "already_connected", peer: sharedFieldsFromProfile(inviter, side.sharedByPeer, { includeContact: true }) } satisfies InviteCodeRedeemResult,
          };
        }
        if (expiredFor >= 0) throw new InviteCodeError("EXPIRED", "This invite code has expired.");
        if (row.usedCount >= row.maxUses) throw new InviteCodeError("FULL", "This invite code has no uses left.");
        const redeemer = await unit.profiles.read(actorId);
        if (!redeemer) throw new InviteCodeError("PROFILE_REQUIRED", "Add your name to your profile before connecting.");
        // 所有校验都在占用量之前做完：占用之后只剩写入（live 失败整体回滚）。
        const claimed = await unit.repo.claimUse(row.id, at.toISOString());
        if (!claimed) throw new InviteCodeError("FULL", "This invite code has no uses left.");
        const connectionId = randomUUID();
        const createdAt = at.toISOString();
        const inviterSide = await placePeer(unit, { at: createdAt, code: row.code, connectionId, keys: myKeys, ownerId: row.actorId, peer: redeemer });
        const redeemerSide = await placePeer(unit, { at: createdAt, code: row.code, connectionId, keys: row.sharedKeys, ownerId: actorId, peer: inviter });
        await unit.repo.insertConnection({
          codeId: row.id,
          createdAt,
          id: connectionId,
          inviterActorId: row.actorId,
          inviterContactCreated: true,
          inviterContactId: inviterSide.contactId,
          inviterMergeSuggestion: inviterSide.suggestion,
          inviterSharedKeys: [...row.sharedKeys],
          inviterSynced: inviterSide.synced,
          outcome: "connected",
          redeemerActorId: actorId,
          redeemerContactCreated: true,
          redeemerContactId: redeemerSide.contactId,
          redeemerMergeSuggestion: redeemerSide.suggestion,
          redeemerIdempotencyKey: key,
          redeemerSharedKeys: myKeys,
          redeemerSynced: redeemerSide.synced,
        });
        await enqueueBestEffort(unit, row.actorId, inviterSide.contactId);
        await enqueueBestEffort(unit, actorId, redeemerSide.contactId);
        return {
          notice: { at: createdAt, connectionId, inviterActorId: row.actorId, inviterContactId: inviterSide.contactId, redeemerDisplayName: redeemer.displayName } satisfies InviteConnectedNotice,
          result: {
            contactId: redeemerSide.contactId,
            outcome: "connected",
            peer: sharedFieldsFromProfile(inviter, row.sharedKeys, { includeContact: true }),
          } satisfies InviteCodeRedeemResult,
        };
      });
      if (outcome.notice && notifier) {
        try {
          await notifier.connected(outcome.notice);
        } catch (error) {
          // 连接已经提交；通知失败只记日志（不带名字与码）。
          log(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "invite_code_notify_failed" }));
        }
      }
      return outcome.result;
    },

    async connection(actorId, contactId) {
      return storage.read(async (unit) => {
        const row = await unit.repo.findActiveConnectionForContact(actorId, contactId);
        if (!row) throw new InviteCodeError("NOT_FOUND", "This contact is not an invite connection.");
        return viewOf(unit, row, actorId);
      });
    },

    async updateShare(actorId, contactId, input) {
      const keys = canonicalKeys(input.sharedKeys);
      return storage.write(async (unit) => {
        const found = await unit.repo.findActiveConnectionForContact(actorId, contactId);
        if (!found) throw new InviteCodeError("NOT_FOUND", "This contact is not an invite connection.");
        await unit.repo.lockPair(found.inviterActorId, found.redeemerActorId);
        const row = await unit.repo.findConnection(found.id);
        const side = row && row.unlinkedAt === null ? perspectiveOf(row, actorId) : null;
        if (!row || !side) throw new InviteCodeError("NOT_FOUND", "This contact is not an invite connection.");
        if (side.sharedByMe.join(",") !== keys.join(",")) {
          await unit.repo.updateSharedKeys(row.id, side.side, keys);
          // 下一轮同步生效：让对方那条联系人在下一轮重新比对（被关掉的字段清空，新打开的写入）。
          await unit.repo.updateSynced(row.id, side.side === "inviter" ? "redeemer" : "inviter", { ...side.peerSynced, profileUpdatedAt: null });
        }
        return viewOf(unit, (await unit.repo.findConnection(row.id))!, actorId);
      });
    },

    async unlink(actorId, contactId, input) {
      const key = input.idempotencyKey.trim();
      if (!key) throw new InviteCodeError("INVALID", "idempotencyKey is required.");
      return storage.write(async (unit) => {
        const replay = await unit.repo.findUnlinkedByKey(actorId, key);
        if (replay) {
          const side = perspectiveOf(replay, actorId)!;
          return { outcome: "unlinked", ...(replay.unlinkKept ? { keptContactId: side.myContactId } : {}) };
        }
        const found = await unit.repo.findActiveConnectionForContact(actorId, contactId);
        if (!found) throw new InviteCodeError("NOT_FOUND", "This contact is not an invite connection.");
        await unit.repo.lockPair(found.inviterActorId, found.redeemerActorId);
        const row = await unit.repo.findConnection(found.id);
        const side = row && row.unlinkedAt === null ? perspectiveOf(row, actorId) : null;
        if (!row || !side) throw new InviteCodeError("NOT_FOUND", "This contact is not an invite connection.");
        const at = now().toISOString();
        await unit.repo.unlink({ actorId, at, connectionId: row.id, idempotencyKey: key, kept: input.keepAsContact });

        let kept = false;
        const mine = await readContactValues(unit.contacts, workspaceId, actorId, side.myContactId);
        if (mine && input.keepAsContact) {
          // 只留名字和公司（复核 M1）：只动招待写入、之后没被我改过的字段（当前值 = 上次同步值）；
          // 统合前我自己就有的值（`before`）恢复原值，其余清掉（旧值进历史）。我改过的、招待从没写过的都不动。
          const { before = {}, values } = side.mySynced;
          const writes: Partial<Record<InviteSyncField, string | null>> = {};
          for (const field of Object.keys(values) as InviteSyncField[]) {
            if (field === "displayName" || field === "organization") continue;
            const current = contactFieldValue(mine.payload, field);
            if (current !== values[field]) continue;
            const original = before[field] ?? null;
            if (current !== original) writes[field] = original;
          }
          await writeInviteFields({ actorId, contactId: side.myContactId, now, source: "invite", store: unit.contacts, values: writes, workspaceId });
          kept = true;
        } else if (mine) {
          await unit.contacts.deleteRecord({ collectionName: "contacts", deletedAt: at, recordId: side.myContactId, userId: actorId, workspaceId });
          await cancelBestEffort(unit, actorId, side.myContactId);
        }
        // 对方那边：招待新建的墓碑删除（备注随记录保留在存储里，可恢复）；统合进原有名刺的只结束连接。不通知。
        if (side.peerContactCreated) {
          const theirs = await readContactValues(unit.contacts, workspaceId, side.peerActorId, side.peerContactId);
          if (theirs) {
            await unit.contacts.deleteRecord({ collectionName: "contacts", deletedAt: at, recordId: side.peerContactId, userId: side.peerActorId, workspaceId });
            await cancelBestEffort(unit, side.peerActorId, side.peerContactId);
          }
        }
        return { outcome: "unlinked", ...(kept ? { keptContactId: side.myContactId } : {}) };
      });
    },

    async mergeConnection(actorId, contactId, input) {
      if (!input.idempotencyKey.trim()) throw new InviteCodeError("INVALID", "idempotencyKey is required.");
      return storage.write(async (unit) => {
        // 重放：这条已经统合过（招待新建的那条已删），按统合来源找回连接。
        const replay = await unit.repo.findActiveConnectionMergedFrom(actorId, contactId);
        if (replay) return viewOf(unit, replay, actorId);
        const found = await unit.repo.findActiveConnectionForContact(actorId, contactId);
        if (!found) throw new InviteCodeError("NOT_FOUND", "This contact is not an invite connection.");
        await unit.repo.lockPair(found.inviterActorId, found.redeemerActorId);
        const row = await unit.repo.findConnection(found.id);
        const side = row && row.unlinkedAt === null ? perspectiveOf(row, actorId) : null;
        if (!row || !side || side.myContactId !== contactId) throw new InviteCodeError("NOT_FOUND", "This contact is not an invite connection.");
        const suggestion = side.myMergeSuggestion;
        if (!suggestion || !side.myContactCreated) throw new InviteCodeError("NOT_FOUND", "There is nothing to merge.");
        const linked = new Set(await unit.repo.listLinkedContactIds(actorId));
        const contacts = await readMyContacts(unit, actorId, [suggestion.contactId, side.myContactId]);
        const target = contacts.get(suggestion.contactId);
        const incoming = contacts.get(side.myContactId);
        if (!incoming) throw new InviteCodeError("NOT_FOUND", "This contact is not an invite connection.");
        if (!target || linked.has(suggestion.contactId)) throw new InviteCodeError("CONFLICT", "The suggested contact can no longer be merged.");

        // 只补空：已有那条上空着的字段用招待这条的当前值补上；已有值（相同或不同）都不动，记进 before。
        // `values`（对方上次同步的值）照旧：与已有值不同的字段因此算「我改过」，停止同步，详情显示「本人の情報と違います」。
        const before: Partial<Record<InviteSyncField, string>> = { ...(side.mySynced.before ?? {}) };
        const fill: Partial<Record<InviteSyncField, string>> = {};
        for (const field of new Set<InviteSyncField>([...fieldsForKeys(side.sharedByPeer), ...(Object.keys(side.mySynced.values) as InviteSyncField[])])) {
          const existing = contactFieldValue(target, field);
          const value = contactFieldValue(incoming, field);
          if (existing !== null) before[field] = existing;
          else if (value !== null) fill[field] = value;
        }
        try {
          await writeInviteFields({ actorId, contactId: suggestion.contactId, now, source: "invite", store: unit.contacts, values: fill, workspaceId });
        } catch (error) {
          if (error instanceof ContactFieldWriteError && error.code === "CONFLICT") throw new InviteCodeError("CONFLICT", error.message);
          throw error;
        }
        await unit.repo.mergeSide({
          connectionId: row.id,
          contactId: suggestion.contactId,
          side: side.side,
          synced: { ...side.mySynced, before, mergedFrom: side.myContactId },
        });
        // 招待新建的那条墓碑删除（可恢复）；它的计划候补撤掉。
        const at = now().toISOString();
        await unit.contacts.deleteRecord({ collectionName: "contacts", deletedAt: at, recordId: side.myContactId, userId: actorId, workspaceId });
        await cancelBestEffort(unit, actorId, side.myContactId);
        return viewOf(unit, (await unit.repo.findConnection(row.id))!, actorId);
      });
    },

    async dismissMerge(actorId, contactId, input) {
      if (!input.idempotencyKey.trim()) throw new InviteCodeError("INVALID", "idempotencyKey is required.");
      return storage.write(async (unit) => {
        const found = await unit.repo.findActiveConnectionForContact(actorId, contactId);
        if (!found) throw new InviteCodeError("NOT_FOUND", "This contact is not an invite connection.");
        await unit.repo.lockPair(found.inviterActorId, found.redeemerActorId);
        const row = await unit.repo.findConnection(found.id);
        const side = row && row.unlinkedAt === null ? perspectiveOf(row, actorId) : null;
        if (!row || !side || side.myContactId !== contactId) throw new InviteCodeError("NOT_FOUND", "This contact is not an invite connection.");
        if (side.myMergeSuggestion) await unit.repo.setMergeSuggestion(row.id, side.side, null);
        return viewOf(unit, (await unit.repo.findConnection(row.id))!, actorId);
      });
    },

    async linkedContactIds(actorId) {
      return storage.read((unit) => unit.repo.listLinkedContactIds(actorId));
    },
  };
}

/** 码的履历状态（测试与同步共用）。 */
export const inviteCodeStatus = codeStatus;
