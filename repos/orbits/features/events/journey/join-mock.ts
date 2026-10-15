/**
 * R27 参加登録 facade 的示例世界（mock / 演示账号）：固定 5 问（画板 #20–#23 的文字），不调 AI、不写库。Owner: 甲 (R27).
 */
import { JOURNEY_EVENT_ID, JOURNEY_JOIN_QUESTIONS, JOURNEY_JOIN_REVIEW_UNTIL, JOURNEY_JOIN_SELF_INTRO, JOURNEY_JOIN_SUBMITTED_AT } from "../../../shared/mock/demo-world/events-journey";
import type { JoinPorts } from "./join";

const EVENT = { endsAt: "2026-10-07T21:30:00+09:00", registrationClosesAt: JOURNEY_JOIN_REVIEW_UNTIL, review: true, startsAt: "2026-10-07T19:00:00+09:00", title: "CFO Night Tokyo vol.18" };

export function createJoinMockPorts(): JoinPorts {
  const tentative = new Map<string, { scheduleItemId: string; final: boolean; removed?: boolean }>();
  return {
    async event(eventId) { return eventId === JOURNEY_EVENT_ID ? EVENT : null; },
    // 示例访谈问到「会いたい人」（第 3 问）就认为够了；确认页点「追加」（more）再问下一题（画板 #370：86 % · 提供できること △）。
    async next(_eventId, answers, _language, more) {
      if (answers.length >= 3 && !more) return null;
      const question = JOURNEY_JOIN_QUESTIONS[answers.length];
      return question ? { allowCustom: true, field: question.field, options: [...question.options], prompt: question.prompt, questionToken: `sample-question-${answers.length + 1}` } : null;
    },
    async persona() { return { selfIntroDraft: JOURNEY_JOIN_SELF_INTRO, tags: ["SaaS の KPI 開示"] }; },
    async profileIntro() { return null; },
    async submit() { return { status: "pending_review", submittedAt: JOURNEY_JOIN_SUBMITTED_AT }; },
    async saveIntro() { /* sample: nothing is written */ },
    async cancel() { /* sample: nothing is written */ },
    async createSchedule(_actorId, input) { return `sample-schedule-${input.idempotencyKey.slice(0, 8)}`; },
    async readTentative(actorId, eventId) { return tentative.get(`${actorId}:${eventId}`) ?? null; },
    async saveTentative(actorId, eventId, record) { tentative.set(`${actorId}:${eventId}`, record); },
    async renameSchedule() { /* sample: nothing is written */ },
    async removeSchedule() { /* sample: nothing is written */ },
    async registrationStatus() { return "pending_review"; },
  };
}
