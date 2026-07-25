# Orbit Agent 产品与架构演进 — 实施 Prompt（2026-07-25 修订版）

> 本文件 = GPT 原 plan + 针对仓库真实状态的修订。修订依据为 2026-07-25 对
> `chat-agent`（HEAD `3bdcc1d0`）的逐文件核查。**凡与原 plan 冲突处，以本文件
> 第 0-2 节为准。**

---

## 0. 执行前状态（已核实，不要重复原 plan 的过期同步步骤）

原 plan 说"本地落后远端 16 个提交、基线 057b954c、需 pull --ff-only"——**已过期**：

1. `chat-agent` 与 `origin/chat-agent` 完全同步（behind/ahead = 0/0），
   `057b954c` 已在历史中。开工时 `git fetch && git status` 自查一次即可，
   不要盲目 pull。
2. 未提交内容按原 plan 意图处理：
   - 8 个 GitNexus/指令文件（`.claude/skills/gitnexus/*/SKILL.md` ×6、
     `AGENTS.md`、`CLAUDE.md`）→
     `git stash push -u -m "gitnexus-tooling-pre-agent-work" -- <这8个路径>`，
     保留到最终交付，不进产品提交。
   - 未跟踪的 `.claude/launch.json`（本地 dev server 预览配置）→ 保持未跟踪。
3. 重新跑 GitNexus analyze（索引落后于近期大量 UI 提交）；产物不进产品提交。
4. 严格执行 CLAUDE.md：改任何 symbol 前 `impact({target, direction:"upstream"})`，
   HIGH/CRITICAL 先报告；commit 前 `detect_changes()`。

## 1. 已存在的实现（原 plan 以为要"新建"、实际已有雏形——先读后写）

### 1.1 Agent Ledger ≈ 原 plan 的 AgentAction（最重要的一条）

`features/agent/ledger/`（contract/fixtures/mock-service/live-service/service）
已经是一个相当完整的 Action 生命周期系统：

- 状态含 `awaiting_confirmation / deferred / completed / partially_failed`；
  operation 级状态含 `succeeded / failed / skipped / undone`。
- Transition 白名单：`confirm / defer / undo / retry`。
- Operation 类型白名单：`save_meeting_note / create_followup_reminder /
  save_message_draft / archive_contacts / generate_meeting_brief /
  sync_event_to_calendar`。
- Evidence 种类白名单：`event_material / chat_summary / calendar_signal /
  contact_note`（contract 内注释："语音记录按 2026-07-24 决定暂不纳入"）。
- Provenance 结构里外部副作用与自动发送**固定为 false**。
- contract/mock 里已有幂等相关处理。
- API：`/api/agent/ledger/[id]/transition`、`/api/agent/ledger/[id]/draft`。
- 存储：`features/agent/storage/agent-action-live-record-provider.ts`，底层为
  `shared/storage/configured-live-record-store.ts` + `postgres-live-record-store.ts`
  （即原 plan"复用现有 live record store"所指之物）。

**裁决要求（编码前必须先出一份书面对照并请用户确认）**：原 plan 的
`AgentAction` 模型与 ledger 高度重叠。默认方向是**演进 ledger 而不是并行新建
AgentAction**——把 ledger contract 扩展出缺失的字段/状态
（`approved/executing/rejected/canceled`、`executorKey`、`idempotencyKey`、
风险级别、补偿声明、时间戳全集），而非再造一套。若核查后认为必须新建，
先向用户说明理由再动手。

### 1.2 双轨 Action API 已存在，必须先收敛再扩展

`/api/agent/actions/[id]/accept|dismiss`（对应 `features/agent/agent-action-queue-mock`
一系）与 `/api/agent/ledger/[id]/transition`（ledger 一系）**并存**。原 plan 说
"现有 accept 改为确认并写入 outbox"——实施前先搞清两轨各自的消费方
（Today 页走 `compose-app-today-from-agent-ledger`，即 ledger 轨），
把收敛方案（谁存活、谁兼容壳）写进任务 0，不要在双轨上同时叠加 outbox。

### 1.3 Runs API 已有雏形

`/api/ai/runs/[id]` 已存在。原 plan 的"新增 GET /api/agent/runs/:id"应改为
**评估复用/扩展现有 `/api/ai/runs/[id]`**；若语义确需分离（AI 会话 run vs
Agent 执行 run），说明后再新增，避免两套 run 概念。

### 1.4 工具注册表已有元数据版，升级路径与原 plan 一致

`features/orbit-ai/agent-tools/registry.ts`（~106 行）：`ORBIT_AGENT_TOOL_CATALOG`
纯元数据（descriptionZh/inputSpecZh/outputSchema 字符串/renderHint/
requiresConfirmation/sourceModules/toolFamily），`riskLevel` 已经是
`"read" | "draft" | "write" | "external"` 四值——与原 plan 的接口同名同义。
升级 = 在此文件系加 `inputSchema/outputSchema` 真校验器、`execute`、
`timeoutMs`、`redactObservation`、`auditPolicy`，并让 provider 的工具说明从
registry 生成（消灭 `gemini-provider.ts` 里的第二份名单，若存在）。

### 1.5 自治等级设置已存在，按原 plan 降级

`features/agent/settings-*`（contract/policy/fixtures/mock/live）实现了
low/medium/high 自治等级 + `/api/agent/settings`。按原 plan：从核心 UI 移除，
API 保留兼容。

### 1.6 语音 memo 与既有决定的冲突点

原 plan 阶段 1 要加 15 秒语音 memo，但 ledger evidence 白名单注释记录了
2026-07-24"语音记录暂不纳入"的决定（用户历史决策还包括"全场录音永久出局"）。
15 秒 memo ≠ 全场录音，但**动 evidence 白名单前先向用户确认这条是否解禁**。

## 2. 本轮会话已完成的 UI（不得覆盖/重建，Agent UI 必须接在其上）

相关 commit：`a4dfae88` `0b022286` `903c6c02` `511f6d8a` `bfb4485b`
`58657c06` `ed4aff87` `22a5ebce` `3bdcc1d0`。

- **`/app/today` 已是三源合并的 7/5 双栏"日程"工作台**（Today + 旧日历 +
  关系安排）。原 plan 阶段 0 的"Home 升级为关系工作台（四区块）"**UI 骨架已
  完成**：需要你决定 / 可复核安排 / ORBIT 已准备 / 最近完成 都已在页。
  - `app/(app)/app/today/page.tsx`：`Promise.all` 三 VM，单源失败降级为该
    区块错误态。
  - 决策卡为**原位 accordion 展开**（`?entry=` 驱动、一次一张、Esc 收起），
    不是常驻面板。新 Action/Proposal 卡遵循同一模式。
  - Esc 归属已修：`useOrbitModalA11y` 内 `stopPropagation()` + accordion 侧
    `[role="dialog"]` guard。新增弹层注意这个坑。
  - 过滤淡化已拍板：带日期的卡不相关时 `opacity:.45` 不隐藏；决策/Action 卡
    无日期属性、始终全亮。
  - 数据源：`compose-app-today-from-agent-ledger/today-route-view-model.ts`
    （+ `today-merged-view-model.ts`）。阶段 0 的真正剩余工作 = 把这条 VM 链
    从 ledger 现状接到扩展后的 run/action/outbox 模型上，**不是重画 UI**。
- 导航入口已改名「日程」（`orbit-public-shell.tsx`），路径 `/app/today`；
  `/app/followups`、`/app/schedule` 已是 redirect 薄壳（组件文件保留复用，勿删）。
- **All actions 改名已完成**：页面在 `/app/contacts/all-actions`
  （`OrbitRealAllActions`），移动端段导航 chips 已补齐；桌面挂在
  `CrmSidebar`。原 plan 的"筛选/撤销/审计"扩展直接做在这个组件上。
- `orbit-real-contacts.tsx` 的 `mobileCrmTabItems()` 已与桌面 CrmSidebar
  六项 1:1 对齐。
- 桌面顶导航为 `grid-template-columns: 1fr auto 1fr` 三段居中结构，改导航保持。
- 移动端：Today 用单树响应式（`.orbit-today-columns` + media query），
  月历周条 + FAB（`ORBIT_Z.sticky`）。
- **复用体系（新 UI 一律走这些）**：`.btn` 变体、`ModalShell`
  （dialog/bottom-sheet）、`FormField`、`ORBIT_Z`、`--r-*`/`--sh-*` token、
  `data-orbit-real-page` 作用域、`localizeOrbitTree` 中文纯字符串。
- **测试纪律**：三条棘轮（按钮/type-scale/spacing-scale）不得升。
  `tests/ui/orbit-button-ratchet.test.ts` 的 `EXEMPTIONS` 是行号锚定——相关
  文件编辑后该测试若失败，按失败输出报告的新行号更新 EXEMPTIONS，勿猜。
  `npm test` 有稳定失败基线，不得新增失败。新增 `/app/today` 门测试
  （`tests/pages/app-today-merged.test.ts` 等）必须保持通过。

---

## 以下为原 plan 正文（架构与阶段 1-4 按原样执行；与上文冲突处以上文为准）

## 一、目标与基线

将 Orbit Agent 从"关系推荐 Chat"升级为"高频商务活动者的关系经营秘书"：

- 主用户：创业者、投资人、BD 等高频商务活动者。
- 辅助生态：活动主办方负责活动与参会数据供给；暂不建设完整主办方平台。
- 默认入口：Today 工作台；Chat 是控制、追问和深挖入口。
- 执行边界：读取与草稿自动完成；系统内写入须确认；对外邮件和消息永不自动发送。
- 核心指标：每周确认并完成的关系工作数，而不是对话次数。

## 二、目标架构

Agent 是跨模块编排入口，不是所有后端行为的强制总线。

```text
Chat / Today / Domain Signal / Scheduler
                   │
             Trigger Intake
                   │
       Known Workflow Router
          │                 │
确定性工作流状态机       Bounded Planner
          │          最多 3 个 read/draft step
          └────────┬────────┘
                   │
          Executable Tool Registry
                   │
       Feature-owned Service Factory
                   │
       Artifact / Action Proposal
                   │
              Policy Gate
                   │
       User Confirmation in Today/Chat
                   │
          Actions Executor + Outbox
                   │
        Domain Write + Audit + Result
```

### 1. 模块职责

- `features/orbit-ai`：Trigger、已知工作流路由、bounded planner、工具 registry、artifact、run trace。
- `features/agent`：Action Proposal、确认、执行状态、幂等、补偿、审计和 executor registry。
- Contacts、Events、Followups、Notifications、Chat：继续拥有业务事实、校验和真正写入。
- Today、Chat、移动端：只消费统一 surface view model，不直接依赖 provider 或 workflow 内部状态。

直接在 Contacts 页面确认名片等操作仍可调用 Contacts 自己的写服务；只有 Agent 发起的跨模块写入必须进入 Actions。

### 2. 可执行工具注册表

把当前元数据 registry（`features/orbit-ai/agent-tools/registry.ts`，见第 1.4 节）升级为静态、显式的 executable registry：

```ts
interface OrbitAgentTool<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: Validator<TInput>;
  outputSchema: Validator<TOutput>;
  riskLevel: "read" | "draft" | "write" | "external";
  allowedModes: readonly ModuleMode[];
  timeoutMs: number;
  execute: (input, context) => Promise<TOutput>;
  redactObservation: (output) => unknown;
  auditPolicy: ToolAuditPolicy;
}
```

约束：

- adapter 只负责协议转换，放在 Orbit AI；业务规则仍在领域 service。
- provider 的工具说明和 schema 从 registry 生成，不再维护第二份名单。
- `read/draft` 可在 runtime 内执行。
- `write/external` 只能生成 Action Proposal，模型不能直接调用 executor。
- 不做动态插件、自注册或用户自定义 Agent。

### 3. 持久化生命周期

新增并持久化以下模型（**优先通过演进现有 ledger contract 达成，见第 1.1 节裁决要求**）：

- `AgentRun`：`queued/running/waiting_for_input/waiting_for_confirmation/completed/failed/canceled`。
- `AgentRunStep`：确定性、AI、工具、确认四类步骤，记录 attempt、输入/输出引用和错误。
- `AgentAction`：`awaiting_confirmation/approved/executing/completed/failed/rejected/canceled/undone`。
- `AgentOutboxEvent`：记录可重试后台任务，包含 `availableAt`、attempt、processedAt 和 lastError。
- `TodayWorkItem`：由 run/action/event 投影生成，不成为新的事实源。

每个 Action 保存：

- 精确执行 payload；
- evidence/source IDs；
- `executorKey`；
- `idempotencyKey`；
- 风险级别；
- 用户可读 preview；
- 补偿/撤销策略；
- 创建、确认、执行与完成时间。

确认后不可静默修改 payload；需要修改时废弃旧 Action 并生成新 Proposal。

### 4. API 演进

保持现有客户端兼容，增量扩展（**先按第 1.2/1.3 节收敛双轨，再扩展**）：

- `/api/ai/conversations`：继续作为 Chat 入口，响应可附加 `runId`、`actionIds`。
- `GET /api/ai/today`：返回 Today 分区和统一 Action 卡片。
- Run 状态查询：优先扩展现有 `/api/ai/runs/[id]`（见 1.3），供 Web/移动端恢复和轮询执行状态。
- `GET /api/agent/actions`：增加状态、workflow、时间筛选（与 ledger 轨收敛后实施）。
- 现有 accept/confirm：改为"确认并写入 outbox"，不再只是状态改成 approved。
- 现有 dismiss：保持拒绝语义。
- 新增 undo：仅对声明了 compensation 的已完成动作开放（ledger 已有 undo transition，扩展其补偿声明）。
- 主动 signal 通过内部 service 发布，不开放任意外部 workflow 触发接口。

## 三、功能排序与逐条制作

### 阶段 0：Today 与运行底座

**UI 骨架与 All actions 改名均已完成（见第 2 节）。本阶段剩余工作收窄为：**

1. ledger → AgentAction/AgentRun 演进裁决与实施（第 1.1 节）。
2. 双轨 Action API 收敛（第 1.2 节）。
3. Outbox/worker 抽象落地（现有 live record store 之上）。
4. `TodayWorkItem` 投影接入 `compose-app-today-from-agent-ledger` 现有 VM 链。
5. 同一 Action ID 同时显示在 Today 和相关对话中；任何一处操作后同步更新。
6. 从主产品移除低/中/高自治等级（第 1.5 节）：
   - read：自动；
   - draft：自动；
   - internal write：逐次确认；
   - external send：禁止。
   旧 settings API 暂时保留兼容，但不再作为核心 UI。

### 阶段 1：会后关系转化

第一条端到端黄金闭环：

1. 活动结束、encounter note 创建或用户主动请求触发 `post_event_followup_v1`。
2. 确认活动与联系人；联系人缺失时进入候选确认，重复联系人进入 merge review。
3. 先复用现有 typed encounter note 和 evidence 写入能力。
4. 根据 note、活动与关系历史生成结构化摘要和跟进草稿。
5. 自动生成两个独立 Proposal：
   - 建立跟进任务；
   - 设置提醒时间。
6. 用户可分别确认、编辑、暂缓或忽略。
7. 确认后 worker 执行领域写入，成功后更新 Today、对话和审计记录。
8. 消息草稿只允许复制、编辑或跳转到沟通页面，不发送。

typed note 流程稳定后，在同一阶段增加 15 秒语音 memo（**动工前先按第 1.6 节
向用户确认解禁 evidence 白名单**）：

- 原始音频只用于本次转写，默认不持久化；
- 转写文本必须可编辑、确认后才成为 encounter note；
- ASR 失败回退 typed note，不阻断整个流程。

### 阶段 2：会前准备 Brief

新增 `pre_event_brief_v1`：

- 活动前 24 小时生成 Brief 并进入 Today。
- 活动前 2 小时仍未查看且错过有代价时才 push。
- 数据优先级固定为：Orbit 活动/关系数据 → 已授权日历 → 已授权邮箱与日历信号。
- Brief 最多展示 3 个重点人物，包含：
  - 活动和用户目标；
  - 为什么值得见；
  - 上次互动和证据；
  - 建议话题；
  - 未完成承诺；
  - 时间、地点和准备缺口。
- 允许确认设置活动目标、建立准备任务、加入 Orbit Schedule。
- 外部日历写入作为后续 provider，必须单独授权与确认。
- 默认不做通用网页研究或冗长人物报告。

### 阶段 3：活动撮合预约

复用远端已有 event-scoped participant profile 和自适应注册访谈：

1. 用户确认本场活动目标和意图。
2. 使用活动画像、目标、供给/需求、领域、阶段、地点和可用时间生成可解释匹配。
3. 只展示少量高质量候选，不开放全场名单和批量添加。
4. 每个推荐明确"为什么匹配"和数据来源，不只展示黑箱分数。
5. 发起认识请求需要用户确认；对方接受后才建立预约流程。
6. 双方日历均不可用时提供人工选择时间，不阻断认识请求。
7. 记录接受、拒绝、会面与后续跟进结果，作为排序反馈。
8. 主办方只接收匿名聚合指标，不获得个人 memo、关系历史或私密跟进结果。

### 阶段 4：外部数据补全

按以下顺序接入，不阻塞前三阶段：

1. 日历只读：补齐 Upcoming 和会前 Brief。
2. 日历确认写入：仅在 provider 授权后执行。
3. 邮箱/日历关系 signal：默认只取必要元数据与证据摘要，不全量保存正文。
4. 不增加 Agent 自动邮件发送能力。

### 暂不建设

- 自定义 Agent、Agent 市场和无代码工作流搭建器。
- 开放式或无限循环 ReAct。
- 通用网页问答、行业研究和万能商务咨询定位。
- 全局低/中/高自治等级。
- 对用户展示模型思维链、复杂任务时间线或技术 trace。
- 自动发送邮件、消息或批量触达。
- 完整白标活动平台、赞助商广告和主办方 CRM。
- 在核心闭环完成前继续增加大量只读推荐工具。
- 新建一套与现有 Followups/Schedule 重复的 Agent Task 系统
  （注：Followups/Schedule 现已是 `/app/today` 的 redirect 薄壳——这条约束
  现在等价于"不要绕开 `/app/today` 现有结构另起一套"）。

## 四、验证与发布

### 自动化测试

- Registry：schema、模式、超时、未知工具和风险策略。
- Runtime：已知 workflow 优先；普通问题最多 3 个 read/draft step。
- State machine：所有 run/action 状态转换与非法转换。
- 幂等：重复确认、worker 重试、网络重放不能产生重复任务、联系人或提醒。
- Outbox：失败重试、最大重试、恢复和 dead-letter 状态。
- 安全：模型无法执行 write/external；未确认 Action 不可进入 executor。
- 撤销：只对支持 compensation 的动作开放，重复 undo 幂等。
- 隐私：主办方看不到 private memo、关系证据和个人跟进状态。
- Surface：Today 与对话共享同一 Action 状态；All actions 可追踪完整历史。
- Web/移动端：离开页面后执行继续，重新打开可恢复状态。
- Push：只有临近会议、承诺到期和跟进窗口等 time-sensitive 事项投递。

### 端到端验收

- 会后流程：记录一次会面，产生草稿与任务 Proposal，确认后真实创建并可在 Today 查到。
- 会前流程：24 小时前出现 Brief，2 小时前满足条件才 push。
- 撮合流程：双方未同意前不泄露联系方式、不建立预约。
- 失败流程：provider、数据库或 worker 失败时保持已完成步骤，允许安全重试。
- 兼容性：现有 Web、移动 Home、AI Chat、Actions、Business Card、Event
  Registration、Relationship Inbox 测试保持通过；**新增的 `/app/today` 合并页
  门测试与三条棘轮同样必须保持通过，`npm test` 不得新增失败**。
- 提交前运行 GitNexus `detect_changes`，确认只影响计划中的 symbol 和 execution flow。

### 产品指标

埋点至少包括：

- `agent_run_started/completed/failed`
- `agent_action_proposed/approved/completed/failed/undone`
- `today_item_opened/snoozed/dismissed`
- `brief_viewed`
- `encounter_note_confirmed`
- `followup_draft_prepared`
- `relationship_work_completed`

主指标为每周每位活跃用户完成的关系工作数；辅助指标为活动结束到草稿准备、任务确认和实际跟进的时间。

## 五、已锁定假设

- 主用户为高频商务活动者；普通职业关系用户是自然外溢。
- 主办方第一阶段只提供活动与参会数据。
- Today 全量承载建议；push 默认克制，并遵守免打扰。
- 确认后使用持久化异步执行，用户可以离开页面。
- 撤销采用领域补偿，不承诺全局事务回滚。
- 联系人合并、覆盖等高风险操作采用二次确认。
- 不引入 Temporal/Inngest；首版复用现有 live record store
  （`shared/storage/configured-live-record-store.ts` /
  `postgres-live-record-store.ts`），增加 outbox/worker 抽象。
- 现有 Business Card 幂等联系人写入作为 Agent executor 的参考实现。
- 所有外发消息始终由用户在外部沟通界面完成。
