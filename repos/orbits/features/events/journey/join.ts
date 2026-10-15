/**
 * R27 参加登録 facade（契约 event-join）。Owner: 甲 (R27).
 * - 问题 = 现有 AI 自适应访谈（≤5 问，带签名 token）；多选 / 上限按字段定（会いたい人 多选，話したいテーマ ≤2）。
 * - 资料：カバー率 / 各项 / 話題 是规则；只有 `draft` 时才调用现有 persona（E4 的自己紹介下書き）。
 * - 提交：先走普通报名；活动开了审核（409 admission）就走审核申请。公開範囲按字段由服务端定（registrationFieldVisibility）。
 * - 仮予定：用户确认后才写进日历；审核结果出来后（下次读详情时）改名为正式 / 被拒时删除（syncTentative）。
 */
import type { EventJoinAnswer, EventJoinProfile, EventJoinProfileItemKey, EventJoinQuestion, EventJoinResult, EventJoinStep, EventJoinTentativeResult } from "../../../shared/contract/event-join";
import type { JourneyLanguage } from "./prep-core";

export const JOIN_TOTAL = 5;
/** 每题约 20 秒（「残り 約1分」）。 */
const SECONDS_PER_QUESTION = 20;

/** 字段 → 资料项（カバー率：会社・役職 44 + 其余各 14；画板 72 % / 86 % / 100 %）。 */
const ITEM_OF_FIELD: Readonly<Record<string, EventJoinProfileItemKey>> = { desiredOutcome: "purpose", experienceHighlight: "topics", targetAttendees: "target", valueOffered: "offer" };
const ITEM_WEIGHT: Readonly<Record<EventJoinProfileItemKey, number>> = { company: 44, offer: 14, purpose: 14, target: 14, topics: 14 };
const ITEMS: readonly EventJoinProfileItemKey[] = ["company", "purpose", "topics", "target", "offer"];

const tri = (language: JourneyLanguage, ja: string, zh: string, en: string) => (language === "zh" ? zh : language === "en" ? en : ja);

export function questionShape(field: string, language: JourneyLanguage): Pick<EventJoinQuestion, "multi" | "max" | "help"> {
  if (field === "targetAttendees") return { help: tri(language, "席決めとおすすめにだけ使います（複数可）", "只用于排座和推荐（可多选）", "Only used for seating and suggestions (choose any)"), max: null, multi: true };
  if (field === "experienceHighlight") return { help: null, max: 2, multi: true };
  return { help: null, max: null, multi: false };
}

export function joinStep(answered: number, question: Omit<EventJoinQuestion, "multi" | "max" | "help"> | null, language: JourneyLanguage): EventJoinStep {
  const done = !question || answered >= JOIN_TOTAL;
  const remaining = Math.max(0, JOIN_TOTAL - answered);
  return {
    done,
    index: done ? answered : answered + 1,
    question: done ? null : { ...question!, ...questionShape(question!.field, language) },
    remainingMinutes: Math.max(done ? 0 : 1, Math.round((remaining * SECONDS_PER_QUESTION) / 60)),
    total: JOIN_TOTAL,
  };
}

export function profileFromAnswers(answers: readonly EventJoinAnswer[], extras: { selfIntro?: EventJoinProfile["selfIntro"]; selfIntroBasis?: string | null; personaTopics?: readonly string[]; editableUntil?: string | null; reviewUntil?: string | null; review: boolean }): EventJoinProfile {
  const filled = new Set<EventJoinProfileItemKey>(["company"]);
  for (const answer of answers) { const item = ITEM_OF_FIELD[answer.field]; if (item && answer.answer.trim()) filled.add(item); }
  const coverage = ITEMS.reduce((sum, key) => sum + (filled.has(key) ? ITEM_WEIGHT[key] : 0), 0);
  const topicAnswer = answers.find((answer) => answer.field === "experienceHighlight")?.answer ?? "";
  const topics = [...new Set([...topicAnswer.split(/\s*[·、,，]\s*/).map((item) => item.trim()).filter(Boolean), ...(extras.personaTopics ?? [])])].slice(0, 6);
  return {
    coverage,
    editableUntil: extras.editableUntil ?? null,
    items: ITEMS.map((key) => ({ done: filled.has(key), key })),
    review: extras.review,
    reviewUntil: extras.reviewUntil ?? null,
    selfIntro: extras.selfIntro ?? null,
    selfIntroBasis: extras.selfIntroBasis ?? null,
    topics,
  };
}

/** 「仮：CFO Night」（结果出来后改成「CFO Night」）。 */
export function tentativeTitle(title: string, language: JourneyLanguage, final = false): string {
  const short = title.replace(/\s*(Tokyo|東京)?\s*vol\.?\s*\d+\s*$/i, "").replace(/\s+Tokyo$/i, "").trim() || title;
  return final ? short : tri(language, `仮：${short}`, `暂定：${short}`, `Tentative: ${short}`);
}

export interface JoinPorts {
  event(eventId: string): Promise<{ title: string; startsAt: string; endsAt: string | null; review: boolean; registrationClosesAt: string | null } | null>;
  next(eventId: string, answers: readonly EventJoinAnswer[], language: JourneyLanguage): Promise<Omit<EventJoinQuestion, "multi" | "max" | "help"> | null>;
  persona(eventId: string, answers: readonly EventJoinAnswer[], language: JourneyLanguage): Promise<{ selfIntroDraft?: string | null; tags?: readonly string[] } | null>;
  profileIntro(actorId: string): Promise<string | null>;
  submit(eventId: string, answers: readonly EventJoinAnswer[]): Promise<{ status: "registered" | "pending_review"; submittedAt: string }>;
  createSchedule(actorId: string, input: { title: string; startsAt: string; endsAt: string; idempotencyKey: string }): Promise<string>;
  readTentative(actorId: string, eventId: string): Promise<{ scheduleItemId: string; final: boolean } | null>;
  saveTentative(actorId: string, eventId: string, record: { scheduleItemId: string; final: boolean }): Promise<void>;
  renameSchedule(actorId: string, scheduleItemId: string, title: string): Promise<void>;
  removeSchedule(actorId: string, scheduleItemId: string): Promise<void>;
  registrationStatus(actorId: string, eventId: string): Promise<"registered" | "pending_review" | "rejected" | "cancelled" | "none">;
}

export function createJoinService(deps: { ports: JoinPorts }) {
  const { ports } = deps;
  return {
    async next(eventId: string, answers: readonly EventJoinAnswer[], language: JourneyLanguage): Promise<EventJoinStep | null> {
      if (!(await ports.event(eventId))) return null;
      if (answers.length >= JOIN_TOTAL) return joinStep(answers.length, null, language);
      return joinStep(answers.length, await ports.next(eventId, answers, language), language);
    },
    async profile(actorId: string, eventId: string, answers: readonly EventJoinAnswer[], draft: boolean, language: JourneyLanguage): Promise<EventJoinProfile | null> {
      const event = await ports.event(eventId);
      if (!event) return null;
      const persona = draft ? await ports.persona(eventId, answers, language).catch(() => null) : null;
      const intro = persona?.selfIntroDraft ? { source: "ai_draft" as const, text: persona.selfIntroDraft } : draft ? await ports.profileIntro(actorId).then((text) => (text ? { source: "profile" as const, text } : null)) : null;
      const basis = intro?.source === "ai_draft" ? tri(language, "回答（目的・テーマ・会いたい人）とプロフィールから作成。売上などの数値は入れていません。", "根据回答（目的、话题、想见的人）和个人资料写成，没有放入营收等数字。", "Written from your answers (goal, topics, who to meet) and your profile. No revenue or other figures.") : null;
      const editableUntil = new Date(Date.parse(event.startsAt) - 86_400_000).toISOString();
      return profileFromAnswers(answers, { editableUntil, personaTopics: persona?.tags ?? [], review: event.review, reviewUntil: event.review ? event.registrationClosesAt : null, selfIntro: intro, selfIntroBasis: basis });
    },
    async submit(eventId: string, answers: readonly EventJoinAnswer[], language: JourneyLanguage): Promise<EventJoinResult | null> {
      const event = await ports.event(eventId);
      if (!event) return null;
      const outcome = await ports.submit(eventId, answers);
      const endsAt = event.endsAt ?? new Date(Date.parse(event.startsAt) + 2 * 3_600_000).toISOString();
      return {
        endsAt: event.endsAt,
        eventId,
        reviewUntil: outcome.status === "pending_review" ? event.registrationClosesAt : null,
        startsAt: event.startsAt,
        status: outcome.status,
        submittedAt: outcome.submittedAt,
        tentative: { endsAt, startsAt: event.startsAt, title: tentativeTitle(event.title, language, outcome.status === "registered") },
      };
    },
    async tentative(actorId: string, eventId: string, idempotencyKey: string, language: JourneyLanguage): Promise<EventJoinTentativeResult | null> {
      const event = await ports.event(eventId);
      if (!event) return null;
      const existing = await ports.readTentative(actorId, eventId);
      const status = await ports.registrationStatus(actorId, eventId);
      const final = status === "registered";
      const title = tentativeTitle(event.title, language, final);
      if (existing) return { eventId, scheduleItemId: existing.scheduleItemId, title };
      const endsAt = event.endsAt ?? new Date(Date.parse(event.startsAt) + 2 * 3_600_000).toISOString();
      const scheduleItemId = await ports.createSchedule(actorId, { endsAt, idempotencyKey, startsAt: event.startsAt, title });
      await ports.saveTentative(actorId, eventId, { final, scheduleItemId });
      return { eventId, scheduleItemId, title };
    },
    /** 审核结果出来后：通过 → 去掉「仮：」；被拒 / 取消 → 删掉这条日程。读详情时顺带调用，失败不影响页面。 */
    async syncTentative(actorId: string, eventId: string, language: JourneyLanguage): Promise<void> {
      const record = await ports.readTentative(actorId, eventId);
      if (!record || record.final) return;
      const status = await ports.registrationStatus(actorId, eventId);
      const event = await ports.event(eventId);
      if (!event) return;
      if (status === "registered") {
        await ports.renameSchedule(actorId, record.scheduleItemId, tentativeTitle(event.title, language, true));
        await ports.saveTentative(actorId, eventId, { ...record, final: true });
      } else if (status === "rejected" || status === "cancelled") {
        await ports.removeSchedule(actorId, record.scheduleItemId);
        await ports.saveTentative(actorId, eventId, { ...record, final: true });
      }
    },
  };
}
export type JoinService = ReturnType<typeof createJoinService>;
