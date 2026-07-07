# 名片夹 · 真实代码复刻实施计划 (IMPL-PLAN) · **UI-only**

> 目标：把 `docs/designs/cards/` 的 5 屏 HTML 原型，**像素级 1:1** 复刻到真实应用 `repos/orbits`。
> **范围：只做前端 UI，不写任何后端**——不新增/修改 `features/*/contract.ts · service.ts · mock-service.ts · service-factory.ts`，不写 `app/api/**` 路由，不写后端测试。
> 数据用**静态演示数据**：沿用现有模式（`orbit-contacts-route-view-model.ts` 本就把 demo 数据硬编码在 view-model 里），presenter 只吃 view-model。
> 配套接口：[FRONTEND-CONTRACTS.md](FRONTEND-CONTRACTS.md)。已确认：① 表盘归名片夹板块 `/home/cards/dashboard`；② UI-only 静态数据；③ 本计划存档；④ **像素级完全一致**；⑤ 前端类型/props 单独成文档。

---

## 0. 只碰这些文件（UI 层）
- **presenter 组件**：`app/(app)/app/contacts/orbit-real-contacts.tsx`（增强 List/Detail/Pipeline/Scan）+ 新增 dashboard/after-event 组件。
- **route view-model**：`app/(app)/app/orbit-contacts-route-view-model.ts` 等——**在这里放静态数据**、加前端类型字段。
- **样式**：`app/(app)/app/orbit-reference-styles.tsx`——把原型新增 class 的 CSS **原值**并入（同一 token 体系）。
- **共享 UI 组件**：`shared/ui/*` 或 contacts 局部——纯展示组件（`<Basis>`/`<OrbitEmailComposeSheet>`/`<OrbitRelationshipMap>`/`<OrbitToast>`/`<OrbitBottomSheet>`）。
- **路由页**：`app/(app)/app/contacts/**/page.tsx`（表盘新页）——只做组合与传静态 view-model。

**不碰**：`features/**`（contract/service/mock/factory）、`app/api/**`、后端测试、provider/live 实现。

## 1. 像素级一致策略（决定 ④）
原型 `orbit-cards-framework.css` 逐值抽自 `orbit-reference-styles.tsx`、顶栏照 `AccountTopNav/OrbitTopNav` 复刻。所以：
1. **复用现有类**：`.orbit-top-nav/.card/.chip/.btn/.field/.avatar/.status-pill/.hbar/.timeline/.stage-track` 已存在 → presenter 直接套。
2. **原型新增类**（`.basis/.rev/.orbit-ring/.qrow/.aet/.toast/.sheet/.dist/.conf/.donut/.hbar/.qpager` 等）→ CSS 原值并入 `orbit-reference-styles.tsx`，class 名保持一致。
3. **并排截图核对**：实现后用 `docs/designs/cards/*.html` 与真实页并排对比，间距/字号/圆角/颜色/阴影/动效差异清零（DoD §5）。

## 2. 已存在、直接复用（UI 层）
| 能力 | 位置 | 复用 |
|---|---|---|
| 顶部导航 | `AccountTopNav`/`OrbitTopNav` | 原型照它做 → 0 改动 |
| 设计 token / 基础组件 | `orbit-reference-styles.tsx`、`orbit-reference-primitives.tsx`（`Avatar/Cover/Icon/Logo`） | 直接用 |
| 依据/来源浮层 | `shared/ui/provenance-disclosure.tsx`、`source-chip.tsx` | 封装 `<Basis>` |
| 名片列表/管线/图谱/引荐/详情/扫描 | `orbit-real-contacts.tsx` + `orbit-contacts-route-view-model.ts` | 增强 |

## 3. 静态数据来源（UI-only）
- 新字段（`strength/valueTags/nextAction/dormant`、`valueAToB·BToA`、`currentGoal`、表盘、活动后整理）= **view-model 上的前端类型 + 硬编码演示值**（对齐原型里的人物：佐藤花/陈伟/Emily/刘洋/Sarah/田中健…）。
- 交互（依据展开、drill、邮件抽屉、筛选/分段切换、toast、星图切换、逐位整理翻页）= **纯前端状态**（useState / 组件内），无网络请求。
- 类型定义见 [FRONTEND-CONTRACTS.md](FRONTEND-CONTRACTS.md)（其中"服务/API"块仅作**将来数据来源标注**，本轮不实现）。

## 4. 分阶段（每 Phase 一个 PR，纯 UI）

### Phase 0 · 共享 UI 构件 + 样式并入
- 原型新增 class 的 CSS 原值并入 `orbit-reference-styles.tsx`。
- 建纯展示组件：`<Basis>`（封装 provenance-disclosure）、`<OrbitToast>`、`<OrbitBottomSheet>`、`<OrbitEmailComposeSheet>`（本地静态草稿）、`<OrbitRelationshipMap>`（星图，由静态 node 数据渲染）。
- 验收：/dev 或本地渲染各组件的默认/hover/click 态。

### Phase 1 · 名片夹主列表（竖切样板）→ `OrbitRealCardsList`
- view-model 加静态字段（strength/valueTags/nextAction/dormant/lastInteractionAt/source 扩展）。
- 升级 `PersonCard`：来源徽标·关系强度·价值标签·下一步(+`<Basis>`)·最近互动；顶部自然语言搜索栏（纯 UI，示例回显）。
- **本阶段作为像素级样板**，跑通后再并行铺其余屏。

### Phase 2 · 卡片详情 + 连接画像 → `OrbitRealCardDetail`
- 人物名片(联系方式/标签/双向价值) + 连接画像(关系类型、12 阶段进度+rationale、带证据时间线、下一步)。
- 「起草打招呼」→ `<OrbitEmailComposeSheet>`（邮件式，发送前确认）。

### Phase 3 · 人脉表盘（新路由）→ `app/(app)/app/contacts/dashboard/`（`/home/cards/dashboard`）
- CRM 侧栏加入口；`<OrbitRelationshipMap>` 星图 + 本周行动队列 + 行业/价值分布 + 关系强度分布 + 人脉缺口(回指 `currentGoal`)。
- 每数字/分类可点开 `<Basis>` + drill 到 `/home/cards` 筛选（前端跳转）。

### Phase 4 · 导入 + 名片复核 → `contacts/new`（`OrbitRealCardsScan`）
- 来源入口卡(5 种) + 名片 OCR 逐字段复核（`.rev` 去 AI 感行式：字段名·置信度圆点·内联可编辑·证据·已确认/待确认）；四态用本地状态切；"确认前不写库"文案保留。

### Phase 5 · 跟进管线 + 活动后整理 → `OrbitRealCardsPipeline` + after-event
- 三列看板 + 活动后整理队列 + 逐人整理卡（来源上下文/建议标签/交流摘要 memo/起草个性化邮件/设提醒）；移动端 `管线/待办/活动后` 三视图切换 + 逐位整理卡。
- 邮件一人一封、发送前确认、不群发（本地静态草稿）。

## 5. Definition of Done（每屏）
- [ ] 与 `docs/designs/cards/<screen>.html` **并排截图无可见差异**（桌面 + 移动，中/英）。
- [ ] 全部数据来自 view-model（静态）；presenter 不引入网络/后端调用。
- [ ] 交互齐全：依据点开、drill 跳转、邮件抽屉、筛选/分段切换、toast、星图切换、逐位整理翻页；无死点。
- [ ] a11y：对比度 AA、焦点环、reduced-motion、触控 ≥44px。

## 6. 建议节奏
Phase 0 + Phase 1（名片夹主列表）先打通竖切、锁死像素还原与交互，再并行铺 2/3/4/5。每 Phase 独立 PR。

## 7. 风险 / 待定
- 星图在大规模数据下的密度采样是**后端/数据层**的事；UI 层先用静态 node 演示 + 预留 props。
- 后端接入（真实数据、服务、API）是**后续单独的事**，本轮完全不做。
