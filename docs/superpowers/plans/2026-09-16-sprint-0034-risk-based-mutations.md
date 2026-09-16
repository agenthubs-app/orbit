# Sprint 0034 Risk-Based Mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只为 note/task/relationship-followup/personal-schedule 提供耐久离线确认、幂等上传和显式冲突处理，并落实全域读取的三策略、受控 snapshot 与加密 binary cache。

**Architecture:** `OfflineDataPolicyRegistry` 引用 0033 domain registry；B 线的 scope/transaction/manifest 端口由 0033 已验收接口适配，outbox overlay 与 canonical 分离。服务器每项 mutation 在一个全局 receipt 事务中调用领域 CAS 和 journal；App 原子应用 receipt/alias，0035 调度恢复，0036 消费 pending 摘要。

**Tech Stack:** TypeScript、Zod 4、Node test/tsx、PostgreSQL、现有领域服务、Expo SQLite/SQLCipher、SecureStore、React Native、iOS Simulator。

**Spec:** [批准规范](../specs/2026-09-16-universal-offline-read-design.zh-CN.md)；[本线设计](../../../repos/orbit-app/docs/sprints/0034-offline-personal-mutations/DESIGN.md)；[唯一验收契约](../../../repos/orbit-app/docs/sprints/0034-offline-personal-mutations/PLANNER.md)。

## Global Constraints

- 全部可离线读不等于全部可离线写。首批仅 note/task/relationship_followup/personal_schedule；其他域扩展不属于本计划。
- `readPersistence`：`durable_normalized`、`encrypted_ttl_snapshot`、`device_only`、`online_only_secret`。
- `mutationPolicy`：`offline_queue`、`local_only`、`online_only`。
- `binaryPolicy`：`metadata_only`、`on_demand_encrypted`、`user_pinned_encrypted`、`never_local`。
- `local-read` 不能上传、修改、邀请、发送、报名或触发外部副作用；它可保存明确支持的本地 pending，不能授予服务器写权限。
- SQLCipher 数据库和资源缓存按规范化 Base URL 与 actor 隔离；每一行数据、游标、资源和索引还必须绑定 workspace 与 authorization epoch。
- 默认拒绝未知 domain、版本、字段或 authorization epoch。AI manifest 不是客户端授权依据。
- 恢复网络：再认证/权限刷新 → 清除撤权可读投影及资源 → 获准 outbox → delta。单域 reset 保留草稿/outbox/conflict；账号整体撤销按 0033 擦除。
- 全局 receipt lock → 领域 transaction/CAS → 共享 sync-write lock；业务、sync revision/journal、最终 receipt 同事务。
- 共享副本只能 `npm run sync:contract` 生成，App 不跨仓 import。Web 不增加离线能力。
- 修改符号前执行 GitNexus upstream impact；HIGH/CRITICAL 先报告；每阶段提交前 `detect_changes`。
- 本轮只交四份规划文档、提交到本线后暂停等管理线审查；不运行下面实现步骤、不 merge/push、不建 REPORT、不登记 Generator run。
- 后续实现遵守 Sprint RULES 的单 Generator；上方技能标准头不授权额外实现/评审代理，也不重新调用 RULES 已取消的执行技能。明确批准可复用。

## Baseline and ownership

规划基线 `2f862c9f84167408df09914acca521f528ae4185`，0032 完成记录见其 REPORT。实际源码仍为 v1 `sync_records/sync_outbox`、workspace 单游标、无 policy 的 `legacy_api_snapshots`；基线无 `features/sync/`。旧 0033/0034 仅四域设计被批准全域规范覆盖。不能在此基线假定全域接口已存在。

所有命令标出 cwd；`git` 命令从仓库根执行。App 测试前缀为 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs`；Web 为 `node --test --import tsx`。代码块是每阶段首条可运行行为用例与关键最小实现；同阶段补充的失败矩阵也必须逐条 RED→GREEN，不能只实现首条例子。

0033 共享文件由 A 线持有：`repos/orbits/shared/contract/sync.ts`、`repos/orbit-app/src/api/contract/sync.ts`、`repos/orbit-app/src/data/sync/local-sync-schema.ts`、`local-sync-repository.ts`、`local-sync-database.ts`、`sync-lifecycle.ts` 与认证 provider。B 线不并行改这些文件。新 migration 经 B 注册函数由 A/协调者在 0033 migration runner 接线；不猜 next schema version，不复制游标表。

| 门槛 | 管理线必须提供的固定交接证据 | 阻塞动作 | 可先做的 RED |
| --- | --- | --- | --- |
| G-A1 | 0033 identity/scope/epoch/online guard/local-read lease 的导出路径、签名及固定 SHA；账号与域撤权用例 | 生产 ScopePort 接线、上传/UI 资格 | Task 1、4、6 的纯规则；注入 scope 端口的反例 |
| G-A2 | registry 版本/strict projection validator、canonical revision comparator/apply、SQLCipher migration/transaction 的导出和验收 SHA | Task 2/4/7 的生产存储与 ack/delta 并发接线 | snapshot envelope、overlay、回执 rollback 测试 |
| G-A3 | manifest resource 字段、租期、reset/revoke hook 的签名和资源隔离验收 | Task 3 的 manifest/native 接线 | 字节校验、配额、无明文缓存、失效测试 |
| G-A4 | server transaction client、领域授权、journal append/共享 sync-write lock 的路径签名及真实 PostgreSQL 证据 | Task 5 的生产 receipt/领域事务接线 | strict batch、replay/CAS/锁顺序的端口测试 |
| G-A5 | 四域已验收 mirror/selector/消费者路径与固定 SHA | Task 8 UI 接线、Task 9 runtime | status rendering、eligibility 单元 RED |

表中 B 自有端口是消费需求，不宣称是 0033 已有导出。接口固定后在 `0033-bindings.ts` 逐一绑定真实导出并记录 SHA；不得创建假的上游模块、重定义身份字段或自行把旧 updatedAt 当 revision。每个门槛仅限制其依赖；全部集成须基于验收后的 0033 阶段提交。

## File structure and shared B interfaces

以下新模块职责固定；Task 文件表也是未来实现白名单，当前只允许本计划及本 Sprint GOAL/DESIGN/PLANNER。

- Web `shared/contract/offline-policy.ts`：三个策略与纯 route/action 注册表；`shared/contract/offline-mutations.ts`：四域严格 mutation/result 类型。
- App `src/data/offline/policy-registry.ts`：使用复制契约、0033 validator 的策略入口；`ports.ts`：B 消费能力；`0033-bindings.ts`：唯一上游接线。
- App `policy-snapshot.ts`：envelope 校验；`binary-cache.ts`、`binary-cache.native.ts`、`binary-cache.web.ts`：资源策略、真实加密存储与 Web 明确拒绝；`offline-storage-migration.ts`：只迁移本线表。
- App `src/data/sync/mutation-adapters.ts`、`outbox-repository.ts`、`pending-overlay.ts`、`outbox-uploader.ts`、`conflict-resolution.ts`：分别负责领域规则、持久命令、展示投影、上传、用户选择。
- Web `features/sync/mutation-adapters.ts`、`mutation-receipt-store.ts`、`mutation-service.ts` 与 mutations HTTP route：领域调用、全局事务回执、编排、在线认证入口。

Task 1 定义以下 B 最小消费能力：`ScopeCapability`/`ScopePort`/`ProjectionPort` 放在 App `ports.ts`；`OfflinePolicy` 放 Web `shared/contract/offline-policy.ts`；Mutation 及 result 放 Web `shared/contract/offline-mutations.ts`。App 从生成副本 import/re-export，不能复制第二份定义。身份仅 opaque capability；生产由 0033 发放，测试可构造假的 capability：

```ts
export type ScopeCapability = object;
export interface ScopePort {
  assertLocalRead(scope: ScopeCapability, domainId: string): void;
  requireOnline(scope: ScopeCapability, domainId: string): Promise<void>;
  storageKey(scope: ScopeCapability, domainId: string): string;
  isActive(scope: ScopeCapability): boolean;
}
export interface ProjectionPort {
  parse(domainId: string, schemaVersion: number, payload: unknown): unknown;
  compareRevision(domainId: string, left: string, right: string): number;
}
export interface OfflinePolicy {
  domainId: string; schemaVersion: number; registryVersion: number;
  readPersistence: "durable_normalized" | "encrypted_ttl_snapshot" | "device_only" | "online_only_secret";
  mutationPolicy: "offline_queue" | "local_only" | "online_only";
  binaryPolicy: "metadata_only" | "on_demand_encrypted" | "user_pinned_encrypted" | "never_local";
}
export type MutationKind = "note" | "task" | "relationship_followup" | "personal_schedule";
export type MutationOperation = "create" | "update" | "delete" | "complete" | "reopen" | "cancel";
export interface Mutation {
  mutationId: string; kind: MutationKind; entityId: string;
  operation: MutationOperation; baseRevision: string | null;
  patch: Record<string, unknown>; createdAt: string;
}
export interface CanonicalResult {
  kind: MutationKind; id: string; revision: string; record: unknown | null;
}
export type MutationResult =
  | { status: "acknowledged"; mutationId: string; canonical: CanonicalResult }
  | { status: "conflict"; mutationId: string; server: CanonicalResult }
  | { status: "retryable" | "permanent"; mutationId: string; code: string }
  | { status: "not-authorized"; mutationId: string; level: "account" | "domain"; domainId: string };
```

`storageKey` 必须由 A 已验证 scope 生成并覆盖 Base URL/actor/workspace/domain/epoch；不得接受 UI 构造 key。客户端 wire 中不含 actor/workspace 权威字段，HTTP 从认证上下文与服务器允许的域/epoch 获取绑定；stale epoch 明确拒绝而非自动改绑。`CanonicalResult.record` 经对应 strict projection parser 转成真实域 DTO，unknown 是解析边界，不是任意字段落盘许可。

### Task 1: Three policies, strict mutation adapters and eligibility

**Files:** Create Web `repos/orbits/shared/contract/offline-policy.ts`, `repos/orbits/shared/contract/offline-mutations.ts`, `repos/orbits/tests/architecture/offline-policy.test.ts`; generated App `src/api/contract/offline-policy.ts`, `offline-mutations.ts`; create App `src/data/offline/ports.ts`, `policy-registry.ts`, `src/data/sync/mutation-adapters.ts`, `tests/offline-mutation-eligibility.test.ts`. All App paths in this plan are relative to `repos/orbit-app/` when abbreviated.

**Interfaces:** consumes 0033 registered-domain/strict projection evidence through G-A2; produces `OfflineDataPolicyRegistry.resolve(method: string, pathname: string, action: string): OfflinePolicy`, throws `policy-not-registered`; `isOfflineEligible(kind: string, operation: string, facts: { actorPrivate: boolean; confirmed: boolean; connectionActive: boolean }): boolean`; `parseMutation(input: unknown): Mutation`. Policies are checked for every path family/action in the 0033 route-to-domain inventory; unknown remains denied until exact registration.

- [ ] **1. Write RED** in App eligibility file:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { isOfflineEligible } from "../src/data/sync/mutation-adapters";
test("offline readable messages cannot enter the mutation queue", () => {
  const facts = { actorPrivate: true, confirmed: true, connectionActive: true };
  assert.equal(isOfflineEligible("message", "create", facts), false);
  assert.equal(isOfflineEligible("note", "create", facts), true);
  assert.equal(isOfflineEligible("relationship_followup", "create", facts), false);
  assert.equal(isOfflineEligible("task", "update", { ...facts, actorPrivate: false }), false);
});
```

- [ ] **2. RED command**, App cwd: `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-mutation-eligibility.test.ts`; expected FAIL missing module/export, then assertion failure when only a typed shell exists. Add table cases for unknown kind/op, task suggestion, revoked connection, local-only draft, online-only action and all four positive domains.
- [ ] **3. Minimal GREEN**: register exact per-domain operations, strict patch schemas from existing note/task/personal schedule API schemas; no `z.record` pass-through. Implement eligibility core:

```ts
const operations: Record<string, readonly string[]> = {
  note: ["create", "update", "delete"],
  task: ["create", "update", "complete", "reopen", "cancel", "delete"],
  relationship_followup: ["update", "complete", "reopen", "cancel", "delete"],
  personal_schedule: ["create", "update", "delete"],
};
export function isOfflineEligible(kind: string, operation: string,
  facts: { actorPrivate: boolean; confirmed: boolean; connectionActive: boolean }): boolean {
  return facts.actorPrivate && facts.confirmed &&
    (kind !== "relationship_followup" || facts.connectionActive) &&
    (operations[kind]?.includes(operation) ?? false);
}
```

Register GET reader policy independently of action policy, exclude credentials/binary fields using strict schemas. Route resolution rejects absolute external URLs, mismatched method, unknown query keys and prefix lookalikes. Web architecture test uses approved route inventory to assert each entry resolves and an unknown entry throws; snapshot policy never implies offline_queue. No profile/preferences write adapter.
- [ ] **4. GREEN**: repeat App command; Web cwd `node --test --import tsx tests/architecture/offline-policy.test.ts`; App `npm run sync:contract`, then `node --test --import tsx tests/contract-sync.test.ts`. Expected all PASS, zero copied-source differences. Pre-freeze policy tests use declared B contract; real 0033 inventory registration waits G-A2.
- [ ] **5. Commit** after staged diff/impact review and detect_changes, explicit paths above: `git commit -m "feat(offline): enforce independent read write and binary policies"`.

### Task 2: Policy snapshot envelope and compatibility wiring

**Files:** Create App `src/data/offline/policy-snapshot.ts`, `offline-storage-migration.ts`, `0033-bindings.ts`, `tests/policy-snapshot.test.ts`; modify `src/data/snapshot-store.ts`, `tests/sync-lifecycle.test.ts` only at read/writeSnapshot consumers. A owns migration runner integration. No auth/scope/cursor redesign.

**Interfaces:** consumes Task 1 OfflinePolicy/ProjectionPort/ScopePort and G-A1/G-A2; produces `validateSnapshot(input: SnapshotInput, policy: OfflinePolicy, parse: (value: unknown) => unknown, sha256: (value: string) => Promise<string>): Promise<SnapshotEnvelope>` and `readPolicySnapshot(scope: ScopeCapability, path: string, now: number): Promise<{state: "fresh"; payload: unknown} | {state: "stale" | "failure" | "not-downloaded"}>`. `SnapshotInput = { payload: unknown; now: number; leaseExpiresAt: number; epoch: string }`. `SnapshotEnvelope = SnapshotInput & {schemaVersion: number; registryVersion: number; expiresAt: number; payloadBytes: number; hash: string}`. Epoch is derived by G-A binding, not accepted from UI. Store only validated envelope under A storage key + normalized path.

- [ ] **1. Write RED**:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { validateSnapshot } from "../src/data/offline/policy-snapshot";
test("snapshot cannot exceed byte cap or lease", async () => {
  const policy = { domainId: "note", schemaVersion: 1, registryVersion: 1,
    readPersistence: "encrypted_ttl_snapshot", mutationPolicy: "online_only",
    binaryPolicy: "metadata_only" } as const;
  const sha256 = async (s: string) => createHash("sha256").update(s).digest("hex");
  const input = { payload: { text: "ok" }, now: 1000, leaseExpiresAt: 2000, epoch: "e1" };
  assert.equal((await validateSnapshot(input, policy, x => x, sha256)).expiresAt, 2000);
  await assert.rejects(validateSnapshot({ ...input, payload: "x".repeat(262145) },
    policy, x => x, sha256), /snapshot-too-large/);
});
```

- [ ] **2. RED**, App cwd: `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/policy-snapshot.test.ts`; expected FAIL missing policy validator, then missing cap/lease assertions. Add tests for unknown path/schema/epoch, strict unknown fields, nested credentials, base64/data URL/raw bytes, corrupted hash, expiry, unsuccessful API result and old metadata-free rows.
- [ ] **3. Minimal GREEN** validator order:

```ts
if (policy.readPersistence !== "encrypted_ttl_snapshot") throw Error("snapshot-policy-denied");
const payload = parse(input.payload);
const serialized = JSON.stringify(payload);
const payloadBytes = new TextEncoder().encode(serialized).length;
if (payloadBytes > 256 * 1024) throw Error("snapshot-too-large");
const expiresAt = Math.min(input.now + 300_000, input.leaseExpiresAt);
if (expiresAt <= input.now) throw Error("snapshot-lease-expired");
return { ...input, payload, schemaVersion: policy.schemaVersion,
  registryVersion: policy.registryVersion, expiresAt, payloadBytes,
  hash: await sha256(serialized) };
```

Before `parse`, reject binary values/data URLs through strict registered schemas. Persist envelope transactionally; verify identity/version/epoch/size/hash before read; expired payload not returned. Preserve readSnapshot/writeSnapshot public compatibility only through this validator; unknown endpoint visibly fails with sanitized code. Migration makes a separate `offline_policy_snapshots` table; old entries never become canonical. G-A2 integration registers this migration using A's version allocator; test interrupted migration rollback and repeated execution. Do not add an independent schema counter.
- [ ] **4. GREEN**, repeat RED plus `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/sync-lifecycle.test.ts`. Expected PASS including legacy callers denied or explicitly registered. Real encryption migration checks belong Task 9; Node SQLite evidence alone is insufficient.
- [ ] **5. Commit** explicit Task 2 paths after detect_changes: `git commit -m "feat(offline): bound and validate compatibility snapshots"`.

### Task 3: Encrypted binary cache with truthful missing state

**Files:** Create App `src/data/offline/binary-cache.ts`, `binary-cache.native.ts`, `binary-cache.web.ts`, `tests/binary-cache.test.ts`, `tests/native/offline-binary-cache.mjs`; modify `offline-storage-migration.ts`, `0033-bindings.ts`. Resource manifest remains owned by A.

**Interfaces:** consumes G-A1/A2/A3, Task 1 policy. Produces `verifyAsset(bytes: Uint8Array, expected: {size: number; hash: string}, digest: (bytes: Uint8Array) => Promise<string>): Promise<void>`; `BinaryCache` methods `open(scope: ScopeCapability, resourceId: string): Promise<{state: "ready"; bytes: Uint8Array} | {state: "not-downloaded" | "locked" | "failure"}>`, `download(scope: ScopeCapability, resourceId: string, pin: boolean): Promise<void>`, `purgeDomain(scope: ScopeCapability, domainId: string): Promise<void>`. Manifest lookup and authorized fetch occur in G-A3 binding; no arbitrary URL input accepted.

- [ ] **1. Write RED**:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { verifyAsset } from "../src/data/offline/binary-cache";
test("mismatched bytes never become offline-ready", async () => {
  await assert.rejects(verifyAsset(new Uint8Array([1]), { size: 2, hash: "h" },
    async () => "h"), /asset-size-mismatch/);
  await assert.rejects(verifyAsset(new Uint8Array([1]), { size: 1, hash: "h" },
    async () => "bad"), /asset-hash-mismatch/);
});
```

- [ ] **2. RED**, App cwd: `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/binary-cache.test.ts`; expected FAIL missing verifier, then incorrect acceptance. Add native-cache contract cases: no bytes under metadata_only/never_local, pin persisted after restart, unpinned LRU, pinned quota overflow, cross epoch/account, domain purge, failed key deletion still locked, partial download, denied fetch, missing bytes leaves text available.
- [ ] **3. Minimal GREEN**:

```ts
export async function verifyAsset(bytes: Uint8Array, expected: {size: number; hash: string},
  digest: (bytes: Uint8Array) => Promise<string>): Promise<void> {
  if (bytes.byteLength !== expected.size) throw Error("asset-size-mismatch");
  if (bytes.byteLength > 20 * 1024 * 1024) throw Error("asset-too-large");
  if (await digest(bytes) !== expected.hash) throw Error("asset-hash-mismatch");
}
```

Create separate SQLCipher resource DB using SecureStore key reference and A validated scope. Table key is scoped resource ID, storing ciphertext-protected BLOB, hash, size, pin and access timestamp; total quota 200 MiB. Download into bounded memory, verify hash/length before transaction insert; abort before reading over 20 MiB. Open returns bytes to native in-memory renderer; never writes plaintext temp file, file:// cache, AsyncStorage or logs. Policy/lease checked before lookup and before publishing download. Destroy key access before attempting physical deletion on revoke. `.web.ts` returns unsupported/never persists. Metadata/structured text remains in A mirror; cache failure cannot clear it.
- [ ] **4. GREEN** repeat unit command. After G-A3/native build, App cwd `node tests/native/offline-binary-cache.mjs`: harness drives Simulator app through encrypted insert/relaunch/read/purge and extracts only assertion counts; expected all assertions PASS including database header not plaintext and no created plaintext asset. Script must fail (not skip/pass) without the selected Simulator/build. Task 9 records real device evidence and cache quotas.
- [ ] **5. Commit** explicit paths and detect_changes: `git commit -m "feat(offline): add scoped encrypted binary cache"`.

### Task 4: Durable outbox, overlay and atomic alias application

**Files:** Create App `src/data/sync/outbox-repository.ts`, `pending-overlay.ts`, `tests/outbox-repository.test.ts`, `tests/pending-overlay.test.ts`, `tests/helpers/offline-database.ts`; modify B `offline-storage-migration.ts`, `0033-bindings.ts`. Reuse `LocalSyncDatabase` type and extract NodeTestDatabase from existing `tests/local-sync-repository.test.ts` into the helper only when that test is included in the commit. A owns existing canonical tables.

**Interfaces:** consumes Mutation/MutationResult, ScopePort, ProjectionPort and G-A2 canonical apply transaction. Produces `overlay<T>(canonical: T, patches: readonly Partial<T>[]): T`; `createOutboxRepository(db: LocalSyncDatabase, scopes: ScopePort, projections: ProjectionPort, apply: (scope: ScopeCapability, value: CanonicalResult) => Promise<void>): OutboxRepository`. Repository methods: `enqueue(scope, mutation): Promise<void>`, `list(scope): Promise<Mutation[]>`, `acknowledge(scope, result: Extract<MutationResult,{status:"acknowledged"}>): Promise<void>`, `resolveId(scope, kind: MutationKind, id: string): Promise<string>`, `resetDomain(scope, kind: MutationKind): Promise<void>`. `scope` is ScopeCapability, `mutation` is Mutation throughout. Reset only B state's eligibility, does not delete pending/conflict. Tests use real SQLite transactions; native encryption separately required.

- [ ] **1. Write RED** for immutable projection:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { overlay } from "../src/data/sync/pending-overlay";
test("pending display preserves cloud canonical", () => {
  const cloud = Object.freeze({ title: "cloud", completed: false });
  assert.deepEqual(overlay(cloud, [{ title: "local" }]), { title: "local", completed: false });
  assert.equal(cloud.title, "cloud");
});
```

- [ ] **2. RED**, App cwd: `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/pending-overlay.test.ts tests/outbox-repository.test.ts`; expected FAIL missing implementations. In repository file create/reopen a file-backed SQLite helper DB, enqueue a stable ID twice and assert one row, then create/update/delete local entity and assert FIFO by monotonic local sequence. Inject a throw after canonical apply but before alias insert; after reopen assert outbox remains and canonical/alias both rolled back. Cases include reset preservation, cross-domain ID collision, stale epoch, newer delta racing older ack, duplicate receipt, foreign mutationId, and dependency payload frozen after first send.
- [ ] **3. Minimal GREEN**:

```ts
export function overlay<T>(canonical: T, patches: readonly Partial<T>[]): T {
  return Object.assign({}, canonical, ...patches);
}
// Inside acknowledge: validate result and scope before opening the transaction.
await db.transaction(async () => {
  // The injected apply function uses this same db connection and compares
  // revisions through ProjectionPort; it must not start another transaction.
  await apply(scope, result.canonical);
  await db.run("INSERT INTO offline_aliases(scope_key, kind, local_id, canonical_id) VALUES (?, ?, ?, ?) ON CONFLICT(scope_key, kind, local_id) DO UPDATE SET canonical_id = excluded.canonical_id",
    [scopeKey, result.canonical.kind, localId, result.canonical.id]);
  await db.run("DELETE FROM offline_outbox WHERE scope_key = ? AND mutation_id = ?",
    [scopeKey, result.mutationId]);
});
```

`scopeKey` comes from ScopePort for result kind; `localId` comes from matching stored mutation, never from untrusted receipt alone. Migration adds `offline_outbox` (scope_key, mutation_id composite PK, local sequence, domain, entity, op, original patch/base, frozen request fingerprint, state/retry metadata), `offline_aliases` (scope_key/kind/local_id PK), `offline_conflicts` (scope_key/mutation_id PK, full local+server evidence). Validate state CHECK/keys with copy/verify/swap when changing existing B tables. In the same ack transaction rebase only unsent dependent operations to the returned revision/ID, and preserve newer canonical via A comparator. Overlay delete yields a pending tombstone view without deleting canonical. Existing v1 outbox rows are quarantined until verified scope/domain/patch migration; no default eligibility for contact/inbox.
- [ ] **4. GREEN** repeat RED command plus `node --test --import tsx tests/local-sync-repository.test.ts` if helper extracted. Expected PASS including rollback after each statement and no lost pending on reset. G-A2 adapter conformance and native migration must also pass before claiming durable integration.
- [ ] **5. Commit** explicit paths after detect_changes: `git commit -m "feat(sync): persist scoped outbox overlays and receipt aliases"`.

### Task 5: Global receipt transaction and four domain server adapters

**Files:** Create Web `features/sync/mutation-adapters.ts`, `mutation-receipt-store.ts`, `mutation-service.ts`, `app/api/sync/mutations/handler.ts`, `route.ts`, `tests/services/sync-mutation-service.test.ts`, `tests/services/sync-mutation-postgres.test.ts`, `tests/api/sync-mutations-route.test.ts`. Modify narrowly `features/notes/service.ts`, `repository.ts`; `features/tasks/service.ts`, `repository.ts`; `features/personal-schedule/service.ts`, `authority-service.ts`; add migration `shared/storage/offline-mutation-receipts.ts`. Paths relative to `repos/orbits/`. No broad orbit_records query expansion.

**Interfaces:** consumes Task 1 strict wire and G-A4 auth/transaction/journal adapters. Produces `fingerprintMutation(mutation: Mutation): string`, `executeMutation(context: ServerMutationContext, mutation: Mutation): Promise<MutationResult>`, `handleMutationBatch(request: Request): Promise<Response>`. `ServerMutationContext` is B `{ transaction: <T>(fn: (tx: MutationTransaction) => Promise<T>) => Promise<T>; authorize: (kind: MutationKind) => Promise<void> }`; transaction is a single server-authenticated scope. `MutationTransaction` exposes `lockReceipt(id: string): Promise<void>`, `readReceipt(id: string): Promise<{fingerprint: string; result: MutationResult} | null>`, `applyDomain(mutation: Mutation): Promise<CanonicalResult>`, `appendJournal(canonical: CanonicalResult): Promise<void>`, `saveReceipt(id: string, fingerprint: string, result: MutationResult): Promise<void>`. applyDomain acquires domain lock/CAS, then A sync-write lock before write; appendJournal shares tx and does not reacquire in reversed order. These are B's adapter methods, not new upstream APIs.

- [ ] **1. Write RED**:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { fingerprintMutation } from "../../features/sync/mutation-service";
test("same command fingerprint ignores JSON key insertion order", () => {
  const base = { mutationId: "m1", kind: "note", entityId: "n1", operation: "update",
    baseRevision: "r1", createdAt: "2026-09-16T00:00:00Z" } as const;
  assert.equal(fingerprintMutation({ ...base, patch: { title: "a", body: "b" } }),
    fingerprintMutation({ ...base, patch: { body: "b", title: "a" } }));
  assert.notEqual(fingerprintMutation({ ...base, patch: { title: "a" } }),
    fingerprintMutation({ ...base, patch: { title: "different" } }));
});
```


Add this receipt replay test in the same service test file; the injected transaction exercises the production service, and PostgreSQL rollback is separately required in Step 4:

```ts
import { executeMutation } from "../../features/sync/mutation-service";
import type { MutationResult } from "../../shared/contract/offline-mutations";
test("lost response replay does not invoke the domain twice", async () => {
  let receipt: { fingerprint: string; result: MutationResult } | null = null;
  let writes = 0;
  const tx = {
    async lockReceipt(_id: string) {},
    async readReceipt(_id: string) { return receipt; },
    async applyDomain() { writes++; return { kind: "note" as const, id: "n1", revision: "r1", record: { title: "x" } }; },
    async appendJournal() {},
    async saveReceipt(_id: string, fingerprint: string, result: MutationResult) { receipt = { fingerprint, result }; },
  };
  const context = { async authorize() {},
    async transaction<T>(fn: (value: typeof tx) => Promise<T>): Promise<T> { return fn(tx); } };
  const mutation = { mutationId: "m1", kind: "note", entityId: "local:n1",
    operation: "create", baseRevision: null, patch: { title: "x" },
    createdAt: "2026-09-16T00:00:00Z" } as const;
  const first = await executeMutation(context, mutation);
  assert.deepEqual(await executeMutation(context, mutation), first);
  assert.equal(writes, 1);
});
```

- [ ] **2. RED**, Web cwd: `node --test --import tsx tests/services/sync-mutation-service.test.ts tests/api/sync-mutations-route.test.ts`; expected FAIL missing service/handler. Add strict max-50, duplicate mutation IDs, actor/workspace spoof, expired online identity, per-domain unauthorized receipt non-disclosure, stale epoch, all four adapters, partial item results, same-ID different-payload, CAS conflict evidence and retry classification. No real write for a rejected batch item.
- [ ] **3. Minimal GREEN**: recursively sort JSON object keys then SHA-256 over strict parsed mutation. Implement receipt core:

```ts
await context.authorize(mutation.kind);
return context.transaction(async tx => {
  await tx.lockReceipt(mutation.mutationId);
  const fingerprint = fingerprintMutation(mutation);
  const previous = await tx.readReceipt(mutation.mutationId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) return {
      status: "permanent", mutationId: mutation.mutationId, code: "mutation-id-reused",
    };
    return previous.result;
  }
  const canonical = await tx.applyDomain(mutation);
  await tx.appendJournal(canonical);
  const result = { status: "acknowledged", mutationId: mutation.mutationId, canonical } as const;
  await tx.saveReceipt(mutation.mutationId, fingerprint, result);
  return result;
});
```

Add conflict save path in the same receipt transaction with strict allowlisted current record. Authorization failures never echo inaccessible body. Migration creates global receipt table with authenticated scope/mutation unique key and fingerprint/result; no TTL deletion that could make old replay execute twice. Domain adapters call current validators through the same injected transaction client; remove nested commit boundary only for this transactional entry. Keep old endpoint behavior/compat receipts, but offline entry must not use in-process note lock as durability. Relationship adapter reuses task canonical ID and validates active connection; personal schedule writes canonical authority collection only. Result revision originates in A journal transaction. Commit failure yields retryable and no ack.
- [ ] **4. PostgreSQL RED→GREEN**: in `sync-mutation-postgres.test.ts`, use existing isolated Postgres test pattern (from `task-mutations-postgres.test.ts`), apply migration to disposable schema, run 2 concurrent identical requests → one domain change/one journal/one receipt; inject failures after domain write, after journal and before commit → all rollback. Retry after simulated lost HTTP response returns identical receipt; conflicting fingerprint executes no second write. Assert actual lock order under concurrent domain and batch writers, update/delete CAS races, revoked connection and role epoch. Web cwd `node --test --import tsx tests/services/sync-mutation-postgres.test.ts`; missing database must FAIL acceptance, not be counted as passed via skip. Then run service/route files and existing `tests/services/notes-service.test.ts tests/services/tasks-service.test.ts tests/services/task-mutations-postgres.test.ts tests/services/schedule-authority.test.ts tests/api/personal-schedule-routes.test.ts`, followed by `npm run typecheck`. Expected PASS; only targeted H checks here, whole Web suite at Task 9.
- [ ] **5. Commit** explicit paths and detect_changes: `git commit -m "feat(sync): atomically commit mutations journals and global receipts"`. If G-A4 is missing, retain prepared RED/adapter work without production wiring or claims of exactly-once integration.

### Task 6: Bounded uploader and recovery handoff

**Files:** Create App `src/data/sync/outbox-uploader.ts`, `tests/outbox-uploader.test.ts`; modify B `outbox-repository.ts`, `0033-bindings.ts`. Do not modify 0035 scheduler or A cursor protocol.

**Interfaces:** consumes Task 4 repository, Task 5 results, ScopePort. Produces `retryDelay(attempt: number, random: number, retryAfterMs?: number): number`; `createOutboxUploader(ports: UploadPorts): { run(scope: ScopeCapability): Promise<UploadSummary>; cancel(): void }`. `UploadSummary = { queued: number; acknowledged: number; conflicted: number; failed: number; blockedDomains: string[]; authRequired: boolean }`. `UploadPorts = { scopes: ScopePort; repository: OutboxRepository; send: (scope: ScopeCapability, mutations: Mutation[], signal: AbortSignal) => Promise<MutationResult[]>; now: () => number; random: () => number; wait: (ms: number, signal: AbortSignal) => Promise<void> }`. Task 4 repository additionally produces `ready(scope): Promise<Mutation[]>` (FIFO heads only), `recordResult(scope, result: MutationResult, nextRetryAt: number | null): Promise<void>` and `markSent(scope, mutationId: string): Promise<void>` to freeze fingerprint before transport.

- [ ] **1. Write RED**:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { retryDelay } from "../src/data/sync/outbox-uploader";
test("retry jitter and Retry-After have explicit caps", () => {
  assert.equal(retryDelay(0, 0.5), 500);
  assert.equal(retryDelay(20, 1), 60_000);
  assert.equal(retryDelay(0, 0.5, 999_999), 300_000);
});
```

- [ ] **2. RED**, App cwd: `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/outbox-uploader.test.ts`; expected FAIL missing uploader. Add fake clock transport assertions that max in-flight is 4, one entity never has two in-flight, auth refresh precedes send, local-read never calls send, reset does not imply upload permission, domain 403 leaves other domains runnable, account 401/403 stops all, 409 stops entity only, and scope switch discards old UI publication. Simulate lost response across restart with frozen mutation ID/payload; 5 attempts or 30 seconds end current round without deleting row. Retry-After beyond round budget persists nextRetryAt and returns without sleeping through budget.
- [ ] **3. Minimal GREEN**:

```ts
export function retryDelay(attempt: number, random: number, retryAfterMs = 0): number {
  const jitter = Math.min(60_000, 1000 * 2 ** Math.min(attempt, 16)) * Math.max(0, Math.min(1, random));
  return Math.max(jitter, Math.min(300_000, Math.max(0, retryAfterMs)));
}
```

`run` fetches eligible FIFO heads, calls requireOnline immediately before each dispatch, freezes payload, then uses a 4-worker pool. Recheck active scope after await and before repository application. Retry network/5xx/429; 400/422/fingerprint mismatch permanent; 409 conflict; typed auth rejection at account/domain level. Never infer domain revocation from an untyped global 403. `cancel` aborts transport; never marks cancellation acknowledged. Return summary for 0035 scheduling and 0036 per-domain pending display; only explicit user retry/current run is local trigger. No new polling timers, background SDK or invented read cursors.
- [ ] **4. GREEN** repeat uploader command plus `tests/outbox-repository.test.ts` in same Node invocation, then App `npm run typecheck`. Expected PASS including delayed response after epoch change and partial batch result association by mutationId, never array position. Typecheck once for this H operation chain.
- [ ] **5. Commit** explicit paths and detect_changes: `git commit -m "feat(sync): upload eligible outbox with bounded retries"`.

### Task 7: Explicit domain conflict resolution

**Files:** Create App `src/data/sync/conflict-resolution.ts`, `tests/conflict-resolution.test.ts`; modify B `outbox-repository.ts`, `mutation-adapters.ts`.

**Interfaces:** consumes Task 1 eligibility, Task 4 persistent conflicts, Task 5 canonical conflict result. Produces `nextConflictMutation(original: Mutation, server: CanonicalResult, choice: "keep-local" | "copy", newId: string): Mutation`; `resolveConflict(scope: ScopeCapability, mutationId: string, choice: "use-cloud" | "keep-local" | "copy", confirmed: boolean): Promise<void>`. Repository additions: `getConflict(scope, mutationId: string): Promise<{original: Mutation; server: CanonicalResult} | null>`, `discardEntityPending(scope, kind: MutationKind, entityId: string): Promise<void>`. Resolution rechecks active scope/eligibility and commits clearing/replacement atomically. Copy capability comes from domain adapter; followup copy requires current online connection/create permission, not a generic new followup command.

- [ ] **1. Write RED**:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { nextConflictMutation } from "../src/data/sync/conflict-resolution";
test("keep local uses a new mutation and latest server base", () => {
  const original = { mutationId: "old", kind: "note", entityId: "n1", operation: "update",
    baseRevision: "r1", patch: { title: "local" }, createdAt: "2026-09-16T00:00:00Z" } as const;
  const next = nextConflictMutation(original,
    { kind: "note", id: "n1", revision: "r2", record: { title: "cloud" } }, "keep-local", "new");
  assert.equal(next.baseRevision, "r2");
  assert.equal(next.mutationId, "new");
  assert.equal(original.baseRevision, "r1");
});
```

- [ ] **2. RED**, App cwd: `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/conflict-resolution.test.ts`; expected FAIL missing resolver. Cases: use-cloud removes downstream entity pending but preserves other entities; absent explicit confirmation writes nothing; new server edit produces another conflict; delete requires preview and second confirmation; copy forbidden after connection revoke; reset preserves conflict evidence; locked/revoked scope cannot render conflict body; failed resolution transaction preserves original input.
- [ ] **3. Minimal GREEN** transform:

```ts
export function nextConflictMutation(original: Mutation, server: CanonicalResult,
  choice: "keep-local" | "copy", newId: string): Mutation {
  if (newId === original.mutationId) throw Error("new-mutation-id-required");
  if (server.kind !== original.kind) throw Error("conflict-domain-mismatch");
  return { ...original, mutationId: newId,
    entityId: choice === "copy" ? `local:${newId}` : server.id,
    operation: choice === "copy" ? "create" : original.operation,
    baseRevision: choice === "copy" ? null : server.revision };
}
```

Before calling transform, domain adapter builds a strict create payload for copy from server base + original patch, removes identity/version/read-only fields, and rejects delete-copy or invalid followup create. Confirmed resolver allocates a fresh ID and confirmation timestamp, persists replaced conflict/pending in one transaction. Use-cloud calls A canonical apply then discards same-entity chain in same transaction. Keep-local retains conflict audit evidence until the new mutation result is known; no automatic last-write-wins or silent replay of downstream operations against new base.
- [ ] **4. GREEN** repeat RED plus `tests/outbox-repository.test.ts tests/offline-mutation-eligibility.test.ts`. Expected PASS for all three choices and domain negative cases.
- [ ] **5. Commit** explicit paths and detect_changes: `git commit -m "feat(sync): preserve and explicitly resolve domain conflicts"`.

### Task 8: Four-domain confirmation UI, online-only rejection and pending notice

**Files:** Create App `src/hooks/useOfflineMutation.ts`, `src/components/SyncStateNotice.tsx`, `src/components/OfflineConflictSheet.tsx`, `tests/offline-mutation-ui.test.tsx`. Modify `src/screens/notes/NewNoteScreen.tsx`, `EditNoteScreen.tsx`, `NoteDetailScreen.tsx`; `src/screens/tasks/TasksScreen.tsx`, `TaskDetailScreen.tsx`; `src/screens/followups/SavedFollowupsList.tsx`; `src/screens/schedule/PersonalScheduleScreen.tsx`; `src/i18n/messages.ts`, `zh.ts`, `ja.ts`, `en.ts`; direct tests `tests/notes-interactions.test.tsx`, `task-detail-interactions.test.ts`, `personal-schedule-interactions.test.tsx`, `tasks-unification-interactions.test.ts`. Snapshot and binary entrypoint errors are displayed through the shared notice after G-A5; A owns global reader migration.

**Interfaces:** consumes Tasks 1/4/6/7, G-A5 selectors and existing confirmation handlers. Produces `useOfflineMutation(kind: MutationKind): { confirm: (command: Omit<Mutation,"mutationId" | "createdAt">) => Promise<void>; retry: () => Promise<void>; state: "idle" | "pending" | "failed" | "conflicted" }`; `SyncStateNotice({ state, pendingCount }: { state: "pending" | "failed" | "conflicted"; pendingCount: number }): React.ReactElement`; `OfflineConflictSheet({scope, mutationId}: {scope: ScopeCapability; mutationId: string}): React.ReactElement`. Hook injects active capability internally and never accepts actor/workspace from UI.

- [ ] **1. Write RED**, using verified `tests/helpers/render.tsx` export `renderToHtml(element: ReactElement): string`; locale context defaults to Chinese without a provider:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToHtml } from "./helpers/render";
import { SyncStateNotice } from "../src/components/SyncStateNotice";
test("pending notice never says AI has received a local save", () => {
  const html = renderToHtml(<SyncStateNotice state="pending" pendingCount={2} />);
  assert.match(html, /仅本机/);
  assert.match(html, /AI/);
  assert.doesNotMatch(html, /已同步至云端/);
});
```

- [ ] **2. RED**, App cwd: `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-mutation-ui.test.tsx`; expected FAIL missing component, then missing truthful rendered copy. Extend existing interaction test harnesses: click save only once enqueues once, typing/cancel produces no outbox, confirm delete uses existing dialog, pending survives navigation/restart, local ID route resolves after ack, conflict three controls, retry preserves input, denied actions remain disabled and direct hook invocation also rejects. Read-only message/event screen remains readable; it does not gain queue permission.
- [ ] **3. Minimal GREEN** notice through existing locale API and matched styles:

```tsx
const { t } = useOrbitLocale();
return <View accessibilityLiveRegion="polite">
  <Text>{t("offline.pendingLocal")}</Text>
  <Text>{t("offline.pendingAi", { count: pendingCount })}</Text>
</View>;
```

Add typed EN/JA/ZH keys, with Chinese meaning “仅本机，等待同步” and “{count} 项更改尚未同步，AI 暂不可见”; failed/conflicted select corresponding failure/resolve copy. `useOrbitLocale` comes from `src/i18n/OrbitLocaleContext.tsx`; the typed translator and existing message catalog own both new keys. Confirm hook checks policy/lease/private ownership, creates ID+time once and persists before success UI. Online mode also uses the same receipt-safe path for supported actions; never fall back to raw fetch on queue rejection. Conflict sheet renders server/local bodies only while scope readable, and uses Task 7 explicit commands. Unknown/online-only actions show online-required before queue attempt. Per-domain/count summary is exported to 0036 without exposing local text to AI. Binary UI distinguishes missing file from text completeness and offers explicit pin/retry; shared primitive integration waits A-owned renderer handoff.
- [ ] **4. GREEN** repeat RED plus direct modified test files; App `npm run typecheck`. Expected PASS in three locales for notice and choices; preserve dates/timezone/association semantics in direct tests. Do not source-text-test visible UI. G-A5 actual selector integration and native restart remain Task 9 requirements.
- [ ] **5. Commit** explicit paths and detect_changes: `git commit -m "feat(app): expose offline confirmation status and conflict controls"`.

### Task 9: Encrypted/native and same-account acceptance, then handoff

**Files:** Create App `tests/native/offline-mutations.mjs`; update `tests/native/offline-binary-cache.mjs` only if new failures require repair. After actual implementation execution create Sprint `REPORT.md`; management line updates Sprint README and Bridge status/handoffs from supplied content. This task does not authorize this planning run to touch reports or management files.

**Interfaces:** consumes all prior tasks, exact 0033 integrated SHA, 0035 recovery order and 0036 server AI tools. Produces SC evidence with feature SHA, test exit codes/counts, sanitized record IDs/revisions, server build/address/database/account fingerprint, Simulator UDID/build/Metro URL, and remaining limits. No test-only product API or public evidence route.

- [ ] **1. Native RED**: add `tests/native/offline-mutations.mjs` using existing native `.mjs` harness conventions to drive authenticated Simulator and assert offline note save survives app termination. With offline action disabled on pre-feature build, command App cwd `node tests/native/offline-mutations.mjs` must fail at pending/relaunch assertion. The script must abort when required UDID, signed build or authenticated test account is absent; no fake PASS. Implement the smallest missing wiring found in Tasks 4/8 under impact and repeat native GREEN.
- [ ] **2. H/I checks**, each affected end once at local code close: App `npm test` and `npm run typecheck`; Web `npm test`, `npm run typecheck`, `npm run build`. Each must exit 0; preserve original failure and fix only affected cause, no skip-as-pass. Contract changes additionally App `npm run sync:contract` then `node --test --import tsx tests/contract-sync.test.ts tests/api-schema-sync.test.ts`. Full suites need frozen writers; don't launch competing full suites. Native App build uses App `npx expo run:ios --no-bundler --device "$SPRINT0034_SIMULATOR_UDID"` after management assigns a simulator; inspect available targets instead of inventing UDID.
- [ ] **3. Runtime version checkpoint**: management assigns dedicated existing QA account/database/ports; preserve shared live services until ownership is confirmed. Rebuild production Web/API from feature SHA (Step 2), restart that production artifact, verify existing health endpoint, start Metro for the same App SHA and verify bundle source. Logs under `build/harness-state/evidence/sprint-0034/run-01/` only if ignored; otherwise controlled temp path. Record all versions before business checks. No credential/payload dumps.
- [ ] **4. Four-domain offline→online chain**: for notes/tasks/personal schedules create, update and delete disposable records; for relationship followup start from a confirmed valid canonical task then update/status/delete. Save offline, terminate/relaunch, verify pending overlay and unchanged server revision; retry across lost response and reconnect after online permission refresh. Web GET must show one resulting entity/change and matching canonical revision. Replaying original mutation returns same receipt. Run App native script again: expected all recorded steps PASS. No offline followup suggestion confirmation.
- [ ] **5. Failure/permission/cache chain**: create cloud-vs-local conflict and exercise use-cloud/keep-local/copy on eligible domains, reject followup copy after connection revoke, reconfirm delete against displayed cloud content. Switch account/Base URL/workspace/epoch and prove no former scope body/resource visible. Revoke one domain while offline; on reconnect prove cleanup occurs before upload and its outbox stays quarantined, other eligible domain can proceed. Single-domain reset preserves pending and drafts; account revoke locks/wipes per A contract. In real SQLCipher inject migration interruption, reopen/re-run, test old outbox quarantine, alias rollback and snapshot integrity. Run `node tests/native/offline-binary-cache.mjs`: pinned restart, on-demand absence, encrypted file inspection, quota/hash failure and revoke deletion PASS; missing binary never empties text. Invitation/message send/registration/shared meeting/scanning command refusal must produce zero outbox rows.
- [ ] **6. AI truthfulness**: same account queries server AI for a pending disposable note/task/followup/schedule before upload and after ack. Before: pending content absent, App per-domain counts say unavailable. After: canonical revision available through already-authorized 0036 tools. Mock proves only local notice wiring; missing provider/tool/runtime keeps SC-05 incomplete. AI/OCR cumulative cap remains $5 with existing $0.012780 charged; management owns actual ledger and authorization, do not reset budget or call external actions. Continue all independent local checks if this external acceptance is unavailable.
- [ ] **7. Commit and evidence**: from root `git diff --check`; explicit add changed native harness files; `gitnexus_detect_changes({repo:"/Users/xzhao/Projects/orbit", scope:"staged"})`, also detect on actual worktree as described below. Review only expected symbols/flows. `git commit -m "test(sync): verify native offline mutation and cache recovery"`. Write REPORT only with actual test counts and fixed last feature SHA; commit it with `git commit -m "docs(sprint-0034): record offline mutation acceptance"`. Management receives immutable feature/report SHAs and all missing evidence; it alone merges accepted phases and checks precise merge tree before any authorized push. A local commit is not Sprint completed.

## Stage commit procedure and failure boundaries

Each implementation task's commit step means: from root stage only its exact Files list with `git add -- <paths>`; `git diff --cached --check`; GitNexus staged detect_changes; inspect staged file list/symbols against ownership; then the given commit command. Never `git add .` or `-A`. Because RULES fixes the main repo selector, run required `repo:"/Users/xzhao/Projects/orbit"` first; if it describes that checkout rather than this worktree, also invoke detect_changes with this worktree path and retain both results. If actual-worktree detection is unavailable, record that limitation and do not substitute main-checkout changes as evidence. Markdown-only planning has no modified code symbols and needs no symbol impact; implementation does.

Unexpected baseline errors require bounded diagnosis and preserve any explicit baseline approval gate. No skipped native/Postgres/AI assertion counts as passing. Failure of one external check only blocks its SC and dependent release declaration; it does not block pure strategy or other authorized independent verification. No plan step silently raises caps, deletes pending input, reruns a closed Generator, changes SC or merges unaccepted 0033 APIs.

## Self-review: spec-to-task map

| Approved requirement | Tasks and primary evidence |
| --- | --- |
| §4.3 three policies, per-route/action default deny; §5 risk eligibility | 1, 8; route inventory and eligibility negatives |
| §4.3 strict bounded snapshot and binary encryption; §2 missing binary text | 2, 3, 9; hash/lease/schema tests, real SQLCipher and native cache |
| §4.2 scope and reset retention; §4.5 local-read is not online authority | 4, 6, 9; scope/epoch race, reset and native reauthentication order |
| §5 global receipt/lock/CAS/journal atomicity and four adapters | 5; concurrent PostgreSQL/failure injection, four-domain Web readback |
| §8.6 durable pending, exactly-once, explicit conflict/canonical protection | 4–8; reopen, receipt rollback, FIFO/alias, conflict choices |
| §5/§9 boundaries with A/C/D, pending AI truth and release evidence | dependency gates, 6, 8, 9; fixed upstream SHAs, summary ports, AI before/after |

The all-domain read inventory, source adapters/journal semantics, auth envelope, cursor and universal mirror migration remain 0033; 0035 transport remains C; AI capabilities/Data Atlas remain D. B tests these boundaries but does not claim to implement the other Sprints. No uncovered B-owned requirement is deferred to a vague later task.
