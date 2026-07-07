# 名片夹 · Business Card Holder — 原型设计规范

> Prototype design spec for Orbit's 名片夹 (contacts / relationship CRM) feature.
> 交付形态：`docs/designs/cards/` 下的独立 HTML 原型，**框架 CSS 与组件页分离**。
> 主题：严格复用产品现有「星空暗色」设计系统（extracted from `repos/orbits/app/(app)/app/orbit-reference-styles.tsx`）。
> 语言：中英双语（CSS `.zh/.en` + `html[lang]` 切换）。
> 每屏含桌面 + 移动两版（design board 双画板）。

对应 PRD：`docs/designs/inital_design.md` §7 人脉导入 · §8 人脉管理 · §12 活动后跟进 · §14 连接画像 · §15/§16 表盘与价值分析 · §20 数据对象。

---

## 1. 工程结构（框架 / 组件分离）

```
docs/designs/cards/
├── SPEC.md                     # 本文件：设计规范 + 字段/接口映射
├── orbit-cards-framework.css   # 框架层：设计 token + 基础组件类 + 画板/双语机制
├── index.html                  # 原型总览（画廊，链接 5 屏）
├── 01-wallet.html              # 名片夹主列表（All contacts / card wallet）
├── 02-connection.html          # 人脉卡片详情 + 连接画像
├── 03-dashboard.html           # 人脉表盘（asset overview / distributions / opportunities）
├── 04-import.html              # 导入中心 + 名片扫描 OCR 逐字段复核流
└── 05-followup.html            # 跟进管线 / 活动后跟进
```

- **框架层**只放：设计 token、`.btn/.chip/.card/.field/.avatar/.stat/.meter/.timeline/...`、shell（top-nav / crm-sidebar / mobile-tab）、画板 `.board`、双语 `.zh/.en`、icon sprite 样式。
- **组件页**只写页面结构，`<link>` 引框架、复用类；页面级独有样式内联在页头 `<style data-page>`。

---

## 2. 设计 token（从产品抽取，务必逐值一致）

| 类别 | Token | 值 |
|---|---|---|
| 主色 | `--accent` / hover / press | `#8B7BF0` / `#9C8EF5` / `#7A69E6` |
| 主色软 | `--accent-soft` / `-softer` / `-ring` | `rgba(139,123,240,.16)` / `.09` / `.42` |
| 主色上文字 | `--on-accent` | `#0B0A15` |
| 文字 | `--ink`/`--text`/`--text-2`/`--text-3`/`--text-4` | `#F2F0FB`/`#ECEAF6`/`#A6A3BD`/`#73737B`/`#6E6A8F` |
| 背景 | `--bg`/`--bg-soft`/`--bg-sunken` | `#06050D`/`#0D0B1E`/`#08070F` |
| 表面 | `--surface`/`-2`/`-3` | `#12101F`/`#171430`/`#1D1936` |
| 边框 | `--border`/`-2`/`-strong`/`--hairline` | `rgba(150,145,200,.14)`/`.22`/`.34`/`.10` |
| 语义 | `--live`/`--amber`/`--rose`/`--sky` | `#34C98E`/`#E0B472`/`#F0718B`/`#6FA8F8`（各带 `-soft`） |
| 圆角 | `--r-xs/sm/md/lg/xl/pill` | `7/10/14/18/24/999 px` |
| 阴影 | `--sh-xs/sm/md/lg/pop` | 见框架 CSS（含 `-12px rgba(123,108,232,.25)` 光晕） |
| 字体 | `--ff` / `--ff-tight` / `--ff-mono` | Noto Sans SC·Inter / Noto Serif SC·Newsreader / JetBrains Mono |
| 页面底 | canvas | `radial-gradient(130% 100% at 50% 14%, #14122A, #0D0B1E 42%, #08070F 72%, #06050D)` |
| 头像 | `.g-indigo/violet/rose/amber/emerald/sky/slate` | 双色 `--av-a/--av-b`（见框架） |

组件规格：`.btn` 高 44（`-sm` 36 / `-lg` 50），`.chip` 高 30 圆角 pill，`.field` 高 48 focus 环 `accent-ring`，`.card` 圆角 `r-lg` + `--sh-sm`，hover 上浮 2px。标题 `.h-display 28/1.04`、`.h-title 20`、`.h-section 17`。`.eyebrow` 用 amber。

---

## 3. 语义色约定（贯穿全部界面）

- **关系强度 strength**：强 `--live` · 中 `--sky` · 弱 `--amber` · 沉睡/待确认 `--text-3`。
- **来源 source**：名片扫描/交换 `--accent`、扫码 `--sky`、活动导入 `--amber`、通讯录 `--text-2`、推荐 `--rose`。
- **管线状态 pipeline**：`to_contact` amber · `in_progress` sky · `partnered` live（沿用现有 `orbit-real-contacts.tsx`）。
- **置信度 confidence**（OCR）：high `--live` · medium `--amber` · low `--rose`。

---

## 4. 各界面规格 + 字段/接口映射

> 约定：字段标注 `[现有]` = 已在 `OrbitContactView` / 合约中；`[需扩展]` = PRD 要求但当前 DTO 缺、建议新增。接口标注对应 service-factory 方法。

### 01 名片夹主列表 `01-wallet.html`  → PRD §8.2/§8.5/§20.2
桌面：top-nav(64) + 左侧 CRM 导航(212) + 内容（标题栏 → 自然语言搜索 → 筛选 chips → 名片列表）。移动：top-nav + 搜索头 + 列表 + 底部 tab。

**名片卡片字段**（升级现有 `PersonCard`，补 PRD 完整信息层次）：
- `displayName`,`company`,`title`,`industry` `[现有]`
- 头像渐变 `g` `[现有]`
- `source: 'exchange'|'scan'|'manual'` `[现有]` → 加扫码/活动/推荐 `[需扩展 → 'qr'|'event'|'referral']`
- `met`（认识来源/场景）`[现有]`、`lastEventId` `[现有]`
- **关系强度** `strength: 'strong'|'medium'|'weak'|'dormant'` `[需扩展]`
- **价值标签** `valueTags: string[]`（潜在客户/合作伙伴/投资人/资源介绍人…§8.3）`[需扩展]`
- **当前状态** `pipelineStatus` `[现有]` + 细分 `stage` `[现有]`
- **下一步动作** `nextAction: string` `[需扩展]`、`needsFollowup: boolean` `[需扩展]`
- **最近互动** `lastInteractionAt` `[需扩展]`
- 自然语言搜索栏 placeholder：「帮我找认识餐饮老板的人」→ `contacts.search({ query, nlIntent })` `[需扩展 nlIntent]`

**接口**：`createContactListSearchAndFilterService()` → `list()/search({query,stage,tags,strength})`（`features/contacts/service-factory.ts`）。

### 02 人脉卡片详情 + 连接画像 `02-connection.html` → PRD §8.2/§14/§20.3
桌面两栏：左＝人物名片（头像/身份/联系方式/来源/标签/强度）+ 双向价值分析；右＝连接画像（关系类型、关系阶段进度、互动时间线+来源证据、下一步建议）。移动：单列分段。

**连接对象字段**（§20.3 / connections 合约）：
- `connectionId`,`userA/userB`,`source`,`establishedAt`,`establishedContext` `[现有:connections contract]`
- **关系类型** `relationshipType`（潜在客户/合作伙伴/投资/招聘/技术顾问/资源介绍/…§14.3）`[现有:stage/profile mock]`
- **关系阶段** `stage`（12 阶段进度条，§14.4：待确认→…→已完成合作/沉睡）`[现有]`
- **双向价值** `valueAToB: string[]` / `valueBToA: string[]`（§14.5）`[需扩展]`
- **时间线** `timeline: TimelineEvent[]`（每条含 `source` 证据引用）`[现有:evidence+timeline]`
- `lastSummary`,`nextAction`,`needsFollowup`,`dormant`,`highValue` `[部分需扩展]`

**接口**：`createConnectionAndEvidenceService()` → `getConnection(id)/getEvidence/getTimeline`；`createRelationshipStageAndProfileService()` → `getStageAndProfile(id)/changeStage(...)`。阶段变更必须带 rationale + evidence（DESIGN.md 约束）。

### 03 人脉表盘 `03-dashboard.html` → PRD §15/§16
桌面：顶部 6 张关系资产总览 stat tiles → 两栏（行业分布 / 价值类型分布 donut+bar）→ 关系强度分布分段条 → 机会提醒列表 → 人脉缺口 callout。移动：纵向堆叠。

**聚合 DTO（建议新增 `features/analysis` dashboard 接口）** `[需扩展]`：
- `overview`：`total/core/highValue/newThisMonth/needsFollowup/dormant/active30d`（§15.2.1）
- `industryDistribution: {label,count}[]`（§15.2.2，水平条/donut）
- `valueTypeDistribution: {type,count}[]`（§15.2.3）
- `strengthDistribution: {strong,medium,weak,pending,dormant}`（§15.2.4，分段条）
- `opportunities: {contactId,reason,action}[]`（§15.2.5 本周建议联系/沉睡高价值/可能带客户）
- `gaps: {targetLabel,message}[]`（§15.2.6 基于用户目标的人脉缺口）

**接口**：`createRelationshipDashboardService()`（新）→ `getDashboard({ userId, goalContext })`。图表：分布用水平 bar / donut（≤5 类），价值画像可选 radar；均提供数据表 a11y 兜底。

### 04 导入中心 + 名片复核 `04-import.html` → PRD §7 / acquisition 合约
桌面两栏：左＝来源入口卡（名片扫描/现场扫码/活动名单/通讯录导入/推荐关系，§7.2.1–7.2.5，各标可信度）；右＝**名片扫描 OCR 逐字段复核面板**（当前完全无 UI 的核心补齐）。移动：来源列表 → 进入复核全屏。

**名片复核字段**（`business-card-review-contract.ts`，逐值对齐）：
- `BusinessCardReviewDraft{ id,status:'pending_review'|'reviewed'|'confirmed', displayName,role,organization,email,phone, relationshipContext, suggestedNextAction }` `[现有]`
- `extractedFields: BusinessCardReviewFieldMap`，每字段 `{ label,value,reviewedValue, reviewState:'needs_review'|'accepted'|'edited', confidence:'high'|'medium'|'low', evidenceId }` `[现有]`
- `confirmation{ required, state:'pending'|'confirmed', question }`、`evidence[]`、`provenance` `[现有]`
- 全 false 侧写：`contactWriteExecuted/ocrProviderCalled/aiProviderCalled=false`（复核前不写库，UI 需明示「确认前无联系人写入」）

**交互**：每个字段一行——左原始 OCR 值 + 置信度徽标 + 证据链接，右可编辑 `reviewedValue`，操作「接受/编辑」→ `reviewState` 变化；底部 CTA「确认加入人脉」pending 前禁用。
**接口**：`createBusinessCardReviewService()` → `getReviewDraft({draftId})` / `updateReviewDraft({draftId,reviewedFields})` / `confirmReviewedDraft({draftId})`。扫描入口：`createBusinessCardScanOcrService().scanBusinessCard()`。四态：success/empty/pending/failure 都要有对应视觉。

### 05 跟进管线 / 活动后跟进 `05-followup.html` → PRD §8.4/§12
桌面：三列看板（待联系 / 沟通中 / 已合作，沿用 pipeline 三态）+ 右侧「活动后整理」抽屉（新联系人整理、交流摘要、打招呼文案生成、跟进提醒）。移动：分段 tab（管线 / 待办）。

**字段**：
- 管线卡：`pipelineStatus` `[现有]`、`nextAction`,`needsFollowup`,`lastInteractionAt` `[需扩展]`
- 待办对象（§20.6）`Task{ id,contactId,eventId, type:'greeting'|'send_material'|'schedule'|'reactivate', dueAt, priority, status, suggestedScript }` `[现有:followups]`
- 打招呼文案（§12.4）：`greetingDraft{ eventName, body, ctaLink }`，AI 生成、外发前需用户确认 `[现有:message-drafts]`

**接口**：`features/followups` service-factory（任务/提醒）；打招呼文案 `createMessageDraftService()`；活动后整理来源 acquisition event-attendee + connections。

---

## 5. 通用 UX 约束（ui-ux-pro-max 校验）
- 对比度 ≥4.5:1（暗色文字已按 AA 调过 `--text-3=#73737B`）；焦点环 `outline:2px accent`；`prefers-reduced-motion` 降级。
- 触控目标 ≥44px（`.btn` 44、移动 tab item 高≥56）；不依赖 hover 传达信息。
- 每屏单一主 CTA；破坏性/外发动作（发打招呼、确认入库）需二次确认 + 语义色。
- 图表配色不只靠颜色（加图标/文字/形状）；提供数据表兜底；空/加载/失败态齐全。
- 移动底部 tab ≤5 项；导航当前项高亮；安全区留白。
- 数字/表格用 tabular 字形（`.mono`）。

---

## 6. 双语与画板机制
- 双语：可翻译文本写 `<span class="t"><b class="zh">中文</b><b class="en">EN</b></span>`；框架 CSS 按 `html[lang]` 显隐；右上角 `中 / EN` 切换按钮切 `document.documentElement.lang`。默认 `zh`。
- 画板：每屏 `.board-row` 内含 `.board.is-desktop`(1280×832) 与 `.board.is-mobile`(390×844)，深色画布上并排；画板内即真实 UI（overflow 裁剪 + 内部滚动）。
