# Sprint 0021 — 执行总结

## 目标实现情况

- Web／App 现在用同一份 `ai-sessions` protocol v2 契约保存会话起源。首次用户消息成功持久化时冻结入口、客户端、模板版本、引用、初始分组、稳定消息 ID 和实际发送文本；后续续聊、改名、移动分组和旧客户端快照都不能覆盖起源。
- 两端都能读取完整分页历史，创建／改名／删除分组，改名、置顶、移入／移出会话，并在删除前确认。App 长按和可访问“整理会话”入口使用同一操作面板；Web 在窗口重新获得焦点时刷新。
- 组织 mutation 使用独立 revision、mutationId 和 actor-scoped transaction。冲突返回 409，删除后的迟到保存返回 410；删除含 61 条会话的分组会在一个事务内保留并移出全部会话。
- 产品实现、本地／隔离 PostgreSQL、当前源码 iOS Simulator 交互和同一合成账号 Web／App 往返证据均已完成。实测还发现并修复了原生 `Modal` 连续切换时整理器被历史弹窗遮挡、以及删除确认被整理器遮挡的问题；修复后长按、可访问更多菜单、分组、删除确认和真实 revision 冲突反馈均可见。

## 运行记录

- 结果：completed；SC-0021-01～05 全部通过。
- run：run-01；Generator owner `/root`；2026-09-15 00:19 JST 开始。
- Planner revision／启动 SHA256：revision 1；`8cdec6ff046502d9363bc0cb2d5829c856d76aac2ce920a785db1d36283b7811`。
- 承接功能 HEAD：0005 的 `30c1e210c`。
- 被验收的最后功能 HEAD：`9bc7039a5`。
- 功能提交：`c645d357a`、`cabf07b27`、`9f4396d1c`、`3de117902`、`9bc7039a5`。
- 环境：本地 Web/API `127.0.0.1:3000`、当前 App JS bundle、iOS 26.4 Simulator、一次临时隔离 PostgreSQL 数据库和一个全新合成账号；未访问真实业务数据、未调用付费模型、未部署。

## 实现与提交

| 内容 | commit | 对应 SC |
| --- | --- | --- |
| protocol v2 起源契约、首次消息冻结起源、已有 App／Web 入口登记与契约同步 | `c645d357a` | 01、04、05 |
| groups API、session organization PATCH、CAS／幂等／tombstone 与事务存储 | `cabf07b27` | 02、03、04、05 |
| App／Web 分组和会话管理 UI、完整分页、刷新、组内新会话落组 | `9f4396d1c` | 01、02、03 |
| 补入 App API 客户端，并对齐全量回归中的三个真实界面夹具 | `3de117902` | 02、03、05 |
| 原生历史弹窗→整理器、整理器→删除确认的顺序切换；Web 保留同步切换 | `9bc7039a5` | 02、03、05 |

## 验收结果

| SC | 结果 | 证据与限制 |
| --- | --- | --- |
| SC-0021-01 | pass | Web origin、live store、handler 与页面测试覆盖首次保存、101 条以后、旧请求合并和已登记入口；App 入口隔离、首轮失败零模型调用及真实组件交互通过。0006／0019 的未来入口只发布兼容 ID，未冒充已经接线。 |
| SC-0021-02 | pass | 当前 iOS Simulator 创建 `Native QA`、改名为 `Native QA Renamed`、打开分组并从组内开始新会话；对正式 API 保存的确定性会话完成长按和可访问更多入口、改名、置顶、移入／移出、删除确认及删组。另用同账号 API 先推进 revision，App 的陈旧 mutation 收到真实 409 并显示“当前状态已经变化，请刷新后再试。”。内存 61 条删组和隔离 PostgreSQL 原子事务继续通过。 |
| SC-0021-03 | pass | 两端改名、置顶、移动、确认删除、分页搜索、旧历史、当前会话删除和旧快照保护测试通过；App／Web 都读取全部分页而非只取 12 或 50 条。 |
| SC-0021-04 | pass | 同一全新合成账号在同版本本地 Web/API 与当前 App bundle 上完成真实往返：App 创建并改名分组，Web 刷新读到 `Native QA Renamed`；Web 改名为 `Web QA Roundtrip`，App 重新加载后读到；App 删除会话／分组后 Web 刷新确认消失。第二条确定性会话经正式 DELETE 后 v2 列表确认不存在。双 actor、旧协议、CAS、回滚、tombstone 与隔离 PostgreSQL测试继续通过。 |
| SC-0021-05 | pass | 整理操作无模型调用，未加入私密日志；越权对象统一不可访问，失败保留可读状态。H 档结果和缺项均在本报告记录。 |

## 验证证据

| 检查 | 结果 |
| --- | --- |
| Web 0021 定向集合 | 39 pass，0 fail |
| App 0021 定向集合 | 95 pass，0 fail |
| App 修复后补充回归 | 52 pass，0 fail；含两种主题下的真实抽屉交互 |
| Web／App `npm run typecheck` | 两端 exit 0 |
| App 原生弹窗修复 TDD | 第一次新增断言 71/72 RED；加入单一弹窗状态交接后目标用例及全文件 73/73 GREEN |
| App 修复后 `npm run typecheck` | exit 0 |
| 当前 iOS Simulator | 分组创建／改名／跨端回读、会话整理、长按、可访问更多、删除确认、409 可见反馈均通过；截图归档在 `build/harness-state/evidence/sprint-0021/run-01/native/` |
| 隔离 PostgreSQL organization 测试 | 临时数据库内 1 pass，并已清理；未配置 URL 的单独复跑按契约 skip，未把 skip 算作通过 |
| App 全量 | 2600 项中 2598 pass、2 fail；两项均为同一旧夹具未同步 `organization.customTitle`。修正后精确两项 2/2，通过；依规则使用受影响回归收口 |
| Web 全量 | exit 1；失败来自既有 runtime 文档证据和未配置 `ORBIT_EVENT_DATABASE_URL`／本地报名数据库。0021 定向集合通过，未宣称全量通过 |
| GitNexus | 每个产品符号编辑前均做 upstream impact，Task 3 为 LOW；索引绑定旧 checkout，提交前 staged detect 返回 0，另以实际 staged diff 和测试补审 |

## 契约与后续消费者

- 共享文件为 `repos/orbits/shared/contract/ai-sessions.ts` 与 `shared/api-schema/ai-sessions.ts`，App 副本只由 `npm run sync:contract` 生成；发送协议仍为 `protocolVersion: 2`。
- 起源 schema 为 version 1。0006 可使用 `contact.message_draft`、`contact.followup_draft`、`inbox.polish_draft`、`followup.task_candidate`，并传 `{ type: "contact", id }`；模板必须给出稳定 `id` 和正整数 `version`，实际用户发送前只预填。
- 字段存在不授予联系人读取权限。0006 必须在服务端验证当前 actor 可读取引用，并保留用户编辑后的首条实发内容；没有授权时拒绝，不回显对象是否存在。
- 0019 使用 `notes.task_suggestions` 和 note 引用；仍由 0019 实现笔记权限与确认创建流程。
- 组织变化通过页面 focus 或显式 refresh 获取，没有 WebSocket。消息 `messageRevision` 与组织 `organization.revision` 独立。

## 关闭说明

- 原阻塞项已于 2026-09-15 在同版本本地 Web/API、当前 App bundle 和同一全新合成账号上解除；截图、API 状态和测试日志仅包含合成记录。
- 两条确定性会话均通过正式会话 API 写入，消息明确标记未调用模型；验收后通过正式 DELETE 清理并确认列表不存在。组织能力本身不依赖真实模型输出，因此没有为了关闭本 Sprint 制造付费调用。
- 费用仍为 0 次新增真实模型调用；B 线累计 `$0.012780`，硬上限 `$5` 不重置。
