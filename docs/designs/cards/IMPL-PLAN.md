# 名片夹 · 真实代码复刻实施计划 (IMPL-PLAN)

> 目标：把 `docs/designs/cards/` 的 5 屏 HTML 原型，**像素级 1:1** 复刻实现到真实应用仓库 `repos/orbits`，数据先走 mock（mock-to-live 边界），人脉表盘归入名片夹板块。
> 配套接口文档：见 [FRONTEND-CONTRACTS.md](FRONTEND-CONTRACTS.md)（所有新界面的前端函数定义与接口）。
> 已确认决定：① 表盘路由放名片夹板块（`/home/cards/dashboard`）；② 新字段先 mock；③ 本计划存档；④ **UI 像素级完全一致**；⑤ 前端函数/接口单独成文档。

---

## 0. 铁律（repos/orbits/AGENTS.md，必须遵守）
- 只改 `repos/orbits/` 内，用 app-relative 路径（`app/…`、`features/…`），不碰 harness / 根 docs / `repos/tokyo-business-connect`。
- **Mock-to-live 边界**：`features/<m>/contract.ts` → `mock-service.ts` → `app/api/**` route → `/dev/capabilities/**` 验证面 → `/app/**` 路由组合。新字段/新服务先在 mock 落地，live provider 以后接。
- 调用方经 `features/<m>/service-factory.ts` 取服务；**presenter 组件不调 service-factory / mock / provider**。
- 页面组件只吃**页面级 view-model**（`*-route-view-model.ts` / `*-route-service.ts`），不直接吃 feature DTO。
- UI 不 branch on provider 名/环境变量/raw payload/fixture 细节。
- 每模块补测试：contract、mock「no external call」、API envelope（success/empty/pending/failure）、page render。

## 1. 像素级一致策略（决定 ④）
原型的 `orbit-cards-framework.css` 是**逐值抽取自** `repos/orbits/app/(app)/app/orbit-reference-styles.tsx`，原型顶栏也是照 `AccountTopNav/OrbitTopNav` 复刻。复刻时：
1. **优先复用现有类**：`.orbit-top-nav/.card/.chip/.btn/.field/.avatar/.status-pill/.hbar/.timeline/.stage-track` 等真实类已存在 → presenter 直接套用，视觉自动一致。
2. **原型新增的类**（`.basis/.rev/.orbit-ring/.qrow/.aet/.toast/.sheet/.dist/.conf` 等）→ 把 CSS **原值**并入 `orbit-reference-styles.tsx`（同一 token 体系），class 名保持一致。
3. **逐屏对比校验**：实现后用 `docs/designs/cards/*.html` 与真实页并排截图，核对间距/字号/圆角/颜色/阴影/动效；差异清零才算完成（Definition of Done 见 §6）。
4. 字体、渐变、玻璃、动效（星图自转/呼吸、reduced-motion）全部与原型一致。

## 2. 已存在、可直接复用（省一大块工作量）
| 能力 | 真实仓库位置 | 复用方式 |
|---|---|---|
| 顶部导航 | `AccountTopNav` / `OrbitTopNav`（`orbit-account-shell.tsx`/`orbit-public-shell.tsx`） | 原型就是照它做的 → 0 改动 |
| 设计 token / 基础组件 | `orbit-reference-styles.tsx`、`orbit-reference-primitives.tsx`（`Avatar/Cover/Icon/Logo`） | 直接用 |
| 依据/来源浮层 | `shared/ui/provenance-disclosure.tsx`、`shared/ui/source-chip.tsx` | 封装成 `<Basis>` |
| 名片列表/管线/图谱/引荐/详情 | `orbit-real-contacts.tsx`（`OrbitRealCardsList/Pipeline/Graph/Intros/CardDetail/Scan`）+ `orbit-contacts-route-view-model.ts` | 在其上增强 |
| 名片 OCR 复核 | `features/acquisition/`（`business-card-review-service` mock 全套） | 建 UI 接上 |
| 跟进任务 / 邮件草稿 | `features/followups`（`createFollowupTaskGenerationService`/`createMessageDraftGeneratorService`）、`app/api/message-drafts` | 接上 |
| 价值评分 | `features/analysis`（`relationship-value-scoring`、`value-contract.ts`） | 供价值标签/高价值判定 |
| 表盘聚合 | `app/api/dashboard/{summary,distributions,opportunities,network-gaps}`（已存在） | 表盘复用其响应 |

## 3. 需要新增/扩展的（先 mock）
- **契约扩字段**：contacts 加 `strength / valueTags / nextAction / lastInteractionAt / dormant`；connections 加 `valueAToB / valueBToA`；profile 加 `currentGoal`（目标唯一来源）。
- **新服务**：`createRelationshipDashboardService()`（若现有 dashboard API 覆盖不全再补聚合）。
- **新共享组件**：`<Basis>`、`<OrbitEmailComposeSheet>`、`<OrbitRelationshipMap>`（星图）、`<OrbitToast>`、`<OrbitBottomSheet>`。
- 详细类型/签名见 [FRONTEND-CONTRACTS.md](FRONTEND-CONTRACTS.md)。

## 4. 分阶段（每 Phase 一个 PR，独立可验收）

### Phase 0 · 共享构件 + 样式并入
- 把原型新增 class 的 CSS 原值并入 `orbit-reference-styles.tsx`。
- 新建 `shared/ui`（或 contacts 局部）组件：`<Basis>`（封装 provenance-disclosure）、`<OrbitToast>`、`<OrbitBottomSheet>`、`<OrbitEmailComposeSheet>`（接 message-drafts）、`<OrbitRelationshipMap>`（星图，props 见接口文档）。
- 验收：/dev 下渲染这些组件的 success/empty/pending/failure 与 hover/click 态。

### Phase 1 · 契约 + mock + view-model 扩字段
- 扩 `features/contacts/contract.ts` + `detail-contract.ts`、`features/connections/contract.ts`、`features/profile` 契约；同步 mock fixtures。
- 扩 `orbit-contacts-route-view-model.ts`：`OrbitContactView` 增 `strength/valueTags/nextAction/lastInteractionAt/dormant`；`OrbitContactDetailView` 增双向价值/阶段/时间线证据。
- 扩 profile view-model 暴露 `currentGoal`。
- 验收：contract 测试 + mock no-external-call 测试。

### Phase 2 · 名片夹主列表（竖切样板）→ `OrbitRealCardsList`
- 升级 `PersonCard`：来源徽标、关系强度、价值标签、下一步动作(+依据)、最近互动；顶部自然语言搜索栏（`contacts.search({query,nlIntent})`）。
- 走完整链路：view-model → presenter → `app/api/contacts` envelope → `/dev` → `/app/home/cards`。
- **本阶段作为像素级样板**，跑通后再并行铺其余屏。

### Phase 3 · 卡片详情 + 连接画像 → `OrbitRealCardDetail`
- 两栏：人物名片(联系方式/标签/双向价值) + 连接画像(关系类型、12 阶段进度+rationale、带证据时间线、下一步)。
- 「起草打招呼」→ 改为 `<OrbitEmailComposeSheet>`（邮件式，发送前确认）。
- 接 `connections` 服务（evidence/timeline/stage-profile）+ `analysis`（双向价值）。

### Phase 4 · 人脉表盘（新路由，归名片夹板块）→ `app/(app)/app/contacts/dashboard/`
- 路由 `/home/cards/dashboard`；CRM 侧栏加入口；view-model 聚合现有 `app/api/dashboard/*`。
- `<OrbitRelationshipMap>` 星图（半径=强度、扇区=行业、光点=联系人、大小=价值；上千转密度）+ 本周行动队列(接 followups) + 行业/价值分布 + 关系强度分布 + 人脉缺口(回指 `profile.currentGoal`)。
- 每个数字/分类可点开依据 + drill 到筛选后的名片列表。

### Phase 5 · 导入 + 名片复核 → `contacts/new`（`OrbitRealCardsScan`）
- 来源入口卡(5 种，带可信度) + 名片 OCR 逐字段复核面板：接 `createBusinessCardReviewService()` 的 `getReviewDraft/updateReviewDraft/confirmReviewedDraft`；四态 success/empty/pending/failure；确认前 `contactWriteExecuted=false`。
- 复核行用「去 AI 感」的 `.rev` 行式（字段名·置信度圆点·内联可编辑·证据·已确认/待确认）。

### Phase 6 · 跟进管线 + 活动后整理 → `OrbitRealCardsPipeline` + 新 after-event
- 三列看板(pipeline 三态) + **活动后整理队列**：新联系人队列 + 逐人整理卡(来源上下文/建议标签/交流摘要 memo→存连接画像/起草个性化邮件/设提醒)；移动端可切换 `管线/待办/活动后` 三视图 + 逐位整理卡。
- 邮件**一人一封**、发送前确认、不群发；接 `followups` + `message-drafts`。

## 5. 测试（每 Phase）
- contract 单测（新字段/枚举/错误码）。
- mock「no external provider call」断言（沿用现有 false-flag 风格）。
- API envelope 测试：success / empty / pending / failure。
- page render 测试：presenter 从 view-model 渲染，确认关键元素与「确认前不写库/发送前确认」保证可见。

## 6. Definition of Done（每屏）
- [ ] 与 `docs/designs/cards/<screen>.html` **并排截图无可见差异**（桌面 + 移动，中/英）。
- [ ] 全部字段来自 view-model；presenter 不碰 service-factory。
- [ ] 交互齐全：依据点开、drill 跳转、邮件抽屉、筛选/分段切换、toast；无死点。
- [ ] mock 无外部调用；四态齐全；测试通过。
- [ ] 可访问性：对比度 AA、焦点环、reduced-motion、触控 ≥44px。

## 7. 建议节奏
Phase 0 + Phase 2 先打通竖切（验证链路 + 像素还原），确认后 3/4/5/6 可并行。每 Phase 独立 PR。

## 8. 风险 / 待定
- 星图在真实数据规模（上千）下需按密度采样 + 计数，仅高亮关键人（原型已注释口径）。
- 表盘若现有 `app/api/dashboard/*` 响应不足以覆盖「机会/缺口 + 依据」，需补 `createRelationshipDashboardService()`。
- 部分新字段（strength/nextAction 等）live 判定规则待定，先 mock 规则占位。
