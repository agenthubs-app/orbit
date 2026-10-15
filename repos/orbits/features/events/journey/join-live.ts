/**
 * R27 参加登録 facade 的 live 端口：在同一个请求里调用现有路由处理器（访谈 / persona / 报名 / 审核申请），
 * 不另写一套报名逻辑；日历走个人日程服务；仮予定记录存 `eventTentativeSchedules`。Owner: 甲 (R27).
 */
import { createHash } from "node:crypto";

import type { EventJoinAnswer, EventJoinQuestion } from "../../../shared/contract/event-join";
import { createPostgresActorRecordStore } from "../actor-records/store";
import type { JoinPorts } from "./join";
import type { JourneyLivePorts } from "./ports";
import type { JourneyLanguage } from "./prep-core";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

async function callHandler(handler: Handler, eventId: string, path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const request = new Request(`http://orbit.internal/api/events/${encodeURIComponent(eventId)}/${path}`, { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
  const response = await handler(request, { params: Promise.resolve({ id: eventId }) });
  const json = (await response.json().catch(() => null)) as { data?: unknown } | null;
  return { data: json?.data ?? null, status: response.status };
}

const transcript = (answers: readonly EventJoinAnswer[]) => answers.map((answer) => ({ answer: answer.answer, field: answer.field, prompt: answer.prompt }));

export function createJoinLivePorts(input: { journey: JourneyLivePorts; query: (sql: string, values?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>; workspaceId: string }): JoinPorts {
  const store = createPostgresActorRecordStore({ query: input.query, workspaceId: input.workspaceId });
  const tentativeId = (actorId: string, eventId: string) => `ets:${createHash("sha256").update(`${actorId}\u0000${eventId}`).digest("hex").slice(0, 32)}`;
  const schedule = async () => {
    const { createConfiguredPersonalScheduleService } = await import("../../personal-schedule/service-factory");
    const service = createConfiguredPersonalScheduleService();
    if (!service) throw new Error("personal schedule storage is not configured");
    return service;
  };
  return {
    async event(eventId) {
      const event = await input.journey.event(eventId);
      return event ? { endsAt: event.endsAt, registrationClosesAt: event.registrationClosesAt, review: event.review, startsAt: event.startsAt, title: event.title } : null;
    },
    async next(eventId, answers, language) {
      const { createRegistrationInterviewPostHandler } = await import("../../../app/api/events/[id]/registration/adaptive-handlers");
      const { data, status } = await callHandler(createRegistrationInterviewPostHandler(), eventId, "registration/interview", { language, transcript: transcript(answers) });
      if (status >= 400) throw Object.assign(new Error("interview unavailable"), { status });
      const step = data as { done?: boolean; signedQuestion?: { question?: { field?: string; prompt?: string; options?: string[] }; questionToken?: string } | null } | null;
      if (!step || step.done || !step.signedQuestion?.question || !step.signedQuestion.questionToken) return null;
      const question = step.signedQuestion.question;
      return { allowCustom: true, field: String(question.field ?? ""), options: [...(question.options ?? [])], prompt: String(question.prompt ?? ""), questionToken: step.signedQuestion.questionToken } satisfies Omit<EventJoinQuestion, "multi" | "max" | "help">;
    },
    async persona(eventId, answers, language: JourneyLanguage) {
      const { createRegistrationPersonaPostHandler } = await import("../../../app/api/events/[id]/registration/adaptive-handlers");
      const { data, status } = await callHandler(createRegistrationPersonaPostHandler(), eventId, "registration/persona", { language, transcript: transcript(answers) });
      if (status >= 400) return null;
      const persona = (data as { persona?: { selfIntroDraft?: string; tags?: string[] } } | null)?.persona;
      return persona ? { selfIntroDraft: persona.selfIntroDraft ?? null, tags: persona.tags ?? [] } : null;
    },
    async profileIntro(actorId) {
      return (await input.journey.selfIntro(actorId, "").catch(() => null))?.text ?? null;
    },
    async submit(eventId, answers) {
      const { POST } = await import("../../../app/api/events/[id]/registration/route");
      const responses = answers.map((answer) => ({ answer: answer.answer, questionToken: answer.questionToken }));
      const registered = await callHandler(POST as Handler, eventId, "registration", { answers: {}, expectedRegistrationVersion: null, intent: "register", responses });
      if (registered.status < 300) return { status: "registered", submittedAt: new Date().toISOString() };
      if (registered.status === 409) {
        // 审核制活动：普通报名会 409 → 走审核申请（同一组签名回答）。
        const { createEventAdmissionApplicationPostHandler } = await import("../../../app/api/events/[id]/admission/application/handler");
        const applied = await callHandler(createEventAdmissionApplicationPostHandler(), eventId, "admission/application", { responses });
        if (applied.status < 300) return { status: "pending_review", submittedAt: new Date().toISOString() };
        throw Object.assign(new Error("admission application failed"), { status: applied.status });
      }
      throw Object.assign(new Error("registration failed"), { status: registered.status });
    },
    async createSchedule(actorId, value) {
      const service = await schedule();
      const created = await service.create(actorId, { endsAt: value.endsAt, idempotencyKey: value.idempotencyKey, startsAt: value.startsAt, timeZone: "Asia/Tokyo", title: value.title });
      return String((created as { id?: string }).id ?? "");
    },
    async readTentative(actorId, eventId) {
      const row = await store.get<{ scheduleItemId: string; final: boolean }>("eventTentativeSchedules", actorId, tentativeId(actorId, eventId));
      return row && !row.deleted ? row.payload : null;
    },
    async saveTentative(actorId, eventId, record) {
      await store.put("eventTentativeSchedules", actorId, tentativeId(actorId, eventId), { eventId, ...record }, new Date().toISOString());
    },
    async renameSchedule(actorId, scheduleItemId, title) {
      const service = await schedule();
      const item = (await service.get({ actorId, id: scheduleItemId })) as { updatedAt?: string } | null;
      if (!item?.updatedAt) return;
      await service.update(actorId, scheduleItemId, { expectedUpdatedAt: item.updatedAt, idempotencyKey: `tentative-final:${scheduleItemId}`, patch: { title } });
    },
    async removeSchedule(actorId, scheduleItemId) {
      const service = await schedule();
      const item = (await service.get({ actorId, id: scheduleItemId })) as { updatedAt?: string } | null;
      if (!item?.updatedAt) return;
      await service.remove(actorId, scheduleItemId, { expectedUpdatedAt: item.updatedAt, idempotencyKey: `tentative-remove:${scheduleItemId}` });
    },
    async registrationStatus(actorId, eventId) {
      const mine = (await input.journey.myEvents(actorId)).find((item) => item.eventId === eventId);
      if (!mine) return "none";
      if (mine.status === "registered" || mine.status === "attended") return "registered";
      if (mine.status === "pending_review" || mine.status === "waitlisted") return "pending_review";
      if (mine.status === "rejected") return "rejected";
      if (mine.status === "cancelled") return "cancelled";
      return "none";
    },
  };
}
