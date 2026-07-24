# Agent Action Ledger（操作账本领域模型）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `repos/orbits` 新增"操作账本"领域模型：复合决策条目（多个可勾选子操作）+ 六态生命周期（等待确认/正在执行/已完成/部分失败/失败/已撤销 + 稍后处理）+ 撤销/幂等重试 + 只存草稿硬约束，并暴露 mock-first API；同时把 iOrbit 历史侧边栏宽度抽成共享常量。

**Architecture:** 新模块 `features/agent/ledger/` 完全镜像既有 agent-action-queue 的 contract → fixtures → mock-service → service-factory → API route 模式。**不改动 `shared/domain/contracts.ts` 和既有 agent contract 的任何导出**（GitNexus 影响分析：contracts.ts 为 CRITICAL，67 个直接导入方；账本作为纯新增模块把爆炸半径降为零）。live 模式先提供"未配置"存根，Postgres provider 留到后续。

**Tech Stack:** Next.js 16 App Router、TypeScript、`node --test` + tsx、既有 `shared/api/envelope` + `shared/services/module-mode`。

## Global Constraints

- **只存草稿硬约束**：任何消息类子操作 `autoSendCapable: false`（类型级字面量），provenance 含 `messageAutoSendExecuted: false`。确认执行 ≠ 发送邮件/消息。
- **证据 chip 种类不含语音记录**（用户 2026-07-24 拍板：语音记录暂不做）。合法种类仅 `"event_material" | "chat_summary" | "calendar_signal" | "contact_note"`。
- **禁止修改** `shared/domain/contracts.ts`、`features/agent/contract.ts` 的已有导出（CRITICAL 影响半径）。从 `../contract` 只做 type import 复用。
- 幂等：每个子操作携带 `idempotencyKey`；重试只执行 `failed` 的子操作，`succeeded` 的子操作执行计数不得增加（设计稿文案"成功项不会重复执行"）。
- 不重构导航/不改 iOrbit 界面结构；本计划对 UI 的唯一改动是侧边栏宽度常量抽取（Task 6）。
- 所有命令在 `/Users/li/work/orbit/repos/orbits` 下执行，除非另有说明。
- 提交前运行 `(cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit)` 检查影响范围只落在预期文件。
- Commit 信息以 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 结尾。

---

## File Structure

```
features/agent/ledger/
  contract.ts        # DTO、状态机枚举、错误定义、failure→AppError 助手
  fixtures.ts        # 6 条设计稿派生的账本条目 + provenance
  service.ts         # AgentLedgerService 接口
  mock-service.ts    # 内存状态机实现（list/confirm/defer/undo/retry/updateDraft）
  live-service.ts    # 未配置存根（每个方法返回 LIVE_STORE_UNCONFIGURED failure）
features/agent/service-factory.ts   # [modify] 注册 agentLedgerServiceFactory
app/api/agent/ledger/route.ts                    # GET 列表
app/api/agent/ledger/[id]/transition/route.ts    # POST confirm/defer/undo/retry
app/api/agent/ledger/[id]/draft/route.ts         # PATCH 草稿编辑
app/(app)/app/orbit-layout-constants.ts          # ORBIT_LEFT_SIDEBAR_WIDTH 共享常量
app/(app)/app/agent/orbit-real-agent.tsx         # [modify] 默认宽度改用共享常量
tests/capabilities/agent-action-ledger-contract.test.ts
tests/capabilities/agent-action-ledger-fixtures.test.ts
tests/capabilities/agent-action-ledger-mock.test.ts
tests/capabilities/agent-action-ledger-factory.test.ts
tests/api/agent-action-ledger-routes.test.ts
tests/ui/orbit-sidebar-width-constant.test.ts
package.json                                     # [modify] lint tsc 列表追加新文件
```

---

### Task 1: Ledger contract

**Files:**
- Create: `features/agent/ledger/contract.ts`
- Test: `tests/capabilities/agent-action-ledger-contract.test.ts`

**Interfaces:**
- Consumes: `AgentActionSourceReference`（type import，来自 `features/agent/contract.ts`）、`AppError`/`AppErrorCode`、`ApiErrorContext`/`RUNTIME_BOUNDARY_HEADER_VALUES`、`FeatureMode`。
- Produces（后续 Task 依赖的确切名字）：`AGENT_LEDGER_ENTRY_STATUSES`、`AGENT_LEDGER_OPERATION_TYPES`、`AGENT_LEDGER_OPERATION_STATUSES`、`AGENT_LEDGER_EVIDENCE_KINDS`、`AGENT_LEDGER_TRANSITIONS`、`AGENT_LEDGER_ERROR_CODES`、`AGENT_LEDGER_ERROR_DEFINITIONS`、types `AgentLedgerEntryStatus`、`AgentLedgerOperationType`、`AgentLedgerOperationStatus`、`AgentLedgerEvidenceKind`、`AgentLedgerTransition`、`AgentLedgerErrorCode`、`AgentLedgerProvenance`、`AgentLedgerEvidenceChip`、`AgentLedgerOperation`、`AgentLedgerEntry`、`AgentLedgerListInput`、`AgentLedgerTransitionInput`、`AgentLedgerDraftUpdateInput`、`AgentLedgerListPayload`、`AgentLedgerMutationPayload`、`AgentLedgerListResult`、`AgentLedgerMutationResult`、`AgentLedgerFailure`、functions `agentLedgerFailureToAppError`、`agentLedgerFailureContext`。

- [ ] **Step 1: Write the failing test**

创建 `tests/capabilities/agent-action-ledger-contract.test.ts`：

```ts
/**
 * Agent action ledger contract 测试。
 *
 * 验证账本状态机枚举、错误定义完备性、证据种类白名单（不含语音记录）
 * 和 failure→AppError 转换。
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_LEDGER_ENTRY_STATUSES,
  AGENT_LEDGER_ERROR_CODES,
  AGENT_LEDGER_ERROR_DEFINITIONS,
  AGENT_LEDGER_EVIDENCE_KINDS,
  AGENT_LEDGER_OPERATION_STATUSES,
  AGENT_LEDGER_OPERATION_TYPES,
  AGENT_LEDGER_TRANSITIONS,
  agentLedgerFailureContext,
  agentLedgerFailureToAppError,
  type AgentLedgerFailure,
} from "../../features/agent/ledger/contract";

test("ledger entry statuses cover the six-state lifecycle plus deferred", () => {
  assert.deepEqual(
    [...AGENT_LEDGER_ENTRY_STATUSES],
    [
      "awaiting_confirmation",
      "executing",
      "completed",
      "partially_failed",
      "failed",
      "undone",
      "deferred",
    ],
  );
});

test("operation statuses cover selection, execution, and undo", () => {
  assert.deepEqual(
    [...AGENT_LEDGER_OPERATION_STATUSES],
    ["pending", "skipped", "succeeded", "failed", "undone"],
  );
});

test("operation types cover the design-derived write operations", () => {
  assert.deepEqual(
    [...AGENT_LEDGER_OPERATION_TYPES],
    [
      "save_meeting_note",
      "create_followup_reminder",
      "save_message_draft",
      "archive_contacts",
      "generate_meeting_brief",
      "sync_event_to_calendar",
    ],
  );
});

test("evidence kinds exclude voice recordings per 2026-07-24 decision", () => {
  assert.deepEqual(
    [...AGENT_LEDGER_EVIDENCE_KINDS],
    ["event_material", "chat_summary", "calendar_signal", "contact_note"],
  );
  assert.ok(!AGENT_LEDGER_EVIDENCE_KINDS.some((kind) => /voice|audio/.test(kind)));
});

test("transitions are exactly confirm, defer, undo, retry", () => {
  assert.deepEqual([...AGENT_LEDGER_TRANSITIONS], ["confirm", "defer", "undo", "retry"]);
});

test("every error code has a definition with app code, message, and recovery", () => {
  for (const code of AGENT_LEDGER_ERROR_CODES) {
    const definition = AGENT_LEDGER_ERROR_DEFINITIONS[code];
    assert.equal(definition.code, code);
    assert.ok(definition.appCode.length > 0);
    assert.ok(definition.message.length > 0);
    assert.ok(definition.recovery.length > 0);
  }
});

test("failure converts to AppError and API error context", () => {
  const failure: AgentLedgerFailure = {
    success: false,
    error: {
      ...AGENT_LEDGER_ERROR_DEFINITIONS.AGENT_LEDGER_ENTRY_NOT_FOUND,
      state: "failure",
      provenance: {
        source: "fixture:test",
        sourceLabel: "test",
        evidenceIds: [],
        collectedAt: "2026-07-24T00:00:00.000+09:00",
        privacy: "demo-agent-ledger-only",
        generationMethod: "fixture",
        autonomousExecutionStarted: false,
        externalSideEffectExecuted: false,
        externalNetworkRequested: false,
        messageAutoSendExecuted: false,
        liveDatabaseReadExecuted: false,
        liveDatabaseWriteExecuted: false,
      },
      evidenceIds: [],
    },
  };

  const appError = agentLedgerFailureToAppError(failure);
  assert.equal(appError.code, "NOT_FOUND");

  const context = agentLedgerFailureContext(failure, "mock");
  assert.equal(context.service, "agent-action-ledger");
  assert.equal(context.agentLedgerErrorCode, "AGENT_LEDGER_ENTRY_NOT_FOUND");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/capabilities/agent-action-ledger-contract.test.ts`
Expected: FAIL —— `Cannot find module '../../features/agent/ledger/contract'`

- [ ] **Step 3: Write the contract**

创建 `features/agent/ledger/contract.ts`：

```ts
import type { ApiErrorContext } from "../../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../../shared/api/envelope";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../../shared/errors/app-error";
import type { AgentActionSourceReference } from "../contract";

// Agent action ledger contract 描述"操作账本"：每一次 AI 写操作都记录在这里，
// 可追溯、可撤销。条目是复合决策（多个可勾选子操作），确认后逐子操作执行。
// 硬约束：消息类子操作只存草稿，不会自动发送（2026-07 定稿"A 档执行/邮件止于草稿"）。

export const AGENT_LEDGER_ENTRY_STATUSES = [
  "awaiting_confirmation",
  "executing",
  "completed",
  "partially_failed",
  "failed",
  "undone",
  "deferred",
] as const;

export const AGENT_LEDGER_OPERATION_STATUSES = [
  "pending",
  "skipped",
  "succeeded",
  "failed",
  "undone",
] as const;

export const AGENT_LEDGER_OPERATION_TYPES = [
  "save_meeting_note",
  "create_followup_reminder",
  "save_message_draft",
  "archive_contacts",
  "generate_meeting_brief",
  "sync_event_to_calendar",
] as const;

// 证据种类白名单。语音记录按 2026-07-24 决定暂不纳入。
export const AGENT_LEDGER_EVIDENCE_KINDS = [
  "event_material",
  "chat_summary",
  "calendar_signal",
  "contact_note",
] as const;

export const AGENT_LEDGER_TRANSITIONS = [
  "confirm",
  "defer",
  "undo",
  "retry",
] as const;

export const AGENT_LEDGER_ERROR_CODES = [
  "AGENT_LEDGER_ENTRY_ID_REQUIRED",
  "AGENT_LEDGER_ENTRY_NOT_FOUND",
  "AGENT_LEDGER_NO_OPERATIONS_SELECTED",
  "AGENT_LEDGER_TRANSITION_INVALID",
  "AGENT_LEDGER_DRAFT_NOT_EDITABLE",
  "AGENT_LEDGER_MOCK_FAILED",
  "AGENT_LEDGER_LIVE_STORE_UNCONFIGURED",
] as const;

export type AgentLedgerEntryStatus =
  (typeof AGENT_LEDGER_ENTRY_STATUSES)[number];
export type AgentLedgerOperationStatus =
  (typeof AGENT_LEDGER_OPERATION_STATUSES)[number];
export type AgentLedgerOperationType =
  (typeof AGENT_LEDGER_OPERATION_TYPES)[number];
export type AgentLedgerEvidenceKind =
  (typeof AGENT_LEDGER_EVIDENCE_KINDS)[number];
export type AgentLedgerTransition = (typeof AGENT_LEDGER_TRANSITIONS)[number];
export type AgentLedgerErrorCode = (typeof AGENT_LEDGER_ERROR_CODES)[number];

// provenance 是账本的安全说明：所有外部副作用与自动发送固定为 false。
export interface AgentLedgerProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-agent-ledger-only" | "live-agent-ledger-preview";
  generationMethod:
    | "fixture"
    | "rule-based-ledger-transition"
    | "live-store-query";
  autonomousExecutionStarted: false;
  externalSideEffectExecuted: false;
  externalNetworkRequested: false;
  messageAutoSendExecuted: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: boolean;
}

// 证据 chip 对应设计稿"建议基于什么信息?"里的来源标签。
export interface AgentLedgerEvidenceChip {
  kind: AgentLedgerEvidenceKind;
  label: string;
  evidenceId: string;
}

// 子操作是账本的最小执行单元；重试按 idempotencyKey 去重，成功项不重复执行。
export interface AgentLedgerOperation {
  operationId: string;
  operationType: AgentLedgerOperationType;
  title: string;
  effectSummary: string;
  selectedByDefault: boolean;
  status: AgentLedgerOperationStatus;
  idempotencyKey: string;
  draftPreview?: string;
  // mock 执行结果开关，仅 fixtures/mock-service 使用；live 实现忽略。
  mockOutcome?: "succeed" | "fail";
  autoSendCapable: false;
}

export interface AgentLedgerEntry {
  entryId: string;
  title: string;
  contactName?: string;
  organization?: string;
  status: AgentLedgerEntryStatus;
  whyNow: string;
  evidenceChips: readonly AgentLedgerEvidenceChip[];
  operations: readonly AgentLedgerOperation[];
  undoable: boolean;
  createdAt: string;
  updatedAt: string;
  sourceRefs: readonly AgentActionSourceReference[];
  evidenceIds: readonly string[];
  provenance: AgentLedgerProvenance;
  autonomousExecutionStarted: false;
  externalSideEffectExecuted: false;
  messageAutoSendExecuted: false;
}

export interface AgentLedgerListInput {
  status?: AgentLedgerEntryStatus | string | null;
  scenario?: "success" | "empty" | "failure" | string | null;
}

export interface AgentLedgerTransitionInput {
  entryId?: string | null;
  transition?: AgentLedgerTransition | string | null;
  selectedOperationIds?: readonly string[] | null;
  actorLabel?: string | null;
  scenario?: "success" | "failure" | string | null;
}

export interface AgentLedgerDraftUpdateInput {
  entryId?: string | null;
  operationId?: string | null;
  draftText?: string | null;
}

export interface AgentLedgerListPayload {
  state: "success" | "empty";
  entries: readonly AgentLedgerEntry[];
  summary: string;
  provenance: AgentLedgerProvenance;
  nextAction: string;
}

export interface AgentLedgerMutationPayload {
  state: "success";
  entry: AgentLedgerEntry;
  transition: AgentLedgerTransition | "update_draft";
  actorLabel: string;
  decidedAt: string;
  provenance: AgentLedgerProvenance;
  nextAction: string;
}

export interface AgentLedgerErrorDefinition {
  code: AgentLedgerErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const AGENT_LEDGER_ERROR_DEFINITIONS = {
  AGENT_LEDGER_ENTRY_ID_REQUIRED: {
    code: "AGENT_LEDGER_ENTRY_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A ledger entry id is required before applying a transition.",
    recovery:
      "Keep ledger controls disabled until a known ledger entry is selected.",
  },
  AGENT_LEDGER_ENTRY_NOT_FOUND: {
    code: "AGENT_LEDGER_ENTRY_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No ledger entry matches that id.",
    recovery:
      "Render the missing-entry envelope and avoid autonomous execution or external side effects.",
  },
  AGENT_LEDGER_NO_OPERATIONS_SELECTED: {
    code: "AGENT_LEDGER_NO_OPERATIONS_SELECTED",
    appCode: "VALIDATION_ERROR",
    message: "Confirming a ledger entry requires at least one selected operation.",
    recovery:
      "Keep the confirm control disabled until at least one operation checkbox is selected.",
  },
  AGENT_LEDGER_TRANSITION_INVALID: {
    code: "AGENT_LEDGER_TRANSITION_INVALID",
    appCode: "CONFLICT",
    message: "That transition is not allowed from the entry's current status.",
    recovery:
      "Refresh the ledger list and only offer transitions valid for the entry's current status.",
  },
  AGENT_LEDGER_DRAFT_NOT_EDITABLE: {
    code: "AGENT_LEDGER_DRAFT_NOT_EDITABLE",
    appCode: "CONFLICT",
    message:
      "Only save_message_draft operations on awaiting or deferred entries can be edited.",
    recovery:
      "Hide the draft editor once an entry has started executing; drafts stay drafts and are never auto-sent.",
  },
  AGENT_LEDGER_MOCK_FAILED: {
    code: "AGENT_LEDGER_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The mock agent ledger boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry autonomous execution or external side effects.",
  },
  AGENT_LEDGER_LIVE_STORE_UNCONFIGURED: {
    code: "AGENT_LEDGER_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live agent ledger store is not configured.",
    recovery:
      "Configure ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before using the live agent ledger.",
  },
} as const satisfies Record<AgentLedgerErrorCode, AgentLedgerErrorDefinition>;

export interface AgentLedgerListSuccess {
  success: true;
  data: AgentLedgerListPayload;
}

export interface AgentLedgerMutationSuccess {
  success: true;
  data: AgentLedgerMutationPayload;
}

export interface AgentLedgerFailure {
  success: false;
  error: AgentLedgerErrorDefinition & {
    state: "failure";
    provenance: AgentLedgerProvenance;
    evidenceIds: readonly string[];
  };
}

export type AgentLedgerListResult = AgentLedgerListSuccess | AgentLedgerFailure;
export type AgentLedgerMutationResult =
  | AgentLedgerMutationSuccess
  | AgentLedgerFailure;

export function agentLedgerFailureToAppError(
  failure: AgentLedgerFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function agentLedgerFailureContext(
  failure: AgentLedgerFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    agentLedgerErrorCode: failure.error.code,
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: failure.error.provenance.sourceLabel,
    service: "agent-action-ledger",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx tests/capabilities/agent-action-ledger-contract.test.ts`
Expected: PASS（7 项）。若 `ApiErrorContext` 不接受 `agentLedgerErrorCode` 自定义键（tsx 不做类型检查，运行会过；lint 才会暴露），检查 `shared/api/envelope.ts` 中 `ApiErrorContext` 是否为开放索引类型——`agentActionQueueFailureContext` 用了同样的自定义键模式，照抄即可。

- [ ] **Step 5: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add features/agent/ledger/contract.ts tests/capabilities/agent-action-ledger-contract.test.ts
git commit -m "feat(agent): add action ledger contract with six-state lifecycle

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Design-derived fixtures

**Files:**
- Create: `features/agent/ledger/fixtures.ts`
- Test: `tests/capabilities/agent-action-ledger-fixtures.test.ts`

**Interfaces:**
- Consumes: Task 1 的全部 contract 类型。
- Produces: `AGENT_LEDGER_FIXTURE_SOURCE`（string 常量）、`mockAgentLedgerProvenance: AgentLedgerProvenance`、`agentLedgerEntryFixtures: readonly AgentLedgerEntry[]`（6 条，entryId 依次为 `ledger-followup-alex-chen`、`ledger-reply-xuwei-intro`、`ledger-brief-tomorrow-meeting`、`ledger-archive-six-contacts`、`ledger-sync-three-events`、`ledger-auto-followup-yamada`）。

- [ ] **Step 1: Write the failing test**

创建 `tests/capabilities/agent-action-ledger-fixtures.test.ts`：

```ts
/**
 * Agent action ledger fixture 测试。
 *
 * 验证 6 条设计稿派生条目覆盖全部状态、部分失败条目同时含成功与失败子操作、
 * 草稿子操作只存草稿（autoSendCapable false）、证据 chip 不含语音。
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_LEDGER_ENTRY_STATUSES,
  AGENT_LEDGER_EVIDENCE_KINDS,
} from "../../features/agent/ledger/contract";
import {
  AGENT_LEDGER_FIXTURE_SOURCE,
  agentLedgerEntryFixtures,
  mockAgentLedgerProvenance,
} from "../../features/agent/ledger/fixtures";

test("fixtures provide six entries with unique ids", () => {
  assert.equal(agentLedgerEntryFixtures.length, 6);
  const ids = new Set(agentLedgerEntryFixtures.map((entry) => entry.entryId));
  assert.equal(ids.size, 6);
});

test("fixtures cover awaiting, executing, completed, partially_failed, and undone", () => {
  const statuses = new Set(agentLedgerEntryFixtures.map((entry) => entry.status));
  for (const expected of [
    "awaiting_confirmation",
    "executing",
    "completed",
    "partially_failed",
    "undone",
  ]) {
    assert.ok(statuses.has(expected as (typeof AGENT_LEDGER_ENTRY_STATUSES)[number]));
  }
});

test("every entry has at least one operation and consistent provenance", () => {
  for (const entry of agentLedgerEntryFixtures) {
    assert.ok(entry.operations.length >= 1, entry.entryId);
    assert.equal(entry.provenance.source, AGENT_LEDGER_FIXTURE_SOURCE);
    assert.equal(entry.messageAutoSendExecuted, false);
    assert.equal(entry.externalSideEffectExecuted, false);
  }
  assert.equal(mockAgentLedgerProvenance.messageAutoSendExecuted, false);
});

test("the partial-failure fixture mixes succeeded and failed operations", () => {
  const entry = agentLedgerEntryFixtures.find(
    (candidate) => candidate.entryId === "ledger-sync-three-events",
  );
  assert.ok(entry);
  assert.equal(entry.status, "partially_failed");
  const opStatuses = entry.operations.map((operation) => operation.status);
  assert.ok(opStatuses.includes("succeeded"));
  assert.ok(opStatuses.includes("failed"));
});

test("message draft operations carry a draft preview and can never auto-send", () => {
  const drafts = agentLedgerEntryFixtures
    .flatMap((entry) => entry.operations)
    .filter((operation) => operation.operationType === "save_message_draft");
  assert.ok(drafts.length >= 1);
  for (const draft of drafts) {
    assert.equal(draft.autoSendCapable, false);
    assert.ok((draft.draftPreview ?? "").length > 0);
  }
});

test("evidence chips only use whitelisted kinds", () => {
  for (const entry of agentLedgerEntryFixtures) {
    for (const chip of entry.evidenceChips) {
      assert.ok(AGENT_LEDGER_EVIDENCE_KINDS.includes(chip.kind));
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/capabilities/agent-action-ledger-fixtures.test.ts`
Expected: FAIL —— `Cannot find module '../../features/agent/ledger/fixtures'`

- [ ] **Step 3: Write the fixtures**

创建 `features/agent/ledger/fixtures.ts`。内容取自设计稿 "Orbit Redesign v2"（Today 页 + All actions 页文案），时间戳固定保证测试确定性：

```ts
/**
 * Agent action ledger fixture。
 *
 * 6 条条目对应设计稿 All actions 列表：跟进 Alex Chen（等待确认，3 项子操作）、
 * 回复徐薇的引荐请求（等待确认）、生成明早会议简报（正在执行）、
 * 昨晚 6 位联系人归档（已完成，可撤销）、同步 3 场活动到日历（部分失败，可重试）、
 * 自动跟进「山田千寻」提醒（已撤销）。
 */
import type {
  AgentLedgerEntry,
  AgentLedgerProvenance,
} from "./contract";
import type { AgentActionSourceReference } from "../contract";

export const AGENT_LEDGER_FIXTURE_SOURCE =
  "fixture:features/agent/ledger/fixtures.ts" as const;

const fixtureCollectedAt = "2026-07-23T21:30:00.000+09:00";

function ledgerSource(input: {
  type: AgentActionSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): AgentActionSourceReference {
  return {
    ...input,
    generatedBy: "mock-agent-action-rules",
  };
}

export const mockAgentLedgerProvenance: AgentLedgerProvenance = {
  source: AGENT_LEDGER_FIXTURE_SOURCE,
  sourceLabel: "Mock agent action ledger fixture",
  evidenceIds: [
    "evidence:ledger:event-material:ai-founder-dinner",
    "evidence:ledger:chat-summary:xuwei-intro-request",
    "evidence:ledger:calendar:demo-day",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-agent-ledger-only",
  generationMethod: "fixture",
  autonomousExecutionStarted: false,
  externalSideEffectExecuted: false,
  externalNetworkRequested: false,
  messageAutoSendExecuted: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
};

const sharedEntryFlags = {
  autonomousExecutionStarted: false,
  externalSideEffectExecuted: false,
  messageAutoSendExecuted: false,
} as const;

export const agentLedgerEntryFixtures: readonly AgentLedgerEntry[] = [
  {
    entryId: "ledger-followup-alex-chen",
    title: "跟进 Alex Chen — 3 项操作",
    contactName: "Alex Chen",
    organization: "Meridian AI",
    status: "awaiting_confirmation",
    whyNow: "活动结束 18 小时，是跟进的黄金窗口。你们当晚讨论了日本市场合作。",
    evidenceChips: [
      {
        kind: "event_material",
        label: "活动资料",
        evidenceId: "evidence:ledger:event-material:ai-founder-dinner",
      },
    ],
    operations: [
      {
        operationId: "op-alex-save-note",
        operationType: "save_meeting_note",
        title: "保存会面笔记",
        effectSummary: "把 AI Founder Dinner 的讨论要点写入 Alex Chen 的名片。",
        selectedByDefault: true,
        status: "pending",
        idempotencyKey: "alex-chen:save-note:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
      {
        operationId: "op-alex-reminder",
        operationType: "create_followup_reminder",
        title: "创建「7 天后跟进」提醒",
        effectSummary: "在 7 天后生成一条跟进提醒。",
        selectedByDefault: true,
        status: "pending",
        idempotencyKey: "alex-chen:reminder-7d:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
      {
        operationId: "op-alex-draft",
        operationType: "save_message_draft",
        title: "保存消息草稿",
        effectSummary: "消息只保存为草稿，不会自动发送。",
        selectedByDefault: true,
        status: "pending",
        idempotencyKey: "alex-chen:draft:2026-07-23",
        draftPreview:
          "Alex，很高兴昨天聊到日本市场。下周我把产品演示整理给你，方便的话约个时间细聊。",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: false,
    createdAt: "2026-07-24T09:00:00.000+09:00",
    updatedAt: "2026-07-24T09:00:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "event_import",
        id: "source:event:ai-founder-dinner",
        label: "AI Founder Dinner",
        providerRecordId: "event-ai-founder-dinner",
      }),
    ],
    evidenceIds: ["evidence:ledger:event-material:ai-founder-dinner"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
  {
    entryId: "ledger-reply-xuwei-intro",
    title: "回复徐薇的引荐请求",
    contactName: "徐薇 Xu Wei",
    organization: "Bamboo Ventures",
    status: "awaiting_confirmation",
    whyNow: "徐薇希望认识你在餐饮 SaaS 的联系人；需双方同意后才会起草引荐消息。",
    evidenceChips: [
      {
        kind: "chat_summary",
        label: "会话摘要",
        evidenceId: "evidence:ledger:chat-summary:xuwei-intro-request",
      },
    ],
    operations: [
      {
        operationId: "op-xuwei-intro-draft",
        operationType: "save_message_draft",
        title: "同意并生成引荐草稿",
        effectSummary: "起草一条引荐消息（仅存草稿），双方同意前不透露任何联系方式。",
        selectedByDefault: true,
        status: "pending",
        idempotencyKey: "xuwei:intro-draft:2026-07-24",
        draftPreview: "徐薇你好，我把你和餐饮 SaaS 方向的朋友对接一下，细节见后续消息。",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: false,
    createdAt: "2026-07-24T08:48:00.000+09:00",
    updatedAt: "2026-07-24T08:48:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "chat_summary",
        id: "source:chat:xuwei-intro-request",
        label: "徐薇的引荐请求",
        providerRecordId: "chat-xuwei-intro-request",
      }),
    ],
    evidenceIds: ["evidence:ledger:chat-summary:xuwei-intro-request"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
  {
    entryId: "ledger-brief-tomorrow-meeting",
    title: "生成明早会议简报",
    organization: "Demo Day",
    status: "executing",
    whyNow: "明早会议有 3 位与会者、2 个议题，Orbit 正在准备简报。",
    evidenceChips: [
      {
        kind: "calendar_signal",
        label: "日历",
        evidenceId: "evidence:ledger:calendar:demo-day",
      },
    ],
    operations: [
      {
        operationId: "op-brief-generate",
        operationType: "generate_meeting_brief",
        title: "生成会议简报",
        effectSummary: "汇总与会者背景与议题，生成会前简报。",
        selectedByDefault: true,
        status: "pending",
        idempotencyKey: "demo-day:brief:2026-07-24",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: false,
    createdAt: "2026-07-24T08:30:00.000+09:00",
    updatedAt: "2026-07-24T08:31:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "calendar_signal",
        id: "source:calendar:demo-day",
        label: "Demo Day",
        providerRecordId: "calendar-demo-day",
      }),
    ],
    evidenceIds: ["evidence:ledger:calendar:demo-day"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
  {
    entryId: "ledger-archive-six-contacts",
    title: "昨晚 6 位联系人归档",
    status: "completed",
    whyNow: "昨晚活动识别出 6 位联系人，已写入名片夹，待你复核。",
    evidenceChips: [
      {
        kind: "event_material",
        label: "活动资料",
        evidenceId: "evidence:ledger:event-material:ai-founder-dinner",
      },
    ],
    operations: [
      {
        operationId: "op-archive-contacts",
        operationType: "archive_contacts",
        title: "写入名片夹",
        effectSummary: "把 6 位联系人的名片草稿写入名片夹。",
        selectedByDefault: true,
        status: "succeeded",
        idempotencyKey: "ai-founder-dinner:archive:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: true,
    createdAt: "2026-07-24T08:12:00.000+09:00",
    updatedAt: "2026-07-24T08:12:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "event_import",
        id: "source:event:ai-founder-dinner",
        label: "AI Founder Dinner",
        providerRecordId: "event-ai-founder-dinner",
      }),
    ],
    evidenceIds: ["evidence:ledger:event-material:ai-founder-dinner"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
  {
    entryId: "ledger-sync-three-events",
    title: "同步 3 场活动到日历",
    status: "partially_failed",
    whyNow: "2 场成功，1 场失败。成功项不会重复执行。",
    evidenceChips: [
      {
        kind: "calendar_signal",
        label: "日历",
        evidenceId: "evidence:ledger:calendar:demo-day",
      },
    ],
    operations: [
      {
        operationId: "op-sync-event-1",
        operationType: "sync_event_to_calendar",
        title: "同步 Demo Day",
        effectSummary: "把 Demo Day 写入日历。",
        selectedByDefault: true,
        status: "succeeded",
        idempotencyKey: "sync:demo-day:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
      {
        operationId: "op-sync-event-2",
        operationType: "sync_event_to_calendar",
        title: "同步 AI Founder Dinner 复盘",
        effectSummary: "把复盘会写入日历。",
        selectedByDefault: true,
        status: "succeeded",
        idempotencyKey: "sync:dinner-review:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
      {
        operationId: "op-sync-event-3",
        operationType: "sync_event_to_calendar",
        title: "同步关西跨境商务对接会",
        effectSummary: "把对接会写入日历。",
        selectedByDefault: true,
        status: "failed",
        idempotencyKey: "sync:kansai-matchup:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: true,
    createdAt: "2026-07-23T22:00:00.000+09:00",
    updatedAt: "2026-07-23T22:01:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "calendar_signal",
        id: "source:calendar:sync-batch",
        label: "日历同步",
        providerRecordId: "calendar-sync-batch",
      }),
    ],
    evidenceIds: ["evidence:ledger:calendar:demo-day"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
  {
    entryId: "ledger-auto-followup-yamada",
    title: "自动跟进「山田千寻」提醒",
    contactName: "山田千寻",
    status: "undone",
    whyNow: "被你撤销。",
    evidenceChips: [
      {
        kind: "contact_note",
        label: "联系人笔记",
        evidenceId: "evidence:ledger:contact-note:yamada",
      },
    ],
    operations: [
      {
        operationId: "op-yamada-reminder",
        operationType: "create_followup_reminder",
        title: "自动跟进提醒",
        effectSummary: "创建山田千寻的跟进提醒。",
        selectedByDefault: true,
        status: "undone",
        idempotencyKey: "yamada:reminder:2026-07-22",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: false,
    createdAt: "2026-07-23T09:00:00.000+09:00",
    updatedAt: "2026-07-23T09:30:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "manual",
        id: "source:contact:yamada",
        label: "山田千寻",
        providerRecordId: "contact-yamada",
      }),
    ],
    evidenceIds: ["evidence:ledger:contact-note:yamada"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
];
```

注意 `ledger-sync-three-events` 里失败的子操作 `op-sync-event-3` 的 `mockOutcome` 是 `"succeed"`——它表示"重试后会成功"，当前 `status: "failed"` 表示上次执行失败。这是 Task 3 幂等重试测试的关键前提。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx tests/capabilities/agent-action-ledger-fixtures.test.ts`
Expected: PASS（6 项）

- [ ] **Step 5: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add features/agent/ledger/fixtures.ts tests/capabilities/agent-action-ledger-fixtures.test.ts
git commit -m "feat(agent): add design-derived ledger fixtures

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Mock service state machine

**Files:**
- Create: `features/agent/ledger/service.ts`
- Create: `features/agent/ledger/mock-service.ts`
- Test: `tests/capabilities/agent-action-ledger-mock.test.ts`

**Interfaces:**
- Consumes: Task 1 contract、Task 2 fixtures。
- Produces: `AgentLedgerService` 接口（`listEntries(input?) / applyTransition(input) / updateDraft(input)`，均返回 `T | Promise<T>`）；`createMockAgentLedgerService(): AgentLedgerService & { getExecutionCount(idempotencyKey: string): number }`。`getExecutionCount` 仅 mock 暴露，用于幂等断言。

- [ ] **Step 1: Write the failing test**

创建 `tests/capabilities/agent-action-ledger-mock.test.ts`：

```ts
/**
 * Agent action ledger mock 状态机测试。
 *
 * 覆盖：勾选子集执行、稍后处理、撤销、幂等重试（成功项不重复执行）、
 * 草稿编辑边界和非法转换。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createMockAgentLedgerService } from "../../features/agent/ledger/mock-service";

test("listEntries returns the six fixtures", async () => {
  const service = createMockAgentLedgerService();
  const result = await service.listEntries();
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.entries.length, 6);
    assert.equal(result.data.state, "success");
  }
});

test("confirm executes only selected operations and skips the rest", async () => {
  const service = createMockAgentLedgerService();
  const result = await service.applyTransition({
    entryId: "ledger-followup-alex-chen",
    transition: "confirm",
    selectedOperationIds: ["op-alex-save-note", "op-alex-draft"],
    actorLabel: "航太郎",
  });
  assert.equal(result.success, true);
  if (result.success) {
    const entry = result.data.entry;
    assert.equal(entry.status, "completed");
    const byId = new Map(entry.operations.map((operation) => [operation.operationId, operation]));
    assert.equal(byId.get("op-alex-save-note")?.status, "succeeded");
    assert.equal(byId.get("op-alex-draft")?.status, "succeeded");
    assert.equal(byId.get("op-alex-reminder")?.status, "skipped");
    assert.equal(entry.messageAutoSendExecuted, false);
  }
});

test("confirm with no selected operations fails validation", async () => {
  const service = createMockAgentLedgerService();
  const result = await service.applyTransition({
    entryId: "ledger-followup-alex-chen",
    transition: "confirm",
    selectedOperationIds: [],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "AGENT_LEDGER_NO_OPERATIONS_SELECTED");
  }
});

test("defer moves awaiting entries to deferred, and deferred entries can confirm", async () => {
  const service = createMockAgentLedgerService();
  const deferred = await service.applyTransition({
    entryId: "ledger-followup-alex-chen",
    transition: "defer",
  });
  assert.equal(deferred.success, true);
  if (deferred.success) {
    assert.equal(deferred.data.entry.status, "deferred");
  }
  const confirmed = await service.applyTransition({
    entryId: "ledger-followup-alex-chen",
    transition: "confirm",
    selectedOperationIds: ["op-alex-save-note"],
  });
  assert.equal(confirmed.success, true);
});

test("undo is limited to undoable completed or partially_failed entries", async () => {
  const service = createMockAgentLedgerService();
  const undone = await service.applyTransition({
    entryId: "ledger-archive-six-contacts",
    transition: "undo",
  });
  assert.equal(undone.success, true);
  if (undone.success) {
    assert.equal(undone.data.entry.status, "undone");
    assert.ok(
      undone.data.entry.operations.every((operation) => operation.status === "undone"),
    );
  }
  const invalid = await service.applyTransition({
    entryId: "ledger-auto-followup-yamada",
    transition: "undo",
  });
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.equal(invalid.error.code, "AGENT_LEDGER_TRANSITION_INVALID");
  }
});

test("retry re-runs only failed operations; succeeded operations are never re-executed", async () => {
  const service = createMockAgentLedgerService();
  const retried = await service.applyTransition({
    entryId: "ledger-sync-three-events",
    transition: "retry",
  });
  assert.equal(retried.success, true);
  if (retried.success) {
    assert.equal(retried.data.entry.status, "completed");
  }
  assert.equal(service.getExecutionCount("sync:demo-day:2026-07-23"), 0);
  assert.equal(service.getExecutionCount("sync:dinner-review:2026-07-23"), 0);
  assert.equal(service.getExecutionCount("sync:kansai-matchup:2026-07-23"), 1);
});

test("draft edits only work on awaiting/deferred save_message_draft operations", async () => {
  const service = createMockAgentLedgerService();
  const updated = await service.updateDraft({
    entryId: "ledger-followup-alex-chen",
    operationId: "op-alex-draft",
    draftText: "Alex，改约下周三下午如何？",
  });
  assert.equal(updated.success, true);
  if (updated.success) {
    const draft = updated.data.entry.operations.find(
      (operation) => operation.operationId === "op-alex-draft",
    );
    assert.equal(draft?.draftPreview, "Alex，改约下周三下午如何？");
  }
  const rejected = await service.updateDraft({
    entryId: "ledger-archive-six-contacts",
    operationId: "op-archive-contacts",
    draftText: "should not work",
  });
  assert.equal(rejected.success, false);
  if (!rejected.success) {
    assert.equal(rejected.error.code, "AGENT_LEDGER_DRAFT_NOT_EDITABLE");
  }
});

test("unknown ids and missing ids fail with typed errors", async () => {
  const service = createMockAgentLedgerService();
  const missing = await service.applyTransition({ transition: "confirm" });
  assert.equal(missing.success, false);
  if (!missing.success) {
    assert.equal(missing.error.code, "AGENT_LEDGER_ENTRY_ID_REQUIRED");
  }
  const unknown = await service.applyTransition({
    entryId: "ledger-does-not-exist",
    transition: "confirm",
    selectedOperationIds: ["x"],
  });
  assert.equal(unknown.success, false);
  if (!unknown.success) {
    assert.equal(unknown.error.code, "AGENT_LEDGER_ENTRY_NOT_FOUND");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/capabilities/agent-action-ledger-mock.test.ts`
Expected: FAIL —— `Cannot find module '../../features/agent/ledger/mock-service'`

- [ ] **Step 3: Write service interface and mock implementation**

创建 `features/agent/ledger/service.ts`：

```ts
import type {
  AgentLedgerDraftUpdateInput,
  AgentLedgerListInput,
  AgentLedgerListResult,
  AgentLedgerMutationResult,
  AgentLedgerTransitionInput,
} from "./contract";

// AgentLedgerService 是操作账本的统一入口。
// applyTransition 收敛 confirm/defer/undo/retry 四种转换；
// 任何转换都不触发外部副作用，消息永远只存草稿。
export interface AgentLedgerService {
  listEntries: (
    input?: AgentLedgerListInput,
  ) => AgentLedgerServiceResult<AgentLedgerListResult>;
  applyTransition: (
    input: AgentLedgerTransitionInput,
  ) => AgentLedgerServiceResult<AgentLedgerMutationResult>;
  updateDraft: (
    input: AgentLedgerDraftUpdateInput,
  ) => AgentLedgerServiceResult<AgentLedgerMutationResult>;
}

export type AgentLedgerServiceResult<TResult> = TResult | Promise<TResult>;
```

创建 `features/agent/ledger/mock-service.ts`：

```ts
/**
 * Mock agent ledger service：内存状态机。
 *
 * 状态转换规则：
 *   awaiting_confirmation | deferred --confirm--> completed | partially_failed | failed
 *   awaiting_confirmation --defer--> deferred
 *   (completed | partially_failed) 且 undoable --undo--> undone
 *   partially_failed | failed --retry--> 只重跑 failed 子操作
 * 幂等：executionCounts 按 idempotencyKey 统计，重试不重跑 succeeded 的子操作。
 */
import {
  AGENT_LEDGER_ERROR_DEFINITIONS,
  AGENT_LEDGER_TRANSITIONS,
  type AgentLedgerDraftUpdateInput,
  type AgentLedgerEntry,
  type AgentLedgerEntryStatus,
  type AgentLedgerErrorCode,
  type AgentLedgerFailure,
  type AgentLedgerListInput,
  type AgentLedgerListResult,
  type AgentLedgerMutationResult,
  type AgentLedgerOperation,
  type AgentLedgerProvenance,
  type AgentLedgerTransition,
  type AgentLedgerTransitionInput,
} from "./contract";
import type { AgentLedgerService } from "./service";
import {
  agentLedgerEntryFixtures,
  mockAgentLedgerProvenance,
} from "./fixtures";

const DEFAULT_ACTOR_LABEL = "本地用户";

function cloneEntries(): AgentLedgerEntry[] {
  return agentLedgerEntryFixtures.map((entry) => ({
    ...entry,
    evidenceChips: entry.evidenceChips.map((chip) => ({ ...chip })),
    operations: entry.operations.map((operation) => ({ ...operation })),
    sourceRefs: entry.sourceRefs.map((ref) => ({ ...ref })),
    evidenceIds: [...entry.evidenceIds],
  }));
}

function transitionProvenance(): AgentLedgerProvenance {
  return {
    ...mockAgentLedgerProvenance,
    generationMethod: "rule-based-ledger-transition",
  };
}

function ledgerFailure(code: AgentLedgerErrorCode): AgentLedgerFailure {
  return {
    success: false,
    error: {
      ...AGENT_LEDGER_ERROR_DEFINITIONS[code],
      state: "failure",
      provenance: transitionProvenance(),
      evidenceIds: [],
    },
  };
}

function deriveEntryStatus(
  operations: readonly AgentLedgerOperation[],
): AgentLedgerEntryStatus {
  const executed = operations.filter((operation) => operation.status !== "skipped");
  const failed = executed.filter((operation) => operation.status === "failed");
  const succeeded = executed.filter((operation) => operation.status === "succeeded");

  if (failed.length === 0) {
    return "completed";
  }
  return succeeded.length > 0 ? "partially_failed" : "failed";
}

function isKnownTransition(value: unknown): value is AgentLedgerTransition {
  return (
    typeof value === "string" &&
    (AGENT_LEDGER_TRANSITIONS as readonly string[]).includes(value)
  );
}

export function createMockAgentLedgerService(): AgentLedgerService & {
  getExecutionCount: (idempotencyKey: string) => number;
} {
  const entries = cloneEntries();
  const executionCounts = new Map<string, number>();

  function findEntry(entryId: string): AgentLedgerEntry | undefined {
    return entries.find((entry) => entry.entryId === entryId);
  }

  function executeOperation(operation: AgentLedgerOperation): void {
    executionCounts.set(
      operation.idempotencyKey,
      (executionCounts.get(operation.idempotencyKey) ?? 0) + 1,
    );
    operation.status = operation.mockOutcome === "fail" ? "failed" : "succeeded";
  }

  function mutationSuccess(
    entry: AgentLedgerEntry,
    transition: AgentLedgerTransition | "update_draft",
    actorLabel: string,
  ): AgentLedgerMutationResult {
    entry.updatedAt = new Date().toISOString();

    return {
      success: true,
      data: {
        state: "success",
        entry,
        transition,
        actorLabel,
        decidedAt: entry.updatedAt,
        provenance: transitionProvenance(),
        nextAction:
          "账本已更新。所有写操作可在 All actions 中追溯，消息只存草稿、不会自动发送。",
      },
    };
  }

  return {
    listEntries(input?: AgentLedgerListInput): AgentLedgerListResult {
      if (input?.scenario === "failure") {
        return ledgerFailure("AGENT_LEDGER_MOCK_FAILED");
      }
      const filtered =
        input?.status != null && input.status !== ""
          ? entries.filter((entry) => entry.status === input.status)
          : entries;
      const state = input?.scenario === "empty" || filtered.length === 0 ? "empty" : "success";

      return {
        success: true,
        data: {
          state,
          entries: state === "empty" && input?.scenario === "empty" ? [] : filtered,
          summary: `账本共 ${filtered.length} 条记录，可追溯、可撤销。`,
          provenance: mockAgentLedgerProvenance,
          nextAction: "在 All actions 中复核等待确认的条目。",
        },
      };
    },

    applyTransition(input: AgentLedgerTransitionInput): AgentLedgerMutationResult {
      if (input.scenario === "failure") {
        return ledgerFailure("AGENT_LEDGER_MOCK_FAILED");
      }
      if (!input.entryId) {
        return ledgerFailure("AGENT_LEDGER_ENTRY_ID_REQUIRED");
      }
      const entry = findEntry(input.entryId);
      if (!entry) {
        return ledgerFailure("AGENT_LEDGER_ENTRY_NOT_FOUND");
      }
      if (!isKnownTransition(input.transition)) {
        return ledgerFailure("AGENT_LEDGER_TRANSITION_INVALID");
      }
      const actorLabel = input.actorLabel?.trim() || DEFAULT_ACTOR_LABEL;

      switch (input.transition) {
        case "confirm": {
          if (entry.status !== "awaiting_confirmation" && entry.status !== "deferred") {
            return ledgerFailure("AGENT_LEDGER_TRANSITION_INVALID");
          }
          const selected = new Set(input.selectedOperationIds ?? []);
          const selectedOps = entry.operations.filter((operation) =>
            selected.has(operation.operationId),
          );
          if (selectedOps.length === 0) {
            return ledgerFailure("AGENT_LEDGER_NO_OPERATIONS_SELECTED");
          }
          for (const operation of entry.operations) {
            if (selected.has(operation.operationId)) {
              executeOperation(operation);
            } else {
              operation.status = "skipped";
            }
          }
          entry.status = deriveEntryStatus(entry.operations);
          entry.undoable = entry.operations.some(
            (operation) => operation.status === "succeeded",
          );
          return mutationSuccess(entry, "confirm", actorLabel);
        }
        case "defer": {
          if (entry.status !== "awaiting_confirmation") {
            return ledgerFailure("AGENT_LEDGER_TRANSITION_INVALID");
          }
          entry.status = "deferred";
          return mutationSuccess(entry, "defer", actorLabel);
        }
        case "undo": {
          const undoableNow =
            entry.undoable &&
            (entry.status === "completed" || entry.status === "partially_failed");
          if (!undoableNow) {
            return ledgerFailure("AGENT_LEDGER_TRANSITION_INVALID");
          }
          for (const operation of entry.operations) {
            if (operation.status === "succeeded") {
              operation.status = "undone";
            }
          }
          entry.status = "undone";
          entry.undoable = false;
          return mutationSuccess(entry, "undo", actorLabel);
        }
        case "retry": {
          if (entry.status !== "partially_failed" && entry.status !== "failed") {
            return ledgerFailure("AGENT_LEDGER_TRANSITION_INVALID");
          }
          for (const operation of entry.operations) {
            if (operation.status === "failed") {
              executeOperation(operation);
            }
          }
          entry.status = deriveEntryStatus(entry.operations);
          return mutationSuccess(entry, "retry", actorLabel);
        }
      }
    },

    updateDraft(input: AgentLedgerDraftUpdateInput): AgentLedgerMutationResult {
      if (!input.entryId) {
        return ledgerFailure("AGENT_LEDGER_ENTRY_ID_REQUIRED");
      }
      const entry = findEntry(input.entryId);
      if (!entry) {
        return ledgerFailure("AGENT_LEDGER_ENTRY_NOT_FOUND");
      }
      const operation = entry.operations.find(
        (candidate) => candidate.operationId === input.operationId,
      );
      const editable =
        operation?.operationType === "save_message_draft" &&
        (entry.status === "awaiting_confirmation" || entry.status === "deferred");
      if (!operation || !editable || typeof input.draftText !== "string") {
        return ledgerFailure("AGENT_LEDGER_DRAFT_NOT_EDITABLE");
      }
      operation.draftPreview = input.draftText;
      return mutationSuccess(entry, "update_draft", DEFAULT_ACTOR_LABEL);
    },

    getExecutionCount(idempotencyKey: string): number {
      return executionCounts.get(idempotencyKey) ?? 0;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx tests/capabilities/agent-action-ledger-mock.test.ts`
Expected: PASS（8 项）

- [ ] **Step 5: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add features/agent/ledger/service.ts features/agent/ledger/mock-service.ts tests/capabilities/agent-action-ledger-mock.test.ts
git commit -m "feat(agent): add ledger mock state machine with undo and idempotent retry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Live stub + factory registration

**Files:**
- Create: `features/agent/ledger/live-service.ts`
- Modify: `features/agent/service-factory.ts`（只追加，不改既有导出）
- Test: `tests/capabilities/agent-action-ledger-factory.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `AgentLedgerService`、`createMockAgentLedgerService`。
- Produces: `createLiveAgentLedgerService(): AgentLedgerService`；service-factory 追加导出 `agentLedgerServiceFactory`、`resolveAgentLedgerService(mode?)`、`createAgentLedgerService(mode?)`。

- [ ] **Step 1: Write the failing test**

创建 `tests/capabilities/agent-action-ledger-factory.test.ts`：

```ts
/**
 * Agent ledger factory 测试：mock 模式可解析，live 模式返回未配置 failure。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createAgentLedgerService } from "../../features/agent/service-factory";

test("mock mode resolves a working ledger service", async () => {
  const service = createAgentLedgerService("mock");
  const result = await service.listEntries();
  assert.equal(result.success, true);
});

test("live mode returns the unconfigured failure until a store exists", async () => {
  const service = createAgentLedgerService("live");
  const result = await service.listEntries();
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "AGENT_LEDGER_LIVE_STORE_UNCONFIGURED");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/capabilities/agent-action-ledger-factory.test.ts`
Expected: FAIL —— `createAgentLedgerService` 未导出

- [ ] **Step 3: Write live stub and register factory**

创建 `features/agent/ledger/live-service.ts`：

```ts
/**
 * Live agent ledger 存根：数据库 provider 落地前，所有方法返回未配置 failure。
 * Postgres live-record-provider 在后续计划（All actions live 化）中实现。
 */
import {
  AGENT_LEDGER_ERROR_DEFINITIONS,
  type AgentLedgerFailure,
} from "./contract";
import { mockAgentLedgerProvenance } from "./fixtures";
import type { AgentLedgerService } from "./service";

function unconfiguredFailure(): AgentLedgerFailure {
  return {
    success: false,
    error: {
      ...AGENT_LEDGER_ERROR_DEFINITIONS.AGENT_LEDGER_LIVE_STORE_UNCONFIGURED,
      state: "failure",
      provenance: {
        ...mockAgentLedgerProvenance,
        privacy: "live-agent-ledger-preview",
        generationMethod: "live-store-query",
      },
      evidenceIds: [],
    },
  };
}

export function createLiveAgentLedgerService(): AgentLedgerService {
  return {
    listEntries: () => unconfiguredFailure(),
    applyTransition: () => unconfiguredFailure(),
    updateDraft: () => unconfiguredFailure(),
  };
}
```

修改 `features/agent/service-factory.ts` —— 在文件末尾追加（imports 按既有分组插入文件头部）：

```ts
import { createLiveAgentLedgerService } from "./ledger/live-service";
import { createMockAgentLedgerService } from "./ledger/mock-service";
import type { AgentLedgerService } from "./ledger/service";
```

```ts
export const agentLedgerServiceFactory =
  createModuleServiceFactory<AgentLedgerService>({
    capabilityId: "agent-action-ledger",
    implementations: {
      live: () => createLiveAgentLedgerService(),
      mock: () => createMockAgentLedgerService(),
    },
  });

export function resolveAgentLedgerService(mode?: ModuleMode | string) {
  return agentLedgerServiceFactory.create(mode);
}

export function createAgentLedgerService(
  mode?: ModuleMode | string,
): AgentLedgerService {
  const resolution = resolveAgentLedgerService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
```

- [ ] **Step 4: Run new test plus existing factory suite**

Run: `node --test --import tsx tests/capabilities/agent-action-ledger-factory.test.ts tests/services/core-service-factories.test.ts`
Expected: 全部 PASS（确认追加没有破坏既有 factory 测试）

- [ ] **Step 5: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add features/agent/ledger/live-service.ts features/agent/service-factory.ts tests/capabilities/agent-action-ledger-factory.test.ts
git commit -m "feat(agent): register ledger service factory with live stub

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: API routes + lint 列表

**Files:**
- Create: `app/api/agent/ledger/route.ts`
- Create: `app/api/agent/ledger/[id]/transition/route.ts`
- Create: `app/api/agent/ledger/[id]/draft/route.ts`
- Modify: `package.json`（lint tsc 文件列表追加）
- Test: `tests/api/agent-action-ledger-routes.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `createAgentLedgerService`、Task 1 的 failure 助手、`shared/api/envelope` 的 `success/failure/runtimeBoundaryHeaders`、`resolveFeatureMode`、`getHttpStatusForAppErrorCode`。
- Produces: `GET /api/agent/ledger`（?status= 过滤、?scenario= 复现）、`POST /api/agent/ledger/[id]/transition`（body `{transition, selectedOperationIds?, actorLabel?}`）、`PATCH /api/agent/ledger/[id]/draft`（body `{operationId, draftText}`）。

- [ ] **Step 1: Write the failing test**

创建 `tests/api/agent-action-ledger-routes.test.ts`：

```ts
/**
 * Agent ledger API route 测试：直接调用 route handler，校验 envelope 与状态码。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { GET as listLedger } from "../../app/api/agent/ledger/route";
import { POST as applyTransition } from "../../app/api/agent/ledger/[id]/transition/route";
import { PATCH as updateDraft } from "../../app/api/agent/ledger/[id]/draft/route";

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

test("GET /api/agent/ledger returns the ledger envelope", async () => {
  const response = await listLedger(
    new Request("http://localhost/api/agent/ledger"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.entries.length, 6);
});

test("POST transition confirm executes selected operations", async () => {
  const response = await applyTransition(
    new Request("http://localhost/api/agent/ledger/ledger-followup-alex-chen/transition", {
      body: JSON.stringify({
        transition: "confirm",
        selectedOperationIds: ["op-alex-save-note", "op-alex-reminder", "op-alex-draft"],
        actorLabel: "航太郎",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    routeContext("ledger-followup-alex-chen"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.entry.status, "completed");
});

test("POST transition with unknown entry returns 404 envelope", async () => {
  const response = await applyTransition(
    new Request("http://localhost/api/agent/ledger/nope/transition", {
      body: JSON.stringify({ transition: "confirm", selectedOperationIds: ["x"] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    routeContext("nope"),
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
});

test("PATCH draft updates the draft preview", async () => {
  const response = await updateDraft(
    new Request("http://localhost/api/agent/ledger/ledger-followup-alex-chen/draft", {
      body: JSON.stringify({
        operationId: "op-alex-draft",
        draftText: "Alex，周三下午方便吗？",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
    routeContext("ledger-followup-alex-chen"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  const draft = body.data.entry.operations.find(
    (operation: { operationId: string }) => operation.operationId === "op-alex-draft",
  );
  assert.equal(draft.draftPreview, "Alex，周三下午方便吗？");
});
```

注意：每个 route handler 内部各自 `createAgentLedgerService()`（新实例、新内存状态），所以跨请求状态不共享——测试只依赖单请求语义，这是既有 mock route 的同样行为。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/api/agent-action-ledger-routes.test.ts`
Expected: FAIL —— route 模块不存在

- [ ] **Step 3: Write the three routes**

创建 `app/api/agent/ledger/route.ts`：

```ts
import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  agentLedgerFailureContext,
  agentLedgerFailureToAppError,
} from "../../../../features/agent/ledger/contract";
import { createAgentLedgerService } from "../../../../features/agent/service-factory";

export const dynamic = "force-dynamic";

// GET /api/agent/ledger 返回操作账本列表；只读，不触发任何执行。
export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const searchParams = new URL(request.url).searchParams;
  const service = createAgentLedgerService();
  const result = await service.listEntries({
    scenario: searchParams.get("scenario"),
    status: searchParams.get("status"),
  });

  if (result.success === false) {
    const appError = agentLedgerFailureToAppError(result);

    return NextResponse.json(
      failure(appError, agentLedgerFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
```

创建 `app/api/agent/ledger/[id]/transition/route.ts`：

```ts
import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  agentLedgerFailureContext,
  agentLedgerFailureToAppError,
  type AgentLedgerTransitionInput,
} from "../../../../../../features/agent/ledger/contract";
import { createAgentLedgerService } from "../../../../../../features/agent/service-factory";

export const dynamic = "force-dynamic";

// POST /api/agent/ledger/[id]/transition 应用 confirm/defer/undo/retry。
// route 只收集参数；状态变化和幂等控制都由 service 决定。
interface AgentLedgerRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

async function readInput(
  request: Request,
  entryId: string,
): Promise<AgentLedgerTransitionInput> {
  const searchParams = new URL(request.url).searchParams;
  const body = await readJsonBody(request);

  return {
    actorLabel: readString(body.actorLabel),
    entryId,
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
    selectedOperationIds: readStringArray(body.selectedOperationIds),
    transition: readString(body.transition),
  };
}

export async function POST(
  request: Request,
  context: AgentLedgerRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const service = createAgentLedgerService();
  const result = await service.applyTransition(await readInput(request, id));

  if (result.success === false) {
    const appError = agentLedgerFailureToAppError(result);

    return NextResponse.json(
      failure(appError, agentLedgerFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
```

创建 `app/api/agent/ledger/[id]/draft/route.ts`：

```ts
import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  agentLedgerFailureContext,
  agentLedgerFailureToAppError,
} from "../../../../../../features/agent/ledger/contract";
import { createAgentLedgerService } from "../../../../../../features/agent/service-factory";

export const dynamic = "force-dynamic";

// PATCH /api/agent/ledger/[id]/draft 编辑消息草稿。
// 草稿永远只是草稿：这里不存在任何发送路径。
interface AgentLedgerDraftRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function PATCH(
  request: Request,
  context: AgentLedgerDraftRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = {};
  }
  const service = createAgentLedgerService();
  const result = await service.updateDraft({
    draftText: readString(body.draftText),
    entryId: id,
    operationId: readString(body.operationId),
  });

  if (result.success === false) {
    const appError = agentLedgerFailureToAppError(result);

    return NextResponse.json(
      failure(appError, agentLedgerFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx tests/api/agent-action-ledger-routes.test.ts`
Expected: PASS（4 项）

- [ ] **Step 5: Append new files to the lint tsc list**

修改 `package.json` 的 `lint` script：在文件列表末尾（`"tests/services/core-service-factories.test.ts"` 之后）追加：

```
"features/agent/ledger/contract.ts" "features/agent/ledger/service.ts" "features/agent/ledger/fixtures.ts" "features/agent/ledger/mock-service.ts" "features/agent/ledger/live-service.ts" "app/api/agent/ledger/route.ts" "app/api/agent/ledger/[id]/transition/route.ts" "app/api/agent/ledger/[id]/draft/route.ts" "tests/capabilities/agent-action-ledger-contract.test.ts" "tests/capabilities/agent-action-ledger-fixtures.test.ts" "tests/capabilities/agent-action-ledger-mock.test.ts" "tests/capabilities/agent-action-ledger-factory.test.ts" "tests/api/agent-action-ledger-routes.test.ts"
```

Run: `npm run lint`
Expected: 通过（若报 `ApiErrorContext` 键类型错误，把 `agentLedgerFailureContext` 的返回对象改成与 `agentActionQueueFailureContext` 完全一致的键结构再跑）。

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add app/api/agent/ledger tests/api/agent-action-ledger-routes.test.ts package.json
git commit -m "feat(agent): expose ledger API routes with envelope error handling

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: iOrbit 侧边栏共享宽度常量

**Files:**
- Create: `app/(app)/app/orbit-layout-constants.ts`
- Modify: `app/(app)/app/agent/orbit-real-agent.tsx:45`
- Test: `tests/ui/orbit-sidebar-width-constant.test.ts`

**Interfaces:**
- Produces: `ORBIT_LEFT_SIDEBAR_WIDTH = 248`。后续"人脉"页左侧边栏（All actions 计划）必须消费同一常量，保证两处初始宽度一致。
- 既有拖拽调宽逻辑（`clampHistorySidebarWidth`、min 220 / max 380、drag separator）保持不变——用户要求"可拖动调整宽度"已由现状满足，本任务只统一初始宽度来源。

- [ ] **Step 1: Write the failing test**

创建 `tests/ui/orbit-sidebar-width-constant.test.ts`（镜像 `tests/domain/contracts.test.ts` 的 readFileSync 源码检查模式）：

```ts
/**
 * 侧边栏宽度常量测试。
 *
 * iOrbit 历史侧边栏与（后续）人脉页左侧边栏共用同一初始宽度常量，
 * 保证两处宽度一致；拖拽调宽逻辑不受影响。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../../app/(app)/app/orbit-layout-constants";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("shared sidebar width constant is a sane pixel value", () => {
  assert.equal(typeof ORBIT_LEFT_SIDEBAR_WIDTH, "number");
  assert.equal(ORBIT_LEFT_SIDEBAR_WIDTH, 248);
});

test("the iOrbit agent page derives its default width from the shared constant", () => {
  const source = readFileSync(
    join(projectRoot, "app/(app)/app/agent/orbit-real-agent.tsx"),
    "utf8",
  );
  assert.ok(source.includes("ORBIT_LEFT_SIDEBAR_WIDTH"));
  assert.ok(
    source.includes(
      "const HISTORY_SIDEBAR_DEFAULT_WIDTH = ORBIT_LEFT_SIDEBAR_WIDTH",
    ),
  );
  // 拖拽 clamp 逻辑必须保留
  assert.ok(source.includes("clampHistorySidebarWidth"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/ui/orbit-sidebar-width-constant.test.ts`
Expected: FAIL —— `orbit-layout-constants` 模块不存在

- [ ] **Step 3: Create the constant and rewire the agent page**

创建 `app/(app)/app/orbit-layout-constants.ts`：

```ts
// 布局共享常量。
// iOrbit 历史侧边栏与人脉页左侧边栏的初始宽度必须一致（2026-07-24 要求）。
export const ORBIT_LEFT_SIDEBAR_WIDTH = 248;
```

修改 `app/(app)/app/agent/orbit-real-agent.tsx`：在文件 import 区追加

```ts
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../orbit-layout-constants";
```

并把第 45 行

```ts
const HISTORY_SIDEBAR_DEFAULT_WIDTH = 248;
```

改为

```ts
const HISTORY_SIDEBAR_DEFAULT_WIDTH = ORBIT_LEFT_SIDEBAR_WIDTH;
```

`HISTORY_SIDEBAR_MIN_WIDTH`（220）、`HISTORY_SIDEBAR_MAX_WIDTH`（380）与 `clampHistorySidebarWidth` 一律不动。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx tests/ui/orbit-sidebar-width-constant.test.ts`
Expected: PASS（2 项）。再跑 `npm test` 确认全绿。

- [ ] **Step 5: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/orbit-layout-constants.ts" "app/(app)/app/agent/orbit-real-agent.tsx" tests/ui/orbit-sidebar-width-constant.test.ts
git commit -m "feat(agent): share sidebar initial width via layout constant

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Follow-up Plans（本计划落地后另行编写）

1. **All actions 页 + 权限/安静时段设置** —— 挂在"人脉"页左侧栏（名片夹/跟进/All actions），侧边栏消费 `ORBIT_LEFT_SIDEBAR_WIDTH`；状态过滤 chip、重试失败项按钮、撤销入口全部消费本计划的 ledger API；设置区扩展 agent settings（自动准备会面笔记、活动后跟进提醒开关、安静时段 22:00–08:00 时段配置）。**不新增全局导航**。
2. **Today 决策收件箱页** —— 纯聚合 view-model：ledger（awaiting → 需要你决定；completed → 最近完成）+ 简报 artifacts + 即将发生；决策详情面板用 `whyNow` / `evidenceChips` / `effectSummary` 渲染。
3. **引荐请求（双向同意）** —— 新 feature module（请求方、目标画像、consent 状态机），同意后经 orbit-ai 生成草稿并写入 ledger。
4. **iOrbit 新询问 pattern** —— 保留现有 iOrbit 界面与命名，只在欢迎页与 composer 增加"整理昨晚见到的人"等新建议 pattern，结果卡片的"跟进"按钮写 ledger（与 Today/All actions 同一对象）。
