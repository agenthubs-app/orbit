# Relationship Lifecycle Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不访问或修改业务数据库、不切换现有接口的条件下，提供可重复的关系生命周期迁移预检及只读命令入口。

**Architecture:** 纯预检器消费明确提供的 LiveRecord 快照，输出账号/workspace 范围内的数量、冲突与修复事项，不执行修复。命令入口只读取操作者指定的 JSON 文件，将报告写到 stdout；没有数据库配置加载、写入开关或隐式账号推断。

**Tech Stack:** TypeScript、Node.js、node:test、tsx、现有 LiveRecord 类型及生命周期日期/阶段校验器。

**Spec:** 上层工作区已批准的 `docs/superpowers/specs/2026-08-21-contact-lifecycle-and-filters-design.md`，其中“数据迁移”“并发、错误与审计”章节。本计划只完成第 2 阶段的预检准备，不代表人工复核、正式迁移或读取切换已完成。

## Global Constraints

- 四阶段值为 `needs_follow_up | active | nurture | archived`；当前中文用“待联系”，遵循本轮已确认术语，不回退旧称。
- ContactActorLink 不授予 ownership；非空 owner 冲突不得自动修复。
- Confirmed Contact 必须有且仅有一条同账号 Connection。
- 缺少整数 version 可列为待修复；零、负数、小数、字符串或 null 不是有效版本。
- 不推测日期、目标或 task purpose；不自动选择 connection、取消任务或合并联系人。
- 预检只产生报告。任何待修复事项均使 `readyForCutover` 为 false，不能以“可修复”代替已修复。
- 输出不得包含私人任务标题、关系目标、笔记、联系人姓名或完整 payload。
- 不读取 `.env`，不导入配置数据库工厂，不调用业务/provider API。
- 只编辑本 Web 仓库文件，保留 App 和根目录进行中的改动；外层 Git 按任务独立提交，不 push。

## 已验证前置条件

生命周期基础实现截至 `295ea426a`，共 6 个独立提交。2026-09-08 本地验证：Web 定向 109 项、App 契约/Schema/字典同步 6 项通过；Web 全量类型检查及新增测试文件定向类型检查通过。18 项 PostgreSQL 测试使用隔离 socket 数据库，未访问业务数据库。现有 Web/App 阶段入口仍未切换。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `features/connections/lifecycle/migration-preflight.ts` | 纯预检、确定性报告、冲突分类；没有存储依赖 |
| `tests/services/relationship-lifecycle-preflight.test.ts` | 所有权、版本、阶段约束、确定性、隐私及不修改输入的行为验证 |
| `scripts/check-relationship-lifecycle.ts` | 显式 JSON 文件/actor/workspace 参数、stdout 报告、退出码 |
| `tests/services/relationship-lifecycle-preflight-cli.test.ts` | 子进程执行真实命令，验证参数、失败、输出与只读行为 |
| `docs/architecture/modules/connections.md` | 命令用法、结果含义及尚未通过的切换门槛 |

## Task 1: Pure Migration Preflight

**Files:** Create `features/connections/lifecycle/migration-preflight.ts`; create `tests/services/relationship-lifecycle-preflight.test.ts`; modify `docs/architecture/modules/connections.md`.

**Interfaces:**

```ts
export interface LifecyclePreflightIssue {
  code: "INVALID_RECORD" | "MISSING_OWNER" | "OWNER_CONFLICT"
    | "MISSING_CONNECTION" | "MULTIPLE_CONNECTIONS" | "INVALID_REFERENCE"
    | "ACQUISITION_REVIEW" | "UNKNOWN_STAGE" | "MISSING_VERSION"
    | "INVALID_VERSION" | "MISSING_GOAL" | "MISSING_DATED_TASK"
    | "INVALID_TASK" | "NON_CANONICAL_DATE" | "ARCHIVED_OPEN_TASKS";
  collectionName: string;
  recordId: string;
}
export interface LifecyclePreflightReport {
  actorId: string;
  workspaceId: string;
  readyForCutover: boolean;
  counts: { contacts: number; connections: number; relationshipTasks: number; ignored: number };
  issues: LifecyclePreflightIssue[];
}
export function assessRelationshipLifecycleMigration(input: {
  actorId: string;
  workspaceId: string;
  records: readonly LiveRecord[];
}): LifecyclePreflightReport;
```

- [ ] Write table-driven failing tests with literal expected issue codes. The fixture helper creates complete LiveRecord envelopes, and each test passes real records into the pure function.

```ts
const valid = [
  record("contacts", "contact:a", "actor:a", { id: "contact:a", stage: "active", version: 1 }),
  record("connections", "connection:a", "actor:a", {
    id: "connection:a", accountId: "actor:a", contactId: "contact:a",
    stage: "active", activeGoal: "Existing private goal", version: 1,
    createdAt: "2026-08-21T01:00:00.000Z", updatedAt: "2026-08-21T01:00:00.000Z",
  }),
];
assert.equal(assessRelationshipLifecycleMigration({ actorId: "actor:a", workspaceId: "workspace:test", records: valid }).readyForCutover, true);
assert.deepEqual(assessRelationshipLifecycleMigration({ actorId: "actor:a", workspaceId: "workspace:test", records: valid.slice(0, 1) }).issues,
  [{ code: "MISSING_CONNECTION", collectionName: "contacts", recordId: "contact:a" }]);
```

- [ ] Run `node --import tsx --test tests/services/relationship-lifecycle-preflight.test.ts` and confirm the missing preflight export is the initial failure.
- [ ] Implement scope validation and deterministic record classification. Index records by `(collectionName, recordId)` within the requested workspace. Consider actor-owned contacts/connections/tasks, connections whose payload accountId claims the actor, and contacts/tasks referenced by those relationships. A matching payload must never override a different nonempty row owner. Records outside this scope contribute only to `ignored`.
- [ ] Check the scoped graph. Require payload id to match record id; require referenced contacts and tasks to have the same nonempty actor owner, including generic tasks linked to a connection. Do not use ContactActorLink. A missing owner is a report item, not an inferred repair. Multiple physical candidates for one actor/contact block readiness. The `relationshipTasks` count includes all task records associated with the scoped relationships, not just explicit obligations.
- [ ] Check canonical versions and stage constraints. A valid connection stage is the authority; legacy contact/detail-state status cannot overwrite it in this readiness checker. Invalid/legacy connection stages require review rather than an automatic fallback migration. Report captured/reviewing as `ACQUISITION_REVIEW`, unknown states as `UNKNOWN_STAGE`. This checker does not implement the later reviewed legacy-value migration.
- [ ] Validate relationship tasks using `normalizeRelationshipLifecycleInstant`. Only explicit `follow_up`/`maintenance` purposes count toward stage requirements. Generic tasks remain generic. Require matching contact/connection identity, valid status, title, dueAt, creation/update timestamps and version. Valid but noncanonical dueAt values produce `NON_CANONICAL_DATE`, since indexed date ordering needs normalized UTC strings. Archived connections cannot retain open/scheduled relationship tasks. Active requires an existing nonblank goal. Needs-follow-up/nurture require an open/scheduled dated task of the corresponding purpose.
- [ ] Deduplicate and sort issues by collection, record id, then code using explicit lexical comparison. Return `readyForCutover: issues.length === 0`. Do not include payload fields in the report.

```ts
const before = structuredClone(records);
const first = assessRelationshipLifecycleMigration({ actorId, workspaceId, records });
const second = assessRelationshipLifecycleMigration({ actorId, workspaceId, records: [...records].reverse() });
assert.deepEqual(first, second);
assert.deepEqual(records, before);
assert.equal(JSON.stringify(first).includes("PRIVATE TASK TITLE"), false);
```

- [ ] Run green tests covering: valid stages, missing/duplicate connection, wrong/null owners, foreign referenced contact/task, missing/invalid versions, active without goal, missing dated purpose task, generic tasks not satisfying a stage, impossible dates, archived open tasks, acquisition/unknown stages, malformed payload, record id mismatch, unrelated actor/workspace isolation, ordering, privacy, immutable inputs.
- [ ] Run directed TypeScript over the new test and implementation, update the module doc, request read-only review, run GitNexus staged detection and commit only these task files.

## Task 2: Explicit Offline Preflight Command

**Files:** Create `scripts/check-relationship-lifecycle.ts`; create `tests/services/relationship-lifecycle-preflight-cli.test.ts`; modify `docs/architecture/modules/connections.md`.

**Interfaces:** Consumes `assessRelationshipLifecycleMigration`. Produces CLI `--input <file> --actor <id> --workspace <id>`; file shape is a JSON array of LiveRecord objects. Prints a single JSON report. Exit 0 means preflight ready, 2 means review/repair required, 1 means command/input failure. No `--apply` option exists.

- [ ] Write real child-process tests in a temporary directory. Create input fixtures with `fs.writeFile` inside the tests; execute Node with `--import tsx`. Assert stdout JSON, exit code, and unchanged input bytes. Remove only each test's own temporary directory in cleanup.

```ts
const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-relationship-lifecycle.ts", "--input", inputPath, "--actor", "actor:a", "--workspace", "workspace:test"], { encoding: "utf8" });
assert.equal(result.status, 0);
assert.equal(JSON.parse(result.stdout).readyForCutover, true);
assert.equal(await readFile(inputPath, "utf8"), originalJson);
```

- [ ] Run the CLI tests red. Missing input/actor/workspace, unknown or repeated arguments, invalid JSON and non-array JSON must fail before preflight; `--apply` must be rejected.
- [ ] Implement explicit pair parsing, `readFile` and JSON parsing. Validate a complete input envelope before invoking preflight; throw a controlled error without echoing file contents. Set `process.exitCode` from the result. Guard CLI execution with `pathToFileURL(process.argv[1]).href === import.meta.url` following existing scripts.
- [ ] Run green CLI + pure tests and Web typecheck. Document that exit 0 is only a snapshot precheck: it does not prove freshness, authorize repairs, execute migration, or enable a route flag.
- [ ] Request read-only review, run scoped GitNexus detection and commit this task independently.

## Completion And Next Gate

This preparation plan is complete when both task test suites and Web typecheck pass, no existing reader/writer is changed, and both tasks are committed. It is not completion of phase 2 or of cross-client synchronization.

Next phase-2 work still requires a reviewed migration manifest tied to a fresh source snapshot, a transactional apply path with rollback/receipt tests, canonical batch projection and compatibility fields. Formal execution and route cutover remain gated on explicit human review of actual records; do not generate an approval or enable a fallback to bypass that gate.
