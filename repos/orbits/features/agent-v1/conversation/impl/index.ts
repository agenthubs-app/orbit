// @ts-nocheck -- conversation/impl/index.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/impl/index.ts
// (lab commit c8717763a, r07 accepted). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * The implementation the RSI loop improves (RSI-BRIEF.md). One engine (engine.ts) holds the in-session memory; the
 * session feeds it message by message, and each pure function replays the transcript it is given through a fresh
 * engine and reads off its part of the analysis of the final message.
 */
import type { Conversation, FunctionInput, HistoryEntry, LabWorld, PartResult, Session } from "../types";
import { Engine, clarificationBudget } from "./engine";

function replay(input: FunctionInput, world: LabWorld): Engine {
  const e = new Engine(world, input.account, input.history[0]?.at ?? input.at);
  for (const h of input.history as HistoryEntry[]) {
    if (h.role === "agent") e.reply(h);
    else e.analyse(h.text, h.at, h.hint, []).commit();
  }
  return e;
}

const firstNew = (parts: PartResult[]) => parts.find((p) => !p.continues) ?? parts[0];

const impl: Conversation = {
  startSession(world, account, startedAt): Session {
    const e = new Engine(world, account, startedAt);
    return {
      turn(input) {
        const a = e.analyse(input.message, input.at, input.hint, input.gone);
        a.commit();
        return a.result;
      },
      reply(answer) { e.reply(answer); },
    };
  },
  resolveReference(input, world) {
    const e = replay(input, world);
    const said = input.said;
    const hp = input.hint?.parts ?? [];
    const quotes = hp.length && hp.every((p) => input.message.includes(p.quote)) ? hp.map((p) => p.quote) : [input.message];
    const hint = { parts: (input.hint?.parts ?? []).map((p) => ({ ...p, refs: p.refs?.some((r) => r.said === said) ? p.refs : [...(p.refs ?? []), { said }] })) };
    const parts = quotes.length ? quotes : [input.message];
    const withSaid = parts.findIndex((q) => q.includes(said));
    const forced = hint.parts.length ? hint : { parts: [{ quote: input.message, refs: [{ said }] }] };
    const res = e.analyse(input.message, input.at, forced, input.gone, parts).result;
    const part = res.parts[withSaid >= 0 ? withSaid : 0];
    const r = part?.refs.find((x) => x.said === said) ?? part?.refs[0];
    return r ?? { said, outcome: "none" };
  },
  attributeReply(input, world) {
    const e = replay(input, world);
    return e.analyse(input.message, input.at, input.hint, input.gone, input.parts).result.parts.map((p) => p.continues);
  },
  pickOptionFromReply(input, world) {
    const e = replay(input, world);
    const res = e.analyse(input.message, input.at, input.hint, input.gone, [input.message]).result;
    const p = res.parts.find((x) => x.continues === input.question);
    if (p?.pick) return p.pick;
    return e.pickFor(input.message, input.at, input.hint, input.gone, input.question);
  },
  classifyFollowUp(input, world) {
    const e = replay(input, world);
    const res = e.analyse(input.message, input.at, input.hint, input.gone).result;
    return firstNew(res.parts).followUp ?? "new";
  },
  carryOverSlots(input, world) {
    const e = replay(input, world);
    const res = e.analyse(input.message, input.at, input.hint, input.gone).result;
    return firstNew(res.parts).request ?? {};
  },
  clarificationBudget,
};

export default impl;
