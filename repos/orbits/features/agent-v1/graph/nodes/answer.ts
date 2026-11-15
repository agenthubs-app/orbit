/**
 * answer (main model): discussion answers without private material (agent-design AG03; answers that
 * cite records are AG05). When the first layer said plain chat and code agrees that every part is a
 * discussion, its reply is shown and no second call is made (设计稿 §3.3). Otherwise one call answers
 * the discussion parts (one repair if its output is unusable and the round has not repaired yet);
 * if the round's budget is used up they stay unfinished, saying why.
 */
import { stripCardTalk } from "../../entry/approval-claims";
import { callMainModel, type MainModelResult } from "../../models/main";
import { emitTrace } from "../../observability/trace";
import { settleDependencies } from "../../route/decide";
import { answerSystemPrompt, answerUserText } from "../../understand/prompt";
import { parseModelJson } from "../../understand/validate";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";

type Segments = { ok: true; segments: Map<string, string> } | { ok: false; error: string };

/**
 * run-02 repair round 1: with no card in this turn, sentences about a confirmation card are dropped
 * (stripCardTalk, next to the approval-claim guard). An answer left empty by that is unusable: it gets
 * the round's one repair like any other unusable output.
 */
function withoutCardTalk(text: string, partId: string, enabled: boolean): string {
  if (!enabled) return text;
  const { dropped, text: kept } = stripCardTalk(text);
  if (dropped.length) emitTrace({ dropped, note: "this turn shows no card; a model sentence about a confirmation card is not delivered", partId, type: "model.card_talk_dropped" });
  return kept;
}

export function answerSegments(text: string, wanted: ReadonlySet<string>, dropCardTalk = false): Segments {
  const parsed = parseModelJson(text);
  if (parsed.ok === false) return { error: parsed.error, ok: false };
  const segments = (parsed.value as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(segments)) return { error: "segments must be a list", ok: false };
  const out = new Map<string, string>();
  const onlyCardTalk: string[] = [];
  for (const segment of segments) {
    const partId = typeof segment?.partId === "string" ? segment.partId : "";
    const raw = typeof segment?.text === "string" ? segment.text.trim() : "";
    const answer = raw ? withoutCardTalk(raw, partId, dropCardTalk) : "";
    if (raw && !answer) onlyCardTalk.push(partId);
    if (wanted.has(partId) && answer) out.set(partId, answer);
  }
  const missing = [...wanted].filter((id) => !out.has(id));
  if (!missing.length) return { ok: true, segments: out };
  const cardOnly = missing.filter((id) => onlyCardTalk.includes(id));
  return { error: cardOnly.length ? `the answer for ${cardOnly.join(", ")} only talks about a confirmation card, and this turn shows none; answer the item itself` : `no answer text for ${missing.join(", ")}`, ok: false };
}

export function answerNode({ deps, input, run }: NodeScope): GraphNode {
  return async (state: AgentGraphState) => {
    // AG04: resuming a paused request makes no model call (§3.9); its parts are written by code.
    if (state.touched !== null) return {};
    const parts: GraphPart[] = state.parts.map((part) => ({ ...part }));
    const due = parts.filter((part) => part.route === "answer" && part.status === "answered");
    if (!due.length) return {};
    const dropCardTalk = !run.cardPrepared;
    if (state.plainChat && run.plainReply && parts.every((part) => part.route === "answer")) {
      const reply = withoutCardTalk(run.plainReply, due[0].localId, dropCardTalk);
      if (reply) {
        run.answers.set(due[0].localId, reply);
        emitTrace({ note: "plain chat: the first layer's reply is shown, no second call", parts: due.map((part) => part.localId), type: "answer.plain_reply" });
        return {};
      }
      // Nothing left but card talk: the answer step writes it instead.
    }
    const budget = { ...state.budget };
    const understood = run.understood!;
    const items = due.map((part) => {
      const source = understood.parts.find((item) => item.localId === part.localId)!;
      return { constraints: source.constraints, goal: source.goal, partId: part.localId, quote: source.sourceQuote };
    });
    const wanted = new Set(items.map((item) => item.partId));
    const system = answerSystemPrompt(state.language);
    // §3.10: the same window the first layer saw — recent messages as text, long replies cut, none when idle.
    const conversation = (run.context?.messages ?? []).map((message) => ({ role: message.role, text: message.text }));
    const user = answerUserText({ conversation, items, message: input.message });
    let repairs = state.repairs;
    let result: MainModelResult = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "first", requestId: input.requestId, system, user });
    let checked: Segments | null = result.ok === true ? answerSegments(result.text, wanted, dropCardTalk) : null;
    if (checked && checked.ok === false && repairs < 1) {
      repairs += 1;
      emitTrace({ error: checked.error, type: "answer.invalid" });
      result = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "repair", requestId: input.requestId, system, user: `${user}\n\nYour previous output could not be used (${checked.error}). Output the corrected JSON object only.` });
      checked = result.ok === true ? answerSegments(result.text, wanted, dropCardTalk) : null;
    }
    for (const part of due) {
      if (checked && checked.ok === true) {
        run.answers.set(part.localId, checked.segments.get(part.localId)!);
        continue;
      }
      const budgetOut = result.ok === false && result.reason === "budget";
      part.status = budgetOut ? "unfinished" : "failed";
      part.reason = budgetOut ? "budget" : result.ok === true ? "model_output_invalid" : "model_error";
    }
    settleDependencies(parts);
    return { budget, parts, repairs };
  };
}
