# Orbit 技术设计

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/designs/orbit_technical_design.md` |
| 中文镜像 | `knowledge/docs/zh/technical-design.zh.md` |
| 分类 | `technical-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `architecture` |

## 中文摘要

说明 mock-first、contract-first、模块拆分、Next.js App Router 和服务层边界。

## 审计依据

已登记关联代码路径：repos/orbits/app、repos/orbits/features、repos/orbits/shared。

## 结构化阅读入口

- 第 1 节：Orbit 技术设计文档
- 第 2 节：1. 文档目标
- 第 3 节：2. POC 参考边界
- 第 4 节：2.1 可以借鉴的部分
- 第 5 节：2.2 不应照搬的部分
- 第 6 节：3. 技术原则
- 第 7 节：3.1 关系资产优先
- 第 8 节：3.2 所有关系必须有来源
- 第 9 节：源文档第 9 个标题
- 第 10 节：3.4 契约 first
- 第 11 节：3.5 最小化实现
- 第 12 节：4. 推荐技术栈
- 第 13 节：4.1 应用层
- 第 14 节：4.2 数据层
- 第 15 节：4.3 AI 层
- 第 16 节：4.4 测试层
- 第 17 节：5. 总体架构
- 第 18 节：源文档第 18 个标题
- 第 19 节：源文档第 19 个标题
- 第 20 节：源文档第 20 个标题
- 第 21 节：6. 核心领域对象
- 第 22 节：源文档第 22 个标题
- 第 23 节：源文档第 23 个标题
- 第 24 节：6.3 联系人
- 第 25 节：源文档第 25 个标题
- 第 26 节：源文档第 26 个标题
- 第 27 节：6.6 活动
- 第 28 节：源文档第 28 个标题
- 第 29 节：6.8 任务
- 第 30 节：源文档第 30 个标题
- 第 31 节：7. MVP 模块拆分
- 第 32 节：源文档第 32 个标题
- 第 33 节：源文档第 33 个标题
- 第 34 节：7.3 活动
- 第 35 节：7.4 联系人
- 第 36 节：源文档第 36 个标题
- 第 37 节：7.6 推荐
- 第 38 节：7.7 跟进
- 第 39 节：源文档第 39 个标题
- 第 40 节：源文档第 40 个标题
- 第 41 节：源文档第 41 个标题
- 第 42 节：8. Mock-first 开发流程
- 第 43 节：8.1 阶段 P0：应用骨架
- 第 44 节：8.2 阶段 P1：契约和 mock 数据
- 第 45 节：8.3 阶段 P2：页面组件接入 mock 服务
- 第 46 节：8.4 阶段 P3：真实服务替换
- 第 47 节：8.5 阶段 P4：集成和收口
- 第 48 节：9. 数据模式建议
- 第 49 节：9.1 核心约束
- 第 50 节：9.2 与 POC 数据模型的映射
- 第 51 节：10. API 设计
- 第 52 节：10.1 统一响应
- 第 53 节：10.2 推荐 API 分组
- 第 54 节：源文档第 54 个标题
- 第 55 节：11. 模块拼接方式
- 第 56 节：12. 两人协作分工
- 第 57 节：12.1 开发者 A：核心关系底座
- 第 58 节：12.2 开发者 B：智能和互动层
- 第 59 节：12.3 共享文件规则
- 第 60 节：13. 单个功能的交付模板
- 第 61 节：13.1 例子：活动后跟进
- 第 62 节：14. UI 组合原则
- 第 63 节：15. AI 设计
- 第 64 节：15.1 AI 不直接拥有业务真相
- 第 65 节：15.2 Provider 接口
- 第 66 节：15.3 MVP AI 优先级
- 第 67 节：16. 权限与隐私设计
- 第 68 节：16.1 默认私有
- 第 69 节：16.2 分阶段授权
- 第 70 节：16.3 高敏感动作确认
- 第 71 节：17. 验收标准
- 第 72 节：17.1 框架验收
- 第 73 节：17.2 模块验收
- 第 74 节：17.3 集成验收
- 第 75 节：18. 开发节奏建议
- 第 76 节：18.1 第 1 轮：共同搭骨架
- 第 77 节：18.2 第 2 轮：并行写契约和 mock
- 第 78 节：18.3 第 3 轮：页面闭环
- 第 79 节：18.4 第 4 轮：真实数据替换
- 第 80 节：18.5 第 5 轮：AI 和体验收口

## 保留的代码与命令证据

### 代码证据 1

```json
{
  "success": true,
  "data": {}
}
```

### 代码证据 2

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### 代码证据 3

```text
app/
  (public)/
  (account)/
  (app)/
  api/

features/
  account/
  profile/
  contacts/
  connections/
  events/
  recommendations/
  followups/
  chat/
  dashboard/
  agent/
  permissions/
  notifications/

shared/
  api/
  auth/
  config/
  errors/
  mock/
  ui/
  utils/

tests/
  account/
  profile/
  contacts/
  connections/
  events/
  recommendations/
  followups/
  chat/
  dashboard/
  agent/
```

### 代码证据 4

```text
features/connections/
  contract.ts
  fixtures.ts
  service.ts
  mock-service.ts
  server-service.ts
  components/
  api/
  tests/
```

### 代码证据 5

```text
accounts
user_profiles
contacts
connections
relationship_evidence
events
event_attendees
conversations
messages
tasks
agent_actions
consent_grants
ai_runs
```

### 代码证据 6

```ts
type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

### 代码证据 7

```text
GET    /api/account/me
GET    /api/profile
PUT    /api/profile

GET    /api/events
POST   /api/events
GET    /api/events/:id
PUT    /api/events/:id/goal

GET    /api/contacts
POST   /api/contacts
GET    /api/contacts/:id
PATCH  /api/contacts/:id

GET    /api/connections
POST   /api/connections
GET    /api/connections/:id
POST   /api/connections/:id/evidence
PATCH  /api/connections/:id/stage

GET    /api/recommendations/event/:eventId
POST   /api/recommendations/contact

GET    /api/tasks
POST   /api/tasks
PATCH  /api/tasks/:id

GET    /api/chat/conversations
GET    /api/chat/conversations/:id
POST   /api/chat/conversations/:id/messages
POST   /api/chat/conversations/:id/summary

GET    /api/dashboard

GET    /api/agent/actions
POST   /api/agent/actions/:id/accept
POST   /api/agent/actions/:id/dismiss
```

### 代码证据 8

```text
GET /api/app/bootstrap
```

### 代码证据 9

```ts
export type ModuleMode = "mock" | "hybrid" | "live";

export type ConnectionsService = {
  listConnections(input: ListConnectionsInput): Promise<ConnectionListResult>;
  getConnection(input: GetConnectionInput): Promise<ConnectionDetailResult>;
  addEvidence(input: AddEvidenceInput): Promise<RelationshipEvidenceDTO>;
  updateStage(input: UpdateConnectionStageInput): Promise<ConnectionDTO>;
};
```

### 代码证据 10

```ts
export function createConnectionsService(mode: ModuleMode): ConnectionsService {
  if (mode === "live") return createLiveConnectionsService();
  if (mode === "hybrid") return createHybridConnectionsService();
  return createMockConnectionsService();
}
```

### 代码证据 11

```text
features/account/
features/profile/
features/events/
features/contacts/
features/connections/
shared/api/
shared/auth/
shared/errors/
app/api/account/
app/api/profile/
app/api/events/
app/api/contacts/
app/api/connections/
```

### 代码证据 12

```text
features/recommendations/
features/followups/
features/chat/
features/dashboard/
features/agent/
features/notifications/
shared/ai/
app/api/recommendations/
app/api/tasks/
app/api/chat/
app/api/dashboard/
app/api/agent/
```

### 代码证据 13

```text
shared/api/envelope.ts
shared/errors/app-error.ts
shared/config/feature-flags.ts
shared/mock/registry.ts
features/*/contract.ts
database migrations
app/layout.tsx
app/(app)/layout.tsx
```

### 代码证据 14

```text
/app
/app/profile
/app/events
/app/events/:id
/app/contacts
/app/contacts/:id
/app/followups
/app/chat
/app/dashboard
/app/agent
```

### 代码证据 15

```ts
export type AiProvider = {
  generateMessageDraft(input: MessageDraftInput): Promise<MessageDraftResult>;
  summarizeConversation(input: ConversationSummaryInput): Promise<ConversationSummaryResult>;
  recommendContacts(input: ContactRecommendationInput): Promise<ContactRecommendationResult>;
  extractBusinessCard(input: BusinessCardExtractionInput): Promise<BusinessCardExtractionResult>;
};
```

## 源文档正文

## 1. 文档目标

本文档描述 Orbit Web 服务的技术架构、组件化开发流程、mock-first 搭建方式和两人协作边界。

它服务于 `docs/designs/inital_design.md` 中定义的产品目标，但不替代产品设计文档。产品文档回答“做什么”和“为什么做”，本文档回答“技术上如何拆、如何先搭框架、如何让两个人并行实现、如何最终拼接成完整系统”。

Orbit 的工程目标是：

1. 先搭出可运行的软件框架；
2. 每个功能区先用 mock 数据和 mock 组件占位；
3. 两名开发者按清晰模块边界并行实现真实组件；
4. 真实实现通过稳定接口替换 mock；
5. 最终形成可拼接、可测试、可逐步上线的 Web 服务。

## 2. POC 参考边界

参考项目位于 `repos/tokyo-business-connect`。它可以作为技术骨架参考，但不能作为 Orbit 产品模型的直接模板。

### 2.1 可以借鉴的部分

POC 已经证明以下技术模式可行：

1. 使用 Next.js App Router 构建 Web 应用；
2. 使用 Route Handlers 承载服务端 API；
3. 使用 Supabase/Postgres 作为主数据库；
4. 使用 `lib/*` 放置纯业务逻辑和服务函数；
5. 使用统一 API 响应结构：

```json
{
  "success": true,
  "data": {}
}
```

或：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

6. 使用 bootstrap API 聚合首页或工作台首屏数据；
7. 使用 `tests/*.test.js` 对服务函数、数据归一化、权限判断和边界条件做 Node 原生测试；
8. 使用 `connections` 与 `connection_encounters` 这类结构记录“联系人”和“认识场景”；
9. 将 AI 生成、推荐、分组等能力放在服务层，前端只消费归一化结果；
10. 用 event scope 避免活动数据互相污染。

### 2.2 不应照搬的部分

Orbit 的产品理念不同于 POC：

1. POC 的第一主对象是 `event`，Orbit 的第一主对象是用户的关系资产；
2. POC 的 `profile` 是某场活动内的 participant profile，Orbit 需要全局用户画像、联系人画像和连接画像；
3. POC 偏活动报名和现场匹配，Orbit 偏长期人脉管理、关系上下文、跟进和 Agent 激活；
4. POC 的通行码和活动参与者会话不应成为 Orbit 的主登录模型；
5. POC 的主办方后台不是 Orbit MVP 的核心，不应优先搭建；
6. POC 中活动是业务根对象，Orbit 中活动只是关系来源和关系上下文之一。

因此，Orbit 可以复用 POC 的工程组织经验，但必须建立新的领域边界。

## 3. 技术原则

### 3.1 关系资产优先

Orbit 的核心数据不是活动报名记录，而是用户拥有的关系资产。

所有功能最终都应该回答：

1. 这个人是谁；
2. 我为什么认识这个人；
3. 这段关系来自哪里；
4. 当前关系阶段是什么；
5. 这段关系对我有什么价值；
6. 下一步应该怎么推进。

### 3.2 所有关系必须有来源

系统不得创建无来源、无上下文的人脉记录。

每个联系人、连接或推荐都必须至少带一个 `source` 或 `evidence`：

1. 活动；
2. 扫码；
3. 名片；
4. 手动添加；
5. 聊天；
6. 邮件或日历授权结果；
7. 推荐人；
8. 用户主动确认。

### 3.3 Mock-first

所有模块先定义契约，再写 mock，再接 UI，最后替换真实服务。

一个功能模块在真实后端完成前，也必须能通过 mock 数据在页面中运行。这保证两人可以在互不阻塞的情况下开发。

### 3.4 Contract-first

组件之间不能直接读取对方内部实现。跨模块只能通过公开契约交互：

1. TypeScript 类型或 JSDoc 类型；
2. API response shape；
3. service interface；
4. mock fixture；
5. 明确的错误码。

修改契约必须同步修改 mock、测试和消费方。

### 3.5 最小化实现

MVP 不引入不必要的复杂系统：

1. 不做微服务；
2. 不引入独立 graph database；
3. 不做完整 CRM；
4. 不做复杂实时 IM；
5. 不做完整 Gmail/Calendar 深度读取；
6. 不做活动主办方后台；
7. 不做自动外发消息；
8. 不做多层人脉推荐。

MVP 使用一个 Next.js 应用、一个 Supabase 数据库、一组清晰服务模块和可替换 mock。

## 4. 推荐技术栈

### 4.1 应用层

1. Next.js App Router；
2. React；
3. Route Handlers；
4. Server Components 用于首屏静态结构；
5. Client Components 用于交互、筛选、输入、聊天和扫码。

### 4.2 数据层

1. Supabase Postgres；
2. Supabase Auth 或自定义 account session；
3. 数据访问集中放在 `features/*/server` 或 `lib/*`；
4. 所有数据库写入走服务函数，不在页面组件中直接写数据库。

### 4.3 AI 层

1. AI provider 抽象成统一接口；
2. MVP 支持 DeepSeek 或 Anthropic 其中一个即可；
3. 所有 AI 输出必须保存 provenance；
4. 关键画像更新、消息发送、联系人添加必须由用户确认；
5. 在真实 AI 接入前，使用 rule-based mock generator。

### 4.4 测试层

1. 纯函数使用 Node 原生测试或 Vitest；
2. API route 测试关注响应 shape、权限和错误码；
3. 组件测试优先验证 mock 数据能渲染关键状态；
4. 集成验收至少包含 `npm test`、`npm run lint` 和 `npm run build`。

## 5. 总体架构

Orbit 按模块契约拼接，而不是按页面随意堆功能。

```text
app/
  (public)/
  (account)/
  (app)/
  api/

features/
  account/
  profile/
  contacts/
  connections/
  events/
  recommendations/
  followups/
  chat/
  dashboard/
  agent/
  permissions/
  notifications/

shared/
  api/
  auth/
  config/
  errors/
  mock/
  ui/
  utils/

tests/
  account/
  profile/
  contacts/
  connections/
  events/
  recommendations/
  followups/
  chat/
  dashboard/
  agent/
```

### 5.1 `app/*`

`app/*` 只负责路由、布局和页面组合。

页面不直接实现复杂业务逻辑。页面只做三件事：

1. 调用 bootstrap 或 module API；
2. 选择展示哪些 feature component；
3. 处理路由级 loading、empty、error 状态。

### 5.2 `features/*`

每个 feature 是一个可独立替换的业务模块。

推荐结构：

```text
features/connections/
  contract.ts
  fixtures.ts
  service.ts
  mock-service.ts
  server-service.ts
  components/
  api/
  tests/
```

职责说明：

1. `contract.ts` 定义模块输入、输出、DTO、错误码；
2. `fixtures.ts` 提供稳定 mock 数据；
3. `service.ts` 定义模块服务接口；
4. `mock-service.ts` 用 mock 数据实现接口；
5. `server-service.ts` 用真实数据库实现接口；
6. `components/` 只依赖契约，不依赖数据库；
7. `api/` 放 route handler 使用的 request parser 和 response builder；
8. `tests/` 测试契约、归一化、权限和边界条件。

### 5.3 `shared/*`

`shared/*` 只能放跨模块基础能力：

1. API envelope；
2. AppError；
3. auth helpers；
4. feature flag；
5. mock registry；
6. UI primitives；
7. 日期、文本、数组清洗等通用工具。

`shared` 不允许依赖具体 feature，避免反向耦合。

## 6. 核心领域对象

### 6.1 Account

代表真实登录用户。

关键字段：

1. `id`；
2. `email`；
3. `display_name`；
4. `avatar_url`；
5. `locale`；
6. `created_at`；
7. `updated_at`。

### 6.2 UserProfile

代表用户自己的长期画像。

关键字段：

1. `account_id`；
2. `full_name`；
3. `company`；
4. `title`；
5. `industry`；
6. `location`；
7. `bio`；
8. `current_goals`；
9. `offering`；
10. `seeking`；
11. `event_preferences`；
12. `contact_preferences`；
13. `profile_visibility`；
14. `updated_at`。

### 6.3 Contact

代表用户的人脉库中的某个人。

关键字段：

1. `id`；
2. `owner_account_id`；
3. `linked_account_id`；
4. `person_key`；
5. `display_name`；
6. `company`；
7. `title`；
8. `industry`；
9. `contacts`；
10. `tags`；
11. `status`；
12. `source_summary`；
13. `last_interaction_at`；
14. `created_at`；
15. `updated_at`。

`person_key` 用于去重。优先级建议为：

1. linked account id；
2. normalized email；
3. normalized phone；
4. external profile id；
5. name + company 的弱 key。

弱 key 创建的联系人必须标记为 `needs_confirmation`。

### 6.4 Connection

代表用户和某个人之间的一段关系画像。

关键字段：

1. `id`；
2. `owner_account_id`；
3. `contact_id`；
4. `relationship_type`；
5. `stage`；
6. `strength`；
7. `value_tags`；
8. `mutual_value_summary`；
9. `latest_summary`；
10. `next_action`；
11. `needs_followup`；
12. `is_high_value`；
13. `is_dormant`；
14. `updated_at`。

### 6.5 RelationshipEvidence

代表关系来源和上下文。它是 Orbit 的关键对象。

关键字段：

1. `id`；
2. `owner_account_id`；
3. `connection_id`；
4. `source_type`；
5. `source_id`；
6. `occurred_at`；
7. `summary`；
8. `raw_snapshot`；
9. `confidence`；
10. `requires_confirmation`。

可选 `source_type`：

1. `event`;
2. `qr_scan`;
3. `business_card`;
4. `manual_note`;
5. `chat`;
6. `calendar`;
7. `email`;
8. `intro`;
9. `import`.

### 6.6 Event

代表活动上下文，不是 Orbit 的唯一根对象。

关键字段：

1. `id`；
2. `owner_account_id`；
3. `title`；
4. `starts_at`；
5. `ends_at`；
6. `venue`；
7. `source`；
8. `topic_tags`；
9. `attendee_count`；
10. `user_goal`；
11. `status`。

MVP 只需要用户手动创建、导入或使用 mock 活动，不需要主办方后台。

### 6.7 Conversation

代表站内聊天或外部聊天摘要。

关键字段：

1. `id`；
2. `owner_account_id`；
3. `connection_id`；
4. `channel`；
5. `last_message_at`；
6. `summary`；
7. `ai_analysis_enabled`。

MVP 可以先做轻量站内一对一聊天或聊天摘要，不做完整实时 IM。

### 6.8 Task

代表跟进动作。

关键字段：

1. `id`；
2. `owner_account_id`；
3. `connection_id`；
4. `event_id`；
5. `kind`；
6. `title`；
7. `due_at`；
8. `priority`；
9. `status`；
10. `suggested_message`。

### 6.9 AgentAction

代表 Agent 建议，而不是已经执行的自动动作。

关键字段：

1. `id`；
2. `owner_account_id`；
3. `kind`；
4. `target_type`；
5. `target_id`；
6. `reason`；
7. `payload`；
8. `status`；
9. `created_at`；
10. `confirmed_at`。

AgentAction 的状态建议：

1. `drafted`；
2. `shown`；
3. `accepted`；
4. `dismissed`；
5. `completed`。

## 7. MVP 模块拆分

### 7.1 Account & Auth

目标：

1. 用户可以注册、登录、退出；
2. 每个请求能得到当前 account；
3. 页面能根据登录状态进入 app shell。

公开契约：

1. `getCurrentAccount()`；
2. `requireAccount()`；
3. `AccountDTO`；
4. `AuthStateDTO`。

Mock 行为：

1. 默认返回一个固定 demo account；
2. 支持切换“未登录 / 已登录”状态；
3. 不依赖真实 Supabase Auth。

### 7.2 Profile

目标：

1. 用户填写基础画像；
2. 用户能看到和修改当前目标、可提供资源、想获得资源；
3. 推荐和 Agent 能消费画像。

公开契约：

1. `loadUserProfile(accountId)`；
2. `updateUserProfile(accountId, patch)`；
3. `UserProfileDTO`；
4. `ProfileCompletenessDTO`。

Mock 行为：

1. 返回一个创业者或 BD demo profile；
2. 支持保存到内存或 session storage；
3. 提供画像完整度分数。

### 7.3 Events

目标：

1. 用户能创建或导入活动；
2. 活动作为关系来源；
3. 活动前、中、后流程可以消费活动状态。

公开契约：

1. `listEvents(accountId)`；
2. `getEvent(eventId)`；
3. `createEvent(input)`；
4. `setEventGoal(eventId, goal)`；
5. `EventDTO`。

Mock 行为：

1. 提供 3 个 demo 活动：未开始、进行中、已结束；
2. 每个活动有 mock 参会者；
3. 活动目标可以本地修改。

### 7.4 Contacts

目标：

1. 用户能查看人脉库；
2. 用户能按状态、标签、来源筛选；
3. 名片扫描、扫码、活动匹配最终都能写入联系人。

公开契约：

1. `listContacts(accountId, filter)`；
2. `getContact(contactId)`；
3. `upsertContact(input)`；
4. `ContactDTO`；
5. `ContactFilterDTO`。

Mock 行为：

1. 提供 15 到 30 个不同来源的人脉；
2. 包含高价值、待跟进、沉睡、待确认等状态；
3. 支持前端筛选和搜索。

### 7.5 Connections

目标：

1. 为联系人建立关系画像；
2. 记录关系来源和上下文；
3. 为后续推荐、跟进、表盘提供核心数据。

公开契约：

1. `listConnections(accountId, filter)`；
2. `getConnection(connectionId)`；
3. `addRelationshipEvidence(input)`；
4. `updateConnectionStage(connectionId, stage)`；
5. `ConnectionDTO`；
6. `RelationshipEvidenceDTO`。

Mock 行为：

1. 每个 connection 至少有一个 evidence；
2. 模拟活动认识、名片扫描、手动添加、聊天沉淀；
3. 支持关系阶段变化。

### 7.6 Recommendations

目标：

1. 根据用户画像、活动和联系人推荐值得认识或跟进的人；
2. 每个推荐必须说明原因；
3. MVP 优先 rule-based，不依赖复杂 AI。

公开契约：

1. `getEventRecommendations(accountId, eventId)`；
2. `getContactRecommendations(accountId, goal)`；
3. `RecommendationDTO`。

Mock 行为：

1. 根据 demo profile 的 `seeking` 和 event attendee tags 生成推荐；
2. 每个推荐有 `score`、`reason`、`suggested_opening`；
3. 支持空推荐状态。

### 7.7 Followups

目标：

1. 活动后生成跟进任务；
2. 为每个任务生成可编辑消息草稿；
3. 用户确认后标记完成。

公开契约：

1. `listTasks(accountId, filter)`；
2. `createFollowup(connectionId, input)`；
3. `generateMessageDraft(connectionId, context)`；
4. `completeTask(taskId)`；
5. `TaskDTO`。

Mock 行为：

1. 为刚认识的人生成 3 个待跟进任务；
2. 消息草稿由规则模板生成；
3. 支持完成、延后、忽略。

### 7.8 Chat

目标：

1. 支持轻量站内聊天或聊天摘要；
2. 聊天内容可以更新连接画像；
3. 重要画像更新必须用户确认。

公开契约：

1. `listConversations(accountId)`；
2. `getConversation(conversationId)`；
3. `sendMessage(conversationId, text)`；
4. `summarizeConversation(conversationId)`；
5. `ConversationDTO`；
6. `MessageDTO`。

Mock 行为：

1. 提供若干静态对话；
2. 发送消息后追加本地消息；
3. 总结函数返回固定摘要和待确认画像更新。

### 7.9 Dashboard

目标：

1. 展示关系资产总览；
2. 展示行业分布、价值类型、关系状态；
3. 展示本周建议行动。

公开契约：

1. `loadDashboard(accountId)`；
2. `DashboardDTO`。

Mock 行为：

1. 从 mock contacts 和 mock connections 聚合；
2. 不单独维护第二份统计数据；
3. 支持空数据状态。

### 7.10 Agent

目标：

1. 把推荐、提醒、消息草稿、关系激活统一成 Agent 建议；
2. Agent 不直接执行高敏感动作；
3. 用户确认后再发送消息、创建任务或更新画像。

公开契约：

1. `listAgentActions(accountId)`；
2. `createAgentAction(input)`；
3. `acceptAgentAction(actionId)`；
4. `dismissAgentAction(actionId)`；
5. `AgentActionDTO`。

Mock 行为：

1. 生成活动前提醒；
2. 生成活动后跟进建议；
3. 生成沉睡关系激活建议；
4. 所有动作只改变本地状态。

## 8. Mock-first 开发流程

### 8.1 阶段 P0：应用骨架

目标是让应用先能跑起来。

交付内容：

1. App shell；
2. 登录态 mock；
3. 主要导航；
4. 空页面路由；
5. mock registry；
6. 统一 API envelope；
7. 基础错误组件。

完成标准：

1. `npm run dev` 能打开；
2. 首页、画像、人脉、活动、跟进、聊天、表盘页面都能进入；
3. 页面可以展示 mock loading、empty、error 状态；
4. 不接真实数据库也能完整浏览。

### 8.2 阶段 P1：契约和 mock 数据

目标是让每个模块都有稳定接口。

交付内容：

1. 每个 feature 的 `contract.ts`；
2. 每个 feature 的 `fixtures.ts`；
3. 每个 feature 的 `mock-service.ts`；
4. 关键 DTO 的测试；
5. mock 数据之间的引用一致性。

完成标准：

1. mock event attendee 可以被推荐模块引用；
2. mock recommendation 可以转成 connection；
3. mock connection 一定能追溯 evidence；
4. dashboard 统计来自同一批 mock contacts/connections；
5. 不存在孤立的假数据。

### 8.3 阶段 P2：页面组件接入 mock 服务

目标是把产品流程串起来，但仍然不依赖真实后端。

交付内容：

1. Onboarding/画像页；
2. 活动列表和活动详情；
3. 活动前推荐；
4. 现场扫码占位流程；
5. 人脉库；
6. 连接详情；
7. 跟进任务；
8. 聊天占位；
9. 表盘；
10. Agent 建议列表。

完成标准：

1. 新用户可以完成 mock onboarding；
2. 用户可以进入 mock 活动；
3. 用户可以从推荐对象进入连接详情；
4. 用户可以创建或完成 mock 跟进任务；
5. 用户可以看到表盘数据变化；
6. 所有功能可以用 demo 数据演示闭环。

### 8.4 阶段 P3：真实服务替换

目标是逐个模块替换真实实现。

替换顺序建议：

1. Account & Auth；
2. Profile；
3. Contacts；
4. Connections 与 RelationshipEvidence；
5. Events；
6. Followups；
7. Dashboard；
8. Recommendations；
9. Chat；
10. Agent。

替换规则：

1. 不改消费方组件契约；
2. 不改 mock 数据 shape；
3. 新增真实服务时保留 mock-service；
4. 使用 feature flag 选择 `mock`、`hybrid` 或 `live`；
5. 每次替换只替换一个模块或一个清晰子能力。

### 8.5 阶段 P4：集成和收口

目标是把 live 模块拼成完整 MVP。

交付内容：

1. 数据库迁移；
2. API route；
3. server service；
4. 权限校验；
5. 种子数据；
6. 端到端手工验收脚本；
7. 构建和测试门禁。

完成标准：

1. 新账号可以创建画像；
2. 用户可以添加活动；
3. 用户可以从活动或名片建立联系人；
4. 每个联系人都有来源；
5. 用户可以生成跟进任务；
6. 用户可以看到简单表盘；
7. Agent 建议不会自动执行敏感动作；
8. mock 模式仍然可用于本地演示和开发。

## 9. 数据模式建议

MVP 数据表建议保持简单。

```text
accounts
user_profiles
contacts
connections
relationship_evidence
events
event_attendees
conversations
messages
tasks
agent_actions
consent_grants
ai_runs
```

### 9.1 核心约束

1. 所有用户私有数据必须带 `owner_account_id`；
2. `contacts.owner_account_id + contacts.person_key` 唯一；
3. `connections.owner_account_id + connections.contact_id` 唯一；
4. `relationship_evidence.connection_id` 必须指向已存在 connection；
5. 没有 evidence 的 connection 不能进入正式人脉库；
6. AI 生成的画像更新必须标记 `requires_confirmation`；
7. 用户确认前不得覆盖用户手动填写的重要字段；
8. 删除 account 时应级联删除私有关系资产。

### 9.2 与 POC 数据模型的映射

| POC 概念 | Orbit 对应概念 | 处理方式 |
| --- | --- | --- |
| `events` | `events` | 保留为关系来源，不作为系统唯一根对象 |
| `profiles` | `event_attendees` 或外部人资料快照 | 不作为全局用户画像 |
| `connections` | `contacts` + `connections` | 拆分“人”和“关系画像” |
| `connection_encounters` | `relationship_evidence` | 扩展到活动、名片、聊天、日历、邮件等来源 |
| `matching_runs` | `ai_runs` 或 `recommendation_runs` | 只在需要记录 AI provenance 时引入 |
| `participant_sessions` | 不采用 | Orbit 使用 account 登录态 |

## 10. API 设计

### 10.1 统一响应

所有 API 返回统一 envelope：

```ts
type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

### 10.2 推荐 API 分组

```text
GET    /api/account/me
GET    /api/profile
PUT    /api/profile

GET    /api/events
POST   /api/events
GET    /api/events/:id
PUT    /api/events/:id/goal

GET    /api/contacts
POST   /api/contacts
GET    /api/contacts/:id
PATCH  /api/contacts/:id

GET    /api/connections
POST   /api/connections
GET    /api/connections/:id
POST   /api/connections/:id/evidence
PATCH  /api/connections/:id/stage

GET    /api/recommendations/event/:eventId
POST   /api/recommendations/contact

GET    /api/tasks
POST   /api/tasks
PATCH  /api/tasks/:id

GET    /api/chat/conversations
GET    /api/chat/conversations/:id
POST   /api/chat/conversations/:id/messages
POST   /api/chat/conversations/:id/summary

GET    /api/dashboard

GET    /api/agent/actions
POST   /api/agent/actions/:id/accept
POST   /api/agent/actions/:id/dismiss
```

### 10.3 Bootstrap API

为了减少首屏请求，建议提供：

```text
GET /api/app/bootstrap
```

返回：

1. account；
2. user profile；
3. upcoming events；
4. connection summary；
5. pending tasks；
6. top agent actions；
7. dashboard summary。

bootstrap 只返回轻量数据，不返回完整聊天记录、完整人脉列表和大型分析结果。

## 11. 模块拼接方式

每个模块都暴露同样形状的 provider：

```ts
export type ModuleMode = "mock" | "hybrid" | "live";

export type ConnectionsService = {
  listConnections(input: ListConnectionsInput): Promise<ConnectionListResult>;
  getConnection(input: GetConnectionInput): Promise<ConnectionDetailResult>;
  addEvidence(input: AddEvidenceInput): Promise<RelationshipEvidenceDTO>;
  updateStage(input: UpdateConnectionStageInput): Promise<ConnectionDTO>;
};
```

选择实现：

```ts
export function createConnectionsService(mode: ModuleMode): ConnectionsService {
  if (mode === "live") return createLiveConnectionsService();
  if (mode === "hybrid") return createHybridConnectionsService();
  return createMockConnectionsService();
}
```

页面组件只依赖 `ConnectionsService` 的输出，不知道数据来自 mock 还是数据库。

## 12. 两人协作分工

为了适合 vibe coding，分工必须按功能边界和文件所有权切开，不能两个人同时频繁改同一批文件。

### 12.1 开发者 A：核心关系底座

负责：

1. app shell；
2. account/auth；
3. profile；
4. events；
5. contacts；
6. connections；
7. relationship evidence；
8. core database migrations；
9. app bootstrap。

主要目录：

```text
features/account/
features/profile/
features/events/
features/contacts/
features/connections/
shared/api/
shared/auth/
shared/errors/
app/api/account/
app/api/profile/
app/api/events/
app/api/contacts/
app/api/connections/
```

### 12.2 开发者 B：智能和互动层

负责：

1. recommendations；
2. followups；
3. chat；
4. dashboard；
5. agent actions；
6. notifications；
7. AI provider abstraction；
8. AI provenance；
9. follow-up message generation。

主要目录：

```text
features/recommendations/
features/followups/
features/chat/
features/dashboard/
features/agent/
features/notifications/
shared/ai/
app/api/recommendations/
app/api/tasks/
app/api/chat/
app/api/dashboard/
app/api/agent/
```

### 12.3 共享文件规则

以下文件属于共享边界，修改前必须同步对方：

```text
shared/api/envelope.ts
shared/errors/app-error.ts
shared/config/feature-flags.ts
shared/mock/registry.ts
features/*/contract.ts
database migrations
app/layout.tsx
app/(app)/layout.tsx
```

规则：

1. 契约变更必须先改 `contract.ts`；
2. 契约变更必须同时改 fixture；
3. 消费方不能读取另一个模块的内部文件；
4. 共享 UI primitive 只放通用组件，不放业务逻辑；
5. 数据库 migration 必须一人写，另一人 review。

## 13. 单个功能的交付模板

每个功能都按同一流程交付：

1. 定义契约；
2. 写 mock fixture；
3. 写 mock service；
4. 写最小组件；
5. 接入页面；
6. 写服务函数测试；
7. 写真实 server service；
8. 写 API route；
9. 用 feature flag 切换 live；
10. 保留 mock 作为回归和演示模式。

### 13.1 例子：活动后跟进

第一步，定义 `TaskDTO` 和 `FollowupsService`。

第二步，写 mock tasks：

1. 活动后未打招呼；
2. 需要发送资料；
3. 适合预约会议。

第三步，页面显示这些任务。

第四步，真实实现接入 `tasks` 表。

第五步，消息生成从规则模板升级为 AI provider。

在整个过程中，Dashboard 和 Agent 只消费 `TaskDTO`，不关心它来自 mock、规则还是 AI。

## 14. UI 组合原则

MVP 首屏不是营销页，而是用户登录后的工作台。

推荐主要页面：

```text
/app
/app/profile
/app/events
/app/events/:id
/app/contacts
/app/contacts/:id
/app/followups
/app/chat
/app/dashboard
/app/agent
```

页面职责：

1. `/app` 展示今日建议、待跟进、近期活动、人脉变化；
2. `/app/profile` 管理用户画像；
3. `/app/events` 管理活动；
4. `/app/events/:id` 展示活动前、中、后流程；
5. `/app/contacts` 展示人脉库；
6. `/app/contacts/:id` 展示联系人和连接画像；
7. `/app/followups` 展示待办；
8. `/app/chat` 展示站内聊天或聊天摘要；
9. `/app/dashboard` 展示人脉资产分析；
10. `/app/agent` 展示所有 Agent 建议。

## 15. AI 设计

### 15.1 AI 不直接拥有业务真相

AI 输出只能是建议、草稿、摘要或待确认画像更新。

业务真相来自：

1. 用户手动输入；
2. 用户确认；
3. 明确来源的关系证据；
4. 系统可验证的结构化数据。

### 15.2 Provider 接口

```ts
export type AiProvider = {
  generateMessageDraft(input: MessageDraftInput): Promise<MessageDraftResult>;
  summarizeConversation(input: ConversationSummaryInput): Promise<ConversationSummaryResult>;
  recommendContacts(input: ContactRecommendationInput): Promise<ContactRecommendationResult>;
  extractBusinessCard(input: BusinessCardExtractionInput): Promise<BusinessCardExtractionResult>;
};
```

### 15.3 MVP AI 优先级

1. 打招呼消息生成；
2. 活动后交流摘要；
3. 跟进提醒理由；
4. 简单推荐理由；
5. 名片信息提取。

复杂人脉图谱、多层介绍路径、邮件深度分析不进入 MVP。

## 16. 权限与隐私设计

### 16.1 默认私有

所有联系人、连接画像、备注、聊天摘要和 Agent 建议默认只对 owner account 可见。

### 16.2 分阶段授权

MVP 只需要：

1. 登录；
2. 可选通知；
3. 可选名片扫描或图片上传。

联系人、日历、邮件权限放到后续版本。

### 16.3 高敏感动作确认

以下动作必须由用户确认：

1. 发送消息；
2. 添加联系人；
3. 更新重要画像标签；
4. 创建日历事件；
5. 向另一个人推荐用户；
6. 导入外部联系人。

## 17. 验收标准

### 17.1 框架验收

1. 不连接真实数据库时，mock 模式可以跑完整产品闭环；
2. 每个主要页面都有 loading、empty、error、success 状态；
3. 每个 feature 都有 contract、fixture、mock service；
4. mock 数据之间引用一致；
5. 页面组件不直接依赖数据库。

### 17.2 模块验收

1. Account 能提供当前用户；
2. Profile 能保存和读取用户画像；
3. Event 能提供活动上下文；
4. Contact 能保存人；
5. Connection 能保存关系画像；
6. RelationshipEvidence 能证明关系来源；
7. Recommendation 能给出理由；
8. Followup 能生成任务；
9. Chat 能沉淀摘要；
10. Dashboard 能从真实或 mock 数据聚合；
11. AgentAction 不自动执行敏感动作。

### 17.3 集成验收

1. 新用户完成 onboarding；
2. 用户创建或选择活动；
3. 系统推荐活动中值得认识的人；
4. 用户通过 mock 扫码或选择推荐对象建立连接；
5. 系统生成关系 evidence；
6. 活动后系统生成跟进任务和消息草稿；
7. 用户确认或完成跟进；
8. 人脉表盘出现新增人脉和待跟进变化；
9. Agent 列表展示下一步建议。

## 18. 开发节奏建议

### 18.1 第 1 轮：共同搭骨架

目标：

1. 初始化 Next.js；
2. 建立目录结构；
3. 建立 shared API envelope；
4. 建立 mock registry；
5. 建立 app shell；
6. 建立主要空页面。

这一轮两个人短时间共同完成，之后立即切分。

### 18.2 第 2 轮：并行写契约和 mock

开发者 A 完成：

1. account；
2. profile；
3. events；
4. contacts；
5. connections。

开发者 B 完成：

1. recommendations；
2. followups；
3. chat；
4. dashboard；
5. agent。

这一轮不接真实数据库。

### 18.3 第 3 轮：页面闭环

目标是用 mock 组件跑通 MVP。

这一轮只修契约，不急着接数据库。若发现跨模块字段不够，先更新 contract 和 fixture，再改页面。

### 18.4 第 4 轮：真实数据替换

按模块逐个替换真实服务。

优先替换：

1. account；
2. profile；
3. contacts；
4. connections；
5. relationship evidence。

智能模块可以继续使用 mock 或 rule-based，直到核心数据稳定。

### 18.5 第 5 轮：AI 和体验收口

目标：

1. 接入消息草稿生成；
2. 接入摘要生成；
3. 接入推荐理由生成；
4. 检查隐私确认机制；
5. 做完整手工验收。

## 19. 风险和应对

### 19.1 模块边界漂移

风险：两个人为了快速完成，会在页面里直接调用其他模块内部函数。

应对：

1. 只允许跨模块调用 contract 暴露的 service；
2. code review 检查 import 路径；
3. `features/a` 不允许 import `features/b/server-service`。

### 19.2 Mock 和真实实现不一致

风险：mock 页面能跑，真实 API 接不上。

应对：

1. mock fixture 必须使用同一 DTO；
2. API response 测试对齐 DTO；
3. 真实 service 必须通过同一 contract 测试；
4. 每个模块保留一组 contract test。

### 19.3 产品范围膨胀

风险：提前做复杂图谱、主办方后台、深度邮件读取。

应对：

1. MVP 只验证活动场景真实连接和活动后跟进；
2. 所有非 MVP 能力先做 mock entry 或 hidden flag；
3. 新能力必须说明它服务哪个 MVP 成功指标。

### 19.4 隐私动作过度自动化

风险：Agent 自动发送或自动更新敏感画像，伤害用户信任。

应对：

1. AgentAction 默认只是建议；
2. 外发和画像更新必须确认；
3. 记录 AI provenance；
4. 支持撤销或忽略建议。

## 20. 最终交付形态

MVP 完成后，工程应具备以下能力：

1. 新用户能建立基础画像；
2. 用户能创建或导入活动；
3. 用户能在活动上下文中发现推荐对象；
4. 用户能通过扫码、推荐或手动方式建立人脉；
5. 每段人脉关系都有明确来源；
6. 用户能看到连接画像和下一步建议；
7. 系统能生成活动后跟进任务和消息草稿；
8. 用户能通过表盘看到人脉资产变化；
9. Agent 能给出建议，但不自动执行敏感动作；
10. 每个模块都可以在 mock 和 live 之间切换，支持两人持续并行开发。
