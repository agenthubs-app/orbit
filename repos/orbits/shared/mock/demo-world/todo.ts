import type { TodoPageContract } from "../../contract/todo-page";
import type { CalendarExternalEventsContract } from "../../contract/calendar-external-events";
import { DEMO_EVENTS, DEMO_PEOPLE, DEMO_PLAN, DEMO_TODAY, DEMO_TIME_ZONE, DEMO_TODOS } from "./index";

const asOf = `${DEMO_TODAY}T00:00:00.000Z`;
const person = (id: string) => DEMO_PEOPLE.find(item => item.id === id)!;
const base = (source: string, sourceId: string, contactId: string, titlePreview: string) => ({
  key: `${source}:${sourceId}`, sourceId, titlePreview, contactId, contactNamePreview: person(contactId).name, createdAt: asOf, sample: true as const,
});

// R20a: main boards app.html #17 / web.html #14: decisions 4, next moves 3,
// three open follow-ups. People and task/plan references come from the demo world.
export const demoTodoPage = {
  date: DEMO_TODAY, timeZone: DEMO_TIME_ZONE, asOf,
  counts: { decisions: 4, nextMoves: 3, followups: 3, overdue: 1 },
  countsCapped: { decisions: false, nextMoves: false },
  decisions: { next: {}, items: [
    { ...base("task_suggestion", "demo-suggestion-materials", "demo-person-yamamoto", "山本 彩さんに資料を再送"), source: "task_suggestion", reasonPreview: "資料の再送をご確認ください", actions: ["accept", "dismiss", "snooze"] },
    { ...base("agent_action", "demo-action-poc", "demo-person-suzuki", "鈴木さんと PoC 日程を確定"), source: "agent_action", reasonPreview: "候補 3枠を提案済み", actions: ["accept", "dismiss"] },
    { ...base("entity_draft", "demo-draft-thanks", "demo-person-takahashi", "高橋さんへのお礼の下書き"), source: "entity_draft", actions: ["open"], conversationId: "demo-conversation-thanks" },
    { ...base("contact_draft", "demo-contact-draft-matsui", "demo-person-matsui", "松井さんの連絡先を確認"), source: "contact_draft", actions: ["open"] },
  ] },
  nextMoves: { next: {}, items: [
    { ...base("agent_signal", "demo-signal-thanks", DEMO_TODOS[0].personId, DEMO_TODOS[0].title), source: "agent_signal", draftAvailable: true, taskId: DEMO_TODOS[0].id },
    { ...base("agent_signal", "demo-signal-materials", "demo-person-yamamoto", "山本さんに資料を送る"), source: "agent_signal", draftAvailable: true },
    { ...base("plan_today_chance", DEMO_PLAN.id, "demo-person-aoki", "青木さんに紹介をお願いする"), source: "plan_today_chance", draftAvailable: true },
  ] },
  followups: { next: {}, items: [
    { ...base("task", DEMO_TODOS[0].id, DEMO_TODOS[0].personId, DEMO_TODOS[0].title), source: "task", kind: "task", taskId: DEMO_TODOS[0].id, status: "open", dueAt: "2026-10-06T09:00:00.000Z", overdue: true, deferralCount: 0 },
    { ...base("task", DEMO_TODOS[1].id, DEMO_TODOS[1].personId, DEMO_TODOS[1].title), source: "task", kind: "task", taskId: DEMO_TODOS[1].id, status: "open", dueAt: `${DEMO_TODOS[1].dueDate}T09:00:00.000Z`, overdue: false, deferralCount: DEMO_TODOS[1].deferralCount },
    { ...base("relationship_task", "demo-lifecycle-suzuki", "demo-person-suzuki", "鈴木さんに面談の候補を送る"), source: "relationship_task", kind: "lifecycle", taskId: "demo-lifecycle-suzuki", status: "scheduled", dueAt: "2026-10-12T09:00:00.000Z", overdue: false },
  ] },
  sources: { task_suggestion: "ok", agent_action: "ok", plan_pending: "ok", entity_draft: "ok", contact_draft: "ok", completion_question: "ok", agent_signal: "ok", plan_today_chance: "ok", relationship_task: "ok", task: "ok" },
} as const satisfies TodoPageContract;

export const demoCalendarExternalEvents = {
  connection: "connected", provider: "google_calendar", asOf,
  events: DEMO_EVENTS.slice(0, 2).map(event => ({ id: `google:${event.id}`, titlePreview: event.title, startsAt: event.startsAt,
    endsAt: new Date(Date.parse(event.startsAt) + 3_600_000).toISOString(), allDay: false, locationPreview: event.venue })),
} satisfies CalendarExternalEventsContract;
