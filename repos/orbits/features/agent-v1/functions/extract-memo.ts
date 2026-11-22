/**
 * One memo through both extractions (设计稿 §3.5 "两类都要时可在一次模型调用中按类型返回候选，两种校验分别执行"; agent-design
 * AG10): one main-model call for the kinds asked for (one repair when its output is unusable, inside the round's budget),
 * code's checks for each kind (extract-interactions.ts, extract-followups.ts), and one judgment request for every item
 * of both reviews. Each function that ran is traced as `fn.extractInteractions` / `fn.extractFollowUps`.
 */
import { askJudgment, type JudgmentAccess, type JudgmentBudget, type JudgmentOutcome } from "../judgment/ask";
import { callMainModel, type ModelBudget } from "../models/main";
import { emitTrace } from "../observability/trace";
import type { Sentence } from "../text/sentences";
import { dayWordsOf } from "./copy";
import { memoDayOf } from "./dates";
import { checkExtractOutput, EXTRACT_PROMPT_VERSION, extractSystemPrompt, extractUserText, sentencesOf, type LinkedContact, type MemoForExtraction } from "./extract";
import { extractInteractions, extractJudgmentInput, reviewInteractions, type InteractionResult } from "./extract-interactions";
import { extractFollowUps, reviewFollowUps, type FollowUpResult } from "./extract-followups";

export interface ExtractRequest {
  memo: MemoForExtraction;
  contacts: readonly LinkedContact[];
  want: { interactions: boolean; followUps: boolean };
  /** Contacts the user asked about (only these may be written). */
  focus: readonly string[];
  /** The user's words of the part (what they asked for). */
  quote: string;
  language: "zh" | "ja" | "en";
  timeZone: string;
  requestId: string;
  budget: ModelBudget;
  repairs: number;
  judgment: JudgmentAccess | null | undefined;
  judgmentBudget: JudgmentBudget;
  fetchImplementation?: typeof fetch;
}

export interface ExtractResult {
  ok: boolean;
  /** Why the extraction gave nothing (the model failed, the budget ran out). */
  failure: "budget" | "model_error" | "model_output_invalid" | null;
  sentences: Sentence[];
  interactions: InteractionResult[];
  followUps: FollowUpResult[];
  repairs: number;
  judgment: JudgmentOutcome | null;
}

/** The language a memo is written in (kana → ja; Han → zh; otherwise en), for the review's thresholds. */
export function memoLanguageOf(body: string): "zh" | "ja" | "en" {
  if (/[぀-ヿ]/u.test(body)) return "ja";
  if (/[一-鿿]/u.test(body)) return "zh";
  return "en";
}

export async function extractFromMemo(request: ExtractRequest): Promise<ExtractResult> {
  const { memo } = request;
  const sentences = sentencesOf(memo);
  const memoDay = memoDayOf(memo.createdAt, request.timeZone);
  const memoLanguage = memoLanguageOf(memo.body);
  const system = extractSystemPrompt();
  const user = extractUserText({ contacts: request.contacts, focus: request.quote, language: request.language, memo: { ...memo, day: dayWordsOf(memoDay, "en") }, memoDay, sentences, want: request.want });
  emitTrace({ memo: memo.ref, promptVersion: EXTRACT_PROMPT_VERSION, sentences: sentences.length, type: "functions.extract_prompt", version: memo.version, want: request.want });
  let repairs = request.repairs;
  let result = await callMainModel({ budget: request.budget, fetchImplementation: request.fetchImplementation, node: "functions", purpose: "first", requestId: request.requestId, system, user });
  // AG13 run-04 (AE-SCL-018): the prompt is small (~850 tokens in) but the model's reasoning sometimes runs past the 15 s
  // limit (6–9 s typical, measured over nine runs); a call that failed in a retryable way (timeout, 429, 5xx) is sent once more.
  if (result.ok === false && result.reason === "model_error" && result.retryable && repairs < 1) {
    repairs += 1;
    emitTrace({ type: "functions.extract_retry" });
    result = await callMainModel({ budget: request.budget, fetchImplementation: request.fetchImplementation, node: "functions", purpose: "retry", requestId: request.requestId, system, user });
  }
  let checked = result.ok ? checkExtractOutput(result.text, sentences, request.want) : null;
  if (result.ok && checked && checked.ok === false && repairs < 1) {
    repairs += 1;
    emitTrace({ error: checked.error, type: "functions.extract_invalid" });
    result = await callMainModel({ budget: request.budget, fetchImplementation: request.fetchImplementation, node: "functions", purpose: "repair", requestId: request.requestId, system, user: `${user}\n\nYour previous output could not be used (${checked.error}). Output the corrected JSON object only.` });
    checked = result.ok ? checkExtractOutput(result.text, sentences, request.want) : null;
  }
  if (!checked || checked.ok === false) {
    const failure = result.ok === false ? (result.reason === "budget" ? "budget" : "model_error") : "model_output_invalid";
    emitTrace({ failure, type: "functions.extract_failed" });
    return { failure, followUps: [], interactions: [], judgment: null, ok: false, repairs, sentences };
  }
  if (checked.value.dropped.length) emitTrace({ dropped: checked.value.dropped, type: "functions.extract_dropped" });
  const interactions = request.want.interactions ? extractInteractions(checked.value.interactions, { contacts: request.contacts, focus: request.focus, language: memoLanguage, memo, sentences, timeZone: request.timeZone }) : { items: [], results: [] };
  const followUps = request.want.followUps ? extractFollowUps(checked.value.followUps, { contacts: request.contacts, language: memoLanguage, memo, message: request.quote, sentences, timeZone: request.timeZone }) : { items: [], results: [] };
  const items = [...interactions.items, ...followUps.items];
  const outcome = items.length
    ? await askJudgment(request.judgment, request.judgmentBudget, { input: extractJudgmentInput(memoLanguage, { day: memoDay, title: memo.title }, sentences), items, language: memoLanguage, purpose: "extract", requestId: request.requestId })
    : null;
  const reviewedInteractions = reviewInteractions(interactions.results, outcome);
  const reviewedFollowUps = reviewFollowUps(followUps.results, outcome);
  if (request.want.interactions) {
    emitTrace({ candidates: reviewedInteractions.map((item) => ({ contact: item.contact?.id ?? null, key: item.key, occurredOn: item.occurredOn, reason: item.reason, sentenceIds: item.sentenceIds, writable: item.writable })), memo: memo.ref, type: "fn.extractInteractions", version: memo.version });
  }
  if (request.want.followUps) {
    emitTrace({ candidates: reviewedFollowUps.map((item) => ({ contact: item.contact?.id ?? null, dueDate: item.dueDate, key: item.key, owner: item.owner, plannedDate: item.plannedDate, sentenceIds: item.sentenceIds, writable: item.writable })), memo: memo.ref, type: "fn.extractFollowUps", version: memo.version });
  }
  return { failure: null, followUps: reviewedFollowUps, interactions: reviewedInteractions, judgment: outcome, ok: true, repairs, sentences };
}
