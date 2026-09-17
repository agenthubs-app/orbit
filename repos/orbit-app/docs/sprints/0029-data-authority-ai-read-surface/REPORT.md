# Sprint 0029 Report

状态：A–F 源码与可执行本地验证完成。真实账号、数据迁移 apply 与授权 calendar provider 证据因运行环境缺失保持外部阻塞。

来源：2026-09-15 数据流与 AI 可见性审查。实现分支：`codex/b-line-sprint-0029`。

## 交付版本

| Track | 版本 | 结果 |
| --- | --- | --- |
| A — authority registry | `c4a1beef2` | machine-readable registry 固定 canonical store、projection、owner key、API、AI policy 与迁移状态；生成架构视图。 |
| B — push device consolidation | `dd28ec473` | SecureStore device ID 与复数 push-token API 成为 canonical；旧 AsyncStorage ID 一次性迁移并走同一撤销链。 |
| C — schedule consolidation | `8c9e43015` | `personal_schedule_items` 成为唯一写入权威源；旧 `orbitScheduleItems` 只作分类迁移与兼容读取。 |
| D/E — AI visibility 与四个 query tools | `5fff469ab` | visibility manifest、四个 actor-scoped 只读工具、routing、artifact evidence 与 Web/App contract 已接通。 |
| F — cross-client verification | 本提交 | 本报告、BR-023 与本地验证证据；不把缺少环境的真实账号/provider/migration apply 写成通过。 |

## Track A — Authority registry

- `features/data-authority/registry.ts` 登记主要数据域，校验 canonical source 唯一、owner key 非空、projection 有来源、API 与 AI policy 明确。
- `docs/architecture/data-authority-registry.md` 由 registry 生成，避免人工维护第二份真源。
- characterization tests 为 3/3 通过。

## Track B — Push device consolidation

- App 只创建并持久化 SecureStore canonical device ID；旧 AsyncStorage ID 只读取一次，迁移完成后清理。
- 登录恢复、通知权限变化、opt-out、登出、账号切换、token rotation 与失败重试都进入同一个 push device session/client。
- Web 的旧 reminder/device 路径通过 adapter 调用 canonical push-device service；旧接口保留撤销兼容窗口，没有首次交付即删除。
- Web 定向 15/15、App 定向 42/42 通过，覆盖首次/重复升级、双 ID 清理、撤销和竞态。

## Track C — Schedule consolidation

- `personal_schedule_items` contract 与 authority service 成为 Today、个人日程、Event action、Agent executor 的统一写入/查询边界。
- legacy `orbitScheduleItems` 只用于兼容读取和 migration 分类；migration 将记录分为可迁移、冲突、孤儿与重复，不静默覆盖。
- dry-run CLI：`npm run schedule-authority:migrate -- --dry-run --actor-id <actor>`；没有 `--dry-run` 时拒绝执行，apply 仍需受影响行数审阅和独立 receipt/idempotency key。
- fixture 验证包含 canonical persistence、四表面 parity、actor 隔离、取消、幂等、版本冲突、全天与时区，以及四类 migration 分类；定向 22/22 通过。
- 当前 shell 未配置 `ORBIT_EVENT_DATABASE_URL`、`ORBIT_LIVE_DATABASE_URL` 或 `ORBIT_DATABASE_URL`。真实 dry-run 明确失败并提示配置数据库，因此未获得真实受影响行数，也没有越过 approval gate 执行 apply。

## Track D/E — AI visibility 与 query tools

Visibility manifest 共登记 13 个 source：原有 5 个读取工具、4 个新 query 工具，以及 provider 自动接收的 current message、history、memory、outcomes。每项都有 allowed fields、purpose、actor scope、max items、redaction、retention、audit 与 confirmation policy；未登记字段默认拒绝。

| 工具 | 读取范围 | 输出与安全边界 |
| --- | --- | --- |
| `notes.query` | actor 自己的笔记 | list/search 仅标题、有限摘要、关联与时间；get 正文上限 4000 字符，并要求实体 ID 来自当前用户消息或 actor-scoped 结果。 |
| `tasks.query` | canonical tasks 与兼容的已确认 direct tasks | 不混入 `taskSuggestions`；description 上限 1000 字符。 |
| `followups.query` | Relationship Connection 关联的已确认持久化跟进 | 只返回 evidence 摘要，不返回完整消息；使用 `data_query` artifact，与 `followup_queue` 分离。 |
| `schedule.query` | canonical personal schedule items | 支持时间、联系人、活动过滤；details 上限 1000 字符；缺少 meeting 字段时明确标识。 |

- 四个 schema 拒绝未知字段、`actorId`、`userId`、`accountId`、`profileId`、超出 10 的 limit 与不属于该域的过滤字段。
- actor identity 只由 server/runtime 注入；跨账号 fixture、secret fields、大输出、prompt injection 与伪造 query 授权均为 negative tests。
- planner routing 覆盖中文、英文、日文，并按最小数据域选择工具；不把 review queue 当持久事实。
- artifact 新增 `data_query` kind，分别记录 used/unread domains 与 evidence。完整业务文本被视为不可信数据，不进入系统指令或审计正文。
- Web 定向 109/109、App 受影响回归 134/134 通过；contract sync 后副本一致；两端 typecheck exit 0。

## Track F — 本地验证与外部边界

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| Web full test（显式清空 Gemini/DeepSeek/OpenAI key） | 3124/3368 通过，49 失败，195 跳过 | Sprint 0029 相关回归全绿；剩余失败为既有 runtime evidence、Event PostgreSQL、旧 contract export 与 password-reset 配置门槛。 |
| App full test | 2802/2803；唯一并发 UI 点击超时，失败文件隔离重跑 83/83 | Node test runner；不代替原生 UI E2E。 |
| Web typecheck | exit 0 | 当前源码全量。 |
| App typecheck | exit 0 | 当前源码全量。 |
| Web production build | exit 0；Next 16.2.9 production compile/type generation 成功 | 当前源码，模型 key 清空。 |
| Web 未登录 HTTP 边界 | 3/3 返回 401 JSON | `GET/POST /api/ai/conversations`、`GET /api/schedule-items`；证明没有绕过认证，不能代替真实账号查询。 |
| iOS Simulator | `xcodebuild` exit 0，Metro 1938 modules bundled；当前源码安装并启动，Orbit 登录页可见 | Xcode 26.6，独立 iPhone 17 Pro Max / iOS 26.4；[截图](assets/ios-simulator-login.png)。无真实账号，不外推账号切换、push lifecycle 或四域查询已通过。 |
| GitNexus detect changes | 相对 `01bcceeb5`：LOW，63 files、412 indexed symbols、0 affected execution flows；Track F staged：LOW，6 indexed files、18 sections、0 affected flows | 仅预期的 authority、push、schedule、AI query/contract 与证据文档范围。 |

当前环境没有数据库 URL、Auth.js secret 或可登录测试账号，也没有授权 calendar provider 连接。宿主存在 DeepSeek key，但它不是 calendar provider；本轮测试与构建均显式清空模型 key。因认证边界正确返回 401，不能绕过身份去制造“真实账号/provider 已验证”的证据。

固定最终 SHA `f5bded060` 已由 merge commit `6f5f141ed` 合并到 `chat-agent`。精确合并树新增测试 8/8、Web/App typecheck 和 Web production build 通过；旧 3000 进程已由当前主线产物替换，`GET /api/health` 返回 200、`live/ok`。该收口证明代码与本地运行时已集成，不代替下列真实环境验收。

未完成的外部验收只有：

1. 在审阅真实 dry-run 行数后，以 receipt/idempotency key 执行 schedule migration apply。
2. 用一个已授权 calendar 账号对齐 read-only schedule 数据。
3. 用真实登录账号在重启后的 Web 与当前 App bundle 查询 notes/tasks/followups/schedule，并核对同一 actor 的 artifact evidence。

这些依赖缺失不影响 A–E 的源码和本地回归结论；补齐环境后按 BR-023 的关闭条件追加证据，不需要重做 authority 设计。

## 回滚与兼容

- Schedule migration 默认只允许 dry-run；legacy reader 保留兼容窗口，所有新写入保持 canonical。
- 旧 push endpoint/device ID 只保留迁移与撤销能力；canonical 注册失败时不把旧状态冒充成功。
- 四个新 AI tool 可在 capability registry 独立关闭，不影响原有 5 个读取工具。
- 任一 owner/parity 校验失败时对应查询 fail closed，不回退到另一 actor 或 workspace-wide 私有记录。

## 2026-09-16 后续范围决定

用户决定本轮先不处理需要真实 OAuth 的 Calendar/Gmail/Microsoft Graph adapter。上文第 2 项保留为明确 TODO，不再作为当前 0029 补证动作；不得用 mock、live-store 元数据或 Orbit 登录 OAuth 冒充外部数据授权。当前只继续补两项：真实 schedule migration dry-run／审阅后 apply，以及同一真实 actor 在 Web 与 App 对 notes/tasks/followups/schedule 的双向回读和 artifact evidence。OAuth adapter 后续必须单独登记 Sprint，包含 provider 控制台配置、最小 read-only scope、token vault、撤权/刷新、隐私与真实 provider 健康检查。
