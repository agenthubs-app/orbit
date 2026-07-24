export interface EventRegistrationQuestionView {
  answer: string;
  field: string;
  id: string;
  options: string[];
  prompt: string;
}

export interface EventRegistrationView {
  canCancel: boolean;
  confirmLabel: string;
  questions: EventRegistrationQuestionView[];
  statusDetail: string;
  statusLabel: string;
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
        prompt
      };
    })
    .filter((question) => question.field && question.prompt);
}

export function eventRegistrationToView(data: unknown): EventRegistrationView {
  const payload = isRecord(data) ? data : {};
  const registration = registrationRecord(payload);
  const status = stringField(registration, "status", "unregistered");
  const answers = answerMap(registration);

  return {
    canCancel: status === "rsvped",
    confirmLabel: confirmLabel(status),
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
