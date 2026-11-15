/**
 * answer (main model): discussion answers without private material (agent-design AG03; answers that
 * cite records are AG05). When the first layer said plain chat and code agrees that every part is a
 * discussion, its reply is shown and no second call is made (设计稿 §3.3). Otherwise one call answers
 * the discussion parts (one repair if its output is unusable and the round has not repaired yet);
 * if the round's budget is used up they stay unfinished, saying why.
 */
import { callMainModel, type MainModelResult } from "../../models/main";
import { emitTrace } from "../../observability/trace";
import { settleDependencies } from "../../route/decide";
import { answerSystemPrompt, answerUserText } from "../../understand/prompt";
import { parseModelJson } from "../../understand/validate";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";

type Segments = { ok: true; segments: Map<string, string> } | { ok: false; error: string };

export function answerSegments(text: string, wanted: ReadonlySet<string>): Segments {
  const parsed = parseModelJson(text);
  if (parsed.ok === false) return { error: parsed.error, ok: false };
  const segments = (parsed.value as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(segments)) return { error: "segments must be a list", ok: false };
  const out = new Map<string, string>();
  for (const segment of segments) {
    const partId = typeof segment?.partId === "string" ? segment.partId : "";
    const answer = typeof segment?.text === "string" ? segment.text.trim() : "";
    if (wanted.has(partId) && answer) out.set(partId, answer);
  }
  const missing = [...wanted].filter((id) => !out.has(id));
  return missing.length ? { error: `no answer text for ${missing.join(", ")}`, ok: false } : { ok: true, segments: out };
}

export function answerNode({ deps, input, run }: NodeScope): GraphNode {
  return async (state: AgentGraphState) => {
    const parts: GraphPart[] = state.parts.map((part) => ({ ...part }));
    const due = parts.filter((part) => part.route === "answer" && part.status === "answered");
    if (!due.length) return {};
    if (state.plainChat && run.plainReply && parts.every((part) => part.route === "answer")) {
      run.answers.set(due[0].localId, run.plainReply);
      emitTrace({ note: "plain chat: the first layer's reply is shown, no second call", parts: due.map((part) => part.localId), type: "answer.plain_reply" });
      return {};
    }
    const budget = { ...state.budget };
    const understood = run.understood!;
    const items = due.map((part) => {
      const source = understood.parts.find((item) => item.localId === part.localId)!;
      return { constraints: source.constraints, goal: source.goal, partId: part.localId, quote: source.sourceQuote };
    });
    const wanted = new Set(items.map((item) => item.partId));
    const system = answerSystemPrompt(state.language);
    const user = answerUserText({ items, message: input.message });
    let repairs = state.repairs;
    let result: MainModelResult = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "first", requestId: input.requestId, system, user });
    let checked: Segments | null = result.ok === true ? answerSegments(result.text, wanted) : null;
    if (checked && checked.ok === false && repairs < 1) {
      repairs += 1;
      emitTrace({ error: checked.error, type: "answer.invalid" });
      result = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "repair", requestId: input.requestId, system, user: `${user}\n\nYour previous output could not be used (${checked.error}). Output the corrected JSON object only.` });
      checked = result.ok === true ? answerSegments(result.text, wanted) : null;
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
