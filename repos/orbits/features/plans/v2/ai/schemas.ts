/**
 * R23 C1–C7 的输出 schema（zod，未知字段丢弃）与业务校验（DESIGN §5.2「校验」列）。
 * 真实实现对每个模型输出调用 `check*`；不合格 → 同一操作内修复重试 1 次 → 仍不合格按失败降级。
 * mock 的输出在测试里也过同一组校验。
 */
import { z } from "zod";

import { PLAN_GOAL_KINDS, PLAN_QUESTION_LIMIT } from "../../../../shared/compute/plan-templates";
import { isIndustryIdCode } from "../../../../shared/domain/industries";
import { checkDraftContent, disallowedChangeIssues, type ContentCheckInput } from "../validate-content";
import type {
  BackgroundInput,
  BackgroundOutput,
  DraftOutput,
  FixOutput,
  LadderOutput,
  MembersInput,
  MembersOutput,
  QuestionsInput,
  QuestionsOutput,
} from "./types";

export type Checked<T> = { ok: true; value: T } | { ok: false; issues: string[] };

const text = (max: number) => z.string().trim().max(max);
const stance = z.enum(["owner", "cofounder", "employee", "individual"]).nullable().catch(null);
const relation = z.enum(["cofounder", "employee", "contractor", "advisor"]).nullable().catch(null);

const ladderSchema = z.object({
  rungs: z.array(z.object({ level: z.number().int(), text: text(200) })).max(4),
  suggestedLevel: z.number().int().nullable(),
  reason: text(300).nullable().catch(null),
});

function zodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
}

function parse<T>(schema: z.ZodType<T>, raw: unknown): Checked<T> {
  const result = schema.safeParse(raw);
  return result.success ? { ok: true, value: result.data } : { ok: false, issues: zodIssues(result.error) };
}

/** C1：6 类之一。 */
export function checkGoalKind(raw: unknown): Checked<{ goalKind: (typeof PLAN_GOAL_KINDS)[number] }> {
  return parse(z.object({ goalKind: z.enum(PLAN_GOAL_KINDS) }), raw);
}

/** 阶梯：4 级、各 1 次；第 2 级固定为原文（服务端覆盖，不靠模型）；建议级 ∈ 1–4。 */
export function checkLadder(raw: unknown, goalText: string): Checked<LadderOutput> {
  const parsed = parse(ladderSchema, raw);
  if (parsed.ok === false) return { issues: parsed.issues, ok: false };
  const levels = parsed.value.rungs.map((rung) => rung.level).sort();
  if (levels.join(",") !== "1,2,3,4") return { issues: ["ladder: levels must be 1–4, once each"], ok: false };
  if (parsed.value.rungs.some((rung) => rung.level !== 2 && !rung.text)) return { issues: ["ladder: empty rung"], ok: false };
  const suggested = parsed.value.suggestedLevel;
  if (suggested !== null && (suggested < 1 || suggested > 4)) return { issues: ["ladder: suggested level 1–4"], ok: false };
  const rungs = parsed.value.rungs.map((rung) => (rung.level === 2 ? { level: 2, text: goalText } : rung)).sort((a, b) => b.level - a.level);
  return { ok: true, value: { reason: parsed.value.reason ?? null, rungs: rungs as LadderOutput["rungs"], suggestedLevel: suggested ?? null } };
}

/** C2：能力 id ∈ 8 项；别名 ∈ 输入（不在的整条丢弃）；阶梯同 C4。 */
export function checkBackground(raw: unknown, input: BackgroundInput): Checked<BackgroundOutput> {
  const parsed = parse(z.object({
    stance,
    wants: text(300),
    members: z.array(z.object({ alias: z.string(), capabilities: z.array(z.string()).max(20), relation })).max(12),
    ladder: z.unknown(),
  }), raw);
  if (parsed.ok === false) return { issues: parsed.issues, ok: false };
  const ladder = checkLadder(parsed.value.ladder, input.goalText);
  if (ladder.ok === false) return { issues: ladder.issues, ok: false };
  const aliases = new Set(["self", ...input.contacts.map((contact) => contact.alias)]);
  const capabilities = new Set(input.capabilities);
  const issues = parsed.value.members.flatMap((member) => member.capabilities.filter((id) => !capabilities.has(id)).map((id) => `members: unknown capability ${id}`));
  if (issues.length > 0) return { issues, ok: false };
  if (!parsed.value.wants) return { issues: ["wants: empty"], ok: false };
  const members = parsed.value.members.filter((member) => aliases.has(member.alias)) as BackgroundOutput["members"];
  return { ok: true, value: { ladder: ladder.value, members, stance: parsed.value.stance ?? null, wants: parsed.value.wants } };
}

/** C3：能力 id ∈ 8 项；别名 ∈ 输入。 */
export function checkMembers(raw: unknown, input: MembersInput): Checked<MembersOutput> {
  const parsed = parse(z.object({ members: z.array(z.object({ alias: z.string(), capabilities: z.array(z.string()).max(20), basis: text(200).catch("") })).max(10) }), raw);
  if (parsed.ok === false) return { issues: parsed.issues, ok: false };
  const capabilities = new Set(input.capabilities);
  const issues = parsed.value.members.flatMap((member) => member.capabilities.filter((id) => !capabilities.has(id)).map((id) => `unknown capability ${id}`));
  if (issues.length > 0) return { issues, ok: false };
  const aliases = new Set(input.contacts.map((contact) => contact.alias));
  return { ok: true, value: { members: parsed.value.members.filter((member) => aliases.has(member.alias)) as MembersOutput["members"] } };
}

/** C5：题 id ∈ 题库该类；≤5；无重复；推测值 ∈ 选项。 */
export function checkQuestions(raw: unknown, input: QuestionsInput): Checked<QuestionsOutput> {
  const parsed = parse(z.object({
    questions: z.array(z.object({
      id: z.string(),
      why: text(300),
      guess: z.object({ values: z.array(z.string()).max(8), text: text(300).nullable().catch(null) }).nullable().catch(null),
    })).max(8),
    skipped: z.array(z.object({ id: z.string(), reason: text(300) })).max(10).catch([]),
  }), raw);
  if (parsed.ok === false) return { issues: parsed.issues, ok: false };
  const bank = new Map(input.bank.map((item) => [item.id, item]));
  const issues: string[] = [];
  if (parsed.value.questions.length === 0 || parsed.value.questions.length > PLAN_QUESTION_LIMIT) issues.push("questions: 1–5");
  const ids = parsed.value.questions.map((question) => question.id);
  if (new Set(ids).size !== ids.length) issues.push("questions: duplicated id");
  for (const question of parsed.value.questions) {
    const item = bank.get(question.id);
    if (!item) {
      issues.push(`questions: ${question.id} is not in the bank`);
      continue;
    }
    const options = new Set(item.options.map((option) => option.value));
    if (question.guess?.values.some((value) => !options.has(value))) issues.push(`questions: ${question.id} guess is not an option`);
    if (item.type === "single" && (question.guess?.values.length ?? 0) > 1) issues.push(`questions: ${question.id} single choice`);
  }
  if (issues.length > 0) return { issues, ok: false };
  return { ok: true, value: { questions: parsed.value.questions as QuestionsOutput["questions"], skipped: parsed.value.skipped.filter((item) => bank.has(item.id) && !ids.includes(item.id)) } };
}

const flowCell = z.object({ emoji: text(8), label: text(40), note: text(80) });
const draftSchema = z.object({
  diagnosis: text(1200).pipe(z.string().min(1)),
  conclusion: text(400).pipe(z.string().min(1)),
  flow: z.array(flowCell).max(4).catch([]),
  steps: z.array(z.object({
    title: text(120).pipe(z.string().min(1)),
    doneCriteria: text(300),
    why: text(300).nullable().catch(null),
    personTypeKeys: z.array(z.string()).max(10),
  })).max(10),
  personTypes: z.array(z.object({
    slot: z.string(),
    shortLabelId: z.string(),
    roleSituation: text(200).pipe(z.string().min(1)),
    allocation: z.number().int(),
    targetCount: z.number().int(),
    why: text(400),
    questions: z.array(text(200)).max(5),
    countRule: text(200),
    recognizeHints: z.array(text(120)).max(5).catch([]),
    persona: text(300).nullable().catch(null),
    opener: text(300).nullable().catch(null),
    introRoutes: z.array(z.object({ viaAlias: z.string(), why: text(200) })).max(5).catch([]),
    primaryIndustryId: z.string().nullable().catch(null).transform((value) => (value && isIndustryIdCode(value) ? value : null)),
  })).max(10),
  event: z.object({ allocation: z.number().int(), targetCount: z.number().int() }),
  citations: z.array(z.object({ id: z.string(), version: z.number().int() })).max(12),
  allocationReasons: z.array(text(200)).max(5).catch([]),
});

/** C6：方案结构 + `checkDraftContent`（短名、配点、模板 ±5、引用、①②、紹介ルート）。 */
export function checkDraft(raw: unknown, input: ContentCheckInput): Checked<DraftOutput> {
  const parsed = parse(draftSchema as z.ZodType<DraftOutput>, raw);
  if (parsed.ok === false) return { issues: parsed.issues, ok: false };
  const issues = checkDraftContent(parsed.value, input);
  return issues.length > 0 ? { issues, ok: false } : { ok: true, value: parsed.value };
}

/** C7：改后的完整方案 + 改动理由；方案本身按 C6 的规则（不限模板 ±5）。 */
export function checkFix(raw: unknown, input: ContentCheckInput, current?: DraftOutput): Checked<FixOutput> {
  const parsed = parse(z.object({
    revised: z.unknown(),
    reasons: z.array(z.object({ path: z.string(), reason: text(300) })).max(20).catch([]),
    unchanged: z.array(text(120)).max(10).catch([]),
    noChangeReason: text(500).nullable().catch(null),
  }), raw);
  if (parsed.ok === false) return { issues: parsed.issues, ok: false };
  const revised = checkDraft(parsed.value.revised, { ...input, enforceTemplate: false });
  if (revised.ok === false) return { issues: revised.issues, ok: false };
  const disallowed = current ? disallowedChangeIssues(current, revised.value) : [];
  if (disallowed.length > 0) return { issues: disallowed, ok: false };
  return { ok: true, value: { noChangeReason: parsed.value.noChangeReason ?? null, reasons: (parsed.value.reasons ?? []) as FixOutput["reasons"], revised: revised.value, unchanged: parsed.value.unchanged ?? [] } };
}
