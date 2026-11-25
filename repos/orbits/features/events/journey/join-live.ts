/**
 * R27 参加登録 facade 的 live 端口：在同一个请求里调用现有路由处理器（访谈 / persona / 报名 / 审核申请），
 * 不另写一套报名逻辑；日历走个人日程服务；仮予定记录存 `eventTentativeSchedules`。Owner: 甲 (R27).
 */
import { createHash } from "node:crypto";

import type { EventJoinAnswer, EventJoinQuestion } from "../../../shared/contract/event-join";
import { AppError } from "../../../shared/errors/app-error";
import type { HostSetupQuestion } from "../../../shared/contract/host-console";
import { createPostgresActorRecordStore } from "../actor-records/store";
import { JoinRefusedError, profileFactQuestions, type JoinDerivedAnswer, type JoinPorts, type JoinRefusal } from "./join";
import type { EventParticipantProfileField } from "../registration/contract";
import type { EventProfileResponseSnapshot } from "../registration/interview-response-contract";
import type { JourneyLivePorts } from "./ports";
import type { JourneyLanguage } from "./prep-core";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

async function callHandler(handler: Handler, eventId: string, path: string, body: unknown, method: "POST" | "GET" | "DELETE" = "POST"): Promise<{ status: number; data: unknown; message: string | null; reason: string | null }> {
  const request = new Request(`http://orbit.internal/api/events/${encodeURIComponent(eventId)}/${path}`, method === "GET" ? { method } : { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method });
  const response = await handler(request, { params: Promise.resolve({ id: eventId }) });
  const json = (await response.json().catch(() => null)) as { data?: unknown; error?: { context?: { reason?: unknown }; message?: unknown } } | null;
  const reason = json?.error?.context?.reason;
  return { data: json?.data ?? null, message: typeof json?.error?.message === "string" ? json.error.message : null, reason: typeof reason === "string" ? reason : null, status: response.status };
}

/** 申请接口的 409 → 报名页能说清的原因；其余照旧是一般冲突。 */
const REFUSAL_OF_ADMISSION: Readonly<Record<string, JoinRefusal>> = { APPLICATION_REJECTED: "JOIN_REJECTED", PROFILE_EDIT_CLOSED: "JOIN_CLOSED", PROFILE_LOCKED: "JOIN_LOCKED", WINDOW_CLOSED: "JOIN_CLOSED" };
function refused(reply: { message: string | null; reason: string | null }): AppError {
  const reason = reply.reason ? REFUSAL_OF_ADMISSION[reply.reason] : undefined;
  return reason ? new JoinRefusedError(reason, reply.message ?? "The registration cannot be changed.") : new AppError("CONFLICT", reply.message ?? "This event is not open for registration.");
}

const transcript = (answers: readonly EventJoinAnswer[]) => answers.map((answer) => ({ answer: answer.answer, field: answer.field, prompt: answer.prompt }));

/**
 * 访谈没问到的核心项（会いたい人・提供できること）：主办方题的回答或资料标签，签成固定题（同 profileFactResponses 的做法，
 * 报名接口与审核申请两条路都收）。题面用该字段的固定题（当前语言），回答是自由文本。
 */
export async function signDerivedJoinAnswers(input: { actorId: string; eventId: string; language: JourneyLanguage; derived: readonly JoinDerivedAnswer[]; secret?: string }): Promise<{ answer: string; questionToken: string }[]> {
  const { signAdaptiveInterviewQuestion } = await import("../registration/interview-question-token.server");
  const { FIXED_INTERVIEW_QUESTION_MODEL, FIXED_INTERVIEW_QUESTION_PROVIDER, fixedInterviewQuestionText } = await import("../registration/adaptive-interview-service");
  const language = input.language === "en" ? "en" as const : "zh" as const;
  return input.derived.flatMap((item) => {
    const text = fixedInterviewQuestionText(item.field, input.language);
    if (!text) return [];
    return [{ answer: item.answer, questionToken: signAdaptiveInterviewQuestion({ actorId: input.actorId, eventId: input.eventId, language, ...(input.secret ? { secret: input.secret } : {}), question: { acknowledgment: "", field: item.field, options: [...text.options], prompt: text.prompt,
      provenance: { fallbackReason: item.source === "host" ? "host_question" : "profile", generationMethod: "deterministic-fallback", model: FIXED_INTERVIEW_QUESTION_MODEL, provider: FIXED_INTERVIEW_QUESTION_PROVIDER } } }) }];
  });
}

type JoinQuestionBase = Omit<EventJoinQuestion, "multi" | "max" | "help">;

async function signFixedQuestion(input: { actorId: string; eventId: string; field: string; language: JourneyLanguage; secret?: string }): Promise<JoinQuestionBase | null> {
  const { signAdaptiveInterviewQuestion } = await import("../registration/interview-question-token.server");
  const { FIXED_INTERVIEW_QUESTION_MODEL, FIXED_INTERVIEW_QUESTION_PROVIDER, fixedInterviewQuestionText } = await import("../registration/adaptive-interview-service");
  const field = input.field as EventParticipantProfileField;
  const text = fixedInterviewQuestionText(field, input.language);
  if (!text) return null;
  const questionToken = signAdaptiveInterviewQuestion({ actorId: input.actorId, eventId: input.eventId, language: input.language === "en" ? "en" : "zh", ...(input.secret ? { secret: input.secret } : {}), question: { acknowledgment: "", field, options: [...text.options], prompt: text.prompt,
    provenance: { fallbackReason: "edit", generationMethod: "deterministic-fallback", model: FIXED_INTERVIEW_QUESTION_MODEL, provider: FIXED_INTERVIEW_QUESTION_PROVIDER } } });
  return { allowCustom: true, field, options: [...text.options], prompt: text.prompt, questionToken };
}

/**
 * 上次存的回答 → 可以原样再交的回答：同一道题（题面、选项、题号都不变）重新签名，没改的就还是同一份内容，不会多出一个资料版本。
 * 没有题面的旧回答改用该字段的固定题；都不行的丢掉（要的话会再问）。不看存的可见级别：本人看自己的回答。
 */
export async function signStoredJoinAnswers(input: { actorId: string; eventId: string; language: JourneyLanguage; responses: readonly EventProfileResponseSnapshot[]; secret?: string }): Promise<{ answer: string; fixed: boolean; question: JoinQuestionBase }[]> {
  const { signAdaptiveInterviewQuestion, verifyInterviewResponseSubmissions } = await import("../registration/interview-question-token.server");
  const { FIXED_INTERVIEW_QUESTION_MODEL, FIXED_INTERVIEW_QUESTION_PROVIDER } = await import("../registration/adaptive-interview-service");
  const out: { answer: string; fixed: boolean; question: JoinQuestionBase }[] = [];
  for (const response of input.responses) {
    const answer = response.answer?.displayText?.trim();
    if (!answer || out.some((item) => item.question.field === response.field)) continue;
    const options = response.question?.options.map((option) => option.label) ?? [];
    const fixed = response.generation?.provider === FIXED_INTERVIEW_QUESTION_PROVIDER;
    try {
      if (!response.question || !response.generation) throw new Error("no stored question");
      const questionToken = signAdaptiveInterviewQuestion({
        actorId: input.actorId, eventId: input.eventId, language: response.question.language, ...(response.questionId ? { questionId: response.questionId } : {}), ...(input.secret ? { secret: input.secret } : {}),
        question: { acknowledgment: "", field: response.field, options, prompt: response.question.prompt,
          provenance: fixed ? { fallbackReason: "edit", generationMethod: "deterministic-fallback", model: FIXED_INTERVIEW_QUESTION_MODEL, provider: FIXED_INTERVIEW_QUESTION_PROVIDER }
            : { fallbackReason: null, generationMethod: "orbit-agent-model-adaptive", model: response.generation.model, provider: response.generation.provider } },
      });
      verifyInterviewResponseSubmissions({ actorId: input.actorId, eventId: input.eventId, responses: [{ answer, questionToken }], ...(input.secret ? { secret: input.secret } : {}) });
      out.push({ answer, fixed, question: { allowCustom: true, field: response.field, options, prompt: response.question.prompt, questionToken } });
    } catch {
      const question = await signFixedQuestion({ ...input, field: response.field });
      if (question) out.push({ answer, fixed: true, question });
    }
  }
  return out;
}

export function createJoinLivePorts(input: { journey: JourneyLivePorts; query: (sql: string, values?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>; workspaceId: string }): JoinPorts {
  const store = createPostgresActorRecordStore({ query: input.query, workspaceId: input.workspaceId });
  const tentativeId = (actorId: string, eventId: string) => `ets:${createHash("sha256").update(`${actorId}\u0000${eventId}`).digest("hex").slice(0, 32)}`;
  const hostAnswersId = (actorId: string, eventId: string) => `eha:${createHash("sha256").update(`${actorId}\u0000${eventId}`).digest("hex").slice(0, 32)}`;
  const tokenEventId = async (eventId: string, actorId: string) => {
    const { loadEventForRegistration } = await import("../registration/event-loader");
    return (await loadEventForRegistration(eventId, actorId))?.id ?? eventId;
  };
  const schedule = async () => {
    const { createConfiguredPersonalScheduleService } = await import("../../personal-schedule/service-factory");
    const service = createConfiguredPersonalScheduleService();
    if (!service) throw new Error("personal schedule storage is not configured");
    return service;
  };
  const selfProfile = async (actorId: string, language: JourneyLanguage) => {
    const { getSelfProfileForAi } = await import("../../profile/self-profile-reader");
    const result = await getSelfProfileForAi({ actorId, mode: "live" }, { locale: language });
    return result.status === "ok" ? result.profile : null;
  };
  // Signed as fixed questions so both paths (direct registration, admission application) take them; at most 5 + 2 answers.
  // A profile that cannot be read never stops a registration.
  const profileFactResponses = async (eventId: string, answered: readonly string[], from: { actorId: string; language: JourneyLanguage }) => {
    try {
      const profile = await selfProfile(from.actorId, from.language);
      if (!profile) return [];
      const language = from.language === "en" ? "en" as const : "zh" as const;
      const { signAdaptiveInterviewQuestion } = await import("../registration/interview-question-token.server");
      const { FIXED_INTERVIEW_QUESTION_MODEL, FIXED_INTERVIEW_QUESTION_PROVIDER } = await import("../registration/adaptive-interview-service");
      const { loadEventForRegistration } = await import("../registration/event-loader");
      const event = await loadEventForRegistration(eventId, from.actorId);
      if (!event) return [];
      return profileFactQuestions({ industry: profile.industry.primaryLabel, organization: profile.organization, role: profile.role }, answered, language)
        .map(({ answer, ...question }) => ({ answer, questionToken: signAdaptiveInterviewQuestion({ actorId: from.actorId, eventId: event.id, language, question: { ...question, acknowledgment: "",
          provenance: { fallbackReason: "profile", generationMethod: "deterministic-fallback", model: FIXED_INTERVIEW_QUESTION_MODEL, provider: FIXED_INTERVIEW_QUESTION_PROVIDER } } }) }));
    } catch {
      console.warn(JSON.stringify({ event: "join_profile_facts_failed" }));
      return [];
    }
  };
  // 签不出来（活动读不到）就让报名接口照常拒绝（不静默吞掉缺项）。
  const derivedResponses = async (eventId: string, from: { actorId: string; language: JourneyLanguage; derived?: readonly JoinDerivedAnswer[] }) => {
    if (!from.derived?.length) return [];
    const { loadEventForRegistration } = await import("../registration/event-loader");
    const event = await loadEventForRegistration(eventId, from.actorId);
    return event ? signDerivedJoinAnswers({ actorId: from.actorId, derived: from.derived, eventId: event.id, language: from.language }) : [];
  };
  return {
    async event(eventId) {
      const event = await input.journey.event(eventId);
      return event ? { endsAt: event.endsAt, hostContact: event.hostContact ?? null, registrationClosesAt: event.registrationClosesAt, review: event.review, startsAt: event.startsAt, title: event.title } : null;
    },
    async current(actorId, eventId, language) {
      const row = (await input.query(`/* events:r17-join:current */ select
          a.status as application_status, a.decided_at is not null as decided, a.profile_payload -> 'interviewResponses' as application_responses,
          m.status as membership_status, p.profile_payload #> '{registrationProfile,interviewResponses}' as membership_responses,
          (select r.payload -> 'answers' from orbit_records r where r.workspace_id = $1 and r.collection_name = 'eventHostAnswers' and r.record_id = $4 and r.user_id = $3 and r.lifecycle_state <> 'deleted') as host_answers,
          (select r.payload ->> 'text' from orbit_records r where r.workspace_id = $1 and r.collection_name = 'eventJoinIntros' and r.record_id = $5 and r.user_id = $3 and r.lifecycle_state <> 'deleted') as intro
        from (select 1) one
        left join event_ops_admission_application_heads a on a.workspace_id = $1 and a.event_id = $2 and a.actor_id = $3
        left join event_ops_membership_heads m on m.workspace_id = $1 and m.event_id = $2 and m.actor_id = $3
        left join event_ops_profile_versions p on p.workspace_id = m.workspace_id and p.event_id = m.event_id and p.participant_id = m.participant_id and p.profile_version = m.profile_version`,
      [input.workspaceId, eventId, actorId, hostAnswersId(actorId, eventId), tentativeId(actorId, eventId)])).rows[0] ?? {};
      const application = typeof row.application_status === "string" ? row.application_status : null;
      const status = application === "pending_review" || application === "waitlisted" || application === "rejected" ? application
        : row.membership_status === "rsvped" ? "registered" as const
        : application || row.membership_status ? "cancelled" as const : "none" as const;
      const responses = (status === "registered" ? row.membership_responses : row.application_responses) as readonly EventProfileResponseSnapshot[] | null | undefined;
      const answers = await signStoredJoinAnswers({ actorId, eventId: await tokenEventId(eventId, actorId), language, responses: Array.isArray(responses) ? responses : [] });
      return { answers, decided: row.decided === true, hostAnswers: (row.host_answers as Record<string, string> | null) ?? {}, selfIntro: typeof row.intro === "string" ? row.intro : null, status };
    },
    async fixedQuestion(actorId, eventId, field, language) {
      return signFixedQuestion({ actorId, eventId: await tokenEventId(eventId, actorId), field, language });
    },
    async next(eventId, answers, language, _more, plan) {
      const { createRegistrationInterviewPostHandler } = await import("../../../app/api/events/[id]/registration/adaptive-handlers");
      const { data, message, status } = await callHandler(createRegistrationInterviewPostHandler(), eventId, "registration/interview", { fallback: "fixed", language, transcript: transcript(answers),
        ...(plan?.skipFields ? { skipFields: [...plan.skipFields] } : {}), ...(plan?.focusFields ? { focusFields: [...plan.focusFields] } : {}), ...(plan?.knownOptions ? { knownOptions: plan.knownOptions } : {}) });
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
      const persona = (data as { persona?: { selfIntroDraft?: string; tags?: string[]; topics?: string[] } } | null)?.persona;
      return persona ? { selfIntroDraft: persona.selfIntroDraft ?? null, tags: persona.tags ?? [], topics: persona.topics ?? [] } : null;
    },
    async profileIntro(actorId) {
      return (await input.journey.selfIntro(actorId, "").catch(() => null))?.text ?? null;
    },
    async profileTags(actorId, language = "ja") {
      // 标签按存的原文给；当前语言的写法由 prefillQuestion 换（localizeProfileTag）。目标从 relationshipGoal 读出已知的几项（自由文本不算）。
      const profile = await selfProfile(actorId, language);
      if (!profile) return null;
      const { parseProfileOnboardingGoal, profileGoalChoice } = await import("../../../shared/compute/profile-onboarding-goal");
      const goalIds = parseProfileOnboardingGoal(profile.relationshipGoal ?? "").choices.flatMap((choice) => { const goal = profileGoalChoice(choice); return goal ? [goal.id] : []; });
      return { goalIds, industryId: profile.industry.primaryIndustryId, offering: profile.offering, secondaryIndustryId: profile.industry.secondaryIndustryId, seeking: profile.seeking, seniority: profile.seniorityLevel, topics: profile.topics };
    },
    async hostQuestions(eventId) {
      const result = await input.query(`/* events:r17-join:host-questions */ select published -> 'questions' as questions from event_host_question_sets where workspace_id = $1 and event_id = $2 and published is not null`, [input.workspaceId, eventId]).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
      const raw = result.rows[0]?.questions;
      const list = (typeof raw === "string" ? JSON.parse(raw) : raw) as HostSetupQuestion[] | null | undefined;
      return Array.isArray(list) ? list.slice(0, 5) : [];
    },
    async saveHostAnswers(actorId, eventId, answers) {
      await store.put("eventHostAnswers", actorId, hostAnswersId(actorId, eventId), { answers: { ...answers }, eventId }, new Date().toISOString());
    },
    async submit(eventId, answers, from) {
      const { POST } = await import("../../../app/api/events/[id]/registration/route");
      const responses = [...answers.map((answer) => ({ answer: answer.answer, questionToken: answer.questionToken })),
        ...(from ? await derivedResponses(eventId, from) : []),
        ...(from ? await profileFactResponses(eventId, answers.map((answer) => answer.field), from) : [])];
      // 审核制按活动设定判断（不靠 409 猜：截止 / 已开始 / 问卷变了也是 409）。
      if ((await input.journey.event(eventId))?.review) {
        const { createEventAdmissionApplicationPostHandler } = await import("../../../app/api/events/[id]/admission/application/handler");
        const applied = await callHandler(createEventAdmissionApplicationPostHandler(), eventId, "admission/application", { responses });
        if (applied.status < 300) return { status: "pending_review", submittedAt: new Date().toISOString() };
        if (applied.status === 409) throw refused(applied);
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
        if (applied.status === 409) throw refused(applied);
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
    async removeIntro(actorId, eventId) {
      // 先抹掉文字再标删除（remove 只改状态、保留 payload）。
      const at = new Date().toISOString();
      const existing = await store.get("eventJoinIntros", actorId, tentativeId(actorId, eventId));
      if (!existing) return;
      await store.put("eventJoinIntros", actorId, tentativeId(actorId, eventId), { eventId, text: "" }, at);
      await store.remove("eventJoinIntros", actorId, tentativeId(actorId, eventId), at);
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
