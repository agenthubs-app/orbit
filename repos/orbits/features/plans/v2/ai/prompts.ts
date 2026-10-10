/**
 * R23 C1–C7 的提示词（DESIGN §5）。版本号写进日志与 REPORT；改提示词只升版本号，不放宽校验器。
 * 系统方针 v4：只用输入里的事实；联系人只用别名；数字必须有引用；短名、题目、能力只从给定清单里选。
 */
import type { PlanCopyLanguage } from "../../../../shared/compute/plan-template-copy";

/**
 * v2（R23 本机验证后）：初版 / 修正写明人物类型的全部字段，并强调「没有 ① 的句子不写数字」。
 * v3（R23 本机验证第 3 次初版被拒：删了一个枠却没补配点、Step 还引用它）：要求保留全部枠、默认照抄模板配点；
 * 修正时用户要求的改动在前提允许范围内就照做。v3 还没有真实调用验证（C6 本机 5 次已用完，见 R23 REPORT）。
 */
export const PLAN_V2_PROMPT_VERSION = "plan-v2-flow-2026-11-v3";

const LANGUAGE: Record<PlanCopyLanguage, string> = { en: "English", ja: "Japanese (natural, polite です・ます)", zh: "Simplified Chinese" };

const POLICY = [
  "You are Orbit's planning assistant for founders and professionals in Japan.",
  "Policy v4: use only facts given in the input; never invent people, companies, numbers or sources.",
  "People appear only as aliases such as C1, C2; refer to them only by alias and never output any other identifier.",
  "Reply with one JSON object only, exactly in the requested shape. No markdown.",
].join("\n");

export function systemPrompt(task: string, language: PlanCopyLanguage): string {
  return `${POLICY}\nWrite every user-facing sentence in ${LANGUAGE[language]}.\n\nTask:\n${task}`;
}

export const TASKS = {
  goalKind: [
    "Classify the goal text into exactly one goal kind: launch (launch & revenue), fundraising, sales (new customers), hiring, partnership, career.",
    'Output: {"goalKind": "<kind>"}',
  ].join("\n"),
  background: [
    "Draft three background blocks for the user's goal in one pass.",
    "1. me: stance (owner | cofounder | employee | individual, or null if unclear) and wants: what the user really wants to do, extracted from the goal text in a short phrase.",
    "2. team: members = the user (alias \"self\") plus the given contacts who look like team members; for each, tick the capabilities (ids from the given list only) the person can cover, judged from their card fields and notes; relation one of cofounder | employee | contractor | advisor | null.",
    "3. ladder: a purpose ladder with exactly 4 levels (4 = biggest, about ten years; 1 = smallest, a few months). Level 2 is the user's original goal text unchanged. Level 3 = one level bigger, derived from wants and team; level 4 = one more level up; level 1 = one smaller, concrete step. suggestedLevel = the level that seems closest to the real purpose, with a one-sentence reason.",
    'Output: {"stance": ..., "wants": "...", "members": [{"alias": "self", "capabilities": ["..."], "relation": null}], "ladder": {"rungs": [{"level": 4, "text": "..."}, {"level": 3, "text": "..."}, {"level": 2, "text": "<original>"}, {"level": 1, "text": "..."}], "suggestedLevel": 3, "reason": "..."}}',
  ].join("\n"),
  members: [
    "For each given contact, tick the capabilities (ids from the given list only) the person can cover, judged only from the card fields and notes, and give a one-sentence basis.",
    'Output: {"members": [{"alias": "C1", "capabilities": ["..."], "basis": "..."}]}',
  ].join("\n"),
  ladder: [
    "Rebuild the 4-level purpose ladder from the goal text, the new \"wants\" and the team summary. Level 2 is the original goal text unchanged; suggest the closest level with a one-sentence reason.",
    'Output: {"rungs": [{"level": 4, "text": "..."}, {"level": 3, "text": "..."}, {"level": 2, "text": "<original>"}, {"level": 1, "text": "..."}], "suggestedLevel": 3, "reason": "..."}',
  ].join("\n"),
  questions: [
    "Pick at most 5 questions from the question bank (ids only) that the background does not answer yet and that most change how the plan splits. Prefer questions about the capability gaps.",
    "Do not ask what the background already tells; list those as skipped with the reason. Order by importance. For each chosen question, give why (one sentence) and, if the background suggests an answer, a guess with option values from that question only.",
    "The same goal kind and the same background must always give the same questions in the same order.",
    'Output: {"questions": [{"id": "R1", "why": "...", "guess": {"values": ["..."], "text": null} | null}], "skipped": [{"id": "R4", "reason": "..."}]}',
  ].join("\n"),
  firstDraft: [
    "Write the first plan for the goal from the confirmed premise, background and the industry landscape entries.",
    "diagnosis: 2–4 sentences. When a sentence uses a landscape entry, put its marker ①, ②, ... (the order of your citations list) in that sentence. STRICT: a sentence without a marker must not contain any digit at all (not even numbers from the premise such as user counts or hours; describe them in words instead). The conclusion must not contain digits either.",
    "conclusion: one sentence. flow: optional up to 3 cells {emoji, label, note}.",
    "steps: 3–6 steps, each with a title, doneCriteria (a countable state, not a date) and personTypeKeys (slot ids from personTypes, or \"event\").",
    "personTypes: one per template slot you keep (slot ids from the given slots only). shortLabelId must be one of that slot's shortNames ids. roleSituation: one sentence 'role × situation' (not a job title). allocation: keep EVERY template slot (never drop one) and copy the template allocations exactly; only if the premise clearly calls for it, move 5 points from one slot to another (at most 2 slots changed in total), so that all allocations plus the event allocation still total exactly 100 in multiples of 5. When unsure, keep the template allocations unchanged. targetCount 1–5. questions: exactly 3 things to ask. countRule, recognizeHints (up to 3), persona and opener (or null). introRoutes: only through given contact aliases, why without headcounts. primaryIndustryId: an industry id if obvious, else null.",
    "event: allocation and targetCount (1–10). citations: [{id, version}] of the entries you used, only from the given landscape. allocationReasons: one line per slot you changed.",
    'Every personType object must have ALL of these keys: {"slot": "<slot id>", "shortLabelId": "<one of that slot shortNames ids>", "roleSituation": "...", "allocation": 25, "targetCount": 3, "why": "...", "questions": ["...", "...", "..."], "countRule": "...", "recognizeHints": ["..."], "persona": null, "opener": null, "introRoutes": [{"viaAlias": "C1", "why": "..."}], "primaryIndustryId": null}. persona and opener may be strings.',
    'Every step object: {"title": "...", "doneCriteria": "...", "why": null, "personTypeKeys": ["<slot id>", "event"]}.',
    'Output: {"diagnosis": "...", "conclusion": "...", "flow": [], "steps": [...], "personTypes": [...], "event": {"allocation": 10, "targetCount": 2}, "citations": [{"id": "L-101", "version": 1}], "allocationReasons": []}',
  ].join("\n"),
  fix: [
    "The user asks for a change to the current plan. If the request fits the premise, apply it (for example rewrite a step's doneCriteria, rename or add a step, adjust allocations); apply only what the request needs and keep everything else exactly as it is.",
    "If no change is needed or the request conflicts with the premise, return the plan unchanged and explain in noChangeReason (one or two sentences).",
    "The revised plan follows the same rules as the first draft (short names from the dictionary, allocations multiples of 5 totalling 100, citations only from the given landscape, numbers only with markers), except that allocations may move freely.",
    'Output: {"revised": <the full plan in the same shape as the input "current">, "reasons": [{"path": "steps.1.doneCriteria", "reason": "..."}], "unchanged": ["short labels of what stayed the same"], "noChangeReason": null}',
  ].join("\n"),
} as const;

export function repairMessage(user: string, issues: readonly string[]): string {
  return `${user}\n\nYour previous answer was rejected for these reasons:\n- ${issues.join("\n- ")}\nFix them and answer again with the full JSON object.`;
}
