/**
 * 计划服务（RW-09）：一个人的计划读写都经过这里。mock 与 live 只差仓储实现（见 service-factory）。
 *
 * 规则：
 * - 同一时间只有一份 active 计划。`createVersion` 在按 actor 串行的事务里归档旧版、写入新版。
 * - 版本继承：新条目可用 `inheritsFromItemId` 取代旧条目（完成状态、答案、联系人并入）；
 *   同一活动（`linkedEventId` 相同）自动并入；其余「已完成的内容」——完成的行动、有答案的信息、
 *   已报名／已参加的活动、有联系人的人脉需求——原样带入新版本（`carriedFromItemId` 指向旧条目）。
 *   未完成的行动（含未完成的「约 TA」）不带入。旧版本保持原样归档，可按 id 读取。
 * - W0023：计划已过最后一周时关联联系人只记关联和进展记录、不生成「约 TA」；下一份计划与重新分析
 *   （带 `origin` 的新版本）在同一事务里为带入需求上仍是 linked 的每个联系人生成一条当周「约 TA」
 *   （已建立联系、新版本已有这一对行动、联系人已删除的跳过；总条目不超过 `itemsPerPlan`）。
 * - 条目更新只接受 contract 里的合法转移；非法转移抛 `ILLEGAL_TRANSITION`（409），不写库。
 *   每次真实变化写一条 auto 进展记录；重复提交同一 `idempotencyKey` 只生效一次。
 * - 归档版本只读（`PLAN_ARCHIVED`）。
 * - 带幂等键的请求（含无变化）在同一事务里写命令回执（请求指纹）；同 key 不同请求 409。
 * - 新引用的联系人／活动先经 `PlanReferenceValidator` 校验，找不到或不属于本人 → 404，不写库。
 */
import { createHash, randomUUID } from "node:crypto";

import {
  ACTION_TRANSITIONS,
  EVENT_ITEM_STATUSES,
  EVENT_ITEM_TRANSITIONS,
  PLAN_LIMITS,
  PLAN_MATCH_ACTION_SOURCE,
  type ActionStatus,
  type EnterPhaseResult,
  type EventItemStatus,
  type Plan,
  type PlanContactLink,
  type PlanItem,
  type PlanItemChange,
  type PlanItemStatus,
  type LinkNeedContactResult,
  type PlanLogEntry,
  type PlanLogEvent,
  type PlanReferenceValidator,
  type PlanService,
  type PlanSnapshot,
  type PlanView,
  type PlanViewSnapshot,
} from "./contract";
import { defaultPhaseRefiner, phaseEnteredKey, phaseNeedsRefinement, phaseToEnter, PLAN_PHASE_REFINEMENT_SOURCE, type PhaseRefiner } from "./phase-refinement";
import { REANALYSIS_MONTHLY_LIMIT, reanalysisQuotaKey, tokyoMonthKey } from "./reanalysis";
import type { PlanReader, PlanRepository, PlanScope, PlanTransaction } from "./repository";
import { planTotalWeeks, planWeekAt, planWeekState } from "./week";
import { isTokyoMonday, previousTokyoWeek, summarizePlanWeek } from "./weekly-summary";
import {
  PlanServiceError,
  parseCreatePlanVersionInput,
  parseId,
  parseItemChange,
  parseManualLogInput,
  type ParsedNewItem,
} from "./validators";

export { PlanServiceError } from "./validators";

export interface CreatePlanServiceOptions {
  repository: PlanRepository;
  scope: PlanScope;
  /** 按同一 actor 构造的引用校验器（联系人属于本人、活动在公开目录里）。 */
  references: PlanReferenceValidator;
  now?: () => string;
  newId?: () => string;
  /** W0012：一年期进入新季度段时补细的实现（默认经生成器 factory 用 mock 生成器）。 */
  phaseRefiner?: PhaseRefiner;
}

/** W0012：周一小结一次最多读的记录数（一周的进展远低于此）。 */
const WEEKLY_SUMMARY_LOG_LIMIT = 1000;

/** 人脉需求的状态由联系人关联推导。 */
export function networkNeedStatus(links: readonly PlanContactLink[]): PlanItemStatus {
  if (links.some((link) => link.state === "established")) return "established";
  return links.length > 0 ? "linked" : "open";
}

function withLinks(item: PlanItem, links: PlanContactLink[]): PlanItem {
  const ordered = [...links].sort((a, b) => a.linkedAt.localeCompare(b.linkedAt));
  return {
    ...item,
    contactLinks: ordered,
    linkedContactIds: ordered.map((link) => link.contactId),
    status: item.kind === "network_need" ? networkNeedStatus(ordered) : item.status,
  };
}

function mergeLinks(a: readonly PlanContactLink[], b: readonly PlanContactLink[]): PlanContactLink[] {
  const byContact = new Map<string, PlanContactLink>();
  for (const link of [...a, ...b]) {
    const existing = byContact.get(link.contactId);
    if (!existing) {
      byContact.set(link.contactId, { ...link });
      continue;
    }
    const established = existing.state === "established" ? existing : link.state === "established" ? link : null;
    byContact.set(link.contactId, {
      contactId: link.contactId,
      establishedAt: established?.establishedAt ?? null,
      linkedAt: existing.linkedAt < link.linkedAt ? existing.linkedAt : link.linkedAt,
      state: established ? "established" : "linked",
    });
  }
  return [...byContact.values()];
}

const EVENT_RANK: Record<EventItemStatus, number> = { attended: 2, recommended: 0, registered: 1 };

/** 把旧条目的进度并入取代它的新条目。 */
function mergeInherited(target: PlanItem, old: PlanItem): PlanItem {
  let next: PlanItem = { ...target, carriedFromItemId: old.id };
  if (target.kind === "action") {
    if (old.status === "done") next = { ...next, completedAt: old.completedAt, status: "done" };
    else if (old.status === "in_progress" && next.status === "not_started") next = { ...next, status: "in_progress" };
  } else if (target.kind === "event") {
    const oldStatus = old.status as EventItemStatus;
    if (EVENT_RANK[oldStatus] > EVENT_RANK[next.status as EventItemStatus]) next = { ...next, status: oldStatus };
  } else if (target.kind === "info" && next.answer === null && old.answer !== null) {
    next = { ...next, answer: old.answer, status: "answered" };
  }
  return withLinks(next, mergeLinks(next.contactLinks, old.contactLinks));
}

/** 没有被新条目取代、但必须保留的已完成内容。 */
function isCompletedContent(item: PlanItem): boolean {
  switch (item.kind) {
    case "action":
      return item.status === "done";
    case "info":
      return item.status === "answered";
    case "event":
      return item.status === "registered" || item.status === "attended";
    case "network_need":
      return item.contactLinks.length > 0;
  }
}

const ACTION_STATUS_BODY: Record<ActionStatus, string> = {
  done: "完成行动",
  in_progress: "开始行动",
  not_started: "撤销完成",
};

const EVENT_STATUS_BODY: Record<EventItemStatus, string> = {
  attended: "参加活动",
  recommended: "取消报名",
  registered: "报名活动",
};

function clip(text: string): string {
  return text.length > PLAN_LIMITS.bodyLength ? `${text.slice(0, PLAN_LIMITS.bodyLength - 1)}…` : text;
}

interface AppliedChange {
  item: PlanItem;
  event: PlanLogEvent;
  body: string;
  fromStatus: string | null;
  toStatus: string | null;
  linkedContactIds: string[];
  payload: Record<string, unknown>;
}

function illegal(message: string): never {
  throw new PlanServiceError("ILLEGAL_TRANSITION", message);
}

/** 纯函数：计算一次条目变化。返回 null = 与当前状态相同（无变化，不写库）。 */
export function applyItemChange(item: PlanItem, change: PlanItemChange, now: string): AppliedChange | null {
  switch (change.op) {
    case "set_status": {
      if (item.kind === "action") {
        const from = item.status as ActionStatus;
        const to = change.status as ActionStatus;
        if (from === to) return null;
        if (!(ACTION_TRANSITIONS[from] as readonly string[]).includes(to)) {
          illegal(`Action cannot move from ${from} to ${change.status}.`);
        }
        return {
          body: clip(`${ACTION_STATUS_BODY[to]}：${item.title}`),
          event: "item_status_changed",
          fromStatus: from,
          item: { ...item, completedAt: to === "done" ? now : null, status: to, updatedAt: now },
          linkedContactIds: item.linkedContactIds,
          payload: { op: change.op },
          toStatus: to,
        };
      }
      if (item.kind === "event") {
        const from = item.status as EventItemStatus;
        const to = change.status as EventItemStatus;
        if (from === to) return null;
        if (!(EVENT_ITEM_STATUSES as readonly string[]).includes(to) || !EVENT_ITEM_TRANSITIONS[from].includes(to)) {
          illegal(`Event item cannot move from ${from} to ${change.status}.`);
        }
        return {
          body: clip(`${EVENT_STATUS_BODY[to]}：${item.title}`),
          event: "item_status_changed",
          fromStatus: from,
          item: { ...item, status: to, updatedAt: now },
          linkedContactIds: [],
          payload: { op: change.op },
          toStatus: to,
        };
      }
      return illegal(`The status of ${item.kind} items is derived and cannot be set directly.`);
    }
    case "link_contact":
    case "establish_contact":
    case "unlink_contact": {
      if (item.kind !== "network_need" && item.kind !== "action") {
        illegal(`Contacts can only be linked to network needs and actions.`);
      }
      const existing = item.contactLinks.find((link) => link.contactId === change.contactId);
      let links: PlanContactLink[];
      let event: PlanLogEvent;
      let body: string;
      if (change.op === "link_contact") {
        if (existing) return null;
        if (item.contactLinks.length >= 200) illegal("Too many linked contacts.");
        links = [...item.contactLinks, { contactId: change.contactId, establishedAt: null, linkedAt: now, state: "linked" }];
        event = "contact_linked";
        body = `关联联系人到「${item.title}」`;
      } else if (change.op === "establish_contact") {
        if (!existing) illegal("A contact must be linked before the connection is established.");
        if (existing.state === "established") return null;
        links = item.contactLinks.map((link) =>
          link.contactId === change.contactId ? { ...link, establishedAt: now, state: "established" } : link,
        );
        event = "contact_established";
        body = `已建立联系：${item.title}`;
      } else {
        if (!existing) return null;
        if (existing.state === "established") illegal("An established connection cannot be unlinked.");
        links = item.contactLinks.filter((link) => link.contactId !== change.contactId);
        event = "contact_unlinked";
        body = `取消关联：${item.title}`;
      }
      const next = withLinks({ ...item, updatedAt: now }, links);
      return {
        body: clip(body),
        event,
        fromStatus: existing?.state ?? null,
        item: next,
        linkedContactIds: [change.contactId],
        payload: { contactId: change.contactId, itemStatus: next.status, op: change.op },
        toStatus: next.contactLinks.find((link) => link.contactId === change.contactId)?.state ?? null,
      };
    }
    case "set_answer": {
      if (item.kind !== "info") illegal("Only info items take an answer.");
      const answer = change.answer?.trim() || null;
      if (answer === item.answer) return null;
      const status = answer === null ? "open" : "answered";
      return {
        body: clip(`${answer === null ? "清空答案" : "记录答案"}：${item.title}`),
        event: "answer_updated",
        fromStatus: item.status,
        item: { ...item, answer, status, updatedAt: now },
        linkedContactIds: [],
        payload: { op: change.op },
        toStatus: status,
      };
    }
    case "defer_action": {
      if (item.kind !== "action") illegal("Only actions can be deferred.");
      if (item.status === "done") illegal("A completed action cannot be deferred.");
      if (item.suggestedWeek !== null && change.toWeek <= item.suggestedWeek) {
        illegal("An action can only be deferred to a later week.");
      }
      return {
        body: clip(`延后到第 ${change.toWeek} 周：${item.title}`),
        event: "action_deferred",
        fromStatus: item.status,
        item: { ...item, deferralCount: item.deferralCount + 1, suggestedWeek: change.toWeek, updatedAt: now },
        linkedContactIds: item.linkedContactIds,
        payload: { fromWeek: item.suggestedWeek, op: change.op, toWeek: change.toWeek },
        toStatus: item.status,
      };
    }
  }
}

/** W0010：某条需求 + 某个联系人生成的「约 TA」行动（同一对只有一条）。 */
export function findMatchAction(items: readonly PlanItem[], needItemId: string, contactId: string): PlanItem | null {
  return (
    items.find(
      (item) =>
        item.kind === "action" &&
        item.meta.source === PLAN_MATCH_ACTION_SOURCE &&
        item.meta.needItemId === needItemId &&
        item.meta.contactId === contactId,
    ) ?? null
  );
}

/** 「约 TA」行动对应的需求：优先 meta 里记的那条；新版本里换了 id 时取同一计划里关联着这个人的需求。 */
function needForMatchAction(items: readonly PlanItem[], action: PlanItem, contactId: string): PlanItem | null {
  const needs = items.filter((item) => item.kind === "network_need");
  return (
    needs.find((item) => item.id === action.meta.needItemId) ??
    needs.find((item) => item.carriedFromItemId === action.meta.needItemId) ??
    needs.find((item) => item.linkedContactIds.includes(contactId)) ??
    null
  );
}

function contactLabel(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return name ? name.slice(0, 80) : "TA";
}

/** W0012：报名版本（`updatedAt`，ISO 时间）比较；解析不了时按字符串比较。 */
function isNewerVersion(candidate: string, current: string): boolean {
  const a = Date.parse(candidate);
  const b = Date.parse(current);
  if (Number.isFinite(a) && Number.isFinite(b)) return a > b;
  return candidate > current;
}

/** 请求指纹：同一幂等键只能对应同一个请求。 */
function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * W0021：「进入新阶段」还没记过吗？API 读取、计划页 SSR、`enterCurrentPhase` 与每日维护共用这一个判定。
 * 目标阶段按计划自身 `startsOn` 的东京日周次计算（`phaseToEnter`），跳过条件绑定
 * actor（reader 的 scope）+ 生效计划 id + 目标阶段（幂等键 `phase-entered:<planId>:<phaseKey>`）：
 * 同周新建／重新分析的计划 id 不同，照常执行首次进入。
 */
async function phaseEntryPending(reader: PlanReader, plan: Pick<Plan, "id" | "startsOn" | "phases">, at: Date): Promise<boolean> {
  const target = phaseToEnter(plan, at);
  if (!target) return false;
  return !(await reader.hasLogIdempotencyKey(phaseEnteredKey(plan.id, target.phase.key)));
}

async function snapshotOf(reader: PlanReader, plan: Plan): Promise<PlanSnapshot> {
  return {
    items: await reader.items(plan.id),
    log: await reader.log(plan.id, PLAN_LIMITS.logPageSize),
    plan,
  };
}

export function createPlanService(options: CreatePlanServiceOptions): PlanService {
  const { repository } = options;
  const scope: PlanScope = {
    actorId: options.scope.actorId.trim(),
    workspaceId: options.scope.workspaceId.trim(),
  };
  if (!scope.actorId || !scope.workspaceId) throw new Error("Plan service requires a workspace and an actor.");
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? (() => randomUUID());
  const { references } = options;
  const phaseRefiner = options.phaseRefiner ?? defaultPhaseRefiner();

  async function assertReferences(contactIds: readonly string[], eventIds: readonly string[]): Promise<void> {
    const uniqueContacts = [...new Set(contactIds)];
    const uniqueEvents = [...new Set(eventIds)];
    const [missingContacts, missingEvents] = await Promise.all([
      uniqueContacts.length ? references.findMissingContactIds(uniqueContacts) : [],
      uniqueEvents.length ? references.findMissingEventIds(uniqueEvents) : [],
    ]);
    if (missingContacts.length > 0 || missingEvents.length > 0) {
      // 不回显 id：别人的联系人与不存在的联系人对外表现一致。
      throw new PlanServiceError(
        "REFERENCE_NOT_FOUND",
        missingContacts.length > 0 ? "A referenced contact was not found." : "A referenced event was not found.",
      );
    }
  }

  function keyReused(): never {
    throw new PlanServiceError("IDEMPOTENCY_KEY_REUSED", "idempotencyKey was already used for a different request.");
  }

  function buildItem(input: ParsedNewItem, planId: string, sortKey: number, at: string): PlanItem {
    const base: PlanItem = {
      answer: input.answer,
      carriedFromItemId: null,
      completedAt: null,
      contactLinks: [],
      createdAt: at,
      criteria: input.criteria,
      deferralCount: 0,
      detail: input.detail,
      id: newId(),
      kind: input.kind,
      linkedContactIds: [],
      linkedEventId: input.linkedEventId,
      meta: input.meta,
      phaseKey: input.phaseKey,
      planId,
      sortKey,
      status: input.kind === "info" && input.answer !== null ? "answered" : input.status,
      suggestedWeek: input.suggestedWeek,
      title: input.title,
      updatedAt: at,
    };
    return withLinks(
      base,
      input.contactIds.map((contactId) => ({ contactId, establishedAt: null, linkedAt: at, state: "linked" as const })),
    );
  }

  /** 一条「约 TA」行动（W0010 关联时、W0023 新版本当周）：同一需求 + 联系人一条，联系人为 linked。 */
  function matchAction(input: {
    need: PlanItem;
    contactId: string;
    name: string;
    planId: string;
    sortKey: number;
    week: number;
    at: string;
  }): PlanItem {
    const { at, contactId, need } = input;
    return withLinks(
      {
        answer: null,
        carriedFromItemId: null,
        completedAt: null,
        contactLinks: [],
        createdAt: at,
        criteria: null,
        deferralCount: 0,
        detail: clip(`人脉需求：${need.title}`),
        id: newId(),
        kind: "action",
        linkedContactIds: [],
        linkedEventId: null,
        meta: { contactId, needItemId: need.id, source: PLAN_MATCH_ACTION_SOURCE },
        phaseKey: need.phaseKey,
        planId: input.planId,
        sortKey: input.sortKey,
        status: "not_started",
        suggestedWeek: input.week,
        title: `约 ${input.name}`,
        updatedAt: at,
      },
      [{ contactId, establishedAt: null, linkedAt: at, state: "linked" }],
    );
  }

  /**
   * W0023：新版本（下一份计划、重新分析）为带入的人脉需求上每个仍是 linked 的联系人生成一条当周「约 TA」。
   * 跳过：已建立联系；新版本里已有这一对的「约 TA」（含带入的已完成行动，其 `meta.needItemId`
   * 指向旧版本的需求）；联系人已删除或不属于本人（一次批量校验）；超出 `itemsPerPlan` 的部分。
   */
  async function matchActionsForNewVersion(input: {
    items: readonly PlanItem[];
    oldById: ReadonlyMap<string, PlanItem>;
    names: Readonly<Record<string, string>>;
    planId: string;
    startsOn: string;
    phases: readonly { endWeek: number }[];
    at: string;
  }): Promise<PlanItem[]> {
    const { items } = input;
    const lineage = (need: PlanItem): Set<string> => {
      const ids = new Set([need.id]);
      let previous = need.carriedFromItemId;
      // 旧版本里的需求自己也可能是更早版本带入的：只能往回看到当前生效版本的这一层。
      if (previous) ids.add(previous);
      previous = previous ? (input.oldById.get(previous)?.carriedFromItemId ?? null) : null;
      if (previous) ids.add(previous);
      return ids;
    };
    const pairs: Array<{ need: PlanItem; contactId: string }> = [];
    for (const need of items) {
      if (need.kind !== "network_need" || !need.carriedFromItemId) continue;
      const needIds = lineage(need);
      for (const link of need.contactLinks) {
        if (link.state !== "linked") continue;
        const scheduled = items.some(
          (item) =>
            item.kind === "action" &&
            item.meta.source === PLAN_MATCH_ACTION_SOURCE &&
            item.meta.contactId === link.contactId &&
            needIds.has(String(item.meta.needItemId)),
        );
        if (!scheduled) pairs.push({ contactId: link.contactId, need });
      }
    }
    if (pairs.length === 0) return [];
    const missing = new Set(await references.findMissingContactIds([...new Set(pairs.map((pair) => pair.contactId))]));
    const room = Math.max(0, PLAN_LIMITS.itemsPerPlan - items.length);
    const week = Math.min(planTotalWeeks(input.phases), planWeekAt(input.startsOn, new Date(input.at)));
    return pairs
      .filter((pair) => !missing.has(pair.contactId))
      .slice(0, room)
      .map((pair, offset) =>
        matchAction({
          at: input.at,
          contactId: pair.contactId,
          name: contactLabel(input.names[pair.contactId]),
          need: pair.need,
          planId: input.planId,
          sortKey: items.length + offset,
          week,
        }),
      );
  }

  async function writeLog(
    tx: PlanTransaction,
    entry: Omit<PlanLogEntry, "id" | "createdAt"> & { createdAt?: string },
  ): Promise<PlanLogEntry> {
    const full: PlanLogEntry = { ...entry, createdAt: entry.createdAt ?? now(), id: newId() };
    await tx.insertLog(full);
    return full;
  }

  /**
   * W0010：在已开启的事务里把联系人关联到人脉需求，并确保本周有一条「约 TA」行动
   * （同一需求 + 同一联系人只一条）。真实关联时写 `contact_linked`，`targetItemId` 指向行动。
   * W0023：计划已过最后一周时只记关联和进展记录，不生成行动（到期前已生成的那条照常返回、周次不变）；
   * 下一份计划在 `createVersionWithOutcome` 里为带入的已关联需求生成。
   */
  async function linkWithin(
    tx: PlanTransaction,
    input: { needItemId: string; contactId: string; name: string; logKey: string | null },
  ): Promise<{ need: PlanItem; action: PlanItem | null; log: PlanLogEntry | null; at: string }> {
    const { contactId, name } = input;
    const need = await tx.item(input.needItemId);
    if (!need || need.kind !== "network_need") throw new PlanServiceError("ITEM_NOT_FOUND", "Network need not found.");
    const plan = await tx.plan(need.planId);
    if (!plan) throw new PlanServiceError("PLAN_NOT_FOUND", "Plan not found.");
    if (plan.status !== "active") throw new PlanServiceError("PLAN_ARCHIVED", "Archived plan versions are read-only.");
    // 已关联也要校验：联系人必须是本人的（他人的联系人与不存在的对外一样是 404）。
    await assertReferences([contactId], []);

    const at = now();
    const items = await tx.items(plan.id);
    let action = findMatchAction(items, need.id, contactId);
    if (!action && !planWeekState(plan, new Date(at)).ended) {
      if (items.length >= PLAN_LIMITS.itemsPerPlan) illegal("This plan has too many items.");
      const week = Math.min(PLAN_LIMITS.maxWeek, planWeekAt(plan.startsOn, new Date(at)));
      action = matchAction({
        at,
        contactId,
        name,
        need,
        planId: plan.id,
        sortKey: items.reduce((max, item) => Math.max(max, item.sortKey), -1) + 1,
        week,
      });
      await tx.insertItems([action]);
    }

    let nextNeed = need;
    let log: PlanLogEntry | null = null;
    const applied = applyItemChange(need, { contactId, op: "link_contact" }, at);
    if (applied) {
      await tx.updateItem(applied.item);
      nextNeed = applied.item;
      log = await writeLog(tx, {
        author: "user",
        body: applied.body,
        createdAt: at,
        event: applied.event,
        fromStatus: applied.fromStatus,
        idempotencyKey: input.logKey ?? `link:auto:${newId()}`,
        itemId: need.id,
        kind: "auto",
        linkedContactIds: applied.linkedContactIds,
        linkedEventId: null,
        payload: { ...applied.payload, actionItemId: action?.id ?? null },
        planId: plan.id,
        targetItemId: action?.id ?? null,
        toStatus: applied.toStatus,
      });
    }
    return { action, at, log, need: nextNeed };
  }

  /** 进入新阶段的写事务（取 actor 锁后按同一幂等键再判一次）。 */
  async function enterPhaseTransaction(): Promise<EnterPhaseResult> {
    const nothing: EnterPhaseResult = { entered: null, refined: [] };
    return repository.transact(scope, async (tx) => {
      const plan = await tx.activePlan();
      if (!plan) return nothing;
      const at = now();
      const target = phaseToEnter(plan, new Date(at));
      if (!target) return nothing;
      const key = phaseEnteredKey(plan.id, target.phase.key);
      if (await tx.hasLogIdempotencyKey(key)) return nothing;
      const items = await tx.items(plan.id);
      const refined: PlanItem[] = [];
      if (phaseNeedsRefinement(plan, target.phase)) {
        const refinement = await phaseRefiner({ items, phase: target.phase, plan });
        for (const update of refinement.weekUpdates) {
          const existing = items.find((item) => item.id === update.itemId);
          if (!existing) continue;
          const next: PlanItem = { ...existing, suggestedWeek: update.suggestedWeek, updatedAt: at };
          await tx.updateItem(next);
          refined.push(next);
        }
        let sortKey = items.reduce((max, item) => Math.max(max, item.sortKey), -1);
        const room = Math.max(0, PLAN_LIMITS.itemsPerPlan - items.length);
        const inserts = refinement.inserts.slice(0, room).map((entry): PlanItem => {
          sortKey += 1;
          return {
            answer: null,
            carriedFromItemId: null,
            completedAt: null,
            contactLinks: [],
            createdAt: at,
            criteria: null,
            deferralCount: 0,
            detail: entry.detail === null ? null : clip(entry.detail),
            id: newId(),
            kind: "action",
            linkedContactIds: [],
            linkedEventId: null,
            meta: { phaseKey: target.phase.key, source: PLAN_PHASE_REFINEMENT_SOURCE },
            phaseKey: target.phase.key,
            planId: plan.id,
            sortKey,
            status: "not_started",
            suggestedWeek: entry.suggestedWeek,
            title: entry.title,
            updatedAt: at,
          };
        });
        if (inserts.length > 0) await tx.insertItems(inserts);
        refined.push(...inserts);
      }
      const entered = await writeLog(tx, {
        author: "system",
        body: clip(
          refined.length > 0
            ? `进入第 ${target.index + 1} 阶段「${target.phase.title}」，补充了 ${refined.length} 条周级行动`
            : `进入第 ${target.index + 1} 阶段「${target.phase.title}」`,
        ),
        createdAt: at,
        event: "phase_entered",
        fromStatus: plan.phases[target.index - 1]?.key ?? null,
        idempotencyKey: key,
        itemId: null,
        kind: "auto",
        linkedContactIds: [],
        linkedEventId: null,
        payload: {
          phaseIndex: target.index,
          phaseKey: target.phase.key,
          phaseTitle: target.phase.title,
          refinedCount: refined.length,
          refinedItemIds: refined.map((item) => item.id),
        },
        planId: plan.id,
        targetItemId: null,
        toStatus: target.phase.key,
      });
      return { entered, refined };
    });
  }

  const service: PlanService = {
    async getCurrent() {
      return repository.read(scope, async (reader) => {
        const plan = await reader.activePlan();
        return plan ? snapshotOf(reader, plan) : null;
      });
    },

    async getPlan(planId) {
      const id = parseId(planId, "planId");
      return repository.read(scope, async (reader) => {
        const plan = await reader.plan(id);
        return plan ? snapshotOf(reader, plan) : null;
      });
    },

    async listVersions() {
      return repository.read(scope, (reader) => reader.listPlans());
    },

    async createVersion(rawInput) {
      return (await service.createVersionWithOutcome(rawInput)).snapshot;
    },

    async createVersionWithOutcome(rawInput, options = {}) {
      const input = parseCreatePlanVersionInput(rawInput);
      const origin = options.origin ?? null;
      return repository.transact(scope, async (tx) => {
        if (input.creationKey) {
          const existing = await tx.planByCreationKey(input.creationKey);
          // 同一 creationKey 已保存过：在同一个按人串行的事务里判定，并发重复提交里只有一份是 created。
          if (existing) return { created: false, snapshot: await snapshotOf(tx, existing) };
        }
        const active = await tx.activePlan();
        if (input.basePlanId !== undefined && (active?.id ?? null) !== input.basePlanId) {
          throw new PlanServiceError(
            "BASE_PLAN_MISMATCH",
            input.basePlanId === null
              ? "An active plan already exists."
              : "The active plan changed; reload before creating a new version.",
          );
        }
        // W0012：重新分析与到期后的下一份都必须基于一份生效计划。
        // 重新分析每个东京自然月 1 次：额度键在这个按人串行的事务里先查，唯一约束兜底。
        // 下一份不占额度，但只有计划已过最后一周才允许（否则就是绕过额度的重新分析）。
        let quotaKey: string | null = null;
        if (origin) {
          if (!active) throw new PlanServiceError("NO_ACTIVE_PLAN", "There is no active plan to follow up on.");
          if (origin === "reanalysis") {
            quotaKey = reanalysisQuotaKey(tokyoMonthKey(new Date(now())));
            if (await tx.logByIdempotencyKey(quotaKey)) {
              throw new PlanServiceError("REANALYSIS_QUOTA_EXHAUSTED", "This month's re-analysis has already been used.");
            }
          } else if (!planWeekState(active, new Date(now())).ended) {
            throw new PlanServiceError("PLAN_NOT_ENDED", "The current plan has not reached its end yet.");
          }
        }

        await assertReferences(
          input.items.flatMap((item) => item.contactIds),
          input.items.flatMap((item) => (item.linkedEventId ? [item.linkedEventId] : [])),
        );

        const at = now();
        const planId = newId();
        const version = (await tx.maxVersion()) + 1;
        const oldItems = active ? await tx.items(active.id) : [];
        const oldById = new Map(oldItems.map((item) => [item.id, item]));
        const claimed = new Set<string>();

        const items = input.items.map((raw, index) => {
          const item = buildItem(raw, planId, index, at);
          if (!raw.inheritsFromItemId) return item;
          const old = oldById.get(raw.inheritsFromItemId);
          if (!old || old.kind !== item.kind) {
            throw new PlanServiceError("INVALID_INPUT", `items[${index}].inheritsFromItemId is not an item of the same kind in the active plan.`);
          }
          if (claimed.has(old.id)) {
            throw new PlanServiceError("INVALID_INPUT", `items[${index}].inheritsFromItemId is already inherited by another item.`);
          }
          claimed.add(old.id);
          return mergeInherited(item, old);
        });

        // 同一活动不重复：新版本里再次出现的活动并入旧条目的报名状态。
        items.forEach((item, index) => {
          if (item.kind !== "event" || item.carriedFromItemId) return;
          const old = oldItems.find(
            (entry) => entry.kind === "event" && !claimed.has(entry.id) && entry.linkedEventId === item.linkedEventId,
          );
          if (!old) return;
          claimed.add(old.id);
          items[index] = mergeInherited(item, old);
        });

        const phaseKeys = new Set(input.phases.map((phase) => phase.key));
        const carried = oldItems
          .filter((old) => !claimed.has(old.id) && isCompletedContent(old))
          .map((old, offset): PlanItem => ({
            ...old,
            carriedFromItemId: old.id,
            createdAt: at,
            deferralCount: 0,
            id: newId(),
            phaseKey: old.phaseKey !== null && phaseKeys.has(old.phaseKey) ? old.phaseKey : null,
            planId,
            sortKey: items.length + offset,
            // 旧周次以旧的 startsOn 为准，在新版本里没有意义。
            suggestedWeek: null,
            updatedAt: at,
          }));

        // W0023：下一份计划／重新分析（带 origin）在同一事务里为带入的已关联需求生成当周「约 TA」。
        const scheduled = origin
          ? await matchActionsForNewVersion({
              at,
              items: [...items, ...carried],
              names: options.contactNames ?? {},
              oldById,
              phases: input.phases,
              planId,
              startsOn: input.startsOn,
            })
          : [];

        if (active) await tx.archivePlan(active.id, at);
        const plan: Plan = {
          analysis: input.analysis,
          archivedAt: null,
          createdAt: at,
          goalSnapshot: input.goalSnapshot,
          horizon: input.horizon,
          id: planId,
          phases: input.phases,
          previousPlanId: active?.id ?? null,
          sourceSessionId: input.sourceSessionId,
          startsOn: input.startsOn,
          status: "active",
          updatedAt: at,
          version,
        };
        await tx.insertPlan({ ...plan, creationKey: input.creationKey });
        await tx.insertItems([...items, ...carried, ...scheduled]);
        const inheritedCount = items.filter((item) => item.carriedFromItemId).length;
        await writeLog(tx, {
          author: "system",
          body: carried.length + inheritedCount > 0
            ? `生成计划 v${version}（带入上一版的 ${carried.length + inheritedCount} 项进度）`
            : `生成计划 v${version}`,
          createdAt: at,
          event: "plan_created",
          fromStatus: null,
          idempotencyKey: quotaKey ?? `plan-created:${planId}`,
          itemId: null,
          kind: "auto",
          linkedContactIds: [],
          linkedEventId: null,
          payload: {
            carriedCount: carried.length,
            inheritedCount,
            ...(origin ? { matchActionCount: scheduled.length } : {}),
            ...(origin ? { origin } : {}),
            previousPlanId: active?.id ?? null,
            version,
          },
          planId,
          targetItemId: null,
          toStatus: "active",
        });
        return { created: true, snapshot: await snapshotOf(tx, plan) };
      });
    },

    async updateItem(rawInput) {
      const itemId = parseId(rawInput?.itemId, "itemId");
      const change = parseItemChange(rawInput?.change);
      const clientKey = rawInput?.idempotencyKey == null ? null : parseId(rawInput.idempotencyKey, "idempotencyKey");
      const idempotencyKey = clientKey ? `item:${clientKey}` : null;
      const requestFingerprint = fingerprint({ change, itemId, kind: "item_change" });
      return repository.transact(scope, async (tx) => {
        if (idempotencyKey) {
          const receipt = await tx.commandReceipt(idempotencyKey);
          if (receipt) {
            if (receipt.kind !== "item_change" || receipt.fingerprint !== requestFingerprint) keyReused();
            const current = await tx.item(itemId);
            if (!current) throw new PlanServiceError("ITEM_NOT_FOUND", "Plan item not found.");
            return {
              item: current,
              log: receipt.logId ? await tx.logById(receipt.logId) : null,
              replayed: true,
            };
          }
        }
        const item = await tx.item(itemId);
        if (!item) throw new PlanServiceError("ITEM_NOT_FOUND", "Plan item not found.");
        const plan = await tx.plan(item.planId);
        if (!plan) throw new PlanServiceError("PLAN_NOT_FOUND", "Plan not found.");
        if (plan.status !== "active") throw new PlanServiceError("PLAN_ARCHIVED", "Archived plan versions are read-only.");

        const at = now();
        const applied = applyItemChange(item, change, at);
        if (applied?.event === "contact_linked") await assertReferences(applied.linkedContactIds, []);
        const receiptBase = {
          createdAt: at,
          fingerprint: requestFingerprint,
          itemId: item.id,
          kind: "item_change" as const,
          planId: plan.id,
        };
        if (!applied) {
          if (idempotencyKey) {
            await tx.insertCommandReceipt({ ...receiptBase, idempotencyKey, logId: null, outcome: "noop" });
          }
          return { item, log: null, replayed: false };
        }
        await tx.updateItem(applied.item);
        const log = await writeLog(tx, {
          author: "user",
          body: applied.body,
          createdAt: at,
          event: applied.event,
          fromStatus: applied.fromStatus,
          idempotencyKey: idempotencyKey ?? `item:auto:${newId()}`,
          itemId: item.id,
          kind: "auto",
          linkedContactIds: applied.linkedContactIds,
          linkedEventId: item.linkedEventId,
          payload: applied.payload,
          planId: plan.id,
          targetItemId: null,
          toStatus: applied.toStatus,
        });
        if (idempotencyKey) {
          await tx.insertCommandReceipt({ ...receiptBase, idempotencyKey, logId: log.id, outcome: "applied" });
        }
        return { item: applied.item, log, replayed: false };
      });
    },

    async addManualLog(rawInput) {
      const input = parseManualLogInput(rawInput);
      const idempotencyKey = input.idempotencyKey ? `manual:${input.idempotencyKey}` : null;
      const { idempotencyKey: _clientKey, ...request } = input;
      const requestFingerprint = fingerprint({ ...request, kind: "manual_log" });
      return repository.transact(scope, async (tx) => {
        if (idempotencyKey) {
          const receipt = await tx.commandReceipt(idempotencyKey);
          if (receipt) {
            if (receipt.kind !== "manual_log" || receipt.fingerprint !== requestFingerprint) keyReused();
            const entry = receipt.logId ? await tx.logById(receipt.logId) : null;
            if (!entry) throw new Error("Plan command receipt has no log entry.");
            return { entry, replayed: true };
          }
        }
        const plan = await tx.activePlan();
        if (!plan) throw new PlanServiceError("NO_ACTIVE_PLAN", "There is no active plan to log progress on.");
        for (const referenced of [input.itemId, input.targetItemId]) {
          if (referenced === null) continue;
          const item = await tx.item(referenced);
          if (!item || item.planId !== plan.id) {
            throw new PlanServiceError("ITEM_NOT_FOUND", "Referenced plan item not found in the active plan.");
          }
        }
        await assertReferences(input.linkedContactIds, input.linkedEventId ? [input.linkedEventId] : []);
        const at = now();
        const entry = await writeLog(tx, {
          author: "user",
          body: input.body,
          createdAt: at,
          event: "note",
          fromStatus: null,
          idempotencyKey: idempotencyKey ?? `manual:auto:${newId()}`,
          itemId: input.itemId,
          kind: "manual",
          linkedContactIds: input.linkedContactIds,
          linkedEventId: input.linkedEventId,
          payload: {},
          planId: plan.id,
          targetItemId: input.targetItemId,
          toStatus: null,
        });
        // W0012：@ 某人 = 和 TA 有了真实往来。TA 在本计划里所属的人脉需求上（已关联的）变为已建立联系，
        // 每条需求写一条 auto 记录；只读结构化的 linkedContactIds，不从正文反解。
        for (const contactId of input.linkedContactIds) {
          for (const need of await tx.items(plan.id)) {
            if (need.kind !== "network_need" || !need.linkedContactIds.includes(contactId)) continue;
            const applied = applyItemChange(need, { contactId, op: "establish_contact" }, at);
            if (!applied) continue;
            await tx.updateItem(applied.item);
            await writeLog(tx, {
              author: "user",
              body: applied.body,
              createdAt: at,
              event: applied.event,
              fromStatus: applied.fromStatus,
              idempotencyKey: `mention:${entry.id}:${need.id}:${contactId}`,
              itemId: need.id,
              kind: "auto",
              linkedContactIds: applied.linkedContactIds,
              linkedEventId: null,
              payload: { ...applied.payload, noteLogId: entry.id, source: "manual_mention" },
              planId: plan.id,
              targetItemId: null,
              toStatus: applied.toStatus,
            });
          }
        }
        if (idempotencyKey) {
          await tx.insertCommandReceipt({
            createdAt: at,
            fingerprint: requestFingerprint,
            idempotencyKey,
            itemId: null,
            kind: "manual_log",
            logId: entry.id,
            outcome: "applied",
            planId: plan.id,
          });
        }
        return { entry, replayed: false };
      });
    },

    async linkNeedContact(rawInput) {
      const needItemId = parseId(rawInput?.needItemId, "needItemId");
      const contactId = parseId(rawInput?.contactId, "contactId");
      const name = contactLabel(rawInput?.contactName);
      const clientKey = rawInput?.idempotencyKey == null ? null : parseId(rawInput.idempotencyKey, "idempotencyKey");
      const idempotencyKey = clientKey ? `link:${clientKey}` : null;
      const requestFingerprint = fingerprint({ contactId, kind: "link_need_contact", needItemId });
      return repository.transact(scope, async (tx) => {
        if (idempotencyKey) {
          const receipt = await tx.commandReceipt(idempotencyKey);
          if (receipt) {
            if (receipt.kind !== "item_change" || receipt.fingerprint !== requestFingerprint) keyReused();
            const need = await tx.item(needItemId);
            if (!need) throw new PlanServiceError("ITEM_NOT_FOUND", "Plan item not found.");
            // W0023：到期计划上的关联没有行动，回放同样返回 null。
            const action = findMatchAction(await tx.items(need.planId), need.id, contactId);
            return { action, log: receipt.logId ? await tx.logById(receipt.logId) : null, need, replayed: true };
          }
        }
        const linked = await linkWithin(tx, { contactId, logKey: idempotencyKey, name, needItemId });
        if (idempotencyKey) {
          await tx.insertCommandReceipt({
            createdAt: linked.at,
            fingerprint: requestFingerprint,
            idempotencyKey,
            itemId: linked.need.id,
            kind: "item_change",
            logId: linked.log?.id ?? null,
            outcome: linked.log ? "applied" : "noop",
            planId: linked.need.planId,
          });
        }
        return { action: linked.action, log: linked.log, need: linked.need, replayed: false };
      });
    },

    async decideMatchCandidate(rawInput) {
      const candidateId = parseId(rawInput?.candidateId, "candidateId");
      const decision = rawInput?.decision;
      if (decision !== "accept" && decision !== "dismiss") {
        throw new PlanServiceError("INVALID_INPUT", 'decision must be "accept" or "dismiss".');
      }
      const name = contactLabel(rawInput?.contactName);
      const target = decision === "accept" ? "accepted" : "dismissed";
      // 一个按 actor 串行的事务：锁住候选 → 严格 CAS（只从 pending 转出）→ 接受时在同一事务里
      // 关联联系人、生成「约 TA」行动、写进展记录。并发的 是 / 不是 只有一个成功，另一个 409。
      return repository.transact(scope, async (tx) => {
        if (!tx.matchCandidateForUpdate || !tx.decideMatchCandidate) {
          throw new Error("Match candidates require the live plan store.");
        }
        const candidate = await tx.matchCandidateForUpdate(candidateId);
        if (!candidate) throw new PlanServiceError("ITEM_NOT_FOUND", "Match candidate not found.");
        if (candidate.status !== "pending") {
          if (candidate.status !== target) {
            throw new PlanServiceError("MATCH_ALREADY_DECIDED", `This candidate was already ${candidate.status}.`);
          }
          // 同一决定重复提交（响应丢失后重试）：回放现状，不再写库。
          if (target === "dismissed") return { candidateId, link: null, replayed: true, status: target };
          const need = await tx.item(candidate.needItemId);
          if (!need) throw new PlanServiceError("MATCH_ALREADY_DECIDED", "This candidate was already accepted.");
          // W0023：到期计划上接受的候选没有行动（action: null），回放现状。
          const action = findMatchAction(await tx.items(need.planId), need.id, candidate.contactId);
          return { candidateId, link: { action, log: null, need, replayed: true }, replayed: true, status: target };
        }
        let link: LinkNeedContactResult | null = null;
        if (target === "accepted") {
          const linked = await linkWithin(tx, {
            contactId: candidate.contactId,
            logKey: `match:${candidateId}`,
            name,
            needItemId: candidate.needItemId,
          });
          link = { action: linked.action, log: linked.log, need: linked.need, replayed: false };
        }
        if (!(await tx.decideMatchCandidate(candidateId, target, now()))) {
          throw new PlanServiceError("MATCH_ALREADY_DECIDED", "This candidate was already decided.");
        }
        return { candidateId, link, replayed: false, status: target };
      });
    },

    async recordInteraction(rawInput) {
      const actionItemId = parseId(rawInput?.actionItemId, "actionItemId");
      const clientKey = rawInput?.idempotencyKey == null ? null : parseId(rawInput.idempotencyKey, "idempotencyKey");
      const idempotencyKey = clientKey ? `interaction:${clientKey}` : null;
      const requestFingerprint = fingerprint({ actionItemId, kind: "record_interaction" });
      return repository.transact(scope, async (tx) => {
        const loadAction = async () => {
          const action = await tx.item(actionItemId);
          if (!action) throw new PlanServiceError("ITEM_NOT_FOUND", "Plan item not found.");
          const contactId = action.meta.contactId;
          if (action.kind !== "action" || action.meta.source !== PLAN_MATCH_ACTION_SOURCE || typeof contactId !== "string") {
            illegal("Only actions created from a network need can log an interaction.");
          }
          return { action, contactId };
        };
        if (idempotencyKey) {
          const receipt = await tx.commandReceipt(idempotencyKey);
          if (receipt) {
            if (receipt.kind !== "manual_log" || receipt.fingerprint !== requestFingerprint) keyReused();
            const { action, contactId } = await loadAction();
            const entry = receipt.logId ? await tx.logById(receipt.logId) : null;
            if (!entry) throw new Error("Plan command receipt has no log entry.");
            return { action, entry, need: needForMatchAction(await tx.items(action.planId), action, contactId), replayed: true };
          }
        }
        const { action, contactId } = await loadAction();
        const plan = await tx.plan(action.planId);
        if (!plan) throw new PlanServiceError("PLAN_NOT_FOUND", "Plan not found.");
        if (plan.status !== "active") throw new PlanServiceError("PLAN_ARCHIVED", "Archived plan versions are read-only.");
        const at = now();
        const autoLog = (item: PlanItem, applied: AppliedChange, targetItemId: string | null) =>
          writeLog(tx, {
            author: "user",
            body: applied.body,
            createdAt: at,
            event: applied.event,
            fromStatus: applied.fromStatus,
            idempotencyKey: `interaction:auto:${newId()}`,
            itemId: item.id,
            kind: "auto",
            linkedContactIds: applied.linkedContactIds,
            linkedEventId: null,
            payload: applied.payload,
            planId: plan.id,
            targetItemId,
            toStatus: applied.toStatus,
          });

        let need = needForMatchAction(await tx.items(plan.id), action, contactId);
        if (need && need.linkedContactIds.includes(contactId)) {
          const established = applyItemChange(need, { contactId, op: "establish_contact" }, at);
          if (established) {
            await tx.updateItem(established.item);
            await autoLog(need, established, action.id);
            need = established.item;
          }
        }
        let nextAction = action;
        const done = applyItemChange(action, { op: "set_status", status: "done" }, at);
        if (done) {
          await tx.updateItem(done.item);
          await autoLog(action, done, null);
          nextAction = done.item;
        }
        const entry = await writeLog(tx, {
          author: "user",
          body: clip(`记一次互动：${action.title}`),
          createdAt: at,
          event: "note",
          fromStatus: null,
          idempotencyKey: idempotencyKey ?? `interaction:note:${newId()}`,
          itemId: action.id,
          kind: "manual",
          linkedContactIds: [contactId],
          linkedEventId: null,
          payload: { interaction: true },
          planId: plan.id,
          targetItemId: need?.id ?? null,
          toStatus: null,
        });
        if (idempotencyKey) {
          await tx.insertCommandReceipt({
            createdAt: at,
            fingerprint: requestFingerprint,
            idempotencyKey,
            itemId: null,
            kind: "manual_log",
            logId: entry.id,
            outcome: "applied",
            planId: plan.id,
          });
        }
        return { action: nextAction, entry, need, replayed: false };
      });
    },

    async markEventAttended(rawInput) {
      const eventId = parseId(rawInput?.eventId, "eventId");
      return repository.transact(scope, async (tx) => {
        const plan = await tx.activePlan();
        if (!plan) return { item: null, logs: [] };
        const item = (await tx.items(plan.id)).find((entry) => entry.kind === "event" && entry.linkedEventId === eventId);
        if (!item) return { item: null, logs: [] };
        if (item.status === "attended") return { item, logs: [] };
        const at = now();
        // 状态只按状态机推进：推荐 → 已报名 → 已参加（调用方已核实本人报名了这场，「推荐」内部先经过「已报名」）。
        // 进展记录只写一条「参加活动」。
        let current = item;
        const steps: EventItemStatus[] = current.status === "recommended" ? ["registered", "attended"] : ["attended"];
        for (const status of steps) {
          const applied = applyItemChange(current, { op: "set_status", status }, at);
          if (applied) current = applied.item;
        }
        await tx.updateItem(current);
        const log = await writeLog(tx, {
          author: "user",
          body: clip(`${EVENT_STATUS_BODY.attended}：${item.title}`),
          createdAt: at,
          event: "item_status_changed",
          fromStatus: item.status,
          // 每个条目只一条；并发的两次确认由按 actor 串行的事务与唯一键兜底。
          idempotencyKey: `event-attended:${item.id}`,
          itemId: item.id,
          kind: "auto",
          linkedContactIds: [],
          linkedEventId: eventId,
          payload: { op: "set_status", source: "event_attribution" },
          planId: plan.id,
          targetItemId: null,
          toStatus: "attended",
        });
        return { item: current, logs: [log] };
      });
    },

    async markEventRegistration(rawInput) {
      const eventId = parseId(rawInput?.eventId, "eventId");
      const registrationVersion = parseId(rawInput?.registrationVersion, "registrationVersion");
      const registered = rawInput?.registered === true;
      const target: EventItemStatus = registered ? "registered" : "recommended";
      return repository.transact(scope, async (tx) => {
        const plan = await tx.activePlan();
        if (!plan) return { item: null, log: null };
        const item = (await tx.items(plan.id)).find((entry) => entry.kind === "event" && entry.linkedEventId === eventId);
        if (!item) return { item: null, log: null };
        // 已参加是终态。
        if (item.status === "attended") return { item, log: null };
        // 乱序到达：条目上记着最近一次同步的报名版本；不比它新的同步一律忽略（例如取消已同步后，
        // 更早的那次报名才到——不能把状态改回去）。
        const syncedVersion = typeof item.meta.registrationVersion === "string" ? item.meta.registrationVersion : null;
        if (syncedVersion !== null && !isNewerVersion(registrationVersion, syncedVersion)) return { item, log: null };
        const at = now();
        // 状态已一致（重复提交、报名信息更新）：只记下版本，不写进展记录。
        if (item.status === target) {
          const synced: PlanItem = { ...item, meta: { ...item.meta, registrationVersion }, updatedAt: at };
          await tx.updateItem(synced);
          return { item: synced, log: null };
        }
        const change = applyItemChange(item, { op: "set_status", status: target }, at);
        if (!change) return { item, log: null };
        const applied = { ...change, item: { ...change.item, meta: { ...change.item.meta, registrationVersion } } };
        const idempotencyKey = `${registered ? "event-registered" : "event-cancelled"}:${item.id}:${registrationVersion}`;
        // 同一次报名／取消（同一个版本）已经记过：不再写（并发由按人串行的事务与唯一键兜底）。
        if (await tx.logByIdempotencyKey(idempotencyKey)) return { item, log: null };
        await tx.updateItem(applied.item);
        const log = await writeLog(tx, {
          author: "user",
          body: applied.body,
          createdAt: at,
          event: applied.event,
          fromStatus: applied.fromStatus,
          idempotencyKey,
          itemId: item.id,
          kind: "auto",
          linkedContactIds: [],
          linkedEventId: eventId,
          payload: { ...applied.payload, source: "event_registration" },
          planId: plan.id,
          targetItemId: null,
          toStatus: applied.toStatus,
        });
        return { item: applied.item, log };
      });
    },

    async enterCurrentPhase() {
      // 先只读判定：绝大多数读取时要么还在第 1 段、要么这一段已经记过，不取锁、不开写事务。
      const pending = await repository.read(scope, async (reader) => {
        const plan = await reader.activePlanView();
        return plan ? phaseEntryPending(reader, plan, new Date(now())) : false;
      });
      if (!pending) return { entered: null, refined: [] };
      return enterPhaseTransaction();
    },

    async getCurrentView(options = {}) {
      const includeLog = options.includeLog !== false;
      const readSnapshot = async (reader: PlanReader, plan: PlanView): Promise<PlanViewSnapshot> => ({
        items: await reader.viewItems(plan.id),
        log: includeLog ? await reader.viewLog(plan.id, PLAN_LIMITS.logPageSize) : [],
        plan,
      });
      // 一个只读事务：计划行 →（只在第 2 段及以后）这一段的「已进入」记录在不在 → 条目 →（计划页）进展记录。
      const first = await repository.read(scope, async (reader) => {
        const plan = await reader.activePlanView();
        if (!plan) return { pending: false, snapshot: null };
        if (await phaseEntryPending(reader, plan, new Date(now()))) return { pending: true, snapshot: null };
        return { pending: false, snapshot: await readSnapshot(reader, plan) };
      });
      if (!first.pending) return first.snapshot;
      // 边界后第一次打开：先写「进入新阶段」（幂等；并发时只有一个真正写入），再读，这次打开就能看到补充的行动。
      await enterPhaseTransaction().catch(() => undefined);
      return repository.read(scope, async (reader) => {
        const plan = await reader.activePlanView();
        return plan ? readSnapshot(reader, plan) : null;
      });
    },

    async weeklySummary() {
      const at = new Date(now());
      if (!isTokyoMonday(at)) return null;
      const window = previousTokyoWeek(at);
      return repository.read(scope, async (reader) => {
        if (!(await reader.activePlan())) return null;
        return summarizePlanWeek(await reader.logBetween(window.fromIso, window.toIso, WEEKLY_SUMMARY_LOG_LIMIT), window);
      });
    },

    async reanalysisQuota() {
      const month = tokyoMonthKey(new Date(now()));
      // W0021：只判断这个月的额度记录在不在（不读整行）。
      const used = await repository.read(scope, async (reader) =>
        (await reader.hasLogIdempotencyKey(reanalysisQuotaKey(month))) ? 1 : 0,
      );
      return { limit: REANALYSIS_MONTHLY_LIMIT, month, remaining: Math.max(0, REANALYSIS_MONTHLY_LIMIT - used), used };
    },
  };
  return service;
}
