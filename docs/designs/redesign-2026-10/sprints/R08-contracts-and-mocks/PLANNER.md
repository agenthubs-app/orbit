# Sprint R08 — 契约和假数据

**Plan revision:** 1。**模式:** existing-codebase / single-generator（执行人：小雨）。
**单一目标:** 12 组契约（`shared/contract` 类型 + `shared/api-schema` 校验 + mock 模式路由 + fixture）、统一演示世界、「只加不改」自动检查、两端「尚未实现」处理；同步到 App。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** R01 合入后的 `redesign` HEAD（可以在 R03 之后、R04 之前做；按登记表顺序则在 R07 之后）。
**进入条件:** R01 completed。RD-22 已定。

## 已查清的事实（按 `9d404c1c8`）

1. **模式机制**：`repos/orbits/shared/services/module-mode.ts:65-81` 读 `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE`，**生产环境强制 live**，无效值回落 mock（默认 :9）；`createModuleServiceFactory`（:104-150）按 `implementations[mode]` 选实现，hybrid 缺实现回落 mock（:127-131），缺实现时返回结构化 `NOT_IMPLEMENTED` 失败、不抛异常。路由层用等价的 `shared/config/feature-mode.ts:14-32`。
2. **完整示例**：`app/api/app/bootstrap/route.ts` + `handler.ts:45-60`（mock 跳过鉴权，live 按 actor 建服务）→ `features/bootstrap/service-factory.ts:11-22`（`{hybrid, live, mock}`）→ `mock-service.ts`（支持 `scenario`）→ `fixtures.ts`（带 `APP_BOOTSTRAP_FIXTURE_SOURCE` 来源标记）；返回统一信封 `success()` / `failure()` + `runtimeBoundaryHeaders(mode)`（`shared/api/envelope`）。另一个示例：`app/api/agent/ledger/route.ts:23-62` + `features/agent/ledger/*`，分流在 `app/api/_shared/agent-request-context.ts:86-92`。
3. **共享 mock 运行时**：`shared/mock/{fixtures,registry,scenarios,state-store}.ts`（fixture 变体可注册）；capability 目录 `shared/services/capability-registry.ts:12-24`（11 个 id，新领域可能需要登记）。
4. **契约组织**：`shared/contract` 一个领域一个文件 + `index.ts` 汇总（351 行）；`tests/contract-surface.test.ts` 强制只能 `import type`（:26）、无运行时代码（:49）、每个文件都在 index 导出（:73-83）。`shared/api-schema` 一个领域一个 zod 文件，**没有 index**，由 handler 直接 import；测试在 `tests/api-schema/*`。App 经 `sync:contract` 原样复制两者（`contract-sync`、`api-schema-sync` 测试逐字比对）。
5. **要扩展的现有契约**（impact 来自 `IMPLEMENTATION-PLAN.md` 附录 B）：`ContactListItemContract`（`shared/contract/contacts.ts`，MEDIUM 79 / 4）、`NoteContract` / `NoteMentionContract`（`notes.ts`，MEDIUM 41 / 40）、`InboxNotificationDTO`（`inbox-notifications.ts`，**HIGH** 87 / 20，只扩 `InboxSourceKind` 取值，`InboxNotificationKind` 不动）、`InboxDeliveryPreferencesDTO`（`notification-delivery-policy.ts`，MEDIUM 25）、`TaskItemContract`（`tasks.ts`，MEDIUM 68 / 11）。计划契约目前只在 Web 内部（`features/plans/contract.ts`），本 Sprint 第一次进入共享契约。
6. **App 侧**：同步副本在 `src/api/{contract,schema}`；App 的接口地址集中在 `ORBIT_API_ENDPOINTS`；App 若对 `InboxSourceKind` 做了穷举 `switch`，扩值后 typecheck 会报错，需要补默认分支。
7. **设计稿示例内容**：设计稿各画板用的示例人物、公司、活动、计划（如 `b10-plan-example.html` 的计划示例、`app.html` / `web.html` 的人脉和活动示例）。

## 上下文包

### 必读
- `IMPLEMENTATION-PLAN.md` §2 的 D-01、D-07、D-08、D-10、D-11、D-12b、D-13、D-14、D-15、D-17、D-21、D-22、D-23，以及 D-02 / D-03 / D-04（只取顶层）。
- Web：第 1–5 条列出的文件；`tests/contract-surface.test.ts`、`tests/api-schema/` 下任意两个。
- App：`scripts/sync-contract.mjs`、`tests/{contract,api-schema}-sync.test.ts`、`ORBIT_API_ENDPOINTS` 所在文件、对 `InboxSourceKind` 做 switch 的位置。

### 关键符号与 impact（开工时重跑）
- 第 5 条的现有契约：**只加可选字段 / 只加枚举值**，不改已有字段；HIGH 的 `InboxNotificationDTO` 在 REPORT 写明消费方检查结果。
- `createModuleServiceFactory`、`resolveFeatureMode`：只调用。

### 易错边界（全部写进 SC）
假数据接口在正式环境意外返回假数据（必须是 `NOT_IMPLEMENTED`）；扩展现有契约时改了已有字段的类型；fixture 不通过自己的 schema；演示世界的人物在不同 fixture 里名字或公司不一致；示例数据没有「示例」标记被当成真实数据；App 扩值后穷举 switch 编译失败；「只加不改」检查把新增可选字段误判为破坏。

## 契约（本 Sprint 定稿，REPORT 交接）

### 12 组契约（每组：类型文件 + zod + mock 路由 + fixture + 负责人 / 使用方注释）

| # | 契约文件（`shared/contract/`） | 接口（mock 模式返回 fixture；live 未实现时 `NOT_IMPLEMENTED`） | 负责人 → 使用方 |
| --- | --- | --- | --- |
| 1 | `home-layout.ts`：`HomeLayoutContract { revision; app: HomeWidgetSlot[]; web: HomeWidgetSlot[]; hintDismissedAt? }`，`HomeWidgetSlot { key: 'today' \| 'planScore' \| 'nextEvent' \| 'network' \| 'secretary' \| 'pending' \| 'week' \| 'eventPick' \| 'memo' \| 'deadline'; size: 's' \| 'm' }`；默认布局常量 | `GET / PUT /api/home/layout`（PUT 带 `expectedRevision`、`mutationId`，409 冲突） | 乙（R10）→ 两端首页 |
| 2 | `contacts.ts` 扩展：`ContactListItemContract` 加可选 `density?: 1 \| 2 \| 3`、`sourceChip?: 'meishi' \| 'linkedin' \| 'phone' \| 'manual' \| 'self'`；`/summary` 加可选 `densityCounts`、`addedThisMonth` | `/api/contacts/page` 接受 `density`、`goalRelated`、`needsFollowUp` 参数（mock 生效；live 忽略，直到 R11 实现） | 乙（R11）→ 人脈、首页 |
| 3 | `contact-completion.ts`：`ContactCompletionQuestion { id, contactId, question, options[], askedOn, skipCount }` | `GET /api/contacts/completion-question`、`POST …/[id]/answer`、`POST …/[id]/skip` | 甲（R16）→ To-do、人脈 |
| 4 | `invite-codes.ts`：码（8 位 `XXXX-XXXX`）、链接、`maxUses ≤10`、`expiresAt`（7 天）、`usedCount`、共享字段；兑换结果 `'connected' \| 'merged' \| 'already_connected'` | `POST /api/invite-codes`、`GET /api/invite-codes/current`、`POST /api/invite-codes/[code]/revoke`、`GET /api/invite-codes/[code]/preview`（公开，只返回共享字段）、`POST /api/invite-codes/[code]/redeem` | 甲（R15）→ 人脈「＋」、首页 |
| 5 | `notes.ts` 扩展：`NoteContract` 加可选 `noteKind?: 'free' \| 'meeting' \| 'voice'`、`usedForPlan?: boolean`；`NoteMentionContract` 加可选 `entityType?: 'contact' \| 'event'`、`eventId?` | 现有笔记接口（mock fixture 带新字段；live 不变，直到 R20） | 乙（R20）→ Task 笔记、计划 |
| 6 | `inbox-notifications.ts` 扩展：`InboxSourceKind` 加 `'event_deadline' \| 'event_prep' \| 'event_pick' \| 'mail_summary'` | 现有收件箱接口（mock fixture 含新来源） | 乙（R13）→ 收件箱、首页秘书组件 |
| 7 | `notification-delivery-policy.ts` 扩展：`InboxDeliveryPreferencesDTO` 加可选 `quietStart`、`quietEnd`、`dailyCap (1..3)`、`secretaryMail`、`secretaryDeadline`、`secretaryPick`、`meetingException` | 现有偏好接口（mock） | 乙（R14）→ 设置 |
| 8 | `event-assessment.ts`：`sourceKind 'url' \| 'poster' \| 'orbit_event'`、`status 'reading' \| 'ready' \| 'needs_input' \| 'failed'`、`facts`、`scoreBreakdown`（5 项固定标准）、`total 0–100`、`verdict 'recommend' \| 'conditional' \| 'skip'`、`missingFields[]`、`rubricVersion` | `POST /api/events/assessments`、`GET /api/events/assessments(/[id])`、`PATCH /api/events/assessments/[id]`、`POST …/[id]/add-to-plan` | 甲（R26）→ 活动、首页 |
| 9 | `event-recommendation-feedback.ts`：`reason 'schedule' \| 'distance' \| 'content' \| 'known'` | `POST /api/recommendations/events/[id]/dismiss` | 甲（R27）→ 活动、秘书 |
| 10 | `tasks.ts` 扩展：`TaskItemContract` 加可选 `deferralCount?` | 现有待办接口（mock） | 乙（R20）→ To-do |
| 11 | `account.ts`：导出任务（`scope[]`、`status`、7 天链接）、退会申请（`requestedAt`、`purgeAfter` +30 天、`cancelledAt`）、`minSupportedAppVersion` | `POST / GET /api/account/exports(/[id])`、`POST / DELETE /api/account/deletion-request`、`GET /api/app/version` | 乙（R18）→ 设置、App 启动 |
| 12 | `plan-v2.ts`（**顶层草案**，文件头标 `@draft until R22`）：`PlanIntakeSummary`、`PlanV2Summary { goal, goalKind, steps[], personTypes[] }`、`PlanScoreView { total, byType[], todayDelta }` | `GET /api/agent/plans/v2/summary`（mock，供首页计划分数组件和 Task 计划段开发）；正式接口由 R22 定 | 甲（R22）→ 首页、Task、活动评分 |

### 统一演示世界
- `repos/orbits/shared/mock/demo-world/`：一份人物、公司、活动、计划、笔记、待办的数据源，所有 fixture 都从这里组装。
- 内容与设计稿示例一致，**日文为主**（R03 的术语表和写作规范同样适用），人物全部虚构。
- 每条示例数据带 `sample: true` 标记，界面据此显示示例角标；示例数据不写库，不进统计、搜索和 AI 依据（`01-system.html:484-488`）。

### 「只加不改」检查
- **快照**：脚本 `scripts/contract-snapshot.mjs` 用 TypeScript 编译器读取 `shared/contract/*.ts`，生成字段快照 `shared/contract/.snapshot.json`（字段名、是否可选、类型、枚举取值）。
- **测试** `contract-append-only.test.ts` 把当前契约和快照对比：
  - 出现以下任一情况就失败：删除字段、改名、可选变必填、类型变窄、枚举少值；
  - 只是新增可选字段或新增枚举值时，提示「更新快照」，更新后通过。
- **例外**：
  - 标 `@draft` 的文件不检查；
  - 确实需要破坏性修改时，必须在 `shared/contract/BREAKING.md` 写一条记录（日期、改动、原因、甲乙双方同意），测试读取到对应记录才放行。
- **提交规则**：改契约的提交信息以 `contract:` 开头，并注明「App 需要同步」。

### 「尚未实现」处理
- **Web 和 App 各加一个小工具**，例如 `isNotImplemented(result)`，用来识别接口返回的「尚未实现」。
- **约定**：界面遇到「尚未实现」时，隐藏对应入口或使用默认值（比如首页布局用默认布局），**不显示错误**。
- **在哪里验证**：本 Sprint 只做这个工具和它的测试。各功能 Sprint 接入接口时要遵守这条约定。

## 范围与文件

- **新建**：
  - 契约和 schema：`shared/contract/{home-layout,contact-completion,invite-codes,event-assessment,event-recommendation-feedback,account,plan-v2}.ts` 和对应的 `shared/api-schema/*.ts`；
  - mock 路由：各接口的 `app/api/**/route.ts` + `handler.ts`；
  - 服务：`features/<领域>/{service-factory,mock-service,fixtures}.ts`；
  - 演示世界与检查：`shared/mock/demo-world/**`、`scripts/contract-snapshot.mjs`、`.snapshot.json`、`BREAKING.md`；
  - 两端的「尚未实现」工具。
- **修改**：
  - 契约：`shared/contract/{contacts,notes,inbox-notifications,notification-delivery-policy,tasks,index}.ts`；
  - 登记：`capability-registry.ts`（如需要）、登录路由前缀（新的私有接口）；
  - App：同步副本、对 `InboxSourceKind` 做穷举 switch 的位置。
- **测试**：
  - 每组契约：一个 schema 测试 + 一个 mock 路由测试；mock 返回的数据要通过校验，live 未实现时返回 `NOT_IMPLEMENTED`；
  - `demo-world-consistency.test.ts`：同一个人物在所有 fixture 里的姓名、公司都一致，并且都带示例标记；
  - `contract-append-only.test.ts`；
  - App 新增 `contract-fixtures-parse.test.ts`：用同步过来的 zod 解析每一份 fixture；
  - 两端「尚未实现」工具的测试；`contract-surface` 保持通过。
- **不做**：
  - 任何真实实现（live 服务）、数据库迁移；
  - 计划 v2 的完整字段和正式接口（R22）；
  - 界面接入（各功能 Sprint 负责）。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R08-01 12 组契约齐全 | 每组都有类型、校验、mock 路由、fixture、负责人和使用方注释 | 各组 schema 测试和路由测试 |
| SC-R08-02 正式环境不返回假数据 | 在 live 模式下调用每个新接口，都返回结构化的 `NOT_IMPLEMENTED`，不会给出 fixture | 路由测试（live 分支） |
| SC-R08-03 App 能直接用 | App 同步后，用同一套 zod 解析每一份 fixture 都通过；typecheck 通过，包括补上默认分支的 switch | App `contract-fixtures-parse`、`tsc` |
| SC-R08-04 演示世界一致 | 同一个人物在首页、人脉、活动、计划相关的 fixture 里，姓名和公司都相同；每条示例数据都带标记 | `demo-world-consistency.test.ts` |
| SC-R08-05 只加不改 | 分别构造四种破坏：删字段、改名、可选变必填、枚举少值，检查都会失败；新增可选字段时检查通过（更新快照后）；在 `BREAKING.md` 有记录时放行 | `contract-append-only.test.ts` |
| SC-R08-06 「尚未实现」处理 | 两端的工具能正确识别「尚未实现」，并能据此选择用默认值还是隐藏入口 | 两端工具测试 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 扩展现有契约时只新增了可选字段或枚举值；HIGH 级的 `InboxNotificationDTO`，REPORT 列出所有消费方的检查结果 | 契约快照 diff 与 REPORT |
| 04 | fixture 里用户看得到的文字符合 R03 的术语表，并通过 `copy-qa check` | 检查输出 |
| 全部 | 两端全量测试对照基线零新增失败；`tsc`、`typecheck:app`、`lint` 通过；`detect-changes` 结果写进 REPORT | 全量清单 |

## 执行顺序

1. 记录基线；对第 5 条列出的现有契约跑 impact。
2. 搭演示世界的数据源，写一致性测试（RED）。
3. 逐组完成：类型 → zod → fixture → mock 服务 → 路由。每组都先写测试。
4. 「只加不改」快照脚本和测试；加 `BREAKING.md`。
5. 两端的「尚未实现」工具；同步到 App，补上 switch 的默认分支。
6. 跑全量测试、写 REPORT。

## 失败与交接

某组契约的结构在设计稿或实施方案里有矛盾：按实施方案附录 D 的口径定，并写进 REPORT。如果附录 D 也没有，就标成 `@draft`，交给对应的功能 Sprint 去定。

REPORT 交接内容：
- 12 组契约的清单，含接口地址、负责人、使用方；
- 演示世界的人物表；
- 快照更新的方法和 `BREAKING.md` 的流程；
- 「尚未实现」的界面约定。
