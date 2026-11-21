/**
 * Test kit for the AG03 graph: a DeepSeek-shaped model stub (no real host is ever called; the test
 * boundary would refuse it anyway), in-memory session state, a memory checkpointer and trace capture.
 */
import { MemorySaver } from "@langchain/langgraph";

import type { ContextMessage } from "../../features/agent-v1/context/build";
import { createMemoryAgentSessionStateStore, type AgentSessionState, type NamedRecordRef } from "../../features/agent-v1/context/session-state";
import type { AgentGraphDependencies, AgentGraphInput, AgentRecordAccess } from "../../features/agent-v1/graph/deps";
import { visibleRefs } from "../../features/agent-v1/domains/configured";
import { createDomainRegistry } from "../../features/agent-v1/domains/registry";
import { createMemoryRecordSource, type MemoryRecord } from "../../features/agent-v1/domains/source";
import type { CanonicalEventRecord } from "../../features/events/core/contract";

export interface ModelCall {
  node: string | null;
  system: string;
  user: string;
  body: Record<string, unknown>;
}

export type Reply = string | ((call: ModelCall, index: number) => string);

/** A fetch that answers like DeepSeek chat completions, one scripted reply per call. */
export function deepseekStub(replies: Reply[] | ((call: ModelCall, index: number) => string)) {
  process.env.DEEPSEEK_API_KEY ??= "test-key-not-real";
  const calls: ModelCall[] = [];
  const fetchImplementation = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const messages = (body.messages ?? []) as { role: string; content: string }[];
    const holder = globalThis as { __orbitAgentTraceContext?: { getStore(): { node?: string } | undefined } };
    const call: ModelCall = { body, node: holder.__orbitAgentTraceContext?.getStore()?.node ?? null, system: messages.find((m) => m.role === "system")?.content ?? "", user: messages.find((m) => m.role === "user")?.content ?? "" };
    const index = calls.length;
    calls.push(call);
    const reply = typeof replies === "function" ? replies(call, index) : replies[index];
    if (reply === undefined) throw new Error(`unexpected model call #${index + 1}`);
    const content = typeof reply === "function" ? reply(call, index) : reply;
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", index: 0, message: { content, role: "assistant" } }], model: body.model, usage: { completion_tokens: 10, prompt_tokens: 100 } }), { headers: { "content-type": "application/json" }, status: 200 });
  }) as typeof fetch;
  return { calls, fetchImplementation };
}

export function part(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    clarity: "clear",
    constraints: [],
    dataSources: [],
    deliverable: "answer",
    dependsOn: [],
    goal: "goal",
    intentBasis: "instruction",
    localId: "p1",
    objectClues: [],
    requiredCapabilities: [],
    sourceQuote: "",
    ...overrides,
  };
}

export const json = (value: unknown) => JSON.stringify(value);

export function captureTrace() {
  const events: Record<string, unknown>[] = [];
  const holder = globalThis as { __orbitAgentEval?: unknown };
  const previous = holder.__orbitAgentEval;
  const settings: Record<string, unknown> = {};
  holder.__orbitAgentEval = { emit: (event: Record<string, unknown>) => events.push(event), setting: (name: string) => settings[name] ?? null };
  return { events, restore: () => { holder.__orbitAgentEval = previous; }, settings };
}

export interface KitOptions {
  messages?: ContextMessage[];
  state?: AgentSessionState | null;
  references?: (NamedRecordRef & { accessible?: boolean })[];
  now?: string;
  modelCallLimit?: number;
  /** AG05: the records the graph reads (an empty account by default). */
  records?: AgentRecordAccess;
}

/** AG05: record access over a memory world (read-kit), scoped like the product's. */
export function recordAccessOf(world?: { records: MemoryRecord[]; events: CanonicalEventRecord[] }, options: { denied?: Set<string>; maxPages?: number } = {}): AgentRecordAccess & { source: ReturnType<typeof createMemoryRecordSource>; denied: Set<string> } {
  // Without a world (the AG03/AG04 tests), the records the context points at count as existing and every read finds nothing.
  const assumeVisible = !world;
  world ??= { events: [], records: [] };
  const source = createMemoryRecordSource(world.records);
  const denied = options.denied ?? new Set<string>();
  const events = { async byIds(ids: readonly string[]) { return world.events.filter((event) => ids.includes(event.eventId)); } };
  const reader = createDomainRegistry({ cursorKey: new Uint8Array(Buffer.from("agent-v1-graph-kit-cursor-key-0123456789")), denied: () => denied, events, now: () => "2026-11-15T01:00:00.000Z", source });
  return {
    denied,
    deniedReads: () => denied,
    listEvents: async () => world!.events,
    maxPages: options.maxPages ?? 5,
    reader,
    scope: (actorId) => ({ accountId: actorId, authorizationEpoch: "agent-v1:1", workspaceId: "workspace:test" }),
    source,
    visible: async (actorId, refs) => (assumeVisible ? new Set(refs.filter((ref) => !denied.has(ref.slice(ref.indexOf(":") + 1)))) : visibleRefs(source, { accountId: actorId, workspaceId: "workspace:test" }, refs, denied)),
  };
}

export function graphKit(fetchImplementation: typeof fetch, options: KitOptions = {}) {
  const sessionState = createMemoryAgentSessionStateStore();
  const checkpointer = new MemorySaver();
  const authorized: unknown[] = [];
  const loaded: string[] = [];
  const deps: AgentGraphDependencies = {
    async authorizeReferences(actorId, references) {
      authorized.push({ actorId, references });
      return options.references ?? [];
    },
    checkpointer,
    fetchImplementation,
    async loadMessages(sessionId) {
      loaded.push(sessionId);
      return options.messages ?? [];
    },
    now: () => options.now ?? "2026-11-15T10:00:00.000Z",
    records: options.records ?? recordAccessOf(),
    sessionState,
    ...(options.modelCallLimit !== undefined ? { modelCallLimit: options.modelCallLimit } : {}),
  };
  const seeded = options.state ? sessionState.put("actor:a", options.state) : Promise.resolve();
  const input = (message: string, extra: Partial<AgentGraphInput> = {}): AgentGraphInput => ({ actorId: "actor:a", cardPrepared: false, locale: "zh", message, references: [], requestId: `agreq_${Math.random().toString(16).slice(2)}`, sessionId: "session:a", ...extra });
  return { authorized, checkpointer, deps, input, loaded, seeded, sessionState };
}
