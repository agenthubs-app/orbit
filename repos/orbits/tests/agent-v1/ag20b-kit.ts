/** agent-design AG20b test kit: a write part and the propose step's context over a memory world. */
import type { GraphPart } from "../../features/agent-v1/graph/state";
import type { ResolveContext } from "../../features/agent-v1/propose/resolve";
import type { recordAccessOf } from "./graph-kit";

export const ACTOR = "actor:a";
export const NOW = "2026-11-15T01:00:00.000Z";

export function partOf(message: string, quote: string, extra: Partial<GraphPart> = {}): GraphPart {
  const at = message.indexOf(quote);
  return {
    asked: 0, capabilities: ["todo.update"], continues: null, dependsOn: [], localId: "p1", origin: null,
    plan: { clarity: "clear", dataOwner: "self", dataSources: ["orbit_records"], deliverable: "change", hypothesis: false, intentBasis: "instruction", negation: false, persistence: "this_turn", readings: [] } as GraphPart["plan"],
    quote: [at, at + quote.length], reading: null, reason: null, refs: [], route: "propose_write", status: "unfinished", step: null, verdict: "accept" as GraphPart["verdict"], waitReason: null,
    ...extra,
  };
}

export function ctxOf(records: ReturnType<typeof recordAccessOf>, message: string, language: "zh" | "ja" | "en" = "zh"): ResolveContext {
  return { asOf: NOW, asked: new Map(), context: null, language, message, nameOf: () => null, people: [], records, scope: records.scope(ACTOR), timeZone: "Asia/Tokyo" };
}
