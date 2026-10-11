/**
 * R23 计划生成流程的 AI 接口（DESIGN §5.2 C1–C7）。一个接口两种实现：`mock.ts`（确定性，开发 / 测试 / 授权前）与
 * `deepseek.ts`（真实调用，按操作记账）。服务层只看这里的输入输出，失败降级也由服务层做。
 *
 * 联系人只以短期别名（C1…）出现在输入输出里；别名 → id 的映射留在服务层（DESIGN §5.1「id 不出境」）。
 */
import type { PlanCopyLanguage } from "../../../../shared/compute/plan-template-copy";
import type {
  PlanAiLimitKind,
  PlanCitation,
  PlanFlowCell,
  PlanGoalKind,
  PlanMemberRelation,
  PlanPremiseRow,
  PlanStance,
} from "../../../../shared/contract/plan-v2";
import type { IndustryIdCode } from "../../../../shared/contract/industries";

export interface PlanAiContext {
  actorId: string;
  language: PlanCopyLanguage;
  now: Date;
  /** 账本幂等键（DESIGN §5.2 每行的「幂等键」列）。 */
  ledgerKey: string;
}

/** 失败的种类：failed = 调用失败或输出两次都不合格；limit = 日 / 月上限；busy = 同键操作正在进行；disabled = 没有 AI。 */
export type PlanAiOutcome<T> =
  | { ok: true; value: T; operationId: string | null }
  | { ok: false; reason: "failed" | "limit" | "busy" | "disabled"; limit?: PlanAiLimitKind; retryOn?: string | null };

export interface PlanAiContact {
  alias: string;
  name: string;
  organization: string | null;
  role: string | null;
  tags: readonly string[];
  /** 面谈记录摘要（≤300 字）。 */
  notes: string | null;
  industry: string | null;
}

export interface GoalKindInput {
  text: string;
}

export interface BackgroundInput {
  goalText: string;
  goalKind: PlanGoalKind;
  profile: { name: string; headline: string | null };
  /** 标「共同創業者」等的联系人（≤5）。 */
  contacts: readonly PlanAiContact[];
  capabilities: readonly string[];
}

export interface LadderOutput {
  rungs: Array<{ level: number; text: string }>;
  suggestedLevel: number | null;
  reason: string | null;
}

export interface BackgroundOutput {
  stance: PlanStance | null;
  wants: string;
  /** `self` = 本人；其余是输入里的别名。 */
  members: Array<{ alias: string; capabilities: string[]; relation: PlanMemberRelation | null }>;
  ladder: LadderOutput;
}

export interface MembersInput {
  goalKind: PlanGoalKind;
  contacts: readonly PlanAiContact[];
  capabilities: readonly string[];
}

export interface MembersOutput {
  members: Array<{ alias: string; capabilities: string[]; basis: string }>;
}

export interface LadderInput {
  goalText: string;
  wants: string;
  team: string;
}

export interface QuestionBankItem {
  id: string;
  topic: string;
  prompt: string;
  type: "single" | "multi";
  options: Array<{ value: string; label: string }>;
}

export interface QuestionsInput {
  goalKind: PlanGoalKind;
  /** 确认后的背景摘要（含空き）。 */
  background: string;
  gaps: readonly string[];
  bank: readonly QuestionBankItem[];
}

export interface QuestionsOutput {
  questions: Array<{ id: string; why: string; guess: { values: string[]; text: string | null } | null }>;
  skipped: Array<{ id: string; reason: string }>;
}

export interface DraftSlotInfo {
  slot: string;
  allocation: number;
  targetCount: number;
  emoji: string;
  /** 可选的短名（id → 文字）。 */
  shortNames: Array<{ id: string; label: string }>;
}

export interface DraftLandscapeItem {
  id: string;
  version: number;
  title: string;
  summary: string;
}

export interface FirstDraftInput {
  goalText: string;
  goalKind: PlanGoalKind;
  purpose: string | null;
  premise: readonly PlanPremiseRow[];
  background: string;
  gaps: readonly string[];
  slots: readonly DraftSlotInfo[];
  eventSlot: { allocation: number; targetCount: number };
  landscape: readonly DraftLandscapeItem[];
  contacts: readonly PlanAiContact[];
}

/** 模型给出的方案（人物类型 key = 枠 id；紹介ルート用别名）。 */
export interface DraftOutput {
  diagnosis: string;
  conclusion: string;
  flow: PlanFlowCell[];
  steps: Array<{ title: string; doneCriteria: string; why: string | null; personTypeKeys: string[] }>;
  personTypes: Array<{
    slot: string;
    shortLabelId: string;
    roleSituation: string;
    allocation: number;
    targetCount: number;
    why: string;
    questions: string[];
    countRule: string;
    recognizeHints: string[];
    persona: string | null;
    opener: string | null;
    introRoutes: Array<{ viaAlias: string; why: string }>;
    primaryIndustryId: IndustryIdCode | null;
  }>;
  event: { allocation: number; targetCount: number };
  citations: PlanCitation[];
  allocationReasons: string[];
}

export interface FixInput {
  goalKind: PlanGoalKind;
  premise: readonly PlanPremiseRow[];
  current: DraftOutput;
  request: string;
  previousTurns: readonly string[];
  slots: readonly DraftSlotInfo[];
  landscape: readonly DraftLandscapeItem[];
  contacts: readonly PlanAiContact[];
}

export interface FixOutput {
  /** 改后的完整方案；不改时与输入相同。 */
  revised: DraftOutput;
  reasons: Array<{ path: string; reason: string }>;
  unchanged: string[];
  noChangeReason: string | null;
}

/**
 * R25（C8 / C10）的输入记录（复核 M4）：`id` 是这次调用的短别名（R1…，回来后由服务层换回真实记录 id），
 * `contact` 是联系人的短别名（C1…；没有联系人为 null）。`memo` = 面谈メモ摘要（≤200 字）。
 */
export interface PlanAiRecord {
  id: string;
  kind: "talked" | "event" | "step" | "memo";
  text: string;
  at: string;
  contact: string | null;
}

/** R25（C8）：見直し打开时预标可能变了的前提行。记录只用短别名 + 一行摘要（联系人只用别名）。 */
export interface ReviewMarksInput {
  goalKind: PlanGoalKind;
  premise: readonly PlanPremiseRow[];
  records: readonly PlanAiRecord[];
}

export interface ReviewMarksOutput {
  marks: Array<{ key: string; evidenceIds: string[]; suggested: string | null; reason: string | null }>;
}

/** R25（C9）：見直し修正案。规则同 C7，另加：配点不低于已得、已跳过类型不改配点。 */
export interface ReviewFixInput extends FixInput {
  /** 每个枠已得的 base 分（只读）。 */
  earned: Readonly<Record<string, number>>;
  skippedSlots: readonly string[];
}

/** R25（C10）：達成后的下一目标候选（≤2）。 */
export interface NextGoalsInput {
  goalText: string;
  goalKind: PlanGoalKind;
  summary: string;
  /** 计分记录 + 面谈メモ摘要（复核 M4：短别名，同 C8）。 */
  records: readonly PlanAiRecord[];
}

export interface NextGoalsOutput {
  candidates: Array<{ goalText: string; goalKind: PlanGoalKind; evidenceIds: string[] }>;
}

export interface PlanFlowAi {
  readonly id: "mock" | "deepseek";
  goalKind(input: GoalKindInput, context: PlanAiContext): Promise<PlanAiOutcome<{ goalKind: PlanGoalKind }>>;
  background(input: BackgroundInput, context: PlanAiContext): Promise<PlanAiOutcome<BackgroundOutput>>;
  members(input: MembersInput, context: PlanAiContext): Promise<PlanAiOutcome<MembersOutput>>;
  ladder(input: LadderInput, context: PlanAiContext): Promise<PlanAiOutcome<LadderOutput>>;
  questions(input: QuestionsInput, context: PlanAiContext): Promise<PlanAiOutcome<QuestionsOutput>>;
  firstDraft(input: FirstDraftInput, context: PlanAiContext): Promise<PlanAiOutcome<DraftOutput>>;
  fix(input: FixInput, context: PlanAiContext): Promise<PlanAiOutcome<FixOutput>>;
  reviewMarks(input: ReviewMarksInput, context: PlanAiContext): Promise<PlanAiOutcome<ReviewMarksOutput>>;
  reviewFix(input: ReviewFixInput, context: PlanAiContext): Promise<PlanAiOutcome<FixOutput>>;
  nextGoals(input: NextGoalsInput, context: PlanAiContext): Promise<PlanAiOutcome<NextGoalsOutput>>;
}
