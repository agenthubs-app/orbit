export interface EventRegistrationQuestionView {
  answer: string;
  field: string;
  id: string;
  options: string[];
  prompt: string;
  /** Legacy payloads omit this and remain skippable; V1/V2 APIs now send it. */
  required?: boolean;
}

export interface EventRegistrationView {
  allowedActions?: EventRegistrationActionView[];
  applicationVersion?: number | null;
  canCancel: boolean;
  canSubmit?: boolean;
  cancelLabel?: string;
  confirmLabel: string;
  eligibilityEvaluatedAt?: string;
  eligibilityState?: EventRegistrationEligibilityStateView;
  registrationVersion?: string | null;
  questionSetHash: string | null;
  questionSetVersion: number | null;
  questions: EventRegistrationQuestionView[];
  statusDetail: string;
  statusLabel: string;
}

export const EVENT_REGISTRATION_ACTION_VIEWS = [
  "register",
  "update",
  "cancel",
  "reactivate",
  "withdraw"
] as const;

export type EventRegistrationActionView =
  (typeof EVENT_REGISTRATION_ACTION_VIEWS)[number];

export const EVENT_REGISTRATION_ELIGIBILITY_STATE_VIEWS = [
  "not_open",
  "open",
  "registered",
  "registration_cancelled",
  "registration_closed",
  "event_ended",
  "event_cancelled",
  "full",
  "pending_review",
  "waitlisted",
  "rejected",
  "withdrawn",
  "unavailable"
] as const;

export type EventRegistrationEligibilityStateView =
  (typeof EVENT_REGISTRATION_ELIGIBILITY_STATE_VIEWS)[number];

export function eventRegistrationQuestionKey(view: EventRegistrationView): string {
  return JSON.stringify([
    view.questionSetHash,
    view.questionSetVersion,
    view.questions.map(({ id, field, prompt, options, required }) =>
      [id, field, prompt, options, required === true])
  ]);
}

export function eventRegistrationAuthorityKey(view: EventRegistrationView): string {
  return JSON.stringify([
    view.eligibilityEvaluatedAt ?? null,
    view.eligibilityState ?? null,
    view.registrationVersion ?? null,
    view.allowedActions ?? null
  ]);
}

export function eventRegistrationReceiptMatches(
  data: unknown,
  eventId: string,
  actorId: string,
  status: "rsvped" | "cancelled",
  expectedAction?: Extract<EventRegistrationActionView, "cancel" | "reactivate" | "register" | "update">
): boolean {
  if (!isRecord(data) || !isRecord(data.participantProfile)) return false;
  const profile = data.participantProfile;
  const recordMatches = Boolean(
    stringField(data, "id") && stringField(profile, "id") &&
    data.eventId === eventId && data.userId === actorId && data.status === status &&
    data.participantProfileId === profile.id && profile.eventId === eventId &&
    profile.userId === actorId && isRecord(profile.answers)
  );
  if (!recordMatches || !expectedAction) return recordMatches;
  const receipt = data.mutationReceipt;
  return Boolean(
    isRecord(receipt) &&
    receipt.action === expectedAction &&
    receipt.actorId === actorId &&
    receipt.eventId === eventId &&
    receipt.recordId === data.id &&
    receipt.registrationVersion === data.updatedAt
  );
}

export function eventAdmissionWithdrawalMatches(
  data: unknown,
  eventId: string,
  actorId: string,
  expectedApplicationVersion: number
): boolean {
  return Boolean(
    isRecord(data) &&
    data.actorId === actorId &&
    data.eventId === eventId &&
    data.status === "withdrawn" &&
    typeof data.applicationVersion === "number" &&
    Number.isSafeInteger(data.applicationVersion) &&
    data.applicationVersion > expectedApplicationVersion
  );
}

export interface EventRegistrationInterviewTurn {
  answer: string;
  field: string;
  prompt: string;
}

export interface EventRegistrationAdaptiveBody {
  language: "zh";
  transcript: EventRegistrationInterviewTurn[];
}

export interface EventRegistrationAdaptiveQuestionView {
  acknowledgment: string;
  field: string;
  options: string[];
  prompt: string;
}

export interface EventRegistrationAdaptiveStepView {
  done: boolean;
  question: EventRegistrationAdaptiveQuestionView | null;
  statusText: string;
}

export interface EventRegistrationPersonaView {
  energyStyle: string;
  industryTags: string[];
  nextAction: string;
  offering: string;
  openers: string[];
  safetyText: string;
  seeking: string;
  tagline: string;
  tags: string[];
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nestedRecord(
  record: Record<string, unknown>,
  fieldName: string
): Record<string, unknown> {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function listFromRecord(
  record: Record<string, unknown>,
  fieldName: string
): readonly unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function containsImplementationLabel(value: string): boolean {
  return /\b(provider|model|fixture|mock|generationMethod|source-backed|postgres|live-record-store)\b/i.test(
    value
  );
}

function userFacingText(value: string): string {
  return containsImplementationLabel(value) ? "" : value.trim();
}

function userFacingList(value: unknown, limit = 5): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map(userFacingText)
    .filter(Boolean)
    .slice(0, limit);
}

function envelopeData(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return value.success === true && "data" in value ? value.data : value;
}

function questionPrompt(value: string): string {
  return userFacingText(value)
    .replace(/参加\s*「[^」]+」\s*/u, "参加这场活动")
    .replace(/在\s*「[^」]+」\s*中/u, "在这场活动中")
    .replace(/在\s*「[^」]+」\s*/u, "在这场活动");
}

function registrationRecord(data: Record<string, unknown>): Record<string, unknown> {
  const registration = data.registration;
  return isRecord(registration) ? registration : {};
}

function answerMap(registration: Record<string, unknown>): Record<string, unknown> {
  const participantProfile = nestedRecord(registration, "participantProfile");
  return nestedRecord(participantProfile, "answers");
}

function statusLabel(status: string): string {
  if (status === "rsvped") {
    return "已报名";
  }

  if (status === "cancelled") {
    return "已取消";
  }

  return "尚未报名";
}

function statusDetail(status: string): string {
  if (status === "rsvped") {
    return "不会写入个人主页，也不会自动发消息。";
  }

  if (status === "cancelled") {
    return "可以重新报名，原来的活动资料会被覆盖。";
  }

  return "确认后只保存这场活动的参与资料。";
}

function confirmLabel(status: string): string {
  if (status === "rsvped") {
    return "更新报名资料";
  }

  if (status === "cancelled") {
    return "重新报名";
  }

  return "确认报名";
}

function eligibilityView(data: Record<string, unknown>): {
  allowedActions: EventRegistrationActionView[];
  applicationVersion: number | null;
  evaluatedAt: string;
  registrationVersion: string | null;
  state: EventRegistrationEligibilityStateView;
} | null {
  const raw = data.eligibility;
  if (!isRecord(raw)) return null;
  const rawState = stringField(raw, "state");
  const state = EVENT_REGISTRATION_ELIGIBILITY_STATE_VIEWS.find(
    (value) => value === rawState
  );
  const evaluatedAt = stringField(raw, "evaluatedAt");
  if (!state || !evaluatedAt) {
    return {
      allowedActions: [],
      applicationVersion: null,
      evaluatedAt,
      registrationVersion: null,
      state: "unavailable"
    };
  }
  const allowedActions = listFromRecord(raw, "allowedActions")
    .filter((value): value is EventRegistrationActionView =>
      typeof value === "string" &&
      EVENT_REGISTRATION_ACTION_VIEWS.includes(value as EventRegistrationActionView)
    );
  const registrationVersion = stringField(raw, "registrationVersion");
  const applicationVersion = raw.applicationVersion;
  return {
    allowedActions: [...new Set(allowedActions)],
    applicationVersion:
      typeof applicationVersion === "number" &&
      Number.isSafeInteger(applicationVersion) &&
      applicationVersion > 0
        ? applicationVersion
        : null,
    evaluatedAt,
    registrationVersion: registrationVersion || null,
    state
  };
}

function eligibilityCopy(input: {
  actions: readonly EventRegistrationActionView[];
  state: EventRegistrationEligibilityStateView;
}): {
  cancelLabel: string;
  confirmLabel: string;
  detail: string;
  label: string;
} {
  if (input.state === "not_open") return { cancelLabel: "", confirmLabel: "等待开放", detail: "报名尚未开放，请稍后再看。", label: "报名尚未开放" };
  if (input.state === "registration_closed") return { cancelLabel: "", confirmLabel: "报名已截止", detail: "服务端已关闭报名。当前答案会保留，但不能提交。", label: "报名已截止" };
  if (input.state === "event_ended") return { cancelLabel: "", confirmLabel: "活动已结束", detail: "活动已经结束，报名操作不可用。", label: "活动已结束" };
  if (input.state === "event_cancelled") return { cancelLabel: "", confirmLabel: "活动已取消", detail: "活动已由主办方取消，报名操作不可用。", label: "活动已取消" };
  if (input.state === "full") return { cancelLabel: "", confirmLabel: "名额已满", detail: "当前名额已满，服务端未开放候补。", label: "名额已满" };
  if (input.state === "pending_review") return { cancelLabel: "撤回申请", confirmLabel: "等待审核", detail: "申请已提交，正在等待主办方审核。", label: "待审核" };
  if (input.state === "waitlisted") return { cancelLabel: "撤回申请", confirmLabel: "当前候补", detail: "当前处于候补名单，可撤回申请。", label: "候补中" };
  if (input.state === "rejected") return { cancelLabel: "", confirmLabel: "未通过审核", detail: "本次申请未通过审核。", label: "未通过" };
  if (input.state === "withdrawn") return { cancelLabel: "", confirmLabel: "申请已撤回", detail: "申请已经撤回。", label: "已撤回" };
  if (input.state === "unavailable") return { cancelLabel: "", confirmLabel: "暂不可操作", detail: "暂时无法确认服务端资格，刷新成功前不会提交。", label: "资格暂不可用" };
  if (input.state === "registered") {
    return {
      cancelLabel: input.actions.includes("withdraw") ? "撤回申请" : "取消报名",
      confirmLabel: input.actions.includes("update") ? "更新报名资料" : "报名资料不可修改",
      detail: "报名已确认；当前只开放服务端列出的操作。",
      label: "已报名"
    };
  }
  if (input.state === "registration_cancelled") return { cancelLabel: "", confirmLabel: "重新报名", detail: "报名已取消；开放期间可以重新报名。", label: "已取消" };
  return { cancelLabel: "", confirmLabel: "确认报名", detail: "确认后只保存这场活动的参与资料。", label: "尚未报名" };
}

function questionsFromPayload(
  data: Record<string, unknown>,
  answers: Record<string, unknown>
): EventRegistrationQuestionView[] {
  const questionSet = nestedRecord(data, "questionSet");

  return listFromRecord(questionSet, "questions")
    .filter(isRecord)
    .map((question) => {
      const field = stringField(question, "participantProfileField");
      const prompt = questionPrompt(stringField(question, "prompt"));
      const id = stringField(question, "id", field || "question");
      const options = listFromRecord(question, "options")
        .filter((option): option is string => typeof option === "string")
        .map(userFacingText)
        .filter(Boolean);

      return {
        answer: typeof answers[field] === "string" ? answers[field].trim() : "",
        field,
        id,
        options,
        prompt,
        required: question.required === true && question.optional !== true
      };
    })
    .filter((question) => question.field && question.prompt);
}

export function eventRegistrationToView(data: unknown): EventRegistrationView {
  const payload = isRecord(data) ? data : {};
  const registration = registrationRecord(payload);
  const status = stringField(registration, "status", "unregistered");
  const answers = answerMap(registration);
  const questionSetHash = stringField(
    nestedRecord(payload, "questionSet"),
    "questionSetHash"
  );
  const questionSetVersionValue = nestedRecord(payload, "questionSet").questionSetVersion;
  const eligibility = eligibilityView(payload);
  const copy = eligibility
    ? eligibilityCopy({ actions: eligibility.allowedActions, state: eligibility.state })
    : null;

  return {
    ...(eligibility
      ? {
          allowedActions: eligibility.allowedActions,
          applicationVersion: eligibility.applicationVersion,
          canSubmit: eligibility.allowedActions.some((action) =>
            ["register", "reactivate", "update"].includes(action)
          ),
          cancelLabel: copy!.cancelLabel,
          eligibilityEvaluatedAt: eligibility.evaluatedAt,
          eligibilityState: eligibility.state,
          registrationVersion: eligibility.registrationVersion
        }
      : {}),
    canCancel: eligibility
      ? eligibility.allowedActions.some((action) =>
          action === "cancel" || action === "withdraw"
        )
      : status === "rsvped",
    confirmLabel: copy?.confirmLabel ?? confirmLabel(status),
    questionSetHash: questionSetHash || null,
    questionSetVersion:
      typeof questionSetVersionValue === "number" &&
      Number.isSafeInteger(questionSetVersionValue)
        ? questionSetVersionValue
        : null,
    questions: questionsFromPayload(payload, answers),
    statusDetail: copy?.detail ?? statusDetail(status),
    statusLabel: copy?.label ?? statusLabel(status)
  };
}

export function buildEventRegistrationAnswers(
  questions: EventRegistrationQuestionView[],
  rawAnswers: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    questions
      .map((question) => [question.field, rawAnswers[question.field]?.trim() ?? ""])
      .filter(([, value]) => value)
  );
}

export function buildEventRegistrationAdaptiveBody(
  questions: EventRegistrationQuestionView[],
  rawAnswers: Record<string, string>,
  extraTurns: EventRegistrationInterviewTurn[] = []
): EventRegistrationAdaptiveBody {
  const questionTurns = questions
    .map((question) => ({
      answer: rawAnswers[question.field]?.trim() ?? "",
      field: question.field,
      prompt: question.prompt
    }))
    .filter((turn) => turn.answer && turn.field && turn.prompt);
  const transcript = [...questionTurns, ...extraTurns]
    .map((turn) => ({
      answer: turn.answer.trim(),
      field: turn.field.trim(),
      prompt: turn.prompt.trim()
    }))
    .filter((turn) => turn.answer && turn.field && turn.prompt);

  return {
    language: "zh",
    transcript
  };
}

export function eventRegistrationAdaptiveStepToView(
  data: unknown
): EventRegistrationAdaptiveStepView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const done = record.done === true;
  const question = isRecord(record.question) ? record.question : null;

  return {
    done,
    question: question
      ? {
          acknowledgment: userFacingText(stringField(question, "acknowledgment")),
          field: stringField(question, "field"),
          options: userFacingList(question.options, 4),
          prompt: userFacingText(stringField(question, "prompt"))
        }
      : null,
    statusText: done ? "画像信息够了" : "继续补充画像"
  };
}

export function eventRegistrationPersonaToView(
  data: unknown
): EventRegistrationPersonaView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const persona = isRecord(record.persona) ? record.persona : record;

  return {
    energyStyle: userFacingText(stringField(persona, "energyStyle")),
    industryTags: userFacingList(persona.industryTags, 3),
    nextAction: "检查这段介绍。确认报名后，它只服务这场活动的匹配。",
    offering: userFacingText(stringField(persona, "offering")),
    openers: userFacingList(persona.openers, 3),
    safetyText: "不会写入个人主页，也不会自动发消息。",
    seeking: userFacingText(stringField(persona, "seeking")),
    tagline: userFacingText(stringField(persona, "tagline")),
    tags: userFacingList(persona.tags, 5),
    title: "活动画像"
  };
}
