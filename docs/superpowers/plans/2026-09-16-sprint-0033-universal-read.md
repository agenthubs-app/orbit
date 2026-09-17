# Sprint 0033 Universal Offline Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 上述技能标准头不覆盖本仓库 RULES：本 Sprint 仅一个 Generator，不增加实现／审查代理，不调用已被用户禁用的 executing-plans。本次委派仅编制并提交规划；管理线审查前不实施。

**Goal:** 账号完成首次同步后，原生 App 能离线冷启动并读取全部已授权结构化历史，撤权、未下载和租期过期均如实表现。

**Architecture:** 服务端用严格授权的 domain registry、领域事务 journal 和每域 manifest/cursor 提供可恢复读取；App 用有期限的 local-read 身份打开按服务器/actor 加密、按 workspace/domain/epoch 隔离的镜像。所有读取入口经已登记 selector 读取镜像，网络只更新镜像；写入、恢复调度和 AI 能力分别交接 0034/0035/0036。

**Tech Stack:** TypeScript、Zod、Next.js、PostgreSQL transaction journal、Expo SQLite/SQLCipher、SecureStore、React Native、Node test runner、真实 iOS Simulator。

**Spec:** `docs/superpowers/specs/2026-09-16-universal-offline-read-design.zh-CN.md`（英文同目录）；本线唯一验收契约：`repos/orbit-app/docs/sprints/0033-incremental-read-sync/PLANNER.md`。

## Global Constraints

以下为批准规范原文约束；未另列版本下限，不引入新 provider SDK：

- `local-read` 只能读取上一次经服务器验证的账号及其授权 epoch 对应的加密镜像。它永远不能通过在线写入检查。
- `offlineReadExpiresAt` 由服务器签发，不得晚于登录会话到期时间，也不得超过上次验证后的七天。部署环境可以下发更短时间。
- 每一页记录与其游标必须在同一个本地事务中落盘。
- 默认行为是拒绝。未知 domain、版本、字段或 authorization epoch 必须显式失败。
- 跨数据域同步不能假装具有全局原子性。
- 二进制文件只进入专用加密资源缓存。不能因为结构化数据在 SQLCipher 中，就假定数据库外部文件也已经加密。
- 本地离线注册表与 AI 可见性清单是两套独立规则。
- 每项实现遵守 TDD；修改共享符号前执行 GitNexus impact，提交前执行 detect_changes。
- 每个通过验收的阶段单独提交。合并前审查，合并到 `chat-agent` 后在精确合并树重新验证，通过后才 push。

本次仅四份规划文档允许写入；不 merge/push，不创建执行 REPORT，不消耗新 Generator run。未来实施的集成由管理线执行。原规范页的“等待书面审查”是旧标签；本轮委派已明确设计获准，复用批准。

## 基线、顺序与文件职责

规划基线 `2f862c9f84167408df09914acca521f528ae4185`，0032 主线 merge `00b81ab18`，本工作树没有 `features/sync/` 或运行中的 0033 代码。README 还记录其他工作树的 0033 推进；管理线先核对其固定 SHA、未结束 run 和文件锁，复用有效实现，不覆盖或重开历史 run。这里描述目标差量，不证明历史分支已合入。

| 内部阶段 | Tasks | 独立交付与后续门槛 |
| --- | --- | --- |
| A 覆盖与基础 | 1 | route-to-domain 清单、默认拒绝规则，所有未知入口显式失败 |
| B 身份与存储 | 2–4 | local-read 租期/写入闸门、原生 v2 schema、安全 snapshot |
| C 协议与 registry | 5–7 | journal、manifest/cursor、预算协调器和完整性状态；0034/35 可据已验接口接线 |
| D 个人与人脉 | 8–9 | 账号/笔记/任务/跟进/人脉/导入历史镜像读取 |
| E 通信、日程与 AI 历史 | 10–12 | 消息/通知、完整日程、全部 AI 会话历史 |
| F 活动、Agent 与聚合 | 13–15 | 角色授权、公共目录边界、Agent 可见记录、聚合集合代际 |
| G 资源、搜索与清理 | 16–18 | 加密资源、本地搜索、全部消费者、原生与跨端验收 |

所有下列路径均相对仓库根。新代码按职责放置：`shared/contract/universal-read.ts` 只含类型；`shared/api-schema/universal-read.ts` 为解码器；`features/sync/` 为协议；各 Task 明确列出的 `repos/orbits/features/sync/adapters/` 模块为领域授权投影；App `src/data/sync/` 为持久化和协调，`src/data/offline-read/` 为 endpoint→selector 兼容映射。禁止通过增加 `orbit_records.kind IN (...)` 代替不同权威库的适配器。

## 实施前共享符号风险与提交规程

以下是规划预判高风险，不冒充已执行 impact 的风险分数：

| 文件与符号 | 必查传递消费者／风险 |
| --- | --- |
| `repos/orbit-app/src/api/AuthSessionProvider.tsx`: `OrbitAuthSessionProvider`, `useOrbitAuthSession` | 所有路由门禁、通知注册、账号切换、写入资格；旧 `signedIn` 不得等于 online |
| `repos/orbit-app/src/api/client.ts`: `createOrbitApiClient`, `request`; `src/hooks/useOrbitApiClient.ts`: `useOrbitApiClient` | 所有 HTTP 调用、raw upload、401 广播；公共 auth 端点不得被错误拦截 |
| `repos/orbit-app/src/data/sync/sync-lifecycle.ts`: `createSyncLifecycle`; `sync-database-key.ts`: `loadSyncDatabaseKey`, `syncScopeDigest` | SQLCipher key、切换账号、延迟清理及已开句柄 |
| `repos/orbit-app/src/data/sync/local-sync-database.ts`: `initializeLocalSyncDatabase`; `local-sync-repository.ts`: `createLocalSyncRepository` | v1 CHECK/主键迁移、0034 pending/outbox、页与游标原子性 |
| `repos/orbit-app/src/data/snapshot-store.ts`: `readSnapshot`, `writeSnapshot`; `src/hooks/useApiResource.ts`: `useApiResource` | 全 App 缓存与页面、未知 endpoint、旧 snapshot 泄漏 |
| `repos/orbits/app/api/_shared/authenticated-actor.ts` 的实际导出（先 context 定位） | 所有认证路由；优先新的 sync auth adapter，无法满足契约才改共享认证 |
| `repos/orbits/shared/storage/postgres-live-record-store.ts` 的事务写入口；`shared/storage/transactional-postgres.ts` | 多域写入、journal 提交顺序；优先领域事务/数据库触发器，拒绝未经证明的全局改造 |
| 各 Task 所列领域 repository/provider 写入方法 | bootstrap、物理删除、grant/revoke 的原子性，不可事后双写 |

每个既有待改函数/类/方法在编辑前运行 `gitnexus_impact({repo:"/Users/xzhao/Projects/orbit",target:"OrbitAuthSessionProvider",direction:"upstream"})`（此处以身份provider为例，其余逐个替换为上表及实际待改方法名）；记直接调用者、受影响 processes、risk。HIGH/CRITICAL 先报告再编辑。未收录必须源码补查，不算零影响。提示 stale 则先按根规则重建索引，保留 AGENTS。本轮只改 Markdown，不修改这些符号。

每 Task 的 commit 前：定向完整文件 GREEN、相关直接消费者、影响端 typecheck（同批共享契约一次），`git diff --check`，`gitnexus_detect_changes(scope="staged")`；核对工具实际仓库与当前 diff。每阶段独立提交，含 H 的全量延后本 Sprint 收口，不逐 helper 跑全量。所有 shell 命令从仓库根执行，`cd` 放子 shell 中。不暂存整目录或其他线文件。

---

### Task 1: 建立完整读取入口和策略清单（阶段 A）

**Files:** Create `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`, `repos/orbit-app/scripts/audit-offline-read-surfaces.ts`, `repos/orbit-app/tests/offline-read-inventory.test.ts`; Create `repos/orbits/shared/contract/universal-read.ts`, `repos/orbits/shared/api-schema/universal-read.ts`; Modify generated `repos/orbit-app/src/api/contract/universal-read.ts`, `repos/orbit-app/src/api/schema/universal-read.ts` only through `npm run sync:contract` (first run creates them).

**Interfaces:** Task 1 also declares all wire types shown in Tasks 2/5/6/16 in the new import-free contract; those later Tasks implement behavior. Thus Task 3 can type its migration fixtures without depending on Task 5 implementation.

```ts
export type ReadPersistence = 'durable_normalized' | 'encrypted_ttl_snapshot' | 'device_only' | 'online_only_secret';
export type MutationPolicy = 'offline_queue' | 'local_only' | 'online_only';
export type BinaryPolicy = 'metadata_only' | 'on_demand_encrypted' | 'user_pinned_encrypted' | 'never_local';
export type ReadCompleteness = 'fresh' | 'stale' | 'partial' | 'not-downloaded' | 'not-authorized' | 'locked' | 'failure';
export interface ReadScope { baseUrl: string; actorId: string; workspaceId: string; domainId: string; authorizationEpoch: string }
export interface ReadSurface {
  consumerFile: string; endpointTemplate: string; method: string;
  domainId: string; selector: string; schemaVersion: number;
  readPersistence: ReadPersistence; mutationPolicy: MutationPolicy; binaryPolicy: BinaryPolicy;
}
// App inventory module; audit script uses TypeScript AST, not a regex-only scanner.
export function auditReadSurfaces(root: string): Promise<{ unregistered: string[]; invalid: string[] }>;
export function resolveReadSurface(method: string, path: string): ReadSurface;
```

- [ ] **RED test:** extract real read calls from `src/api/endpoints.ts`, all `app/**/*.tsx`, `src/screens`, hooks, API wrappers and raw `fetch`/stream clients; resolve imported constants and template parameters to path families. Unresolved computed paths are failures. Add a temporary synthetic consumer inside the test's own temp root; remove in test cleanup.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReadSurface } from '../src/data/offline-read/route-domain-inventory';
test('unknown and secret endpoints never default to persistence', () => {
  assert.throws(() => resolveReadSurface('GET', '/api/new-private-domain'), /UNREGISTERED_READ/);
  assert.equal(resolveReadSurface('GET', '/api/auth/session').readPersistence, 'online_only_secret');
  assert.equal(resolveReadSurface('GET', '/api/notes/n1').domainId, 'notes');
});
```

- [ ] **RED command:** `(cd repos/orbit-app && node --test --import tsx tests/offline-read-inventory.test.ts)`; expected missing module then uncovered actual endpoints, not green on an empty inventory.
- [ ] **GREEN minimum:** populate a row per concrete endpoint family and consumer (including child resources/search), stable domains from Tasks 8–15. Secret/auth routes explicitly online-only; device drafts explicitly device-only; writes initially online-only except existing device-local actions, offline_queue belongs to 0034. Implement strict path match; no catch-all success.

```ts
const matches = surfaces.filter(row => row.method === method && matchTemplate(row.endpointTemplate, path));
if (matches.length !== 1) throw new Error('UNREGISTERED_READ');
return matches[0];
```

`surfaces: readonly ReadSurface[]` is the populated export; `matchTemplate(template:string,path:string):boolean` splits pathname into segments, requires equal segment count, exact literals and nonempty `:id` segments; query parameters are parsed separately by selectors, never used as authorization. Inventory domain IDs are closed by registry validation in Task 6.
- [ ] **GREEN:** same full test; `(cd repos/orbit-app && npm run sync:contract && node --import tsx scripts/audit-offline-read-surfaces.ts)` must exit 0 and output uncovered=0. Versioned policy includes every concrete mutation as a separate method row, not a domain-wide default. Do not claim projections verified yet.
- [ ] **Commit:** exact files above with message `feat(sync): register native read surfaces and deny unknown persistence`.

### Task 2: 签发租期、local-read 冷启动和写入闸门（阶段 B）

**Files:** Create `repos/orbits/features/sync/offline-read-lease.ts`, `repos/orbits/app/api/sync/lease/handler.ts`, `repos/orbits/app/api/sync/lease/route.ts`, `repos/orbits/tests/api/offline-read-lease.test.ts`; Create `repos/orbit-app/src/api/offline-read-session.ts`, `repos/orbit-app/tests/offline-read-session.test.ts`; Modify `repos/orbit-app/src/api/AuthSessionProvider.tsx`, `repos/orbit-app/src/api/auth-session-storage.ts`, `repos/orbit-app/src/api/client.ts`, `repos/orbit-app/src/hooks/useOrbitApiClient.ts`, `repos/orbit-app/app/_layout.tsx`; extend `tests/auth-session-provider-races.test.ts`, `tests/authenticated-client-usage.test.ts` under App. Modify shared universal-read types/schema and regenerate copies.

**Interfaces:** `ReadIdentityState = 'checking'|'online'|'local-read'|'locked'|'revoked'`; `OfflineReadEnvelope = {version:2,baseUrl:string,actorId:string,subject:string,sessionExpiresAt:number,offlineReadExpiresAt:number,lastVerifiedAt:number,grants:ReadonlyArray<{workspaceId:string,domainId:string,authorizationEpoch:string}>,databaseKeyRef:string}`. `evaluateOfflineRead(envelope:OfflineReadEnvelope|null,baseUrl:string,now:number):ReadIdentityState`; `assertOnlineMutation(state:ReadIdentityState):void`; server `issueOfflineReadLease(session:{actorId:string,subject:string,expiresAt:number},now:number,maxAgeMs:number):Promise<OfflineReadEnvelope>` obtains grants from server authorizer, not request workspace. Key ref is opaque scope reference, never actual key material. Native SecureStore authentication envelope is separate from business data mirror; cookies remain only in auth storage, never in projections.

- [ ] **RED:** add expiry, legacy cookie, canonical actor/raw subject mismatch, URL change, lease upper bound, clock rollback, account switch stale response, auth 401/403 vs domain 403 and erase failure tests.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOfflineRead, assertOnlineMutation } from '../src/api/offline-read-session';
test('legacy cookie cannot unlock and local-read cannot write', () => {
  assert.equal(evaluateOfflineRead(null, 'https://orbit.example', 100), 'locked');
  assert.throws(() => assertOnlineMutation('local-read'), /ONLINE_REQUIRED/);
});
```

- [ ] **RED command:** `(cd repos/orbit-app && node --test --import tsx tests/offline-read-session.test.ts)` and `(cd repos/orbits && node --test --import tsx tests/api/offline-read-lease.test.ts)`; missing evaluator/lease route then behavioral failures expected.
- [ ] **GREEN minimum:** server lease expiry `Math.min(session.expiresAt, now + Math.min(maxAgeMs, 7*24*60*60*1000))`; server authenticated actor resolves all grants. Envelope decoder `.strict()` and URL normalization; stale response generation token cannot unlock a switched account. No envelope/unknown version/expired lease/backward clock => locked. Offline sign-out first revokes in-memory lease and persists cleanup intent, then crypto-erases, remote sign-out best effort. Cleanup failure stays locked across restart.

```ts
export function assertOnlineMutation(state: ReadIdentityState): void {
  if (state !== 'online') throw new Error('ONLINE_REQUIRED');
}
```

Enforce at authenticated transport (including raw body), API hooks, background uploads and direct stream/fetch callers found by Task 1. Auth login/lease revalidation public transports are explicitly separate. UI `canReadLocal` controls navigation; `signedIn` is not write authorization. Reconnect must revalidate lease and apply revocations before exposing an upload-ready capability to 0034/35. Online server still checks every write.
- [ ] **GREEN:** full new files plus two existing race/usage tests with App render import; server lease tests verify expiry clamp and role grants. No local-read permission derived from AI visibility.
- [ ] **Commit:** exact Task files; `feat(auth): add bounded offline read lease and online mutation guard`.

### Task 3: 真实 SQLCipher v1→v2 scope 迁移（阶段 B）

**Files:** Modify `repos/orbit-app/src/data/sync/local-sync-schema.ts`, `local-sync-database.ts`, `local-sync-repository.ts`, `sync-lifecycle.ts`, `sync-database-key.ts` in that same directory; Create `repos/orbit-app/src/data/sync/local-read-migrations.ts`, `repos/orbit-app/tests/local-read-migrations.test.ts`, `repos/orbit-app/tests/local-read-scope.test.ts`, `repos/orbit-app/scripts/verify-offline-read-native.ts`.

**Interfaces:** `migrateLocalRead(database:LocalSyncDatabase):Promise<void>`; repository adds `resetDomain(scope:ReadScope):Promise<void>`, `applyDomainPage(scope:ReadScope,page:DomainPage):Promise<void>` (page defined Task 5); record/cursor/asset/index keys include workspace/domain/authorizationEpoch, database keyed by normalized baseUrl+actor. Outbox/drafts/conflict ownership remains 0034; preserve byte-for-byte on domain reset and migration, never promote legacy canonical rows to current epoch without verification.

- [ ] **RED:** use existing Node database test adapter for deterministic tests; native script executes same code through Expo SQLCipher. Seed v1 records/cursors/outbox then inject failure after copy and before rename, reopen, retry twice; assert old or new complete schema, never mixed; seed two domains/workspaces/epochs and prove reset isolation.

```sql
-- RED fixture: this v1 key cannot hold independent domain cursors.
INSERT INTO sync_cursors(workspace_id,cursor,last_successful_sync_at,bootstrap_state)
VALUES ('w','old','2026-09-16T00:00:00Z','complete');
-- Assert after migration: old cursor not trusted; outbox mutation retained;
-- two v2 cursors for ('w','notes','e1') and ('w','tasks','e1') coexist.
```

- [ ] **RED command:** `(cd repos/orbit-app && node --test --import tsx tests/local-read-migrations.test.ts tests/local-read-scope.test.ts)`; expected missing migration and incompatible v1 cursor primary key.
- [ ] **GREEN minimum:** version 2 transaction: create replacement tables, copy safe rows into quarantined legacy scope, validate counts/constraints, swap, rebuild indexes, then write schema/checkpoint. v1 canonical data requires bootstrap for server epoch; never discard pending/conflict/drafts. Do not simply rerun CREATE IF NOT EXISTS.

```sql
CREATE TABLE sync_cursors_v2 (
 workspace_id TEXT NOT NULL, domain_id TEXT NOT NULL,
 authorization_epoch TEXT NOT NULL, cursor TEXT NOT NULL,
 completeness TEXT NOT NULL, generation TEXT NOT NULL,
 PRIMARY KEY(workspace_id,domain_id,authorization_epoch)
);
```

Records additionally key `record_id`; store schemaVersion/revision/hash. Unrecognized domain checked by registry instead of old six-kind CHECK. `resetDomain` deletes only canonical projection/index/asset/cursor rows with all three scope predicates, never outbox tables. Revoke hides even pending overlays while preserving their non-readable conflict evidence for 0034.
- [ ] **GREEN:** same full tests plus `tests/local-sync-repository.test.ts`, `tests/sync-lifecycle.test.ts`. Run native script inside rebuilt SQLCipher App (Task 18 procedure): seed→kill→reopen, wrong key fails, plaintext absent from database/WAL, repeated migration and disk-full rollback, cleanup failure. Node SQLite alone is insufficient.
- [ ] **Commit:** exact Task files; `feat(sync): migrate encrypted mirrors to domain and authorization scopes`.

### Task 4: 约束兼容 snapshot（阶段 B）

**Files:** Modify `repos/orbit-app/src/data/snapshot-store.ts`, `repos/orbit-app/tests/snapshot-store.test.ts`; Create `repos/orbit-app/src/data/offline-read/snapshot-policy.ts`, `repos/orbit-app/tests/snapshot-policy.test.ts`.

**Interfaces:** `validateSnapshot(input:{surface:ReadSurface,scope:ReadScope,schemaVersion:number,expiresAt:number,payload:unknown,byteLength:number,sha256:string},now:number):void`; `snapshotLimitBytes=262144` is an initial engineering cap (not an approved product history limit). Strict endpoint response schema owns allowed fields; hash from actual serialized bytes, never trusted caller claim. SQLCipher row stores schema/expiry/epoch/byte length/hash.

- [ ] **RED:** keep real snapshot roundtrip tests, add unknown endpoint, wrong epoch/hash, >256KiB, raw/base64/data-URL bytes, nested token and expired snapshot rejection.

```ts
assert.throws(() => validateSnapshot({ ...validSnapshot, payload: { providerToken: 'secret' } }, now), /SNAPSHOT_REJECTED/);
```

`validSnapshot` is a test-local declared object matching the interface and a registered encrypted_ttl_snapshot fixture response, `now=Date.parse('2026-09-16T00:00:00Z')`; recompute hash when changing payload so rejection proves field policy rather than only hash failure.
- [ ] **RED command:** `(cd repos/orbit-app && node --test --import tsx tests/snapshot-policy.test.ts tests/snapshot-store.test.ts)`; existing permissive snapshot writes fail new assertions.
- [ ] **GREEN minimum:** resolve endpoint policy first; only `encrypted_ttl_snapshot` admitted, strict schema per endpoint, checked bytes/hash/expiry/epoch; unknown/secret/device-only/durable migrated endpoints reject snapshot writes. Legacy rows without metadata not displayed as trusted current data; retire per endpoint after complete canonical bootstrap.

```ts
if (surface.readPersistence !== 'encrypted_ttl_snapshot') throw new Error('SNAPSHOT_REJECTED');
if (expiresAt <= now || byteLength > 262144) throw new Error('SNAPSHOT_REJECTED');
```

- [ ] **GREEN:** both full tests; corrupt persisted bytes on read must fail visibly rather than fall back to parsed unsafe data.
- [ ] **Commit:** exact files; `fix(storage): enforce endpoint policies on compatibility snapshots`.

### Task 5: 事务 journal 和不会漏提交的游标（阶段 C）

**Files:** Create `repos/orbits/features/sync/journal.ts`, `journal-migrations.ts`, `cursor.ts`, `adapter.ts` in that directory; Create `repos/orbits/tests/services/domain-journal.test.ts`, `domain-cursor.test.ts`; Modify shared universal-read contract/schema and regenerate App copies.

**Interfaces:**

```ts
export interface DomainChange { id:string; revision:string; operation:'upsert'|'delete'|'visibility-delete'; payload:Record<string,unknown>|null }
export interface DomainPage {
 domainId:string; schemaVersion:number; registryVersion:number; authorizationEpoch:string;
 changes:readonly DomainChange[]; nextCursor:string; highWatermark:string;
 hasMore:boolean; generation:string; serverTime:string;
}
export interface ReadGrant { actorId:string; workspaceId:string; domainId:string; authorizationEpoch:string }
export interface CursorClaims extends ReadGrant {
 schemaVersion:number; registryVersion:number; afterRevision:string;
 highWatermark:string; issuedAt:number; generation:string;
}
export function encodeCursor(claims:CursorClaims,secret:string):string;
export function decodeCursor(token:string,grant:ReadGrant,secret:string,now:number):CursorClaims;
// Server adapter.ts imports pg PoolClient; contract remains import-free.
export interface ReadModelAdapter {
 domainId:string; schemaVersion:number;
 authorize(actorId:string,workspaceId:string):Promise<ReadGrant>;
 readPage(grant:ReadGrant,cursor:string|null,limit:number):Promise<DomainPage>;
 project(value:unknown):Record<string,unknown>;
}
export function appendDomainChange(tx:PoolClient,grant:ReadGrant,change:Omit<DomainChange,'revision'>):Promise<string>;
```

- [ ] **RED:** transaction A reserves revision then pauses; B attempts commit; client takes watermark; release A and prove no missing record. Also rollback removes journal entry, update between pages arrives next delta, physical delete retains null-payload tombstone, grant backfills historical rows, revoke emits event without entity update. Cursor tamper, actor/workspace/domain/schema/registry/epoch mismatch, expired retention and missing secret reject.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCursor, decodeCursor } from '../../features/sync/cursor';
test('cursor cannot move between domains', () => {
  const grant = { actorId:'a', workspaceId:'w', domainId:'notes', authorizationEpoch:'e1' };
  const claims = { ...grant, schemaVersion:1, registryVersion:1, afterRevision:'0', highWatermark:'9', issuedAt:100, generation:'g' };
  assert.throws(() => decodeCursor(encodeCursor(claims,'test-secret'), { ...grant, domainId:'tasks' }, 'test-secret',101), /RESET_REQUIRED/);
});
```

- [ ] **RED command:** `(cd repos/orbits && node --test --import tsx tests/services/domain-journal.test.ts tests/services/domain-cursor.test.ts)`; expected missing implementation; PostgreSQL tests must actually run in isolated database, skip is not pass.
- [ ] **GREEN minimum:** PostgreSQL durable journal includes actor/workspace/domain/epoch/revision/op/entity/projection/schema and retained tombstones. Journal rows immutable. Shared sync-write transaction lock acquired before assigning revision and held until commit; watermark query uses the same lock protocol so sequence allocation alone cannot skip a late commit. Source change and journal append share one DB transaction/connection. Bootstrap materializes authorized generation at watermark in bounded keyset pages; no OFFSET over mutable rows. Grant produces historical visibility generation, revoke persists visibility-delete; no dependence on business updated_at.

```sql
SELECT pg_advisory_xact_lock(hashtextextended('orbit-sync-write', 0));
-- Obtain revision only after the lock, append immutable journal inside source transaction.
-- Readers freeze high-watermark after observing that serialized commit boundary.
```

HMAC-SHA256 cursor with server-only secret, constant-time MAC check, strict claims/retention bounds; reset error identifies only authenticated domain. 0034 lock order is receipt→domain transaction/CAS→shared sync-write lock; journal never takes receipt locks or reverses order. Retention expiry resets one domain, drafts/outbox preserved.
- [ ] **GREEN:** both complete test files, real PostgreSQL concurrent barrier test and rollback; bounded limits 1..200 records and 1MiB per page. Oversized entity returns typed failure, never silently omits it.
- [ ] **Commit:** exact files; `feat(sync): add transactional domain journals and scoped cursors`.

### Task 6: 服务端 registry、manifest 和严格 HTTP 边界（阶段 C）

**Files:** Create `repos/orbits/features/sync/domain-registry.ts`, `manifest.ts`, `read-service.ts`; Create `repos/orbits/app/api/sync/manifest/handler.ts`, `route.ts` in that directory, `repos/orbits/app/api/sync/domains/[domainId]/handler.ts`, `route.ts` in that directory; Create `repos/orbits/tests/api/domain-sync-routes.test.ts`, `repos/orbits/tests/services/domain-registry.test.ts`.

**Interfaces:** `DomainRegistration={domainId:string,schemaVersion:number,adapter:ReadModelAdapter,dependencies:readonly string[],maxPageBytes:number,history:'complete'|'server-manifest',leaseMaxMs:number,binaryPolicy:BinaryPolicy,mutationPolicy:MutationPolicy,aiCapability:string|null}`; registry owns per-domain strict projection validators and stable IDs. `DomainManifest={registryVersion:number,domains:readonly {domainId:string,schemaVersion:number,workspaceId:string,authorizationEpoch:string,generation:string,watermark:string,history:'complete'|'server-manifest',membershipCursor:string|null}[]}`; `getDomainManifest(actorId:string):Promise<DomainManifest>`; `readDomainPage(actorId:string,workspaceId:string,domainId:string,cursor:string|null,limit:number):Promise<DomainPage>`.

- [ ] **RED:** route fixtures call actual handler with two actors and role grants; attempt foreign workspace query, unregistered domain, undeclared payload field, old schema/epoch, role revoke between pages, and unbounded limit. AI capability enabled must not grant offline access; offline entitlement must not enable AI.

```ts
assert.equal((await callSyncAs('actor-b', '/api/sync/domains/notes?cursor=' + actorACursor)).status, 409);
assert.equal((await callSyncAs('actor-a', '/api/sync/domains/unregistered')).status, 404);
```

Define test-local `callSyncAs(actorId:string,path:string):Promise<Response>` using the existing authenticated route injection pattern; `actorACursor` is obtained by actor-a bootstrap in the same test, not a fabricated token. Grant lookup ignores client authority hints.
- [ ] **RED command:** `(cd repos/orbits && node --test --import tsx tests/api/domain-sync-routes.test.ts tests/services/domain-registry.test.ts)`; route absent/unsafe payload fails.
- [ ] **GREEN minimum:** authenticate then authorize per manifest/page, map registered adapter only; `.strict()` validators reject unknown fields recursively. Manifest only authorized domains; revocation response can list formerly granted domain IDs without business payload so App purges before uploads. API error distinction `ACCOUNT_REVOKED` (auth 401/403), `DOMAIN_FORBIDDEN` (domain 403), `RESET_REQUIRED` (409); full reset never inferred from arbitrary domain 403.

```ts
const registration = registry.get(domainId);
if (!registration) throw new Error('UNKNOWN_DOMAIN');
const grant = await registration.adapter.authorize(actorId, workspaceId);
return registration.adapter.readPage(grant, cursor, Math.min(limit, 200));
```

`registry:ReadonlyMap<string,DomainRegistration>` initialized only with actual Task 8–15 adapters; `workspaceId` comes from authenticated grant selection, not trusted query. Public membership IDs travel in bounded domain pages using membershipCursor; never place an unbounded memberIds array in the manifest. Multiple workspaces require a server-verified selector; unauthorized supplied selector fails, never widens scope.
- [ ] **GREEN:** full files; `(cd repos/orbit-app && npm run sync:contract)` and both sync-copy tests. Registry entries carry field allowlist, ID rule, grant/revoke/delete/retention semantics, consumer selector/index/sort and size/history caps, never just a domain name.
- [ ] **Commit:** exact files; `feat(sync): expose authorized domain manifests and read pages`.

### Task 7: 有预算、可断点恢复的镜像协调器（阶段 C）

**Files:** Create `repos/orbit-app/src/data/sync/domain-sync-client.ts`, `domain-sync-coordinator.ts`, `read-completeness.ts`; Create `repos/orbit-app/src/hooks/useSyncedCollection.ts`; Create `repos/orbit-app/tests/domain-sync-coordinator.test.ts`, `read-completeness.test.ts`.

**Interfaces:** `SyncBudget={maxPages:number,maxBytes:number,maxDurationMs:number,minBatteryFraction:number,minFreeBytes:number}`; initial defaults 8 pages/4MiB/20s/20%/64MiB, locally configurable downward, never truncate corpus. `syncDomain(scope:ReadScope,reason:'bootstrap'|'refresh'|'resume'|'invalidation',budget:SyncBudget):Promise<{state:ReadCompleteness,pages:number,bytes:number}>`; `getReadCompleteness(input:{leaseValid:boolean,authorized:boolean,complete:boolean,hasRows:boolean,failed:boolean,stale:boolean}):ReadCompleteness`; `useSyncedCollection<T>(domainId:string,selector:(scope:ReadScope)=>Promise<readonly T[]>):{rows:readonly T[],state:ReadCompleteness,lastSyncedAt:string|null,refresh:()=>Promise<void>}`.

- [ ] **RED:** page 1 commits/page 2 fails, terminate/restart resumes cursor; page+cursor rollback together; max budget gives partial; double subscribers share one flight; old account completion discarded; reset affects only named domain; pending conflict untouched; fresh TTL no duplicate fetch; explicit refresh bypasses 5-minute TTL. Lifecycle timer ownership remains 0035.

```ts
assert.equal(getReadCompleteness({leaseValid:true,authorized:true,complete:false,hasRows:false,failed:true,stale:true}), 'failure');
assert.equal(getReadCompleteness({leaseValid:true,authorized:true,complete:false,hasRows:true,failed:false,stale:true}), 'partial');
assert.equal(getReadCompleteness({leaseValid:false,authorized:true,complete:true,hasRows:true,failed:false,stale:false}), 'locked');
```

- [ ] **RED command:** `(cd repos/orbit-app && node --test --import tsx tests/domain-sync-coordinator.test.ts tests/read-completeness.test.ts)`; expected absent coordinator and state implementation.
- [ ] **GREEN minimum:** manifest auth reconciliation first, then sequential per-domain HTTP pages via schema decoder; `applyDomainPage` stores page+cursor transactionally, completeness only final page; stop before exhausting budget and persist partial. No page redownload after successful commit. Dependencies record their own generations. Protected pending changes survive resets; revoked data never remains readable through overlay.

```ts
if (!input.leaseValid) return 'locked';
if (!input.authorized) return 'not-authorized';
if (input.failed && !input.hasRows) return 'failure';
if (!input.complete) return input.hasRows ? 'partial' : 'not-downloaded';
return input.stale || input.failed ? 'stale' : 'fresh';
```

- [ ] **GREEN:** complete files plus local repository/scope tests; inject abort/disk full before cursor write, restart and verify exact continuation. Expose reconciliation completion before 0034 uploader; 0035 receives stable `syncDomain` and status, not new cursor semantics.
- [ ] **Commit:** exact files; `feat(sync): add resumable budgeted domain pulls and completeness`.

### Task 8: 个人账号、笔记与事项（阶段 D）

**Files:**
- Create: `repos/orbits/features/sync/adapters/personal.ts`, `repos/orbit-app/src/data/offline-read/personal-selectors.ts`, `repos/orbits/tests/services/offline-read-personal.test.ts`, `repos/orbit-app/tests/offline-read-personal.test.tsx`.
- Modify: `repos/orbits/features/sync/domain-registry.ts`, `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/account/storage/account-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/profile/storage/profile-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/account-language/storage/account-language-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/notes/repository.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/tasks/repository.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/tasks/suggestion-repository.ts`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/AccountAuthScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/AccountPermissionsScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/AccountScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/EditProfileScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/PasswordResetScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/ProfileMoreScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/ProfilePagePrimitives.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/ProfilePreviewScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/ProfilePublicView.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/ProfileScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/ProfileSuggestionsScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/ProfileTagPickerScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/profile-page-model.ts`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/profile/useProfileEditSessionScreen.ts`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/notes/EditNoteScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/notes/NewNoteScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/notes/NoteContactPicker.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/notes/NoteDetailScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/notes/NoteEventPicker.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/notes/NoteMentionEditor.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/notes/NotesScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/notes/useNoteContactSummaries.ts`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/tasks/RelationshipTaskTools.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/tasks/TaskDetailScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/tasks/TasksScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/followups/FollowupsScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/followups/SavedFollowupsList.tsx`.

**Interfaces:** server `createPersonalReadAdapters(): readonly ReadModelAdapter[]`; stable domain IDs: `account`, `profile`, `preferences`, `notes`, `tasks`, `followups`, `task-suggestions`. App selectors export `selectDomainResource(scope:ReadScope,path:string):Promise<{data:unknown,state:ReadCompleteness,dependencyVersions:Readonly<Record<string,string>>}>` from this Task's selector file; each concrete endpoint decoder narrows data to its existing API DTO before rendering. All consume Tasks 1/5/6 contracts and Task 7 mirror. Duplicate export names remain module-local, route inventory selects the concrete module.

**明确数据范围:** 完整资料/语言/时区/通知偏好/标签/连接状态/建议；笔记正文、提及、联系人关联和可见历史；任务/跟进活动历史、提醒、确认事项；建议保持独立ID，不当成已确认任务。

- [ ] **Step 1 — RED:** add strict projection test below and real repository/HTTP fixtures for every listed domain: authorized bootstrap→update delta→physical delete→grant history→revoke without source update→expired cursor reset; actor B/foreign role cannot obtain actor A fields. Existing service fixtures must seed actual domain stores, never seed only the journal to fake write-path coverage. Rendering fixture seeds mirror, supplies rejected network fetch, renders each inventory consumer, and asserts its expected text/state remains; empty incomplete domain must not say no results.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalReadAdapters } from '../../features/sync/adapters/personal';
test('personal registers every required adapter and rejects secret payloads', () => {
  const adapters = createPersonalReadAdapters();
  assert.deepEqual(adapters.map(a => a.domainId).sort(), ["account","profile","preferences","notes","tasks","followups","task-suggestions"].sort());
  for (const adapter of adapters) {
    assert.throws(() => adapter.project({ id:'x', providerToken:'secret', hiddenPrompt:'secret' }));
  }
});
```

The strict-projection test is only the first RED, not the domain acceptance. In the same server test file add each seeded real source's positive allowed-field projection, reauthorization and all six transition assertions above; no wildcard projection. App test imports the existing `tests/helpers/render.tsx` renderer and actual consumers; inject their API/mirror dependencies using existing render-hook harness. Coverage report pairs every inventory row with a rendering case, not just one representative screen.

- [ ] **Step 2 — RED command:** `(cd repos/orbits && node --test --import tsx tests/services/offline-read-personal.test.ts)`; `(cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-read-personal.test.tsx)`. Expected missing adapter/selector first, then wrong direct-network rendering and missing visibility transitions; environmental DB failures are not TDD RED.
- [ ] **Step 3 — GREEN minimum:** notes strict projection 仅保留现有公开给当前 actor 的 Note DTO 字段，关联ID分表；task-suggestions 单独投影，不合并进 tasks；偏好不包含 provider credential。 Use existing listed provider/repository authorization and source transaction, append immutable journal changes through Task 5; new per-domain adapter wraps that source, strict allowlist decoder and grant function. Never replace source authority with sync tables. Domain implementation carries field and ID semantics from its existing DTO/route, asserts runtime schema parity, and explicitly excludes secret fields.

```ts
// The adapter module implements ReadModelAdapter and registers only its listed IDs.
// HTTP may refresh; UI consumes the committed local projection.
const result = await selectDomainResource(scope, path);
if (result.state === 'locked' || result.state === 'not-authorized') {
  return { data: null, state: result.state, dependencyVersions: result.dependencyVersions };
}
return result;
```

`scope:ReadScope` and `path:string` are selector arguments; projection implementation maps normalized rows back to each existing typed DTO rather than returning raw JSON to UI. Reuse Task 7 state metadata to show stale/partial/failure; successful online mutation requests an immediate domain delta but mutation behavior remains unchanged.
- [ ] **Step 4 — GREEN:** both complete files, affected direct consumer tests, touched-end typecheck once, inventory audit. For every listed source, compare source commit, journal revision and mirror revision; any adapter missing physical-delete/grant/revoke coverage blocks this Task even if its names test passes.
- [ ] **Step 5 — Commit:** stage only this Task's created files, actual modified providers/consumers and registry/inventory rows after impact and detect_changes; `git commit -m "feat(sync): migrate personal reads to authorized domain mirrors"`. Stage D complete only after all its Tasks pass; it may be integrated by management independently, never marked full Sprint complete.

### Task 9: 基础人脉和已保存导入（阶段 D）

**Files:**
- Create: `repos/orbits/features/sync/adapters/relationships.ts`, `repos/orbit-app/src/data/offline-read/relationships-selectors.ts`, `repos/orbits/tests/services/offline-read-relationships.test.ts`, `repos/orbit-app/tests/offline-read-relationships.test.tsx`.
- Modify: `repos/orbits/features/sync/domain-registry.ts`, `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/contacts/storage/contact-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/contacts/storage/contact-write-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/contacts/contact-actor-links/storage-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/contacts/contact-graph-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/acquisition/storage/contact-draft-live-record-provider.ts`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/BusinessCardBatchScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/BusinessCardImportScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/BusinessCardIngestScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/BusinessCardIngestStartScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactDetailScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactIntrosScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactNeedsEditor.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactNeedsHomeEntry.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactNeedsMatchesContent.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactNeedsMatchesScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactNotesSection.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactPage.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactPipelineScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactStructureDetailScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactsDashboardScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactsGraphScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/ContactsScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/RelationshipInvitationScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/contacts/business-card-pending-files.ts`.

**Interfaces:** server `createRelationshipsReadAdapters(): readonly ReadModelAdapter[]`; stable domain IDs: `contacts`, `connections`, `relationship-evidence`, `contact-needs`, `introductions`, `pipeline`, `acquisition`. App selectors export `selectDomainResource(scope:ReadScope,path:string):Promise<{data:unknown,state:ReadCompleteness,dependencyVersions:Readonly<Record<string,string>>}>` from this Task's selector file; each concrete endpoint decoder narrows data to its existing API DTO before rendering. All consume Tasks 1/5/6 contracts and Task 7 mirror. Duplicate export names remain module-local, route inventory selects the concrete module.

**明确数据范围:** 联系人列表/详情状态、人脉证据摘要、需求、介绍、Pipeline、图谱/分析；已保存导入结果、名片draft、去重决定和批量复核。

- [ ] **Step 1 — RED:** add strict projection test below and real repository/HTTP fixtures for every listed domain: authorized bootstrap→update delta→physical delete→grant history→revoke without source update→expired cursor reset; actor B/foreign role cannot obtain actor A fields. Existing service fixtures must seed actual domain stores, never seed only the journal to fake write-path coverage. Rendering fixture seeds mirror, supplies rejected network fetch, renders each inventory consumer, and asserts its expected text/state remains; empty incomplete domain must not say no results.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelationshipsReadAdapters } from '../../features/sync/adapters/relationships';
test('relationships registers every required adapter and rejects secret payloads', () => {
  const adapters = createRelationshipsReadAdapters();
  assert.deepEqual(adapters.map(a => a.domainId).sort(), ["contacts","connections","relationship-evidence","contact-needs","introductions","pipeline","acquisition"].sort());
  for (const adapter of adapters) {
    assert.throws(() => adapter.project({ id:'x', providerToken:'secret', hiddenPrompt:'secret' }));
  }
});
```

The strict-projection test is only the first RED, not the domain acceptance. In the same server test file add each seeded real source's positive allowed-field projection, reauthorization and all six transition assertions above; no wildcard projection. App test imports the existing `tests/helpers/render.tsx` renderer and actual consumers; inject their API/mirror dependencies using existing render-hook harness. Coverage report pairs every inventory row with a rendering case, not just one representative screen.

- [ ] **Step 2 — RED command:** `(cd repos/orbits && node --test --import tsx tests/services/offline-read-relationships.test.ts)`; `(cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-read-relationships.test.tsx)`. Expected missing adapter/selector first, then wrong direct-network rendering and missing visibility transitions; environmental DB failures are not TDD RED.
- [ ] **Step 3 — GREEN minimum:** contact actor links 先授权再投影；图谱边只包含两个端点均可见的边；card draft 不含图片base64，只有asset ID；扫描/OCR/确认导入命令保持online_only。 Use existing listed provider/repository authorization and source transaction, append immutable journal changes through Task 5; new per-domain adapter wraps that source, strict allowlist decoder and grant function. Never replace source authority with sync tables. Domain implementation carries field and ID semantics from its existing DTO/route, asserts runtime schema parity, and explicitly excludes secret fields.

```ts
// The adapter module implements ReadModelAdapter and registers only its listed IDs.
// HTTP may refresh; UI consumes the committed local projection.
const result = await selectDomainResource(scope, path);
if (result.state === 'locked' || result.state === 'not-authorized') {
  return { data: null, state: result.state, dependencyVersions: result.dependencyVersions };
}
return result;
```

`scope:ReadScope` and `path:string` are selector arguments; projection implementation maps normalized rows back to each existing typed DTO rather than returning raw JSON to UI. Reuse Task 7 state metadata to show stale/partial/failure; successful online mutation requests an immediate domain delta but mutation behavior remains unchanged.
- [ ] **Step 4 — GREEN:** both complete files, affected direct consumer tests, touched-end typecheck once, inventory audit. For every listed source, compare source commit, journal revision and mirror revision; any adapter missing physical-delete/grant/revoke coverage blocks this Task even if its names test passes.
- [ ] **Step 5 — Commit:** stage only this Task's created files, actual modified providers/consumers and registry/inventory rows after impact and detect_changes; `git commit -m "feat(sync): migrate relationships reads to authorized domain mirrors"`. Stage D complete only after all its Tasks pass; it may be integrated by management independently, never marked full Sprint complete.

### Task 10: 普通通信、消息与类型化通知（阶段 E）

**Files:**
- Create: `repos/orbits/features/sync/adapters/communications.ts`, `repos/orbit-app/src/data/offline-read/communications-selectors.ts`, `repos/orbits/tests/services/offline-read-communications.test.ts`, `repos/orbit-app/tests/offline-read-communications.test.tsx`.
- Modify: `repos/orbits/features/sync/domain-registry.ts`, `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/chat/storage/chat-conversation-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/chat/storage/async-relationship-conversation-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/chat/storage/chat-summary-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/chat/storage/chat-privacy-controls-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/notifications/storage/inbox-record-repository.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/notifications/storage/reminder-notification-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/notifications/discovery/discovery-repository.ts`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/chat/RelationshipChatDetailScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/chat/RelationshipChatScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/inbox/MessageInboxList.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/inbox/NotificationDetailScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/inbox/NotificationInboxList.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/inbox/useNotificationInbox.ts`.

**Interfaces:** server `createCommunicationsReadAdapters(): readonly ReadModelAdapter[]`; stable domain IDs: `conversations`, `messages`, `message-read-state`, `chat-privacy`, `notifications`, `relationship-signals`. App selectors export `selectDomainResource(scope:ReadScope,path:string):Promise<{data:unknown,state:ReadCompleteness,dependencyVersions:Readonly<Record<string,string>>}>` from this Task's selector file; each concrete endpoint decoder narrows data to its existing API DTO before rendering. All consume Tasks 1/5/6 contracts and Task 7 mirror. Duplicate export names remain module-local, route inventory selects the concrete module.

**明确数据范围:** 会话、参与者、关系通信绑定、消息完整历史、已读游标、摘要/提取结果、隐私和邀请状态；三类通知生命周期/未读/提醒投递、人脉信号处理结果。

- [ ] **Step 1 — RED:** add strict projection test below and real repository/HTTP fixtures for every listed domain: authorized bootstrap→update delta→physical delete→grant history→revoke without source update→expired cursor reset; actor B/foreign role cannot obtain actor A fields. Existing service fixtures must seed actual domain stores, never seed only the journal to fake write-path coverage. Rendering fixture seeds mirror, supplies rejected network fetch, renders each inventory consumer, and asserts its expected text/state remains; empty incomplete domain must not say no results.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunicationsReadAdapters } from '../../features/sync/adapters/communications';
test('communications registers every required adapter and rejects secret payloads', () => {
  const adapters = createCommunicationsReadAdapters();
  assert.deepEqual(adapters.map(a => a.domainId).sort(), ["conversations","messages","message-read-state","chat-privacy","notifications","relationship-signals"].sort());
  for (const adapter of adapters) {
    assert.throws(() => adapter.project({ id:'x', providerToken:'secret', hiddenPrompt:'secret' }));
  }
});
```

The strict-projection test is only the first RED, not the domain acceptance. In the same server test file add each seeded real source's positive allowed-field projection, reauthorization and all six transition assertions above; no wildcard projection. App test imports the existing `tests/helpers/render.tsx` renderer and actual consumers; inject their API/mirror dependencies using existing render-hook harness. Coverage report pairs every inventory row with a rendering case, not just one representative screen.

- [ ] **Step 2 — RED command:** `(cd repos/orbits && node --test --import tsx tests/services/offline-read-communications.test.ts)`; `(cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-read-communications.test.tsx)`. Expected missing adapter/selector first, then wrong direct-network rendering and missing visibility transitions; environmental DB failures are not TDD RED.
- [ ] **Step 3 — GREEN minimum:** 复用0037/38稳定conversation/message/notification ID；邀请只存状态，删除token/url secret；消息参与资格改变必须journal visibility-delete；聚合inbox只存引用或投影，不能复制权威通知/任务。 Use existing listed provider/repository authorization and source transaction, append immutable journal changes through Task 5; new per-domain adapter wraps that source, strict allowlist decoder and grant function. Never replace source authority with sync tables. Domain implementation carries field and ID semantics from its existing DTO/route, asserts runtime schema parity, and explicitly excludes secret fields.

```ts
// The adapter module implements ReadModelAdapter and registers only its listed IDs.
// HTTP may refresh; UI consumes the committed local projection.
const result = await selectDomainResource(scope, path);
if (result.state === 'locked' || result.state === 'not-authorized') {
  return { data: null, state: result.state, dependencyVersions: result.dependencyVersions };
}
return result;
```

`scope:ReadScope` and `path:string` are selector arguments; projection implementation maps normalized rows back to each existing typed DTO rather than returning raw JSON to UI. Reuse Task 7 state metadata to show stale/partial/failure; successful online mutation requests an immediate domain delta but mutation behavior remains unchanged.
- [ ] **Step 4 — GREEN:** both complete files, affected direct consumer tests, touched-end typecheck once, inventory audit. For every listed source, compare source commit, journal revision and mirror revision; any adapter missing physical-delete/grant/revoke coverage blocks this Task even if its names test passes.
- [ ] **Step 5 — Commit:** stage only this Task's created files, actual modified providers/consumers and registry/inventory rows after impact and detect_changes; `git commit -m "feat(sync): migrate communications reads to authorized domain mirrors"`. Stage E complete only after all its Tasks pass; it may be integrated by management independently, never marked full Sprint complete.

### Task 11: 完整日程、预约和会议（阶段 E）

**Files:**
- Create: `repos/orbits/features/sync/adapters/calendar.ts`, `repos/orbit-app/src/data/offline-read/calendar-selectors.ts`, `repos/orbits/tests/services/offline-read-calendar.test.ts`, `repos/orbit-app/tests/offline-read-calendar.test.tsx`.
- Modify: `repos/orbits/features/sync/domain-registry.ts`, `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/personal-schedule/authority-service.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/appointments/postgres-repository.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/appointments/storage/migrations.ts`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/schedule/MeetingDetailScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/schedule/PersonalScheduleList.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/schedule/PersonalScheduleScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/schedule/ScheduleEventPreviewScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx`.

**Interfaces:** server `createCalendarReadAdapters(): readonly ReadModelAdapter[]`; stable domain IDs: `personal-schedule`, `appointments`, `meetings`. App selectors export `selectDomainResource(scope:ReadScope,path:string):Promise<{data:unknown,state:ReadCompleteness,dependencyVersions:Readonly<Record<string,string>>}>` from this Task's selector file; each concrete endpoint decoder narrows data to its existing API DTO before rendering. All consume Tasks 1/5/6 contracts and Task 7 mirror. Duplicate export names remain module-local, route inventory selects the concrete module.

**明确数据范围:** 个人日程、appointment参与者、共享说明、legacy meeting私有说明和活动日程引用；保留0010/0027日期语义和稳定目标类型。

- [ ] **Step 1 — RED:** add strict projection test below and real repository/HTTP fixtures for every listed domain: authorized bootstrap→update delta→physical delete→grant history→revoke without source update→expired cursor reset; actor B/foreign role cannot obtain actor A fields. Existing service fixtures must seed actual domain stores, never seed only the journal to fake write-path coverage. Rendering fixture seeds mirror, supplies rejected network fetch, renders each inventory consumer, and asserts its expected text/state remains; empty incomplete domain must not say no results.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarReadAdapters } from '../../features/sync/adapters/calendar';
test('calendar registers every required adapter and rejects secret payloads', () => {
  const adapters = createCalendarReadAdapters();
  assert.deepEqual(adapters.map(a => a.domainId).sort(), ["personal-schedule","appointments","meetings"].sort());
  for (const adapter of adapters) {
    assert.throws(() => adapter.project({ id:'x', providerToken:'secret', hiddenPrompt:'secret' }));
  }
});
```

The strict-projection test is only the first RED, not the domain acceptance. In the same server test file add each seeded real source's positive allowed-field projection, reauthorization and all six transition assertions above; no wildcard projection. App test imports the existing `tests/helpers/render.tsx` renderer and actual consumers; inject their API/mirror dependencies using existing render-hook harness. Coverage report pairs every inventory row with a rendering case, not just one representative screen.

- [ ] **Step 2 — RED command:** `(cd repos/orbits && node --test --import tsx tests/services/offline-read-calendar.test.ts)`; `(cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-read-calendar.test.tsx)`. Expected missing adapter/selector first, then wrong direct-network rendering and missing visibility transitions; environmental DB failures are not TDD RED.
- [ ] **Step 3 — GREEN minimum:** personal_schedule_items使用其权威存储；预约使用appointments库与参与者授权；legacy meeting只向owner投影，不把共享说明误作私人说明；三类source ID保持命名空间。 Use existing listed provider/repository authorization and source transaction, append immutable journal changes through Task 5; new per-domain adapter wraps that source, strict allowlist decoder and grant function. Never replace source authority with sync tables. Domain implementation carries field and ID semantics from its existing DTO/route, asserts runtime schema parity, and explicitly excludes secret fields.

```ts
// The adapter module implements ReadModelAdapter and registers only its listed IDs.
// HTTP may refresh; UI consumes the committed local projection.
const result = await selectDomainResource(scope, path);
if (result.state === 'locked' || result.state === 'not-authorized') {
  return { data: null, state: result.state, dependencyVersions: result.dependencyVersions };
}
return result;
```

`scope:ReadScope` and `path:string` are selector arguments; projection implementation maps normalized rows back to each existing typed DTO rather than returning raw JSON to UI. Reuse Task 7 state metadata to show stale/partial/failure; successful online mutation requests an immediate domain delta but mutation behavior remains unchanged.
- [ ] **Step 4 — GREEN:** both complete files, affected direct consumer tests, touched-end typecheck once, inventory audit. For every listed source, compare source commit, journal revision and mirror revision; any adapter missing physical-delete/grant/revoke coverage blocks this Task even if its names test passes.
- [ ] **Step 5 — Commit:** stage only this Task's created files, actual modified providers/consumers and registry/inventory rows after impact and detect_changes; `git commit -m "feat(sync): migrate calendar reads to authorized domain mirrors"`. Stage E complete only after all its Tasks pass; it may be integrated by management independently, never marked full Sprint complete.

### Task 12: 全部历史 AI 会话（阶段 E）

**Files:**
- Create: `repos/orbits/features/sync/adapters/ai-history.ts`, `repos/orbit-app/src/data/offline-read/ai-history-selectors.ts`, `repos/orbits/tests/services/offline-read-ai-history.test.ts`, `repos/orbit-app/tests/offline-read-ai-history.test.tsx`.
- Modify: `repos/orbits/features/sync/domain-registry.ts`, `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/orbit-ai/storage/orbit-agent-chat-group-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/orbit-ai/storage/orbit-agent-chat-session-transactions.ts`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/ai/AgentActionsScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/ai/AiConversationScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/ai/AiScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/ai/AiSessionOrganization.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/ai/ContactMentionPicker.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/ai/OrbitNextActions.tsx`.

**Interfaces:** server `createAiHistoryReadAdapters(): readonly ReadModelAdapter[]`; stable domain IDs: `ai-sessions`, `ai-groups`, `ai-messages`, `ai-runs`. App selectors export `selectDomainResource(scope:ReadScope,path:string):Promise<{data:unknown,state:ReadCompleteness,dependencyVersions:Readonly<Record<string,string>>}>` from this Task's selector file; each concrete endpoint decoder narrows data to its existing API DTO before rendering. All consume Tasks 1/5/6 contracts and Task 7 mirror. Duplicate export names remain module-local, route inventory selects the concrete module.

**明确数据范围:** 所有历史会话、分组/置顶/入口、消息、用户可见运行状态和输出；没有最近N条截断，不调用provider生成新数据。

- [ ] **Step 1 — RED:** add strict projection test below and real repository/HTTP fixtures for every listed domain: authorized bootstrap→update delta→physical delete→grant history→revoke without source update→expired cursor reset; actor B/foreign role cannot obtain actor A fields. Existing service fixtures must seed actual domain stores, never seed only the journal to fake write-path coverage. Rendering fixture seeds mirror, supplies rejected network fetch, renders each inventory consumer, and asserts its expected text/state remains; empty incomplete domain must not say no results.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiHistoryReadAdapters } from '../../features/sync/adapters/ai-history';
test('ai-history registers every required adapter and rejects secret payloads', () => {
  const adapters = createAiHistoryReadAdapters();
  assert.deepEqual(adapters.map(a => a.domainId).sort(), ["ai-sessions","ai-groups","ai-messages","ai-runs"].sort());
  for (const adapter of adapters) {
    assert.throws(() => adapter.project({ id:'x', providerToken:'secret', hiddenPrompt:'secret' }));
  }
});
```

The strict-projection test is only the first RED, not the domain acceptance. In the same server test file add each seeded real source's positive allowed-field projection, reauthorization and all six transition assertions above; no wildcard projection. App test imports the existing `tests/helpers/render.tsx` renderer and actual consumers; inject their API/mirror dependencies using existing render-hook harness. Coverage report pairs every inventory row with a rendering case, not just one representative screen.

- [ ] **Step 2 — RED command:** `(cd repos/orbits && node --test --import tsx tests/services/offline-read-ai-history.test.ts)`; `(cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-read-ai-history.test.tsx)`. Expected missing adapter/selector first, then wrong direct-network rendering and missing visibility transitions; environmental DB failures are not TDD RED.
- [ ] **Step 3 — GREEN minimum:** 仅投影用户可见role/content/output和组织状态；hidden prompt、raw provider context、tool secret不落盘。测试201条消息、limit=50跨多次预算恢复，已完成页不重下；组织revision与消息revision保持各自含义。 Use existing listed provider/repository authorization and source transaction, append immutable journal changes through Task 5; new per-domain adapter wraps that source, strict allowlist decoder and grant function. Never replace source authority with sync tables. Domain implementation carries field and ID semantics from its existing DTO/route, asserts runtime schema parity, and explicitly excludes secret fields.

```ts
// The adapter module implements ReadModelAdapter and registers only its listed IDs.
// HTTP may refresh; UI consumes the committed local projection.
const result = await selectDomainResource(scope, path);
if (result.state === 'locked' || result.state === 'not-authorized') {
  return { data: null, state: result.state, dependencyVersions: result.dependencyVersions };
}
return result;
```

`scope:ReadScope` and `path:string` are selector arguments; projection implementation maps normalized rows back to each existing typed DTO rather than returning raw JSON to UI. Reuse Task 7 state metadata to show stale/partial/failure; successful online mutation requests an immediate domain delta but mutation behavior remains unchanged.
- [ ] **Step 4 — GREEN:** both complete files, affected direct consumer tests, touched-end typecheck once, inventory audit. For every listed source, compare source commit, journal revision and mirror revision; any adapter missing physical-delete/grant/revoke coverage blocks this Task even if its names test passes.
- [ ] **Step 5 — Commit:** stage only this Task's created files, actual modified providers/consumers and registry/inventory rows after impact and detect_changes; `git commit -m "feat(sync): migrate ai-history reads to authorized domain mirrors"`. Stage E complete only after all its Tasks pass; it may be integrated by management independently, never marked full Sprint complete.

### Task 13: 活动角色、运营与公共目录（阶段 F）

**Files:**
- Create: `repos/orbits/features/sync/adapters/events.ts`, `repos/orbit-app/src/data/offline-read/events-selectors.ts`, `repos/orbits/tests/services/offline-read-events.test.ts`, `repos/orbit-app/tests/offline-read-events.test.tsx`.
- Modify: `repos/orbits/features/sync/domain-registry.ts`, `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/events/core/storage/postgres-repository.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/events/event-access/storage/postgres-repository.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/events/registration/storage/live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/events/event-operations/storage/postgres-repository.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/events/event-operations/storage/canonical-registration-repository.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/events/admission/storage/postgres-repository.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/events/experience/storage/postgres-repository.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/events/goal-readiness/storage/generated-goal-readiness-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/events/encounter-note/storage/generated-encounter-note-live-record-provider.ts`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventAdmissionReviewContent.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventAdmissionReviewScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventAnalyticsContent.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventAnalyticsScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventAttendeesScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventCenterContent.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventCenterScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventCheckInContent.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventCheckInScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventDetailScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventExperienceContent.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventExperienceScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventOperationsContent.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventOperationsScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventRegistrationScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventRolesContent.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventRolesScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/events/EventsScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/organizer/OrganizerPublicScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/party/PartyModeScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/admin/AdminLoginScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/admin/AdminScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/platform/PlatformScreen.tsx`.

**Interfaces:** server `createEventsReadAdapters(): readonly ReadModelAdapter[]`; stable domain IDs: `events`, `organizers`, `event-recommendations`, `registrations`, `event-memberships`, `event-roles`, `event-operations`, `event-analytics`, `event-experience`, `event-goals`. App selectors export `selectDomainResource(scope:ReadScope,path:string):Promise<{data:unknown,state:ReadCompleteness,dependencyVersions:Readonly<Record<string,string>>}>` from this Task's selector file; each concrete endpoint decoder narrows data to its existing API DTO before rendering. All consume Tasks 1/5/6 contracts and Task 7 mirror. Duplicate export names remain module-local, route inventory selects the concrete module.

**明确数据范围:** 活动详情/目录、主办方、推荐、报名问卷答案、会员、参会人可见性、相遇、目标/准备度/现场图；角色/审核/运营任务/生成结果/签到/分析以及App可见管理视图。

- [ ] **Step 1 — RED:** add strict projection test below and real repository/HTTP fixtures for every listed domain: authorized bootstrap→update delta→physical delete→grant history→revoke without source update→expired cursor reset; actor B/foreign role cannot obtain actor A fields. Existing service fixtures must seed actual domain stores, never seed only the journal to fake write-path coverage. Rendering fixture seeds mirror, supplies rejected network fetch, renders each inventory consumer, and asserts its expected text/state remains; empty incomplete domain must not say no results.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventsReadAdapters } from '../../features/sync/adapters/events';
test('events registers every required adapter and rejects secret payloads', () => {
  const adapters = createEventsReadAdapters();
  assert.deepEqual(adapters.map(a => a.domainId).sort(), ["events","organizers","event-recommendations","registrations","event-memberships","event-roles","event-operations","event-analytics","event-experience","event-goals"].sort());
  for (const adapter of adapters) {
    assert.throws(() => adapter.project({ id:'x', providerToken:'secret', hiddenPrompt:'secret' }));
  }
});
```

The strict-projection test is only the first RED, not the domain acceptance. In the same server test file add each seeded real source's positive allowed-field projection, reauthorization and all six transition assertions above; no wildcard projection. App test imports the existing `tests/helpers/render.tsx` renderer and actual consumers; inject their API/mirror dependencies using existing render-hook harness. Coverage report pairs every inventory row with a rendering case, not just one representative screen.

- [ ] **Step 2 — RED command:** `(cd repos/orbits && node --test --import tsx tests/services/offline-read-events.test.ts)`; `(cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-read-events.test.tsx)`. Expected missing adapter/selector first, then wrong direct-network rendering and missing visibility transitions; environmental DB failures are not TDD RED.
- [ ] **Step 3 — GREEN minimum:** 参与和角色域完整同步；公共浏览manifest使用服务器明确集合（saved/joined/pinned/recent），不以客户端时间窗假造完整目录。role grant回填历史；revoke无需entity更新也删投影/asset；无该角色时整个域not-authorized。报名/审核/签到/角色修改仍online_only。 Use existing listed provider/repository authorization and source transaction, append immutable journal changes through Task 5; new per-domain adapter wraps that source, strict allowlist decoder and grant function. Never replace source authority with sync tables. Domain implementation carries field and ID semantics from its existing DTO/route, asserts runtime schema parity, and explicitly excludes secret fields.

```ts
// The adapter module implements ReadModelAdapter and registers only its listed IDs.
// HTTP may refresh; UI consumes the committed local projection.
const result = await selectDomainResource(scope, path);
if (result.state === 'locked' || result.state === 'not-authorized') {
  return { data: null, state: result.state, dependencyVersions: result.dependencyVersions };
}
return result;
```

`scope:ReadScope` and `path:string` are selector arguments; projection implementation maps normalized rows back to each existing typed DTO rather than returning raw JSON to UI. Reuse Task 7 state metadata to show stale/partial/failure; successful online mutation requests an immediate domain delta but mutation behavior remains unchanged.
- [ ] **Step 4 — GREEN:** both complete files, affected direct consumer tests, touched-end typecheck once, inventory audit. For every listed source, compare source commit, journal revision and mirror revision; any adapter missing physical-delete/grant/revoke coverage blocks this Task even if its names test passes.
- [ ] **Step 5 — Commit:** stage only this Task's created files, actual modified providers/consumers and registry/inventory rows after impact and detect_changes; `git commit -m "feat(sync): migrate events reads to authorized domain mirrors"`. Stage F complete only after all its Tasks pass; it may be integrated by management independently, never marked full Sprint complete.

### Task 14: Agent 用户可见数据（阶段 F）

**Files:**
- Create: `repos/orbits/features/sync/adapters/agent.ts`, `repos/orbit-app/src/data/offline-read/agent-selectors.ts`, `repos/orbits/tests/services/offline-read-agent.test.ts`, `repos/orbit-app/tests/offline-read-agent.test.tsx`.
- Modify: `repos/orbits/features/sync/domain-registry.ts`, `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/agent/storage/agent-runtime-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/agent/storage/agent-action-live-record-provider.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/agent/runtime/repository.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/agent/settings-contract.ts`.
- Read / Modify only for same-transaction journal or authorization integration: `repos/orbits/features/notifications/delivery-policy-repository.ts`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/agent/AgentLedgerContent.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/agent/AgentLedgerScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/settings/DiscoverySettingsContent.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/settings/NotificationDeliverySettings.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/settings/NotificationDiscoverySettings.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/settings/SettingsScreen.tsx`.

**Interfaces:** server `createAgentReadAdapters(): readonly ReadModelAdapter[]`; stable domain IDs: `agent-preferences`, `agent-settings`, `agent-signals`, `agent-actions`, `agent-ledger`, `agent-turns`, `agent-receipts`. App selectors export `selectDomainResource(scope:ReadScope,path:string):Promise<{data:unknown,state:ReadCompleteness,dependencyVersions:Readonly<Record<string,string>>}>` from this Task's selector file; each concrete endpoint decoder narrows data to its existing API DTO before rendering. All consume Tasks 1/5/6 contracts and Task 7 mirror. Duplicate export names remain module-local, route inventory selects the concrete module.

**明确数据范围:** 偏好、设置、信号、动作、账本、主动回合、用户可见执行回执和通知设置；禁止后台专用审计正文、内部memory原文或provider credential。

- [ ] **Step 1 — RED:** add strict projection test below and real repository/HTTP fixtures for every listed domain: authorized bootstrap→update delta→physical delete→grant history→revoke without source update→expired cursor reset; actor B/foreign role cannot obtain actor A fields. Existing service fixtures must seed actual domain stores, never seed only the journal to fake write-path coverage. Rendering fixture seeds mirror, supplies rejected network fetch, renders each inventory consumer, and asserts its expected text/state remains; empty incomplete domain must not say no results.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentReadAdapters } from '../../features/sync/adapters/agent';
test('agent registers every required adapter and rejects secret payloads', () => {
  const adapters = createAgentReadAdapters();
  assert.deepEqual(adapters.map(a => a.domainId).sort(), ["agent-preferences","agent-settings","agent-signals","agent-actions","agent-ledger","agent-turns","agent-receipts"].sort());
  for (const adapter of adapters) {
    assert.throws(() => adapter.project({ id:'x', providerToken:'secret', hiddenPrompt:'secret' }));
  }
});
```

The strict-projection test is only the first RED, not the domain acceptance. In the same server test file add each seeded real source's positive allowed-field projection, reauthorization and all six transition assertions above; no wildcard projection. App test imports the existing `tests/helpers/render.tsx` renderer and actual consumers; inject their API/mirror dependencies using existing render-hook harness. Coverage report pairs every inventory row with a rendering case, not just one representative screen.

- [ ] **Step 2 — RED command:** `(cd repos/orbits && node --test --import tsx tests/services/offline-read-agent.test.ts)`; `(cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-read-agent.test.tsx)`. Expected missing adapter/selector first, then wrong direct-network rendering and missing visibility transitions; environmental DB failures are not TDD RED.
- [ ] **Step 3 — GREEN minimum:** 按既有用户可见DTO窄投影，不缓存整个runtime JSON。执行回执为只读数据；retry/execute/send/provider动作无offline_queue资格；AI读取仍由0036独立授权。 Use existing listed provider/repository authorization and source transaction, append immutable journal changes through Task 5; new per-domain adapter wraps that source, strict allowlist decoder and grant function. Never replace source authority with sync tables. Domain implementation carries field and ID semantics from its existing DTO/route, asserts runtime schema parity, and explicitly excludes secret fields.

```ts
// The adapter module implements ReadModelAdapter and registers only its listed IDs.
// HTTP may refresh; UI consumes the committed local projection.
const result = await selectDomainResource(scope, path);
if (result.state === 'locked' || result.state === 'not-authorized') {
  return { data: null, state: result.state, dependencyVersions: result.dependencyVersions };
}
return result;
```

`scope:ReadScope` and `path:string` are selector arguments; projection implementation maps normalized rows back to each existing typed DTO rather than returning raw JSON to UI. Reuse Task 7 state metadata to show stale/partial/failure; successful online mutation requests an immediate domain delta but mutation behavior remains unchanged.
- [ ] **Step 4 — GREEN:** both complete files, affected direct consumer tests, touched-end typecheck once, inventory audit. For every listed source, compare source commit, journal revision and mirror revision; any adapter missing physical-delete/grant/revoke coverage blocks this Task even if its names test passes.
- [ ] **Step 5 — Commit:** stage only this Task's created files, actual modified providers/consumers and registry/inventory rows after impact and detect_changes; `git commit -m "feat(sync): migrate agent reads to authorized domain mirrors"`. Stage F complete only after all its Tasks pass; it may be integrated by management independently, never marked full Sprint complete.

### Task 15: 首页和其他聚合视图（阶段 F）

**Files:**
- Create: `repos/orbits/features/sync/adapters/aggregates.ts`, `repos/orbit-app/src/data/offline-read/aggregates-selectors.ts`, `repos/orbits/tests/services/offline-read-aggregates.test.ts`, `repos/orbit-app/tests/offline-read-aggregates.test.tsx`.
- Modify: `repos/orbits/features/sync/domain-registry.ts`, `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/home/HomeDashboardScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/home/HomeScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/today/TodayScreen.tsx`.
- Consumer audit / read-wiring modification only if it reads this Task's domain: `repos/orbit-app/src/screens/dashboard/DashboardScreen.tsx`.

**Interfaces:** server `createAggregatesReadAdapters(): readonly ReadModelAdapter[]`; stable domain IDs: `home`, `today`, `dashboard`, `distributions`, `opportunities`, `sources`. App selectors export `selectDomainResource(scope:ReadScope,path:string):Promise<{data:unknown,state:ReadCompleteness,dependencyVersions:Readonly<Record<string,string>>}>` from this Task's selector file; each concrete endpoint decoder narrows data to its existing API DTO before rendering. All consume Tasks 1/5/6 contracts and Task 7 mirror. Duplicate export names remain module-local, route inventory selects the concrete module.

**明确数据范围:** 首页、今日、Dashboard、分布、机会、来源及其二级读取；可确定本地计算的从完整基础域计算，否则用服务端版本化投影。

- [ ] **Step 1 — RED:** add strict projection test below and real repository/HTTP fixtures for every listed domain: authorized bootstrap→update delta→physical delete→grant history→revoke without source update→expired cursor reset; actor B/foreign role cannot obtain actor A fields. Existing service fixtures must seed actual domain stores, never seed only the journal to fake write-path coverage. Rendering fixture seeds mirror, supplies rejected network fetch, renders each inventory consumer, and asserts its expected text/state remains; empty incomplete domain must not say no results.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAggregatesReadAdapters } from '../../features/sync/adapters/aggregates';
test('aggregates registers every required adapter and rejects secret payloads', () => {
  const adapters = createAggregatesReadAdapters();
  assert.deepEqual(adapters.map(a => a.domainId).sort(), ["home","today","dashboard","distributions","opportunities","sources"].sort());
  for (const adapter of adapters) {
    assert.throws(() => adapter.project({ id:'x', providerToken:'secret', hiddenPrompt:'secret' }));
  }
});
```

The strict-projection test is only the first RED, not the domain acceptance. In the same server test file add each seeded real source's positive allowed-field projection, reauthorization and all six transition assertions above; no wildcard projection. App test imports the existing `tests/helpers/render.tsx` renderer and actual consumers; inject their API/mirror dependencies using existing render-hook harness. Coverage report pairs every inventory row with a rendering case, not just one representative screen.

- [ ] **Step 2 — RED command:** `(cd repos/orbits && node --test --import tsx tests/services/offline-read-aggregates.test.ts)`; `(cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-read-aggregates.test.tsx)`. Expected missing adapter/selector first, then wrong direct-network rendering and missing visibility transitions; environmental DB failures are not TDD RED.
- [ ] **Step 3 — GREEN minimum:** 保存dependencyVersions和generation；分页把新代写入staging，只有final page且依赖版本齐备才原子切换active generation；中途失败保留旧集合，禁止见不到就删旧成员。 Use existing listed provider/repository authorization and source transaction, append immutable journal changes through Task 5; new per-domain adapter wraps that source, strict allowlist decoder and grant function. Never replace source authority with sync tables. Domain implementation carries field and ID semantics from its existing DTO/route, asserts runtime schema parity, and explicitly excludes secret fields.

```ts
// The adapter module implements ReadModelAdapter and registers only its listed IDs.
// HTTP may refresh; UI consumes the committed local projection.
const result = await selectDomainResource(scope, path);
if (result.state === 'locked' || result.state === 'not-authorized') {
  return { data: null, state: result.state, dependencyVersions: result.dependencyVersions };
}
return result;
```

`scope:ReadScope` and `path:string` are selector arguments; projection implementation maps normalized rows back to each existing typed DTO rather than returning raw JSON to UI. Reuse Task 7 state metadata to show stale/partial/failure; successful online mutation requests an immediate domain delta but mutation behavior remains unchanged.
- [ ] **Step 4 — GREEN:** both complete files, affected direct consumer tests, touched-end typecheck once, inventory audit. For every listed source, compare source commit, journal revision and mirror revision; any adapter missing physical-delete/grant/revoke coverage blocks this Task even if its names test passes.
- [ ] **Step 5 — Commit:** stage only this Task's created files, actual modified providers/consumers and registry/inventory rows after impact and detect_changes; `git commit -m "feat(sync): migrate aggregates reads to authorized domain mirrors"`. Stage F complete only after all its Tasks pass; it may be integrated by management independently, never marked full Sprint complete.

### Task 16: 加密 asset manifest 和按需资源（阶段 G）

**Files:** Create `repos/orbits/features/sync/asset-manifest.ts`, `repos/orbits/tests/services/offline-asset-manifest.test.ts`; Create `repos/orbit-app/src/data/sync/asset-manifest.ts`, `encrypted-asset-cache.ts` in that directory; Create `repos/orbit-app/tests/encrypted-asset-cache.test.ts`; Modify `repos/orbit-app/src/api/batch-images.ts`, `repos/orbit-app/src/data/sync/sync-lifecycle.ts`, `repos/orbit-app/scripts/verify-offline-read-native.ts`, shared universal-read contract/schema and generated copies.

**Interfaces:** `AssetManifest={id:string,scope:ReadScope,mediaType:string,byteLength:number,sha256:string,revision:string,policy:BinaryPolicy,status:'not-downloaded'|'partial'|'verified'|'failure'}`; `retainAsset(manifest:AssetManifest,mode:'open'|'pin'):Promise<void>`; `readAsset(manifest:AssetManifest):Promise<Uint8Array|null>`; `purgeDomainAssets(scope:ReadScope):Promise<void>`. Download URL is ephemeral, not an authorization credential stored in the manifest. Bytes use the existing SQLCipher database as a dedicated BLOB cache, bound to the full scope and key reference in SecureStore. Never stage plaintext files outside SQLCipher. This fixes the implementation choice without adding a new cryptography dependency.

- [ ] **RED:** manifest remains readable without bytes; missing bytes does not hide metadata; forged length/hash, truncated stream, wrong epoch/key, disk full and cancelled download cannot become verified. Pin survives process restart; revoke removes bytes and visible manifest; another actor cannot reuse same asset ID.

```ts
assert.equal(await readAsset(manifest), null);
await retainAsset(manifest, 'pin');
assert.deepEqual(await readAsset(manifest), expectedBytes);
await purgeDomainAssets(manifest.scope);
assert.equal(await readAsset(manifest), null);
```

Test declares `manifest:AssetManifest` with scope actor-a/workspace-w/domain-notes/epoch-e1 and SHA256 of `expectedBytes=new Uint8Array([1,2,3])`; inject byte fetch in the cache constructor, corrupt byte 2 in a second test, assert hash failure and no verified row.
- [ ] **RED command:** `(cd repos/orbit-app && node --test --import tsx tests/encrypted-asset-cache.test.ts)`; `(cd repos/orbits && node --test --import tsx tests/services/offline-asset-manifest.test.ts)`; missing cache then plaintext/forged asset assertions fail.
- [ ] **GREEN minimum:** asset metadata is structured domain data, bytes separately in encrypted BLOB cache, incremental bounded download and digest check then atomic verified marker. Per-asset 10MiB fetch cap reuses current client limit; larger assets return visible unsupported/partial, not fake success; pinned download budgets do not reduce structured history completeness. SQLCipher cache transaction ensures failed stream never replaces verified old revision.

```sql
CREATE TABLE encrypted_assets (
 workspace_id TEXT NOT NULL, domain_id TEXT NOT NULL, authorization_epoch TEXT NOT NULL,
 asset_id TEXT NOT NULL, revision TEXT NOT NULL, digest TEXT NOT NULL,
 bytes BLOB NOT NULL, pinned INTEGER NOT NULL CHECK(pinned IN (0,1)),
 PRIMARY KEY(workspace_id,domain_id,authorization_epoch,asset_id)
);
```

- [ ] **GREEN:** both full files plus native restart/at-rest inspection with unique synthetic byte sentinel absent from DB/WAL/untracked cache files. UI consuming originals offers explicit keep-offline and missing asset state; no browser offline claim.
- [ ] **Commit:** exact files; `feat(sync): retain asset manifests and verified encrypted binaries`.

### Task 17: 本地搜索、消费者兜底清理和完整性 UI（阶段 G）

**Files:** Create `repos/orbit-app/src/data/offline-read/local-search.ts`, `read-resource.ts`, `aggregate-generations.ts` in that directory; Create `repos/orbit-app/src/components/OfflineReadStatus.tsx`; Create `repos/orbit-app/tests/offline-read-search.test.ts`, `offline-read-generations.test.ts`, `offline-read-consumers.test.tsx`; Modify `repos/orbit-app/src/hooks/useApiResource.ts`, `useValidatedApiResource.ts`, `useHomeDashboardClient.ts`, `useRelationshipInboxBadgeCount.ts`, `useContactNeeds.ts` in that directory; Modify `repos/orbit-app/src/screens/inbox/useNotificationInbox.ts`, `repos/orbit-app/src/view-models/route-state.ts`, `repos/orbit-app/src/data/snapshot-store.ts`, `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`.

**Interfaces:** `searchLocal(scope:ReadScope,query:string):Promise<{ids:readonly string[],state:ReadCompleteness,canAssertEmpty:boolean}>`; `readLocalResource<T>(scope:ReadScope,path:string):Promise<{data:T|null,state:ReadCompleteness}>`; `activateGeneration(scope:ReadScope,generation:string,dependencyVersions:Readonly<Record<string,string>>):Promise<boolean>` returns false until all pages and dependency versions verified. `OfflineReadStatus({state,lastSyncedAt}:{state:ReadCompleteness,lastSyncedAt:string|null})` renders existing localized product language, no implementation terms.

- [ ] **RED:** incomplete local search with zero matches cannot assert empty; complete scoped search can; epoch switch clears index; app render starts without network and hooks do not fetch directly. Add aggregate generation tests with old members A,B; staged C page fails, A/B retained; after last page replace with C and explicit dependency version map.

```ts
assert.deepEqual(await searchLocal(scope, 'missing'), {ids:[], state:'partial', canAssertEmpty:false});
assert.equal(await activateGeneration(scope,'g2',{notes:'n2',tasks:'t2'}), false);
assert.deepEqual(await selectActiveIds(scope), ['a','b']);
```

`scope` is test-local actor-a/workspace-w/domain-dashboard/epoch-e1; test helper `selectActiveIds(scope:ReadScope):Promise<string[]>` queries active-generation rows in the seeded test database. Task's fixtures seed g1 complete and g2 incomplete using real repository APIs. Search test uses a notes scope, not the dashboard fixture.
- [ ] **RED command:** `(cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-read-search.test.ts tests/offline-read-generations.test.ts tests/offline-read-consumers.test.tsx)`; fail on direct GET rendering, missing partial metadata or premature active-generation switch.
- [ ] **GREEN minimum:** scoped SQLCipher index and deterministic sort ties on entity ID; only manifest complete over searched scope permits empty. Resolve known endpoint to normalized selectors; no unknown fallback GET→durable cache. Compatibility snapshots remain only explicitly classified transient surfaces; all authorized structured durable readers use mirror. No schema or raw JSON casting to bypass DTO checks.

```ts
return { ids, state, canAssertEmpty: ids.length === 0 && (state === 'fresh' || state === 'stale') && manifestComplete };
```

`ids`, `state`, `manifestComplete` come from scoped repository and current manifest. Recompute visible badge/graph aggregates only when dependencies complete; otherwise return prior generation with stale/partial indicator. Show user-readable finite offline lease explanation: current offline access reflects last server validation, cannot promise immediate remote revocation.
- [ ] **GREEN:** three full files plus direct API resource consumers; inventory AST scan outputs unregistered=0 and non-mirror durable readers=0, unknown computed paths fail. Validate loading/detail/subresource/search rendering for every inventory row, not only navigation file presence. Dynamic imports/streams must be accounted explicitly. No full snapshot-table removal until usage is actually zero.
- [ ] **Commit:** exact files; `feat(app): finish mirror-first search and aggregate read consumers`.

### Task 18: 原生、数据库和跨端闭环验收（阶段 G）

**Files:** Create only after execution `repos/orbit-app/docs/sprints/0033-incremental-read-sync/REPORT.md`. No new production feature; native script from Tasks 3/16. Management owns `repos/orbit-app/docs/sprints/README.md`, `bridge/status.md`, `bridge/handoffs.md`, Data Atlas and merge/push; send a handoff instead of editing their files in this line.

**Interfaces consumed:** all registered adapters, `syncDomain`, leased identity, inventory and native harness; outputs fixed commit SHA, per-domain acceptance table and sanitized evidence paths. Evidence directory `build/harness-state/evidence/sprint-0033/run-01/` only if ignored; no credentials/raw private history/screenshots committed. No artificial success report.

- [ ] **Step 1 — Preflight:** management resolves old 0033 run/history, locks shared files and runtime, records exact baseline/Planner SHA256; verify affected domains' PostgreSQL migrations in an isolated DB first, authenticate authorized test actor plus separate actor/role. No production DB inferred from env. Reuse previous approvals and runtime owners, do not take another line's Simulator/Metro.
- [ ] **Step 2 — RED evidence matrix:** for every domain run real authorization/bootstrap/update/physical delete/grant/revoke/cursor reset through its actual source; kill App between pages; offline cold-launch list/detail/children/search/aggregate. Mark absent proof incomplete, never treat skipped domains as pass. Seed >200 AI messages without model calls; saved import records without OCR calls; permission changes using authorized synthetic roles, not real outsiders.
- [ ] **Step 3 — Necessary integration checks:** run once per affected end after all H work is stable:

```sh
(cd repos/orbits && npm run typecheck && npm test && npm run build)
(cd repos/orbit-app && npm run sync:contract && npm run typecheck && npm test)
(cd repos/orbit-app && node --import tsx scripts/audit-offline-read-surfaces.ts)
git diff --check
```

Stop/restart the assigned production Web/API process using new build (record PID/port/health/build SHA), not dev fallback; record active mainline Metro port and App bundle SHA. Rebuild native SQLCipher via `(cd repos/orbit-app && npx expo run:ios)` using allocated Simulator; invoke `scripts/verify-offline-read-native.ts` with runtime configuration to launch seed/restart/assert phases. Native harness itself must fail nonzero when platform/SQLCipher missing, never silently run Node as substitute. Environment failures get bounded diagnosis and preserved logs, not success.
- [ ] **Step 4 — GREEN runtime:** same account Web edits one representative record per business family; App obtains same revision, disconnect and terminate, reopen reads full registered data. Per domain prove source delete and visibility revoke; reconnect ordering is auth→purge revoked projections/assets→0034 upload handoff→delta. Independently inject expired lease, full disk, corrupt asset, schema mismatch, account/baseURL/workspace/epoch change and same-ID cross-account records. Lock/purge must not erase device drafts/outbox on single-domain reset. Snapshot count/HTTP counts demonstrate migrated consumers no longer issue redundant full-list GETs.
- [ ] **Step 5 — Commit report:** after actual results fill five SC with pass/fail/missing evidence, commands/time/exit codes, source and mirror revisions, source/app versions, per-domain inventory coverage, native encryption proof, remaining 0034/35/36 responsibilities. `git add repos/orbit-app/docs/sprints/0033-incremental-read-sync/REPORT.md` then `git commit -m "docs(sync): record universal read acceptance evidence"` after diff and detect_changes. Management audits and merges exact SHA, reruns affected checks on exact merge tree and updates Bridge/Data Atlas; only their authorized push closes remote-SHA evidence. This planning task stops before any implementation.

## 规范覆盖自检与交接接口

| 批准规范 | 对应 Tasks / 证据 |
| --- | --- |
| §1–3 全结构化历史、十三业务族、秘密字段、入口覆盖 | 1, 8–15, 17–18；逐入口 inventory、逐domain授权/投影/历史验证 |
| §4.1 local-read、7日上限、401/403、离线退出 | 2, 18；租期和原生重启/清理失败反例 |
| §4.2 scope/事务迁移/草稿保护 | 3, 18；真实SQLCipher v1→v2断点重跑 |
| §4.3 registry、三类策略、snapshot、默认拒绝 | 1, 4, 6, 8–15；严格 schema 与未知路径拒绝 |
| §4.4 分域manifest/cursor、预算、grant/revoke/delete、代际 | 5–7, 15, 17；真实source事务、并发提交、崩溃原子性 |
| §4.5 完整性、mirror-first、搜索不误报空、写入闸门 | 2, 7–17；列表/详情/子资源/搜索/聚合全部入口 |
| §5/6 分线与0037–0041依赖 | 本文边界、PLANNER；不复制消息通知权威；0041等验收后集成 |
| §7/8 安全及运行 | 2–18；五项 SC；本线不代替0034写入/0035恢复提示/0036 AI验收 |

交接给0034：`ReadScope`, `ReadIdentityState`, `assertOnlineMutation`, `DomainRegistration.mutationPolicy`, journal lock order、domain reset保留outbox规则；不得自行复刻身份或cursor。
交接给0035：`DomainManifest`, `DomainPage`, `syncDomain`, `SyncBudget` 与 auth→purge 的恢复屏障；status传输只给提示，不替代cursor。
交接给0036：逐域inventory、domain/schema/revision/complete信息、独立`aiCapability`声明；本地读取资格绝不授予AI权限，pending/draft不进入云端AI。

本次提交规划时仅做 D 档文档检查：目标/范围一致、文件存在性与新建标签、相对链接、占位词扫描、diff-check、GitNexus detect_changes。这里所有产品 RED/GREEN、原生和跨端步骤均是未来实施要求，不是本轮已运行证据。
