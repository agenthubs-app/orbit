# Sprint 0036 AI Coverage and Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个已授权 AI 数据域提供安全、可追溯的云端读取，显示本机待同步盲区，并完成全域跨端验收与私有 Data Atlas。

**Architecture:** 独立 AI 权限 registry 驱动领域查询适配器；服务器认证注入 scope，领域服务负责资源权限，provider 出站边界再次校验白名单和授权。App 只消费 0034 的内容无关同步摘要；0033～0035 的固定合并树提供离线及恢复证据，不由 AI manifest 授予客户端权限。

**Tech Stack:** TypeScript/Zod、Node test + tsx、Next.js production API、现有 PostgreSQL 领域服务、Expo/SQLCipher、iOS Simulator、现有 AI provider、Sites 私有站点。

**Spec:** `docs/superpowers/specs/2026-09-16-universal-offline-read-design.zh-CN.md`（英文同目录）；本线契约 `repos/orbit-app/docs/sprints/0036-ai-sync-visibility-acceptance/PLANNER.md`。

## Global Constraints

以下规范原句适用于每项任务：

- “本地离线注册表与 AI 可见性清单是两套独立规则。能够离线读取，不代表 AI 自动获得读取权限；AI 获得某个函数，也不代表客户端自动获得对应数据权限。”
- “服务端 AI 只读取云端权威记录。本地 pending change 和设备草稿不发送给 AI。App 要按领域和数量向用户说明哪些本地变化尚未被 AI 看见。”
- “默认行为是拒绝。未知 domain、版本、字段或 authorization epoch 必须显式失败。”
- “每次生成数据投影和恢复网络后都要重新执行服务端授权。缓存记录不能授予新权限。”
- “不完整数据不能产生误导性的‘空’或‘全部完成’结果。”
- “每项实现遵守 TDD；修改共享符号前执行 GitNexus impact，提交前执行 detect_changes。”
- “每个通过验收的阶段单独提交。合并前审查，合并到 `chat-agent` 后在精确合并树重新验证，通过后才 push。”
- 本轮仅规划：只修改 GOAL、DESIGN、PLANNER 和本计划四文件，提交后等待管理线审查，不启动 Generator、不写生产代码、不创建完成报告、不 merge/push。
- 上方技能标准 header 不覆盖 Sprint RULES：实现仍为同一 Generator，禁止额外 Evaluator/评审代理/第二实现者；用户已要求不调用 executing-plans。管理线完成审查并下发执行后，按本计划逐项执行。
- 实现阶段服务端用 `repos/orbits` cwd，App 用 `repos/orbit-app` cwd，根文档/Git/Bridge 由管理线串行处理；路径表中的前缀以根目录为基准。
- H/I 风险：每项先目标 RED→GREEN 和直接消费者；本地代码收口一次受影响端全量，即使外部验收受阻也执行；合并树复验由管理线负责。没有批准的基线失败例外不得越过门槛。
- 沿用 RULES 的累计 AI/OCR $5 上限、已记 $0.012780 与最新账本/未结算预留；不能按本 Sprint 重置。每个意外失败至多两次本地修复，同一假设至多三次只读诊断。

---

## 基线、顺序和文件责任

基线 `2f862c9f84167408df09914acca521f528ae4185`；规划分支 `codex/sprint-0036-ai-coverage-plan`。旧四域 query/service、manifest、registry、artifact 已存在；新适配器路径以下均明确标为 Create。不把计划中的新接口当成现有源码事实。

实现前管理线登记 run-01、Planner SHA256、owner/文件锁和实际执行基线。Task 1～5 不依赖本地同步，可独立推进；Task 6 等待 0033/0034 的 scope/outbox 契约；Task 7～8 在 0033～0035 和相关领域源固定 SHA 合入且通过验收后收口。不得以“依赖未合入”为由阻塞独立服务端任务，也不得用 stub 代替真实适配器通过最终 SC。

| 单元 | 路径/责任 |
| --- | --- |
| AI 合同与权限 | 新 `repos/orbits/features/orbit-ai/data-query/read-contract.ts`、`permission-registry.ts`：仅 AI scope、allowlist、授权函数与域映射 |
| 分页与结果 | 新同目录 `query-cursor.ts`、`query-result.ts`：签名分页、大小/完整性、新鲜度、证据 |
| 原有四域 | 改同目录 `query-service.ts`、`query-schema.ts`、`query-artifact-service.ts`，新增 `adapters/personal.ts`；保留四工具兼容入口 |
| 新域读适配器 | 新同目录 `adapters/ai-history.ts`、`contacts.ts`、`relationship-evidence.ts`、`messages.ts`、`notifications.ts`、`meetings.ts`、`events.ts`、`goals.ts`、`agent-data.ts`、`adapter-registry.ts` |
| 执行与出站 | 改 `features/orbit-ai/agent-tools/registry.ts`、`data-visibility/manifest.ts`、`gemini-provider.ts`、`live-agent-runtime.ts`、`service-factory.ts`；新 `data-visibility/provider-read-boundary.ts` |
| 枚举/输出形状 | 改 `features/agent/capabilities/contract.ts`、`registry.ts`、`features/orbit-ai/artifact-contract.ts`；若影响响应，改 `shared/contract/orbit-ai.ts` 并新建 `shared/api-schema/orbit-ai.ts` 后运行既有 contract sync |
| App 仅消费 | 新 `src/data/sync/ai-sync-visibility.ts`、`src/hooks/useAiSyncVisibility.ts`、`src/components/ai/AiSyncNotice.tsx`；改两个 AI screen 和四个 locale 文件，不改 0033 schema/0034 receipt/0035 调度 |
| 审查与验收 | 新 `repos/orbits/scripts/build-sync-ai-coverage.ts`；根 audit JSON/README、本 Sprint REPORT 和 Bridge 交接由管理线登记；实际日志保留忽略的 build 目录 |

所有 Web 路径在表中省略 `repos/orbits/` 的位置均使用此前缀；App 的 `src/` 使用 `repos/orbit-app/`。每项 Files 块给出完整根相对路径。修改既有符号前用 `npx gitnexus impact <symbol> --direction upstream --repo /Users/xzhao/Projects/orbit`，报告 direct callers/processes/risk，HIGH/CRITICAL 先告知；未收录不等于零影响。本文仅改 Markdown，无生产符号变更。

## 固定接口与覆盖矩阵

以下是 Task 1 新建 `read-contract.ts` 的公共接口；后续任务不得各自定义不同版本。

```ts
export type AiReadDomain = 'notes'|'tasks'|'followups'|'schedule'|'aiHistory'|
  'contacts'|'relationshipEvidence'|'messages'|'notifications'|'meetings'|
  'events'|'goals'|'agentData';
export type AiReadTool = `${AiReadDomain}.query`;
export interface ReadScope { actorId:string; workspaceId:string; authorizationEpoch:string }
export interface ReadInput {
  operation:'list'|'search'|'get'; query:string; id?:string; cursor?:string;
  limit?:number; contactId?:string; eventId?:string; status?:string;
  from?:string; to?:string;
}
export interface CanonicalRow {
  id:string; revision:string; updatedAt:string;
  fields:Readonly<Record<string,unknown>>; evidenceIds:readonly string[];
}
export interface ReadPage {
  rows:readonly CanonicalRow[]; nextPosition?:string; snapshot:string;
  partialReasons:readonly ('text_limit'|'byte_limit'|'source_unavailable'|'known_stale')[];
}
export interface ReadAdapter {
  authorize(scope:ReadScope):Promise<boolean>;
  page(scope:ReadScope,input:ReadInput,position?:string,snapshot?:string):Promise<ReadPage>;
  authorizeEvidence(scope:ReadScope,ids:readonly string[]):Promise<readonly string[]>;
}
export interface AiReadResult {
  domain:AiReadDomain; operation:ReadInput['operation'];
  items:readonly Readonly<Record<string,unknown>>[];
  authority:'cloud_canonical'; readAt:string;
  records:readonly {id:string;revision:string;updatedAt:string;evidenceIds:readonly string[]}[];
  truncated:boolean; nextCursor?:string; partialReasons:readonly string[];
  evidenceIds:readonly string[];
}
export interface AiReadPermission {
  tool:AiReadTool; domain:AiReadDomain; schemaVersion:1;
  fields:readonly string[]; maxItems:10; enabled(scope:ReadScope):Promise<boolean>;
}
export interface ReadDependencies {
  permission(tool:AiReadTool):AiReadPermission;
  adapter(tool:AiReadTool):ReadAdapter;
  currentScope():Promise<ReadScope>;
  cursorKey:Uint8Array; now():string;
}
```

共享 item 元数据仅 `id/revision/updatedAt/evidenceIds`；fields 是下表的白名单，逐字段校验类型，嵌套 evidence 不复制任意对象。所有工具 list/search 返回摘要，get 返回经用户当前请求或本轮授权 evidence 确认的详情。cursor/工具调用次数受既有 runtime budget 限制，不自动循环拉完整历史。

| 工具 | 领域源（只读，沿现有 factory/auth） | fields 白名单（共用元数据另列） |
| --- | --- | --- |
| notes.query | `features/notes/note-record.ts` | title,snippet,body,bodyTruncated,contactIds,eventIds,createdAt |
| tasks.query | `features/tasks/task-record.ts` | title,description,status,category,dueAt,contactId,eventId,scheduleId,source,createdAt |
| followups.query | 同上已确认 task + actor connections/evidence | title,status,contactId,connectionId,dueAt,source,evidenceSummary,createdAt |
| schedule.query | `features/personal-schedule/authority-contract.ts` | title,kind,category,startsAt,endsAt,allDay,timeZone,location,meetingMethod,contactId,eventId,meetingId,details,missingFields |
| aiHistory.query | `features/orbit-ai/storage/orbit-agent-chat-session-provider-factory.ts` + `ai-session-reference-authorization.ts` | sessionId,groupId,title,pinned,role,content,visibleRunStatus,visibleOutput |
| contacts.query | `features/contacts/service-factory.ts` | displayName,headline,company,relationship,status,tags |
| relationshipEvidence.query | `features/relationship-communication/service-factory.ts` + connections 的已授权 evidence | contactId,kind,summary,occurredAt,sourceId,sourceRevision |
| messages.query | `features/relationship-communication/service-factory.ts` | conversationId,contactId,direction,content,sentAt,readAt,visibleExtraction,privacyState |
| notifications.query | `features/notifications/inbox-record-service-factory.ts` | kind,title,reason,occurredAt,readAt,disposition,targetStatus,sourceIds |
| meetings.query | `features/appointments/repository.ts` + `features/events/orbit-schedule-meeting-details.ts` | title,startsAt,endsAt,timeZone,location,meetingMethod,status,participantLabels,eventId,details |
| events.query | `features/events/service-factory.ts` + `features/events/event-access/service.ts` | title,startsAt,endsAt,location,organizerName,registrationStatus,visibleAnswers,membershipStatus |
| goals.query | `features/events/goal-readiness/live-service.ts` | eventId,title,status,progress,readiness,updatedAt |
| agentData.query | `features/agent/service-factory.ts`、`ledger/service.ts`、`signals/service-factory.ts`、`runtime/service-factory.ts` | kind,title,status,summary,preferenceKey,preferenceValue,occurredAt,visibleReceipt |

`source`、`visibleOutput`、`visibleExtraction`、`visibleAnswers`、`visibleReceipt` 必须由适配器转为有界纯文本或已知字符串数组，不接受 raw provider JSON。Agent preferenceValue 只允许产品可见偏好，不能暴露 system prompt/自动化凭据。领域授权包含来源 ACL；仅 userId 过滤不足以证明会议/消息/活动/关系证据权限。registry 构建时校验 domain 唯一，列出的每项必须有真实 adapter，未实现不能宣称覆盖。

### Task 1: AI 权限 registry 与严格输入

**Files:** Create `repos/orbits/features/orbit-ai/data-query/read-contract.ts`, `repos/orbits/features/orbit-ai/data-query/permission-registry.ts`; Modify `repos/orbits/features/orbit-ai/data-query/query-schema.ts`, `repos/orbits/features/orbit-ai/data-visibility/manifest.ts`; Create `repos/orbits/tests/capabilities/orbit-ai-read-permission.test.ts`.

**Interfaces:** Consumes 服务器 ReadScope；Produces `assertAiReadAllowed(scope:ReadScope, permission:AiReadPermission, adapter:ReadAdapter):Promise<void>`、`projectReadFields(value:Readonly<Record<string,unknown>>, allowed:readonly string[]):Readonly<Record<string,unknown>>`，以及完整 13 域 AI permission 表。manifest 从 AI 表派生，仅作声明，不能授予 offline 权限。

- [ ] Step 1: 写权限反例，测试文件使用 node:test、node:assert/strict，导入新模块及上方类型：

```ts
test('offline eligibility cannot enable AI and unknown fields fail closed', async () => {
  const scope={actorId:'a',workspaceId:'w',authorizationEpoch:'e1'};
  const permission:AiReadPermission={tool:'notes.query',domain:'notes',schemaVersion:1,
    fields:['title'],maxItems:10,enabled:async()=>false};
  const adapter:ReadAdapter={authorize:async()=>true,
    page:async()=>({rows:[],snapshot:'s',partialReasons:[]}),authorizeEvidence:async()=>[]};
  await assert.rejects(assertAiReadAllowed(scope,permission,adapter), /AI_NOT_AUTHORIZED/);
  assert.throws(()=>projectReadFields({title:'x',providerToken:'SECRET'},['title']),/UNKNOWN_FIELD/);
  for(const key of ['actorId','workspaceId','authorizationEpoch','userId','accountId','profileId']) {
    assert.equal(createActorQueryInputSchema('notes.query').parse({operation:'list',query:'notes',[key]:'b'}).success,false);
  }
});
```

补能力开启但 adapter.authorize=false、未知工具/版本、域仅 offline-enabled、limit 0/11、get 缺 id、cursor >2048 字符、非法过滤字段的拒绝用例。声明不含任何身份字段。

- [ ] Step 2 RED: Web cwd `node --test --import tsx tests/capabilities/orbit-ai-read-permission.test.ts`；预期新模块缺失。建立类型/函数后再次确认断言因缺少拒绝策略失败，不能把 import 错误当作唯一行为 RED。
- [ ] Step 3 GREEN: 新建上方合同，逐域录入矩阵；默认禁用未知 capability；每次调用组合两层授权。实现核心如下，使用 Error 的固定内部码并映射到现有 AppError 响应，不向模型暴露 scope：

```ts
export async function assertAiReadAllowed(s:ReadScope,p:AiReadPermission,a:ReadAdapter) {
  if (!s.actorId || !s.workspaceId || !s.authorizationEpoch ||
      !(await p.enabled(s)) || !(await a.authorize(s))) throw new Error('AI_NOT_AUTHORIZED');
}
export function projectReadFields(v:Readonly<Record<string,unknown>>,keys:readonly string[]) {
  if(Object.keys(v).some(k=>!keys.includes(k))) throw new Error('UNKNOWN_FIELD');
  return Object.fromEntries(keys.filter(k=>Object.hasOwn(v,k)).map(k=>[k,v[k]]));
}
```

这里的 projectReadFields 是第二道 schema 防线；领域 adapter 首先显式构造 DTO，不能把完整数据库记录送来然后删除几个秘密键。每个 fields 值用工具专属 strict Zod schema 校验类型/嵌套内容。

- [ ] Step 4 GREEN verification: 同 RED 命令与 `node --test --import tsx tests/architecture/ai-visibility-manifest.test.ts tests/capabilities/orbit-ai-actor-query-tools.test.ts`，预期全文件通过；Web `npm run typecheck`。
- [ ] Step 5 commit: 仅暂存本 Task Files；运行根 `git diff --cached --check` 与 `npx gitnexus detect-changes --scope staged --repo /Users/xzhao/Projects/orbit`；`git commit -m "feat(ai): enforce independent scoped read permissions"`。登记固定 SHA、定向证据及集成待验。

### Task 2: 不可跨 scope 重放的分页与 canonical freshness

**Files:** Create `repos/orbits/features/orbit-ai/data-query/query-cursor.ts`, `repos/orbits/features/orbit-ai/data-query/query-result.ts`; Create `repos/orbits/tests/capabilities/orbit-ai-read-pagination.test.ts`.

**Interfaces:** Consumes Task 1；Produces `executeAiRead(tool:AiReadTool,input:ReadInput,deps:ReadDependencies):Promise<AiReadResult>`；cursor 模块 `sealReadCursor(claims:CursorClaims,key:Uint8Array):string`、`openReadCursor(token:string,key:Uint8Array,expected:CursorBinding,now:string):CursorClaims`。`CursorBinding={scope:ReadScope;tool:AiReadTool;schemaVersion:1;registryVersion:1;filterHash:string}`，`CursorClaims=CursorBinding & {snapshot:string;position:string;expiresAt:string}`，均在 query-cursor.ts 导出。

- [ ] Step 1: 新测试用 node:test/assert 和新接口；构造固定 key（测试专用）与绑定，测试签名、作用域及快照：

```ts
test('cursor is authenticated, scope bound and expires',()=>{
  const key=new Uint8Array(32).fill(7);
  const binding:CursorBinding={scope:{actorId:'a',workspaceId:'w',authorizationEpoch:'e1'},
    tool:'notes.query',schemaVersion:1,registryVersion:1,filterHash:'f'};
  const token=sealReadCursor({...binding,snapshot:'snap1',position:'row10',expiresAt:'2026-09-16T01:00:00Z'},key);
  assert.equal(openReadCursor(token,key,binding,'2026-09-16T00:00:00Z').position,'row10');
  assert.throws(()=>openReadCursor(token,key,{...binding,scope:{...binding.scope,actorId:'b'}},'2026-09-16T00:00:00Z'),/INVALID_CURSOR/);
  assert.throws(()=>openReadCursor(token+'x',key,binding,'2026-09-16T00:00:00Z'),/INVALID_CURSOR/);
  assert.throws(()=>openReadCursor(token,key,binding,'2026-09-16T02:00:00Z'),/INVALID_CURSOR/);
});
```

追加更换 workspace/epoch/tool/filter/schema/registry 的表驱动测试；使用 ReadAdapter fixture 返回 11 条分两页，断言每页≤10、readAt 固定时钟、revision 原样保留、空页仍有 authority、无重复/遗漏；并发插入不漂移、源物理删除/撤权后 get 和 evidence 不返回原文。缺 revision 必须抛 `REVISION_UNAVAILABLE`。字节不足不能丢掉已消费却未发送的项，nextPosition 指向最后实际返回项。

- [ ] Step 2 RED: Web `node --test --import tsx tests/capabilities/orbit-ai-read-pagination.test.ts`；先新模块缺失，再确认未签名/未校验实现不能通过 actor 重放和篡改断言。
- [ ] Step 3 GREEN: 使用 node:crypto HMAC-SHA256 + timingSafeEqual；filterHash 使用固定字段顺序的规范化输入 hash；生产 key 经服务端配置注入、不写文档/日志。cursor TTL 15 分钟且不晚于会话/epoch 有效期。核心执行顺序：

```ts
const scope=await deps.currentScope();
const permission=deps.permission(tool), adapter=deps.adapter(tool);
await assertAiReadAllowed(scope,permission,adapter);
// 验证严格输入、cursor binding 后才使用 position/snapshot；只请求一页。
const page=await adapter.page(scope,input,position,snapshot);
const current=await deps.currentScope();
if(JSON.stringify(current)!==JSON.stringify(scope)) throw new Error('AUTHORIZATION_CHANGED');
await assertAiReadAllowed(current,permission,adapter);
```

position/snapshot 是 openReadCursor 的结果，首屏均为 undefined。构造结果时逐项验证非空 canonical revision/updatedAt，重新授权 evidence；字节数用 `Buffer.byteLength(JSON.stringify(result),'utf8')`。超过预算裁到可完整返回的项；单项文本裁剪标记 text_limit。末页没有 nextCursor；任何裁剪/下一页/缺源使 truncated=true；失败抛错误而不是空数据成功。

- [ ] Step 4 GREEN: 同完整文件命令，预期全部 PASS；Web typecheck。测试不得依赖真实时钟或线上记录。
- [ ] Step 5 commit: 暂存本 Task 四文件、diff check、staged detect_changes，`git commit -m "feat(ai): bind read pagination and freshness to canonical scope"`。

### Task 3: 迁移四域并接入完整查询适配器

**Files:** Create `repos/orbits/features/orbit-ai/data-query/adapters/personal.ts`, `repos/orbits/features/orbit-ai/data-query/adapters/ai-history.ts`, `repos/orbits/features/orbit-ai/data-query/adapters/contacts.ts`, `repos/orbits/features/orbit-ai/data-query/adapters/relationship-evidence.ts`, `repos/orbits/features/orbit-ai/data-query/adapters/messages.ts`, `repos/orbits/features/orbit-ai/data-query/adapters/notifications.ts`, `repos/orbits/features/orbit-ai/data-query/adapters/meetings.ts`, `repos/orbits/features/orbit-ai/data-query/adapters/events.ts`, `repos/orbits/features/orbit-ai/data-query/adapters/goals.ts`, `repos/orbits/features/orbit-ai/data-query/adapters/agent-data.ts` 与 `repos/orbits/features/orbit-ai/data-query/adapter-registry.ts`; Modify `repos/orbits/features/orbit-ai/data-query/query-service.ts`, `repos/orbits/features/orbit-ai/data-query/query-schema.ts`, `repos/orbits/features/orbit-ai/service-factory.ts`; Create `repos/orbits/tests/capabilities/orbit-ai-domain-readers.test.ts`, `repos/orbits/tests/helpers/ai-domain-read-fixture.ts`; Modify `repos/orbits/tests/capabilities/orbit-ai-actor-query-tools.test.ts`.

**Interfaces:** Consumes Task 1～2；Produces `createAiReadAdapters(services:AiReadServices):Readonly<Record<AiReadTool,ReadAdapter>>`。`AiReadServices` 定义在 adapter-registry.ts：personalStore 为 LiveRecordStoreLike<Record<string,unknown>>；aiHistory 为 ReturnType<typeof createOrbitAgentChatSessionProvider>；contactsList/contactsDetail 分别为 ReturnType<typeof createContactsListSearchAndFilterService>/ReturnType<typeof createContactDetailTagStatusService>；communication 为 NonNullable<ReturnType<typeof createConfiguredRelationshipCommunicationService>>；inbox 为 NonNullable<ReturnType<typeof createConfiguredInboxRuntime>>；appointments 为 AppointmentRepository；meetingDetails 为 OrbitScheduleMeetingDetailsService；events 为 ReturnType<typeof createEventCrudAndImportService>；eventAccess 为 EventAccessService；goals 为 ReturnType<typeof createEventGoalAndReadinessService>；agentQueue/agentSettings/agentLedger/agentSignals/agentRuntime 分别为 ReturnType<typeof createAgentActionQueueService>/ReturnType<typeof createAgentAutonomySettingsService>/ReturnType<typeof createAgentLedgerService>/ReturnType<typeof createAgentSignalService>/ReturnType<typeof createOrbitAgentRuntimeService>。禁止 `any`、万能 SQL loader 或空 adapter；由 service-factory.ts 注入真实实现。每个 adapter 导出 `createAiHistoryReadAdapter(services:Pick<AiReadServices,"aiHistory">):ReadAdapter`、`createContactsReadAdapter(services:Pick<AiReadServices,"contactsList"|"contactsDetail">):ReadAdapter`、`createRelationshipEvidenceReadAdapter(services:Pick<AiReadServices,"communication"|"personalStore">):ReadAdapter`、`createMessagesReadAdapter(services:Pick<AiReadServices,"communication">):ReadAdapter`、`createNotificationsReadAdapter(services:Pick<AiReadServices,"inbox">):ReadAdapter`、`createMeetingsReadAdapter(services:Pick<AiReadServices,"appointments"|"meetingDetails">):ReadAdapter`、`createEventsReadAdapter(services:Pick<AiReadServices,"events"|"eventAccess">):ReadAdapter`、`createGoalsReadAdapter(services:Pick<AiReadServices,"goals"|"eventAccess">):ReadAdapter`、`createAgentDataReadAdapter(services:Pick<AiReadServices,"agentQueue"|"agentSettings"|"agentLedger"|"agentSignals"|"agentRuntime">):ReadAdapter`；`createPersonalReadAdapters(services:Pick<AiReadServices,"personalStore">):Readonly<Record<"notes.query"|"tasks.query"|"followups.query"|"schedule.query",ReadAdapter>>`。这些 factory 名称已在规划基线核对；从矩阵的 source 模块导入，goals 使用 features/events/service-factory.ts 的公开 factory，不直接绕过 factory 创建 live service。

测试 fixture 导出 `createAiDomainReadFixture(tool:AiReadTool):Promise<{ deps:ReadDependencies; scope:ReadScope; foreignScope:ReadScope; seed(count:number):Promise<void>; revoke():Promise<void>; remove(id:string):Promise<void>; getId():string; readStoredRevision(id:string):Promise<string> }>`。fixture 通过真实领域创建/存储 helper 建合成记录，内存服务复用各域既有测试夹具；数据库变体用隔离 PostgreSQL transaction，不 mock executeAiRead 或权限检查。

- [ ] Step 1: 逐个工具写下面完整行为循环，工具数组使用本计划 13 项常量，每项独立 test 名，可单项 RED：

```ts
for(const tool of AI_READ_TOOLS) test(`${tool}: real adapter scope, pagination, revision and deletion`,async()=>{
  const f=await createAiDomainReadFixture(tool); await f.seed(11);
  const first=await executeAiRead(tool,{operation:'list',query:'show my records',limit:10},f.deps);
  assert.equal(first.items.length,10); assert.equal(first.truncated,true);
  const second=await executeAiRead(tool,{operation:'list',query:'show my records',limit:10,cursor:first.nextCursor},f.deps);
  assert.equal(second.items.length,1);
  assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,11);
  assert.equal(first.records[0].revision,await f.readStoredRevision(first.records[0].id));
  const foreign={...f.deps,currentScope:async()=>f.foreignScope};
  await assert.rejects(executeAiRead(tool,{operation:'list',query:'show my records',cursor:first.nextCursor},foreign));
  const id=f.getId(); await f.remove(id);
  const deleted=await executeAiRead(tool,{operation:'get',query:`open ${id}`,id},f.deps);
  assert.equal(deleted.items.length,0);
  await f.revoke();
  await assert.rejects(executeAiRead(tool,{operation:'list',query:'show my records'},f.deps));
});
```

`AI_READ_TOOLS` 从 permission-registry 导出精确 13 项；fixture/getId 的实体必须属于刚 seed 的列表。再为每工具测 search 匹配与详情内容，跨 workspace/角色 revocation，源含额外 secret 字段仍不会被 DTO 复制。AI 历史至少 61 条消息跨页；通知来源撤权返回不可用而非旧 reason；消息参与者退出、会议权限撤销、活动角色变化、evidence 源撤权和 Agent 隐藏执行输入分别测反例。

- [ ] Step 2 RED: Web `node --test --import tsx tests/capabilities/orbit-ai-domain-readers.test.ts`；新增工具缺 adapter/查询未注册失败，既有四域因缺 revision/cursor binding 断言失败。逐域筛选开发，交付时跑完整文件。
- [ ] Step 3 GREEN: 每域创建薄 adapter，调用矩阵中的权威服务，显式映射 fields 和来源 version。个人域复用 note/task/canonical schedule 映射；followup 只取已确认任务，不取建议队列。分页在源授权后进行，不能先截断再过滤造成漏页。映射模式：

```ts
const row:CanonicalRow={id:record.id,revision:String(record.revision),updatedAt:record.updatedAt,
  fields:{title:record.title,status:record.status},evidenceIds:record.evidenceIds};
```

此例是 tasks DTO 形状；实际各域按矩阵字段逐个赋值，revision 必须是该源的 persisted version。没有版本的源由其 owner 提供版本化读取接口，阻塞该适配器，不伪造时间戳 revision。源已有 cursor 包入 AI cursor，保留稳定排序/快照；不能一次 list 全库再本地 slice。历史消息只返回 user-visible 消息，排除系统上下文。现有 `executeActorScopedQuery` 作为兼容包装调用 executeAiRead；禁止保留绕开 registry 的路径。所有真实 factory 缺配置都 fail closed，不退到 mock。

- [ ] Step 4 GREEN: Web `node --test --import tsx tests/capabilities/orbit-ai-domain-readers.test.ts tests/capabilities/orbit-ai-actor-query-tools.test.ts tests/capabilities/orbit-ai-read-permission.test.ts tests/capabilities/orbit-ai-read-pagination.test.ts`；隔离 PostgreSQL 对各新增源执行同一授权/删除/分页合同并记录未支持项为失败；Web typecheck。没有所有 13 域实际服务接线不得提交为本阶段完成。
- [ ] Step 5 commit: 显式暂存上方 Create/Modify 路径，diff check + staged detect_changes；`git commit -m "feat(ai): connect authorized canonical readers for all approved domains"`。若分两次能力提交，每批都独立走完整 RED/GREEN，报告剩余域，不减少此 Task 的验收。

### Task 4: registry、artifact、runtime 与 provider 出站拦截

**Files:** Modify `repos/orbits/features/agent/capabilities/contract.ts`, `repos/orbits/features/agent/capabilities/registry.ts`, `repos/orbits/features/orbit-ai/agent-tools/registry.ts`, `repos/orbits/features/orbit-ai/data-query/query-artifact-service.ts`, `repos/orbits/features/orbit-ai/data-visibility/manifest.ts`, `repos/orbits/features/orbit-ai/gemini-provider.ts`, `repos/orbits/features/orbit-ai/live-agent-runtime.ts`, `repos/orbits/features/orbit-ai/artifact-contract.ts`, `repos/orbits/shared/contract/orbit-ai.ts`; Create `repos/orbits/shared/api-schema/orbit-ai.ts`, `repos/orbits/features/orbit-ai/data-visibility/provider-read-boundary.ts`, `repos/orbits/tests/capabilities/orbit-ai-provider-read-boundary.test.ts`; Modify `repos/orbits/tests/capabilities/orbit-ai-query-routing.test.ts`, `repos/orbits/tests/capabilities/orbit-ai-trace-debug.test.ts`.

**Interfaces:** Consumes AiReadResult；Produces `validateProviderRead(result:AiReadResult,scope:ReadScope,deps:ReadDependencies):Promise<AiReadResult>`；内部可信 envelope 绑定 scope/tool，不把 actor/workspace 发送 provider。artifact.dataVisibility 增加 authority/readAt/records/partialReasons；调用方不能从 displayItem 重新构造更宽 DTO。全部 read tools 的 schema/描述/result 同源登记，旧 context/recommend/profile 入口也执行其 manifest 的严格投影和权限检查。

- [ ] Step 1: 在 provider boundary 测试通过现有 Gemini 注入 fetchImplementation 捕获实际序列化请求，复用 `orbit-agent-self-profile-tool.test.ts` 的请求入口/响应夹具。新 fixture 函数 `captureReadProviderRequest(result, mutateBeforeSend?)` 定义在此测试文件，调用真实 provider + runtime，以 fetch spy 保存 `JSON.parse(String(init.body))`，返回 `{unsafeOutcomeRequests,payloads,executedTools}`；unsafeOutcomeRequests 仅统计包含本次不合格 tool outcome 的出站请求，正常规划请求不计入。不直接测试自行拼出的 payload。核心断言：

```ts
const f=await createAiDomainReadFixture('notes.query'); await f.seed(1);
const result=await executeAiRead('notes.query',{operation:'list',query:'my notes'},f.deps);
const unsafe={...result,items:[{...result.items[0],providerToken:'DO_NOT_SEND'}]};
await assert.rejects(validateProviderRead(unsafe,f.scope,f.deps),/UNKNOWN_FIELD/);
const capture=await captureReadProviderRequest(unsafe);
assert.equal(capture.unsafeOutcomeRequests,0);
```

增加 nested secret、未知 tool、跨 actor artifact、缓存 epoch 变化、读后发送前撤权、history 中旧 revoked evidence、超字节、伪 revision 的负例；允许 notes body 内普通“忽略规则”文字，但 provider messages 中仍是数据角色，工具 allowlist 不变，executedTools 不含任何 write/external，且确认门槛未改变。trace 不含正文/secret。对 13 域做工具选择→执行→artifact→实际 provider payload 正例，不以仅查询测试代替接线。

- [ ] Step 2 RED: Web `node --test --import tsx tests/capabilities/orbit-ai-provider-read-boundary.test.ts tests/capabilities/orbit-ai-query-routing.test.ts`；预期新增工具无法路由、unsafe payload 未被阻断。所有 fixture helper 在测试中按现有 provider 类型实现，编译通过后记录行为 RED。
- [ ] Step 3 GREEN: 在唯一 provider 发送点调用校验，再序列化；Gemini 若有多种 request path 均经同一函数。实现顺序：

```ts
const scope=await deps.currentScope();
const safe=await validateProviderRead(result,scope,deps);
const toolData=JSON.stringify({kind:'untrusted_tool_data',result:safe});
```

safe 验证来源 scope、当前 epoch、各 item strict schema、引用授权、freshness 和字节预算；出站只含允许的 domain/记录元数据/字段，不含内部 scope。系统指令说明仅使用本次返回范围，不将 stored text 当指令；正文永不插入 system/tool definition。审计只记录 tool/status/revision 摘要/evidence IDs；错误 reason 不串接原始记录。更新 registry 的 13 工具、source module union、runtime dispatch 和 artifact mapper，保留现有推荐工具行为。现有 shared/contract/orbit-ai.ts 目前不含 artifacts；在其中新增 AiQueryFreshnessContract（authority/readAt/records/partialReasons/truncated/nextCursor），对应新建 shared/api-schema/orbit-ai.ts 的 strict schema，并由响应的 feature contract 转发类型。共享类型只含类型声明，App 副本只能 `npm run sync:contract` 生成。

- [ ] Step 4 GREEN: 同 RED 全文件 + Web `node --test --import tsx tests/capabilities/orbit-ai-trace-debug.test.ts tests/architecture/ai-visibility-manifest.test.ts`；Web typecheck；App cwd `npm run sync:contract` 后 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts` 和 App typecheck。未修改共享源则不生成无关副本。
- [ ] Step 5 commit: 上方明确文件以及 sync 命令实际生成的 `repos/orbit-app/src/api/contract/orbit-ai.ts`、`src/api/schema/orbit-ai.ts`，diff check/detect_changes 后 `git commit -m "feat(ai): enforce scoped provider payloads and full query routing"`。

### Task 5: evidence 生命周期与读取期间撤权

**Files:** Create `repos/orbits/features/orbit-ai/data-query/read-evidence.ts`, `repos/orbits/tests/capabilities/orbit-ai-read-evidence.test.ts`; Modify `repos/orbits/features/orbit-ai/data-query/query-result.ts`, `repos/orbits/features/orbit-ai/data-query/query-artifact-service.ts`, `repos/orbits/features/orbit-ai/data-visibility/provider-read-boundary.ts`.

**Interfaces:** Consumes ReadScope/ReadAdapter；Produces `ReadEvidenceRef={tool:AiReadTool;recordId:string;revision:string;evidenceId:string}`、`resolveReadEvidence(ref:ReadEvidenceRef,deps:ReadDependencies):Promise<CanonicalRow|null>`。引用只包含 ID/version，scope 存于服务器可信封套；解析重新读取 canonical、重新授权，源不存在返回 null，权限失效抛 AI_NOT_AUTHORIZED。artifact 缓存键包含内部 actor/workspace/epoch，getArtifactTask 不能仅凭 artifactId 命中别人的旧 payload。

- [ ] Step 1: 新测试沿用 Task 3 fixture，并在 fixture 新增 `update(id:string):Promise<void>` 通过真实源编辑服务提高 revision；断言 stale evidence 不复活正文：

```ts
test('evidence cannot resurrect a deleted or superseded record',async()=>{
  const f=await createAiDomainReadFixture('notes.query'); await f.seed(1);
  const r=await executeAiRead('notes.query',{operation:'list',query:'notes'},f.deps);
  const ref:ReadEvidenceRef={tool:'notes.query',recordId:r.records[0].id,
    revision:r.records[0].revision,evidenceId:r.records[0].evidenceIds[0]};
  assert.ok(await resolveReadEvidence(ref,f.deps));
  await f.update(ref.recordId);
  assert.equal(await resolveReadEvidence(ref,f.deps),null);
  await f.remove(ref.recordId);
  assert.equal(await resolveReadEvidence(ref,f.deps),null);
});
```

fixture seed 必须创建真实有权限 evidence，不允许 undefined 通过；补 foreignScope、撤角色、epoch 变化、引用指向另一源、artifact cache 重用、读后撤权但发送前的竞态，使用 barrier promise 精确控制时序，不用 sleep。

- [ ] Step 2 RED: Web `node --test --import tsx tests/capabilities/orbit-ai-read-evidence.test.ts`；预期新解析函数缺失；实现签名后 stale/cache 断言失败。
- [ ] Step 3 GREEN: resolver 调用对应 adapter 的授权读取，校验 row.id/revision 和 authorizeEvidence，不从客户端或历史 artifact 直接返回正文。最小核心：

```ts
const scope=await deps.currentScope(), adapter=deps.adapter(ref.tool);
await assertAiReadAllowed(scope,deps.permission(ref.tool),adapter);
const page=await adapter.page(scope,{operation:'get',query:`open ${ref.recordId}`,id:ref.recordId});
const row=page.rows.find(r=>r.id===ref.recordId && r.revision===ref.revision);
if(!row || !(await adapter.authorizeEvidence(scope,[ref.evidenceId])).includes(ref.evidenceId)) return null;
return row;
```

返回前再检查当前 scope 和权限，与 Task 2 使用相同检查函数。actor/workspace 不作为模型可设置参数。artifact cache 失效时返回既有 not-found/failure，不泄露存在性。

- [ ] Step 4 GREEN: 同完整文件 + provider boundary、actor query tests，预期全部通过；Web typecheck。数据库竞态用隔离源事务验证，缺环境保留未验而非跳过计成功。
- [ ] Step 5 commit: Task Files 加 `repos/orbits/tests/helpers/ai-domain-read-fixture.ts`，diff check/detect_changes 后 `git commit -m "fix(ai): reauthorize evidence and cached artifacts at read time"`。

### Task 6: App 按域显示未同步 AI 盲区

**Files:** Create `repos/orbit-app/src/data/sync/ai-sync-visibility.ts`, `repos/orbit-app/src/hooks/useAiSyncVisibility.ts`, `repos/orbit-app/src/components/ai/AiSyncNotice.tsx`, `repos/orbit-app/tests/ai-sync-visibility.test.ts`, `repos/orbit-app/tests/ai-sync-notice.test.tsx`; Modify `repos/orbit-app/src/screens/ai/AiScreen.tsx`, `repos/orbit-app/src/screens/ai/AiConversationScreen.tsx`, `repos/orbit-app/src/i18n/messages.ts`, `repos/orbit-app/src/i18n/zh.ts`, `repos/orbit-app/src/i18n/ja.ts`, `repos/orbit-app/src/i18n/en.ts`, `repos/orbit-app/tests/ink-signal-ai-conversation.test.ts`。

**Interfaces:** Consumes 0033/0034 固定合并版本的 scope、outbox、receipt 和已应用 canonical revision 事件；Produces 下列本线只读投影接口（全部定义在 ai-sync-visibility.ts，不能改 outbox 为本线服务）：

```ts
export interface VisibilityScope {baseUrl:string;actorId:string;workspaceId:string;authorizationEpoch:string}
export interface PendingAiChange {
  scope:VisibilityScope;domainId:string;mutationId:string;
  state:'pending'|'conflicted'|'failed'|'acknowledged';
  canonicalRevisionObserved:boolean;aiEnabled:boolean;
}
export interface PendingAiDomain {domainId:string;count:number;aiEnabled:boolean}
export function summarizeAiPending(scope:VisibilityScope,rows:readonly PendingAiChange[]):readonly PendingAiDomain[];
export interface AiVisibilitySource {
  read(scope:VisibilityScope):Promise<readonly PendingAiChange[]>;
  subscribe(scope:VisibilityScope,onChange:()=>void):()=>void;
}
```

`useAiSyncVisibility(scope:VisibilityScope|null,source:AiVisibilitySource):{domains:readonly PendingAiDomain[];status:'loading'|'ready'|'failure'}`；`AiSyncNotice({domains,status})` 用现有 locale context。适配 source 在 hook 内消费 0034 的公开摘要/订阅，不读取 patch/body；canonicalRevisionObserved 由同 scope mirror 实际收到 receipt 指向 revision/tombstone 得出，不比较 opaque revision 大小。0034 尚无公开消费接口时只要求 owner 提供此窄摘要，先写测试，接线等待对应合并 SHA，不能导入服务端实现或用假状态交付。

- [ ] Step 1: 新单测覆盖 receipt 已回但 mirror 未到、同 mutation 不重复计数、冲突/失败保持、scope 变化：

```ts
test('notice survives receipt until its canonical revision is observed',()=>{
  const scope={baseUrl:'https://orbit.test',actorId:'a',workspaceId:'w',authorizationEpoch:'e1'};
  const row:PendingAiChange={scope,domainId:'notes',mutationId:'m1',state:'acknowledged',
    canonicalRevisionObserved:false,aiEnabled:true};
  assert.deepEqual(summarizeAiPending(scope,[row]),[{domainId:'notes',count:1,aiEnabled:true}]);
  assert.deepEqual(summarizeAiPending(scope,[{...row,canonicalRevisionObserved:true}]),[]);
  assert.deepEqual(summarizeAiPending({...scope,actorId:'b'},[row]),[]);
});
```

render test 用现有 `tests/helpers/render.tsx` 实际渲染 notice，断言 zh/en/ja 领域与数量、AI 未获授权独立文案、状态失败不冒充零 pending；两个 screen 发送/错误/结果显示均保留提示。fetch spy 捕获 AI request body，不包含 `PendingAiChange`、业务 patch、设备 draft 或 mutationId；scope 切换的旧异步 read 回来不能显示旧统计。

- [ ] Step 2 RED: App `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ai-sync-visibility.test.ts tests/ai-sync-notice.test.tsx`；预期新模块缺失；基础函数后断言 acknowledged 未观察仍应显示、screen 无提示失败。
- [ ] Step 3 GREEN: 纯 summary 按完整 scope 过滤、mutationId 去重、domainId 分组，排除仅 state=acknowledged 且 canonicalRevisionObserved 的项；只返回 domainId/count/aiEnabled：

```ts
const visible=rows.filter(r=>sameScope(r.scope,scope) &&
  !(r.state==='acknowledged' && r.canonicalRevisionObserved));
const unique=[...new Map(visible.map(r=>[r.mutationId,r])).values()];
```

`sameScope` 在同文件逐个比较四字段；baseUrl 使用 0033 规范化后的值，不另造规则。hook 捕获 generation counter，scope 更改立即清空旧数组，迟到响应 generation 不同就丢弃；订阅取消。摘要失败显示“暂时无法确认本机同步状态”，不能清掉已知 pending。屏幕复用同一组件并保持已有布局/输入动作。不要向 provider 参数增加 pending 属性。
- [ ] Step 4 GREEN: 同两文件 + `tests/ink-signal-ai-conversation.test.ts`、`tests/local-sync-repository.test.ts`、0034 实际摘要消费者测试；App typecheck。Simulator 在 notes pending→receipt→delta/tombstone 演示提示变化、离线重启/冲突/切换账号演示保留和隔离。未合入真实 0034 时此步骤不能 PASS。
- [ ] Step 5 commit: 上方明确 App 文件，diff check/detect_changes 后 `git commit -m "feat(app): show domain counts AI cannot yet read"`。

### Task 7: Data Atlas 从 registry 与证据生成

**Files:** Create `repos/orbits/scripts/build-sync-ai-coverage.ts`, `repos/orbits/tests/audits/sync-ai-coverage.test.ts`; 管理线 Create `docs/audits/2026-09-15-data-flow/sync-and-ai-coverage.json`; 管理线 Modify `docs/audits/2026-09-15-data-flow/README.md`。站点为已记录的私有 `orbit-data-atlas-20260915.agenthubs-app.chatgpt.site`，通过 Sites 工具获取其真实 source project，不猜测本地站点路径或另建公开站。

**Interfaces:** Produces `buildCoverage(input:CoverageInput):CoverageRow[]` 与 CLI `npx tsx scripts/build-sync-ai-coverage.ts --check --input <absolute-json-path>`；`--check` 比较结构化数据、不写入。`CoverageInput={domains:OfflineDomain[];ai:AiPermissionRow[];routes:RouteCoverage[];evidence:CoverageEvidence[]}`；这些审计类型在脚本导出：

```ts
export interface OfflineDomain {domainId:string;authority:string;storage:readonly string[];
  readPersistence:string;mutationPolicy:string;binaryPolicy:string;syncState:string;limitations:readonly string[]}
export interface AiPermissionRow {domainId:string;tool:string|null;enabled:boolean;fields:readonly string[]}
export interface RouteCoverage {route:string;domainId:string;projection:'list'|'detail'|'subresource'|'search'|'aggregate'}
export interface CoverageEvidence {domainId:string;status:'open'|'partially_resolved'|'resolved';
  sourceSha:string;verifiedAt:string|null;reference:string}
export interface CoverageRow extends OfflineDomain {ai:readonly AiPermissionRow[];
  routes:readonly RouteCoverage[];evidence:readonly CoverageEvidence[]}
```

0033 registry/route 表通过执行版的显式导出映射到 OfflineDomain/RouteCoverage；不得把 AI registry 当 offline 清单。CLI 输入只有脱敏元数据，无真实记录。域不能因 ai.enabled=false 被过滤掉。

- [ ] Step 1: 新 tests/audits 文件覆盖无路由遗漏、双权威、未授权 AI、证据版本不一致、原始 secret 与站点数据一致性。最小行为测试：

```ts
test('unregistered route prevents completeness claim',()=>{
  assert.throws(()=>buildCoverage({domains:[],ai:[],
    routes:[{route:'/notes',domainId:'notes',projection:'list'}],evidence:[]}),/UNREGISTERED_DOMAIN/);
});
test('offline-only domain stays in atlas',()=>{
  const domain:OfflineDomain={domainId:'private',authority:'canonical',storage:['sqlcipher'],
    readPersistence:'durable_normalized',mutationPolicy:'online_only',binaryPolicy:'metadata_only',
    syncState:'partial',limitations:['history incomplete']};
  const rows=buildCoverage({domains:[domain],ai:[],routes:[],evidence:[]});
  assert.equal(rows[0].syncState,'partial'); assert.deepEqual(rows[0].ai,[]);
});
```

- [ ] Step 2 RED: Web `node --test --import tsx tests/audits/sync-ai-coverage.test.ts`；预期脚本缺失或遗漏路由未报错。无需给文字文档建立源码断言测试。
- [ ] Step 3 GREEN: 以 domainId join 三表，重复 authority、未知 route domain、AI enabled 无 tool/field/schema、resolved 无 sourceSha/verifiedAt 抛明确错误；输出稳定排序供版本审查。最小 join：

```ts
const known=new Set(input.domains.map(d=>d.domainId));
for(const r of input.routes) if(!known.has(r.domainId)) throw new Error('UNREGISTERED_DOMAIN');
return input.domains.map(d=>({...d,ai:input.ai.filter(a=>a.domainId===d.domainId),
  routes:input.routes.filter(r=>r.domainId===d.domainId),evidence:input.evidence.filter(e=>e.domainId===d.domainId)}));
```

从 approved registry/API-route inventory 生成实际 JSON，不手填统计数。保留历史问题及解决 SHA，pending 环境限制留 open/partially_resolved。Atlas 展示每域 offline read/write/AI read、来源/存储/同步状态、13 工具字段表、provider→Web/API→App 路径、失败/冲突、证据时间。未同步不是“空”；权限与同步状态独立展示。
- [ ] Step 4 GREEN: 测试全文件通过、Web typecheck；CLI --check 与提交 JSON 一致。读取 Sites building/hosting 技能，更新已有私有站，核对桌面/移动筛选和展开状态、公开访问被拒绝、页面源不含真实账号/记录/token/database URL。按其实际发布审批门槛提供预览后发布；不从本次规划授权推断发布许可。Sites 工具/源不可用只阻塞站点动作，JSON/README 独立完成。
- [ ] Step 5 commit: Web脚本/测试由实现线提交 `feat(audit): generate offline and AI domain coverage`；管理线串行提交 audit JSON/README 及 Sites 返回的真实 source diff，记录私有部署 ID/URL/source SHA。两次均 diff check/detect_changes，不提交日志或个人记录。

### Task 8: 完整跨端验收与固定版本交接

**Files:** Create `repos/orbits/scripts/verify-offline-ai-evidence.ts`, `repos/orbits/tests/audits/offline-ai-evidence.test.ts`; 执行后 Create `repos/orbit-app/docs/sprints/0036-ai-sync-visibility-acceptance/REPORT.md`；管理线 Create `bridge/requests/BR-0036-ai-coverage-acceptance.md` 并更新 `bridge/status.md`、`bridge/handoffs.md`、`repos/orbit-app/docs/sprints/README.md`。实际原始证据仅 `build/harness-state/evidence/sprint-0036/run-01/`，git check-ignore 确认，不提交截图/日志。

**Interfaces:** verifier 导出 `verifyOfflineAiEvidence(matrix:AcceptanceMatrix):string[]`；`AcceptanceMatrix={sourceSha:string;mergeSha:string;remoteSha:string;environment:AcceptanceEnvironment;rows:AcceptanceRow[]}`。类型在脚本导出：

```ts
export interface AcceptanceEnvironment {webSha:string;webBuildExit:number;webRestartedAt:string;
  appSha:string;metroSha:string;apiBaseAlias:string;databaseAlias:string;actorAlias:string;
  simulatorBuild:string;providerAlias:string;atlasSourceSha:string}
export interface AcceptanceRow {domainId:string;projection:string;scenario:string;
  status:'passed'|'failed'|'blocked';webRevision:string|null;appRevision:string|null;
  aiRevision:string|null;aiAuthorized:boolean;artifactPath:string;verifiedAt:string}
```

版本是源代码版本/环境证据，不强制文档提交 SHA 与产品 SHA 相等；REPORT 明确被测功能 SHA、后续报告 SHA、merge SHA/remote SHA 的关系，避免自引用。verifier 验证必需覆盖和状态，不能制造运行证据。

- [ ] Step 1: 写 validator 测试：未知行不计入覆盖、任一必需行缺失/blocked 均返回问题；伪相等 revision 不补齐运行环境。最小断言（fixture 定义在同测试文件，用矩阵下方所有必需组合生成合成验证器输入，并标明非 runtime 证据）：

```ts
test('missing runtime scenario cannot be hidden by a passing count',()=>{
  const matrix=completeEvidenceFixture();
  matrix.rows=matrix.rows.filter(r=>r.scenario!=='role-revoke');
  assert.ok(verifyOfflineAiEvidence(matrix).some(x=>x.includes('role-revoke')));
});
test('different Metro source is rejected',()=>{
  const matrix=completeEvidenceFixture(); matrix.environment.metroSha='different';
  assert.ok(verifyOfflineAiEvidence(matrix).some(x=>x.includes('metro')));
});
```

- [ ] Step 2 RED: Web `node --test --import tsx tests/audits/offline-ai-evidence.test.ts`；预期 verifier 缺失，签名就绪后缺行/版本不一致未被发现为行为 RED。
- [ ] Step 3 GREEN: validator 对 registry 的域/route/projection 建 required set，再核对下面场景；支持某场景由独立前序有效证据引用，必须提供相同代码/依赖/环境适用性说明，不能用不适用场景冒充 passed。只读聚合新增/删除由其源记录触发，不为测试添加产品写接口。实现核心：

```ts
for(const required of requiredRows) {
  const row=matrix.rows.find(r=>r.domainId===required.domainId &&
    r.projection===required.projection && r.scenario===required.scenario);
  if(!row || row.status!=='passed') issues.push(`${required.domainId}:${required.scenario}`);
}
if(matrix.environment.metroSha!==matrix.mergeSha) issues.push('metro source differs from merge tree');
```

requiredRows 从实际 0033 route/domain 清单及下列确定规则生成，禁止只按出现的证据行推导要求。CLI `npx tsx scripts/verify-offline-ai-evidence.ts --input <absolute-matrix-json>` 非零退出表示缺项。
- [ ] Step 4 GREEN / integration（按顺序执行并登记命令/退出码）：
  1. 本地代码收口：Web `npm test`、`npm run typecheck`、`npm run build`；App `npm test`、`npm run typecheck`、`npx expo run:ios --no-bundler`。若共享契约改动先 `npm run sync:contract`；全量已含 sync tests 不重复单跑。同一环境重套件串行，不并发争用。
  2. 管理线审查固定功能 SHA 后合入 chat-agent，读取实际 merge SHA。Web 改动后停止已确认属于本任务的旧进程，以 Node 22 production build 重启服务并核对 health/live；App 确认 API Base URL、同账号与数据库别名，Metro 从精确主线目录启动，记录 PID/cwd/commit 和 Simulator bundle。不得接管其他线进程或账号。
  3. 完成下方逐域矩阵，拦截测试用 fake provider 证明安全边界；另用已授权真实 provider 做实际选择/回读，记录用量与费用，禁止记录 prompt 原文、Cookie/token。缺真实 provider/账号/Simulator 只阻塞相应行，不将测试替代其完成。
  4. 管理线在精确合并树按改动重跑受影响检查和上述 runtime 冒烟；只有原证据仍适用才引用复用。运行 verifier，要求缺行/failed/blocked 均为零后才能完成全组；私有 Atlas 同步真实结果。
- [ ] Step 5 commit / handoff：实现线先提交 verifier/测试 `test(sync): require complete domain runtime evidence`；执行结束后按真实结果提交 REPORT `docs(sprint-0036): record verified scope and remaining acceptance`。每次显式路径、diff check/detect_changes；管理线提交 Bridge/登记表/Atlas，审查并合入报告 SHA。仅管理线在获得适用授权且合并树验收通过后 push，`git rev-parse chat-agent` 与 `git ls-remote origin refs/heads/chat-agent` 比对。实现线不得自行 merge/push；当前规划交付在规划 commit 后暂停。

## 逐域 runtime 矩阵（Task 8 的 requiredRows）

**域全集**为 0033 registry 与 API/page→domain inventory 的并集，必须包含规范 §3 的以下 13 业务族，不以 13 个 AI 工具代替全部 offline 域：账号/资料/设置、笔记及历史、任务/跟进/提醒/建议、日程/预约/会议、联系人/关系/证据/图谱/需求、导入结果/名片草稿/去重复核、普通会话/消息/隐私、AI 会话/分组/完整历史/可见输出、通知/信号/处理结果、活动/报名/问卷/会员/相遇/目标/准备度、活动角色/审核/运营/签到/分析、Agent 偏好/设置/信号/动作/账本/回合/回执、首页/Today/Dashboard 等聚合。

| 必需 scenario | 范围与真实操作/判定 |
| --- | --- |
| online-create / online-update / physical-delete / role-revoke | 每业务族代表性记录，Web→App 和 App→Web 同记录回读；只读域通过既有权威生产者生成/删除。每实际域 bootstrap/delta/tombstone/visibility delete/游标 reset 证据必须存在，不能以代表性业务族覆盖替代其协议证据 |
| offline-cold-start | 每 route 的 list/detail/subresource/search/aggregate，完成同步后断网杀进程冷启动；实际渲染与 canonical 投影相等 |
| history-partial / disk-full / binary-missing | AI 长历史多页断点续传、磁盘不足事务不误提交游标；二进制未下载仍见文字/元数据，状态 partial/not-downloaded，不显示空或已完成 |
| lease-expired / auth-401 / domain-403 | 租期到期锁镜像；认证撤销全 scope；域403只清相应域，设备离线撤权延迟受七天或更短服务端租期约束，不能声称即时 |
| actor-switch / base-url-switch / workspace-switch / role-revoke | A→B→A、另一 API Base、workspace、角色 epoch 切换，镜像/outbox/资源/AI cursor/artifact 无旧 scope 数据 |
| pending-restart / receipt-replay / conflict / canonical-observed | 每 0034 offline_queue 操作跨重启、幂等只生效一次、冲突保稿；AI 旧 revision+本机提示，ack 但未 delta 提示仍在；delta/tombstone 后新 revision/提示消失。online_only 操作在 local-read 被阻断 |
| hint-lost / hint-duplicate / hint-reordered / background / killed / cursor-reset | 每 registry 域调度消费路径可复用其直接测试；原生代表高频消息/通知和长历史 AI，在上述干扰后靠 cursor 恢复，不因未收到提示遗漏 |
| ai-authorized-read / ai-denied-read / evidence-revoked / injection | 每已开启 AI 域逐工具实际 query/readAt/revision/evidence 与 Web canonical 对照；每未开启域拒绝。发送边界拦截全部域并验证秘密、跨 scope、注入不能产生权限/副作用 |
| reinstall-bootstrap | 确认授权的 Simulator 测试安装重建，canonical 不丢，未同步草稿不能被虚假恢复；先归档当前测试记录/账号范围，不擦用户设备 |

requiredRows 规则：每域要求协议的 online/read/delete/revoke/cursor-reset；每 route/projection 要求 offline-cold-start；每 AI permission 要求 allow/deny 与 evidence/injection；每 mutation adapter 要求 pending/receipt/conflict；系统边界场景在涉及的 scope/storage 实现测一次，并列出适用 domains，不跑语言×账号×设备全排列。运行证据引用旧结果必须含固定 SHA 和适用范围。

## 自查及交接门槛

- 规范 §3 全部业务族：Task 3/7/8；§5 AI 每个已授权域：Task 1～5；pending：Task 6；Data Atlas：Task 7；§8 全十项：Task 8 与前序固定证据。
- 不修改 0033 身份/数据库/cursor、0034 事务/receipt、0035 调度语义；缺接口只绑定对应任务，服务端独立工作仍可执行。
- 签名、函数名、scope、revision 和分页字段以本计划固定接口为准；前序最终契约若有命名差异只在只读 adapter 映射，不改权威语义。真实前置条件缺失不可用测试替身掩盖。
- 规划提交验证只做路径/链接/规则/占位检查、git diff --check 和 GitNexus detect_changes，不跑产品测试。管理线审查前不执行上面的代码步骤。
