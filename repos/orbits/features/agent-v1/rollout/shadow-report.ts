/**
 * agent-design AG18-2 — the shadow report: the comparison records grouped by account (each group read with that account
 * only), every divergence listed with its request id and both sides' results.
 */
import type { ShadowComparisonRecord, ShadowDivergence, ShadowStore } from "./shadow";
import type { ConversationShadowRecord, ConversationShadowStore } from "./conversation-shadow";

export interface ShadowAccountGroup {
  /** The label the caller gives the account (A, B, R, L …) or its id. */
  account: string;
  actorId: string;
  compared: number;
  divergences: number;
  /** Model calls of the shadow passes (a column of their own in the cost report). */
  shadowModelCalls: number;
  items: {
    requestId: string;
    message: string;
    comparedAt: string;
    divergences: ShadowDivergence[];
    old: { text: string; card: unknown; cited: string[]; error: string | null; clarification: boolean };
    new: { text: string; card: unknown; cited: string[]; error: string | null; clarification: boolean; reads: number; outside: string[] };
  }[];
  /** Records of another account found in this group (must be zero; reported, never dropped silently). */
  foreign: string[];
}

/** ORBIT_AGENT_CONVERSATION: the conversation engine's per-turn records (rollout/conversation-shadow.ts), per account. */
export interface ConversationShadowGroup {
  account: string;
  actorId: string;
  turns: number;
  withDiffs: number;
  applied: number;
  errors: number;
  overBudget: number;
  byField: Record<string, number>;
  items: { requestId: string; message: string; mode: string; status: string; diffs: ConversationShadowRecord["diffs"]; applied: ConversationShadowRecord["applied"] }[];
  /** Records of another account found in this group (must be zero). */
  foreign: string[];
}

export function conversationGroupOf(account: string, actorId: string, records: readonly ConversationShadowRecord[]): ConversationShadowGroup {
  const own = records.filter((record) => record.actorId === actorId);
  const byField: Record<string, number> = {};
  for (const record of own) for (const diff of record.diffs) byField[diff.field] = (byField[diff.field] ?? 0) + 1;
  return {
    account,
    actorId,
    applied: own.reduce((sum, record) => sum + record.applied.length, 0),
    byField,
    errors: own.filter((record) => record.status === "error").length,
    foreign: records.filter((record) => record.actorId !== actorId).map((record) => record.requestId),
    items: own.filter((record) => record.diffs.length || record.applied.length || record.status !== "compared").map((record) => ({ applied: record.applied, diffs: record.diffs, message: record.message, mode: record.mode, requestId: record.requestId, status: record.status })),
    overBudget: own.filter((record) => record.status === "over_budget").length,
    turns: own.length,
    withDiffs: own.filter((record) => record.diffs.length).length,
  };
}

export interface ShadowReport {
  generatedAt: string;
  groups: ShadowAccountGroup[];
  /** Present when the conversation engine's records were read (conversation store given, or an eval run's traces). */
  conversation?: ConversationShadowGroup[];
  totals: { accounts: number; compared: number; divergences: number; byField: Record<string, number>; shadowModelCalls: number; foreign: number };
}

export function groupOf(account: string, actorId: string, records: readonly ShadowComparisonRecord[]): ShadowAccountGroup {
  const own = records.filter((record) => record.actorId === actorId);
  const foreign = records.filter((record) => record.actorId !== actorId).map((record) => record.requestId);
  return {
    account,
    actorId,
    compared: own.length,
    divergences: own.filter((record) => record.divergences.length).length,
    foreign,
    items: own.map((record) => ({
      comparedAt: record.comparedAt,
      divergences: record.divergences,
      message: record.message,
      new: { card: record.new.card, cited: record.new.cited, clarification: record.new.clarification, error: record.new.error, outside: record.new.outside, reads: record.new.reads.length, text: record.new.text },
      old: { card: record.old.card, cited: record.old.cited, clarification: record.old.clarification, error: record.old.error, text: record.old.text },
      requestId: record.requestId,
    })),
    shadowModelCalls: own.reduce((sum, record) => sum + (record.modelCalls ?? 0), 0),
  };
}

export async function buildShadowReport(store: ShadowStore, accounts: readonly { account: string; actorId: string }[], now: () => string = () => new Date().toISOString(), conversationStore?: ConversationShadowStore | null): Promise<ShadowReport> {
  const groups: ShadowAccountGroup[] = [];
  for (const { account, actorId } of accounts) groups.push(groupOf(account, actorId, await store.list(actorId)));
  const conversation: ConversationShadowGroup[] = [];
  if (conversationStore) for (const { account, actorId } of accounts) conversation.push(conversationGroupOf(account, actorId, await conversationStore.list(actorId)));
  const byField: Record<string, number> = {};
  for (const group of groups) for (const item of group.items) for (const divergence of item.divergences) byField[divergence.field] = (byField[divergence.field] ?? 0) + 1;
  return {
    generatedAt: now(),
    groups,
    ...(conversationStore ? { conversation } : {}),
    totals: {
      accounts: groups.length,
      byField,
      compared: groups.reduce((sum, group) => sum + group.compared, 0),
      divergences: groups.reduce((sum, group) => sum + group.divergences, 0),
      foreign: groups.reduce((sum, group) => sum + group.foreign.length, 0),
      shadowModelCalls: groups.reduce((sum, group) => sum + group.shadowModelCalls, 0),
    },
  };
}

const FIELD_LABEL: Record<string, string> = { card: "是否出卡", card_ops: "卡上的操作", cited: "引用的记录", clarification: "是否追问", error: "一边出错", outside: "读到不该读的记录" };

/** The report as Markdown (for the evidence folder and the owner). */
export function shadowReportMarkdown(report: ShadowReport): string {
  const lines = [`# 影子运行对比报告（${report.generatedAt}）`, "", `- 账号 ${report.totals.accounts} 个；比较 ${report.totals.compared} 次委托；有分歧 ${report.totals.divergences} 次；影子通路主模型调用 ${report.totals.shadowModelCalls} 次；串到别的账号的记录 ${report.totals.foreign} 条`, `- 分歧按类：${Object.entries(report.totals.byField).map(([field, count]) => `${FIELD_LABEL[field] ?? field} ${count}`).join("，") || "无"}`, ""];
  for (const group of report.groups) {
    lines.push(`## 账号 ${group.account}（${group.actorId}）：比较 ${group.compared}，有分歧 ${group.divergences}${group.foreign.length ? `，**别的账号的记录 ${group.foreign.length} 条**` : ""}`, "");
    for (const item of group.items) {
      lines.push(`### ${item.requestId}「${item.message}」`, `- 旧通路：${item.old.error ? `出错 ${item.old.error}` : item.old.text.replace(/\s+/gu, " ").slice(0, 300)}${item.old.card ? `；卡：${JSON.stringify(item.old.card)}` : ""}；引用 ${item.old.cited.join("、") || "无"}${item.old.clarification ? "；追问" : ""}`, `- 新通路（只读）：${item.new.error ? `出错 ${item.new.error}` : item.new.text.replace(/\s+/gu, " ").slice(0, 300)}${item.new.card ? `；卡：${JSON.stringify(item.new.card)}` : ""}；引用 ${item.new.cited.join("、") || "无"}；读了 ${item.new.reads} 条${item.new.outside.length ? `；不该读的 ${item.new.outside.join("、")}` : ""}${item.new.clarification ? "；追问" : ""}`);
      lines.push(item.divergences.length ? `- 分歧：${item.divergences.map((divergence) => `${FIELD_LABEL[divergence.field] ?? divergence.field}（旧 ${JSON.stringify(divergence.old)} / 新 ${JSON.stringify(divergence.new)}）`).join("；")}` : "- 分歧：无（措辞不同不算）", "");
    }
  }
  if (report.conversation) lines.push(...conversationSectionMarkdown(report.conversation));
  return lines.join("\n");
}

const CONVERSATION_LABEL: Record<string, string> = { cancel: "取消等确认的改动", continues: "接哪个问题", follow_up: "和上一个请求的关系", next: "追问还是往下做", ref: "指代", request: "合并后的请求", shelved: "搁置的问题" };

/** The conversation engine's section of the report: per account, turns compared, differences by kind, what `on` changed. */
export function conversationSectionMarkdown(groups: readonly ConversationShadowGroup[]): string[] {
  const total = (pick: (group: ConversationShadowGroup) => number) => groups.reduce((sum, group) => sum + pick(group), 0);
  const byField: Record<string, number> = {};
  for (const group of groups) for (const [field, count] of Object.entries(group.byField)) byField[field] = (byField[field] ?? 0) + count;
  const lines = ["## 多轮理解引擎（ORBIT_AGENT_CONVERSATION）", "", `- 比较 ${total((group) => group.turns)} 轮；有差别 ${total((group) => group.withDiffs)} 轮；引擎改动（on）${total((group) => group.applied)} 处；出错 ${total((group) => group.errors)} 轮、超时 ${total((group) => group.overBudget)} 轮（这些轮照旧处理）；串到别的账号的记录 ${total((group) => group.foreign.length)} 条`, `- 差别按类：${Object.entries(byField).map(([field, count]) => `${CONVERSATION_LABEL[field] ?? field} ${count}`).join("，") || "无"}`, ""];
  for (const group of groups) {
    lines.push(`### 账号 ${group.account}（${group.actorId}）：${group.turns} 轮，有差别 ${group.withDiffs}${group.foreign.length ? `，**别的账号的记录 ${group.foreign.length} 条**` : ""}`, "");
    for (const item of group.items) {
      lines.push(`- ${item.requestId}「${item.message}」（${item.mode}${item.status !== "compared" ? `，${item.status}` : ""}）：${item.diffs.map((diff) => `${CONVERSATION_LABEL[diff.field] ?? diff.field}${diff.part ? ` ${diff.part}` : ""}（现有 ${JSON.stringify(diff.agent)} / 引擎 ${JSON.stringify(diff.engine)}）`).join("；") || "无差别"}${item.applied.length ? `；已改：${item.applied.map((change) => `${change.what} ${JSON.stringify(change.detail)}`).join("；")}` : ""}`);
    }
    lines.push("");
  }
  return lines;
}
