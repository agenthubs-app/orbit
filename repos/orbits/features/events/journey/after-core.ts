/**
 * R27 会後のふりかえり 的纯逻辑（DESIGN §2.7）。Owner: 甲 (R27).
 * - E3（AI 下書き）可用时：まとめ 3 条 + 逐人的次の一手（お礼下書き / フォロー日 / 计划类型建议，类型只认我计划里的 key）。
 * - 不可用 / 失败时的规则退路：まとめ = 旧的一段 summary；フォロー日 = 活动次日起按会いやすい順每人顺延 1 个工作日；
 *   🎯 = 联系人已关联的计划类型（没有就空）；お礼只给第一位（旧 messageDraft）；界面不出现「AI 下書き」字样（aiDraft=false）。
 * - 分数预览：同一纯函数 `nextAward`（两端共用），同人同类型只计一次；确定后以服务端为准。
 */
import type { EventAfterHighlight, EventAfterNextStep, EventAfterResponse, EventAfterScoreSlot } from "../../../shared/contract/event-after";
import { nextAward } from "../../../shared/compute/plan-score";
import { tokyoParts } from "../../../shared/compute/event-score-input";
import type { JourneyLanguage } from "./prep-core";

export interface AfterMetPerson {
  attendeeId: string;
  contactId?: string | null;
  name: string;
  org?: string | null;
  wanted: boolean;
  /** Plan type already linked to this contact, if any. */
  linkedTypeKey?: string | null;
}

export interface AfterAiDraft {
  highlights: readonly EventAfterHighlight[];
  nextSteps: readonly { attendeeId: string; followupDate: string; thanksDraft: { subject: string; body: string }; planTypeSuggestion?: string | null }[];
}

export interface AfterPlan {
  goal: string;
  before: number;
  slots: readonly (EventAfterScoreSlot & { label: string })[];
  /** `${typeKey}:${contactId}` already scored. */
  counted: ReadonlySet<string>;
}

const DAY = 86_400_000;
const tokyoDate = (time: number) => new Date(time + 9 * 3_600_000).toISOString().slice(0, 10);

/** 活动次日起的第 n 个工作日（东京，跳过周六日）。 */
export function businessDayAfter(eventStartsAt: string, n: number): string {
  let dayIndex = tokyoParts(Date.parse(eventStartsAt)).dayIndex;
  let left = n;
  while (left > 0) {
    dayIndex += 1;
    const weekday = (((dayIndex + 4) % 7) + 7) % 7;
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return tokyoDate(dayIndex * DAY - 9 * 3_600_000 + 12 * 3_600_000);
}

/** 预览：对勾选的行按顺序套 `nextAward`，返回每行加分与总加分（两端同一算法）。 */
export function previewAfterScore(steps: readonly Pick<EventAfterNextStep, "planType" | "alreadyCounted">[], slots: readonly EventAfterScoreSlot[]): { perStep: number[]; total: number } {
  const state = new Map(slots.map((slot) => [slot.key, { ...slot }]));
  const perStep = steps.map((step) => {
    const key = step.planType?.key;
    const slot = key ? state.get(key) : undefined;
    if (!slot || step.alreadyCounted) return 0;
    const awards = slot.earnedCount > 0 ? [{ basis: "talked" as const, part: "base" as const, points: slot.earnedPoints }, ...Array.from({ length: slot.earnedCount - 1 }, () => ({ basis: "talked" as const, part: "base" as const, points: 0 }))] : [];
    const award = nextAward({ allocation: slot.allocation, anonymous: false, awards, skipped: slot.skipped, targetCount: slot.targetCount });
    if (award.part === "base") { slot.earnedCount += 1; slot.earnedPoints += award.points; }
    return award.points;
  });
  return { perStep, total: perStep.reduce((sum, points) => sum + points, 0) };
}

function detailText(steps: readonly EventAfterNextStep[], perStep: readonly number[], slots: readonly (EventAfterScoreSlot & { label: string })[], language: JourneyLanguage): string {
  const byType = new Map<string, { count: number; points: number }>();
  steps.forEach((step, index) => {
    const key = step.planType?.key;
    if (!key || !perStep[index]) return;
    const entry = byType.get(key) ?? { count: 0, points: 0 };
    byType.set(key, { count: entry.count + 1, points: entry.points + (perStep[index] ?? 0) });
  });
  const parts = [...byType.entries()].map(([key, value]) => {
    const slot = slots.find((item) => item.key === key);
    const label = slot?.label ?? key;
    const reached = slot ? slot.earnedCount + value.count >= slot.targetCount : false;
    const progress = slot ? `${slot.earnedCount + value.count} / ${slot.targetCount}` : "";
    if (language === "zh") return `${label} ${value.count}人（+${value.points}${slot ? ` · ${progress}人${reached ? "达成" : ""}` : ""}）`;
    if (language === "en") return `${label} ${value.count} (+${value.points}${slot ? ` · ${progress}${reached ? " reached" : ""}` : ""})`;
    return `${label} ${value.count}人（+${value.points}${slot ? ` · ${progress}人${reached ? "で達成" : ""}` : ""}）`;
  });
  if (!parts.length) return "";
  const tail = language === "zh" ? "同一个人在同一类型里只计一次。只反映确定的「下一步」。" : language === "en" ? "Each person counts once per type. Only confirmed next steps count." : "同じ人は同じタイプで 1回だけ計上。確定した「次の一手」だけを反映します。";
  return `${parts.join(" · ")}。${tail}`;
}

export function buildAfter(input: {
  event: { eventId: string; title: string; startsAt: string };
  met: readonly AfterMetPerson[];
  wantedTotal: number;
  meetings: number;
  ai: AfterAiDraft | null;
  legacy?: { summary: string | null; messageDraft: string | null } | null;
  plan: AfterPlan | null;
  confirmedAt?: string | null;
  language?: JourneyLanguage;
}): EventAfterResponse {
  const language = input.language ?? "ja";
  const planKeys = new Map((input.plan?.slots ?? []).map((slot) => [slot.key, slot.label]));
  const typeFor = (key: string | null | undefined) => (key && planKeys.has(key) ? { key, label: planKeys.get(key)! } : null);
  const aiByAttendee = new Map((input.ai?.nextSteps ?? []).map((step) => [step.attendeeId, step]));
  const ordered = [...input.met].sort((a, b) => Number(b.wanted) - Number(a.wanted));
  const steps: EventAfterNextStep[] = ordered.map((person, index) => {
    // E3 的次の一手按联系人 id 回来（别名换回的是 contactId），会場的参加者 id 也认。
    const ai = aiByAttendee.get(person.attendeeId) ?? (person.contactId ? aiByAttendee.get(person.contactId) : undefined);
    // AI 的类型建议只认计划字典里的 key（越出字典的丢掉，退回已关联类型）。
    const planType = typeFor(ai?.planTypeSuggestion) ?? typeFor(person.linkedTypeKey);
    const legacyDraft = !input.ai && index === 0 && input.legacy?.messageDraft ? { body: input.legacy.messageDraft, subject: language === "en" ? `Thank you — ${input.event.title}` : language === "zh" ? `感谢——${input.event.title}` : `${input.event.title} のお礼` } : null;
    return {
      attendeeId: person.attendeeId,
      contactId: person.contactId ?? null,
      followupDate: ai?.followupDate && /^\d{4}-\d{2}-\d{2}$/.test(ai.followupDate) ? ai.followupDate : businessDayAfter(input.event.startsAt, index + 1),
      initial: person.name.trim().charAt(0),
      name: person.name,
      org: person.org ?? null,
      planType,
      thanksDraft: ai?.thanksDraft ?? legacyDraft,
      ...(planType && person.contactId && input.plan?.counted.has(`${planType.key}:${person.contactId}`) ? { alreadyCounted: true } : {}),
    };
  });
  const preview = input.plan ? previewAfterScore(steps, input.plan.slots) : { perStep: steps.map(() => 0), total: 0 };
  return {
    aiDraft: Boolean(input.ai),
    date: tokyoDate(Date.parse(input.event.startsAt)),
    eventId: input.event.eventId,
    met: {
      count: input.met.length,
      exchanged: input.met.length,
      initials: ordered.slice(0, 5).map((person) => person.name.trim().charAt(0)),
      meetings: input.meetings,
      wantedMet: input.met.filter((person) => person.wanted).length,
      wantedTotal: input.wantedTotal,
    },
    nextSteps: steps,
    title: input.event.title,
    ...(input.ai ? { highlights: input.ai.highlights.slice(0, 3) } : { summary: input.legacy?.summary ?? null }),
    ...(input.plan ? {
      score: { after: Math.min(100, input.plan.before + preview.total), before: input.plan.before, detail: detailText(steps, preview.perStep, input.plan.slots, language), goal: input.plan.goal },
      scoreSlots: input.plan.slots.map(({ label: _label, ...slot }) => slot),
    } : {}),
    confirmedAt: input.confirmedAt ?? null,
  };
}
