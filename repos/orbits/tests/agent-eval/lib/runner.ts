/**
 * The case runner (eval/README.md §4, §10): restores the world snapshot, acts as the Web/App client
 * through the product's normal endpoints, collects the trace, diffs the database, runs the code checks
 * and writes the per-case files. Steps not yet supported by the product are recorded as
 * "step not supported" and fail the case; the run continues (PLANNER 易错边界 9).
 */
import type { AgentAnswerBlockContract } from "../../../shared/contract/agent-v1";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import pg from "pg";

import type { EvalCase, Step } from "./cases";
import { EvalClient, signSessionCookie } from "./client";
import { EntryHarness, type EntryRequestRow } from "./entry-client";
import type { EvalEnvironment } from "./env-guard";
import { baseUrl } from "./eval-env";
import { fakeTurn, FAKE_DEFECTS, type FakeDefect } from "./fake-agent";
import { hardChecksPass, runHardChecks, type CheckContext, type CheckResult } from "./hard-checks";
import { BUSINESS_COLLECTIONS, normalizeDraftOps, normalizeLedgerOps, PRIVATE_READ_COLLECTIONS, productIdsIn, type MemoryEntryObservation, type CardObservation, type EntryObservation, type FirstLayerObservation, type HandoffPart, type Observation, type ReadObservation } from "./observations";
import { evalPaths } from "./paths";
import { drainServer, serverControl } from "./server";
import { readSeedReport, type SeedReportFile } from "./selfcheck";
import { diffStates, readAllPayloads, readDatabaseState, readPayloads, recordKey, restoreSnapshot, type DatabaseDiff } from "./snapshot";
import { CaseLog, mergeTrace, readServerEvents, scrubSecrets, traceFileSize, type TraceEvent } from "./trace-log";
import type { AgentActionPreviewContract } from "../../../shared/contract/agent-v1";
import { agentRequestIdFor } from "../../../features/agent-v1/entry/store";
import { CARD_STATUS_LABEL, cardText, decisionRecord, intentsFor, seedCard, seedSpecFor, type CardOpSpec } from "./cards";
import { ClientViews, viewText } from "./client-views";
import { DEFAULT_CLOCK } from "./vocabulary";
import { loadWorld, patchRecords, type FixtureRecord, type WorldFixture } from "./world";
import { createWorldWriter, type WorldWriter } from "./seed";
import { generatePatchContacts, type ContactsGeneration } from "./patch-generator";
import { configuredRecordAccess } from "../../../features/agent-v1/domains/configured";
import { readRecentInteraction } from "../../../features/agent-v1/views/recent-interaction";
import { stableStringify } from "./yaml";

export interface CaseOutcome {
  caseId: string;
  area: string;
  account: string;
  hardPass: boolean;
  checks: CheckResult[];
  unsupported: Observation["unsupported"];
  simulated: boolean;
  fake: boolean;
  events: TraceEvent[];
  observation: Observation;
  durationMs: number;
  dir: string;
  error?: string;
}

/**
 * AG05 run-02: the eval-only header the runner sends on the simulated other device's requests
 * (external_change). The preload runs such a request in its own async context and tags what is emitted
 * in it with `device: "other"`.
 */
export const OTHER_DEVICE_HEADER = "x-agent-eval-device";

/** The read.result events of the tested system: those the other device's requests made are left out (by tag, not by time). */
export function readsOfTestedSystem(events: readonly TraceEvent[]): TraceEvent[] {
  return events.filter((event) => event.type === "read.result" && event.device !== "other");
}

/** AG06: card operations a fault can be aimed at (fault.where), besides "executor" for any. */
// AG13: the private-event, «我去过», schedule and to-do items of a card too.
const EXECUTOR_FAULT_POINTS: readonly string[] = ["todo.create", "todo.update", "memo.create", "privateEvent.create", "privateEvent.delete", "attendance.create", "attendance.delete", "schedule.create", "schedule.update", "todo.complete", "todo.reopen", "todo.delete"];

const STEP_SUPPORT_NOTE: Record<string, string> = {
  disconnect: "the real-time channel needs the protocol-3 entry (ORBIT_AGENT_V1_MODE=on, AG01)",
  legacy_update: "only a to-do's fields can be sent the way an old client does (AG13); other records arrive in AG18",
  local_pending_edit: "unsynced App edits need the protocol-3 entry (ORBIT_AGENT_V1_MODE=on)",
  mcp: "MCP access arrives in AG17",
  mcp_paginate: "MCP access arrives in AG17",
  open_link: "confirmation links arrive in AG17",
  reconnect: "the real-time channel needs the protocol-3 entry (ORBIT_AGENT_V1_MODE=on, AG01)",
  resume_conversation: "resuming a saved conversation with its progress arrives in AG14",
  revoke: "revoking a connection or a push permission is simulated from AG16/AG17 (a read permission from AG05)",
  rollback: "rollback arrives in AG18",
  scheduler_tick: "scheduled dispatch driven by the runner arrives in AG15",
  stop: "stopping a running turn needs the protocol-3 entry (ORBIT_AGENT_V1_MODE=on, AG01)",
  sync: "App sync needs the protocol-3 entry (ORBIT_AGENT_V1_MODE=on)",
};

interface ConversationState {
  sessionId: string;
  messageRevision: number;
  history: { role: "user" | "assistant"; content: string }[];
  started: boolean;
}

interface StepRecord {
  index: number;
  word: string;
  body?: unknown;
}

const FINAL_REQUEST_STATUSES = new Set(["completed", "failed", "cancelled"]);
const STATUS_LABEL: Record<string, string> = { cancelled: "已停止（用户点了停止）", completed: "已完成", failed: "失败", queued: "排队中（等前一条处理完）", running: "处理中", waiting_user: "等用户" };
const statusLabel = (status: string | null | undefined) => (status ? STATUS_LABEL[status] ?? status : "（无）");
const PART_STATUS_LABEL: Record<string, string> = { answered: "已回答", awaiting_acceptance: "等用户接受替代方案", awaiting_clarification: "等用户回答追问", awaiting_confirmation: "等用户在卡上确认", declined: "无法承接", failed: "没处理成", suggested_external: "建议交给外部 Agent", unfinished: "这次没做", waiting_dependency: "等前一项的结果" };

function caseClock(testCase: EvalCase, world: WorldFixture): string {
  return testCase.clock ?? world.clock ?? DEFAULT_CLOCK;
}

function businessSecretValues(environment: EvalEnvironment): string[] {
  return ["DEEPSEEK_API_KEY", "ORBIT_GEMINI_DECISION_API_KEY", "AUTH_SECRET", "ORBIT_SYNC_CURSOR_SECRET", "ORBIT_PUSH_TOKEN_KEY"].map((key) => environment.env[key]).filter((value): value is string => Boolean(value));
}

export interface RunnerContext {
  environment: EvalEnvironment;
  runId: string;
  runDir: string;
  writer: WorldWriter | null;
  currentWorld: string | null;
  /** AG02 `--seed-cards`: put the card a case's card_ops describe into the ledger before its first message. */
  seedCards?: boolean;
  /** The cases of each area file (seedSpecFor looks for a case with the same first message). */
  areaCases?: Record<string, EvalCase[]>;
}

function accountLabelFor(testCase: EvalCase, world: WorldFixture): string {
  return world.mainAccount;
}

function stripLifecycle(payload: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!payload) return null;
  const { __lifecycleState: _ignored, ...rest } = payload;
  return rest;
}

/** Deployment settings a patch may set for one case (AG03: model-budget-1); the eval preload hands them to the server. */
const DEPLOYMENT_SETTINGS = new Set(["model_calls_limit", "judgment_uncalibrated"]);
/** AG14: the account's own memory switches (「回答时参考这些」, 「从对话里记住新的」). */
const MEMORY_SETTINGS = new Set(["memory_use", "memory_learn"]);
const MEMORY_SETTING_LABEL: Record<string, string> = { memory_learn: "从对话里记住新的", memory_use: "回答时参考这些" };

async function applyPatches(testCase: EvalCase, world: WorldFixture, filePatches: Record<string, any>, writer: WorldWriter, report: SeedReportFile, unsupported: Observation["unsupported"], fixtureCards: FixtureRecord[] = [], deploymentSettings: Record<string, unknown> = {}, conversations: string[] = [], memoryWritten: FixtureRecord[] = []): Promise<Record<string, string>> {
  const extraIds: Record<string, string> = {};
  for (const name of testCase.patches ?? []) {
    const patch = world.patches[name] ?? filePatches[name];
    if (!patch) continue;
    const records = patchRecords(patch, world.mainAccount);
    // AG08 (base-v1 contacts-2000): generated contacts, each with one recorded interaction, through the same write path.
    const generated = (patch.generate ?? {}) as Record<string, unknown>;
    if (generated.contacts) {
      const anchorNames = new Set(world.anchors.filter((record) => record.kind === "contact").map((record) => String(record.data.name)));
      records.push(...generatePatchContacts(generated.contacts as ContactsGeneration, { account: world.mainAccount, anchorNames, clock: world.clock }));
    }
    for (const record of records) {
      try {
        const before = new Set(Object.keys(writer.report.ids));
        // AG02: fixture cards go into the ledger once the case's conversation exists (runCase).
        if (record.kind === "card") {
          fixtureCards.push(record);
          continue;
        }
        if (record.kind === "contact") await writer.writeContact(record);
        else if (record.kind === "memo") await writer.writeMemo(record);
        else if (record.kind === "todo") await writer.writeTodo(record, false);
        else if (record.kind === "followup") await writer.writeTodo(record, true);
        else if (record.kind === "memory") {
          await writer.writeMemory(record);
          // AG14: a patch's memory entry belongs to its account alone (no_cross_account looks for its words elsewhere).
          memoryWritten.push(record);
        } else if (record.kind === "rule") await writer.writeRule(record);
        else if (record.kind === "schedule") await writer.writeSchedule(record);
        // AG13: private events and «我去过».
        else if (record.kind === "private_event") await writer.writePrivateEvent(record);
        else if (record.kind === "attendance") await writer.writeAttendance(record);
        else if (record.kind === "conversation") {
          // AG03 (CTX conv-prior-turns): the messages and the session state; the case continues this conversation.
          await writer.writeConversation(record);
          conversations.push(record.id);
        } else {
          unsupported.push({ reason: `patch ${name}: ${record.kind} records cannot be written by the current product`, step: 0, word: "patch" });
          continue;
        }
        for (const [key, value] of Object.entries(writer.report.ids)) if (!before.has(key) || key === record.id) extraIds[key] = value;
      } catch (error) {
        unsupported.push({ reason: `patch ${name}: writing ${record.id} failed: ${error instanceof Error ? error.message : error}`, step: 0, word: "patch" });
      }
    }
    for (const [section, items] of Object.entries(patch.set ?? {})) {
      for (const item of items as Record<string, unknown>[]) {
        // AG06 (todo-plan-and-due): a to-do's fields are changed through the to-do service before the case starts.
        if (section !== "todos") {
          unsupported.push({ reason: `patch ${name}: changing ${section} ${item.id} in place is not supported yet`, step: 0, word: "patch" });
          continue;
        }
        try {
          await writer.updateTodo(String(item.id), String(item.account ?? world.mainAccount), item);
        } catch (error) {
          unsupported.push({ reason: `patch ${name}: changing ${section} ${item.id} failed: ${error instanceof Error ? error.message : error}`, step: 0, word: "patch" });
        }
      }
    }
    for (const [key, value] of Object.entries((patch.settings ?? {}) as Record<string, unknown>)) {
      if (DEPLOYMENT_SETTINGS.has(key)) deploymentSettings[key] = value;
      // AG14 (mem-learn-on): the account's own memory switches, set through the memory service before the case starts.
      else if (MEMORY_SETTINGS.has(key)) await writer.setMemorySettings(world.mainAccount, { [key]: value });
      else unsupported.push({ reason: `patch ${name}: setting ${key}: ${JSON.stringify(value)} is not supported by the current product`, step: 0, word: "patch" });
    }
    for (const kind of Object.keys(generated)) if (kind !== "contacts") unsupported.push({ reason: `patch ${name}: generated ${kind} are not supported yet`, step: 0, word: "patch" });
  }
  void report;
  return extraIds;
}

/** AG13: JSON with every object's keys in order (a fixture writes { kind, id }, the product stores { id, kind }). */
function sortedJson(value: unknown): string {
  const sort = (item: unknown): unknown => (Array.isArray(item) ? item.map(sort) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([key, inner]) => [key, sort(inner)])) : item);
  return JSON.stringify(sort(value));
}

/** AG13: fixture ids anywhere in a value (strings, lists, { kind, id } refs) replaced by the product's ids. */
function productIdsOfFixture(value: unknown, idMap: Record<string, string>): unknown {
  if (typeof value === "string") return idMap[value] ?? value;
  if (Array.isArray(value)) return value.map((item) => productIdsOfFixture(item, idMap));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, key === "kind" ? item : productIdsOfFixture(item, idMap)]));
  return value;
}

/** Per-case files and checks. */
/**
 * AG19: the answer's blocks as the two clients lay them out (written by server code; the text above is the same answer as
 * plain text for older clients). Each record card is one line: kind, upper line, name, lower line, the reason if any.
 */
export function blockLines(blocks: readonly AgentAnswerBlockContract[] | undefined, fixtureIdOf: (id: string | null | undefined) => string | null): string[] {
  if (!blocks?.length) return [];
  const KIND: Record<string, string> = { attendance: "我去过", contact: "联系人", event: "活动", memo: "笔记", schedule: "日程", todo: "待办" };
  const lines: string[] = ["- 两端实际显示的排版（结果文档的 blocks，服务端代码写的；卡片整张可点，进那条记录的页面）："];
  for (const block of blocks) {
    if (block.type === "conclusion") lines.push(`  - 【结论，加粗】${block.text}`);
    else if (block.type === "paragraph") lines.push(`  - 【段落】${block.text}`);
    else if (block.type === "points") lines.push("  - 【要点】", ...block.items.map((item) => `    - ${item.head ? `〔${item.head}〕` : ""}${item.text}`));
    else if (block.type === "records") {
      lines.push(`  - 【${block.size === "mini" ? "小卡片" : "卡片"}${block.caption ? `，上方小字「${block.caption}」` : ""}，共 ${block.items.length} 张${block.moreLabel ? `，先显示 ${block.shown} 张，其余收在「${block.moreLabel}」里，点一下原地展开` : ""}】`);
      block.items.forEach((item, index) => lines.push(`    - ${index + 1}. [${KIND[item.kind] ?? item.kind}] ${item.top ?? ""}｜${item.title}｜${item.sub ?? ""}${item.why ? `｜理由：${item.why}` : ""}（${fixtureIdOf(item.id) ?? item.id}${item.gone ? "，已不在" : ""}）`));
    } else if (block.type === "note") lines.push(`  - 【灰底说明条「${block.title}」】`, ...block.items.map((item) => `    - ${item.quote ? `「${item.quote}」` : ""}${item.text}${item.action ? `〔可以马上做：${item.action}〕` : ""}`), ...(block.go ? [`    - 末尾的入口「${block.go.label} ›」：点了打开设置页「iOrbit 记住的信息」${block.go.memoryId ? `里那一条（${block.go.memoryId}）` : ""}`] : []));
  }
  return lines;
}

/**
 * AG14 UI: the memory chips at the start of the answer, right after the basis line (approved draft board 5): which saved
 * entry the answer used ("修改 ›" opens that entry in settings), the one this turn did not follow, a rule that took
 * results away. Written by server code; both clients show them as they are.
 */
export function memoryUseLines(memoryUse: readonly { kind: string; memoryId: string; text: string }[] | undefined, fixtureIdOf: (id: string | null | undefined) => string | null): string[] {
  if (!memoryUse?.length) return [];
  return [`- 回答开头记忆的小标签（两端显示在依据行后面；服务端代码写的）：${memoryUse.map((chip) => `「${chip.text}」${chip.kind === "skipped" ? "" : "带「修改 ›」，点了打开设置页里这一条"}（${fixtureIdOf(chip.memoryId) ?? chip.memoryId}）`).join("；")}`];
}

export async function runCase(testCase: EvalCase, filePatches: Record<string, any>, area: string, ctx: RunnerContext): Promise<CaseOutcome> {
  const started = Date.now();
  const { environment } = ctx;
  const dir = path.join(ctx.runDir, "cases", testCase.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "case.yaml"), yaml.dump(testCase, { lineWidth: 160 }));
  const world = loadWorld(testCase.world);
  const report = readSeedReport(environment, testCase.world);
  const clock = caseClock(testCase, world);
  const paths = evalPaths(environment.env);
  const unsupported: Observation["unsupported"] = [];
  let clockOffsetMs = Date.parse(clock) - Date.now();
  const clockNow = () => new Date(Date.now() + clockOffsetMs).toISOString();
  const log = new CaseLog(testCase.id, clockNow);

  // AG13 opening 4: nothing from an earlier case may still be running when the snapshot is restored.
  await drainServer(environment);
  restoreSnapshot(environment.database.url, report.snapshot.file);
  if (!ctx.writer || ctx.currentWorld !== testCase.world) {
    // Do not close the previous writer: the configured stores and pools are cached per process and shared.
    ctx.writer = createWorldWriter(testCase.world, world.clock);
    ctx.currentWorld = testCase.world;
    for (const [label, account] of Object.entries(report.accounts)) {
      if (label !== "HOST") await ctx.writer.ensureAccount({ displayName: loadWorld(testCase.world).accounts[label]?.name ?? label, email: account.email, label, userId: account.userId });
    }
  }
  Object.assign(ctx.writer.report.ids, report.ids);
  const fixtureCards: FixtureRecord[] = [];
  const deploymentSettings: Record<string, unknown> = {};
  const patchConversations: string[] = [];
  const patchMemory: FixtureRecord[] = [];
  const extraIds = await applyPatches(testCase, world, filePatches, ctx.writer, report, unsupported, fixtureCards, deploymentSettings, patchConversations, patchMemory);
  const idMap: Record<string, string> = { ...report.ids, ...extraIds };
  const reverse = new Map(Object.entries(idMap).map(([fixture, product]) => [product, fixture]));
  const fixtureIdOf = (productId: string | null | undefined) => (productId ? reverse.get(productId) ?? null : null);
  const accounts = Object.fromEntries(Object.entries(report.accounts).filter(([label]) => label !== "HOST").map(([label, account]) => [label, account.userId]));
  const accountByActor = new Map(Object.entries(accounts).map(([label, actor]) => [actor, label]));
  let account = accountLabelFor(testCase, world);

  const settings = (testCase.settings ?? {}) as Record<string, unknown>;
  const replayNames = settings.web_replay === undefined ? [] : Array.isArray(settings.web_replay) ? settings.web_replay : [settings.web_replay];
  const replay = replayNames.map((name) => ({ ...world.webReplay[String(name)], name }));
  for (const [key, value] of Object.entries(settings)) {
    if (key === "web_replay") continue;
    // AG09: the user's own web switch for this case (features/agent-v1/web/settings.ts reads it under ORBIT_AGENT_EVAL=1).
    if (key === "web") {
      deploymentSettings.web = value;
      continue;
    }
    // AG14: a case that starts with a memory switch other than the default.
    if (MEMORY_SETTINGS.has(key)) {
      await ctx.writer!.setMemorySettings(account, { [key]: value });
      continue;
    }
    unsupported.push({ reason: `setting ${key}: ${JSON.stringify(value)} is not supported by the current product`, step: 0, word: "settings" });
  }

  const db = new pg.Client({ connectionString: environment.database.url });
  await db.connect();
  let diff: DatabaseDiff = { records: [], tables: [] };
  let memoryAfter: { id: string }[] | undefined;
  // AG14: every memory entry at the end, the settings lists read with each account's own sign-in, the setting steps.
  let memoryEntries: MemoryEntryObservation[] | undefined;
  const settingsMemory: Record<string, { status: number; ids: string[] }> = {};
  let userChangedMemorySettings = false;
  let mergedEvents: TraceEvent[] = [];
  let error: string | undefined;
  const transcript: string[] = [`# ${testCase.id} ${testCase.title}`, "", `- 账号：${account}（${world.accounts[account]?.name ?? ""}） · 世界：${testCase.world} · 时钟：${clock}`, ""];
  const cardsSeen = new Map<string, { kind: CardObservation["kind"]; observedBy: Set<string> }>();
  const answers: Observation["answers"] = [];
  const requests: Observation["requests"] = [];
  let clarifications = 0;
  /** AG02: the cards' final state, written at the end of the transcript. */
  const cardEndLines: string[] = [];
  /** AG02: what external_change steps set, per collection and record id. */
  const externalSets = new Map<string, Record<string, unknown>>();
  /** AG05: records an external_change step deleted, per collection and record id. */
  const externalDeletes = new Set<string>();
  /** AG05: the "recent interaction" view per contact fixture, before and after the steps. */
  const recentInteractions: NonNullable<Observation["recentInteractions"]> = {};
  let fake: FakeDefect | null = null;
  const stepRecords: StepRecord[] = [];
  // AG01: with the new entry on, web and app send protocol 3 and follow the session channel.
  const useEntry = environment.env.ORBIT_AGENT_V1_MODE === "on";
  let entry: EntryHarness | null = null;
  let entryRows: EntryRequestRow[] = [];
  const onlineAtEnd = new Set<string>();
  // AG07 (UIX.yaml): what each client shows of the cards, through the clients' own card rule.
  const views = new ClientViews(testCase.locale);
  const tracksViews = (testCase.hard ?? []).some((entryCheck) => "client_view" in (entryCheck as object) || "same_card_on" in (entryCheck as object));
  try {
    const before = await readDatabaseState(db);
    const beforePayloads = await readAllPayloads(db);
    const small = testCase.world === "base-v1";
    fs.writeFileSync(path.join(dir, "world-before.json"), JSON.stringify({
      accounts,
      counts: report.counts,
      digest: before.digest,
      ids: idMap,
      records: small ? [...beforePayloads.entries()].map(([key, payload]) => ({ key: key.split("\u0000"), payload })) : `omitted for ${testCase.world}; see the snapshot ${report.snapshot.sha256}`,
      snapshot: report.snapshot,
      world: testCase.world,
    }, null, 2));

    await serverControl(environment, "context", { account, caseId: testCase.id, clock, replay, runId: ctx.runId, settings: deploymentSettings });
    if (Object.keys(deploymentSettings).length) transcript.push(`*（部署侧设置：${Object.entries(deploymentSettings).map(([key, value]) => (key === "model_calls_limit" ? `单轮主模型调用上限压到 ${value} 次` : key === "web" ? `这个账号自己的联网开关：${value === "off" ? "关" : "开"}` : `${key}=${JSON.stringify(value)}`)).join("；")}）*`, "");
    const traceOffset = traceFileSize(paths.traceDir);
    const secret = environment.env.AUTH_SECRET;
    const cookies = new Map<string, string>();
    const cookieFor = async (label: string) => {
      if (!cookies.has(label)) cookies.set(label, await signSessionCookie({ email: report.accounts[label].email, name: world.accounts[label]?.name ?? label, secret, userId: accounts[label] }));
      return cookies.get(label)!;
    };
    // AG03: `conversation: RCV01` (or a patch's conversation) continues that stored session and its state.
    const continued = testCase.conversation ?? patchConversations[0];
    const continuedSession = continued ? idMap[continued] : undefined;
    if (continued && !continuedSession) unsupported.push({ reason: `conversation ${continued} is not in the seeded world (re-run agent-eval:seed)`, step: 0, word: "conversation" });
    let conversation: ConversationState = { history: [], messageRevision: 0, sessionId: continuedSession ?? `session_${randomUUID()}`, started: Boolean(continuedSession) };
    // AG14 (resume_conversation): the conversations of this case in the order they were opened.
    const opened: ConversationState[] = [conversation];
    if (continuedSession) transcript.push(`*（接着已有的对话 ${continued} 说；会话里存的上文和状态见 trace 的 context.built）*`, "");
    const sentBodies = new Map<number, unknown>();
    const clientFor = async (name: string) => new EvalClient(baseUrl(environment), log, await cookieFor(account), (name as "web" | "app") ?? "web");
    if (useEntry) {
      entry = new EntryHarness({ actorId: () => accounts[account], baseUrl: baseUrl(environment), cookie: () => cookieFor(account), db, log, sessionId: conversation.sessionId });
      await entry.start(["web", "app"]);
    }

    // ── AG02: cards. Hashes per revision as the clients saw them (click.revision), seeding. ──
    const cardHashes = new Map<string, Map<number, string>>();
    const noteCard = (card: AgentActionPreviewContract | null | undefined, by?: string) => {
      if (!card?.actionId) return;
      if (by) views.note(by, card);
      const seen = cardsSeen.get(card.actionId) ?? { kind: "ledger_action" as const, observedBy: new Set<string>() };
      if (by) seen.observedBy.add(by);
      cardsSeen.set(card.actionId, seen);
      const hashes = cardHashes.get(card.actionId) ?? new Map<number, string>();
      hashes.set(card.revision, card.payloadHash);
      for (const old of card.revisions ?? []) hashes.set(old.revision, old.payloadHash);
      cardHashes.set(card.actionId, hashes);
    };
    const seedSpec = ctx.seedCards ? seedSpecFor(testCase, ctx.areaCases?.[area] ?? []) : null;
    let seeded = false;
    const seedConversationCard = async (index: number, requestId: string) => {
      if (!seedSpec || seeded) return;
      seeded = true;
      const result = await seedCard({ actorId: accounts[account], createdAt: clockNow(), intents: intentsFor(seedSpec.ops, (id) => idMap[id]), locale: testCase.locale, requestId, sessionId: conversation.sessionId });
      noteCard(result.preview);
      log.push({ borrowedFrom: seedSpec.from === testCase.id ? null : seedSpec.from, card: result.action, cardId: result.action.actionId, cardKind: "ledger_action", hash: result.action.payloadHash, requestId, revision: result.action.revision ?? 1, seeded: "seed-cards", step: index, type: "card.frozen" });
      transcript.push(`*（--seed-cards：运行器按用例的 card_ops${seedSpec.from === testCase.id ? "" : `（取自第一句话相同的 ${seedSpec.from}）`}把这张卡作为这条消息（${requestId}）的卡预置进账本，出处是对话）*`, ...cardText(result.preview), "");
    };
    for (const record of fixtureCards) {
      const requestId = `request:fixture:${testCase.id}:${record.id}`;
      const data = record.data as { createdAt?: string; status?: string; operations?: CardOpSpec[] };
      const createdAt = data.createdAt ? new Date(data.createdAt).toISOString() : clockNow();
      const result = await seedCard({ actorId: accounts[account], createdAt, intents: intentsFor(data.operations ?? [], (id) => idMap[id]), locale: testCase.locale, requestId, sessionId: conversation.sessionId, status: data.status });
      idMap[record.id] = result.action.actionId;
      reverse.set(result.action.actionId, record.id);
      noteCard(result.preview);
      log.push({ card: result.action, cardId: result.action.actionId, cardKind: "ledger_action", fixture: record.id, hash: result.action.payloadHash, revision: result.action.revision ?? 1, seeded: "fixture", step: 0, type: "card.frozen" });
      transcript.push(`*（夹具里的卡 ${record.id}，状态 ${CARD_STATUS_LABEL[result.preview.status] ?? result.preview.status}）*`, ...cardText(result.preview), "");
    }
    /** What a client shows of a card right now: the single-card GET. */
    const readCardAs = async (clientName: string, cardId: string, purpose: string) => {
      const client = await clientFor(clientName);
      const result = await client.request("GET", `/api/agent/ledger/${encodeURIComponent(cardId)}`, undefined, { purpose });
      const card = result.body?.data?.card as AgentActionPreviewContract | undefined;
      noteCard(card, clientName);
      return card ?? null;
    };
    /** One button decision as a client sends it; the response's card is what that client shows next. */
    const sendDecision = async (index: number, clientName: string, cardId: string, body: Record<string, unknown>, resend: boolean) => {
      const client = await clientFor(clientName);
      const result = await client.request("POST", `/api/agent/ledger/${encodeURIComponent(cardId)}/transition`, body, { purpose: resend ? "resend the same decision" : "click" });
      const data = (result.body?.data ?? {}) as { decision?: Record<string, any>; card?: AgentActionPreviewContract };
      const decision = data.decision ?? {};
      noteCard(data.card, clientName);
      log.push(decisionRecord({ body, cardId, client: clientName, result }));
      const outcome = decision.replayed ? `重复提交，返回第一次的结果（${decision.outcome}${decision.reason ? `，${decision.reason}` : ""}）` : decision.outcome === "accepted" ? "已接受" : decision.outcome === "already_decided" ? "没有新的决定：这张卡已经处理过了" : `拒绝（${decision.reason ?? result.body?.error?.code ?? result.status}）`;
      transcript.push(`- 服务端（HTTP ${result.status}）：${outcome}。${decision.message ?? result.body?.error?.message ?? ""}`, ...cardText(data.card), "");
    };
    /** Cards the entry delivered in result documents (in the order the server received them). */
    const refreshDeliveredCards = async () => {
      if (!entry) return;
      for (const row of (await entry.requests()).sort((left, right) => left.receivedSeq - right.receivedSeq)) noteCard(row.document?.actionPreview);
    };

    const sendUser = async (index: number, step: Step, resendOf?: unknown): Promise<void> => {
      const client = await clientFor(step.client ?? "web");
      const text = String(step.user ?? (resendOf as { message?: string } | undefined)?.message ?? "");
      if (!resendOf) {
        log.push({ client: step.client ?? "web", refs: step.refs ?? [], step: index, text, type: "turn.user" });
        transcript.push(`**用户**（${step.client ?? "web"}）：${text}`, "");
      }
      if (fake) {
        const result = await fakeTurn(fake, text, {
          account,
          accounts,
          clockNow,
          databaseUrl: environment.database.url,
          idOf: (fixtureId) => idMap[fixtureId],
          log,
          workspaceId: environment.workspaceId,
        });
        const event = log.push({ citations: result.citations, source: "simulated", text: result.text, type: "turn.assistant" });
        answers.push({ citations: result.citations, seq: -1, text: result.text, ...{ _event: event } } as never);
        transcript.push(`**Agent**（假实现）：${result.text}`, "");
        return;
      }
      const clientName = step.client ?? "web";
      // AG05: protocol 3 carries the six kinds of @ reference; the server authorizes each one. A record of another
      // account is sent by its id as a client would. AG11: each carries its marker's place in the sentence, as the two
      // clients send it (markers with the same words in the order they appear, REF.yaml), and an event its EventRef kind.
      const refs = (step.refs ?? []) as { type: string; id: string; quote?: string }[];
      const SENT_KIND: Record<string, string> = { attendance: "attendance", contact: "contact", event: "event", memo: "memo", note: "note", schedule: "schedule", todo: "todo" };
      const sentText = text.trim();
      const searchFrom = new Map<string, number>();
      const placeOf = (quote: string | undefined): { start: number; end: number } | Record<string, never> => {
        if (!quote) return {};
        const at = sentText.indexOf(quote, searchFrom.get(quote) ?? 0);
        if (at < 0) return {};
        searchFrom.set(quote, at + quote.length);
        return { end: at + quote.length, start: at };
      };
      const contactRefs = entry && clientName !== "app_old" ? refs.filter((ref) => SENT_KIND[ref.type] && idMap[ref.id]).map((ref) => ({
        id: idMap[ref.id],
        type: SENT_KIND[ref.type],
        ...placeOf(ref.quote),
        ...(ref.type === "event" ? { eventKind: idMap[ref.id].startsWith("private_event:") ? "private" : "platform" } : {}),
      })) : [];
      if (refs.length > contactRefs.length) unsupported.push({ reason: `@ references not sent (unknown kind or record): ${refs.filter((ref) => !contactRefs.some((sent) => sent.id === idMap[ref.id])).map((ref) => `${ref.type} ${ref.id}`).join(", ")}`, step: index, word: "user.refs" });
      if (entry && clientName !== "app_old") {
        // Protocol 3: one POST that is only acknowledged; the result arrives on the channel / by requestId.
        const clientMessageId = `message:${randomUUID()}`;
        // AG02 --seed-cards: the card this message would have produced, prepared before it is sent.
        if (!resendOf && seedSpec && !seeded) await seedConversationCard(index, agentRequestIdFor(accounts[account], conversation.sessionId, clientMessageId));
        const v3Body = (resendOf as Record<string, unknown>) ?? {
          clientMessageId,
          locale: testCase.locale,
          message: text,
          ...(conversation.started ? {} : { origin: { entryClient: clientName === "app" ? "app" : "web", entryPointId: "ai.new_chat", initialGroupId: null, kind: "manual", template: null } }),
          protocolVersion: 3,
          references: contactRefs,
          sessionId: conversation.sessionId,
        };
        conversation.started = true;
        sentBodies.set(index, v3Body);
        const result = await client.request("POST", "/api/ai/conversations", v3Body, { purpose: resendOf ? "resend with the same message key" : "send" });
        const receipt = result.body?.data?.agentRequest;
        entry.acks.push({ client: clientName, error: result.body?.error?.code ?? null, httpId: String(result.requestSeqRef.httpId), httpStatus: result.status, message: String(v3Body.message), replayed: receipt?.replayed ?? null, requestId: receipt?.requestId ?? null, resend: Boolean(resendOf), status: receipt?.status ?? null, step: index });
        entry.noteSent(clientName, receipt?.requestId ?? null, receipt?.status ?? null);
        transcript.push(receipt
          ? `- 服务端应答（HTTP ${result.status}）：${receipt.replayed ? "同一条消息，返回原来的委托" : "已收到"} ${receipt.requestId}，接收顺序 #${receipt.receivedSeq}，状态：${statusLabel(receipt.status)}`
          : `- 服务端应答（HTTP ${result.status}）：未收下（${result.body?.error?.code ?? "无应答"}）`, "");
        return;
      }
      const body = (resendOf as Record<string, unknown>) ?? {
        clientMessageId: `message:${randomUUID()}`,
        expectedMessageRevision: conversation.messageRevision,
        history: conversation.history.slice(-8),
        locale: testCase.locale,
        message: text,
        ...(conversation.started ? {} : { origin: { entryClient: step.client === "app" || step.client === "app_old" ? "app" : "web", entryPointId: "ai.new_chat", initialGroupId: null, kind: "manual", template: null } }),
        protocolVersion: 2,
        references: [],
        requestId: `request:${randomUUID()}`,
        sessionId: conversation.sessionId,
      };
      sentBodies.set(index, body);
      let result = await client.request("POST", "/api/ai/conversations", body, { purpose: "send" });
      const deadline = Date.now() + 180_000;
      while (result.status === 202 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        result = await client.request("POST", "/api/ai/conversations", body, { purpose: "poll same requestId" });
      }
      const data = result.body?.data ?? {};
      const receipt = data.reliableSend;
      if ((result.status === 200 || result.status === 202) && receipt?.requestId && !requests.some((item) => item.requestId === receipt.requestId)) {
        requests.push({ requestId: receipt.requestId, seq: -1, state: receipt.state ?? null, status: result.status });
      }
      conversation.started = conversation.started || result.status === 200;
      if (typeof receipt?.messageRevision === "number") conversation.messageRevision = receipt.messageRevision;
      else if (result.status !== 202) {
        // As the clients do after a failed send: reload the stored session to learn its current revision.
        const session = await client.request("GET", `/api/ai/conversations/sessions/${encodeURIComponent(conversation.sessionId)}`, undefined, { purpose: "reload session after a failed send" });
        const revision = session.body?.data?.session?.messageRevision;
        if (typeof revision === "number") {
          conversation.messageRevision = revision;
          conversation.started = true;
        }
      }
      const assistantText = typeof data.assistantMessage === "string" ? data.assistantMessage : result.body?.error?.message ? `（请求失败：${result.body.error.code ?? result.status}）` : "";
      if (!resendOf) {
        conversation.history.push({ content: text, role: "user" });
        if (assistantText) conversation.history.push({ content: assistantText, role: "assistant" });
      }
      if (data.routingDecision?.intent === "clarification") clarifications += 1;
      const known = new Set(Object.values(idMap));
      const citedProduct = new Set<string>([...productIdsIn(data.artifacts ?? [], known), ...productIdsIn(data.provenance?.evidenceIds ?? [], known)]);
      const citations = [...citedProduct].map((id) => fixtureIdOf(id)).filter((id): id is string => Boolean(id));
      const answerEvent = log.push({ citations, client: step.client ?? "web", httpStatus: result.status, source: "real", text: assistantText, type: "turn.assistant" });
      answers.push({ citations, seq: -1, text: assistantText, ...{ _event: answerEvent } } as never);
      for (const actionId of (data.actionIds ?? []) as string[]) {
        const seen = cardsSeen.get(actionId) ?? { kind: "ledger_action" as const, observedBy: new Set<string>() };
        seen.observedBy.add(step.client ?? "web");
        cardsSeen.set(actionId, seen);
      }
      if (data.entityDraft?.draftId) {
        const seen = cardsSeen.get(data.entityDraft.draftId) ?? { kind: "entity_draft" as const, observedBy: new Set<string>() };
        seen.observedBy.add(step.client ?? "web");
        cardsSeen.set(data.entityDraft.draftId, seen);
      }
      const cardLines = [
        ...((data.actionIds ?? []) as string[]).map((id) => `- 卡片（动作账本）${id}`),
        ...(data.entityDraft ? [`- 卡片（草稿）${data.entityDraft.draftId ?? ""}：${JSON.stringify(data.entityDraft.fields ?? data.entityDraft).slice(0, 300)}`] : []),
        ...(data.taskInteraction ? [`- 待办交互：${data.taskInteraction.state} ${data.taskInteraction.title ?? ""}`] : []),
      ];
      transcript.push(`**Agent**${result.status !== 200 ? `（HTTP ${result.status}）` : ""}：${assistantText || "（无文字回应）"}`, ...cardLines, "");
    };

    const runStep = async (step: Step, index: number): Promise<void> => {
      const word = Object.keys(step).find((key) => !["client", "refs", "while_running"].includes(key)) ?? "unknown";
      stepRecords.push({ index, word });
      if (step.while_running && !entry) unsupported.push({ reason: "while_running needs the protocol-3 entry (ORBIT_AGENT_V1_MODE=on, AG01)", step: index, word: "while_running" });
      switch (word) {
        case "user":
          await sendUser(index, step);
          return;
        case "disconnect":
        case "reconnect":
        case "stop": {
          if (!entry) {
            log.push({ step: index, type: `turn.${word}`, value: step[word] });
            unsupported.push({ reason: STEP_SUPPORT_NOTE[word], step: index, word });
            return;
          }
          const name = String((step[word] as { client?: string } | undefined)?.client ?? step.client ?? "web");
          if (word === "disconnect") {
            if (step.while_running) {
              // The client drops the channel mid-turn: only after it has seen part of that turn.
              const waited = await entry.waitForEventOfRunningTurn(name);
              if (waited.late) {
                log.push({ client: name, reason: waited.reason, requestId: waited.requestId, step: index, type: "turn.disconnect_late" });
                transcript.push(`*（${name} 本想在处理中途断开，但${waited.reason === undefined ? "" : `：${waited.reason}`}；照样断开）*`, "");
              }
            }
            log.push({ client: name, lastSeq: entry.channel(name).lastSeq, step: index, type: "turn.disconnect" });
            entry.disconnect(name);
            // AG07: offline the client keeps what it had; it reads nothing and sends nothing until it reconnects.
            views.noteDocuments(name, entry.channel(name).docs.values());
            views.setOnline(name, false);
            transcript.push(`*（${name} 断开实时通道；断开前最后收到的序号 ${entry.channel(name).lastSeq}）*`, "");
            return;
          }
          if (word === "reconnect") {
            const after = entry.channel(name).lastSeq;
            log.push({ after, client: name, step: index, type: "turn.reconnect" });
            entry.connect(name);
            await entry.waitCaughtUp(name);
            const client = await clientFor(name);
            const read = await entry.readBack(name, (requestPath, purpose) => client.request("GET", requestPath, undefined, { purpose }));
            views.setOnline(name, true);
            views.noteDocuments(name, entry.channel(name).docs.values());
            // AG07 (设计稿 §7): back online, the client reads the card again before it shows its items and buttons.
            await refreshDeliveredCards();
            const lastCard = [...cardsSeen.keys()].at(-1);
            if (lastCard && tracksViews) await readCardAs(name, lastCard, "reconnected: read the card again before showing it");
            transcript.push(`*（${name} 重新连上，带上序号 ${after}，从它之后接着收；再按 requestId 读回 ${read} 条结果）*`, "");
            return;
          }
          const seen = entry.runningAsSeenBy(name);
          const rows = await entry.requests();
          const current = rows.filter((row) => row.sessionId === entry!.currentSessionId);
          const target = (seen && current.find((row) => row.requestId === seen && !FINAL_REQUEST_STATUSES.has(row.status))) || current.find((row) => row.status === "running") || null;
          log.push({ client: name, requestId: target?.requestId ?? null, seenAsRunning: seen, step: index, type: "turn.stop" });
          transcript.push(`**用户点击**（${name}）：停止${target ? `（${target.requestId}）` : "（没有正在处理的一轮）"}`, "");
          if (!target) return;
          const client = await clientFor(name);
          const result = await client.request("POST", `/api/ai/runs/${encodeURIComponent(target.requestId)}/transition`, { action: "cancel" }, { purpose: "stop" });
          const stopped = result.body?.data?.agentRequest;
          transcript.push(`- 服务端：${result.status === 200 ? (stopped?.changed ? "这一轮已停止" : `没有变化（${statusLabel(stopped?.document?.status)}）`) : `拒绝（HTTP ${result.status}）`}`, "");
          return;
        }
        case "select": {
          // AG04 (README §3.1): click one option under the latest question, as a client does — the same
          // POST with protocol 3 and `selection`; the option key is a fixture id (the record it points at)
          // or the option's own id or capability.
          const key = String((step.select as { option?: unknown } | undefined)?.option ?? "");
          const clientName = step.client ?? "web";
          log.push({ client: clientName, option: key, step: index, type: "turn.select" });
          if (!entry) {
            unsupported.push({ reason: "clicking an option needs the protocol-3 entry (ORBIT_AGENT_V1_MODE=on)", step: index, word });
            return;
          }
          const rows = (await entry.requests()).filter((row) => row.sessionId === entry!.currentSessionId).sort((left, right) => right.receivedSeq - left.receivedSeq);
          const openSets = rows.flatMap((row) => (row.document?.clarifications ?? []).filter((set) => set.state === "open").map((set) => ({ row, set })));
          const target = openSets.find((item) => item.set.kind !== "entry") ?? openSets[0];
          const product = idMap[key];
          const chosen = target?.set.options.find((option) => (product && option.ref?.id === product) || option.optionId === key || option.capability === key);
          transcript.push(`**用户点选**（${clientName}）：${chosen ? `「${chosen.label}」` : `「${key}」`}${target ? `（${target.row.requestId} 下的 ${target.set.clarificationId}）` : "（没有可点的方向）"}`, "");
          if (!target || !chosen) {
            unsupported.push({ reason: target ? `option ${key} is not among the options offered (${target.set.options.map((option) => (option.ref?.id ? fixtureIdOf(option.ref.id) ?? option.ref.id : option.optionId)).join(", ")})` : "no open question to click under", step: index, word });
            return;
          }
          const client = await clientFor(clientName);
          const body = { clientSelectionId: `selection:${randomUUID()}`, protocolVersion: 3, selection: { clarificationId: target.set.clarificationId, optionId: chosen.optionId, requestId: target.row.requestId }, sessionId: entry.currentSessionId };
          sentBodies.set(index, body);
          const result = await client.request("POST", "/api/ai/conversations", body, { purpose: "select an option" });
          const receipt = result.body?.data?.agentSelection;
          transcript.push(receipt ? `- 服务端应答（HTTP ${result.status}）：已收下点选，接回 ${receipt.requestId}，状态：${statusLabel(receipt.status)}` : `- 服务端应答（HTTP ${result.status}）：拒收（${result.body?.error?.context?.reason ?? result.body?.error?.code ?? "无应答"}）`, "");
          return;
        }
        case "use_fake_agent": {
          const defect = step.use_fake_agent?.defect as FakeDefect;
          if (!FAKE_DEFECTS.includes(defect)) {
            unsupported.push({ reason: `unknown fake defect ${defect}`, step: index, word });
            return;
          }
          fake = defect;
          log.push({ defect, step: index, type: "turn.use_fake_agent" });
          transcript.push(`*（本用例接运行器自带的假实现，缺陷：${defect}）*`, "");
          return;
        }
        case "fault": {
          log.push({ fault: step.fault, source: "simulated", step: index, type: "turn.fault" });
          // AG05: the read adapters are fault points too (<kind>.read). AG06: one card operation (memo.create …).
          if (!["model", "understand", "judgment", "executor", "memo.read", "todo.read", "contact.read", "schedule.read", "event.read", ...EXECUTOR_FAULT_POINTS].includes(step.fault?.where)) unsupported.push({ reason: `fault point "${step.fault?.where}" has no consumer in the current product`, step: index, word });
          if (EXECUTOR_FAULT_POINTS.includes(step.fault?.where) || step.fault?.where === "executor") executorFaultArmed = String(step.fault?.where);
          await serverControl(environment, "fault", step.fault);
          return;
        }
        case "egress_probe":
          log.push({ host: step.egress_probe?.host, step: index, type: "turn.egress_probe" });
          await serverControl(environment, "probe", { host: step.egress_probe?.host });
          return;
        case "advance_clock": {
          const body = step.advance_clock?.to ? { to: step.advance_clock.to } : { advanceMinutes: Number(step.advance_clock?.minutes ?? 0) };
          const result = await serverControl<{ now: string }>(environment, "clock", body);
          clockOffsetMs = Date.parse(result.now) - Date.now();
          log.push({ now: result.now, step: index, type: "turn.advance_clock", ...body });
          transcript.push(`*（时钟推进到 ${result.now}）*`, "");
          return;
        }
        case "new_conversation":
          // AG14 UI run: the clients get the answer of the conversation being left before it is left (entry-client sessionDelivered).
          if (entry && !(await entry.settleSession())) log.push({ note: "a client had not received every answer of the conversation before it was left", step: index, type: "runner.note" });
          conversation = { history: [], messageRevision: 0, sessionId: `session_${randomUUID()}`, started: false };
          opened.push(conversation);
          await entry?.switchSession(conversation.sessionId);
          log.push({ sessionId: conversation.sessionId, step: index, type: "turn.new_conversation" });
          transcript.push("*（新开对话）*", "");
          return;
        case "resume_conversation": {
          // AG14 UI run: the clients get the answer of the conversation being left before it is left (entry-client sessionDelivered).
          if (entry && !(await entry.settleSession())) log.push({ note: "a client had not received every answer of the conversation before it was left", step: index, type: "runner.note" });
          // AG14 (MEM.yaml): back to the n-th conversation of this case (from 1). The client opens the stored session
          // again, as it does from the conversation list, and the next message is sent in it.
          const at = Number((step.resume_conversation as { index?: number } | undefined)?.index ?? 0);
          const target = opened[at - 1];
          if (!target) {
            unsupported.push({ reason: `this case has no conversation number ${at} (it opened ${opened.length})`, step: index, word });
            return;
          }
          conversation = target;
          await entry?.switchSession(conversation.sessionId);
          const client = await clientFor(String(step.client ?? "web"));
          const session = await client.request("GET", `/api/ai/conversations/sessions/${encodeURIComponent(conversation.sessionId)}`, undefined, { purpose: "reopen a stored conversation" });
          const revision = session.body?.data?.session?.messageRevision;
          if (typeof revision === "number") conversation.messageRevision = revision;
          log.push({ index: at, sessionId: conversation.sessionId, status: session.status, step: index, type: "turn.resume_conversation" });
          transcript.push(`*（回到本用例的第 ${at} 个对话，接着说）*`, "");
          return;
        }
        case "switch_account": {
          // AG14 UI run: the clients get the answer of the conversation being left before it is left (entry-client sessionDelivered).
          if (entry && !(await entry.settleSession())) log.push({ note: "a client had not received every answer of the conversation before it was left", step: index, type: "runner.note" });
          const label = String(step.switch_account);
          if (!accounts[label]) {
            unsupported.push({ reason: `account ${label} does not exist in ${testCase.world}`, step: index, word });
            return;
          }
          account = label;
          conversation = { history: [], messageRevision: 0, sessionId: `session_${randomUUID()}`, started: false };
          opened.push(conversation);
          await entry?.switchSession(conversation.sessionId);
          log.push({ account: label, step: index, type: "turn.switch_account" });
          transcript.push(`*（换成账号 ${label}）*`, "");
          return;
        }
        case "click":
        case "review": {
          await refreshDeliveredCards();
          const spec = (step[word] ?? {}) as { card?: string | number; decision?: string; revision?: number; op?: number; action?: string };
          const selector = spec.card ?? "last";
          const ids = [...cardsSeen.keys()];
          const cardId = selector === "last" ? ids[ids.length - 1] : ids[Number(selector) - 1];
          const decision = word === "review" ? String(spec.action) : String(spec.decision);
          const clientName = step.client ?? "web";
          const kindOfCard = cardId ? cardsSeen.get(cardId)!.kind : null;
          // AG07 (UIX 约定四): offline, or with an unsynced edit of a record on the card, the client's own card rule
          // decides whether the button can be pressed; a press it does not allow sends nothing (not queued either).
          if (tracksViews && cardId && kindOfCard === "ledger_action" && word === "click") {
            const view = views.view(clientName, cardId);
            const allowed = views.online(clientName) && view?.kind === "card" && (decision === "reject" ? Boolean(view.buttons?.dismissEnabled) : decision === "confirm" ? view.confirmEnabled || !view.buttons : true);
            const why = !views.online(clientName) ? "offline" : view?.kind === "card" && view.blocked ? "unsynced_edit" : null;
            if (!allowed && why) {
              log.push({ cardId, client: clientName, decision, reason: why, step: index, type: "turn.click_blocked" });
              transcript.push(`**用户点击**（${clientName}）：${decision}（${cardId}）`, `- ${clientName} 的界面没有让它生效：${why === "offline" ? "离线时卡上的按钮点不了，这一下没有排进离线队列" : "确认按钮不可用（先同步你的修改）"}；什么都没有发出去`, "");
              return;
            }
          }
          // AG02: a ledger card is decided with what this client shows (revision and hash), or with an older revision.
          const shown = cardId && kindOfCard === "ledger_action" ? await readCardAs(clientName, cardId, word === "review" ? "show the card before reviewing an item" : "show the card before the click") : null;
          if (shown?.origin) {
            const revision = spec.revision ?? shown.revision;
            const payloadHash = cardHashes.get(cardId!)?.get(revision) ?? null;
            const operationId = word === "review" ? shown.operations[Number(spec.op ?? 1) - 1]?.operationId : undefined;
            log.push({ cardId, client: clientName, decision, operationId: operationId ?? null, revision, step: index, type: "turn.click" });
            transcript.push(`**用户点击**（${clientName}）：${word === "review" ? `核对第 ${spec.op ?? 1} 项 → ${decision}` : decision}（${cardId}，按第 ${revision} 版${spec.revision !== undefined ? "，这一端还停在旧版" : ""}）`, "");
            if (!payloadHash) {
              unsupported.push({ reason: `the client never saw revision ${revision} of ${cardId}`, step: index, word: "click.revision" });
              return;
            }
            const body = { clientDecisionId: `decision:${randomUUID()}`, payloadHash, revision, transition: decision, ...(operationId ? { operationId } : {}) };
            sentBodies.set(index, { cardId, clientName, decisionBody: body });
            await sendDecision(index, clientName, cardId!, body, false);
            return;
          }
          log.push({ cardId: cardId ?? null, client: clientName, decision, step: index, type: "turn.click" });
          transcript.push(`**用户点击**：${decision}${cardId ? `（${cardId}）` : "（没有可点的卡）"}`, "");
          if (word === "review") {
            unsupported.push({ reason: "reviewing an item needs a card with an origin (AG02 ledger cards)", step: index, word });
            return;
          }
          if (spec.revision !== undefined) unsupported.push({ reason: "clicking with an older revision needs a card with an origin (AG02 ledger cards)", step: index, word: "click.revision" });
          if (!cardId) return;
          const client = await clientFor(clientName);
          const kind = kindOfCard!;
          const result = kind === "entity_draft"
            ? await client.request("POST", `/api/ai/entity-drafts/${encodeURIComponent(cardId)}`, { action: decision === "confirm" ? "confirm" : decision === "reject" ? "cancel" : decision }, { purpose: "click" })
            : await client.request("POST", `/api/agent/ledger/${encodeURIComponent(cardId)}/transition`, { transition: decision }, { purpose: "click" });
          const accepted = result.status >= 200 && result.status < 300;
          log.push({ accepted, cardId, decision, reason: accepted ? null : result.body?.error?.code ?? `HTTP_${result.status}`, status: result.status, type: "card.decision", via: "click" });
          transcript.push(`- 服务端：${accepted ? "已接受" : `拒绝（${result.body?.error?.code ?? result.status}）`}`, "");
          return;
        }
        case "resend": {
          const target = Number(step.resend?.step) - 1;
          const original = sentBodies.get(target);
          log.push({ resendOf: target + 1, step: index, type: "turn.resend" });
          if (!original) {
            unsupported.push({ reason: `resend of step ${target + 1}: only user messages can be resent by the current product`, step: index, word });
            return;
          }
          const decisionResend = (original as { decisionBody?: Record<string, unknown>; cardId?: string; clientName?: string }).decisionBody;
          if (decisionResend) {
            // AG02 (BND.yaml resend): the same decision, the same clientDecisionId, sent again as is.
            const { cardId, clientName } = original as { cardId: string; clientName: string };
            transcript.push(`*（原样重发第 ${target + 1} 步的点击，沿用同一个 clientDecisionId ${String(decisionResend.clientDecisionId)}）*`, "");
            await sendDecision(index, clientName, cardId, decisionResend, true);
            return;
          }
          transcript.push(`*（重发第 ${target + 1} 步）*`, "");
          await sendUser(index, testCase.steps[target], original);
          return;
        }
        case "card_edit": {
          // AG06 (设计稿 §5.1): taking an item off the card is not a decision; it re-freezes the rest as a new version.
          await refreshDeliveredCards();
          const spec = (step.card_edit ?? {}) as { card?: string | number; remove_op?: number };
          const ids = [...cardsSeen.keys()];
          const cardId = (spec.card ?? "last") === "last" ? ids[ids.length - 1] : ids[Number(spec.card) - 1];
          const clientName = step.client ?? "web";
          log.push({ cardId: cardId ?? null, client: clientName, removeOp: spec.remove_op ?? null, step: index, type: "turn.card_edit" });
          transcript.push(`**用户在卡上去掉一项**（${clientName}）：第 ${spec.remove_op} 项${cardId ? `（${cardId}）` : "（没有可编辑的卡）"}`, "");
          if (!cardId) {
            unsupported.push({ reason: "no card to edit", step: index, word });
            return;
          }
          const shown = await readCardAs(clientName, cardId, "show the card before taking an item off");
          const operationId = shown?.operations[Number(spec.remove_op ?? 0) - 1]?.operationId;
          if (!shown || !operationId) {
            unsupported.push({ reason: `the card has no item ${spec.remove_op}`, step: index, word });
            return;
          }
          const client = await clientFor(clientName);
          const result = await client.request("POST", `/api/agent/ledger/${encodeURIComponent(cardId)}/edit`, { payloadHash: shown.payloadHash, removeOperationId: operationId, revision: shown.revision }, { purpose: "take an item off the card" });
          const card = result.body?.data?.card as AgentActionPreviewContract | undefined;
          noteCard(card, clientName);
          log.push({ cardId, outcome: result.body?.data?.edit?.outcome ?? null, reason: result.body?.error?.reason ?? null, revision: card?.revision ?? null, status: result.status, type: "card.edit" });
          transcript.push(`- 服务端（HTTP ${result.status}）：${result.body?.data?.edit?.message ?? result.body?.error?.message ?? ""}`, ...cardText(card), "");
          if (result.status !== 200) unsupported.push({ reason: `taking an item off the card was refused (HTTP ${result.status})`, step: index, word });
          return;
        }
        case "regenerate": {
          await refreshDeliveredCards();
          const selector = step.regenerate?.card ?? "last";
          const ids = [...cardsSeen.keys()];
          const cardId = selector === "last" ? ids[ids.length - 1] : ids[Number(selector) - 1];
          const clientName = step.client ?? "web";
          log.push({ cardId: cardId ?? null, client: clientName, step: index, type: "turn.regenerate" });
          transcript.push(`**用户点击**（${clientName}）：重新生成${cardId ? `（${cardId}）` : "（没有可点的卡）"}`, "");
          if (!cardId) return;
          const client = await clientFor(clientName);
          const result = await client.request("POST", `/api/agent/ledger/${encodeURIComponent(cardId)}/regenerate`, {}, { purpose: "regenerate" });
          const card = result.body?.data?.card as AgentActionPreviewContract | undefined;
          noteCard(card, clientName);
          const message = result.body?.data?.regeneration?.message ?? result.body?.error?.message ?? "";
          log.push({ cardId, outcome: result.body?.data?.regeneration?.outcome ?? null, reason: result.body?.error?.reason ?? null, revision: card?.revision ?? null, status: result.status, type: "card.regenerate" });
          transcript.push(`- 服务端（HTTP ${result.status}）：${message}`, ...cardText(card), "");
          return;
        }
        case "concurrent": {
          log.push({ step: index, type: "turn.concurrent" });
          await Promise.all((step.concurrent as Step[]).map((sub, offset) => runStep(sub, index * 100 + offset)));
          return;
        }
        case "external_change": {
          // AG02 (BND 约定一): another device changes the record through the product's normal update
          // endpoint. The change is not the tested system's write (excluded from no_business_writes).
          const change = (step.external_change ?? {}) as { target?: string; set?: Record<string, unknown>; delete?: boolean };
          log.push({ change, step: index, type: "turn.external_change" });
          const productId = change.target ? idMap[change.target] : undefined;
          if (productId && change.delete && productId.startsWith("note:")) {
            // AG05: the note is deleted on another device through the product's normal delete endpoint.
            const device = new EvalClient(baseUrl(environment), log, await cookieFor(account), "web");
            const result = await device.request("DELETE", `/api/notes/${encodeURIComponent(productId)}`, undefined, { headers: { [OTHER_DEVICE_HEADER]: "other" }, purpose: "external change: delete the note on another device" });
            externalDeletes.add(`notes\u0000${productId}`);
            transcript.push(`*（别处删除了 ${change.target}，经笔记的正常删除接口，HTTP ${result.status}）*`, "");
            if (result.status !== 200) unsupported.push({ reason: `external delete of ${change.target} failed (HTTP ${result.status})`, step: index, word });
            return;
          }
          if (productId && productId.startsWith("contact:")) {
            // AG12: another device edits the contact's fields through the field endpoint, or deletes it (soft delete).
            const device = new EvalClient(baseUrl(environment), log, await cookieFor(account), "web");
            if (change.delete) {
              const result = await device.request("DELETE", `/api/contacts/${encodeURIComponent(productId)}`, undefined, { headers: { [OTHER_DEVICE_HEADER]: "other" }, purpose: "external change: delete the contact on another device" });
              externalDeletes.add(`contacts\u0000${productId}`);
              transcript.push(`*（别处删除了 ${change.target}，经联系人的正常删除接口，HTTP ${result.status}）*`, "");
              if (result.status !== 200) unsupported.push({ reason: `external delete of ${change.target} failed (HTTP ${result.status})`, step: index, word });
              return;
            }
            const FIELD: Record<string, string> = { email: "email", name: "displayName", org: "organization", phone: "phone", role: "role" };
            const STORED: Record<string, string> = { email: "primaryEmail", name: "displayName", org: "organization", phone: "primaryPhone", role: "role" };
            const values = Object.fromEntries(Object.entries(change.set ?? {}).filter(([key]) => key in FIELD).map(([key, value]) => [FIELD[key], value]));
            const result = await device.request("PATCH", `/api/contacts/${encodeURIComponent(productId)}/fields`, { values }, { headers: { [OTHER_DEVICE_HEADER]: "other" }, purpose: "external change: edit the contact on another device" });
            externalSets.set(`contacts\u0000${productId}`, { ...(externalSets.get(`contacts\u0000${productId}`) ?? {}), ...Object.fromEntries(Object.entries(change.set ?? {}).filter(([key]) => key in STORED).map(([key, value]) => [STORED[key], value])) });
            transcript.push(`*（别处改了 ${change.target}：${JSON.stringify(change.set ?? {})}，经联系人的字段修改接口，HTTP ${result.status}）*`, "");
            if (result.status !== 200 || Object.keys(values).length !== Object.keys(change.set ?? {}).length) unsupported.push({ reason: `external change of ${change.target} failed (HTTP ${result.status})`, step: index, word });
            return;
          }
          if (!productId || change.delete || !productId.startsWith("task:")) {
            unsupported.push({ reason: `external change of ${change.target}: updating a to-do and deleting a note are simulated (AG02, AG05)`, step: index, word });
            return;
          }
          const other = new EvalClient(baseUrl(environment), log, await cookieFor(account), "web");
          const current = await other.request("GET", `/api/tasks/${encodeURIComponent(productId)}`, undefined, { headers: { [OTHER_DEVICE_HEADER]: "other" }, purpose: "external change: read the to-do on another device" });
          const updatedAt = current.body?.data?.task?.updatedAt;
          // AG13: fixture ids inside the set ({ kind: private, id: P1 }) are sent as the product's ids.
          const productSet = productIdsOfFixture(change.set ?? {}, idMap) as Record<string, unknown>;
          const result = await other.request("PATCH", `/api/tasks/${encodeURIComponent(productId)}`, { action: "update", expectedUpdatedAt: updatedAt, idempotencyKey: `agent-eval:external:${testCase.id}:${index}`, patch: productSet }, { headers: { [OTHER_DEVICE_HEADER]: "other" }, purpose: "external change: edit the to-do on another device" });
          externalSets.set(`tasks\u0000${productId}`, { ...(externalSets.get(`tasks\u0000${productId}`) ?? {}), ...productSet });
          transcript.push(`*（别处改了 ${change.target}：${JSON.stringify(change.set ?? {})}，经待办的正常更新接口，HTTP ${result.status}）*`, "");
          if (result.status !== 200) unsupported.push({ reason: `external change of ${change.target} failed (HTTP ${result.status})`, step: index, word });
          return;
        }
        case "legacy_update": {
          // AG13 (EVT, CMP 提出的步骤): an old client's partial edit through its old endpoint — only the fields in `set`, none of
          // the new link fields; with full_object it sends every field it knows (the old ones) as it read them. Not the tested
          // system's write; its changes still count in the end-of-run data difference.
          const spec = (step.legacy_update ?? {}) as { target?: string; set?: Record<string, unknown>; full_object?: boolean; client?: string };
          log.push({ legacy: spec, step: index, type: "turn.legacy_update" });
          const productId = spec.target ? idMap[spec.target] : undefined;
          if (!productId || !productId.startsWith("task:")) {
            unsupported.push({ reason: STEP_SUPPORT_NOTE.legacy_update, step: index, word });
            return;
          }
          const device = new EvalClient(baseUrl(environment), log, await cookieFor(account), "app");
          const current = await device.request("GET", `/api/tasks/${encodeURIComponent(productId)}`, undefined, { headers: { [OTHER_DEVICE_HEADER]: "other" }, purpose: "old client: read the to-do" });
          const task = (current.body?.data?.task ?? {}) as Record<string, unknown>;
          const LEGACY_FIELDS = ["title", "notes", "location", "category", "plannedDate", "dueAt", "priority", "relatedContactId", "relatedEventId", "relatedMeetingId", "relatedConversationId"];
          const set = productIdsOfFixture(spec.set ?? {}, idMap) as Record<string, unknown>;
          const patch = spec.full_object ? { ...Object.fromEntries(LEGACY_FIELDS.filter((field) => task[field] !== undefined).map((field) => [field, task[field]])), ...set } : set;
          const result = await device.request("PATCH", `/api/tasks/${encodeURIComponent(productId)}`, { action: "update", expectedUpdatedAt: task.updatedAt, idempotencyKey: `agent-eval:legacy:${testCase.id}:${index}`, patch }, { headers: { [OTHER_DEVICE_HEADER]: "other" }, purpose: "old client: edit the to-do with its old fields only" });
          externalSets.set(`tasks\u0000${productId}`, { ...(externalSets.get(`tasks\u0000${productId}`) ?? {}), ...set });
          transcript.push(`*（旧版客户端经旧接口改了 ${spec.target}：${JSON.stringify(spec.set ?? {})}${spec.full_object ? "（整条提交它认得的字段）" : "（只提交这几个字段）"}，HTTP ${result.status}）*`, "");
          if (result.status !== 200) unsupported.push({ reason: `legacy update of ${spec.target} failed (HTTP ${result.status})`, step: index, word });
          return;
        }
        case "local_pending_edit": {
          // AG07 (UIX 约定三): the user edits a record in the App and it is not synced yet. Nothing reaches the server;
          // the App's outbox holds it, so its card rule sees an unsynced edit of that record.
          const spec = (step.local_pending_edit ?? {}) as { client?: string; target?: string; set?: Record<string, unknown> };
          const name = String(spec.client ?? step.client ?? "app");
          const productId = spec.target ? idMap[spec.target] : undefined;
          log.push({ client: name, set: spec.set ?? {}, step: index, target: spec.target ?? null, type: "turn.local_pending_edit" });
          if (!entry || !productId || !productId.startsWith("task:")) {
            unsupported.push({ reason: !entry ? STEP_SUPPORT_NOTE.local_pending_edit : `local edit of ${spec.target}: only to-dos are simulated`, step: index, word });
            return;
          }
          views.addPending(name, { collection: "tasks", fixture: spec.target!, productId, set: spec.set ?? {} });
          transcript.push(`*（用户在 ${name} 上改了 ${spec.target}：${JSON.stringify(spec.set ?? {})}，还没同步到服务端）*`, "");
          return;
        }
        case "sync": {
          // AG07: the App syncs its own edits through the product's normal update endpoint (not the tested system's
          // write, UIX 约定三), then asks the server to look at its waiting card again (POST …/recheck).
          const name = String((step.sync as { client?: string } | undefined)?.client ?? step.client ?? "app");
          log.push({ client: name, step: index, type: "turn.sync" });
          if (!entry) {
            unsupported.push({ reason: STEP_SUPPORT_NOTE.sync, step: index, word });
            return;
          }
          const device = new EvalClient(baseUrl(environment), log, await cookieFor(account), "app");
          for (const edit of views.takePending(name)) {
            const current = await device.request("GET", `/api/tasks/${encodeURIComponent(edit.productId)}`, undefined, { headers: { [OTHER_DEVICE_HEADER]: "other" }, purpose: "sync: read the to-do before writing the local edit" });
            const result = await device.request("PATCH", `/api/tasks/${encodeURIComponent(edit.productId)}`, { action: "update", expectedUpdatedAt: current.body?.data?.task?.updatedAt, idempotencyKey: `agent-eval:sync:${testCase.id}:${index}:${edit.fixture}`, patch: edit.set }, { headers: { [OTHER_DEVICE_HEADER]: "other" }, purpose: "sync: write the App's local edit" });
            externalSets.set(`tasks\u0000${edit.productId}`, { ...(externalSets.get(`tasks\u0000${edit.productId}`) ?? {}), ...edit.set });
            transcript.push(`*（${name} 把本机对 ${edit.fixture} 的修改同步到服务端：${JSON.stringify(edit.set)}，经待办的正常更新接口，HTTP ${result.status}）*`);
            if (result.status !== 200) unsupported.push({ reason: `sync of ${edit.fixture} failed (HTTP ${result.status})`, step: index, word });
          }
          await refreshDeliveredCards();
          const client = await clientFor(name);
          for (const cardId of [...cardsSeen.keys()].filter((id) => cardsSeen.get(id)!.kind === "ledger_action")) {
            const shown = views.card(name, cardId);
            if (!shown || !["awaiting_confirmation", "deferred"].includes(shown.status)) continue;
            const result = await client.request("POST", `/api/agent/ledger/${encodeURIComponent(cardId)}/recheck`, {}, { purpose: "after sync: look at the waiting card again" });
            const card = result.body?.data?.card as AgentActionPreviewContract | undefined;
            noteCard(card, name);
            log.push({ cardId, outcome: result.body?.data?.recheck?.outcome ?? null, revision: card?.revision ?? null, status: result.status, type: "card.recheck" });
            transcript.push(`- 服务端（HTTP ${result.status}）：${result.body?.data?.recheck?.outcome === "revised" ? `卡按现在的数据出了第 ${card?.revision} 版` : "卡上的内容没有变"}`, ...cardText(card));
          }
          transcript.push("");
          return;
        }
        case "revoke": {
          // AG05 (PLANNER 出入 4): the product has no per-record read permission yet; the eval's deny list,
          // checked by every read, stands for it. `read: "memo:M31"` withdraws the read of that record.
          const spec = (step.revoke ?? {}) as { read?: string };
          log.push({ revoke: spec, step: index, type: "turn.revoke" });
          const target = typeof spec.read === "string" ? spec.read.slice(spec.read.indexOf(":") + 1) : "";
          const productId = target ? idMap[target] : undefined;
          if (!productId) {
            unsupported.push({ reason: STEP_SUPPORT_NOTE.revoke, step: index, word });
            return;
          }
          await serverControl(environment, "revoke", { read: productId });
          transcript.push(`*（撤回了对 ${target} 的读取权限：评测环境的拒读名单，之后的每次读取都会核对）*`, "");
          return;
        }
        case "setting": {
          // AG14: the user flips one of the two memory switches on the settings page (the settings API, with the account's
          // own sign-in). It is the user's own action, not a write of the tested system.
          const setting = (step.setting ?? {}) as Record<string, unknown>;
          const other = Object.keys(setting).filter((key) => !MEMORY_SETTINGS.has(key));
          if (other.length || !Object.keys(setting).length) {
            unsupported.push({ reason: `setting ${JSON.stringify(step.setting)} is not supported by the current product`, step: index, word });
            return;
          }
          const body = { ...(setting.memory_use !== undefined ? { enabled: setting.memory_use === "on" || setting.memory_use === true } : {}), ...(setting.memory_learn !== undefined ? { allowConversationLearning: setting.memory_learn === "on" || setting.memory_learn === true } : {}) };
          const device = new EvalClient(baseUrl(environment), log, await cookieFor(account), "web");
          log.push({ account, setting, step: index, type: "turn.setting" });
          const result = await device.request("PATCH", "/api/agent/memory/settings", body, { headers: { [OTHER_DEVICE_HEADER]: "other" }, purpose: "the user changes a memory switch on the settings page" });
          userChangedMemorySettings = true;
          if (result.status !== 200) unsupported.push({ reason: `changing the memory setting failed (HTTP ${result.status})`, step: index, word });
          transcript.push(`*（用户在设置页把${Object.entries(setting).map(([key, value]) => `「${MEMORY_SETTING_LABEL[key] ?? key}」${value === "on" || value === true ? "打开" : "关掉"}`).join("、")}）*`, "");
          return;
        }
        default:
          log.push({ step: index, type: `turn.${word}`, value: step[word] });
          unsupported.push({ reason: STEP_SUPPORT_NOTE[word] ?? "step not supported by the current product", step: index, word });
      }
    };

    // AG05 (RD.yaml recent_interaction): the runner reads the "recent interaction" view itself, before and after.
    const interactionSpecs = ((testCase.hard.find((item) => "recent_interaction" in item) as { recent_interaction?: { contact: string }[] } | undefined)?.recent_interaction ?? []);
    const recentOf = async (fixture: string) => {
      const access = configuredRecordAccess();
      if (!access || !idMap[fixture]) return null;
      const view = await readRecentInteraction({ reader: access.reader, source: access.source }, access.scope(accounts[account]), { contactId: idMap[fixture], now: clockNow(), timeZone: world.timezone ?? "Asia/Tokyo" });
      if (!view.latest) return null;
      const productId = view.latest.ref.slice(view.latest.ref.indexOf(":") + 1);
      return { occurredOn: view.latest.occurredOn, productId, source: fixtureIdOf(productId) };
    };
    for (const spec of interactionSpecs) recentInteractions[spec.contact] = { after: null, before: await recentOf(spec.contact).catch(() => null) };

    let executorFaultArmed: string | null = null;
    for (const [index, step] of testCase.steps.entries()) {
      try {
        if (entry && !fake) {
          // eval/README.md §3.4 while_running: act while a turn is still being processed; otherwise
          // first let the earlier turns end. The wait reads the eval database, not a client.
          if (step.while_running) {
            if (!(await entry.waitRunning())) log.push({ note: "while_running: no turn of the session was running any more", step: index, type: "runner.note" });
            // A person presses stop after seeing the turn run for a moment, not within milliseconds of sending.
            else if ("stop" in step) await new Promise((resolve) => setTimeout(resolve, 1_500));
          } else if (!(await entry.waitIdle())) {
            log.push({ note: "the earlier turns did not end within 240 s", step: index, type: "runner.note" });
          }
        }
        const armedBefore = executorFaultArmed;
        await runStep(step, index);
        if (tracksViews && entry && !fake) {
          // AG07 (UIX 约定一、二): after each step, what each client shows of the last card, through its own card rule.
          if ("user" in step || "select" in step) await entry.waitIdle();
          await refreshDeliveredCards();
          const lastCard = [...cardsSeen.keys()].filter((id) => cardsSeen.get(id)!.kind === "ledger_action").at(-1) ?? null;
          for (const name of ["web", "app"]) {
            if (!views.online(name)) continue;
            await entry.waitCaughtUp(name);
            views.noteDocuments(name, entry.channel(name).docs.values());
          }
          const recorded = views.record(index + 1, ["web", "app"], lastCard);
          for (const item of recorded) log.push({ afterStep: index + 1, cardContent: item.view?.cardContent ?? null, cardId: item.cardId, client: item.client, confirm: item.view?.confirmEnabled ? "enabled" : "disabled", online: views.online(item.client), pendingCount: item.view?.pendingCount ?? 0, revision: item.revision, status: item.view?.kind === "card" ? item.view.status : null, type: "client.view" });
          transcript.push(`*（第 ${index + 1} 步之后，两端看到的卡）*`, ...recorded.flatMap((item) => [`- ${item.client}${views.online(item.client) ? "" : "（离线）"}：`, ...viewText(item.view).map((line) => `  ${line}`)]), "");
        }
        // AG06 (XL.yaml notes: "故障只作用在第一次确认触发的执行上"): an executor fault covers the next step that runs
        // an execution; an "always" one ends after it, so a later card is not hit by it.
        if (armedBefore && !("fault" in step) && ("click" in step || "review" in step)) {
          await serverControl(environment, "fault_end", { where: armedBefore });
          log.push({ step: index, type: "turn.fault_end", where: armedBefore });
          executorFaultArmed = null;
        }
      } catch (stepError) {
        log.push({ error: stepError instanceof Error ? stepError.message : String(stepError), step: index, type: "error" });
        unsupported.push({ reason: `step failed: ${stepError instanceof Error ? stepError.message : stepError}`, step: index, word: "error" });
      }
    }
    if (entry) {
      if (!(await entry.waitIdle())) log.push({ note: "some turns had not ended 240 s after the last step", type: "runner.note" });
      await entry.settleViews();
      entryRows = await entry.requests();
      for (const channel of entry.channels.values()) if (channel.online) onlineAtEnd.add(channel.name);
      await refreshDeliveredCards();
      await entry.close();
    }
    // AG02: each ledger card as it ends, as the web client would show it (the single-card GET).
    const ledgerCards = [...cardsSeen.entries()].filter(([, seen]) => seen.kind === "ledger_action").map(([cardId]) => cardId);
    if (ledgerCards.length && !fake) {
      const finalLines: string[] = [];
      for (const cardId of ledgerCards) finalLines.push(...cardText(await readCardAs("web", cardId, "runner: the card's final state for the transcript")));
      cardEndLines.push("## 卡片的最终状态", "", ...finalLines, "");
    }
    for (const spec of interactionSpecs) recentInteractions[spec.contact].after = await recentOf(spec.contact).catch((viewError: unknown) => {
      unsupported.push({ reason: `the recent-interaction view failed: ${viewError instanceof Error ? viewError.message : viewError}`, step: -1, word: "recent_interaction" });
      return null;
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const serverState = await serverControl<{ faults: { where: string; kind: string; applied: number }[] }>(environment, "state");
    for (const fault of serverState.faults ?? []) {
      if (!fault.applied) unsupported.push({ reason: `${fault.where}/${fault.kind} was armed but never reached, so this case did not test what it plans`, step: -1, word: "fault" });
    }
    const after = await readDatabaseState(db);
    diff = await diffStates(db, before, beforePayloads, after);
    // AG11 (memory_state, first used by AE-REF-002's gate): the account's memory entries at the end of the case.
    // AG14: an entry is the account's when its partition is the account's (entries stored before AG14 carry no owner
    // column); a deleted entry stays as a mark (status deleted, no words) and is not an entry in use.
    const ownerOfMemory = (row: { owner: string | null; workspace: string }) => row.owner ?? row.workspace.slice(row.workspace.indexOf(":agent-actor:") + ":agent-actor:".length);
    const allMemoryKeys = [...after.records.values()].filter((row) => row.collection === "agentMemories");
    const allMemoryPayloads = await readPayloads(db, allMemoryKeys);
    memoryEntries = allMemoryKeys.flatMap((row) => {
      const payload = allMemoryPayloads.get(recordKey(row)) as { kind?: string; __lifecycleState?: string; memory?: { status?: string; revision?: number; category?: string; appliesTo?: string[] } } | undefined;
      if (!payload || payload.kind !== "memory" || payload.__lifecycleState === "deleted") return [];
      const memory = payload.memory ?? {};
      return [{ account: accountByActor.get(ownerOfMemory(row)) ?? null, appliesTo: Array.isArray(memory.appliesTo) ? memory.appliesTo : [], category: String(memory.category ?? ""), fixtureId: fixtureIdOf(row.id), id: row.id, revision: Number(memory.revision ?? 1), status: memory.status === "deleted" ? "deleted" as const : "active" as const }];
    });
    memoryAfter = memoryEntries.filter((entry) => entry.status === "active" && entry.account === account).map((entry) => ({ id: entry.id }));
    // AG14 (settings_memory_list): what the settings API lists for each account named, with that account's own sign-in.
    for (const check of testCase.hard) {
      const wanted = (check as { settings_memory_list?: { account?: string } }).settings_memory_list;
      const label = wanted?.account ? String(wanted.account) : null;
      if (!label || settingsMemory[label] || !accounts[label]) continue;
      const device = new EvalClient(baseUrl(environment), log, await cookieFor(label), "web");
      const listedNow = await device.request("GET", "/api/agent/memory", undefined, { headers: { [OTHER_DEVICE_HEADER]: "other" }, purpose: `the settings page of account ${label} lists its memory` });
      const memories = (listedNow.body?.data?.memories ?? []) as { memoryId?: string }[];
      settingsMemory[label] = { ids: memories.map((item) => fixtureIdOf(String(item.memoryId)) ?? String(item.memoryId)), status: listedNow.status };
      transcript.push(`*（结束时用账号 ${label} 的登录身份打开设置页的记忆管理接口：HTTP ${listedNow.status}，列出 ${settingsMemory[label].ids.join("、") || "0 条"}）*`, "");
    }
    // AG13 opening 4 (AE-BND-001): background work this case started (a contact import's industry layers call) ends in this
    // case's trace, never in the next case's; the server is idle before the next case restores the snapshot.
    const drained = await drainServer(environment);
    if (drained && !drained.drained) unsupported.push({ reason: `background work was still running ${drained.waitedMs} ms after the case (${drained.inFlight} model call(s) in flight)`, step: -1, word: "isolation" });
    const serverEvents = readServerEvents(paths.traceDir, traceOffset, testCase.id);
    mergedEvents = mergeTrace(log.events, serverEvents);
    fs.writeFileSync(path.join(dir, "world-after.json"), JSON.stringify({ changed: diff.records.map((change) => ({ collection: change.collection, id: change.id, kind: change.kind, after: stripLifecycle(change.after) })), digest: after.digest, tables: diff.tables.map((table) => ({ added: table.added, removed: table.removed, table: table.table })) }, null, 2));
  } catch (caseError) {
    error = caseError instanceof Error ? caseError.stack ?? caseError.message : String(caseError);
    unsupported.push({ reason: `case aborted: ${caseError instanceof Error ? caseError.message : caseError}`, step: -1, word: "error" });
    if (!mergedEvents.length) mergedEvents = mergeTrace(log.events, []);
  } finally {
    await entry?.close().catch(() => undefined);
    await db.end();
  }

  // Assign seqs to the runner-held objects.
  for (const answer of answers as unknown as { _event: TraceEvent; seq: number }[]) {
    const merged = mergedEvents.find((event) => event.origin === "runner" && event.realAt === answer._event.realAt && event.type === "turn.assistant");
    answer.seq = Number(merged?.seq ?? -1);
    delete (answer as { _event?: unknown })._event;
  }
  // Requests (委托) are what the server recorded: one stored chat request per accepted send.
  const sendResponses = mergedEvents.filter((event) => event.type === "http.response" && String(event.path) === "/api/ai/conversations");
  requests.length = 0;
  for (const change of diff.records.filter((item) => item.collection === "orbit_agent_chat_requests" && item.kind === "created")) {
    const requestId = String(change.after?.requestId ?? change.id);
    const response = sendResponses.find((event) => JSON.stringify(event.body ?? null).includes(requestId));
    requests.push({ requestId, seq: Number(response?.seq ?? -1), state: ((change.after?.state ?? change.after?.status) as string) ?? null, status: Number(response?.status ?? 0) });
  }

  const secrets = businessSecretValues(environment);
  const rawTrace = mergedEvents.map((event) => scrubSecrets(JSON.stringify(event), secrets)).join("\n");
  fs.writeFileSync(path.join(dir, "trace.jsonl"), `${rawTrace}\n`);
  const events = rawTrace.split("\n").filter(Boolean).map((line) => JSON.parse(line) as TraceEvent);

  // AG01: the protocol-3 requests as the server stored them, the acks the clients got and what each client shows.
  let entryObservation: EntryObservation | undefined;
  let firstLayer: FirstLayerObservation[] | undefined;
  if (entry) {
    const harness: EntryHarness = entry;
    const seqOf = (types: string[], requestId: string, pick: "first" | "last" = "first") => {
      const found = events.filter((event) => types.includes(event.type) && event.requestId === requestId && event.origin !== "runner");
      const chosen = pick === "first" ? found[0] : found[found.length - 1];
      return chosen ? Number(chosen.seq) : null;
    };
    const known = new Set(Object.values(idMap));
    entryObservation = {
      acks: harness.acks.map((ack) => ({ ...ack, seq: Number(events.find((event) => event.type === "http.response" && event.httpId === ack.httpId)?.seq ?? -1) })),
      clients: Object.fromEntries([...harness.channels.values()].map((channel) => [channel.name, { docs: Object.fromEntries(channel.docs), duplicates: [...channel.duplicates], onlineAtEnd: onlineAtEnd.has(channel.name), received: channel.received.length }])),
      requests: entryRows.map((row) => ({ ...row, endSeq: seqOf(["entry.finished", "entry.cancelled"], row.requestId, "last"), startSeq: seqOf(["entry.started"], row.requestId) })),
    };
    for (const row of entryObservation.requests) {
      const text = row.document?.answer?.text;
      if (!text) continue;
      const refs = row.document.answer?.sourceRefs ?? [];
      const product = new Set([...productIdsIn(refs, known), ...refs.map((ref) => ref.replace(/^[a-z_]+:/u, "")).filter((id) => known.has(id))]);
      answers.push({ citations: [...product].map((id) => fixtureIdOf(id)).filter((id): id is string => Boolean(id)), seq: Number(row.endSeq ?? -1), text });
    }
    // AG03: what the first layer got (context.built, the understand requests) and gave (first_layer.handoff).
    const ofRequest = (type: string, requestId: string) => events.filter((event) => event.type === type && event.requestId === requestId && event.origin !== "runner");
    firstLayer = entryObservation.requests.map((row) => {
      const handoff = ofRequest("first_layer.handoff", row.requestId).pop();
      const built = ofRequest("context.built", row.requestId).pop();
      return {
        contextMessages: built ? Number(built.messages ?? 0) : null,
        contextSeq: built ? Number(built.seq) : null,
        handoff: handoff ? { parts: (handoff.parts ?? []) as HandoffPart[], seq: Number(handoff.seq) } : null,
        message: row.message,
        partResults: row.document?.partResults ?? [],
        receivedSeq: row.receivedSeq,
        requestId: row.requestId,
        understandPrompts: ofRequest("model.request", row.requestId).filter((event) => event.node === "understand").map((event) => ({ seq: Number(event.seq), text: JSON.stringify((event.body as { messages?: unknown } | undefined)?.messages ?? event.body ?? "") })),
      };
    });
    transcript.push("", "## 结果文档（服务端按 requestId 保存的版本）", "");
    for (const row of entryObservation.requests) {
      const partLines = (row.document?.partResults ?? []).filter((part) => part.sourceQuote).map((part) => `  - 「${part.sourceQuote}」：${PART_STATUS_LABEL[part.status] ?? part.status}${part.route ? `（去向 ${part.route}${part.reason ? `，原因 ${part.reason}` : ""}）` : ""}`);
      // AG04: the clickable directions as the clients get them (the buttons are drawn in AG07).
      const SET_KIND: Record<string, string> = { entry: "附带的入口（点了才算提出）", not_understood: "没看懂时给的方向", question: "追问的候选" };
      const SET_STATE: Record<string, string> = { answered: "已回答", open: "还能点", shelved: "已放下（用户没理会）" };
      const setLines = (row.document?.clarifications ?? []).map((set) => `  - ${SET_KIND[set.kind] ?? set.kind}（子目标 ${set.partId}，${SET_STATE[set.state] ?? set.state}${set.selectedOptionId ? `，选了 ${set.selectedOptionId}` : ""}${set.answeredBy ? `，由后面的消息 ${set.answeredBy} 回答` : ""}）：${set.options.map((option) => `${option.optionId}「${option.label}」（${option.capability}${option.ref ? `，指向 ${fixtureIdOf(option.ref.id) ?? option.ref.id}` : ""}）`).join("；") || "没有候选"}`);
      transcript.push(`### 接收顺序 #${row.receivedSeq}：「${row.message}」`, `- requestId：${row.requestId}`, `- 状态：${statusLabel(row.status)}${row.document?.ending?.kind === "stopped_by_user" ? "（这一轮是用户停掉的，不是出错）" : ""}`, ...(row.document?.answer?.basis ? [`- 回答开头的依据行（两端显示在回答上方，可点开记录）：${row.document.answer.basis.text}（${row.document.answer.basis.links.map((link) => link.label).join("、")}）`] : []), ...memoryUseLines(row.document?.answer?.memoryUse, fixtureIdOf), `- 回答：${row.document?.answer?.text ?? "（没有交付内容）"}`, ...blockLines(row.document?.answer?.blocks, fixtureIdOf), ...(row.document?.answer?.web ? [`- 结果文档里的联网记录（服务端代码写的；实际发出的检索词和打开的网页）：检索词 ${row.document.answer.web.queries.map((query) => `「${query.text}」`).join("、") || "无"}；网页 ${row.document.answer.web.pages.map((page) => `${page.url}（${page.readStatus}${page.sourceDate ? `，页面日期 ${page.sourceDate}` : ""}）`).join("、") || "无"}`] : []), ...(setLines.length ? ["- 可点的方向（结果文档里由服务端代码给出，两端照此显示）：", ...setLines] : []), ...(partLines.length ? ["- 拆出的子目标（结果文档里的服务端记录，不是给用户看的文字）：", ...partLines] : []), ...(row.document?.actionPreview ? ["- 这一轮结果文档里的卡（交付时的状态）：", ...cardText(row.document.actionPreview)] : []), "");
    }
    const reconnects = events.filter((event) => event.type === "turn.reconnect");
    if (reconnects.length) {
      transcript.push("## 实时通道重连", "");
      for (const reconnect of reconnects) {
        const name = String(reconnect.client);
        const opened = events.find((event) => event.type === "entry.channel.open" && event.stream === true && Number(event.seq) > Number(reconnect.seq));
        const received = events.filter((event) => event.type === "client.channel_event" && event.client === name && Number(event.seq) > Number(reconnect.seq));
        const repeated = received.filter((event) => event.duplicate === true).map((event) => `#${event.channelSeq}`);
        transcript.push(`- ${name}：重连时带上的最后序号（Last-Event-ID）${reconnect.after}；服务端按 after=${opened?.after ?? "（未见）"} 推送（事件 seq ${opened?.seq ?? "-"}）；重连后收到 ${received.map((event) => `#${event.channelSeq}`).join("、") || "无"}；重复收到：${repeated.join("、") || "无"}`);
      }
      transcript.push("");
    }
    transcript.push("## 两端最后显示的内容", "");
    for (const [name, view] of Object.entries(entryObservation.clients)) {
      transcript.push(`- ${name}（最后${view.onlineAtEnd ? "在线" : "离线"}，经通道收到 ${view.received} 个事件${view.duplicates.length ? `，重复收到序号 ${view.duplicates.join("、")}` : ""}）：`);
      for (const row of entryObservation.requests) {
        const shown = view.docs[row.requestId];
        transcript.push(`  - #${row.receivedSeq}：${shown ? `${statusLabel(shown.status)}；${shown.answer?.text ? `回答 ${shown.answer.text.length} 字` : "无回答"}；${JSON.stringify(shown) === JSON.stringify(row.document) ? "与结果文档一致" : "与结果文档不一致"}` : "没有显示这一条"}`);
      }
    }
    transcript.push("");
  }

  // Cards: card.frozen events (product or fake) and cards the client saw.
  const frozen = events.filter((event) => event.type === "card.frozen");
  const cardIds = [...new Set([...frozen.map((event) => String(event.cardId)), ...cardsSeen.keys()])];
  const afterByKey = new Map(diff.records.map((change) => [`${change.collection}\u0000${change.id}`, change.after]));
  const cards: CardObservation[] = cardIds.map((cardId) => {
    // AG02: a card can be frozen again as a new revision; the latest version is the card.
    const frozenForCard = frozen.filter((event) => event.cardId === cardId);
    const firstFrozen = frozenForCard[0];
    const latestFrozen = frozenForCard[frozenForCard.length - 1];
    // Ledger rows keep the action under `entity`.
    const storedRow = afterByKey.get(`agentActionsV2\u0000${cardId}`) as Record<string, any> | undefined;
    const storedCard = (storedRow?.entity ?? undefined) as Record<string, any> | undefined;
    const kind = (firstFrozen?.cardKind as CardObservation["kind"]) ?? cardsSeen.get(cardId)?.kind ?? "ledger_action";
    const card = (storedCard?.operations ? storedCard : latestFrozen?.card ?? {}) as Record<string, any>;
    const frozenEvent = firstFrozen;
    const ops = kind === "entity_draft" ? normalizeDraftOps(card) : kind === "fake"
      ? ((card.operations ?? []) as Record<string, any>[]).map((op) => ({ op: String(op.op), raw: op, set: op.set ?? {}, target: fixtureIdOf(op.target) ?? op.target ?? null }))
      : normalizeLedgerOps(card, fixtureIdOf);
    const stored = storedCard ?? afterByKey.get(`agent_entity_drafts\u0000${cardId}`) ?? [...afterByKey.entries()].find(([key]) => key.endsWith(`\u0000${cardId}`))?.[1] ?? null;
    const draftState: Record<string, string> = { cancelled: "rejected", created: "completed", pending_confirmation: "awaiting_confirmation", superseded: "superseded" };
    const state = kind === "entity_draft" ? draftState[String(stored?.state)] ?? String(stored?.state ?? card.state ?? "") : String(stored?.status ?? card.status ?? (kind === "fake" ? "awaiting_confirmation" : ""));
    return { cardId, frozenSeq: frozenEvent ? Number(frozenEvent.seq) : null, kind, observedBy: [...(cardsSeen.get(cardId)?.observedBy ?? [])], ops, revisions: Number(card.revision ?? card.payloadVersion ?? 1), state: state || null };
  });

  // Decisions: clicks the runner sent, plus confirmations the server took from typed text.
  const decisions: Observation["decisions"] = [];
  for (const event of events.filter((item) => item.type === "card.decision")) {
    if (event.origin === "runner") {
      // The decision takes effect when the click is sent, before the server writes; use the click's seq.
      const click = events.filter((other) => other.type === "turn.click" && other.cardId === event.cardId && Number(other.seq) < Number(event.seq)).pop();
      decisions.push({ accepted: Boolean(event.accepted), cardId: String(event.cardId), decision: String(event.decision), reason: (event.reason as string) ?? null, ...(event.replayed === true ? { replayed: true } : {}), seq: Number(click?.seq ?? event.seq), status: Number(event.status ?? 0), via: "click" });
    } else if (!events.some((other) => other.origin === "runner" && other.type === "turn.click" && other.cardId === event.cardId && Number(other.seq) < Number(event.seq))) {
      decisions.push({ accepted: true, cardId: String(event.cardId), decision: String(event.decision), reason: null, seq: Number(event.seq), status: 200, via: "text" });
    }
  }

  // Reads of business records, by owner account.
  const reads: ReadObservation[] = [];
  // A conversation (its messages) is not a business record: reading the session the case talks in is not a private read.
  const conversationFixtures = new Set([...world.anchors.filter((record) => record.kind === "conversation").map((record) => record.id), ...patchConversations]);
  for (const event of readsOfTestedSystem(events)) {
    for (const record of (event.records ?? []) as { collection: string | null; id: string | null; owner: string | null; workspace: string | null }[]) {
      if (!record.id) continue;
      const collection = record.collection ?? null;
      // AG03: a contact fixture is the contact and the account's relationship to it (connection:<same id>,
      // written together by initializeAcquiredRelationship); reading either is reading that contact.
      const fixtureId = fixtureIdOf(record.id) ?? (record.id.startsWith("connection:") ? fixtureIdOf(`contact:${record.id.slice("connection:".length)}`) : null);
      if (fixtureId && conversationFixtures.has(fixtureId)) continue;
      if (collection ? !PRIVATE_READ_COLLECTIONS.has(collection) : !fixtureId) continue;
      reads.push({ account: record.owner ? accountByActor.get(record.owner) ?? null : null, collection, fixtureId, owner: record.owner, productId: record.id, seq: Number(event.seq) });
    }
  }

  // AG02 (BND 约定一): a change is external when it is exactly what an external_change step set:
  // every changed field (bookkeeping aside) is one it set, with the value it set.
  const isExternal = (change: (typeof diff.records)[number]) => {
    // AG14: the two memory switches flipped by a `setting` step are the user's own action on the settings page.
    if (userChangedMemorySettings && change.collection === "agentMemories" && change.id === "settings") return true;
    // AG12: a record deleted elsewhere and restored by the tested system afterwards (active at the end) is the system's write.
    if (externalDeletes.has(`${change.collection}\u0000${change.id}`) && (change.kind === "deleted" || (change.kind === "updated" && (change.after as Record<string, unknown> | null)?.__lifecycleState === "deleted"))) return true;
    const set = externalSets.get(`${change.collection}\u0000${change.id}`);
    if (!set || change.kind !== "updated") return false;
    // AG12: a contact edited elsewhere through the field endpoint also records the old value in its field history.
    const fields = change.fields.filter((field) => !/(^|\.)(updatedAt|__lifecycleState|version|revision|activities|deferralCount|fieldHistory)(\.|$|\[)/u.test(field.field));
    return fields.every((field) => {
      const name = field.field.split(".").pop() ?? field.field;
      // AG13: lists of { kind, id } compare whatever order their keys are written in.
      return name in set && sortedJson(set[name]) === sortedJson(field.to);
    });
  };
  const businessChanges = diff.records
    .filter((change) => BUSINESS_COLLECTIONS.has(change.collection))
    .map((change) => ({ ...change, external: isExternal(change), fixtureId: fixtureIdOf(change.id) }));
  fs.writeFileSync(path.join(dir, "db-diff.json"), JSON.stringify({
    records: diff.records.map((change) => ({ ...change, after: stripLifecycle(change.after), before: stripLifecycle(change.before), business: BUSINESS_COLLECTIONS.has(change.collection), fixtureId: fixtureIdOf(change.id) })),
    tables: diff.tables,
  }, null, 2));

  const observation: Observation = {
    account,
    accounts,
    answers,
    businessChanges,
    cards,
    caseId: testCase.id,
    clarifications,
    clicks: events.filter((event) => event.type === "turn.click"),
    decisions,
    diff,
    ...(entryObservation ? { entry: entryObservation } : {}),
    events,
    ...(firstLayer ? { firstLayer } : {}),
    fake: fake !== null,
    fixtureIdOf,
    idMap,
    ...(memoryAfter ? { memoryAfter } : {}),
    ...(memoryEntries ? { memoryEntries, memoryRecalled: memoryRecalledIn(events, fixtureIdOf) } : {}),
    ...(Object.keys(settingsMemory).length ? { settingsMemory } : {}),
    reads,
    ...(Object.keys(recentInteractions).length ? { recentInteractions } : {}),
    requests,
    unsupported,
    ...(views.records.length ? { clientViews: views.records } : {}),
  };
  const otherAccountRecords = loadWorldRecordsForIsolation(world, idMap, observation.account, patchMemory);
  const context: CheckContext = { otherAccountRecords, rawTrace, secrets };
  const checks = runHardChecks(testCase as never, observation, context);
  fs.writeFileSync(path.join(dir, "hard-checks.json"), JSON.stringify({ caseId: testCase.id, checks, hardPass: hardChecksPass(checks), unsupported }, null, 2));
  if (cardEndLines.length) transcript.push("", ...cardEndLines);
  transcript.push("", "---", "", `数据变化（业务）：${businessChanges.length ? businessChanges.map((change) => `${change.fixtureId ?? change.id} ${change.kind}${change.external ? "（别处的修改，不算被测系统写入）" : ""}`).join("、") : "无"}`);
  fs.writeFileSync(path.join(dir, "transcript.md"), `${transcript.join("\n")}\n`);
  const simulated = events.some((event) => ["model.request", "judgment.request", "web.search", "web.fetch", "exec.call"].includes(event.type) && (event.source === "simulated" || event.source === "replay")) || testCase.steps.some((step) => "fault" in step) || replay.length > 0;
  return { account, area, checks, caseId: testCase.id, dir, durationMs: Date.now() - started, error, events, fake: fake !== null, hardPass: hardChecksPass(checks), observation, simulated, unsupported };
}

/**
 * AG14 (memory_recalled): the saved entries the last turn used — the product's memory.recall events after the last
 * message the user sent (a click or a setting change after it is still that turn's aftermath, not a new turn).
 */
export function memoryRecalledIn(events: readonly TraceEvent[], fixtureIdOf: (id: string | null | undefined) => string | null): { id: string; fixtureId: string | null }[] {
  const lastUser = [...events].reverse().find((event) => event.type === "turn.user");
  const from = lastUser ? Number(lastUser.seq) : -1;
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type !== "memory.recall" || event.origin === "runner" || Number(event.seq) <= from) continue;
    for (const id of (event.memories ?? []) as unknown[]) if (typeof id === "string") ids.add(id);
  }
  return [...ids].map((id) => ({ fixtureId: fixtureIdOf(id), id }));
}

/** Records of the other accounts in this world (for no_cross_account): their ids and distinctive strings. */
function loadWorldRecordsForIsolation(world: WorldFixture, idMap: Record<string, string>, account: string, patched: readonly FixtureRecord[] = []): CheckContext["otherAccountRecords"] {
  // AG05: a name or sentence the case's own account also has (account B's 松本彩 next to A's 松本彩) is not
  // evidence of a leak when the answer says it; only what is the other account's alone counts.
  const own = world.anchors.filter((record: FixtureRecord) => record.account === account).flatMap((record) => [record.data.name, record.data.title, record.data.body].filter((value): value is string => typeof value === "string"));
  const ownToo = (text: string) => own.some((value) => value === text || value.includes(text));
  // AG14: a memory entry a patch gave another account (its words must not show up in this account's answers).
  return [...world.anchors, ...patched]
    .filter((record: FixtureRecord) => record.account !== account && record.account !== "platform")
    .map((record) => {
      const texts: string[] = [];
      if (record.kind === "memory" && typeof record.data.content === "string") texts.push(record.data.content);
      if (typeof record.data.name === "string") texts.push(record.data.name);
      if (typeof record.data.body === "string") {
        for (const sentence of String(record.data.body).split(/[。.!?！？]/u)) {
          const clean = sentence.replace(/^[^：:]*[：:]/u, "").trim();
          if (clean.length >= 6) texts.push(clean);
        }
      }
      if (typeof record.data.title === "string") texts.push(record.data.title);
      return { account: record.account, fixtureId: record.id, productId: idMap[record.id] ?? null, texts: texts.filter((text) => !ownToo(text)) };
    });
}

export function gitInfo(cwd: string): { commit: string; short: string; branch: string; dirty: boolean } {
  const run = (args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  return { branch: run(["rev-parse", "--abbrev-ref", "HEAD"]), commit: run(["rev-parse", "HEAD"]), dirty: run(["status", "--porcelain", "--untracked-files=no"]).length > 0, short: run(["rev-parse", "--short=7", "HEAD"]) };
}

export function caseDigest(testCase: EvalCase): string {
  return stableStringify(testCase);
}
