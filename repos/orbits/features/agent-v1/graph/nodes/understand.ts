/**
 * understand (main model): the first layer (设计稿附录 C). One call; if the output does not pass the
 * checks, one repair call that is told what was wrong (§3.3). Each call first checks the round's
 * budget (models/main.ts). Still invalid after the repair: nothing is made up, deliver says so.
 */
import { callMainModel, type MainModelResult } from "../../models/main";
import { emitTrace } from "../../observability/trace";
import { repairUserText, understandSystemPrompt, understandUserText, UNDERSTAND_PROMPT_VERSION } from "../../understand/prompt";
import type { UnderstandOutput } from "../../understand/schema";
import { parseModelJson, validateUnderstandOutput, type UnderstandValidationInput } from "../../understand/validate";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";

function graphPartsOf(output: UnderstandOutput, scope: NodeScope): GraphPart[] {
  const context = scope.run.context!;
  return output.parts.map((part) => {
    const start = scope.input.message.indexOf(part.sourceQuote);
    const continued = part.continues ? context.openItemHandles.get(part.continues.ref) ?? null : null;
    return {
      capabilities: [...part.requiredCapabilities],
      continues: part.continues && continued ? { kind: part.continues.kind, ref: continued.ref } : null,
      dependsOn: [...part.dependsOn],
      localId: part.localId,
      quote: [start, start + part.sourceQuote.length],
      reason: null,
      refs: part.objectClues.map((clue) => ({ entity: clue.entity, recordId: clue.referenceId ? context.handles.get(clue.referenceId)?.id ?? null : null })),
      route: null,
      status: "unfinished",
      verdict: null,
      waitReason: null,
    } satisfies GraphPart;
  });
}

type Checked = { ok: true; output: UnderstandOutput; dropped: string[] } | { ok: false; errors: string[] };

function check(text: string, input: UnderstandValidationInput): Checked {
  const parsed = parseModelJson(text);
  if (parsed.ok === false) return { errors: [parsed.error], ok: false };
  return validateUnderstandOutput(parsed.value, input);
}

const failedUnderstanding = (result: Extract<MainModelResult, { ok: false }>) => (result.reason === "budget" ? "budget" as const : "model_error" as const);

export function understandNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const context = run.context!;
    const budget = { ...state.budget };
    const validation: UnderstandValidationInput = { handles: new Set(context.handles.keys()), message: input.message, openItemRefs: new Set(context.openItemHandles.keys()) };
    const system = understandSystemPrompt();
    const user = understandUserText({ contextText: context.promptText, message: input.message });
    emitTrace({ contextMessages: context.messages.length, promptVersion: UNDERSTAND_PROMPT_VERSION, type: "understand.prompt" });
    let repairs = state.repairs;
    let first = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "understand", purpose: "first", requestId: input.requestId, system, user });
    if (first.ok === false && first.reason === "model_error" && first.retryable && repairs < 1) {
      // A failed call (timeout, 429, 5xx) gets the round's one second chance, inside the same budget.
      repairs += 1;
      first = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "understand", purpose: "retry", requestId: input.requestId, system, user });
    }
    if (first.ok === false) return { budget, repairs, understanding: failedUnderstanding(first) };
    let checked = check(first.text, validation);
    if (checked.ok === false) {
      emitTrace({ errors: checked.errors, purpose: "first", type: "understand.invalid" });
      if (repairs >= 1) return { budget, repairs, understanding: "invalid" };
      repairs += 1;
      const repair = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "understand", purpose: "repair", requestId: input.requestId, system, user: repairUserText({ contextText: context.promptText, errors: checked.errors, message: input.message, previousOutput: first.text }) });
      if (repair.ok === false) return { budget, repairs, understanding: failedUnderstanding(repair) };
      checked = check(repair.text, validation);
      if (checked.ok === false) {
        emitTrace({ errors: checked.errors, purpose: "repair", type: "understand.invalid" });
        return { budget, repairs, understanding: "invalid" };
      }
    }
    if (checked.dropped.length) emitTrace({ dropped: checked.dropped, note: "verdict, route and waitReason are decided by code; the model's values are dropped", type: "understand.fields_dropped" });
    run.understood = checked.output;
    run.plainReply = checked.output.plainChat ? checked.output.reply ?? null : null;
    return { budget, parts: graphPartsOf(checked.output, scope), plainChat: checked.output.plainChat, repairs, understanding: "understood" };
  };
}
