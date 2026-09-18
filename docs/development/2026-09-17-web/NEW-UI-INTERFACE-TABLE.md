# 新 UI 可消费的已验接口表

更新：2026-09-18。用途：Web UI 重做时，直接消费本轮已通过主代理验收的服务层/读取层，不重造；同时明确哪些旧计划批次停止、哪些收尾。

来源树：`/Users/li/work/orbit-web-integration-20260917`，HEAD `1f492f49`（工作树干净、未部署）。下文路径均相对该树 `repos/orbits/`。每项的验收证据（测试数、typecheck、图谱）见 [EXECUTION.md](EXECUTION.md)；此表只列**入口、契约形状、测试文件、边界**。

口径：`已验` = 主独立集成树通过，非生产验收；`UI 无关` = 不依赖任何现有页面组件，新 UI 可直接 import；`页面耦合` = 逻辑在旧 `.tsx` 里，新 UI 需先抽出再用。

## 一、UI 无关、可直接消费

### 首页 / 工作台

| 入口 | 文件 | 返回形状 | 测试 | 边界 |
| --- | --- | --- | --- | --- |
| `loadHomeFacts({actorId, snapshotAt?, dependencies?})` | `app/(app)/app/agent/home-facts-route-service.ts` | `HomeFactsRouteModel`：`tasks / followups / personal / appointments` 四源各带 `state: ready\|empty\|unavailable`、`count`、分组 `overdue/plan-past/recent/undated`，`window` 固定产品日窗口 | `tests/pages/app-home-facts-route-service.test.ts`、`app-home-facts-followup-reader.test.ts` | 非事务快照；默认无配置时四源全部 `unavailable/count=null`；不承诺任意规模恒定成本 |
| `homeFactsToViewModel(model)` | `app/(app)/app/agent/home-facts-view-model.ts` | `HomeFactsViewModel`：纯展示模型，计数先于截断 | `tests/pages/app-home-facts-view-model.test.ts` | 纯函数，无 IO |
| `loadHomeDashboardSnapshot({actor, snapshotAt?})` | `app/(app)/app/agent/home-dashboard-route-service.ts` | `HomeDashboardSnapshot`：`owner`、`facts: HomeFactsViewModel`、`recommendations: {state, items[]}`、`snapshotAt` | `tests/pages/app-agent-home-dashboard-entry.test.ts` | 服务端聚合，局部失败隔离；HTTP 传输/整页成本未验 |
| `refreshHomeDashboardAction()` | `app/(app)/app/agent/home-dashboard-actions.ts` | server action，无参；`{state: "snapshot", snapshot} \| {state: "unauthenticated"} \| {state: "unavailable"}` | 同上 | 每次逐次鉴权，要求 canonical actor（`accountId === id`） |
| `loadRelationshipLifecycleTasks(...)` | `app/(app)/app/tasks/relationship-lifecycle-tasks.ts` | `RelationshipLifecycleTaskReadModel` | `tests/pages/app-home-facts-followup-reader.test.ts` | 默认链 1 条 SQL；旧任务页路径仍 4 次读取（未改） |
| `createConfiguredRelationshipLifecycleFactsReader(...)` | `features/followups/storage/relationship-lifecycle-facts-reader.ts` | `RelationshipLifecycleFacts`（PG 窄读取，严格授权） | `tests/services/relationship-lifecycle-facts-reader-postgres.test.ts` | 真实 PG 测试需本地库 |

### 活动推荐

| 入口 | 文件 | 返回形状 | 测试 | 边界 |
| --- | --- | --- | --- | --- |
| `createPublicGoalRecommendationsService(deps).recommend({accountId})` | `features/events/public-goal-recommendations.ts` | `{state: success\|needs_goal\|no_match\|unavailable, items[]}`，item 含 `eventId/publicCode/title/startsAt/venue/matchedTokens/sourceEvidenceIds` | `tests/services/public-goal-recommendations.test.ts` | 严格词法匹配（非语义 AI）；稳定前三；排除本人主办/已报名；小写化语义已纠正 |
| `createConfiguredPublicGoalRecommendationsRuntime(opts)` | `features/events/public-goal-recommendations-runtime.ts` | 上者的已配置实例；缺 provider 返回 `unavailable` | `tests/services/public-goal-recommendations-runtime.test.ts` | — |

### 活动详情 / 列表 / 报名

| 入口 | 文件 | 返回形状 | 测试 | 边界 |
| --- | --- | --- | --- | --- |
| `resolveConfiguredCanonicalEventDetailView({routeId, actorId?})` | `app/(app)/app/canonical-event-detail-view.ts` | `authentication_required \| forbidden \| not_found \| unavailable \| {state: success, event: OrbitLandingEventView, registrationAvailability, registrationBlockingReason?, registered, canOpenOperations, workspaceAvailable}` | `tests/pages/app-canonical-event-detail-view.test.ts`、`app-event-detail-page.test.tsx` | 真实 policy 容量；人数「未知」与 0 区分；名单不覆盖摘要 |
| `getOrbitLandingEventView(...)` / `getOrbitLandingViewModelFromCatalogue(...)` | `app/(app)/app/orbit-landing-route-view-model.ts` | `OrbitLandingEventView`、`OrbitLandingViewModel` | `tests/pages/app-home-events-source.test.ts`、`app-events-view-switcher.test.ts` | **共享 mapper HIGH**（详情/home/公开主办方三个调用方）；改动需覆盖三处 |
| `getOrbitRegisteredEventViewModel(...)` | `app/(app)/app/orbit-registered-event-route-view-model.ts` | 本人已报名活动 VM | `tests/pages/app-registered-event-lifecycle.test.ts` | — |
| HTTP `GET/POST /api/events/[id]/registration`、`POST .../registration/cancel` | `app/api/events/[id]/registration/**` | 严格回执＋独立 GET 回读 | `tests/api/event-registration-account-scope.test.ts`、`tests/pages/event-registration-readback.test.tsx` | 以 canonical `accountId` 为身份，无 canonical 时 fail-closed；历史 raw 报名兼容与 App 回执消费是**发布门**（BR-031） |
| HTTP `GET/POST/DELETE /api/events/[id]/admission/application` | `app/api/events/[id]/admission/application/route.ts` | 准入申请/撤回回执 | 同上 | scope 迟到响应隔离已在旧 workspace 验证，新 UI 需自行复现该隔离 |

### 个人资料 / onboarding / 门禁

| 入口 | 文件 | 返回形状 | 测试 | 边界 |
| --- | --- | --- | --- | --- |
| `loadAppProfileRouteViewModel(...)` | `app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts` | `AppProfileRouteViewModel`（success/state），failure 对象含错误码与恢复链接（中英） | `tests/pages/app-profile-live-route-services.test.ts` | routeState 入口 **CRITICAL**（admin/home 也消费）；失败文案不再写死示例身份 |
| `profileRouteToOrbitProfileEditorViewModel` / `profileEditorUpdateInput` / `profileEditorReadbackMatches` / `profileEditorViewFromPayload` | `app/(app)/app/profile/profile-editor-adapter.ts` | 编辑器 VM ↔ PUT payload ↔ 回读比对；`ProfileEditorSaveScope = basic \| matching` | `tests/pages/app-profile-onboarding-editor.test.tsx`、`app-profile-editor-failure-paths.test.tsx` | 基础资料与匹配资料分开保存；窄字段 CAS 用 `expectedUpdatedAt`，冲突返回 409 |
| HTTP `GET/PUT /api/profile` | `app/api/profile/route.ts` → `handlers.ts`；CAS 逻辑 `features/profile/live-service.ts:535-545` | PUT 带 `expectedUpdatedAt`/`mutationId`，不匹配 → 409 | 同上 + `tests/capabilities/profile-actor-postgres-parity.test.ts` | 正常读按 actor 下推（D20），custom/mutation 仍全读 |
| `normalizeProfileOnboardingNext` / `normalizeProfileAuthReturnPath` / `profileOnboardingPath` / `profileContinuationPath` | `app/(app)/app/profile/profile-onboarding-navigation.ts` | 合法 next / 回跳路径 | `tests/pages/app-profile-onboarding-navigation.test.ts` | 纯函数 |
| `readProfileOnboardingAccess(session)` | `app/(app)/app/profile/profile-onboarding-access.server.ts` | `{status: complete \| incomplete \| unavailable, actorId?}` | `tests/pages/profile-onboarding-access.test.ts` | 仅 live mode；非 live 返回 `unavailable` |
| `shouldGateProfileOnboardingRequest` / `isProfileOnboardingNavigationExemptPath` / `profileOnboardingRedirectPath` + `proxy.ts` | `app/(app)/app/profile/profile-onboarding-route-policy.ts`、`proxy.ts` | 已登录 GET/HEAD 按持久化资料判定重定向 | `tests/ui/profile-onboarding-proxy.test.ts`、`maintenance-proxy-integration.test.ts` | **新 UI 换路由必须同步豁免表**；API/POST 不受限；已展示页面无网络不即时撤销 |

### 名片摄取（V2）

| 入口 | 文件 | 返回形状 | 测试 | 边界 |
| --- | --- | --- | --- | --- |
| `createInitialPairing` / `pairPhotoAsBack` / `unpairBackPhoto` / `pairingManifest` / `freezeManifestSubmission` | `app/(app)/app/contacts/new/batch2/ingest-v2-route-view-model.ts` | `PairingCard[]` → `IngestManifestEntry[]`；冻结提交 | `tests/pages/ingest-v2-route-view-model.test.ts`、`app-business-card-ingest-v2-pairing.test.tsx` | 双面显式配对，一次确认只创建一个联系人 |
| `groupIngestItemsByCardId` / `initialCardDraft` / `reconcileCardDraft` / `setDraftFieldSource` / `buildConfirmationPayload` / `readConfirmationReceipt` | 同上 | 卡片草稿、字段来源选择、整卡幂等确认 payload/回执 | 同上 | 来源/版本复核；`eventIdFor` 变更为 HIGH，勿动 |
| `INGEST_V2_COPY` / `countCopy` | `app/(app)/app/contacts/new/batch2/ingest-v2-copy.ts` | `{en, zh, ja}` 三语文案 | — | 仅名片流程局部三语，不是全站字典 |
| HTTP `POST /api/contact-drafts/business-card/uploads`、`.../batches/v2`、`.../batches/v2/[batchId]/items/[itemId]/(content\|replace)`、`POST /api/contacts/business-card/confirm` | `app/api/contact-drafts/**`、`app/api/contacts/business-card/confirm` | 上传 / 批次 / 单项内容 / 整卡确认 | `tests/capabilities/business-card-ingest-v2-repository.test.ts` | 真实 OCR、实体相机、跨端远程回读**未验** |

### 联系人列表 / dashboard / 提醒（后端，UI 间接消费）

| 入口 | 文件 | 说明 | 测试 | 边界 |
| --- | --- | --- | --- | --- |
| `createHybridContactsListSearchAndFilterService` / `runContactsGraphQuery` / `buildAvailableFiltersFromFacetCounts` | `features/contacts/contact-graph-query.ts` | 完整 DTO 语义的 SQL 分页、全局 facets、微秒游标 | `tests/capabilities/contact-search-pagination.test.ts` | 未知 Unicode 运行环境走完整 JS fallback；**Web 自身搜索分页（B2）仍在实施** |
| `createPostgresContactListPageReader` | `features/contacts/storage/contact-list-postgres-reader.ts` | `ContactRecordPage` | 同上 | — |
| `createLiveDashboardAggregateService` / `createDashboardSummaryPostgresReader` | `features/dashboard/live-service.ts`、`storage/dashboard-summary-postgres-reader.ts` | 独立摘要 SQL；同请求同 provider/actor 在途复用 | `tests/capabilities/bootstrap-dashboard-egress-bounds.test.ts`、`tests/services/read-projection-parity-postgres.test.ts` | 共享 provider **CRITICAL**；跨请求不复用 |
| `loadAppDashboardRouteViewModel` | `app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-route-view-model.ts` | `AppDashboardRouteViewModel` | 同上 | 分析页三页签收敛未做，VM 形状会随 W4 方案变 |
| `createReminderPlanService` / `claimCanonicalReminderWakes` / `processConfiguredCanonicalReminderWake` | `features/notifications/reminder-plan-service.ts`、`canonical-reminder-wake.ts` | 纯站内 plan/wake 事务、公平轮转、租期 | `tests/services/canonical-reminder-*.test.ts`、`reminder-plan-service.test.ts` | 默认 publisher 未启用；无真实 Push；不是提醒 SLA |

## 二、页面耦合：批次 1 已抽出的纯模型与仍待抽的 hook

批次 1（分支 `newui/foundation-batch-1`，父 `1f492f49`，提交 a4e357bd → cbe9c442 → d867c694）已把三个页面的纯逻辑抽成独立 `.ts` 模块，零行为变化，13 个页面/模型测试 110/110、全 typecheck 0。

| 能力 | 现在在哪 | 新 UI 用 | 测试 |
| --- | --- | --- | --- |
| 探索页 scope/话题/筛选/卡片动作 | `events/explore-model.ts` | `EVENT_SCOPES`、`eventScopeFromValues`、`eventScopeSearchString`、`eventCardActionKind`、`eventTopics`、`topicLabel`、`exploreTopicFilters`、`matchesExploreFilters` | `tests/pages/app-events-explore-model.test.ts` |
| 报名回执核对/问卷转写/状态卡判定 | `events/[id]/register/registration-workspace-model.ts` | `matchesAdmissionApplicationReceipt`（图谱 HIGH：工作区内 3 处调用）、`isStatusCardApplication`、`answersFromTranscript`、`transcriptFromAnswers`、`registrationFieldLabel`、`registrationCopy` | `tests/pages/event-registration-workspace-model.test.ts` |
| 资料保存作用域/校验/409 判定/草稿保留合并 | `profile/profile-save-model.ts` | `profileSaveScopeFields`、`validateProfileSaveDraft`、`visibleCharacterCount`、`profileSaveFailureKind`、`mergeProfilePreservingDraft`、`emptyProfileAfterReload` | `tests/pages/app-profile-save-model.test.ts` |

仍寄生在旧 `.tsx`、批次 2 抽成 hook：

| 能力 | 现在在哪 | 建议抽出为 | 备注 |
| --- | --- | --- | --- |
| 资料 Reload/Save 会话编排（operationEpoch、in-flight、pendingSave、fetch GET/PUT/回读、迟到响应丢弃） | `profile/orbit-real-profile.tsx` `saveProfile`/`reloadLatestProfile` | hook `useProfileEditorSession()` | 纯逻辑已在 profile-save-model；失败路径测试可复用 |
| 报名/准入提交→独立 GET 回读→scope 迟到隔离→AbortController | `events/[id]/register/event-registration-workspace.tsx`（约 25 个 state/ref） | hook `useRegistrationReceipt()` | `tests/pages/event-registration-readback.test.tsx` 覆盖 |
| 探索页 URL `scope` ↔ state 同步、地图/模块切换 | `events/orbit-real-explore-client.tsx` | 小 hook | 地图仅示意 |
| 名片 V2 页面接线（上传→批次→配对→确认） | `contacts/new/batch2/[id]/business-card-ingest-v2-view.tsx` | 保留 VM，重写视图 | VM 已 UI 无关 |
| I ORBIT 输入区 / 引用 `references: []` | `agent/orbit-real-agent.tsx:1557,2807` | W4 A1 picker 主未集成 | 等 W4 逻辑层交付后作为 hook 引入，**不接旧页面** |

## 三、旧计划批次处置

### 继续收尾（服务层，UI 无关，新 UI 也要用）

- W0 B2：Web 私有分页两层兼容 —— 新联系人列表 UI 的数据源。
- W0 B4：详情原子 runner / TX 原精度 metadata reader —— 新联系人详情写入的前提；P1-14 修复依赖它。
- W1 词表政策（P1-10）：职位/供需/话题正式词表 —— 产品决策，与 UI 无关。
- W3 六 route 审计遗留：时区显示不一致、未报名错误 copy —— 修在 VM/服务层。
- W4 A2/A3 逻辑层：actor-scoped 草稿、expected-actor 拒绝、迟到响应隔离 —— **只交付 hook/service + 测试，不改旧页面**。
- BR-031 发布门：历史报名身份 + App 回执消费。
- B5 P2 公平轮转纠正。

### 立即停止（会被新 UI 推翻）

- W5 「I 初读 composition」及首页 UI B 批次。
- W4 分析页三页签收敛布局、`agent/page.tsx`/`orbit-real-agent.tsx` 接线。
- W2 P1-14 的 UI/adapter 编码（保留只读类型设计与复现证据）。
- W3 任何探索页/详情页视觉批次。
- 任何往 `orbit-real-*.tsx` 追加功能的申请。

### 解散前置

- W1–W4 worktree 与 [EXECUTION.md §共享文件单一写入者](EXECUTION.md) 的文件锁在新 UI 启动前正式解散，改为新 UI 的目录级所有权；否则新旧写入者会撞 `agent/page.tsx`、`orbit-landing-route-view-model.ts`、`profile-route-view-model.ts`。
- 各领域 REPORT 与 raw 证据归档到集成树 `docs/development/web-2026-09-17/`，不随 worktree 删除丢失。

## 四、需要用户决定的技术边界

新 UI 的范围决定上表第一节能否原样复用：

| 选项 | 含义 | 对上表的影响 |
| --- | --- | --- |
| A. 只换组件层（保留 Next.js App Router、路由路径、SSR/proxy） | 重写 `app/(app)/app/**` 下的视图与样式 | 第一节全部直接 import；`proxy.ts` 门禁与豁免表原样有效 |
| B. 换路由结构，仍在同一 Next.js 应用 | 路径重排，可能合并页面 | 门禁豁免表、`profileOnboardingPath`/`profileContinuationPath`、`orbit-product-href.ts` 需同步；其余 service 不受影响 |
| C. 独立前端应用（另一个 Next/SPA），只通过 HTTP | 完全分离 | 只能用 HTTP 行（`/api/profile`、`/api/events/[id]/registration`、名片 ingest 端点）；`loadHomeFacts`/`loadHomeDashboardSnapshot`/`resolveConfiguredCanonicalEventDetailView` 等 server 入口需先包一层 route handler 才能用，且 server action `refreshHomeDashboardAction` 不可用 |

建议 A 或 B；C 会让本轮约一半已验入口需要再包一层 API 并重新验收。

## 五、新 UI 的验收纪律（沿用本轮口径）

每个新页面交付时须列：消费了上表哪些入口；沿用了哪些测试；哪些行为是新写的及其测试；是否触碰 HIGH/CRITICAL 共享符号（`getOrbitLandingEventView`、profile `routeState`、dashboard 共享 provider、`eventIdFor`）。不把「看起来能跑」当通过。
