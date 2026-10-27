/**
 * R27 参加登録 facade 的 live 端口：在同一个请求里调用现有路由处理器（访谈 / persona / 报名 / 审核申请），
 * 不另写一套报名逻辑；日历走个人日程服务；仮予定记录存 `eventTentativeSchedules`。Owner: 甲 (R27).
 */
import { createHash } from "node:crypto";

import type { EventJoinAnswer, EventJoinQuestion } from "../../../shared/contract/event-join";
import { AppError } from "../../../shared/errors/app-error";
import type { HostSetupQuestion } from "../../../shared/contract/host-console";
import { createPostgresActorRecordStore } from "../actor-records/store";
import type { JoinPorts } from "./join";
import type { JourneyLivePorts } from "./ports";
import type { JourneyLanguage } from "./prep-core";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

async function callHandler(handler: Handler, eventId: string, path: string, body: unknown, method: "POST" | "GET" | "DELETE" = "POST"): Promise<{ status: number; data: unknown; message: string | null }> {
  const request = new Request(`http://orbit.internal/api/events/${encodeURIComponent(eventId)}/${path}`, method === "GET" ? { method } : { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method });
  const response = await handler(request, { params: Promise.resolve({ id: eventId }) });
  const json = (await response.json().catch(() => null)) as { data?: unknown; error?: { message?: unknown } } | null;
  return { data: json?.data ?? null, message: typeof json?.error?.message === "string" ? json.error.message : null, status: response.status };
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
      const { data, message, status } = await callHandler(createRegistrationInterviewPostHandler(), eventId, "registration/interview", { fallback: "fixed", language, transcript: transcript(answers) });
      // fallback "fixed": when the model cannot be used (daily AI limit, AI down) the interview answers with fixed questions, so registration always finishes.
      // A closed event (409 not open) is a known answer, not a 500.
      if (status === 409) throw new AppError("CONFLICT", message ?? "This event is not open for registration.");
      if (status === 404) throw new AppError("NOT_FOUND", message ?? "The event could not be found.");
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
    async hostQuestions(eventId) {
      const result = await input.query(`/* events:r17-join:host-questions */ select published -> 'questions' as questions from event_host_question_sets where workspace_id = $1 and event_id = $2 and published is not null`, [input.workspaceId, eventId]).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
      const raw = result.rows[0]?.questions;
      const list = (typeof raw === "string" ? JSON.parse(raw) : raw) as HostSetupQuestion[] | null | undefined;
      return Array.isArray(list) ? list.slice(0, 5) : [];
    },
    async saveHostAnswers(actorId, eventId, answers) {
      await store.put("eventHostAnswers", actorId, `eha:${createHash("sha256").update(`${actorId}\u0000${eventId}`).digest("hex").slice(0, 32)}`, { answers: { ...answers }, eventId }, new Date().toISOString());
    },
    async submit(eventId, answers) {
      const { POST } = await import("../../../app/api/events/[id]/registration/route");
      const responses = answers.map((answer) => ({ answer: answer.answer, questionToken: answer.questionToken }));
      // 审核制按活动设定判断（不靠 409 猜：截止 / 已开始 / 问卷变了也是 409）。
      if ((await input.journey.event(eventId))?.review) {
        const { createEventAdmissionApplicationPostHandler } = await import("../../../app/api/events/[id]/admission/application/handler");
        const applied = await callHandler(createEventAdmissionApplicationPostHandler(), eventId, "admission/application", { responses });
        if (applied.status < 300) return { status: "pending_review", submittedAt: new Date().toISOString() };
        if (applied.status === 409) throw new AppError("CONFLICT", applied.message ?? "This event is not open for registration.");
        throw Object.assign(new Error("admission application failed"), { status: applied.status });
      }
      // 不带 intent / expectedRegistrationVersion：服务端按现状推断 register / reactivate（取消后再报）/ update（改资料）。
      const registered = await callHandler(POST as Handler, eventId, "registration", { answers: {}, responses });
      if (registered.status < 300) return { status: "registered", submittedAt: new Date().toISOString() };
      // An admission-controlled event with instant admission (review false) refuses direct registration;
      // it takes the same answers as an admission application (admitted → registered, otherwise waiting for review).
      if (registered.status === 409 && registered.message?.includes("admission application flow")) {
        const { createEventAdmissionApplicationPostHandler } = await import("../../../app/api/events/[id]/admission/application/handler");
        const applied = await callHandler(createEventAdmissionApplicationPostHandler(), eventId, "admission/application", { responses });
        if (applied.status < 300) {
          const status = (applied.data as { status?: string } | null)?.status;
          return { status: status === "admitted" ? "registered" : "pending_review", submittedAt: new Date().toISOString() };
        }
        if (applied.status === 409) throw new AppError("CONFLICT", applied.message ?? "This event is not open for registration.");
        throw Object.assign(new Error("admission application failed"), { status: applied.status });
      }
      if (registered.status === 409) throw new AppError("CONFLICT", registered.message ?? "This event is not open for registration.");
      throw Object.assign(new Error("registration failed"), { status: registered.status });
    },
    async cancel(eventId) {
      // 有入场申请（审核制，或即时入场的 admission 活动）：撤回申请（普通取消接口对这类活动返回 409）。
      // 不只看 review：即时入场的活动 review 为 false，但同样只能撤回申请。没有申请时走普通取消。
      {
        const { createEventAdmissionApplicationDeleteHandler, createEventAdmissionApplicationGetHandler } = await import("../../../app/api/events/[id]/admission/application/handler");
        const current = await callHandler(createEventAdmissionApplicationGetHandler(), eventId, "admission/application", null, "GET");
        const version = (current.data as { applicationVersion?: number } | null)?.applicationVersion;
        if (current.status < 300 && typeof version === "number") {
          const withdrawn = await callHandler(createEventAdmissionApplicationDeleteHandler(), eventId, "admission/application", { expectedApplicationVersion: version }, "DELETE");
          if (withdrawn.status < 300) return;
          throw Object.assign(new Error("admission withdraw failed"), { status: withdrawn.status });
        }
      }
      const { POST } = await import("../../../app/api/events/[id]/registration/cancel/route");
      const { status } = await callHandler(POST as Handler, eventId, "registration/cancel", { expectedRegistrationVersion: null, intent: "cancel" });
      if (status >= 300) throw Object.assign(new Error("registration cancel failed"), { status });
    },
    async saveIntro(actorId, eventId, text) {
      await store.put("eventJoinIntros", actorId, tentativeId(actorId, eventId), { eventId, text }, new Date().toISOString());
    },
    async createSchedule(actorId, value) {
      const service = await schedule();
      const created = await service.create(actorId, { endsAt: value.endsAt, idempotencyKey: value.idempotencyKey, startsAt: value.startsAt, timeZone: "Asia/Tokyo", title: value.title });
      // The schedule service answers { scheduleItem }; reading `.id` off the envelope gave "" and the response failed validation.
      const reply = created as { scheduleItem?: { id?: string }; id?: string };
      return String(reply.scheduleItem?.id ?? reply.id ?? "");
    },
    async readTentative(actorId, eventId) {
      const row = await store.get<{ scheduleItemId: string; final: boolean; removed?: boolean }>("eventTentativeSchedules", actorId, tentativeId(actorId, eventId));
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
