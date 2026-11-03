/**
 * R37a 准备卡服务（plan-v3/DESIGN.md §2.5 / §2.6 / §3.3）：v3 计划的「先做的事」与准备卡的生成、勾选、重新生成、置旧。
 *
 * - 生成：`ensure(planId)`——规则列候选 → AI `pick`（只回编号）→ 每件 AI `card` → 逐句对账（`reconcile.ts`）→ 写回
 *   `plans.analysis.home`。初次合计 ≤ `PLAN_PREP_INITIAL_CARDS_LIMIT` 次调用，`trigger: "plan"`（只记账、不占日限）。
 *   幂等：生成中先写 `state: pending`（2 分钟内别的请求不重复生成），账本键 `prep:<planId>:…` 同一个。
 * - 重新生成：`regenerate`——`trigger: "manual"`，计入计划流程每日 15 次；成功后 `staleSince` 清空。
 * - 置旧：`markStale(contactId)`——该联系人的卡 `staleSince` 置位（只置一次，保留最早时刻）。
 */
import { AppError } from "../../../shared/errors/app-error";
import { PLAN_PREP_INITIAL_CARDS_LIMIT } from "../../ai-quota/constants";
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { PlanHomeView, PlanPrepCardView, PlanPrepGap, PlanPrepRow } from "../../../shared/contract/plan-v2";
import { planHomeNeedsWork, planHomeView, storedHomeOf } from "./view";
import { eventsFor, resolveTypedEvents, type OverviewInput, type PlanEventFact } from "../v2/overview";
import { activeAwards } from "../v2/service";
import type { PlanV2Reader, PlanV2Repository, PlanV2Row, PlanV2Scope } from "../v2/types";
import { candidateSignature, homeCandidates } from "./candidates";
import { commonGround } from "./common-ground";
import { fallbackCard, hookValid, reconcileDraft, reconcilePicks } from "./reconcile";
import {
  PLAN_HOME_LIMITS,
  type PlanHomeCandidate,
  type PlanPrepAi,
  type PlanPrepCardInput,
  type PlanPrepContactCard,
  type PlanPrepContext,
  type PlanPrepFact,
  type PlanPrepProfile,
  type StoredPlanHome,
  type StoredPlanHomeAction,
} from "./types";

export type PlanPrepErrorReason = "PLAN_NOT_FOUND" | "ACTION_NOT_FOUND" | "LIMIT" | "BUSY" | "FAILED";

export class PlanPrepError extends AppError {
  readonly reason: PlanPrepErrorReason;
  constructor(reason: PlanPrepErrorReason, message: string) {
    super(reason === "PLAN_NOT_FOUND" || reason === "ACTION_NOT_FOUND" ? "NOT_FOUND" : reason === "FAILED" ? "SERVICE_UNAVAILABLE" : "CONFLICT", message);
    this.name = "PlanPrepError";
    this.reason = reason;
  }
}

export interface PlanPrepServiceOptions {
  repository: PlanV2Repository;
  scope: PlanV2Scope;
  ai: PlanPrepAi;
  context: PlanPrepContext;
  events?: () => Promise<PlanEventFact[]>;
  now?: () => Date;
  log?: (entry: Record<string, unknown>) => void;
}

export interface PlanPrepService {
  /** 需要时生成（没有 / 上次中断 / 上次没候选而现在有了）；返回生成后的整块，不需要时返回现状。 */
  ensure(planId: string, language: PlanCopyLanguage): Promise<PlanHomeView | null>;
  setDone(input: { planId: string; actionKey: string; done: boolean }): Promise<PlanHomeView>;
  regenerate(input: { planId: string; actionKey: string; idempotencyKey: string; language: PlanCopyLanguage }): Promise<PlanHomeView>;
  /** 该联系人新增 / 更新了事实：本人生效计划里引用这个人的卡置「资料有更新」；返回被置位的卡数。 */
  markStale(contactId: string): Promise<number>;
  /** 本人的联系人（别人的、已删除的为 false）：手动补事实前的归属检查。 */
  hasContact(contactId: string): Promise<boolean>;
}

/* ---------- 文案（系统行的出处标签与固定说明） ---------- */

const COPY: Record<PlanCopyLanguage, {
  card: string; cardRecord: string; contactRecord: string; mailRecord: string; eventPage: string; mine: string; mineAndCard: string;
  scanned: (date: string) => string; added: (date: string) => string; linked: (title: string) => string; noLink: string;
}> = {
  en: { added: (date) => `Added on ${date}`, card: "Card", cardRecord: "Card record", contactRecord: "Contact record", eventPage: "Event page", linked: (title) => `, linked event: ${title}`, mailRecord: "Contact log", mine: "Your profile + your notes", mineAndCard: "Your profile + card", noLink: ", no linked event", scanned: (date) => `Card scanned on ${date}` },
  ja: { added: (date) => `${date} に追加`, card: "名刺", cardRecord: "名刺の記録", contactRecord: "連絡先の記録", eventPage: "イベントページ", linked: (title) => `、関連イベント：${title}`, mailRecord: "やりとりの記録", mine: "あなたの資料 + メモ", mineAndCard: "あなたの資料 + 名刺", noLink: "、関連イベントなし", scanned: (date) => `${date} に名刺を読み取り` },
  zh: { added: (date) => `${date} 添加`, card: "名片", cardRecord: "名片记录", contactRecord: "联系人记录", eventPage: "活动页", linked: (title) => `，关联活动：${title}`, mailRecord: "联系记录", mine: "你的资料 + 你的备注", mineAndCard: "你的资料 + 名片", noLink: "，没有关联活动", scanned: (date) => `${date} 扫的名片` },
};

function tokyoDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", { day: "2-digit", month: "2-digit", timeZone: "Asia/Tokyo", year: "numeric" }).format(date).replace(/-/g, "/");
}

function tokyoDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", hour: "2-digit", hour12: false, minute: "2-digit", month: "numeric", timeZone: "Asia/Tokyo" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

/** 联系人卡的系统行（没有记录的行不出）。 */
export function contactRows(language: PlanCopyLanguage, contact: PlanPrepContactCard, common: ReturnType<typeof commonGround>): PlanPrepRow[] {
  const copy = COPY[language];
  const rows: PlanPrepRow[] = [];
  const who = [contact.role, contact.organization].filter(Boolean).join(" · ");
  if (who) rows.push({ key: "who", source: copy.card, value: who });
  const day = tokyoDate(contact.createdAt);
  if (day) {
    const scanned = contact.sourceLabel === "card";
    const head = scanned ? copy.scanned(day) : copy.added(day);
    rows.push({ key: "met", source: scanned ? copy.cardRecord : copy.contactRecord, value: `${head}${contact.sourceEventTitle ? copy.linked(contact.sourceEventTitle) : copy.noLink}` });
  }
  const last = tokyoDate(contact.lastInteractionAt);
  if (last) rows.push({ key: "last_contact", source: copy.mailRecord, value: contact.lastInteractionLabel ? `${last} ${contact.lastInteractionLabel}` : last });
  if (common) rows.push({ key: "common", source: common.basis === "profile_fact" ? copy.mine : copy.mineAndCard, value: common.text });
  return rows;
}

export function prepGaps(contact: PlanPrepContactCard | null, facts: readonly PlanPrepFact[]): PlanPrepGap[] {
  if (!contact) return [];
  const gaps: PlanPrepGap[] = [];
  if (facts.length === 0) gaps.push("memo");
  if (!contact.lastInteractionAt) gaps.push("interaction");
  return gaps;
}

/* ---------- 服务 ---------- */

export function createPlanPrepService(options: PlanPrepServiceOptions): PlanPrepService {
  const { repository, scope, ai, context } = options;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((entry) => console.info(JSON.stringify(entry)));

  async function loadEvents(): Promise<PlanEventFact[]> {
    if (!options.events) return [];
    try { return await options.events(); } catch { return []; }
  }

  async function candidatesOf(reader: PlanV2Reader, plan: PlanV2Row, language: PlanCopyLanguage): Promise<PlanHomeCandidate[]> {
    const events = await loadEvents();
    const types = await reader.typeItems(plan.id);
    const log = await reader.log(plan.id);
    const awards = activeAwards(log);
    const candidates = await reader.matchCandidates(types.map((type) => type.id));
    const ids = new Set<string>();
    for (const candidate of candidates) ids.add(candidate.contactId);
    for (const type of types) for (const link of type.contactLinks) ids.add(link.contactId);
    const contacts = new Map((await reader.contactViews([...ids])).map((contact) => [contact.id, contact]));
    const input: OverviewInput = { awards, candidates, contacts, events: resolveTypedEvents(events, types), language, log, plan, platform: "web", types };
    const at = now().toISOString();
    return homeCandidates(input, plan.status === "active" ? eventsFor(input, null) : [], at);
  }

  async function writeHome(planId: string, edit: (home: StoredPlanHome | null, plan: PlanV2Row) => StoredPlanHome | null): Promise<StoredPlanHome | null> {
    return repository.transact(scope, async (tx) => {
      const plan = await tx.plan(planId);
      if (!plan) throw new PlanPrepError("PLAN_NOT_FOUND", "Plan not found.");
      const next = edit(storedHomeOf(plan), plan);
      if (!next) return storedHomeOf(plan);
      await tx.updatePlan({ ...plan, analysis: { ...plan.analysis, home: next } as PlanV2Row["analysis"] });
      return next;
    });
  }

  function answersOf(plan: PlanV2Row) {
    return plan.premise.filter((row) => row.value.trim()).map((row) => ({ key: row.key, label: row.label, value: row.value }));
  }

  async function buildCard(plan: PlanV2Row, candidate: PlanHomeCandidate, language: PlanCopyLanguage, ledgerKey: string, trigger: "plan" | "manual"): Promise<{ card: PlanPrepCardView; aiOk: boolean; limited: boolean }> {
    const at = now();
    const profile: PlanPrepProfile = await context.profile(scope.actorId);
    const contact = candidate.contactId ? (await context.contacts(scope.actorId, [candidate.contactId]))[0] ?? null : null;
    const facts = contact ? await context.facts(scope.actorId, contact.id) : [];
    const events = candidate.eventId ? (await loadEvents()).filter((event) => event.eventId === candidate.eventId) : [];
    const event = events[0] ?? null;
    const common = contact ? commonGround({ contact, facts, language, profile }) : null;
    const copy = COPY[language];
    let rows: PlanPrepRow[] = contact ? contactRows(language, contact, common) : [];
    if (event) {
      rows = [{ key: "when_where", source: copy.eventPage, value: [tokyoDateTime(event.startsAt), event.venue].filter(Boolean).join(" · ") }];
      const about = event.typing?.text?.trim();
      if (about) rows.push({ key: "about", source: copy.eventPage, value: Array.from(about).slice(0, 80).join("") });
    }
    const fields = [
      ...rows.map((row) => ({ key: row.key, label: row.key, value: row.value })),
      ...(contact ? [{ key: "name", label: "name", value: contact.name }] : []),
      ...(event ? [{ key: "event_title", label: "event", value: event.title }] : []),
      ...(profile.organization ? [{ key: "profile.organization", label: "your company", value: profile.organization }] : []),
      ...(profile.role ? [{ key: "profile.role", label: "your role", value: profile.role }] : []),
      ...(profile.homeMarket ? [{ key: "profile.homeMarket", label: "you are from", value: profile.homeMarket }] : []),
    ];
    const answers = answersOf(plan);
    const types = await repository.read(scope, (reader) => reader.typeItems(plan.id));
    const type = types.find((item) => item.personType.key === candidate.typeKey) ?? null;
    const input: PlanPrepCardInput = {
      answers,
      facts: facts.map((fact) => ({ date: fact.date, id: fact.id, text: fact.text })),
      fields,
      goal: plan.goalText,
      kind: candidate.kind,
      language,
      outcome: plan.analysis.outcome ?? null,
      questions: type?.personType.questions ?? [],
      typeLabel: candidate.typeLabel,
    };
    const result = await ai.card(input, { actorId: scope.actorId, language, ledgerKey, now: at, trigger });
    const fallback = fallbackCard(language, { goal: plan.analysis.outcome || plan.goalText, me: profile.name, name: contact?.name ?? null, organization: profile.organization });
    const factMap = new Map(facts.map((fact) => [fact.id, fact]));
    const base = { gaps: prepGaps(contact, facts), generatedAt: at.toISOString(), staleSince: null };
    if (result.ok !== true) {
      log({ event: "plan_prep_card_fallback", planId: plan.id, reason: result.reason });
      return { aiOk: false, card: { ...base, ...fallback, fallback: true, rows, usedAnswers: [], usedFacts: [] }, limited: result.reason === "limit" };
    }
    const output = result.value;
    const reconciled = reconcileDraft(output.sentences, {
      answers: new Map(answers.map((answer) => [answer.key, answer.value])),
      facts: new Map(facts.map((fact) => [fact.id, fact.text])),
      fields: new Map(fields.map((field) => [field.key, field.value])),
    });
    if (reconciled.removed) log({ event: "plan_prep_sentences_removed", planId: plan.id, removed: reconciled.removed });
    const planFit = output.planFit?.trim();
    if (event && planFit && Array.from(planFit).length <= PLAN_HOME_LIMITS.planFitChars) rows = [...rows, { key: "plan_fit", source: "—", value: planFit }];
    const usedFactIds = [...new Set([...reconciled.factIds, ...output.usedFacts.filter((id) => factMap.has(id))])].slice(0, PLAN_HOME_LIMITS.usedFacts);
    const usedFacts = usedFactIds.map((id) => factMap.get(id)!).map((fact) => ({ date: fact.date, id: fact.id, memoId: fact.memoId, text: fact.text }));
    const usedAnswers = [...new Set([...reconciled.answerKeys, ...output.usedAnswers.filter((key) => answers.some((answer) => answer.key === key))])];
    if (!reconciled.draft.text || !hookValid(output.hook)) {
      return { aiOk: true, card: { ...base, ...fallback, fallback: true, rows, usedAnswers: [], usedFacts: [] }, limited: false };
    }
    return { aiOk: true, card: { ...base, draft: reconciled.draft, fallback: false, hook: { label: output.hook.label.trim(), reason: output.hook.reason.trim() }, rows, usedAnswers, usedFacts }, limited: false };
  }

  return {
    async ensure(planId, language) {
      const at = now();
      const plan = await repository.read(scope, (reader) => reader.plan(planId));
      if (!plan) return null;
      if (!planHomeNeedsWork(plan, at)) return planHomeView(plan) ?? null;
      const candidates = await repository.read(scope, (reader) => candidatesOf(reader, plan, language));
      const signature = candidateSignature(candidates);
      const previous = storedHomeOf(plan);
      if (previous && previous.state === "ready" && previous.candidateSignature === signature) return planHomeView(plan) ?? null;
      const usedCalls = previous?.initialCalls ?? 0;
      // 先占位：别的请求在 2 分钟内不会重复生成。
      const claimed = await writeHome(planId, (home, current) => {
        if (!planHomeNeedsWork(current, at)) return null;
        if (home && home.state === "ready" && home.candidateSignature === signature) return null;
        return { actions: home?.actions ?? [], candidateSignature: signature, initialCalls: home?.initialCalls ?? 0, lead: home?.lead ?? null, startedAt: at.toISOString(), state: "pending", updatedAt: at.toISOString(), version: 1 };
      });
      if (!claimed || claimed.state !== "pending" || claimed.startedAt !== at.toISOString()) {
        return planHomeView({ analysis: { ...plan.analysis, home: claimed } as PlanV2Row["analysis"] }) ?? null;
      }
      const finish = (home: Omit<StoredPlanHome, "version" | "startedAt" | "candidateSignature" | "updatedAt">) => writeHome(planId, () => ({ ...home, candidateSignature: signature, startedAt: at.toISOString(), updatedAt: now().toISOString(), version: 1 }));
      if (candidates.length === 0) {
        const done = await finish({ actions: [], initialCalls: usedCalls, lead: null, state: "ready" });
        return planHomeView({ analysis: { ...plan.analysis, home: done } as PlanV2Row["analysis"] }) ?? null;
      }
      const stage = plan.steps[0];
      let calls = usedCalls;
      const sigKey = signature.length > 80 ? `${signature.length}:${Array.from(signature).reduce((h, c) => (h * 31 + c.codePointAt(0)!) >>> 0, 7)}` : signature;
      const picked = await ai.pick({
        answers: answersOf(plan),
        candidates: candidates.map((candidate, index) => ({ kind: candidate.kind, no: index + 1, stepNumber: candidate.stepNumber, summary: candidate.summary, typeLabel: candidate.typeLabel })),
        goal: plan.goalText,
        language,
        outcome: plan.analysis.outcome ?? null,
        stage: { doneCriteria: stage?.doneCriteria ?? "", number: 1, title: stage?.title ?? "" },
      }, { actorId: scope.actorId, language, ledgerKey: `prep:${planId}:pick:${sigKey}`, now: at, trigger: "plan" });
      calls += 1;
      if (picked.ok !== true) {
        log({ event: "plan_prep_pick_failed", planId, reason: picked.reason });
        const failed = await finish({ actions: [], initialCalls: calls, lead: null, state: "failed" });
        return planHomeView({ analysis: { ...plan.analysis, home: failed } as PlanV2Row["analysis"] }) ?? null;
      }
      const picks = reconcilePicks(picked.value, candidates.length);
      if (picks.dropped) log({ dropped: picks.dropped, event: "plan_prep_picks_dropped", planId });
      const actions: StoredPlanHomeAction[] = [];
      for (const pick of picks.picks) {
        const candidate = candidates[pick.index]!;
        let prep: PlanPrepCardView | null = null;
        if (calls < PLAN_PREP_INITIAL_CARDS_LIMIT) {
          prep = (await buildCard(plan, candidate, language, `prep:${planId}:card:${candidate.key}:0`, "plan")).card;
          calls += 1;
        }
        actions.push({
          actionKey: candidate.key,
          avatar: candidate.avatar,
          contactId: candidate.contactId,
          done: false,
          doneAt: null,
          eventId: candidate.eventId,
          kind: candidate.kind,
          meta: candidate.meta,
          prep,
          reason: pick.reason,
          regenerations: 0,
          stepNumber: candidate.stepNumber,
          title: pick.title,
          typeKey: candidate.typeKey,
        });
      }
      const ready = await finish({ actions, initialCalls: calls, lead: picks.lead, state: "ready" });
      return planHomeView({ analysis: { ...plan.analysis, home: ready } as PlanV2Row["analysis"] }) ?? null;
    },

    async setDone({ planId, actionKey, done }) {
      const at = now().toISOString();
      const home = await writeHome(planId, (current) => {
        if (!current) throw new PlanPrepError("ACTION_NOT_FOUND", "Action not found.");
        const action = current.actions.find((item) => item.actionKey === actionKey);
        if (!action) throw new PlanPrepError("ACTION_NOT_FOUND", "Action not found.");
        if (action.done === done) return null;
        return { ...current, actions: current.actions.map((item) => (item.actionKey === actionKey ? { ...item, done, doneAt: done ? at : null } : item)), updatedAt: at };
      });
      return planHomeView({ analysis: { schemaVersion: 3, home } as unknown as PlanV2Row["analysis"] })!;
    },

    async regenerate({ planId, actionKey, idempotencyKey, language }) {
      const plan = await repository.read(scope, (reader) => reader.plan(planId));
      if (!plan || plan.status !== "active") throw new PlanPrepError("PLAN_NOT_FOUND", "Plan not found.");
      const home = storedHomeOf(plan);
      const action = home?.actions.find((item) => item.actionKey === actionKey);
      if (!home || !action) throw new PlanPrepError("ACTION_NOT_FOUND", "Action not found.");
      if (action.lastRegenerateKey === idempotencyKey) return planHomeView(plan)!;
      const candidate: PlanHomeCandidate = { avatar: action.avatar, contactId: action.contactId, eventId: action.eventId, key: action.actionKey, kind: action.kind, meta: action.meta, stepNumber: action.stepNumber, summary: "", typeKey: action.typeKey, typeLabel: null };
      const n = action.regenerations + 1;
      const built = await buildCard(plan, candidate, language, `prep:${planId}:card:${actionKey}:${n}:${idempotencyKey}`, "manual");
      if (built.limited) throw new PlanPrepError("LIMIT", "Daily AI limit reached.");
      if (!built.aiOk) throw new PlanPrepError("FAILED", "Could not regenerate the card.");
      const next = await writeHome(planId, (current) => {
        if (!current) throw new PlanPrepError("ACTION_NOT_FOUND", "Action not found.");
        return { ...current, actions: current.actions.map((item) => (item.actionKey === actionKey ? { ...item, lastRegenerateKey: idempotencyKey, prep: built.card, regenerations: n } : item)), updatedAt: now().toISOString() };
      });
      return planHomeView({ analysis: { schemaVersion: 3, home: next } as unknown as PlanV2Row["analysis"] })!;
    },

    async hasContact(contactId) {
      if (!contactId) return false;
      return (await context.contacts(scope.actorId, [contactId])).some((contact) => contact.id === contactId);
    },

    async markStale(contactId) {
      const at = now().toISOString();
      const plans = await repository.read(scope, (reader) => reader.activePlans());
      let count = 0;
      for (const plan of plans) {
        const home = storedHomeOf(plan);
        if (!home?.actions.some((action) => action.contactId === contactId && action.prep && !action.prep.staleSince)) continue;
        await writeHome(plan.id, (current) => {
          if (!current) return null;
          let changed = 0;
          const actions = current.actions.map((action) => {
            if (action.contactId !== contactId || !action.prep || action.prep.staleSince) return action;
            changed += 1;
            return { ...action, prep: { ...action.prep, staleSince: at } };
          });
          count += changed;
          return changed ? { ...current, actions, updatedAt: at } : null;
        });
      }
      return count;
    },
  };
}
