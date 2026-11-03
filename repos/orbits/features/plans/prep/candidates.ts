/**
 * 「先做的事」的系统候选（字段表：候选 = 你人脉里匹配到的人 + 活动库里匹配到的活动；AI 只给编号）。纯函数。
 *
 * 人：按阶段顺序走人物类型（跳过的类型不算），每类取 ≤2 位——先已关联但还没聊过的，再推荐度最高的待确认候补；
 * 活动：推荐分最高的 ≤2 场（`eventsFor` 的顺序）。合计 ≤8，编号 = 下标 + 1。
 */
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { PlanEventOption } from "../../../shared/contract/plan-v2";
import { candidatesFor, type OverviewInput } from "../v2/overview";
import type { PlanV2Row, PlanV2TypeItem } from "../v2/types";
import { PLAN_HOME_LIMITS, type PlanHomeCandidate } from "./types";

const NETWORK: Record<PlanCopyLanguage, string> = { en: "in your network", ja: "あなたの人脈", zh: "你的人脉" };

/** 人物类型属于第几阶段（1 起）：以 `steps[].personTypeKeys` 为准，再看 `stepKey`，都没有算第 1 阶段。 */
export function stepNumberOf(plan: Pick<PlanV2Row, "steps">, typeKey: string, stepKey?: string | null): number {
  const byKeys = plan.steps.findIndex((step) => step.personTypeKeys.includes(typeKey));
  if (byKeys >= 0) return byKeys + 1;
  const byStep = stepKey ? plan.steps.findIndex((step) => step.key === stepKey) : -1;
  return byStep >= 0 ? byStep + 1 : 1;
}

function firstChar(name: string): string {
  return Array.from(name.trim())[0] ?? "?";
}

function eventDay(startsAt: string): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "numeric", timeZone: "Asia/Tokyo" }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${month}/${day}`;
}

export function homeCandidates(input: OverviewInput, events: readonly PlanEventOption[], now: string): PlanHomeCandidate[] {
  const language = input.language;
  const talked = new Set(input.awards.flatMap((entry) => (entry.award.contactId ? [entry.award.contactId] : [])));
  const types = [...input.types]
    .filter((type) => !type.skippedAt)
    .map((type) => ({ step: stepNumberOf(input.plan, type.personType.key, type.personType.stepKey), type }))
    .sort((a, b) => a.step - b.step || a.type.sortKey - b.type.sortKey);
  const out: PlanHomeCandidate[] = [];
  const used = new Set<string>();
  const personOf = (type: PlanV2TypeItem, step: number, contactId: string) => {
    const contact = input.contacts.get(contactId);
    if (!contact || used.has(contactId) || talked.has(contactId)) return null;
    used.add(contactId);
    const summary = [contact.role, contact.organization].filter(Boolean).join(" · ") || type.shortLabel;
    return {
      avatar: firstChar(contact.name || "?"),
      contactId,
      eventId: null,
      key: `c:${contactId}`,
      kind: "contact" as const,
      meta: `${contact.role || type.shortLabel} · ${NETWORK[language]}`,
      stepNumber: step,
      summary,
      typeKey: type.personType.key,
      typeLabel: type.shortLabel,
    };
  };
  for (const { type, step } of types) {
    let taken = 0;
    const linked = type.contactLinks.map((link) => link.contactId);
    const pending = candidatesFor(input, type, now).map((candidate) => candidate.contactId);
    for (const contactId of [...linked, ...pending]) {
      if (taken >= PLAN_HOME_LIMITS.candidatesPerType || out.length >= PLAN_HOME_LIMITS.candidates - PLAN_HOME_LIMITS.eventCandidates) break;
      const person = personOf(type, step, contactId);
      if (person) { out.push(person); taken += 1; }
    }
  }
  for (const event of events.slice(0, PLAN_HOME_LIMITS.eventCandidates)) {
    const day = eventDay(event.startsAt);
    out.push({
      avatar: event.emoji || "🎟️",
      contactId: null,
      eventId: event.eventId,
      key: `e:${event.eventId}`,
      kind: "event",
      meta: [event.venue, day].filter(Boolean).join(" · "),
      stepNumber: 1,
      summary: [event.title, day, event.venue].filter(Boolean).join(" · "),
      typeKey: null,
      typeLabel: null,
    });
  }
  return out.slice(0, PLAN_HOME_LIMITS.candidates);
}

/** 候选签名：候选 key 排序后拼接（候选变了才允许补生成）。 */
export function candidateSignature(candidates: readonly PlanHomeCandidate[]): string {
  return candidates.map((candidate) => candidate.key).sort().join("|");
}
