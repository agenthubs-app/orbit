# Sprint W0051 — 每人洞察（ContactInsight）：增量生成，三处复用

> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-8、R-9、R-10、R-11、R-13、R-16，配额口径统一）：白名单加 W0050 待唤醒视图模型与测试，SC-04 明确 ready 读 `nextStep`、其他状态保留规则句、0 次模型调用；删除 App 契约同步 commit 要求，只保证 optional 兼容；强度档移出洞察 `source_data_version`；单人重新生成加 contact 级 CAS／租约、并发 provider 调用 1 次；用户主动池总熔断每人每东京日 10 次操作（含手动重新分析 3 次，已定 D45）；进入条件明列 W0050；批量洞察按「一批 ≤20 人 = 1 次操作」；验收契约改为「操作链 + 主证据」+ 必需证据子表。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。洞察批量计入 W0048a 后台自动池（每人每东京日 60 次调用、≤20 人／批）；单人「重新生成」计入用户主动池；补全来源读 W0045 `enrichment.fields`（C-4）。
> 协调者补充（2026-10-02）：本 Sprint 承接 W50-3 后半——洞察落地后，W0050 机会标签「待唤醒」的「为什么现在联系」改读该联系人洞察的 `nextStep`（无洞察时保留 W0050 的规则拼句兜底）；进入条件因此加 W0050 completed。改动限于 W0050 交接的待唤醒视图模型及其测试，计入 SC-W0051-04 的接线验证。

**Plan revision:** 3。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-09（REQUIREMENTS 大目标 4「共享契约 · 每人洞察 ContactInsight」「AI 调用配额」）；D41、D43（洞察计入每日 AI 上限）、D44（C-5 两池）。
**单一目标:** 新建按 (actor, contact) 存储的 `contact_insights` 读模型；在补全、memo、计划关联三个写入点把相关联系人标为待更新；维护任务在后台池额度内批量调用 DeepSeek 生成双语洞察；「洞察」标签、详情弹窗顶部、所有人脉列表三处只读存储，开页面 0 次模型调用。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 编制时 `chat-agent` = `a48e1749`（GitNexus 索引 `a48e174`）。本 Sprint 依赖 W0045～W0047、W0048a 先合并，它们会改联系人写入、详情弹窗、列表 SQL 和计划写入；下文行号按 `a48e1749`，开工时按符号重新定位并在 REPORT 登记差异。
**进入条件:**
- **W0045、W0046、W0047、W0048a、W0050 completed**（登记表依赖，README 为唯一来源，R-13；W0050 是因为本 Sprint 改它交接的待唤醒视图模型，W50-3；不依赖 W0048b）。从这四份 REPORT 的「交接」节**只取**下列名字，缺任何一项则不启动、登记 blocked：W0045 的 `ContactEnrichmentDTO`／`seniorityGroup`／`ContactRegionDTO`；W0046 的 memo 写入入口（`contact_detail_states.notes` 唯一写入函数）；W0047 的强度读模型（`orbit_records` 集合 `relationship_strengths`，W47-1；`tier`／`dormant` 字段与 `ensureRelationshipStrengths`）；W0048a 的账本 `reserve`／`beginCall`／`endCall`／`finish`（`pool`、`purpose: "insight"`、`retryOn`、错误码 `USER_DAILY_LIMIT`）、手动重新分析路由与三层更新入口 `runNewContactLayers` 的名字；W0050 的待唤醒视图模型（`OpportunitiesTabView.dormant` 与 `why` 拼句函数）的名字与文件。
- W51-1～W51-6 已定（D44，见文末）。
- 本机 `orbit_test` 可用，`node scripts/assert-local-test-databases.mjs` 通过。
- 真实 DeepSeek 调用：D43 允许、计入每日上限，每次在 REPORT 记次数与 token；测试与开发默认 mock provider（`scripts/test-paid-ai-boundary.mjs` 默认拦截付费主机）。
- 迁移只写文件与本机验证；生产迁移、部署、push 需单独授权。

## 本 Sprint 定稿的存储与触发点（W0052、W0054、W0055 只消费）

**新表 `contact_insights`**（迁移模块 `features/contacts/insights/migrations.ts`，照 `features/plans/migrations.ts` 写法：版本数组 + advisory lock + 自带 `contact_insights_schema_migrations` 校验和；注册到 `scripts/migrate-web-runtime.ts` 的 phases 与 `scripts/setup-minimal-staging.ts`）：

| 列 | 说明 |
| --- | --- |
| `workspace_id, actor_id, contact_id` | 主键；联系人必须属于 actor（写入前校验，读取时再按 `orbit_records` 归属过滤） |
| `status` | `pending`（等生成）／`ready`／`failed`／`blocked_no_goal`（无关系目标，不调用模型） |
| `goal_relation jsonb` `{zh,en}`、`next_step jsonb` `{zh,en}` | 各 ≤120 字；列表用 `goal_relation` 截断到 60 字 |
| `evidence jsonb` | `[{ source, id }]`，只允许 W0046 时间线的来源与该联系人的记录 id、计划条目 id；生成后服务端校验，越界丢弃 |
| `relevance smallint` | 0–100，**规则计算**（纯函数，见 W51-4），不由模型给 |
| `source_data_version text` | 该联系人输入指纹：补全三项 + 来源、该联系人 memo id 与更新时间、计划关联（`plan_items.contact_links` 中该联系人的 state）、关系目标文字的哈希。**不含强度档**（R-10）：强度只用于排序与展示，档位随时间衰减变化不让洞察过期、不改写文字（对标：档位实时显示，AI 文字按内容变化更新） |
| `dirty_at timestamptz null`、`dirty_reasons text[]` | 待更新标记；部分索引 `where dirty_at is not null` |
| `deferred_until timestamptz null` | 配额用尽时顺延到下一东京日 |
| `ai_state` | `none`／`started`／`done`，**调用前先提交 `started`**（照 `match-worker.ts` 防重复计费）；另有 `lease_owner text null`、`lease_expires_at timestamptz null`：只有用 CAS（`update … set ai_state='started', lease_owner=$me, lease_expires_at=now()+interval where … and (ai_state <> 'started' or lease_expires_at < now()) returning`）领取成功的执行器才可调用模型（R-11） |
| `usage jsonb`、`model text`、`generated_at`、`attempts`、`last_error_code`、`created_at`、`updated_at` | |

索引：`(workspace_id, actor_id, relevance desc, contact_id)`（洞察标签排序与分页）。

**契约（`shared/contract/contact-insight.ts`，名字按共享契约不得改）：**`ContactInsight { contactId; goalRelation: {zh,en}; evidence: {source,id}[]; nextStep: {zh,en}; relevance: number; sourceDataVersion: string; generatedAt: string }`，另加只读视图状态 `ContactInsightState = "ready" | "pending" | "no_goal" | "failed" | "none"`。

**触发点（只标记，不在请求里调用模型）：**`markContactInsightsDirty(client, { workspaceId, actorId, contactIds, reason })`，幂等 upsert；`reason ∈ "enrichment" | "memo" | "plan_link" | "goal" | "manual"`。调用位置：
1. 补全：名片确认写入后（v2 `createIngestV2ConfirmHandler` 的事务内或提交后，同一 contactId）、W0045 回填 apply、W0048a 三层更新入口 `runNewContactLayers` 的补全层（W0053 导入经它进来）。
2. memo：W0046 定稿的 memo 写入函数（`contact_detail_states.notes` 唯一写入处）。
3. 计划关联：`features/plans/service.ts:171 applyItemChange` 的 `link_contact`／`establish_contact`／`unlink_contact` 结果被持久化之处（`updateItem`、`linkNeedContact` 经 `linkWithin`、`decideMatchCandidate` 接受），在同一计划事务里标记受影响的 contactId。
4. 强度档变化：**不标**，且强度档**不进** `source_data_version`（R-10）。W0047 是读时按需重算（W47-2），档位只影响排序与列表显示（读取时实时取 W0047 读模型），不需要重写文字。
5. 目标更新（W51-1）：改关系目标**不立即**全量重算；读取时比对行内目标哈希与当前目标，不同则显示「目标已更新」角标；W0048a 手动重新分析（`POST /api/network/snapshot/recompute`）成功后、或每月重新分析（计划 reanalyze 路由）保存成功后，把该 actor 目标哈希不同的行统一标 dirty（reason `goal`）。
6. 单人「重新生成」（W51-2）：详情弹窗在洞察过期（`source_data_version` 落后或「目标已更新」）或 `failed` 时显示按钮；点击标 dirty（reason `manual`）并 `after()` 立即单独生成这一人：**先按上表 CAS 领取该联系人行的租约**（领取失败 = 已有执行器在跑，直接返回「正在生成」、0 次调用），领取成功后向**用户主动池**预留 1 次操作（`purpose: "insight"`、`trigger: "manual"`、`max_calls = 1`、幂等键 `insight-regen:<contactId>:<sourceDataVersion>`，同版本失败后最多再试 1 次），由该执行器唯一结算；不受后台池 60 次限制，但受用户主动池总熔断约束：**每人每东京日 10 次操作（含手动重新分析 3 次），用满后按钮置灰、提示「今天次数已用完，明天可用」**——已定（D45，2026-10-02）（R-11）。并发两次点击只有一个执行器调用 provider。

**生成：**维护任务 `contact-insights`（照 `features/plans/match-maintenance-task.ts`：每轮维护 pass 执行、有上限领取、`42P01` 表不存在时 skipped）。按 actor 分组领取 `dirty_at` 非空、`deferred_until` 已过的行，每次调用 ≤20 人（W51-5）；领取时同样用 CAS 把整组行置 `started` 并写租约；调用前向 W0048a 账本**后台池**预留 1 次操作（一批 ≤20 人 = 1 次；`pool: "background"`、`purpose: "insight"`、`trigger: "auto"`、`max_calls = 1`，每人每东京日共 60 次操作、与 memo 提取／导入补全／快照自动重算共用；每次 HTTP 记一条成本子账，维护任务唯一结算），预留失败（`daily_limit`）则整组 `deferred_until = retryOn（下一东京日 00:00）`、释放租约、0 次调用；一次调用同时出中英两种语言；输入只含姓名、公司、职位、职级分组（`seniorityGroup`）、地区、行业、强度档、近 5 条时间线摘要、计划人脉需求标题、关系目标——**不含邮箱、电话、memo 原文以外的私信**。输出按 `json_object` 解析，`contactId` 不在本组、证据 id 不属于该联系人的一律丢弃。无关系目标的 actor：不调用模型，行置 `blocked_no_goal`（W51-6）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/contacts/network-0918/network-cards.tsx`（64 行）：第 51 行表头「下一步（预览）」、第 56 行单元格 `{p.next}`；第 43–50 行 GET 筛选表单（`query`、`sourceGroup`）。
- `app/(app)/app/contacts/contact-card-view-model.ts`：第 9–23 行 `ContactCardView`／`ContactCardListView`／`ContactCardRouteView`；第 24 行 `contactCardsToView`（第 34 行 `next: card.nextActionPreview`）；第 50 行 `fetchContactCardView`。
- `app/(app)/app/contacts/contact-card-route-service.ts`（29 行）：参数白名单第 12 行 `["query","source","status","tag","value","cursor"]`，`limit=30`。
- `features/contacts/card-service.ts:12–43`（`createContactCardService`、读预算门 `["contacts","connections","contact_detail_states","evidence"]`、`readContactCardQuery`）。
- `features/contacts/storage/contact-list-postgres-reader.ts`：第 63–75 行 payload 白名单；第 91–104 行 `contactCardJsonSql`（**卡片 JSON 与 App 离线同步共用**，第 1259 行 `readContactSyncListRows`）；第 140 行 `createContactListSql`；第 1141 行 `createPostgresContactCardReader`，`page`（1214）、`summary`（1232），limit ≤50，游标 HMAC。
- `shared/contract/contact-card-page.ts`（`ContactCardDTO`）与 `shared/api-schema/contact-card-page.ts`（`z.object` 非 strict，App 解析会剥掉未知字段——只加可选字段安全）。
- `app/(app)/app/contacts/network-0918/network-detail-modal.tsx:54` 组件；第 139–165 行：洞察面板插在 hero（止于 154）与「关系概览」（155）之间；第 217–220 行旧「下一步建议」读 `contact.nextAction`（保留不动）。
- `app/(app)/app/contacts/[id]/page.tsx:172–241`：服务端 `loadAppContactDetailRoute` → `contactDetailPageViewModel(...)` → `openDetail={{ contact, closeHref, extra }}`；洞察在这里按 (actor, contactId) 读一行，作为 prop 传入。
- `app/(app)/app/contacts/dashboard/page.tsx`：第 33 行 `searchParams?: Promise<{ tab?: string | string[] }>`；第 56 行示例判定、第 73 行 live 判定（都只认 `structure|opportunities`）；第 85–87 行渲染。`network-0918/network-analysis.tsx`：第 24 行 `AnalysisTabKey = "struct" | "opp"`、第 119–123 行标签按钮、第 126／230 行二选一渲染。其他写死 `?tab=` 的链接：`network-overview.tsx:117`、`network-overview-model.ts:27,30`、`network-analysis.tsx:86`、`analysis/contacts-structure-detail.tsx:10`、`analysis/[dimension]/[bucketId]/page.tsx:24`（只核对，不改语义）。
- `features/plans/service.ts`：第 171 行 `applyItemChange`、第 211–251 行三种 link 操作、第 548 行 `linkWithin`、第 864／1014／1050 行 `updateItem`／`linkNeedContact`／`decideMatchCandidate`；`features/plans/repository.ts:475–507 writeItem`。
- 生成与任务先例：`features/plans/ai-matcher.ts`（请求、`json_object`、无密钥返回 null、不送联系方式）、`features/plans/match-worker.ts:44 runClaimedMatchJob`（`ai_state` 先落库）、`features/plans/match-maintenance-task.ts`。
- 数据库测试先例：`tests/capabilities/plans-repository.test.ts:23–120`（随机 schema、loopback 断言、跑迁移、结束 drop）。

### 关键符号（原样）与影响（GitNexus upstream，索引 `a48e174`）
- `export function createPostgresContactCardReader(input: { client: LiveRecordSqlClient; workspaceId: string; cursorSecret: string; now?: () => number; nodeRuntime?: () => NodeSortRuntimeInput; })` — LOW，直接 1（`createContactCardService`），影响 2 个流程。
- `function contactCardJsonSql(p: string): string` — HIGH，经 `createContactListSql` 间接 142（列表、同步、搜索都走它）。
- `function createContactListSql(...)` — HIGH，间接 191。
- `export function contactCardsToView(page: ContactCardPageDTO, params: string): ContactCardListView` — HIGH，直接 2。
- `export function createContactCardGetHandler(options: { summary?: boolean; resolveActor?: ResolveAuthenticatedApiActor; service?: (actor) => ContactCardService; } = {})` — HIGH，经路由间接 191。
- `export function NetworkCards({ view, openDetail }: { view: ContactCardRouteView; openDetail?: NetworkOpenDetail })` — LOW，直接 2（`AppContactsPage`、`AppContactDetailPage`）。
- `export function NetworkDetailModal({ contact, closeHref, onFollow: openFollow, extra, onClose, dialogRef }: { contact: OrbitContactView; closeHref: string; onFollow: () => void; extra?: ReactNode; onClose?: () => void; dialogRef?: Ref<HTMLDivElement> })` — LOW，直接 3（`NetworkAll`、`NetworkCards`、`NetworkDemoDetailDialog`）。
- `export function NetworkAnalysis({ viewModel, analysis, initialTab }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView; initialTab: AnalysisTabKey })` — GitNexus `UNKNOWN`；文本搜索：`dashboard/page.tsx:87` 与 `tests/pages/app-network-overview.test.tsx:50`。
- `export function applyItemChange(item: PlanItem, change: PlanItemChange, now: string): AppliedChange | null` — MEDIUM，直接 6（`linkWithin`、`addManualLog`、`markEventAttended`、`markEventRegistration`、`recordInteraction`、`updateItem`）。本 Sprint 不改它的语义，只在持久化后标记。
- `export function loadContactCardRoute(search, actor, options = {})` — LOW，直接 2。

### 前序交接要点
- W0045：职级值在 `publicProfile.seniorityLevel`（六档），统计与提示词一律用派生分组 `seniorityGroup()`（决策层／管理层／执行层／其他）；地区 `region {countryCode, city}`；补全来源统一在 `enrichment.fields`（含 W0046 写入的 offering／seeking／topics，C-4），`source_data_version` 的「补全三项 + 来源」读这里。
- W0046：memo 唯一写入 `contact_detail_states.notes`；时间线条目 `{ source, occurredAt, id, 摘要 }`——洞察证据只能引用这些 id。
- W0047：强度 `tier: "new"|"active"|"core"` + `dormant`；列表档位筛选与「洞察」标签排序依赖其存储位置（进入条件里取）。
- W0048a：两池账本（洞察批量 → 后台池，单人重新生成 → 用户主动池）与「明天更新」的 `retryOn`；三层更新入口 `runNewContactLayers`；手动重新分析路由；快照不存每人洞察（洞察是本 Sprint 的独立读模型）。
- 现状：`ConnectionDTO.relationshipStrength` 线上无写入方，列表 SQL 也不投影它——档位数据只能来自 W0047。

### 易错边界（都对应到 SC）
1. **开页面 0 次模型调用：**列表、详情、洞察标签三条读取路径不得 import 生成器或配额扣减（SC-01、SC-04 用 provider 桩计数为 0）。
2. **增量只标相关人：**一条 memo、一次计划关联只让对应 contactId 变 dirty；不得因打开页面或无关写入全量重算（SC-01）。
3. **不重复计费：**`ai_state=started` 先提交再调用；进程中途退出后该批不自动重调，标 `failed` 等下一次 dirty（SC-02）。
4. **配额：**后台池预留不到不调用，整组顺延到下一东京日，界面显示「明天更新」；单人重新生成走用户主动池，不被后台池用满挡住，但用户主动池总熔断（10 次操作／东京日，已定 D45）用满时置灰并提示「今天次数已用完，明天可用」（SC-02、SC-04）。
4a. **单人重新生成防重复调用（R-11）：**contact 级 CAS／租约，两路并发只有一个执行器调用 provider（SC-04）。
4b. **强度不进洞察版本（R-10）：**档位变化不让洞察过期、不改写文字（SC-01）。
4c. **待唤醒改读洞察（R-8，W50-3）：**W0050 待唤醒视图在洞察 `ready` 时用 `nextStep` 作「为什么现在联系」，`none`／`pending`／`failed`／`no_goal` 保留 W0050 规则拼句，读取 0 次模型调用（SC-04）。
5. **不编依据：**模型返回的证据 id 必须属于该联系人且在本次输入里出现过，否则丢弃；`relevance` 由规则算（SC-02）。
6. **跨端契约只加可选字段：**`ContactCardDTO` 新增字段可选，`nextActionPreview` 保留原语义（App 离线目录仍用）；分页游标、总数在加档位筛选后保持一致（SC-04）。
7. **越权：**洞察读写都按 actor 隔离；他人的联系人 id 出现在请求或输出里一律拒绝／丢弃（SC-01、SC-02）。

## 范围与文件

- 新建：`features/contacts/insights/{migrations,repository,generator,worker,maintenance-task,relevance,source-version}.ts`、`shared/contract/contact-insight.ts`（+ api-schema）、洞察标签组件 `app/(app)/app/contacts/network-0918/network-insights.tsx`、详情面板组件、对应测试。
- 修改：**W0050 待唤醒视图模型** `app/(app)/app/contacts/analysis/opportunities-view-model.ts`（`dormant[].why` 在洞察 `ready` 时取 `nextStep`）与 `opportunities-route-service.ts`（按待唤醒的 ≤5 位联系人读洞察行），及其测试 `tests/services/opportunities-view-model.test.ts`、`tests/pages/app-network-opportunities.test.tsx`（R-8）；`scripts/migrate-web-runtime.ts`、`scripts/setup-minimal-staging.ts`（注册迁移）；维护 pass 注册处（`features/operations/maintenance/**`，按 plan-match 的注册方式）；三个触发点所在文件（v2 confirm handler、W0045 回填 apply、W0046 memo 写入、`features/plans/service.ts` 持久化处）；目标更新标记点（`app/api/network/snapshot/recompute/route.ts`、`app/api/agent/plans/reanalyze/route-handlers.ts`，成功后只追加一次标记调用）；单人重新生成接口（`app/api/contacts/[id]/insight/regenerate/route.ts`，新建）；`contact-list-postgres-reader.ts`（卡片 JSON 加 `strengthTier?`、`insightPreview?: {zh,en}`；新增 `tier` 过滤）、`shared/contract/contact-card-page.ts` 与 schema、`card-service.ts`、`contact-card-route-service.ts`、`contact-card-view-model.ts`、`network-cards.tsx`、`network-detail-modal.tsx`、`[id]/page.tsx`、`dashboard/page.tsx`、`network-analysis.tsx`。
- 排除：引荐路径；快照叙述（W0048a、W0049、W0050）；概览驾驶舱（W0052）；示例模式的静态洞察（W0054）；App 端界面；`/api/mobile/contacts-dashboard` 现有字段语义。

## 验收契约（最多五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0051-01 | **增量标记。**对联系人 A 写一条 memo：只有 A 在 `contact_insights` 被标 dirty（reason `memo`），其余联系人与他人不变；打开列表／详情／洞察标签不标记、不生成 | `tests/services/contact-insights-postgres.test.ts`（本机库，证明未 skip） |
| SC-W0051-02 | **后台批量生成。**维护任务领取同一 actor 的 dirty 行，每 ≤20 人预留 1 次后台池操作、调用一次 DeepSeek，写回双语洞察 | worker 与 generator 单元测试（mock fetch 计数） |
| SC-W0051-03 | **「洞察」标签。**打开 `/app/contacts/dashboard?tab=insight`，第三个标签按人列出洞察（关系一句、依据、下一步、强度档），服务端分页 30 条 | 新 `tests/pages/app-network-insights.test.tsx` |
| SC-W0051-04 | **三处复用、单人重新生成与待唤醒改读洞察。**在详情弹窗对一位过期洞察的联系人连点两次「重新生成」（并发）：provider 恰好调用 1 次、用户主动池计 1 次操作；同一洞察 `ready` 后，W0050 机会标签待唤醒区该联系人的「为什么现在联系」显示其 `nextStep`（R-8、R-11） | 详情弹窗 + 重新生成路由并发测试（provider 计数）与 `tests/services/opportunities-view-model.test.ts` 改读用例 |
| SC-W0051-05 | **流量与收口。**按 D39 口径实测列表一页、详情一次、洞察标签一页的数据库读取字节（改前改后）并入预算表 | 测量脚本输出 + REPORT 预算表（`~/orbit-sprint-evidence/web/sprint-W0051/run-01/`） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 迁移建出 `contact_insights`（含租约列），本机库可重复执行、校验和守卫 | Postgres 测试 |
| 01 | 补全写入、memo 写入、计划关联（link／establish／unlink、接受匹配候选）三类触发点各一例：只有对应 contactId 被标、幂等、带 reason；无关写入不标；他人联系人不被标 | Postgres 测试 |
| 01 | **R-10**：`source_data_version` 不含强度档——同一联系人档位从 active 衰减为 new（时间线不变）后版本不变、不被标 dirty、洞察文字不变；列表与洞察标签的档位实时取 W0047 读模型 | source-version 单测 + Postgres 测试 |
| 01 | 三条读取路径对生成器桩与配额桩计数为 0 | Postgres／页面测试 |
| 02 | 后台池预留不到则整组顺延下一东京日、释放租约、0 次调用 | 配额桩测试 |
| 02 | 目标更新只在手动／每月重新分析后统一标 dirty（改目标本身 0 次标记、只显示角标） | worker／路由测试 |
| 02 | `ai_state` 先提交、批领取用 CAS，模拟中途失败不重复调用 | worker 测试 |
| 02 | 输出双语、证据越界丢弃、`relevance` 按规则函数；无关系目标置 `blocked_no_goal` 且 0 调用；请求体不含邮箱电话 | generator 单测（请求体断言）、relevance 表驱动测试 |
| 02 | 一批 1 次操作、每次 HTTP 一条子账，维护任务唯一结算 | 账本桩测试 |
| 03 | 排序 相关度／强度档／最近往来；筛选 行业／地区（W0045 `region`）／强度档 | 页面测试 |
| 03 | 状态 待生成／明天更新／未设目标／失败各有真实文案（中英） | 组件测试 |
| 03 | 其他 `?tab=` 链接与示例判定照旧 | `app-network-overview.test.tsx` 扩展；`app-contacts-dashboard-account-scope.test.ts` 不回归 |
| 04 | 详情弹窗 hero 下方「和你目标的关系」（同一行数据，四种状态）；过期或失败时才显示「重新生成」 | `app-network-detail-modal.test.tsx` |
| 04 | **R-11**：并发两次点击只有一个执行器经 CAS 领到租约并调用 provider（provider 计数 = 1）；同版本重复点击不重复计次；后台池用满时照常可用；用户主动池当日 10 次操作用满时按钮置灰、提示「今天次数已用完，明天可用」、接口 429 `USER_DAILY_LIMIT`、0 次调用（已定（D45，2026-10-02）） | 路由 Postgres 并发测试、组件测试 |
| 04 | **R-8**：W0050 待唤醒视图模型——洞察 `ready` 时 `why` = `nextStep`（按界面语言）；`none`／`pending`／`failed`／`no_goal` 时保留 W0050 规则拼句；读取过程 0 次模型调用、0 次配额预留 | `opportunities-view-model.test.ts`（四种状态）、`app-network-opportunities.test.tsx` |
| 04 | 所有人脉列表把「下一步（预览）」列换成 强度档 + 洞察一句（≤60 字）；强度档筛选为服务端 SQL 过滤，`total`、各来源计数、游标翻页在筛选下一致 | `tests/services/contact-card-page-postgres.test.ts`、`tests/api/contact-card-page.test.ts`、`contact-list-pagination-route.test.ts`、`contact-card-route.test.ts` |
| 04 | **R-9**：`ContactCardDTO` 只加可选字段，`nextActionPreview` 不变；同步卡片只多可选字段；本 Sprint diff 不含 `repos/orbit-app` | `sync-contact-domain-postgres.test.ts`、`git diff --stat` |
| 05 | 按 1000 活跃用户 × 30 天 ×（列表 2 次／天、详情 3 次／天、洞察标签 0.5 次／天，假设写进 REPORT）折算月增量；超 1.6 GB 如实登记 D32 | REPORT 预算表 |
| 05 | typecheck、一次全量基线对照（新增失败 0）、一次 Codex 代码 review；三处 1440／375 截图 | `npm test` 基线对照清单、截图 |
| 05 | 若做真实生成演练（本机），按子账记录调用次数与 token；REPORT「App 影响」一节（R-9） | REPORT |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；按进入条件从 W0045～W0047、W0048a REPORT 交接节取名字并写进 REPORT「假设与额外阅读」；缺项则 blocked。
2. 批量 impact（上表符号 + 三个触发点函数）；HIGH 先报告，`UNKNOWN` grep 补查。
3. 迁移与 repository（SC-01）→ 触发点（SC-01）→ generator／worker／任务（SC-02）→ 列表与详情（SC-04）→ 洞察标签（SC-03）；每步 RED → GREEN；最多两轮本地修复。
4. 测量与浏览器验证（SC-05），证据存 `~/orbit-sprint-evidence/web/sprint-W0051/run-01/`。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0051-contact-insights` 提交 → REPORT → 协调者合并回 `chat-agent` 并验证合并树；Codex 代码 review 一次，意见交回本 Generator。

## 最小测试与检查

- **档位：H**（新表与迁移、共享卡片契约与同步 SQL、付费 AI 调用与配额、计划写入事务加标记）。
- **开发定向集**：新增 `tests/services/contact-insights-postgres.test.ts`、insights 单元测试、`tests/pages/app-network-insights.test.tsx`、`app-network-detail-modal.test.tsx`、`tests/services/contact-card-page-postgres.test.ts`。
- **操作链收口集**：上述 + `tests/api/contact-card-page.test.ts`、`contact-list-pagination-route.test.ts`、`tests/services/sync-contact-domain-postgres.test.ts`、`contact-owner-boundary.test.ts`、`contact-search-runtime.test.ts`、`tests/architecture/offline-policy.test.ts`、`tests/performance/contact-card-growth.test.ts`、`tests/pages/contact-card-route.test.ts`、`app-network-overview.test.tsx`、`app-contacts-dashboard-account-scope.test.ts`、`app-network-demo-mode.test.tsx`、`tests/capabilities/plans-repository.test.ts`、`plan-current-view-postgres.test.ts`、`tests/api/agent-plan-candidates-routes.test.ts`、`tests/capabilities/contact-detail-note-preservation.test.ts`、`tests/api/business-card-ingest-v2-routes.test.ts`；`npx tsc --noEmit -p .`。
- **全量**：本地代码收口一次 `npm test`，RULES 5.2 基线对照。
- **App 端（R-9）：**本轮只做 Web，**不产生任何 `repos/orbit-app` commit**，也不以 App 契约同步作为完成条件。`shared/contract/contact-card-page.ts`、新契约 `shared/contract/contact-insight.ts` 与 schema 只加 optional 字段／新文件，`nextActionPreview` 原语义不变，旧响应可被旧 App 解析（SC-04 的同步卡片与 schema 用例即为证据）。已知后果：App 仓库的副本校验测试（`repos/orbit-app/tests/contract-sync.test.ts`、`api-schema-sync.test.ts`）在 App 线同步前会报副本过期，属预期跨端待办；Generator 在 REPORT「App 影响」一节列出改动的 `shared/*` 文件、新增 optional 字段、旧客户端行为、未验证范围，由 W0055 汇总进 Bridge handoff。
- **不运行：**生产迁移；生产真实生成；全量回填（RN-13／W0055）。

## 失败与交接

依赖未齐或名字取不到：不启动，登记 blocked。run 开始后失败按规则写 failed／blocked 报告。
REPORT 交接给 W0052／W0054／W0055：`contact_insights` 表结构与迁移版本（含租约列）、`markContactInsightsDirty` 签名与各调用点、维护任务名与每轮上限、`ContactInsight` 契约文件、卡片 DTO 新增字段、W0050 待唤醒改读洞察的接线点、流量实测与预算表行、真实调用次数与 token（按子账聚合，如有）、「App 影响」一节（R-9）。W0055 回填顺序「补全 → 强度 → 洞察 → 快照」中的洞察一步直接把全部联系人标 dirty 交给本任务消化。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W51-1 | 改目标不立即全量重算：行内目标哈希不同时显示「目标已更新」角标；随 W0048a 手动重新分析（用户主动池，每天 ≤3 次，受总熔断 10 次操作约束）或每月重新分析统一标 dirty 重算 | HubSpot 记录摘要：数据变化后标记过期，按需或下次触发时再生成，不在属性变更时批量重写 |
| W51-2 | 详情弹窗给单人「重新生成」按钮，仅在过期或失败时显示，点一次标 dirty 并立即排队，计入**用户主动池** 1 次操作（幂等键 contactId + sourceDataVersion；rev 3：contact 级 CAS／租约防并发重复调用，受总熔断约束，R-11） | HubSpot Breeze「Regenerate summary」、Notion AI 摘要的手动刷新 |
| W51-3 | 列表洞察句返回双语各截 60 字（卡片接口与 App 同步不分语言），实测字节进预算表；超预算时另行登记改为按语言返回，不在本 Sprint | Notion／HubSpot 列表视图只显示一行截断摘要，全文在详情 |
| W51-4 | 目标相关度规则计算（计划需求已确认关联 > 待确认候选 > 行业与需求一致 > 强度档 > 最近往来，纯函数并测试），模型只写文字 | Apollo／HubSpot 线索评分：分数独立于 AI 文案，AI 只解释为什么 |
| W51-5 | ≤20 人一批，同一 actor 才合批，单批失败只影响这一批；每批计 1 次后台池操作，每次 HTTP 一条成本子账 | Apollo、Clay 按小批调用并逐批记账 |
| W51-6 | 未设关系目标不生成洞察，显示「设置关系目标后生成」并直链目标编辑；不消耗任何池 | Apollo 打分前要求先定义 ICP；LinkedIn Sales Navigator 先设偏好再给推荐 |
