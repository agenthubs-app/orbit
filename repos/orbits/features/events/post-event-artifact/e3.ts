/**
 * R27 E3（events DESIGN §5，§10 A6 已授权）：会後まとめ 3 条 + 逐人的次の一手（お礼下書き / フォロー日 / 计划类型建议）。Owner: 甲 (R27).
 * - 提示词版本 v3（`ATTENDEE_POST_EVENT_AI_PROMPT_VERSION`）；旧任务（v2）照旧解析，不受影响。
 * - id 不出境：联系人 id、证据 id 都换成别名（p1 / e1 / t1），模型只看到名字与证据文字；回来后换回。
 * - 输出必须过校验；不过就带着错误修复 1 次，还不过 → 失败（界面走规则退路，不显示「AI 下書き」）。
 * - 类型建议只认计划人物类型字典里的别名，越出字典的丢掉。お礼只是草稿，从不发送。
 */
import type { AttendeePostEventHighlight, AttendeePostEventNextStep } from "./contract";
import type { AttendeePostEventAiTaskPayload, AttendeePostEventEvidenceSnapshot } from "./task-repository";

export const E3_PROMPT_VERSION = 3;

/** Context added to the task in v3 (names, plan types, event date); stored with the task. */
export interface AttendeePostEventAiContext {
  eventTitle: string;
  /** YYYY-MM-DD (Tokyo). */
  eventDate: string;
  language: "ja" | "zh" | "en";
  people: readonly { contactId: string; name: string; org?: string | null }[];
  planTypes: readonly { key: string; label: string }[];
}

export const E3_SYSTEM_INSTRUCTION = `You write one attendee's post-event reflection and next steps from evidence the attendee owns.
Return exactly one JSON object: {"summary": string, "messageDraft": string|null, "highlights": [...], "nextSteps": [...]}.
- Write in the requested language (ja = Japanese, zh = Simplified Chinese, en = English).
- highlights: 1 to 3 items {"emoji": one emoji, "title": <=40 chars, "detail": <=90 chars, "evidence": <=80 chars naming which evidence it rests on (e.g. "交換記録 21:04 · メモ「…」")}.
- nextSteps: one item per person in "people" who appears in the evidence, {"person": person ref, "followupDate": "YYYY-MM-DD" on or after the event date, "thanksSubject": <=60 chars, "thanksBody": <=600 chars written by the attendee to that person, "planType": a ref from "planTypes" or null}.
- summary: one paragraph (<=240 chars); messageDraft: the first person's thanks body or null.
- Ground everything ONLY in the evidence. Never invent people, numbers, meetings or promises. Never use refs that are not listed. Drafts are never sent; do not say they were sent.`;

interface Aliased {
  userText: string;
  personByRef: Map<string, string>;
  typeByRef: Map<string, string>;
}

export function e3UserText(task: Pick<AttendeePostEventAiTaskPayload, "attendeeDisplayName" | "evidenceSnapshot">, context: AttendeePostEventAiContext): Aliased {
  const personByRef = new Map<string, string>();
  const refByContact = new Map<string, string>();
  context.people.forEach((person, index) => {
    personByRef.set(`p${index + 1}`, person.contactId);
    refByContact.set(person.contactId, `p${index + 1}`);
  });
  const typeByRef = new Map(context.planTypes.map((type, index) => [`t${index + 1}`, type.key]));
  const evidence = task.evidenceSnapshot.map((item: AttendeePostEventEvidenceSnapshot, index) => ({
    commitments: item.commitments,
    nextStep: item.nextStep,
    note: item.noteText,
    observedAt: item.observedAt,
    person: refByContact.get(item.contactId) ?? null,
    ref: `e${index + 1}`,
  }));
  return {
    personByRef,
    typeByRef,
    userText: JSON.stringify({
      attendee: { displayName: task.attendeeDisplayName?.trim() || "the attendee" },
      event: { date: context.eventDate, title: context.eventTitle },
      evidence,
      language: context.language,
      people: context.people.map((person) => ({ name: person.name, org: person.org ?? null, ref: refByContact.get(person.contactId) })),
      planTypes: context.planTypes.map((type, index) => ({ label: type.label, ref: `t${index + 1}` })),
    }),
  };
}

const stripFence = (text: string) => {
  const trimmed = text.trim();
  return trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() ?? trimmed;
};
const str = (value: unknown, max: number) => (typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null);

export type E3Parsed = { summary: string; messageDraft: string | null; highlights: AttendeePostEventHighlight[]; nextSteps: AttendeePostEventNextStep[] };

/** Validates a v3 answer and maps refs back; returns the reason when invalid (for the one repair). */
export function parseE3(text: string, aliased: Aliased, context: AttendeePostEventAiContext): { ok: true; value: E3Parsed } | { ok: false; reason: string } {
  let value: unknown;
  try { value = JSON.parse(stripFence(text)); } catch { return { ok: false, reason: "not valid JSON" }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "not a JSON object" };
  const object = value as Record<string, unknown>;
  const summary = str(object.summary, 400);
  if (!summary) return { ok: false, reason: "summary missing or too long" };
  const messageDraft = object.messageDraft === null ? null : str(object.messageDraft, 1200);
  if (!Array.isArray(object.highlights) || object.highlights.length < 1 || object.highlights.length > 3) return { ok: false, reason: "highlights must have 1-3 items" };
  const highlights: AttendeePostEventHighlight[] = [];
  for (const item of object.highlights) {
    const h = item as Record<string, unknown>;
    const emoji = str(h.emoji, 16); const title = str(h.title, 60); const detail = str(h.detail, 140); const evidence = str(h.evidence, 120);
    if (!emoji || !title || !detail || !evidence) return { ok: false, reason: "each highlight needs emoji, title, detail, evidence within limits" };
    highlights.push({ detail, emoji, evidence, title });
  }
  if (!Array.isArray(object.nextSteps)) return { ok: false, reason: "nextSteps must be an array" };
  const seen = new Set<string>();
  const nextSteps: AttendeePostEventNextStep[] = [];
  for (const item of object.nextSteps) {
    const step = item as Record<string, unknown>;
    const ref = typeof step.person === "string" ? step.person : "";
    const contactId = aliased.personByRef.get(ref);
    if (!contactId) return { ok: false, reason: `unknown person ref ${ref}` };
    if (seen.has(contactId)) continue;
    const date = typeof step.followupDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(step.followupDate) && Number.isFinite(Date.parse(`${step.followupDate}T00:00:00+09:00`)) ? step.followupDate : null;
    if (!date || date < context.eventDate) return { ok: false, reason: "followupDate must be YYYY-MM-DD on or after the event date" };
    const subject = str(step.thanksSubject, 80); const body = str(step.thanksBody, 800);
    if (!subject || !body) return { ok: false, reason: "thanksSubject / thanksBody missing or too long" };
    const typeKey = typeof step.planType === "string" ? aliased.typeByRef.get(step.planType) ?? null : null;
    seen.add(contactId);
    nextSteps.push({ attendeeId: contactId, followupDate: date, planTypeSuggestion: typeKey, thanksDraft: { body, subject } });
  }
  return { ok: true, value: { highlights, messageDraft, nextSteps, summary } };
}

export function e3RepairInstruction(reason: string): string {
  return `${E3_SYSTEM_INSTRUCTION}\nYour previous answer was rejected: ${reason}. Return the corrected JSON object only.`;
}
