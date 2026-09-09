# Relationship Lifecycle Migration Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐已经批准的关系生命周期迁移工具：确定性计划、外部审核回执校验、事务执行和独立的 canonical 批量读取；不执行真实数据迁移或切换当前页面。

**Architecture:** 在现有 `features/connections/lifecycle/` 边界内，纯计划器对明确输入的存储快照与 ownership 修复清单计算最小变更。执行器在同一 PostgreSQL 事务中重新计算计划，核对外部审核绑定的快照、清单和计划哈希，写入变更、审计与幂等回执。新的批量读取器只接受已符合约束的 actor-owned 数据，保持未接入状态，供实际迁移审核通过后的接口切换使用。

**Tech Stack:** TypeScript、Node.js、node:test、tsx、现有 pg/transactional-postgres、LiveRecord 和生命周期预检器。

**Spec:** 上层工作区已批准的 `docs/superpowers/specs/2026-08-21-contact-lifecycle-and-filters-design.md`，尤其“数据迁移”“联系人读取模型”“并发、错误与审计”和第 2 阶段继续门。本计划延续 `2026-09-08-relationship-lifecycle-preflight.md`，不替代实际数据的人工审核。

## Global Constraints

- Connection 是四阶段 `needs_follow_up | active | nurture | archived` 的唯一最终事实。本文不修改用户可见术语。
- 非空 owner 冲突、重复 Connection、跨 actor 引用均阻断；ContactActorLink 不提供 ownership 或授权。
- 空 owner 仅在操作者清单逐条列明记录和证据时可提出修复。清单不是审核批准；执行还必须有独立外部审核回执。
- 合法 Connection stage 优先；否则仅使用属于同 actor、比旧 Contact 修改时间新的合法详情状态，再考虑合法 Contact stage。无效来源时间、不确定来源、captured/reviewing 和并列冲突全部报告复核。
- 缺少 version 才能初始化为 1；null、字符串、零、负数、小数不能默认修复。保留已有正整数版本。
- 只规范化已经有效的任务 dueAt；不生成日期、目标、purpose、联系人、Connection 或任务，不自动取消/合并记录。
- 缺目标、缺日期、采集复核等问题由人工处理后重新计划。工具必须明确报告这些未解决项，不能默默跳过或宣称整阶段完成。
- 计划和审计不输出姓名、目标、备注、任务标题、完整 payload 或数据库凭据。哈希覆盖实际来源内容，而不仅覆盖计数。
- 所有 mutation、审计与回执在同一事务中；失败全部回滚。同 run ID 的不同命令拒绝，同一命令只回放一次。
- 不能用旧成功回执证明当前数据仍满足切换门槛；批量读取每次验证一致性。工具不写激活标记，不改变当前 API、factory 或页面路径。
- 真实数据库、导出、实际审核、正式 apply 和 Web/App cutover 不在本次执行授权中。测试仅使用新建的隔离本地数据库/schema。
- 仅编辑本 Web 仓库。保留 App、根目录、Bridge 和生成文件的其他改动。沿用当前分支，逐任务单独 commit，不 push。

## 文件职责和依赖

| 任务 | 文件 | 职责 |
| --- | --- | --- |
| 1 | `features/connections/lifecycle/migration-plan.ts` | 清单校验、快照哈希、最小修复、阶段来源规则及确定性计划 |
| 1 | `tests/services/relationship-lifecycle-migration-plan.test.ts` | 真实 LiveRecord 输入、权威优先级、拒绝修复、隐私、不变性 |
| 2 | `features/connections/lifecycle/migration-review.ts` | 独立审核的严格解析和与计划/操作身份绑定 |
| 2 | `tests/services/relationship-lifecycle-migration-review.test.ts` | 未批准、过期、错身份、篡改/未知字段均拒绝 |
| 3 | `features/connections/lifecycle/migration-repository.ts` | 明确注入 SQL runtime，事务内 dry-run/apply、审计和回执 |
| 3 | `features/connections/lifecycle/migration-schema.ts` | 迁移回执独立 DDL，不改现有命令回执语义 |
| 3、4 | `features/connections/lifecycle/record-snapshot.ts` | 固定 LiveRecord SQL 列映射，保留 PostgreSQL 微秒和 UTC 时区 |
| 3、4 | `tests/support/lifecycle-migration-fixture.ts` | 复用隔离数据库/schema、完整记录和测试专用审核样例；不被生产代码引用 |
| 3 | `tests/services/relationship-lifecycle-migration-postgres.test.ts` | 隔离 PostgreSQL 真实提交、回滚、并发、回放和来源漂移 |
| 4 | `features/connections/lifecycle/read-projection.ts` | actor-owned 批量读取与纯阶段/下一任务投影，不接当前路由 |
| 4 | `tests/services/relationship-lifecycle-read-projection.test.ts` | 单一事实、真实任务、时区、缺失/冲突不泄漏 |
| 4 | `tests/services/relationship-lifecycle-read-postgres.test.ts` | SQL actor 限定、固定批量查询数及跨 actor 引用检查 |
| 各任务 | `docs/architecture/modules/connections.md` | 版本、工具入口、验证范围与未完成的实际切换门槛 |

新函数与新文件在索引中尚无调用者时，impact 的 UNKNOWN 不解释为 LOW。所有现有符号修改仍先做 upstream impact。

## Task 1: Deterministic Migration Plan

**Files:** Create `migration-plan.ts` and `relationship-lifecycle-migration-plan.test.ts` at the paths above; update the Connections module document.

**Interfaces:**

```ts
type LifecycleMigrationCollection = "contacts" | "connections" | "tasks" | "contact_detail_states";
interface LifecycleMigrationManifest {
  schemaVersion: 1;
  actorId: string;
  workspaceId: string;
  ownerRepairs: readonly { collectionName: LifecycleMigrationCollection; recordId: string; evidenceId: string }[];
}
interface LifecycleMigrationChange {
  collectionName: LifecycleMigrationCollection;
  recordId: string;
  beforeHash: string;
  afterHash: string;
  owner?: string;
  payload: { version?: number; stage?: ConnectionStage; dueAt?: string };
}
interface LifecycleMigrationPlan {
  migrationId: "relationship-lifecycle-v1";
  schemaVersion: 1;
  actorId: string;
  workspaceId: string;
  sourceHash: string;
  manifestHash: string;
  planHash: string;
  applyEligible: boolean;
  changes: readonly LifecycleMigrationChange[];
  issues: readonly { code: string; collectionName: string; recordId: string }[];
  before: LifecyclePreflightReport;
  after: LifecyclePreflightReport;
  databaseWriteExecuted: false;
}
function parseLifecycleMigrationManifest(input: unknown): LifecycleMigrationManifest;
function lifecycleMigrationRecordHash(record: LiveRecord): string;
function planRelationshipLifecycleMigration(input: { manifest: LifecycleMigrationManifest; records: readonly LiveRecord[] }): LifecycleMigrationPlan;
function applyLifecycleMigrationChanges(records: readonly LiveRecord[], changes: readonly LifecycleMigrationChange[]): LiveRecord[];
```

- [x] Write a complete LiveRecord fixture helper and failing tests. An owned active Contact/Connection pair without versions gets exactly version 1 patches and an eligible plan; source objects remain byte-equivalent.

```ts
const before = structuredClone(rows);
const plan = planRelationshipLifecycleMigration({ records: rows, manifest });
assert.equal(plan.applyEligible, true);
assert.deepEqual(plan.changes.map(c => [c.collectionName, c.payload]), [
  ["connections", { version: 1 }], ["contacts", { version: 1 }],
]);
assert.deepEqual(rows, before);
assert.equal(JSON.stringify(plan).includes("PRIVATE GOAL"), false);
```

- [x] Run `node --import tsx --test tests/services/relationship-lifecycle-migration-plan.test.ts` and observe the missing implementation failure.
- [x] Validate exact manifest keys, explicit normalized identities, allowed collections, unique repair targets and nonblank evidence IDs. A repair target must exist exactly once, be nondeleted, and have an actually empty owner. Reject nonempty owner repairs even when it equals the requested actor; they are not repairs.
- [x] Hash a stable normalized representation of all four source collections in the declared workspace, including deleted records, sorted by physical identity. Optional undefined envelope fields normalize consistently with PostgreSQL nulls; object property order and input record order do not change hashes. Actual payload/owner/source/timestamp changes do change hashes. Reject non-JSON data without printing it.
- [x] Clone input records, apply only declared null-owner repairs, and select actor-owned records plus referenced records and records that claim the actor. Do not adopt orphan records or use actor links. Undeclared missing owners remain issues. Duplicate physical keys and conflicting claims block eligibility before planning payload changes.
- [x] Initialize absent versions on selected contacts/connections/tasks. Preserve existing valid versions and reject malformed ones. Normalize a valid relationship task dueAt to UTC ISO without changing its creation/update timestamps or any private field.
- [x] Select a connection stage only when its current stage is not canonical. Use an owned (or explicitly owner-repaired) detail state only with matching actor/contact identity, a canonical status, valid timestamp newer than the Contact payload updatedAt, and no equally-timed conflicting states. Otherwise use a canonical Contact stage. captured/reviewing without a stronger valid authority yields `ACQUISITION_REVIEW`; unknown stage yields `UNKNOWN_STAGE`. Bad relevant timestamps or ownership cannot be bypassed by fallback.
- [x] Run the existing preflight on the projected clone. Merge deterministic migration-specific issues with that report; `applyEligible` means no issues, not that human review exists. Changes contain only permitted metadata patches and before/after hashes. Blocked plans retain proposed changes for review but cannot be executed.
- [x] `applyLifecycleMigrationChanges` checks unique exact targets, before hashes and after hashes, clones rows, permits only owner/version/stage/dueAt patches, and never mutates caller-owned arrays or payloads. It is not an approval boundary; the transaction task re-plans and verifies external review before calling it.
- [x] Cover canonical precedence, newer/older detail state, contact fallback, ambiguous/bad dates, null/foreign owners, unknown repair target, duplicate connections/tasks/physical keys, all four stages, missing goal/date, unknown purpose, archive/open conflicts, unrelated workspace/account preservation, JSON order, sensitive text and frozen inputs.
- [x] Run preflight + planner + Web typecheck; obtain independent review; run staged GitNexus detection; commit only Task 1 files plus this plan and its module handoff. Completed as `2a63738b4`: 106 tests passed, none skipped; full Web typecheck passed. Independent review findings have regression coverage.

## Task 2: External Review Binding

**Files:** Create `migration-review.ts` and `relationship-lifecycle-migration-review.test.ts`; update the module document.

**Interfaces:**

```ts
interface LifecycleMigrationReview {
  schemaVersion: 1;
  actorId: string;
  workspaceId: string;
  sourceHash: string;
  manifestHash: string;
  planHash: string;
  reviewedBy: string;
  reviewedAt: string;
  approved: true;
}
function parseLifecycleMigrationReview(input: unknown): LifecycleMigrationReview;
function assertLifecycleMigrationReview(input: {
  review: LifecycleMigrationReview; plan: LifecycleMigrationPlan;
  actorId: string; workspaceId: string; operatorId: string; now: string;
}): void;
```

- [x] Write failing tests using a literal external-review fixture. Match actor/workspace/operator and all three hashes; reject missing approval, extra fields, malformed hashes, empty identities, future/invalid review timestamps, noneligible plans, and any identity/hash mismatch.

```ts
assert.throws(() => assertLifecycleMigrationReview({
  review: { ...review, sourceHash: "0".repeat(64) }, plan,
  actorId, workspaceId, operatorId, now,
}));
```

- [x] Implement strict parsing and immutable copies. Reuse lifecycle instant validation. Do not create a helper or CLI that automatically supplies `approved: true`, `reviewedBy` or `reviewedAt` for the operator.
- [x] Report generic typed errors without attaching raw review input. Document that an artifact binds the reviewed version but does not prove a human read it; the authorized operator is responsible for obtaining real approval.
- [x] Run Task 1 + Task 2 tests and typecheck, review independently, detect staged scope and commit Task 2. Completed as `ff70988f6`: 26 tests passed, none skipped; full Web typecheck and independent review passed.

## Task 3: Transactional Migration Repository

**Files:** Create `migration-repository.ts`, `migration-schema.ts` and `relationship-lifecycle-migration-postgres.test.ts`; update the module document. Shared SQL column projection and isolated test fixture use the two supporting files listed above so Task 4 can reuse exact timestamp handling and database isolation.

**Interfaces:**

```ts
interface LifecycleMigrationReceipt {
  migrationId: "relationship-lifecycle-v1";
  actorId: string; workspaceId: string; runId: string; operatorId: string;
  sourceHash: string; manifestHash: string; planHash: string;
  changedRecords: number; completedAt: string; replayed: boolean;
}
function runLifecycleMigrationSchema(client: TransactionalSqlExecutor): Promise<void>;
function createPostgresLifecycleMigrationRepository(input: {
  client: TransactionalPostgresClient; workspaceId: string;
}): {
  dryRun(manifest: LifecycleMigrationManifest): Promise<LifecycleMigrationPlan>;
  apply(input: { manifest: LifecycleMigrationManifest; review: LifecycleMigrationReview;
    actorId: string; operatorId: string; runId: string; now: string;
  }): Promise<LifecycleMigrationReceipt>;
};
```

- [x] Use an explicitly configured isolated test URL, unique schema per test, statement/connection timeouts, and the real transactional runtime. Do not source `.env` or default to an application's database URL.
- [x] Write failing PostgreSQL tests for dry-run not writing, exact reviewed patches committing, all other payload/envelope fields unchanged, stale source rejection, blocked plan rejection, conflicting review identities, same-run replay and same-run different-command rejection.
- [x] Add the migration receipt table with primary key `(workspace_id, actor_id, run_id)` and a request hash. Store only validated metadata receipts. Migration audits use a separate collection and contain changed physical identities/field names and review hashes, not full before/after data.
- [x] `dryRun` reads a complete maintenance snapshot of the four source collections in one transaction and plans without mutations. This maintenance-only reader may inspect workspace records for ownership conflicts; it is never exported through a user API.
- [x] `apply` clones/validates its arguments before any await. In one serializable transaction, look up the receipt, validate any replay against exact request identity, lock/read source records, regenerate the plan, assert external review, apply only its generated changes, rerun preflight, write audit and receipt, then commit. Replays do not claim present-day readiness.
- [x] Require exactly one row per changed physical target; use pinned workspace/collection/record and the observed owner. Revalidate before/after content hashes. Never replace a full payload with a handcrafted DTO; merge the exact minimal patch and preserve creation/update dates because this is metadata repair, not a new user action.
- [x] Retry only serialization/deadlock/this receipt's uniqueness races, with three total attempts. All other errors return immediately. Each retry re-reads the receipt and full source; no cached plan survives a transaction restart.
- [x] Inject an audit or receipt write failure after record updates and assert complete rollback. Race identical and distinct run IDs; test a foreign-owner reference and an unrelated record with the same logical ID. Include a callback/await mutation attempt and malformed stored receipts to prove snapshots cannot be swapped or replayed across actors.

```ts
const first = await repository.apply(input);
const second = await repository.apply(input);
assert.equal(first.replayed, false);
assert.equal(second.replayed, true);
assert.equal(second.changedRecords, first.changedRecords);
assert.equal(await receiptCount(), 1);
assert.deepEqual(await readUntouchedRecords(), originalUntouchedRecords);
```

- [ ] Run all migration tests, existing lifecycle PostgreSQL/transition/service tests and Web typecheck. Review, detect staged scope, commit Task 3. Stop only the test database started for this task and preserve other running services.

## Task 4: Canonical Batch Projection Without Cutover

**Files:** Create `read-projection.ts`, `relationship-lifecycle-read-projection.test.ts`, `relationship-lifecycle-read-postgres.test.ts`; update the module document.

**Interfaces:**

```ts
interface CanonicalContactLifecycleView {
  contactId: string; connectionId: string; connectionVersion: number;
  relationshipStage: ConnectionStage; status: ConnectionStage;
  activeGoal: string | null;
  nextFollowup: null | { taskId: string; taskVersion: number; title: string;
    dueAt: string; timeStatus: "future" | "today" | "overdue" };
}
function projectCanonicalContactLifecycles(input: {
  actorId: string; workspaceId: string; records: readonly LiveRecord[];
  now: string; timeZone: string;
}): readonly CanonicalContactLifecycleView[];
function readCanonicalContactLifecycles(input: {
  client: TransactionalPostgresClient; workspaceId: string; actorId: string;
  now: string; timeZone: string;
}): Promise<readonly CanonicalContactLifecycleView[]>;
```

- [ ] Write pure failing tests: stale Contact stage and detail-state text never override Connection; nextFollowup comes from the earliest real open/scheduled dated task with a stable ID tie-break; advice text creates no task. Time status is overdue for a past instant, today for a nonpast instant in the same supplied local calendar day, otherwise future. Invalid timeZone/clock/date fails visibly.
- [ ] Require the preflight invariants and additionally validate any generic dated task that can become nextFollowup. Undated generic tasks remain untouched and do not satisfy relationship obligations. No arrays or private strings from another actor reach the result, including malformed cross-actor references.
- [ ] Implement the pure view by indexing records once. Do not import UI code or change shared response contracts before the actual cutover gate; this is a service-owned candidate projection.
- [ ] Write PostgreSQL tests for batched actor-first connections, matching owned contacts/tasks, and metadata-only checks for orphan contacts or foreign references. All user-data reads contain explicit workspace and actor predicates. A fixed number of queries handles 1 and 50 contacts; no per-card SQL is allowed.
- [ ] Run the reader within a single transaction for a consistent view. Missing/duplicate references or invalid lifecycle state throws a controlled consistency error, never a partial result or legacy fallback. The reader does not run schema migrations, trust a past receipt as activation, or connect itself to a route.
- [ ] Run all four tasks' tests, existing lifecycle regression and typecheck; independent final review, scoped detection and Task 4 commit.

## Completion Audit / Remaining Operational Gate

This tool implementation is complete only with real isolated PostgreSQL rollback/concurrency evidence, deterministic plans, rejected stale/forged review fixtures, and batch-read tests. Green unit tests alone are insufficient.

Actual phase 2 remains incomplete until an authorized operator obtains a fresh real-data snapshot, resolves all reported ownership/goal/date/acquisition conflicts, obtains explicit review of its exact manifest/plan, runs the reviewed migration in a controlled window, and revalidates current data before API cutover. No task above authorizes those actions or advances Web/iOS to a new read/write path. Search/filter UI and the other bidirectional audit items remain separately outstanding.
