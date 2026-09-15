# Orbit 数据流与 AI 可见性审查

审查日期：2026-09-15（Asia/Tokyo）

代码基线：`f5f595df44`（C 线 canonical account identity 修复已提交）

范围：`repos/orbits` Web/API、`repos/orbit-app` iOS/Expo App、外部 provider、Orbit AI 工具边界与本机缓存。

交互版（仅本人）：https://orbit-data-atlas-20260915.agenthubs-app.chatgpt.site

## 结论

Orbit 已经形成清晰的主链：App 页面 → view-model/hook → `OrbitApiClient` → Web API → feature service → repository/provider → Postgres。App 业务代码没有直接连接数据库，也没有绕过客户端直接调用第三方 provider。跨端成功/失败 envelope、共享 contract 副本和 schema 副本都有同步测试。

但“数据源唯一性”尚未完全收口：

1. 日程存在 `personal_schedule_items` 与 `orbitScheduleItems` 两套记录族；前者由 `/api/schedule-items` 与个人日程服务维护，后者仍由事件/Agent action writer 读写。
2. 推送设备存在 AsyncStorage 的 `orbit.notifications.device-id.v1` 与 SecureStore 的 `orbit.pushDeviceId` 两个本机身份，同时存在 `/api/devices/push-token` 与 `/api/devices/push-tokens/:id` 两套注册/撤销接口。
3. Web live storage 同时包含通用 `orbit_records` JSONB 模型和事件、预约、名片导入等专用关系表。它们各自有合理用途，但缺少一份可执行的“权威源/投影/迁移状态”登记表。
4. AI 不是“登录后能看到全部数据”。它只能看到自动附带的会话上下文、记忆和反馈结果，以及 5 个显式只读工具返回的裁剪结果。笔记、完整任务、个人日程、完整关系收件箱、通知/权限/设置、附件原文与运维审计等没有只读工具。

## 数据原型

| 领域 | 主要原型 | 主存储形态 | App 入口 | AI 当前可见性 |
| --- | --- | --- | --- | --- |
| 账户与认证 | Account、Auth User、Session、Language Preference | `orbit_records` + HttpOnly/原生安全会话 | `/api/account/*`、`/api/auth/*` | 仅服务器注入 actor 身份；认证秘密不可见 |
| 本人资料 | Profile、Industry、Offering、Seeking、Topic | `orbit_records: profiles` | `/api/profile` | `profile.getSelf` 可见裁剪后的本人资料 |
| 联系人与关系 | Contact、Contact Draft、Connection、Evidence、Need、Introduction | `orbit_records` 多 collection | `/api/contacts*`、`/api/connections*` | `contacts.recommend` 可见最多 3 个综合结果；非任意联系人查询 |
| 对话 | Conversation、Message、Privacy Setting、Draft | `orbit_records` | `/api/chat/*`、`/api/message-drafts` | `chat.context` 可见匹配关系的上下文；不是全局消息导出 |
| 任务与跟进 | Task、Task Suggestion、Follow-up Candidate、Reminder | `orbit_records` | `/api/tasks*`、`/api/reminders` | `followups.reviewQueue` 可见跟进子集；没有通用任务读取 |
| 日程 | Personal Schedule Item、Orbit Schedule Item、Appointment | `orbit_records` 两个 collection + appointment 专用表 | `/api/schedule-items` | 无通用日程读取工具 |
| 活动 | Event、Registration、Participant、Experience、Admission、Operations | `orbit_records` + event 专用版本/运营表 | `/api/events*` | `events.recommend` 可见活动推荐摘要；管理/报名/签到明细不可见 |
| 笔记 | Note、Mention、Contact/Event Association、Local Draft | `orbit_records: notes`；草稿在 AsyncStorage | `/api/notes` | 无读取工具；`events.saveMeetingNote` 只是需确认的写动作 |
| 通知 | Notification、Reminder Plan、Push Device、Delivery | `orbit_records` + iOS local notifications | `/api/notifications*`、`/api/devices/*` | 无读取工具 |
| 外部集成 | OAuth Authorization、Token、Health、Calendar Event、Relationship Signal | 加密 token vault + `orbit_records` 元数据 | Web integration API；App 仅通过 Orbit API | 无直接 provider 工具；只可能通过联系人/事件派生结果间接出现 |
| 名片采集 | Raw Upload、Derivative Image、OCR Item、Batch、Contact Draft | 专用 `bc_ingest_*` 表 + 文件/对象存储 + 最终 `orbit_records` | `/api/contact-drafts/business-card/*` | 原图、OCR 原始结果与批次状态不可见 |
| Agent 治理 | Memory、Feedback、Action、Ledger、Signal、Automation、Audit | `orbit_records` | `/api/agent/*` | memory/feedback 自动进入模型上下文；ledger/audit/setting 无读取工具 |

静态盘点得到 62 个 `orbit_records.collection_name` 标识、65 个具体 SQL 表名（另有 1 个动态表名前缀占位）和 261 个 Web API route handler。数量本身不是缺陷，但说明必须显式管理权威源与投影关系。

## 存储形式

### 服务端

- 通用 live store：Postgres `orbit_records`。复合主键为 `workspace_id + collection_name + record_id`，公共元数据包含 `user_id`、来源、provider、evidence、target、生命周期、搜索文本；领域 payload 放在 JSONB。
- 专用关系表：事件运营/报名/体验、预约、名片导入、关系生命周期 command receipt、事件分析等。用于事务、版本、outbox、审计、状态机和高约束流程。
- mock/hybrid/live：feature factory 决定实现。API 与页面依赖 contract，不应直接依赖 mock 或数据库。
- 外部 token：经 integration token vault 保存；外部邮件只读取 metadata policy，`ExternalRelationshipSignal.messageBodyPersisted` 固定为 `false`。

### App 本机

- SecureStore：原生登录 cookie、部分推送 opt-in/device identity。
- AsyncStorage：API base URL、笔记编辑草稿、另一套通知 device identity。
- SQLite `api_snapshots`：按 `server + actor/account + path` 缓存成功 GET；它是展示快照，不是业务数据库，也没有离线写队列。
- Expo Notifications：本机调度的 reminder 通知。

## 外部数据到 App

```text
Google Calendar / Gmail / Microsoft Graph / 名片图片
                    │ OAuth / upload / provider API
                    ▼
          Web integration / ingestion service
                    │ 标准化、actor/workspace scope、provenance
                    ▼
       repository/provider → Postgres / object storage
                    │ feature contract + ApiEnvelope
                    ▼
              Web API route handlers
                    │ HTTPS + authenticated session
                    ▼
        OrbitApiClient → hook/view-model → App screen
                    │
                    └── successful GET snapshot (local SQLite)
```

统一点：App 业务页面经 `OrbitApiClient` 调用；裸 `fetch` 只出现在客户端包装器内部，用于注入取消逻辑。共享 contract 和 API schema 在 App 中以构建期副本存在，并由逐字同步测试保护。

未统一点：后端部分同一概念仍有双 collection/双 endpoint；App 侧存在少量独立 contract 文件，未全部进入 shared contract 真源；261 条路由中也存在历史 envelope 写法，需用消费端 shape gate 持续检测。

## AI 实际能看到什么

### 自动进入 provider 的内容

- 当前用户消息。
- 最近 8 条会话 history（runtime 组装阶段先保留最近 6 条为内部消息，再由 provider 输入上限裁剪）。
- 当前 actor 的 memory，最多 20 条。
- 当前 actor 的 recorded outcomes/feedback 摘要，最多 12 条。
- 工具 continuation 时最多 12 个工具摘要。

### 显式只读工具

| 工具 | 数据域 | 给模型的主要内容 | 关键限制 |
| --- | --- | --- | --- |
| `profile.getSelf` | 本人资料 | display name、organization、role、bio、offering、seeking、topics、行业、更新时间 | actor 由服务器注入；不能传 userId/profileId/fields；仅本轮 WeakMap 快照 |
| `contacts.recommend` | 联系人/关系 | 最多 3 个结果的姓名、角色、关系路径、匹配理由、正文摘要 | 推荐查询，不是任意联系人枚举；外联仍需确认 |
| `events.recommend` | 活动 | 最多 3 个活动的名称、地点、开始时间、理由、简介 | 推荐摘要，不含完整活动运营/报名数据库 |
| `followups.reviewQueue` | 跟进任务 | 最多 3 个候选的标题、联系人、截止时间、理由、建议动作 | 读取任务/关系派生的跟进子集，不是完整任务查询 |
| `chat.context` | 关系对话 | 匹配会话的关系摘要、最多 5 条源消息构成的展示项，再裁剪为最多 3 个 synthesis 项 | actor/contact/conversation 范围；不是全局聊天搜索 |

工具全部标为 read；runtime 会拒绝 write/external 工具直接执行。工具观测审计裁剪为 artifact/status/evidence 等，`messageBody`、`rawEmail`、`privateMemo`、`audio` 在审计策略中标记为 redact。需写数据或产生外部副作用时，Agent 只能提出 Action Proposal，进入确认边界。

### 当前没有 AI 读取方法的数据

- 笔记正文、提及与笔记关联图。
- 完整任务清单、任意任务详情与任务建议清单（跟进工具只覆盖子集）。
- 个人日程/Orbit Schedule/appointment 的通用查询与详情。
- 完整关系收件箱、通知、提醒计划与 delivery 状态。
- 权限状态、语言/Agent 设置、push device、provider authorization/health。
- 名片原图、OCR 原始输出、导入批次内部状态、附件字节。
- 活动 organizer/admin、admission、check-in、export、运营审计与修复数据。
- Agent ledger、provenance audit、运行日志等治理记录。

这不是认证失效，而是当前能力 allowlist 的有意结果。问题在于产品没有一张“用户数据域 × AI 可读字段 × 使用目的 × 保留/审计策略”的显式矩阵，因此用户容易把“已登录”误解为“AI 能理解 App 中的一切”。

## 已确认问题与优先级

| 优先级 | 问题 | 风险 | 建议 |
| --- | --- | --- | --- |
| P0 | 日程双权威源 | UI、Agent action 与 Today 可能读到不同集合 | 选 `personal_schedule_items` 为 canonical；迁移/投影旧 `orbitScheduleItems`；加入双写禁令与 parity test |
| P0 | 推送设备双身份/双 API | 注册、撤销、登出清理可能操作不同 device row | 统一 SecureStore device ID 与 `/push-tokens/:id`；提供一次性迁移和旧端点兼容窗口 |
| P1 | AI 数据可见性没有产品级合同 | 用户预期与实际能力不一致；未来加工具可能过度暴露 | 建立字段级 allowlist、purpose、redaction、retention 与 audit matrix；UI 显示“本回答使用了哪些数据” |
| P1 | Notes/Tasks/Schedule 是 AI 盲区 | AI 无法回答 App 核心个人工作流问题 | 分别增加 `notes.search`、`tasks.query`、`schedule.query` 只读工具；默认最小字段、数量上限、actor scope |
| P1 | 通用 JSONB 与专用表缺权威源登记 | 新功能容易从错误存储读取或重复写入 | 建立 machine-readable data authority registry，并在 service factory/API 测试中校验 |
| P2 | App contract 仍以文件副本同步 | 测试能阻止漂移，但维护成本高，部分局部 contract 不受同一真源约束 | 保留离线自包含构建，同时生成副本与覆盖清单，禁止手工维护重复类型 |

## 证据与边界

- AI allowlist：`repos/orbits/features/agent/capabilities/contract.ts`。
- AI 工具 schema、审计裁剪与 write/external 拒绝：`repos/orbits/features/orbit-ai/agent-tools/registry.ts`。
- 模型输入裁剪：`repos/orbits/features/orbit-ai/gemini-provider.ts`。
- actor memory/outcome 注入：`repos/orbits/app/api/ai/conversations/route.ts`。
- AI 本人资料字段：`repos/orbits/features/profile/self-profile-reader.ts`。
- App 网络客户端：`repos/orbit-app/src/api/client.ts`、`src/hooks/useApiResource.ts`。
- App 本机存储：`src/data/snapshot-store.ts`、`src/storage/note-draft-storage.ts`、`src/api/native-auth-session-storage.ts`、`src/notifications/*`。
- 主 live store：`repos/orbits/shared/storage/{live-record-store,postgres-live-record-store,migrations}.ts`。

审查基线不包含 D 线正在开发的 0028 未提交变更；0028 合并后应重跑 inventory 与 contract/route gates。当前结论不读取生产数据库内容、不导出用户数据、不调用外部 provider，也不包含任何 token 或凭证。
