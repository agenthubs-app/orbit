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

- [x] Run all migration tests, existing lifecycle PostgreSQL/transition/service tests and Web typecheck. Review, detect staged scope, commit Task 3. Stop only the test database started for this task and preserve other running services. Completed as `a7f42c78a`: 146 lifecycle tests passed with no database skips, full Web typecheck and independent review passed; the dedicated test instance was stopped, then explicitly restarted for Task 4.

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

- [x] Write pure failing tests: stale Contact stage and detail-state text never override Connection; nextFollowup comes from the earliest real open/scheduled dated task with a stable ID tie-break; advice text creates no task. Time status is overdue for a past instant, today for a nonpast instant in the same supplied local calendar day, otherwise future. Invalid timeZone/clock/date fails visibly.
- [x] Require the preflight invariants and additionally validate any generic dated task that can become nextFollowup. Undated generic tasks remain untouched and do not satisfy relationship obligations. No arrays or private strings from another actor reach the result, including malformed cross-actor references.
- [x] Implement the pure view by indexing records once. Do not import UI code or change shared response contracts before the actual cutover gate; this is a service-owned candidate projection.
- [x] Write PostgreSQL tests for batched actor-first connections, matching owned contacts/tasks, and metadata-only checks for orphan contacts or foreign references. All user-data reads contain explicit workspace and actor predicates. A fixed number of queries handles 1 and 50 contacts; no per-card SQL is allowed.
- [x] Run the reader within a single transaction for a consistent view. Missing/duplicate references or invalid lifecycle state throws a controlled consistency error, never a partial result or legacy fallback. The reader does not run schema migrations, trust a past receipt as activation, or connect itself to a route.
- [ ] Run all four tasks' tests, existing lifecycle regression and typecheck; independent final review, scoped detection and Task 4 commit.

### Task 4 verification checkpoint / commit paused

The reader has 22 passing tests (8 pure, 13 real PostgreSQL, 1 pre-SQL guard), none skipped. All lifecycle tests total 168 passing with no skips; full Web typecheck passes. Independent final review approved the tool layer and independently reproduced the 22 reader tests. These results do not cover API or client cutover.

The broader Web test run finished with 2,524 passes, 18 failures and 19 skips (2,561 total). Task 4 is not committed and the full-suite completion gate remains unresolved. Failure groups are:

| Group | Failing tests | Observed evidence, not a blanket baseline waiver |
| --- | --- | --- |
| Product-surface and functional-audit assertions | 7 | Mobile DataCard route counts, navigation/query/static-evidence expectations and generated risk counts differ from current UI sources. The current App worktree also contains other ongoing changes. |
| AI email, live Agent locale and event seed | 3 | Live-contact draft returns failure; event recommendation reports unavailable events; seed completeness is only `complete` instead of three categories. |
| Contact/event page tests | 4 | Dashboard still expects the old loader name; image render lacks App Router context; ended-event assertion expects the old expression; persisted registration is blocked by missing enrollment-window configuration. |
| Navigation and style ratchets | 4 | Mobile settings link assertion and font/z-index ceilings fail, including prior contact-page and analysis UI changes. |

The migration-tool commits add standalone modules and tests; no current application/factory imports their new entry points. That rules out a direct route-wiring change, but does not prove all 18 failures are harmless or unrelated to earlier work in the overall goal. Do not rewrite expected counts or raise style ceilings merely to obtain green tests.

**Test-environment incident:** the broader run cleared inherited environment variables but some existing tests call `loadLocalEnv()`, which reads `.env.local`/`.env` again. PostgreSQL tests therefore used the existing configured event database, not just the lifecycle fixture. Several observed tests explicitly created and dropped their own temporary schemas; the failed catalogue registration throws before the registration mutation. No pre-run business-data snapshot exists for this run, so neither observation proves that every business record remained unchanged. Further broad runs are stopped; a read-only residual/audit check of that configured database was requested, and no cleanup or business-data mutation is authorized. The lifecycle-specific tests use only `ORBIT_LIFECYCLE_TEST_DATABASE_URL` and do not load local environment files.

Before another broad run, inspect direct and transitive local-env loaders and enforce a dedicated test database plus blocked real credentials. Clearing only the parent environment is insufficient. Keep this incident and the 19 skipped checks visible; do not report the entire repository or the bidirectional product audit as verified.

### Offline follow-up while database audit permission is pending

Source and existing-report inspection identified 27 test files with direct `loadLocalEnv()` calls and two page-test files using the registration catalogue fixture, which also loads local configuration. One executed event-access test explicitly reads the configured main schema and compares evidence before/after a missing-event lookup. The 19 skipped tests are now individually identified, including the main profile-repair inventory/ledger checks. These observations narrow the investigation but do not replace a database audit or prove absence of business changes.

Five previously failing cases have been repaired without production edits or a database connection:

- `app-contacts-dashboard-account-scope.test.ts` now invokes the real page and route loader with isolated authentication/storage boundaries, checking canonical account identity, anonymous redirect and missing-account rejection instead of an obsolete loader-name assertion.
- `ai-email-draft-service.test.ts` supplies the required `finish_reason: "stop"` in its simulated DeepSeek response; production finish-reason validation remains unchanged.
- `app-demo-visual-assets.test.tsx` provides the router/search contexts needed by the actual event-list component. Image checks now verify the current hero/rail loading policy; SVG fixture markup does not expose raster `sizes/srcset` attributes.
- `orbit-agent-gemini-live.test.ts` injects complete fixed event evidence into the real artifact service for its locale test, eliminating an accidental dependency on the configured canonical event database while retaining real Agent routing and localization.
- `app-event-detail-live-route-services.test.ts` replaces the obsolete registration-expression assertion with the real event-detail and matchmaking components. Five runtime cases verify that an authenticated viewer denied operations access gets a registration link only for an upcoming event with an open registration window, never for ended/closed/frozen/unavailable states. The HTTP boundary is a local failure fixture; no product gating was changed.

The eight focused files (these five plus analysis view-model, event-detail-page and matchmaking regression) pass 96 tests, none skipped. The child inherits only `PATH`, `TMPDIR`, `LANG` and `TZ`; an in-memory preload rejects `.env` reads through `readFileSync`, socket connections and unmocked fetches before test imports. Test-specific HTTP doubles stay in memory. Full Web typecheck passes. Independent read-only review approved all five test repairs with no findings, confirming real page/route/artifact/matchmaking behavior remains exercised. No new full-suite run was performed; the recorded 18-failure result remains historical, and the other 13 failing cases remain unresolved or unverified. These test repairs and Task 4 remain uncommitted because the broader verification gate is unresolved; no existing database cleanup, real migration, API cutover or push was performed. The owned PostgreSQL fixture remains stopped (`pg_ctl ... status`: no server running).

Further offline diagnosis found a requirements conflict in `event-operations-seed.test.ts`: commit `dc796622e` intentionally filled the previously sparse participant answers, so the current 64-person cohort is entirely complete, while `docs/event-operations-e2e.md` still explicitly requires complete/partial/minimal profiles and the test expects 56/5/3. Neither changing the expected counts nor deleting the later fixture content is justified without resolving that acceptance conflict. No seed or completeness rule was changed. The remaining style/navigation/audit failures likewise have not been waived or hidden by raising ceilings or dropping checks.

## Completion Audit / Remaining Operational Gate

This tool implementation is complete only with real isolated PostgreSQL rollback/concurrency evidence, deterministic plans, rejected stale/forged review fixtures, and batch-read tests. Green unit tests alone are insufficient.

Actual phase 2 remains incomplete until an authorized operator obtains a fresh real-data snapshot, resolves all reported ownership/goal/date/acquisition conflicts, obtains explicit review of its exact manifest/plan, runs the reviewed migration in a controlled window, and revalidates current data before API cutover. No task above authorizes those actions or advances Web/iOS to a new read/write path. Search/filter UI and the other bidirectional audit items remain separately outstanding.

### 2026-09-10 authorized read-only database audit

The user explicitly approved a read-only residual/audit check. It is now complete: no new test-schema or known catalogue-test actor residue was found; 47 public tables match the verified September 6 backup row-for-row. `orbit_records` has 49 modified rows and 13 additional rows, with no deletions; all differing records have recorded update times before the September 9 test run. Six old profile-repair test schemas remain untouched. These observations found no persistent change attributable to that full-suite run, but no immediately preceding snapshot or complete successful-SQL audit exists, so zero historical impact is not proven. See the [full audit and limitations](../../operations/2026-09-10-test-database-readonly-audit.md).

This approval did not authorize cleanup, repairs, real migration or cutover. The environment-isolation and broader regression gates remain unresolved. During the audit, an external process preserved the pending work as `cb806901e`; earlier statements that Task 4 and the five test repairs were uncommitted describe the September 9 checkpoint, not the current Git state. This audit made no commit or push and did not override that external work.
