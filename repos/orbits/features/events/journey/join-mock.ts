/**
 * R27 参加登録 facade 的示例世界（mock / 演示账号）：固定 5 问（画板 #20–#23 的文字），不调 AI、不写库。Owner: 甲 (R27).
 */
import { JOURNEY_EVENT_ID, JOURNEY_HOST_CONTACT, JOURNEY_JOIN_QUESTIONS, JOURNEY_JOIN_REVIEW_UNTIL, JOURNEY_JOIN_SELF_INTRO, JOURNEY_JOIN_SUBMITTED_AT } from "../../../shared/mock/demo-world/events-journey";
import type { JoinPorts } from "./join";

const EVENT = { endsAt: "2026-10-07T21:30:00+09:00", registrationClosesAt: JOURNEY_JOIN_REVIEW_UNTIL, review: true, startsAt: "2026-10-07T19:00:00+09:00", title: "CFO Night Tokyo vol.18", hostContact: JOURNEY_HOST_CONTACT };

export function createJoinMockPorts(): JoinPorts {
  const tentative = new Map<string, { scheduleItemId: string; final: boolean; removed?: boolean }>();
  return {
    // 示例活动的截止日是固定日期：示例里的「现在」在截止之前。
    now: () => Date.parse(JOURNEY_JOIN_SUBMITTED_AT),
    async event(eventId) { return eventId === JOURNEY_EVENT_ID ? EVENT : null; },
    // 示例访谈按画板 #20–#23 的顺序问满 5 题，四项都覆盖（2026-11-27 用户反馈：答完 5 题不该再缺项；
    // 以前停在第 3 问、确认页 86 % · 提供できること △ 的状态不再出现）。
    // `plan`：跳过已覆盖的字段；必须针对某一项时只问那一项（同 live 访谈）。
    async next(_eventId, answers, _language, _more, plan) {
      const answered = new Set(answers.map((answer) => answer.field));
      const index = JOURNEY_JOIN_QUESTIONS.findIndex((item) => !answered.has(item.field) && !plan?.skipFields?.includes(item.field) && (!plan?.focusFields || plan.focusFields.includes(item.field)));
      const question = JOURNEY_JOIN_QUESTIONS[index];
      return question ? { allowCustom: true, field: question.field, options: [...question.options], prompt: question.prompt, questionToken: `sample-question-${index + 1}` } : null;
    },
    async persona() { return { selfIntroDraft: JOURNEY_JOIN_SELF_INTRO, tags: ["SaaS の KPI 開示"], topics: ["SaaS の KPI 開示"] }; },
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
