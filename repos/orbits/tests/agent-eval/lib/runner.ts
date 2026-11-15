/**
 * The case runner (eval/README.md §4, §10): restores the world snapshot, acts as the Web/App client
 * through the product's normal endpoints, collects the trace, diffs the database, runs the code checks
 * and writes the per-case files. Steps not yet supported by the product are recorded as
 * "step not supported" and fail the case; the run continues (PLANNER 易错边界 9).
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import pg from "pg";

import type { EvalCase, Step } from "./cases";
import { EvalClient, signSessionCookie } from "./client";
import type { EvalEnvironment } from "./env-guard";
import { baseUrl } from "./eval-env";
import { fakeTurn, FAKE_DEFECTS, type FakeDefect } from "./fake-agent";
import { hardChecksPass, runHardChecks, type CheckContext, type CheckResult } from "./hard-checks";
import { BUSINESS_COLLECTIONS, normalizeDraftOps, normalizeLedgerOps, PRIVATE_READ_COLLECTIONS, productIdsIn, type CardObservation, type Observation, type ReadObservation } from "./observations";
import { evalPaths } from "./paths";
import { serverControl } from "./server";
import { readSeedReport, type SeedReportFile } from "./selfcheck";
import { diffStates, readAllPayloads, readDatabaseState, recordKey, restoreSnapshot, type DatabaseDiff } from "./snapshot";
import { CaseLog, mergeTrace, readServerEvents, scrubSecrets, traceFileSize, type TraceEvent } from "./trace-log";
import { DEFAULT_CLOCK } from "./vocabulary";
import { loadWorld, patchRecords, type FixtureRecord, type WorldFixture } from "./world";
import { createWorldWriter, type WorldWriter } from "./seed";
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

const STEP_SUPPORT_NOTE: Record<string, string> = {
  card_edit: "removing an item from a card is not offered by the current product (AG02/AG07)",
  disconnect: "the current product has no real-time channel to drop (AG01)",
  legacy_update: "old-client compatibility arrives in AG18",
  local_pending_edit: "unsynced App edits are simulated from AG07",
  mcp: "MCP access arrives in AG17",
  mcp_paginate: "MCP access arrives in AG17",
  open_link: "confirmation links arrive in AG17",
  reconnect: "the current product has no real-time channel (AG01)",
  regenerate: "expired cards and regeneration arrive in AG02",
  resume_conversation: "resuming a saved conversation with its progress arrives in AG14",
  review: "the review queue for unknown outcomes arrives in AG02",
  revoke: "revoking a read or a push permission is simulated from AG11/AG16",
  rollback: "rollback arrives in AG18",
  scheduler_tick: "scheduled dispatch driven by the runner arrives in AG15",
  select: "clarification options arrive in AG04",
  stop: "stopping a running turn arrives in AG01",
  sync: "App sync simulation arrives in AG07",
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
}

function accountLabelFor(testCase: EvalCase, world: WorldFixture): string {
  return world.mainAccount;
}

function stripLifecycle(payload: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!payload) return null;
  const { __lifecycleState: _ignored, ...rest } = payload;
  return rest;
}

async function applyPatches(testCase: EvalCase, world: WorldFixture, filePatches: Record<string, any>, writer: WorldWriter, report: SeedReportFile, unsupported: Observation["unsupported"]): Promise<Record<string, string>> {
  const extraIds: Record<string, string> = {};
  for (const name of testCase.patches ?? []) {
    const patch = world.patches[name] ?? filePatches[name];
    if (!patch) continue;
    const records = patchRecords(patch, world.mainAccount);
    for (const record of records) {
      try {
        const before = new Set(Object.keys(writer.report.ids));
        if (record.kind === "contact") await writer.writeContact(record);
        else if (record.kind === "memo") await writer.writeMemo(record);
        else if (record.kind === "todo") await writer.writeTodo(record, false);
        else if (record.kind === "followup") await writer.writeTodo(record, true);
        else if (record.kind === "memory") await writer.writeMemory(record);
        else if (record.kind === "rule") await writer.writeRule(record);
        else if (record.kind === "schedule") await writer.writeSchedule(record);
        else {
          unsupported.push({ reason: `patch ${name}: ${record.kind} records cannot be written by the current product`, step: 0, word: "patch" });
          continue;
        }
        for (const [key, value] of Object.entries(writer.report.ids)) if (!before.has(key) || key === record.id) extraIds[key] = value;
      } catch (error) {
        unsupported.push({ reason: `patch ${name}: writing ${record.id} failed: ${error instanceof Error ? error.message : error}`, step: 0, word: "patch" });
      }
    }
    for (const [section, items] of Object.entries(patch.set ?? {})) {
      for (const item of items as Record<string, unknown>[]) unsupported.push({ reason: `patch ${name}: changing ${section} ${item.id} in place is not supported yet`, step: 0, word: "patch" });
    }
    if (patch.settings) unsupported.push({ reason: `patch ${name}: settings ${JSON.stringify(patch.settings)} are not supported by the current product`, step: 0, word: "patch" });
    if (patch.generate) unsupported.push({ reason: `patch ${name}: generated records arrive with the sprint that needs them (AG08)`, step: 0, word: "patch" });
  }
  void report;
  return extraIds;
}

/** Per-case files and checks. */
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

  restoreSnapshot(environment.database.url, report.snapshot.file);
  if (!ctx.writer || ctx.currentWorld !== testCase.world) {
    await ctx.writer?.close();
    ctx.writer = createWorldWriter(testCase.world, world.clock);
    ctx.currentWorld = testCase.world;
    for (const [label, account] of Object.entries(report.accounts)) {
      if (label !== "HOST") await ctx.writer.ensureAccount({ displayName: loadWorld(testCase.world).accounts[label]?.name ?? label, email: account.email, label, userId: account.userId });
    }
  }
  Object.assign(ctx.writer.report.ids, report.ids);
  const extraIds = await applyPatches(testCase, world, filePatches, ctx.writer, report, unsupported);
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
    unsupported.push({ reason: `setting ${key}: ${JSON.stringify(value)} is not supported by the current product`, step: 0, word: "settings" });
  }

  const db = new pg.Client({ connectionString: environment.database.url });
  await db.connect();
  let diff: DatabaseDiff = { records: [], tables: [] };
  let mergedEvents: TraceEvent[] = [];
  let error: string | undefined;
  const transcript: string[] = [`# ${testCase.id} ${testCase.title}`, "", `- 账号：${account}（${world.accounts[account]?.name ?? ""}） · 世界：${testCase.world} · 时钟：${clock}`, ""];
  const cardsSeen = new Map<string, { kind: CardObservation["kind"]; observedBy: Set<string> }>();
  const answers: Observation["answers"] = [];
  const requests: Observation["requests"] = [];
  let clarifications = 0;
  let fake: FakeDefect | null = null;
  const stepRecords: StepRecord[] = [];
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

    await serverControl(environment, "context", { account, caseId: testCase.id, clock, replay, runId: ctx.runId });
    const traceOffset = traceFileSize(paths.traceDir);
    const secret = environment.env.AUTH_SECRET;
    const cookies = new Map<string, string>();
    const cookieFor = async (label: string) => {
      if (!cookies.has(label)) cookies.set(label, await signSessionCookie({ email: report.accounts[label].email, name: world.accounts[label]?.name ?? label, secret, userId: accounts[label] }));
      return cookies.get(label)!;
    };
    let conversation: ConversationState = { history: [], messageRevision: 0, sessionId: `session_${randomUUID()}`, started: false };
    const sentBodies = new Map<number, unknown>();
    const clientFor = async (name: string) => new EvalClient(baseUrl(environment), log, await cookieFor(account), (name as "web" | "app") ?? "web");

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
      if (step.refs?.length) unsupported.push({ reason: "@ references beyond contacts arrive in AG05/AG11; sent without them", step: index, word: "user.refs" });
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
      if (step.while_running) unsupported.push({ reason: "while_running needs a request that can be overtaken mid-turn (AG01)", step: index, word: "while_running" });
      switch (word) {
        case "user":
          await sendUser(index, step);
          return;
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
          if (!["model", "understand", "executor"].includes(step.fault?.where)) unsupported.push({ reason: `fault point "${step.fault?.where}" has no consumer in the current product`, step: index, word });
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
          conversation = { history: [], messageRevision: 0, sessionId: `session_${randomUUID()}`, started: false };
          log.push({ sessionId: conversation.sessionId, step: index, type: "turn.new_conversation" });
          transcript.push("*（新开对话）*", "");
          return;
        case "switch_account": {
          const label = String(step.switch_account);
          if (!accounts[label]) {
            unsupported.push({ reason: `account ${label} does not exist in ${testCase.world}`, step: index, word });
            return;
          }
          account = label;
          conversation = { history: [], messageRevision: 0, sessionId: `session_${randomUUID()}`, started: false };
          log.push({ account: label, step: index, type: "turn.switch_account" });
          transcript.push(`*（换成账号 ${label}）*`, "");
          return;
        }
        case "click": {
          const selector = step.click?.card ?? "last";
          const ids = [...cardsSeen.keys()];
          const cardId = selector === "last" ? ids[ids.length - 1] : ids[Number(selector) - 1];
          const decision = String(step.click?.decision);
          log.push({ cardId: cardId ?? null, client: step.client ?? "web", decision, step: index, type: "turn.click" });
          transcript.push(`**用户点击**：${decision}${cardId ? `（${cardId}）` : "（没有可点的卡）"}`, "");
          if (step.click?.revision !== undefined) unsupported.push({ reason: "clicking with an older card revision arrives in AG02", step: index, word: "click.revision" });
          if (!cardId) return;
          const client = await clientFor(step.client ?? "web");
          const kind = cardsSeen.get(cardId)!.kind;
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
          transcript.push(`*（重发第 ${target + 1} 步）*`, "");
          await sendUser(index, testCase.steps[target], original);
          return;
        }
        case "concurrent": {
          log.push({ step: index, type: "turn.concurrent" });
          await Promise.all((step.concurrent as Step[]).map((sub, offset) => runStep(sub, index * 100 + offset)));
          return;
        }
        case "external_change": {
          log.push({ change: step.external_change, step: index, type: "turn.external_change" });
          unsupported.push({ reason: "external changes are written by the runner from AG02 on", step: index, word });
          return;
        }
        case "setting":
          unsupported.push({ reason: `setting ${JSON.stringify(step.setting)} is not supported by the current product`, step: index, word });
          return;
        default:
          log.push({ step: index, type: `turn.${word}`, value: step[word] });
          unsupported.push({ reason: STEP_SUPPORT_NOTE[word] ?? "step not supported by the current product", step: index, word });
      }
    };

    for (const [index, step] of testCase.steps.entries()) {
      try {
        await runStep(step, index);
      } catch (stepError) {
        log.push({ error: stepError instanceof Error ? stepError.message : String(stepError), step: index, type: "error" });
        unsupported.push({ reason: `step failed: ${stepError instanceof Error ? stepError.message : stepError}`, step: index, word: "error" });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    const serverState = await serverControl<{ faults: { where: string; kind: string; applied: number }[] }>(environment, "state");
    for (const fault of serverState.faults ?? []) {
      if (!fault.applied) unsupported.push({ reason: `fault ${fault.where}/${fault.kind} was armed but never reached`, step: -1, word: "fault" });
    }
    const after = await readDatabaseState(db);
    diff = await diffStates(db, before, beforePayloads, after);
    const serverEvents = readServerEvents(paths.traceDir, traceOffset, testCase.id);
    mergedEvents = mergeTrace(log.events, serverEvents);
    fs.writeFileSync(path.join(dir, "world-after.json"), JSON.stringify({ changed: diff.records.map((change) => ({ collection: change.collection, id: change.id, kind: change.kind, after: stripLifecycle(change.after) })), digest: after.digest, tables: diff.tables.map((table) => ({ added: table.added, removed: table.removed, table: table.table })) }, null, 2));
  } catch (caseError) {
    error = caseError instanceof Error ? caseError.stack ?? caseError.message : String(caseError);
    unsupported.push({ reason: `case aborted: ${caseError instanceof Error ? caseError.message : caseError}`, step: -1, word: "error" });
    if (!mergedEvents.length) mergedEvents = mergeTrace(log.events, []);
  } finally {
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
    requests.push({ requestId, seq: Number(response?.seq ?? -1), state: (change.after?.state as string) ?? null, status: Number(response?.status ?? 0) });
  }

  const secrets = businessSecretValues(environment);
  const rawTrace = mergedEvents.map((event) => scrubSecrets(JSON.stringify(event), secrets)).join("\n");
  fs.writeFileSync(path.join(dir, "trace.jsonl"), `${rawTrace}\n`);
  const events = rawTrace.split("\n").filter(Boolean).map((line) => JSON.parse(line) as TraceEvent);

  // Cards: card.frozen events (product or fake) and cards the client saw.
  const frozen = events.filter((event) => event.type === "card.frozen");
  const cardIds = [...new Set([...frozen.map((event) => String(event.cardId)), ...cardsSeen.keys()])];
  const afterByKey = new Map(diff.records.map((change) => [`${change.collection}\u0000${change.id}`, change.after]));
  const cards: CardObservation[] = cardIds.map((cardId) => {
    const frozenEvent = frozen.find((event) => event.cardId === cardId);
    const kind = (frozenEvent?.cardKind as CardObservation["kind"]) ?? cardsSeen.get(cardId)?.kind ?? "ledger_action";
    const card = (frozenEvent?.card ?? {}) as Record<string, any>;
    const ops = kind === "entity_draft" ? normalizeDraftOps(card) : kind === "fake"
      ? ((card.operations ?? []) as Record<string, any>[]).map((op) => ({ op: String(op.op), raw: op, set: op.set ?? {}, target: fixtureIdOf(op.target) ?? op.target ?? null }))
      : normalizeLedgerOps(card, fixtureIdOf);
    const stored = afterByKey.get(`agentActionsV2\u0000${cardId}`) ?? afterByKey.get(`agent_entity_drafts\u0000${cardId}`) ?? [...afterByKey.entries()].find(([key]) => key.endsWith(`\u0000${cardId}`))?.[1] ?? null;
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
      decisions.push({ accepted: Boolean(event.accepted), cardId: String(event.cardId), decision: String(event.decision), reason: (event.reason as string) ?? null, seq: Number(click?.seq ?? event.seq), status: Number(event.status ?? 0), via: "click" });
    } else if (!events.some((other) => other.origin === "runner" && other.type === "turn.click" && other.cardId === event.cardId && Number(other.seq) < Number(event.seq))) {
      decisions.push({ accepted: true, cardId: String(event.cardId), decision: String(event.decision), reason: null, seq: Number(event.seq), status: 200, via: "text" });
    }
  }

  // Reads of business records, by owner account.
  const reads: ReadObservation[] = [];
  for (const event of events.filter((item) => item.type === "read.result")) {
    for (const record of (event.records ?? []) as { collection: string | null; id: string | null; owner: string | null; workspace: string | null }[]) {
      if (!record.id) continue;
      const collection = record.collection ?? null;
      const fixtureId = fixtureIdOf(record.id);
      if (collection ? !PRIVATE_READ_COLLECTIONS.has(collection) : !fixtureId) continue;
      reads.push({ account: record.owner ? accountByActor.get(record.owner) ?? null : null, collection, fixtureId, owner: record.owner, productId: record.id, seq: Number(event.seq) });
    }
  }

  const externalKeys = new Set<string>();
  const businessChanges = diff.records
    .filter((change) => BUSINESS_COLLECTIONS.has(change.collection))
    .map((change) => ({ ...change, external: externalKeys.has(recordKey(change)), fixtureId: fixtureIdOf(change.id) }));
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
    events,
    fake: fake !== null,
    fixtureIdOf,
    idMap,
    reads,
    requests,
    unsupported,
  };
  const otherAccountRecords = loadWorldRecordsForIsolation(world, idMap, observation.account);
  const context: CheckContext = { otherAccountRecords, rawTrace, secrets };
  const checks = runHardChecks(testCase as never, observation, context);
  fs.writeFileSync(path.join(dir, "hard-checks.json"), JSON.stringify({ caseId: testCase.id, checks, hardPass: hardChecksPass(checks), unsupported }, null, 2));
  transcript.push("", "---", "", `数据变化（业务）：${businessChanges.length ? businessChanges.map((change) => `${change.fixtureId ?? change.id} ${change.kind}`).join("、") : "无"}`);
  fs.writeFileSync(path.join(dir, "transcript.md"), `${transcript.join("\n")}\n`);
  const simulated = events.some((event) => ["model.request", "judgment.request", "web.search", "web.fetch", "exec.call"].includes(event.type) && (event.source === "simulated" || event.source === "replay")) || testCase.steps.some((step) => "fault" in step) || replay.length > 0;
  return { account, area, checks, caseId: testCase.id, dir, durationMs: Date.now() - started, error, events, fake: fake !== null, hardPass: hardChecksPass(checks), observation, simulated, unsupported };
}

/** Records of the other accounts in this world (for no_cross_account): their ids and distinctive strings. */
function loadWorldRecordsForIsolation(world: WorldFixture, idMap: Record<string, string>, account: string): CheckContext["otherAccountRecords"] {
  return world.anchors
    .filter((record: FixtureRecord) => record.account !== account && record.account !== "platform")
    .map((record) => {
      const texts: string[] = [];
      if (typeof record.data.name === "string") texts.push(record.data.name);
      if (typeof record.data.body === "string") {
        for (const sentence of String(record.data.body).split(/[。.!?！？]/u)) {
          const clean = sentence.replace(/^[^：:]*[：:]/u, "").trim();
          if (clean.length >= 6) texts.push(clean);
        }
      }
      if (typeof record.data.title === "string") texts.push(record.data.title);
      return { account: record.account, fixtureId: record.id, productId: idMap[record.id] ?? null, texts };
    });
}

export function gitInfo(cwd: string): { commit: string; short: string; branch: string; dirty: boolean } {
  const run = (args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  return { branch: run(["rev-parse", "--abbrev-ref", "HEAD"]), commit: run(["rev-parse", "HEAD"]), dirty: run(["status", "--porcelain", "--untracked-files=no"]).length > 0, short: run(["rev-parse", "--short=7", "HEAD"]) };
}

export function caseDigest(testCase: EvalCase): string {
  return stableStringify(testCase);
}
