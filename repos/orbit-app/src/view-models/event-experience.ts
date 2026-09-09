import type { EventExperienceConfigurationContract, EventExperienceQuestionContract, EventExperienceQuestionSetContract, EventExperienceSnapshotContract } from "../api/contract/event-experience";

type Intent = EventExperienceQuestionContract["intent"];
export const eventExperienceIntents: readonly Intent[] = ["target_attendees", "value_offered", "desired_outcome", "follow_up_preference", "positioning"];
export const eventExperienceIntentLabels: Record<Intent, string> = {
  target_attendees: "想认识谁", value_offered: "能提供什么", desired_outcome: "期待的收获", follow_up_preference: "后续交流", positioning: "工作角色",
};
const defaults: Record<Intent, { field: EventExperienceQuestionContract["participantProfileField"]; prompt: string; options: readonly string[] }> = {
  target_attendees: { field: "targetAttendees", prompt: "Who would make this event useful for you?", options: ["Founders", "Operators", "Investors or partners"] },
  value_offered: { field: "valueOffered", prompt: "What could you offer people you meet here?", options: ["Introductions", "Operating experience", "Feedback or expertise"] },
  desired_outcome: { field: "desiredOutcome", prompt: "What outcome would make this event worthwhile?", options: ["A pilot", "A useful introduction"] },
  follow_up_preference: { field: "followUpPreference", prompt: "How would you prefer to continue a useful conversation?", options: ["A short follow-up", "A deeper conversation"] },
  positioning: { field: "positioning", prompt: "How would you like other participants to understand your work?", options: ["Founder", "Operator", "Investor or partner"] },
};

export function eventExperienceInitialQuestion(intent: Intent): EventExperienceQuestionContract {
  const value = defaults[intent];
  return { id: intent, intent, participantProfileField: value.field, prompt: value.prompt, options: [...value.options], required: false };
}

export function initialEventExperienceConfiguration(): EventExperienceConfigurationContract {
  return { accentColor: null, coverAssetId: null, introduction: null, templateId: "default", questionSet: { track: "v1", questions: eventExperienceQuestionsForTrack("v1", []) } };
}

export function eventExperienceConfigurationFromSnapshot(snapshot: EventExperienceSnapshotContract | null): EventExperienceConfigurationContract {
  return snapshot?.draft?.configuration ?? snapshot?.published?.configuration ?? initialEventExperienceConfiguration();
}

export function eventExperienceQuestionsForTrack(track: "v1" | "v2", questions: readonly EventExperienceQuestionContract[]): readonly EventExperienceQuestionContract[] {
  if (track === "v1") return (["target_attendees", "value_offered"] as const).map(intent => ({ ...(questions.find(q => q.intent === intent) ?? eventExperienceInitialQuestion(intent)), required: true }));
  return questions.filter((q, i) => questions.findIndex(other => other.intent === q.intent) === i).slice(0, 4).map(q => ({ ...q, required: false }));
}

export function eventExperienceValidation(configuration: EventExperienceConfigurationContract): string | null {
  if (configuration.coverAssetId !== null || configuration.templateId !== "default") return "暂不支持此展示配置。";
  if (configuration.introduction !== null && (!configuration.introduction.trim() || configuration.introduction.length > 1000)) return "活动简介须为 1 至 1000 字，或留空。";
  if (configuration.accentColor !== null && !/^#[0-9a-f]{6}$/i.test(configuration.accentColor)) return "强调色须为 #RRGGBB，或恢复默认。";
  const { questions, track } = configuration.questionSet;
  if (track === "v1" && (questions.length !== 2 || questions[0]?.intent !== "target_attendees" || questions[1]?.intent !== "value_offered" || questions.some(q => !q.required))) return "标准问题须保留两道必答题。";
  if (track === "v2" && (questions.length > 4 || questions.some(q => q.required))) return "自选问题最多四道，均为选答。";
  if (new Set(questions.map(q => q.intent)).size !== questions.length) return "问题类型不能重复。";
  for (const [i, q] of questions.entries()) {
    if (!defaults[q.intent] || q.id !== q.intent || q.participantProfileField !== defaults[q.intent].field) return `问题 ${i + 1} 的类型无效。`;
    if (!q.prompt.trim() || q.prompt.length > 240) return `问题 ${i + 1} 须为 1 至 240 字。`;
    if (q.options.length < 2 || q.options.length > 5 || q.options.some(o => !o.trim() || o.length > 80) || new Set(q.options.map(o => o.trim())).size !== q.options.length) return `问题 ${i + 1} 须有 2 至 5 个不重复的选项，每项为 1 至 80 字。`;
  }
  return null;
}

export function eventExperienceFreeze(snapshot: EventExperienceSnapshotContract | null, configuration: EventExperienceConfigurationContract, now = Date.now()): { frozen: boolean; blocked: boolean; canRestore: boolean } {
  const frozen = Boolean(snapshot?.head.frozenAt && Date.parse(snapshot.head.frozenAt) <= now);
  const differs = Boolean(snapshot?.published && !eventExperienceQuestionSetsEqual(configuration.questionSet, snapshot.published.configuration.questionSet));
  return { frozen, blocked: frozen && (!snapshot?.published || differs), canRestore: frozen && differs };
}

export function eventExperienceQuestionSetsEqual(left: EventExperienceQuestionSetContract, right: EventExperienceQuestionSetContract): boolean {
  return left.track === right.track && left.questions.length === right.questions.length && left.questions.every((question, index) => {
    const other = right.questions[index]!;
    return question.id === other.id && question.intent === other.intent && question.participantProfileField === other.participantProfileField && question.prompt === other.prompt && question.required === other.required && question.options.length === other.options.length && question.options.every((option, optionIndex) => option === other.options[optionIndex]);
  });
}

export function eventExperienceConfigurationsEqual(left: EventExperienceConfigurationContract, right: EventExperienceConfigurationContract): boolean {
  return left.introduction === right.introduction && left.accentColor === right.accentColor && left.coverAssetId === right.coverAssetId && left.templateId === right.templateId && eventExperienceQuestionSetsEqual(left.questionSet, right.questionSet);
}

export function eventExperiencePath(eventId: string): string {
  return `/api/events/${encodeURIComponent(eventId)}/experience`;
}
