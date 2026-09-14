# Sprint 0021 — 执行总结

## 目标实现情况

- Web／App 现在用同一份 `ai-sessions` protocol v2 契约保存会话起源。首次用户消息成功持久化时冻结入口、客户端、模板版本、引用、初始分组、稳定消息 ID 和实际发送文本；后续续聊、改名、移动分组和旧客户端快照都不能覆盖起源。
- 两端都能读取完整分页历史，创建／改名／删除分组，改名、置顶、移入／移出会话，并在删除前确认。App 长按和可访问“整理会话”入口使用同一操作面板；Web 在窗口重新获得焦点时刷新。
- 组织 mutation 使用独立 revision、mutationId 和 actor-scoped transaction。冲突返回 409，删除后的迟到保存返回 410；删除含 61 条会话的分组会在一个事务内保留并移出全部会话。
- 产品实现和本地／隔离 PostgreSQL 证据已完成。当前没有可用的同版本真实账号 Web／App 环境，也没有对当前源码构建的 iOS 交互证据，因此 SC-0021-02 的原生必需证据与 SC-0021-04 的真实双端往返仍 blocked。

## 运行记录

- 结果：blocked（功能已提交；真实同账号双端和当前 iOS 构建证据未完成）。
- run：run-01；Generator owner `/root`；2026-09-15 00:19 JST 开始。
- Planner revision／启动 SHA256：revision 1；`8cdec6ff046502d9363bc0cb2d5829c856d76aac2ce920a785db1d36283b7811`。
- 承接功能 HEAD：0005 的 `30c1e210c`。
- 被验收的最后功能 HEAD：`3de117902`。
- 功能提交：`c645d357a`、`cabf07b27`、`9f4396d1c`、`3de117902`。
- 环境：本地 Web／App Node 测试及一次临时隔离 PostgreSQL 数据库；未访问真实业务数据、未调用付费模型、未部署。

## 实现与提交

| 内容 | commit | 对应 SC |
| --- | --- | --- |
| protocol v2 起源契约、首次消息冻结起源、已有 App／Web 入口登记与契约同步 | `c645d357a` | 01、04、05 |
| groups API、session organization PATCH、CAS／幂等／tombstone 与事务存储 | `cabf07b27` | 02、03、04、05 |
| App／Web 分组和会话管理 UI、完整分页、刷新、组内新会话落组 | `9f4396d1c` | 01、02、03 |
| 补入 App API 客户端，并对齐全量回归中的三个真实界面夹具 | `3de117902` | 02、03、05 |

## 验收结果

| SC | 结果 | 证据与限制 |
| --- | --- | --- |
| SC-0021-01 | pass | Web origin、live store、handler 与页面测试覆盖首次保存、101 条以后、旧请求合并和已登记入口；App 入口隔离、首轮失败零模型调用及真实组件交互通过。0006／0019 的未来入口只发布兼容 ID，未冒充已经接线。 |
| SC-0021-02 | blocked | App 创建／改名／打开／移动／删组保留会话及失败分支在真实组件和 HTTP 夹具通过；内存 61 条删组和隔离 PostgreSQL 原子事务通过。当前源码未完成 iOS 长按、更多菜单和失败反馈实机操作。 |
| SC-0021-03 | pass | 两端改名、置顶、移动、确认删除、分页搜索、旧历史、当前会话删除和旧快照保护测试通过；App／Web 都读取全部分页而非只取 12 或 50 条。 |
| SC-0021-04 | blocked | 双 actor、旧协议、CAS 冲突、事务回滚、tombstone 与隔离 PostgreSQL 已测；没有同版本同账号 Web↔App 真实写读环境，不能用夹具代替。 |
| SC-0021-05 | pass | 整理操作无模型调用，未加入私密日志；越权对象统一不可访问，失败保留可读状态。H 档结果和缺项均在本报告记录。 |

## 验证证据

| 检查 | 结果 |
| --- | --- |
| Web 0021 定向集合 | 39 pass，0 fail |
| App 0021 定向集合 | 95 pass，0 fail |
| App 修复后补充回归 | 52 pass，0 fail；含两种主题下的真实抽屉交互 |
| Web／App `npm run typecheck` | 两端 exit 0 |
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

## 阻塞与解除条件

- 用同一已授权测试账号和同版本 Web/API、当前 App 构建完成：App 移组／置顶 → Web 刷新核对 → Web 改名／取消置顶 → App 重开核对；两端分别删除测试会话并确认旧 ID 不可复活。
- 在当前 iOS 构建上完成长按、可访问更多菜单、组选择、确认和故障反馈检查。
- 费用仍为 0 次新增真实模型调用；B 线累计 `$0.012780`，硬上限 `$5` 不重置。
