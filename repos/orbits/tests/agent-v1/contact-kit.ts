/**
 * agent-design AG12 test kit: contacts in the memory record source (the CON cases' base-v1 people), a memory contact
 * access over the same records (active and deleted), a card store that freezes contact items the way the ledger does,
 * and one turn of the graph with stubbed first and second layers.
 */
import { runAgentGraph, resumeAgentGraph, type AgentGraphResult } from "../../features/agent-v1/graph/build";
import type { AgentCardAccess } from "../../features/agent-v1/graph/deps";
import { buildCardOperationList, type CardOperationIntent } from "../../features/agent/runtime/card-operations";
import type { MemoryRecord } from "../../features/agent-v1/domains/source";
import { contactSnapshotOf } from "../../features/agent-v1/domains/contact/access";
import { boundContactReader, type ContactAccess } from "../../features/agent-v1/domains/contact/types";
import type { AgentActionPreviewContract } from "../../shared/contract/agent-v1";
import type { AgentSessionState } from "../../features/agent-v1/context/session-state";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { contact, memo, todo } from "./read-kit";
import { byNode } from "./functions-kit";

export const ACTOR = "actor:a";
export const NOW = "2026-11-15T01:00:00.000Z";

export function contactWorld(extra: (records: MemoryRecord[]) => void = () => undefined): { records: MemoryRecord[]; events: [] } {
  const records: MemoryRecord[] = [
    contact(ACTOR, "contact:c17", "小林健", { organization: "北辰软件", primaryEmail: "kobayashi@hokushin.example.test", primaryPhone: "+81-90-0000-0017", role: "销售总监" }),
    contact(ACTOR, "contact:c30", "田中浩", { organization: "东和商事", primaryEmail: "tanaka@towa.example.test", role: "采购主管", version: 3 }),
    contact(ACTOR, "contact:c31", "李薇", { organization: "自由职业", role: "摄影师" }),
    contact(ACTOR, "contact:c45", "佐藤健一", { organization: "青叶设计", role: "设计总监" }),
    contact(ACTOR, "contact:c46", "王强", { organization: "远帆物流", primaryEmail: "wang@yuanfan.example.test", role: "运营经理" }),
    contact(ACTOR, "contact:c50", "王强", { organization: "岚图机器人", role: "工程师" }),
    contact(ACTOR, "contact:c51", "王墙", { organization: "远帆物流", role: "司机" }),
    memo(ACTOR, "note:m40", "和李薇确认了样片的拍摄日期。", "2026-11-08T03:00:00.000Z", ["contact:c31"], { title: "李薇样片沟通" }),
    todo(ACTOR, "task:t45", "给李薇寄样片", { plannedDate: "2026-11-10", relatedContactId: "contact:c31" }),
    contact("user:b", "contact:cb1", "王强", { organization: "远帆物流" }),
  ];
  extra(records);
  return { events: [], records };
}

const liveOf = (record: MemoryRecord): LiveRecord<Record<string, unknown>> => ({
  collectionName: record.collection,
  createdAt: "2026-06-01T00:00:00.000Z",
  deletedAt: record.deleted ? String(record.payload.deletedAt ?? "2026-11-12T01:00:00.000Z") : null,
  evidenceIds: [],
  lifecycleState: record.deleted ? "deleted" : "active",
  payload: record.payload,
  recordId: record.id,
  searchText: record.searchText ?? "",
  sourceId: "s",
  sourceType: "manual",
  updatedAt: String(record.payload.updatedAt ?? "2026-06-10T05:00:00.000Z"),
  userId: record.userId,
  workspaceId: record.workspaceId,
});

export function memoryContactAccess(world: { records: MemoryRecord[] }, now = () => new Date(NOW)): ContactAccess {
  const contacts = (actorId: string) => world.records.filter((record) => record.collection === "contacts" && record.userId === actorId).map(liveOf);
  return {
    async findDeleted(actorId, words) {
      const floor = now().getTime() - 30 * 86_400_000;
      return contacts(actorId).filter((record) => record.lifecycleState === "deleted" && Date.parse(record.deletedAt!) > floor).map(contactSnapshotOf).filter((item) => item !== null && (words.includes(item.displayName) || item.displayName.includes(words))) as never;
    },
    async listActive(actorId) {
      return contacts(actorId).filter((record) => record.lifecycleState === "active");
    },
    async read(actorId, contactId, options = {}) {
      const record = contacts(actorId).find((item) => item.recordId === contactId);
      if (!record || (!options.includeDeleted && record.lifecycleState !== "active")) return null;
      return contactSnapshotOf(record);
    },
  };
}

/** A card store over the memory world: the ledger's freeze (to-dos and contacts read from the world). */
export function contactCards(world: { records: MemoryRecord[] }, access: ContactAccess) {
  const frozen: { intents: readonly CardOperationIntent[]; preview: AgentActionPreviewContract }[] = [];
  const reader = { async read() { return null; }, contacts: boundContactReader(access, ACTOR) };
  const cards: AgentCardAccess = {
    async freeze(input) {
      const built = await buildCardOperationList(reader, { actionId: `card:${input.requestId}`, intents: input.intents, locale: input.locale, revision: 1 });
      const preview = { actionId: `card:${input.requestId}`, operations: built.operations.map((op) => ({ ...op, text: op.preview })), payloadHash: "test", revision: 1, status: "awaiting_confirmation", title: "card" } as unknown as AgentActionPreviewContract;
      frozen.push({ intents: input.intents, preview });
      return preview;
    },
  };
  return { cards, frozen, reader };
}

export interface ContactRun {
  result: AgentGraphResult;
  resume(optionKey: string): Promise<AgentGraphResult>;
  events: Record<string, unknown>[];
  modelCalls: ModelCall[];
  frozen: ReturnType<typeof contactCards>["frozen"];
  /** AG20a: the session state the turn left (what the next turn's first layer sees). */
  state: AgentSessionState | null;
}

/** One turn: the first layer's parts and the second layer's operations (stubbed); the answer step answers from its materials. */
export async function runContact(message: string, understood: Record<string, unknown>[], operations: Record<string, unknown>[], options: { world?: ReturnType<typeof contactWorld>; language?: "zh" | "ja" | "en"; answer?: (call: ModelCall) => string } = {}): Promise<ContactRun> {
  const world = options.world ?? contactWorld();
  const model = deepseekStub(byNode({
    answer: options.answer ?? (() => json({ segments: [] })),
    propose: () => json({ operations }),
    understand: () => json({ language: options.language ?? "zh", parts: understood.map((item, index) => part({ localId: `p${index + 1}`, ...item })), plainChat: false }),
  }));
  const access = memoryContactAccess(world);
  const records = { ...recordAccessOf(world), contacts: access };
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  const card = contactCards(world, access);
  kit.deps.cards = card.cards;
  const input = kit.input(message, { locale: options.language ?? "zh" });
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, input);
    const resume = async (key: string) => {
      const set = result.clarifications[0];
      const option = set.options.find((item) => item.optionId === key || item.ref?.id === key);
      if (!option) throw new Error(`no option ${key} among ${set.options.map((item) => item.optionId).join(", ")}`);
      return resumeAgentGraph(kit.deps, input, { clarificationId: set.clarificationId, kind: "select", optionId: option.optionId });
    };
    return { events: trace.events, frozen: card.frozen, modelCalls: model.calls, result, resume, state: await kit.sessionState.get(input.actorId, input.sessionId) };
  } finally {
    trace.restore();
  }
}

export { json };
