# Sprint 0035 Universal Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 registry 驱动的全域水位和统一恢复队列，在提示丢失、进程重启、断网和权限变化后恢复所有已授权域，并保留 0033 游标及 0034 outbox 语义。

**Architecture:** 独立 status contract 读取各域授权 journal 摘要；HTTP polling 保证正确性，可选 transport 只降低延迟。C 线通过薄 port 绑定 A 线认证、撤权清理和分域 checkpoint，通过 B 线上传 port 调度恢复，永不直接编辑实体、cursor 或 receipt。

**Tech Stack:** TypeScript、Node test/tsx、Zod、Next.js、普通 PostgreSQL、Expo/React Native AppState、SQLCipher（由 0033 管理）、iOS Simulator。

**Spec:** `docs/superpowers/specs/2026-09-16-universal-offline-read-design.zh-CN.md`；SC 唯一来源 `repos/orbit-app/docs/sprints/0035-sync-invalidation-recovery/PLANNER.md`。

## Global Constraints

以下逐字保留批准规范的全局要求：

- “默认行为是拒绝。未知 domain、版本、字段或 authorization epoch 必须显式失败。”
- “每一页记录与其游标必须在同一个本地事务中落盘。”
- “每次生成数据投影和恢复网络后都要重新执行服务端授权。缓存记录不能授予新权限。”
- “`local-read` 不能上传、修改、邀请、发送、报名或触发外部副作用。”
- “正确性不能依赖单一云厂商 SDK。PostgreSQL 兼容 journal 和 HTTP polling 是可移植基线。”
- “每项实现遵守 TDD；修改共享符号前执行 GitNexus impact，提交前执行 detect_changes。”
- “每个通过验收的阶段单独提交。合并前审查，合并到 `chat-agent` 后在精确合并树重新验证，通过后才 push。”

本轮仅规划、commit 四份文档并暂停等管理线审查，不执行下方代码步骤、不 merge/push。上方技能标准 header 不授权额外 Generator；RULES 明确每 Sprint 一个 Generator、无 Evaluator，且不调用已卸载的 brainstorming/executing-plans。后续实施按 RULES 连续执行本计划，不另开评审代理。

---

## 基线、目录与接口交接

规划起点 `2f862c9f84167408df09914acca521f528ae4185`：已有 `src/data/sync/sync-lifecycle.ts`、`src/api/AuthSessionProvider.tsx` 和 `src/components/OrbitNotificationsCoordinator.tsx`，没有服务端 `features/sync` 或新的分域接口。下文 Create 都是计划新增；不存在的 A/B 接口不能被描述为已实现。

文件根简称仅用于命令：Web cwd=`repos/orbits`，App cwd=`repos/orbit-app`。Files 表始终使用仓库根相对完整路径。源 contract/schema 在 Web，App 副本只运行 App `npm run sync:contract` 生成。

实施前先读根 AGENTS、两端 AGENTS、Sprint RULES/README、Bridge status/handoffs、批准规范及 A/B 线交接 REPORT；登记唯一 owner/run-01、Planner SHA256、实际基线。A/B 真实接口由固定验收 SHA 提供。下面的 `RecoveryPorts` 和 `StatusRegistry` 是 C 线拥有的边界类型，不要求 A/B 改成这些名字：仅在 bindings 文件做字段映射，不重新实现鉴权、游标签名、reset、receipt 或锁顺序。若 A/B 缺少能力，登记具体缺项给管理线；纯调度部分可继续，绑定/集成及依赖该接口的提交不能假装就绪。

每个 Task 改已有符号前调用 `gitnexus_impact({target, direction:"upstream", repo:"/Users/xzhao/Projects/orbit"})`，报告 callers/processes/risk；HIGH/CRITICAL 先告知。索引未覆盖时源码补查，零命中不等于低风险。工具提示 stale 才重建索引并保护 AGENTS。每阶段提交前 `git diff --check`、只暂存该 Task 的 Files、`gitnexus_detect_changes({repo:"/Users/xzhao/Projects/orbit",scope:"staged"})`，核对当前 worktree 的真实 staged diff 后 commit；不得把主线索引结果冒充当前 worktree 分析。

## Task 1: Registry status contract、授权适配与 HTTP 边界

**Files:**
- Create: `repos/orbits/shared/contract/sync-invalidation.ts`
- Create: `repos/orbits/shared/api-schema/sync-invalidation.ts`
- Create: `repos/orbits/features/sync/invalidation-status-service.ts`
- Create: `repos/orbits/features/sync/invalidation-status-bindings.ts`
- Create: `repos/orbits/app/api/sync/status/handler.ts`
- Create: `repos/orbits/app/api/sync/status/route.ts`
- Create: `repos/orbits/tests/services/sync-invalidation-status.test.ts`
- Create: `repos/orbits/tests/services/sync-invalidation-postgres.test.ts`
- Create: `repos/orbits/tests/api/sync-status-route.test.ts`
- Generated: `repos/orbit-app/src/api/contract/sync-invalidation.ts`
- Generated: `repos/orbit-app/src/api/schema/sync-invalidation.ts`

**Interfaces:** contract 中定义下面类型，schema 用 strict object、数字版本正整数、水位十进制非负字符串、非空 domain/epoch、ISO serverTime；限制 domains 256 项（超出显式 413，不能静默丢域），重复域拒绝。domainId 不硬编码旧 kind，必须由 A 线 registry 校验。

```ts
export type DomainStamp = {
  domainId: string; schemaVersion: number;
  authorizationEpoch: string; watermark: string;
};
export type InvalidationReason =
  'unchanged' | 'changed' | 'reset-required' | 'not-authorized';
export type SyncInvalidation = {
  registryVersion: number; serverTime: string;
  domains: readonly (DomainStamp & { reason: InvalidationReason })[];
};
export type StatusRequest = {
  registryVersion: number; domains: readonly DomainStamp[];
};
```

`StatusRegistry` 定义在 service，`resolve` 只能由验证后的 request session 返回；调用者不能从 body 构造 scope。每个 adapter 每次重新授权，epoch 不匹配用 reset，未知 epoch 请求拒绝；A 线负责识别旧的有效 epoch 与伪造 epoch。

```ts
export type StatusAdapter = {
  domainId: string;
  summarize(known: DomainStamp | undefined): Promise<
    DomainStamp & { reason: InvalidationReason }
  >;
};
export type StatusRegistry = {
  version: number;
  resolve(): Promise<readonly StatusAdapter[]>;
};
export async function readInvalidationStatus(
  registry: StatusRegistry, request: StatusRequest, now: () => string
): Promise<SyncInvalidation>;
```

- [ ] **Step 1 — RED test:** service 测试导入真实 `readInvalidationStatus`，使用下面完整合成 adapter 验证没有旧 kind 集合限制；补充表驱动 `registryVersion` 错误、重复 domain、未知 domain、伪造 epoch、负数/非十进制/未来水位、100 journal 变化只生成一域摘要。route 测试通过 handler 注入认证 registry，对 actor/workspace/role 额外字段返回 400，未认证 401，另一 actor 无已知授权域时不能获取其水位。

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readInvalidationStatus } from '../../features/sync/invalidation-status-service';
test('registry domain has content-free status', async () => {
  const stamp = {domainId:'fixture.ai-history', schemaVersion:1,
    authorizationEpoch:'epoch-1', watermark:'100'};
  const result = await readInvalidationStatus({version:1, resolve:async () => [{
    domainId:stamp.domainId,
    summarize:async () => ({...stamp, reason:'changed' as const}),
  }]}, {registryVersion:1, domains:[]}, () => '2026-09-16T00:00:00Z');
  assert.deepEqual(result, {registryVersion:1, serverTime:'2026-09-16T00:00:00Z',
    domains:[{...stamp, reason:'changed'}]});
  assert.deepEqual(Object.keys(result.domains[0]).sort(),
    ['authorizationEpoch','domainId','reason','schemaVersion','watermark']);
});
```

- [ ] **Step 2 — run RED:** Web `node --test --import tsx tests/services/sync-invalidation-status.test.ts tests/api/sync-status-route.test.ts`；预期新模块尚不存在，或旧固定 kind 实现不能返回 fixture 域。记录实际失败；不得把环境加载错误当成行为 RED，建立模块后再次确认断言失败。
- [ ] **Step 3 — GREEN minimum:** schema 先验证请求；registry.resolve 认证后取得允许及必须撤权清理的域；reject 未登记请求项；逐域调用已授权 adapter.summarize，只 pick 五个字段并以 response schema 再验证。bindings 从 A 线已验收 registry 构造 adapter，使用每源 journal，不查询固定 collection 列表。核心映射如下：

```ts
const adapters = await registry.resolve();
if (request.registryVersion !== registry.version) throw Error('REGISTRY_RESET_REQUIRED');
const known = new Map(request.domains.map(d => [d.domainId, d]));
if (known.size !== request.domains.length) throw Error('DUPLICATE_DOMAIN');
const allowed = new Set(adapters.map(d => d.domainId));
if ([...known.keys()].some(id => !allowed.has(id))) throw Error('UNKNOWN_DOMAIN');
const domains = await Promise.all(adapters.map(async adapter => {
  const row = await adapter.summarize(known.get(adapter.domainId));
  return {domainId:adapter.domainId, schemaVersion:row.schemaVersion,
    authorizationEpoch:row.authorizationEpoch, watermark:row.watermark, reason:row.reason};
}));
return {registryVersion:registry.version, serverTime:now(), domains};
```

handler 导出 `createSyncStatusHandler(resolve: (request:Request)=>Promise<StatusRegistry>): (request:Request)=>Promise<Response>`；限制 body 64 KiB、schema 256 域；400 invalid、401 auth、403 revoked、409 manifest refresh、413 limit、503 source error，错误不含原始 exception。route 导出 `dynamic='force-dynamic'` 和 POST，使用 production bindings；成功 body 走现有 API envelope helper，`private, no-store`。不新增 ETag 或客户端授权参数。
- [ ] **Step 4 — GREEN/conformance:** 运行 Step 2；Web `node --test --import tsx tests/services/sync-invalidation-postgres.test.ts` 在隔离普通 PostgreSQL、真实 A 线 registry/journal 上逐域验证 upsert、100 变化、水位无变化、物理 delete、grant 历史补发、无实体变更的 revoke、retention reset、双 actor/角色隔离。仅使用合成 fixture 和已授权测试库；没有数据库必须失败或记未验，不 skip 成 PASS。App `npm run sync:contract`，再 `node --test --import tsx tests/contract-sync.test.ts tests/api-schema-sync.test.ts`。两端 typecheck 在操作链收口各一次。
- [ ] **Step 5 — commit:** 仅 stage 此 Task 精确 Files，执行共同 precommit 后 `git commit -m "feat(sync): expose registry-driven invalidation status"`；注明集成待验。A 线绑定未就绪不能将 mock conformance 作为此阶段交付。

## Task 2: Polling、可选 transport 与无丢失的单飞合并

**Files:**
- Create: `repos/orbit-app/src/data/sync/invalidation-transport.ts`
- Create: `repos/orbit-app/src/data/sync/polling-invalidation-transport.ts`
- Create: `repos/orbit-app/src/data/sync/sync-trigger-coordinator.ts`
- Create: `repos/orbit-app/tests/polling-invalidation-transport.test.ts`
- Create: `repos/orbit-app/tests/sync-trigger-coordinator.test.ts`

**Interfaces:** `DomainStamp`/`SyncInvalidation` 消费 Task 1 生成副本。可选 hint 必须先用 schema 校验，再校验当前 manifest 的 domain/schema/epoch；不接受任意 payload。`generation` 仅是本进程捕获值，不在网络中相信 transport 提供的账号身份。

```ts
export type Trigger = 'launch'|'foreground'|'network'|'manual'|'notification'|'hint'|'poll';
export type Clock = {
  now(): number; random(): number;
  set(fn:()=>void, ms:number): unknown; clear(handle:unknown): void;
};
export interface InvalidationTransport {
  start(input: { signal:AbortSignal; onHint:(value:unknown)=>void;
    onError:(code:'network'|'auth'|'invalid')=>void }): Promise<()=>void>;
}
export type TriggerCoordinator = {
  request(reason:Trigger, domains:readonly string[]): Promise<void>;
  hint(value:unknown): void; dispose(): void;
};
export function createTriggerCoordinator(input: {
  clock:Clock; validate:(value:unknown)=>SyncInvalidation;
  run:(domains:readonly string[], reason:Trigger, signal:AbortSignal)=>Promise<void>;
}): TriggerCoordinator;
export function createPollingTransport(input: {
  clock:Clock; intervalMs:5000|15000;
  read:(signal:AbortSignal)=>Promise<SyncInvalidation>;
}): InvalidationTransport;
```

- [ ] **Step 1 — RED:** 用 Node mock timers 控制 `setTimeout`，注入 Clock，测试 immediate poll、15s interval、5s configured interval、pending HTTP 时零重叠、abort 后零回调、失败仍轮询、optional auth error 后 HTTP 继续。coordinator 最关键竞态先写：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTriggerCoordinator} from '../src/data/sync/sync-trigger-coordinator';
test('a hint during a run survives its completion', async () => {
  let release!:()=>void;
  const gate = new Promise<void>(resolve => {release=resolve;});
  const calls:string[][]=[];
  const coordinator=createTriggerCoordinator({
    clock:{now:()=>0, random:()=>0.5,
      set:(fn,ms)=>setTimeout(fn,ms), clear:h=>clearTimeout(h as ReturnType<typeof setTimeout>)},
    validate:()=>{throw Error('unused');},
    run:async ids=>{calls.push([...ids]); if(calls.length===1) await gate;},
  });
  const first=coordinator.request('manual',['fixture.messages']);
  const second=coordinator.request('hint',['fixture.notifications']);
  release(); await Promise.all([first,second]);
  assert.deepEqual(calls,[['fixture.messages'],['fixture.notifications']]);
  coordinator.dispose();
});
```

追加 100 hints/250ms 只一次 run、重复同水位零额外 run、乱序 10→9 不回退（用 BigInt 比较，不用字符串排序或 JS number）、运行中 100 hints 只一轮 rerun、rerun 中的新变化仍有下一轮、run reject 不清 dirty、manual 越过退避且 active 最大 1。
- [ ] **Step 2 — run RED:** App `node --test --import tsx tests/polling-invalidation-transport.test.ts tests/sync-trigger-coordinator.test.ts`；预期缺 factory 或竞态 calls 第二项缺失。
- [ ] **Step 3 — GREEN minimum:** polling 以 completion 后 timer 触发下一请求（无重叠；响应耗时单独记录），dispose abort+clear timer。核心不能在 await 后清空全局 dirty；使用快照：

```ts
const batch = new Set(dirty);
dirty.clear();
try { await input.run([...batch], reason, abort.signal); }
catch (error) {
  for (const id of batch) dirty.add(id);
  throw error;
}
// runner 的 finally 释放 single-flight；dirty 非空则调度一轮，绝不递归并发。
```

所有 promise waiter 在对应恢复成功后 resolve、失败 reject、dispose AbortError；恢复 failures 和 dirty 均保留。hint 只与同 epoch 已接受水位比较；不同 epoch 触发认证 manifest refresh，不用跨 epoch 大小比较。未知域/version 记录 invalid 并走认证刷新，不能进入实体同步。optional start 失败由调用方捕获，polling 不停止。
- [ ] **Step 4 — GREEN:** 重跑两个完整文件，检查并发计数与无变化零 delta。full-jitter `delay=random()*[1000,2000,4000,8000,30000][Math.min(attempt,4)]`，random 注入 0/0.5/1 边界，成功清 attempt；失败不是无限快速重试。
- [ ] **Step 5 — commit:** stage 此 Task Files，共同 precommit 后 `git commit -m "feat(sync): coalesce registry hints with portable polling"`。

## Task 3: 鉴权、撤权、上传、分域恢复及 reset 的安全顺序

**Files:**
- Create: `repos/orbit-app/src/data/sync/recovery-ports.ts`
- Create: `repos/orbit-app/src/data/sync/recover-domains.ts`
- Create: `repos/orbit-app/src/data/sync/recovery-bindings.ts`
- Create: `repos/orbit-app/tests/recover-domains.test.ts`
- Create: `repos/orbit-app/tests/recovery-bindings.test.ts`

**Interfaces:** 定义于 recovery-ports，所有 opaque cursor 留在 A 线内部。这里只传 domain 和预算，永不保存 hint 水位到 cursor。

```ts
export type RecoveryScope = {
  baseUrl:string; actorId:string; workspaceId:string; generation:number;
};
export type PageBudget = {maxPages:number; maxBytes:number; maxMs:number};
export type DomainAccess = {
  domainId:string; schemaVersion:number; authorizationEpoch:string;
  priority:'normal'|'high'; resetRequired:boolean;
};
export type Authorization =
  | {state:'online'; domains:readonly DomainAccess[]; revoked:readonly string[]}
  | {state:'local-read'|'locked'|'revoked'};
export interface RecoveryPorts {
  authorize(signal:AbortSignal):Promise<Authorization>;
  clearRevoked(domains:readonly string[], signal:AbortSignal):Promise<void>;
  revokeAccount(signal:AbortSignal):Promise<void>;
  upload(signal:AbortSignal):Promise<{state:'settled'|'retry'|'auth-failed'}>;
  reset(domain:DomainAccess, signal:AbortSignal):Promise<void>;
  pullPage(domain:DomainAccess, budget:PageBudget, signal:AbortSignal):Promise<{
    state:'complete'|'partial'|'reset-required'|'not-authorized'; bytes:number;
  }>;
}
export type RecoveryResult = {state:'complete'|'partial'|'blocked';
  domains:Record<string,'complete'|'partial'|'not-authorized'|'failure'>};
export async function recoverDomains(input:{ports:RecoveryPorts;
  requested:readonly string[]; signal:AbortSignal;
  budget:PageBudget; now:()=>number}):Promise<RecoveryResult>;
```

`requested=[]` 意味认证 manifest 全域；已失效版本、角色新增域及 partial 域也由认证 manifest/绑定读出的 checkpoint 加入本轮。upload 遵循 B 线每实体 FIFO/冲突隔离；settled 可含保留的实体 conflict，retry 可以拉取但最终结果 partial，auth-failed 必须停止后续拉取并重新鉴权。局部拒权不能被包装成账号 revoked。

- [ ] **Step 1 — RED test:** 按下例验证最小恢复顺序；另注入 clearRevoked throw，断言 upload/pull 从未调用；local-read/locked 不上传；revoked 调 revokeAccount。用真实 A/B binding fixture 覆盖 epoch reset 仅目标域、其他域行保持、draft/outbox/conflict 不变。

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverDomains} from '../src/data/sync/recover-domains';
test('authorization and revocation cleanup precede writes', async () => {
  const events:string[]=[];
  const domain={domainId:'fixture.messages',schemaVersion:1,
    authorizationEpoch:'new',priority:'high' as const,resetRequired:true};
  const result=await recoverDomains({requested:[],signal:new AbortController().signal,
    now:()=>0,budget:{maxPages:2,maxBytes:1024,maxMs:1000},ports:{
      authorize:async()=>{events.push('auth');return {state:'online',domains:[domain],revoked:['fixture.ops']};},
      clearRevoked:async()=>{events.push('clear');},
      revokeAccount:async()=>{events.push('revoke');},
      upload:async()=>{events.push('upload');return {state:'settled'};},
      reset:async()=>{events.push('reset');},
      pullPage:async()=>{events.push('pull');return {state:'complete',bytes:10};},
    }});
  assert.deepEqual(events,['auth','clear','upload','reset','pull']);
  assert.equal(result.state,'complete');
});
```

- [ ] **Step 2 — run RED:** App `node --test --import tsx tests/recover-domains.test.ts tests/recovery-bindings.test.ts`；预期未导出 recoverDomains 或 upload-before-clear 顺序断言失败。
- [ ] **Step 3 — GREEN minimum:** 顺序固定，await 前后检查 signal；port 也绑定 scope generation，在持久化前再次拒绝过期操作。不能只在 React cleanup 阻止 setState。

```ts
input.signal.throwIfAborted();
const auth=await input.ports.authorize(input.signal);
input.signal.throwIfAborted();
if(auth.state==='revoked') await input.ports.revokeAccount(input.signal);
if(auth.state!=='online') return {state:'blocked',domains:{}};
await input.ports.clearRevoked(auth.revoked,input.signal);
input.signal.throwIfAborted();
const upload=await input.ports.upload(input.signal);
if(upload.state==='auth-failed') return {state:'blocked',domains:{}};
// 之后逐域 reset/pullPage；本轮至多每域一次 reset，重复 reset-required 留 failure，防止无限 bootstrap。
```

bindings 导出 `createRecoveryPorts(scope:RecoveryScope):RecoveryPorts`，只消费 A/B 验收接口，normalize URL/actor 使用 A 线工具，所有 generation/epoch 检查交给其 scope 边界。domain reset 保留 outbox/conflict；全账户 revoke 才交由 A 线擦除密钥。收到 not-authorized 立即 clearRevoked 该域，独立域继续。
- [ ] **Step 4 — GREEN:** 重跑两个完整文件，加 A/B 交接声明的真实存储和上传定向集。必须测试中途角色撤销、upload 后 pull 前 abort、A→B→A 切换旧 promise、Base URL/workspace 改变、清理失败及网络认证失败。没有 A/B 真实绑定证据不得宣称该 Task 完成。
- [ ] **Step 5 — commit:** stage 此 Task Files，共同 precommit 后 `git commit -m "feat(sync): recover domains behind authorization and upload barriers"`。

## Task 4: AppState、联网、手动刷新与通知入口接线

**Files:**
- Create: `repos/orbit-app/src/data/sync/recovery-events.ts`
- Create: `repos/orbit-app/src/data/sync/recovery-lifecycle.ts`
- Create: `repos/orbit-app/src/components/OrbitSyncCoordinator.tsx`
- Modify: `repos/orbit-app/app/_layout.tsx` — AuthSessionProvider 内与现有通知协调器相邻处挂载
- Modify: `repos/orbit-app/src/components/OrbitNotificationsCoordinator.tsx` — openNotification 的 guard 成功后触发恢复
- Create: `repos/orbit-app/tests/orbit-sync-lifecycle.test.tsx`
- Create: `repos/orbit-app/tests/recovery-events.test.ts`

**Interfaces:** `recovery-events.ts` 导出 `requestRecovery(reason:Trigger, domains?:readonly string[]):Promise<void>` 和 `bindRecovery(handler:(reason:Trigger,domains:readonly string[])=>Promise<void>):()=>void`；未绑定返回显式 `RECOVERY_UNAVAILABLE`，不能静默成功。lifecycle 导出 `bindRecoveryLifecycle(input:{coordinator:TriggerCoordinator; subscribeAppState:(fn:(state:'active'|'background'|'inactive')=>void)=>()=>void; subscribeNetwork:(fn:(online:boolean)=>void)=>()=>void; now:()=>number; checkFreshness:()=>Promise<void>}):()=>void`。网络 signal 消费 A 线已有恢复网络通知；若没有订阅源，采用认证 HTTP polling 的失败→成功转换，不能因没有 native SDK 而缺失网络恢复路径。

- [ ] **Step 1 — RED test:** recovery-events 先写行为测试：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {bindRecovery,requestRecovery} from '../src/data/sync/recovery-events';
test('manual refresh awaits the shared coordinator', async () => {
  const calls:unknown[]=[];
  const unbind=bindRecovery(async(reason,domains)=>{calls.push([reason,domains]);});
  await requestRecovery('manual',['fixture.ai-history']);
  assert.deepEqual(calls,[['manual',['fixture.ai-history']]]);
  unbind();
  await assert.rejects(requestRecovery('manual'),/RECOVERY_UNAVAILABLE/);
});
```

生命周期测试通过注入订阅回调和 fake now 断言 launch 一次、59s 调 freshness、61s 调 foreground、background 停 polling、网络恢复顺序由 Task 3、notification 仅一次 request；正常/冷启动 getLastNotificationResponseAsync 均触发。注册前事件使用恢复启动检查兜底，不存通知 payload。render 测试用既有 `tests/helpers/render.tsx`，原生订阅不可 SSR 的部分测注入 ports，说明原因。
- [ ] **Step 2 — run RED:** App `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/orbit-sync-lifecycle.test.tsx tests/recovery-events.test.ts`；预期缺入口或前后台事件不触发 coordinator。
- [ ] **Step 3 — GREEN minimum:** Provider 内创建一个实例，当前 scope 变化先 dispose 旧实例并 abort，再 bind 新实例；AppState 与网络订阅 cleanup 一起注销。notification 只加下面调用，保留已有 responseGuard、deliveryId/inbox 和 allowlisted href，不改 0040 投递权威或服务器 ack：

```ts
void requestRecovery('notification').catch(() => {
  console.warn('SYNC_NOTIFICATION_RECOVERY_FAILED');
});
```

manual refresh 使用 A 线统一 refresh 绑定到 `requestRecovery('manual', domains)`，在 `recovery-bindings.ts` 做薄注册，不逐页新增网络 fetch；若 A 线没有该消费者入口，绑定 Task 不能过关，管理线协调其拥有者补接口。status polling 在 local-read 联网探测成功后必须先走 authorize，不能直接调用 uploader。web 平台不挂 native coordinator。
- [ ] **Step 4 — GREEN:** 重跑上述完整测试，另 App `node --test --import tsx tests/notifications/delivery-navigation.test.ts tests/notifications/notification-registration-races.test.ts tests/sync-lifecycle.test.ts`。覆盖通知 guard 重复、未知 deepLink、未授权目标、登出异步 lastResponse、StrictMode mount/unmount、A→B→A 旧 callback。App typecheck 一次。
- [ ] **Step 5 — commit:** stage 此 Task Files（若 Task 3 bindings 的 refresh 注册有实际改动一并明确 stage），共同 precommit 后 `git commit -m "feat(sync): connect app lifecycle and notification recovery"`。

## Task 5: 大历史分页公平性、有界预算和脱敏观测

**Files:**
- Create: `repos/orbit-app/src/data/sync/recovery-budget.ts`
- Create: `repos/orbit-app/src/data/sync/sync-observability.ts`
- Modify: `repos/orbit-app/src/data/sync/recover-domains.ts` — 轮转分页循环
- Modify: `repos/orbit-app/src/data/sync/recovery-bindings.ts` — A 线预算/电量/磁盘/后台许可映射
- Create: `repos/orbit-app/tests/recovery-budget.test.ts`
- Create: `repos/orbit-app/tests/sync-observability.test.ts`
- Modify: `repos/orbit-app/tests/recover-domains.test.ts` — 多轮 partial/resume

**Interfaces:** `createRecoveryBudget(limit:PageBudget, now:()=>number)` 返回 `{canStart():boolean; commit(bytes:number):void; remaining():PageBudget}`；生产 limit 取 A 线限制与 OS 剩余时间的最小值，不硬编码更大额度。电量/磁盘拒绝作为 port 的预算停止，不当作 complete。`recordSyncObservation(value:unknown):void` 只接受下面严格 schema，非法字段拒绝：

```ts
export type SyncObservation = {
  transport:'http'|'optional'; reason:'poll'|'recovery'|'retry';
  elapsedMs:number; pages:number; bytes:number; retries:number;
  outcome:'complete'|'partial'|'failure'|'auth'|'budget';
};
```

- [ ] **Step 1 — RED:** budget 测试每页承诺一次而非估算全历史，把大页/时间/页数任一边界击穿后停止；AI 100 页、消息 1 页时首先消息随后 AI，每域每轮一页，不反复重取第一页；第二轮从真实 A 线持久 checkpoint 继续。先写基础断言：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryBudget} from '../src/data/sync/recovery-budget';
test('byte and page limits stop continuation', () => {
  const b=createRecoveryBudget({maxPages:2,maxBytes:100,maxMs:1000},()=>0);
  assert.equal(b.canStart(),true);
  b.commit(60); assert.equal(b.canStart(),true);
  b.commit(40); assert.equal(b.canStart(),false);
  assert.deepEqual(b.remaining(),{maxPages:0,maxBytes:0,maxMs:1000});
});
```

observability 测试向 recordSyncObservation 输入完整合法对象加 `token`、`body`、`actorId`、`cursor`、`authorizationEpoch`、`url` 各字段时抛 `INVALID_OBSERVATION`，合法 0 值保留；不打印非法原输入。使用真实 journal/分页保存验证 AI 跨三次 foreground 续传，不能只测 mock 返回 complete。
- [ ] **Step 2 — run RED:** App `node --test --import tsx tests/recovery-budget.test.ts tests/sync-observability.test.ts tests/recover-domains.test.ts`；预期缺 budget 模块或旧循环在 AI 上耗尽全部预算而消息没更新。
- [ ] **Step 3 — GREEN minimum:** 校验预算正整数和 bytes 非负；保存 start time、remaining pages/bytes；每次 pullPage 的 budget 传剩余额度，A 线确保响应不超过 byte bound。每轮 stable sort high-first，再 round-robin；结果 partial 推到队尾，complete 移除；失败标该域 failure 并继续下一域。

```ts
while(queue.length && budget.canStart() && !signal.aborted) {
  const domain=queue.shift()!;
  const page=await ports.pullPage(domain,budget.remaining(),signal);
  budget.commit(page.bytes);
  states[domain.domainId]=page.state==='complete'?'complete':'partial';
  if(page.state==='partial') queue.push(domain);
  // reset-required 和 not-authorized 使用 Task 3 的有界 reset／清理分支；不推进本地 cursor。
}
```

catch 分支按域记录失败，AbortError 结束全轮，认证失效立即停止；循环结束有 queue 则 partial。后台失去运行许可就 abort 下一页，已提交页保持；强杀后 Task 4 launch 从 0033 checkpoint 恢复。摘要提示水位永不被当作已同步水位。
- [ ] **Step 4 — GREEN:** 运行完整三个文件及 Task 2 coalescer 文件；验证五类停止原因（页、字节、时间、电量、磁盘），resume 不重下已完成页、聚合 freshness 不假装全局原子、partial 搜索不显示完整空结果（消费 0033 状态，不改页面规则）。比较相同 0031 场景请求数与 p95，超过 10% 必须调查，不能删除失败样本。
- [ ] **Step 5 — commit:** stage 此 Task Files，共同 precommit 后 `git commit -m "feat(sync): budget fair domain recovery and redact telemetry"`。

## Task 6: 本地集成、真实恢复与交接

**Files:**
- Create only after execution: `repos/orbit-app/docs/sprints/0035-sync-invalidation-recovery/REPORT.md`
- Evidence only (ignored): `build/harness-state/evidence/sprint-0035/run-01/`
- 管理线收到内容后更新 `repos/orbit-app/docs/sprints/README.md`、`bridge/status.md`、`bridge/handoffs.md`；C 线不写根台账。

**Interfaces:** 输入 Tasks 1–5 固定功能 SHA、A/B 固定 SHA、SC 表；输出 REPORT 中每项 SC 的命令/时间/退出码/脱敏同记录证据、限制和固定 SHA。不生成第二套可变验收标准。

- [ ] **Step 1 — 收口自动化：** H/I 档两端各 `npm test`、`npm run typecheck` 一次；App contract/schema 同步检查。Web `npm run build`，App `npm run ios -- --no-bundler`；保存实际失败，按 RULES 定向修复，不循环全量。没有真实加密数据库/原生证据时，Node sqlite 测试不等于 SQLCipher 验收。
- [ ] **Step 2 — 版本确认：** 获得协调者环境锁后停止旧 Web，启动新 production 产物；Web/App 指向同一数据库和授权合成账号，记录 API 地址、App bundle、Metro 地址、健康检查、两端 SHA。服务管理命令使用当前环境已有启动方式，不抢占其他线端口或 Simulator。无具体环境只阻塞此步骤，不篡改真实验收标准。
- [ ] **Step 3 — 高频与漏提示：** 禁用所有 optional transport，以 registry 实际消息/通知域及其余每业务族代表记录进行 Web 新增/修改/物理删除/撤权。验证下一默认 15s 检查发现，消息配置 5s 时提前检查；记录网络时间和实际到屏延迟。100 changes 一次摘要，100 hints/250ms 一次恢复，in-flight 新变化有 rerun；无变更周期零 delta。已有记录用 App 支持的操作写回 Web，核对实际 receipt，不使用 hint 冒充完成。
- [ ] **Step 4 — 生命周期与大数据：** 后台 59s/61s、断网、杀进程分别制造变更/删除再恢复；逐一通过 launch、foreground、manual、通知点击恢复，不以其中一项代替其他。AI 历史跨三轮预算，第一轮 partial、第二轮继续原 checkpoint、最后 complete，消息不饿死；binary 未下载仍按 0033 metadata-only 状态。iOS 无后台时间时测试 foreground 恢复，不能声明真实后台实时同步。
- [ ] **Step 5 — 安全反例：** 执行授权合成角色撤销，验证重新鉴权/资源清理在上传前；domain reset 仅清目标投影/索引/资源，保留 drafts/outbox/conflict。双账号、Base URL、workspace、epoch 切换并延迟旧 HTTP/transport callback，确认新账号无旧数据。auth 401/403 全局撤租、域 403 单域清理、清理失败锁住；任何泄漏硬失败。真实 push 环境缺失只记录 optional adapter 未验，不宣称 0040 关闭。
- [ ] **Step 6 — 报告与 commit：** 按 SC-01～05 列证据与未验；记本地 PostgreSQL provider、optional 配置、无 SDK conformance、性能对比、费用累计和回退方式。`git add repos/orbit-app/docs/sprints/0035-sync-invalidation-recovery/REPORT.md`，共同 precommit 后 `git commit -m "docs(sprint-0035): record universal recovery evidence"`。给管理线固定功能/报告 SHA、A/B 依赖、文件清单、工作树状态；管理线审查合并并验证精确合并树后才能标 completed，本线不自行 merge/push。

## 自审映射与当前验证边界

- 规范 5/0035 的 registry watermark、HTTP、optional、八种触发、高频域、AI 大历史、乱序/补跑分别由 Tasks 1、2、3/4、2、5、2 覆盖。
- 规范 4/7 的授权、epoch、单域清理、local-read 写入限制、scope 隔离由 Tasks 1、3、4、6 覆盖；不改 A/B 语义。
- SC 映射只引用 Planner 五项，不因缺环境删减；实现阶段每个 Task 有 RED/GREEN、精确文件、接口与 commit。
- 当前交付只证明规划文件完整性与 Git 检查；上面所有测试代码/命令为未来执行步骤，不是已经通过的报告。

规划检查记录：四份文档的七个相对链接均可解析，既有 schema 测试为 `tests/api-schema-sync.test.ts`。GitNexus 固定仓库路径解析到主线，当前 8fe9 worktree 未登记，直接指定当前路径返回 repository not found；因此主线工具结果不能证明本线影响范围。规划提交以当前 worktree 的 staged 文件清单补充核对，仅四份 Markdown，无生产符号修改；实施时必须让分析工具指向实际执行树。
