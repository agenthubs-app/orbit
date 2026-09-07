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
  canCancel: boolean;
  confirmLabel: string;
  questionSetHash: string | null;
  questionSetVersion: number | null;
  questions: EventRegistrationQuestionView[];
  statusDetail: string;
  statusLabel: string;
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

  return {
    canCancel: status === "rsvped",
    confirmLabel: confirmLabel(status),
    questionSetHash: questionSetHash || null,
    questionSetVersion:
      typeof questionSetVersionValue === "number" &&
      Number.isSafeInteger(questionSetVersionValue)
        ? questionSetVersionValue
        : null,
    questions: questionsFromPayload(payload, answers),
    statusDetail: statusDetail(status),
    statusLabel: statusLabel(status)
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
