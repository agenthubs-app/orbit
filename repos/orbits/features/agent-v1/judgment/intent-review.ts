/**
 * 写入意图复核 (设计稿 §3.11 "写入要有明确的指令", §3.8; agent-design AG08-5).
 *
 * When the first layer tags a part as a write but its words read like a statement, a question or a
 * hypothesis, or carry none of the registered write verbs, the judgment model is asked
 * `intent.explicitWrite` once. The review can only take a write away, never give one: "no", not sure,
 * below threshold or unavailable all make the part a statement — no card, nothing written, one registered
 * entry the user may click. A "yes" leaves the part to the AG04 rules (a hypothesis or a statement stays
 * conservative there). A part the user made by clicking an entry (intentBasis selection) is not reviewed.
 *
 * The trigger words follow features/orbit-ai/task-write-authorization.ts (its question, hypothesis and
 * negation words), copied here so that module stays as it is.
 */
import { capabilityKind, type Capability } from "../route/capabilities";
import type { Clarity, IntentBasis } from "../understand/schema";
import { askJudgment, type JudgmentAccess, type JudgmentBudget, type JudgmentVerdict } from "./ask";
import type { JudgmentLanguage } from "./questions";

/** Question and hypothesis words (task-write-authorization.ts:17, plus their Japanese). */
const QUESTION_OR_HYPOTHESIS = /[?？]|(?:谁|什么|是否|能否|能不能|可不可以|要不要|会不会|怎么|如何|为什么|如果|假如|假设|要是|万一)|(?:吗|麼|么)[。！!\s]*$|(?:もし|仮に|だろうか|でしょうか|かな|ますか|ですか)|\b(?:if|suppose|whether|what if|would|could|should|can i|do i)\b/iu;

/** A request worded politely as a question ("Can you push …?", "帮我…好吗"): still an instruction when it has a write verb. */
const POLITE_REQUEST = /^\s*(?:(?:can|could|would|will) you|please|请|麻烦|帮我|能不能帮我|能帮我|お願い|してもらえ|していただけ)/iu;

/** The registered ways of asking Orbit to add or change a record (zh, ja, en). */
const WRITE_VERBS = /(记一下|记下|记一笔|记到|记上|记录|帮我记|加到|加一条|加个|添加|新建|新增|创建|建一个|建个|改到|改成|改为|修改|更新|挪到|推到|延到|移到|调到|提前到|删掉|删除|去掉|标记|设为|设成|完成了|安排|写进|存进|存一下|登记|定在|定到|放到|排到|改在|关联|關聯|存成|保存|取消|勾掉|メモして|メモしておいて|記録して|記録しておいて|登録|追加|作成|変更|に変えて|ずらして|移して|延期|削除|消して|完了に|入れて|書いて|残して|紐づけ|キャンセル|にしてください|にしておいて|\b(?:add|create|make|log|record|note down|jot|change|move|push|update|delete|remove|mark|set|schedule|reschedule|put|save|write|link|cancel|complete)\b)/iu;

export interface ReviewInput {
  capabilities: readonly Capability[];
  clarity: Clarity;
  intentBasis: IntentBasis;
  negation: boolean;
  hypothesis: boolean;
  /** The part's words in this turn's message. */
  quote: string;
  /** It answers or accepts an open item (a question, an offered alternative): the user's earlier request goes on. */
  continues?: boolean;
  /** It depends on a write part of the same message (a date or a value for that request, "予定日は11月18日です"). */
  followsWrite?: boolean;
}

/** Whether the part's write tag is checked by the judgment model (code decides; never the model). */
export function needsIntentReview(part: ReviewInput): boolean {
  if (!part.capabilities.some((capability) => capabilityKind(capability) === "write")) return false;
  // A click is the user's own request; a negation or old context is conservative already, with no entry.
  if (part.intentBasis !== "instruction" || part.negation || part.continues || part.followsWrite) return false;
  // A part that asks first (an object or a value missing, several readings, nothing readable) is not a write yet: AG04 asks.
  if (part.clarity !== "clear" && part.clarity !== "statement") return false;
  if (part.clarity === "statement" || part.hypothesis || !WRITE_VERBS.test(part.quote)) return true;
  return QUESTION_OR_HYPOTHESIS.test(part.quote) && !POLITE_REQUEST.test(part.quote);
}

export interface ReviewResult {
  /** The judgment confirmed an explicit request to change a record. */
  explicit: boolean;
  verdict: JudgmentVerdict | null;
}

/** The text intent.explicitWrite is judged on (calibration uses the same). */
export function intentJudgmentInput(language: JudgmentLanguage, message: string): string[] {
  const label = language === "zh" ? "用户这一轮的话" : language === "ja" ? "ユーザーの今回の発言" : "The user's message";
  return [`${label}: ${message}`];
}

export const intentSubject = (quote: string) => `“${quote}”`;

export async function reviewWriteIntent(access: JudgmentAccess | null | undefined, budget: JudgmentBudget, input: { language: JudgmentLanguage; message: string; quote: string; requestId?: string }, options: { signal?: AbortSignal } = {}): Promise<ReviewResult> {
  const outcome = await askJudgment(access, budget, {
    input: intentJudgmentInput(input.language, input.message),
    items: [{ key: "m", question: "intent.explicitWrite", subject: intentSubject(input.quote) }],
    language: input.language,
    purpose: "intent",
    ...(input.requestId ? { requestId: input.requestId } : {}),
  }, options);
  const verdict = outcome.verdicts.get("m") ?? null;
  return { explicit: verdict?.answer === "yes" && !verdict.fallback, verdict };
}
