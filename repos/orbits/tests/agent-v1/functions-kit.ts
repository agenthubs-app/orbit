/**
 * agent-design AG10 test kit: the small world of the FN cases (base-v1) in the memory record source — events E101–E107
 * with their fee and topics as the host stores them, memos M32/M36/M38/M39/M90/M91, the contacts they link, to-dos and a
 * formal follow-up — plus a graph run with stubbed model nodes and a stubbed judgment (no real host is called).
 */
import { MemorySaver } from "@langchain/langgraph";

import { runAgentGraph, type AgentGraphResult } from "../../features/agent-v1/graph/build";
import type { AgentCardAccess } from "../../features/agent-v1/graph/deps";
import type { AgentMemory, AgentMemorySnapshot } from "../../features/agent/memory/contract";
import { normalizeAgentMemory } from "../../features/agent/memory/service";
import { buildCardOperationList, type CardOperationIntent } from "../../features/agent/runtime/card-operations";
import type { MemoryRecord } from "../../features/agent-v1/domains/source";
import type { CanonicalEventRecord } from "../../features/events/core/contract";
import type { AgentActionPreviewContract } from "../../shared/contract/agent-v1";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { access, judgeStub, type Answerer, TEST_THRESHOLDS } from "./judgment-kit";
import { contact, memo, platformEvent, todo } from "./read-kit";

export const ACTOR = "actor:a";
export const NOW = "2026-11-15T01:00:00.000Z";

const event = (id: string, title: string, startsAt: string | null, venue: string, topics: string, fee: { feeKind?: string; feeAmountYen?: number }, extra: Partial<CanonicalEventRecord> = {}) =>
  platformEvent(`event:${id}`, title, startsAt ?? "2027-12-31T09:00:00.000Z", venue, { description: `主题：${topics}`, sourcePayload: { host: fee }, ...(startsAt ? {} : { lifecycleState: "draft" as CanonicalEventRecord["lifecycleState"], organizerActorId: ACTOR }), ...extra });

export function fnWorld(): { records: MemoryRecord[]; events: CanonicalEventRecord[] } {
  return {
    events: [
      event("e101", "东京街头摄影展", "2026-11-21T01:00:00.000Z", "涩谷", "摄影", { feeKind: "free" }),
      event("e102", "街拍工作坊", "2026-11-22T00:30:00.000Z", "下北泽", "摄影、街拍", { feeAmountYen: 3000, feeKind: "amount" }),
      // As the seed stores it: published with the host payload's default fee kind, the description saying 未标价.
      event("e103", "SaaS 定价研讨会", "2026-11-19T10:00:00.000Z", "丸之内", "定价、SaaS\n费用：未标价", { feeKind: "free" }),
      event("e104", "设计师之夜", "2026-11-21T10:00:00.000Z", "中目黑", "设计", { feeAmountYen: 2000, feeKind: "amount" }),
      event("e105", "独立出版市集", "2026-11-22T01:00:00.000Z", "神保町", "出版", { feeKind: "free" }),
      // E106: no start time yet (the account's own draft, so it may see it).
      event("e106", "AI 产品沙龙", null, "待定", "AI", {}),
      event("e107", "东京摄影展·冬季场", "2026-11-29T01:00:00.000Z", "上野", "摄影", { feeAmountYen: 1500, feeKind: "amount" }),
      // Another organizer's draft: never readable.
      platformEvent("event:other-draft", "别人的草稿活动", "2026-11-21T02:00:00.000Z", "未定", { description: "主题：摄影", lifecycleState: "draft" as CanonicalEventRecord["lifecycleState"] }),
    ],
    records: [
      contact(ACTOR, "contact:c17", "小林健", { organization: "北辰软件", role: "销售总监" }),
      contact(ACTOR, "contact:c21", "陈一鸣", { organization: "北辰软件", role: "法务" }),
      contact(ACTOR, "contact:c30", "田中浩", { organization: "东和商事", role: "采购主管" }),
      contact(ACTOR, "contact:c31", "李薇", { organization: "自由职业", role: "摄影师" }),
      contact(ACTOR, "contact:c40", "Emily Carter", { organization: "Harbor Analytics", role: "Product Manager" }),
      contact(ACTOR, "contact:c41", "山本直子", { organization: "山手出版", role: "編集者" }),
      contact(ACTOR, "contact:c45", "佐藤健一", { organization: "青叶设计", role: "设计总监" }),
      contact(ACTOR, "contact:c46", "王强", { organization: "远帆物流", role: "运营经理" }),
      memo(ACTOR, "note:m32", "11 月 10 日小林给我打电话，说小陈在审核。我答应 11 月 13 日给小林发报价。", "2026-11-10T11:00:00.000Z", ["contact:c17", "contact:c21"], { title: "11 月 10 日笔记" }),
      memo(ACTOR, "note:m36", "最近想多看摄影展和街拍活动，也想认识做独立出版的人。", "2026-11-01T12:00:00.000Z", [], { title: "兴趣笔记" }),
      memo(ACTOR, "note:m38", "山本さんと打ち合わせ。来月の特集について、原稿は12月5日までに送ると約束した。", "2026-11-09T06:00:00.000Z", ["contact:c41"], { title: "山本さん打ち合わせメモ" }),
      memo(ACTOR, "note:m39", "Call with Emily. She will send the dashboard spec by Friday. I should think about whether to join their beta.", "2026-11-13T00:00:00.000Z", ["contact:c40"], { title: "Call with Emily" }),
      memo(ACTOR, "note:m90", "听同事说，田中前天和王强通过电话。佐藤那边我打算下周再联系。", "2026-11-14T12:00:00.000Z", ["contact:c30", "contact:c45", "contact:c46"], { title: "同事转述" }),
      memo(ACTOR, "note:m91", "和王强通了电话。我答应 11 月 20 日把合同草稿发给他，发票最迟 11 月 25 日补齐。", "2026-11-14T08:00:00.000Z", ["contact:c46"], { title: "王强通话" }),
      todo(ACTOR, "task:t42", "给小林发修订报价", { plannedDate: "2026-11-18", relatedContactId: "contact:c17", source: "manual" }),
      todo(ACTOR, "task:t44", "回复田中的询价", { dueAt: "2026-11-17T09:00:00.000Z", relatedContactId: "contact:c30", source: "manual" }),
      todo(ACTOR, "task:t45", "给李薇寄样片", { plannedDate: "2026-11-10", relatedContactId: "contact:c31", source: "manual" }),
      todo(ACTOR, "task:f1", "跟进田中的分期方案", { dueAt: "2026-11-14T09:00:00.000Z", relatedContactId: "contact:c30", source: "contact" }),
      todo(ACTOR, "task:t46", "整理十月发票", { completedAt: "2026-11-03T01:00:00.000Z", status: "completed" }),
      // Account B: never in A's results.
      contact("user:b", "contact:cb1", "小林诚", { organization: "乙方客户公司" }),
      memo("user:b", "note:mb1", "乙的客户笔记：小林诚要求年底前降价 15%。", "2026-11-12T01:00:00.000Z", ["contact:cb1"]),
    ],
  };
}

/** A card store that freezes intents the way the ledger does (its preview), and keeps them for the test. */
export function cardKit(world: { records: MemoryRecord[] }) {
  const frozen: { intents: readonly CardOperationIntent[]; preview: AgentActionPreviewContract }[] = [];
  const cards: AgentCardAccess = {
    async freeze(input) {
      const reader = { async read(id: string) { const row = world.records.find((record) => record.id === id && record.collection === "tasks"); const task = row?.payload.task as Record<string, unknown> | undefined; return task ? { dueAt: (task.dueAt as string) ?? null, plannedDate: (task.plannedDate as string) ?? null, status: String(task.status), title: String(task.title), updatedAt: String(task.updatedAt) } : null; } };
      const built = await buildCardOperationList(reader, { actionId: `card:${input.requestId}`, intents: input.intents, locale: input.locale, revision: 1 });
      const preview = { actionId: `card:${input.requestId}`, operations: built.operations.map((op) => ({ ...op })), payloadHash: "test", revision: 1, status: "pending", title: "card" } as unknown as AgentActionPreviewContract;
      frozen.push({ intents: input.intents, preview });
      return preview;
    },
  };
  return { cards, frozen };
}

export const byNode = (replies: Record<string, (call: ModelCall) => string>) => (call: ModelCall) => {
  const reply = replies[call.node ?? ""];
  if (!reply) throw new Error(`unexpected model call in ${call.node}`);
  return reply(call);
};

export interface FnRun {
  result: AgentGraphResult;
  events: Record<string, unknown>[];
  modelCalls: ModelCall[];
  judgeCalls: ReturnType<typeof judgeStub>["calls"];
  frozen: ReturnType<typeof cardKit>["frozen"];
}

/** One turn: the first layer's parts, the extraction's output (node "functions"), the judgment's answers. */
/** A saved entry as a test writes it (the rest gets the stored defaults). */
export type TestMemory = { id: string; category: string; content: string } & Partial<Pick<AgentMemory, "appliesTo" | "structured" | "revision" | "validFrom" | "validUntil" | "sourceMessageRef">>;

export function memorySnapshotOf(memories: readonly TestMemory[], settings: Partial<AgentMemorySnapshot["settings"]> = {}, marks: AgentMemorySnapshot["marks"] = []): AgentMemorySnapshot {
  const entries = memories.map((item, index) => normalizeAgentMemory({ ...item, category: item.category as AgentMemory["category"], createdAt: "2026-11-01T00:00:00.000Z", memoryId: item.id, updatedAt: new Date(Date.parse("2026-11-05T00:00:00.000Z") - index * 1000).toISOString() }));
  return { entries, marks: [...marks], settings: { allowConversationLearning: false, enabled: true, updatedAt: "2026-11-01T00:00:00.000Z", ...settings }, version: entries.reduce((sum, entry) => sum + entry.revision, 0) + marks.reduce((sum, mark) => sum + mark.revision, 0) };
}

export async function runFn(message: string, understood: Record<string, unknown>[], options: {
  world?: ReturnType<typeof fnWorld>;
  language?: "zh" | "ja" | "en";
  references?: { id: string; name: string; type: string }[];
  extract?: unknown;
  /** A reply of its own for the extraction call (AG13: a first call that fails, then one that answers). */
  extractReply?: (call: ModelCall) => string;
  answer?: (call: ModelCall) => string;
  judge?: Answerer;
  judgeOptions?: { hang?: boolean; extra?: Record<string, unknown> };
  memories?: TestMemory[];
  memorySettings?: Partial<AgentMemorySnapshot["settings"]>;
  memoryMarks?: AgentMemorySnapshot["marks"];
  /** The session's stored messages the turn is given (a resumed conversation). */
  messages?: Parameters<typeof graphKit>[1]["messages"];
  requestId?: string;
  thresholds?: typeof TEST_THRESHOLDS;
  state?: Parameters<typeof graphKit>[1]["state"];
  session?: ReturnType<typeof graphKit>;
} = {}): Promise<FnRun> {
  const world = options.world ?? fnWorld();
  const model = deepseekStub(byNode({
    ...(options.answer ? { answer: options.answer } : {}),
    ...(options.extract !== undefined ? { functions: () => json(options.extract) } : {}),
    ...(options.extractReply ? { functions: options.extractReply } : {}),
    understand: () => json({ language: options.language ?? "zh", parts: understood.map((item, index) => part({ localId: `p${index + 1}`, ...item })), plainChat: false }),
  }));
  const judgment = judgeStub(options.judge ?? (() => undefined), options.judgeOptions ?? {});
  const kit = options.session ?? graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(world), ...(options.references ? { references: options.references } : {}), ...(options.state ? { state: options.state } : {}), ...(options.messages ? { messages: options.messages } : {}) });
  kit.deps.fetchImplementation = model.fetchImplementation;
  // This turn's @ references (a shared session kit gets them per turn).
  kit.deps.authorizeReferences = async () => options.references ?? [];
  kit.deps.judgment = access(judgment.fetchImplementation, { thresholds: options.thresholds ?? FN_THRESHOLDS, timeoutMs: options.judgeOptions?.hang ? 30 : 3000 });
  const card = cardKit(world);
  kit.deps.cards = card.cards;
  // AG14: the saved entries as the turn reads them (one snapshot of the scope); entries given without tasks are not
  // classified and apply where their own words name the task, as entries stored before AG14 do.
  if (options.memories) kit.deps.memory = { snapshot: async () => memorySnapshotOf(options.memories!, options.memorySettings, options.memoryMarks) };
  await kit.seeded;
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, kit.input(message, { locale: options.language ?? "zh", ...(options.requestId ? { requestId: options.requestId } : {}), ...(options.references ? { references: options.references.map((item) => ({ id: item.id, type: item.type as never })) } : {}) }));
    return { events: trace.events, frozen: card.frozen, judgeCalls: judgment.calls, modelCalls: model.calls, result };
  } finally {
    trace.restore();
  }
}

/** Thresholds with the two AG10 questions enabled (tests only; the product's come from calibration). */
export const FN_THRESHOLDS = { ...TEST_THRESHOLDS, cells: { ...TEST_THRESHOLDS.cells, "followup.owner": { en: 0.7, ja: 0.7, zh: 0.7 }, "interaction.happened": { en: 0.7, ja: 0.7, zh: 0.7 } } };

export { contact, json, memo, MemorySaver, todo };
