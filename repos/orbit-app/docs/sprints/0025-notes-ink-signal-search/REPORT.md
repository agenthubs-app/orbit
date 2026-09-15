# Sprint 0025 — 执行总结

## 目标实现情况

Sprint 0025 已按最新 `4a-*` 设计完成。笔记列表、新建、阅读、编辑、联系人搜索、`@` 提及和联系人详情“笔记”页签已接入真实 Web/API 数据；联系人不再被平铺，空查询不发请求，输入词后由服务端稳定分页返回有限候选。

Web/API 与 App 共用 `NoteContract` v2，保存标题、正文、手动联系人、提及、活动和 canonical 联系人集合；旧 v1 记录继续投影为可读标题，旧客户端省略新增字段时不会清空关系。最终以本地生产构建的 live Web/API、隔离 PostgreSQL、登录为 `qa@orbit.test` 的 Web 浏览器和原生 iOS Simulator 完成双向读写、搜索、编辑、版本冲突与 actor 隔离验收。

## 运行记录

- 结果：completed；SC-0025-01～05 全部 pass。
- run：run-01；Generator owner `/root`；开始 2026-09-15 10:05 JST，结束 2026-09-15 12:44 JST。
- Planner revision／SHA-256：revision 1；`b22dda257617049ae6e0a9bb045b9bebf2f1bb2cc17be41abce92a2461d007cc`；档位 H + I。
- 基线 HEAD：`e594f076e5b36e302043bc13026a14af98b4cada`；功能提交：`01a1592d9801702b37d874c7d7477b16f2e75472`。
- 既有用户内容：根 `AGENTS.md`、`CLAUDE.md` 和未跟踪 `docs/designs/2026-09-15-notes-contact-picker/` 未写、未暂存、未提交。
- 环境：Next.js 生产构建，`ORBIT_MODULE_MODE=live`，`http://127.0.0.1:31019`，隔离 PostgreSQL；App base URL 同为该地址；iOS Simulator `c0019-note-e2e`，bundle `app.agenthubs.orbit`。

## 改了什么

| 功能 | 实现与行为 | commit | SC |
| --- | --- | --- | --- |
| Note v2 与兼容读取 | 新增 title、manualContactIds、mentions、eventIds、canonical contactIds；v1→v2 投影、旧客户端 PATCH 保留、actor／mention range 校验 | `01a1592d9` | 01、03、05 |
| 搜索、筛选与游标 | actor 私有的正文／标题／人名搜索，联系人／活动／未关联筛选，opaque cursor；默认 20、最大 50 | `01a1592d9` | 01、02 |
| 有界联系人 provider | PostgreSQL 先 count 再读取单页稳定 ID；App 空查询零请求、250 ms debounce、AbortController 与 generation guard、稳定 ID 多选及翻页 | `01a1592d9` | 02 |
| 六个 4a 状态 | 列表、新建、联系人选择、`@` 候选、详情与联系人笔记页签；独立 `/notes/:id/edit`；大字号重排 | `01a1592d9` | 01、02、04 |
| 草稿与关联 | 草稿按 server／account／note 隔离；提及按 UTF-16 range 更新；活动、手动联系人和提及合并为一次 canonical 写入 | `01a1592d9` | 03 |
| 联系人笔记与 0019 回归 | 页签读取真实 `contactId` 筛选笔记、搜索分页、打开详情／带联系人新建；旧备注只读保留；IORBIT 仍只预填 | `01a1592d9` | 04 |

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-0025-01 | pass | Note service／route 覆盖 v1、搜索、四类筛选、actor 绑定游标与分页；App 列表展示真实标题、摘要、时间与关系数量。原生 390×844 和 `accessibility-extra-large` 截图确认搜索、筛选和行内容可读。 |
| SC-0025-02 | pass | 10,000 联系人 provider 测试证明只读请求页；空查询零请求；一字、连续改词、迟到响应、同名、稳定 ID、多选和下一页组件交互通过。原生搜索只显示 20 条候选。 |
| SC-0025-03 | pass | v2 create／PATCH、旧字段省略、幂等、409、404、mention range、canonical 集合和作用域草稿通过。原生 App 删除手动联系人后，Web 回读版本 2 仍保留提及联系人和活动。 |
| SC-0025-04 | pass | 阅读／编辑分路由；详情关联活动、来源待办与 IORBIT 入口；联系人笔记页签真实读取 4 篇关联笔记并可搜索、新建、打开详情。大字号、VoiceOver 标签、保存失败和返回行为均有自动化或原生证据。 |
| SC-0025-05 | pass | 最终 Web 生产 build 5 后停止旧进程并重启，health 为 `live/ok`；浏览器档案显示 `Orbit QA / qa@orbit.test`，Web 联系人页与 App 均读取“佐藤健一”。Web→App、App→Web、App 编辑→Web、跨 actor 404、stale 409 和幂等重放均通过。最终 iOS 当前源码构建 0 error／0 warning 并重新安装启动。 |

## 自动化与构建

| 检查 | 结果 | 日志／说明 |
| --- | --- | --- |
| Web 定向 | 45/45，exit 0 | `build/harness-logs/sprint-0025-web-targeted-final.log` |
| Web typecheck | exit 0 | `build/harness-logs/sprint-0025-web-typecheck-final.log` |
| Web 全量 | 3016 pass／53 fail／183 skip，exit 1 | `sprint-0025-web-full.log`；唯一新增失败是 live provider 的目录守卫，已修复并由 guard＋分页 19/19 复验；剩余 52 与 0019 基线相同，来自未配置数据库／业务卡／Gemini／活动注册等既有环境项。未把本次全量命令记为通过。 |
| Web 最终生产构建 | build 5 exit 0 | `sprint-0025-web-live-build-5.log`；之后启动 `next start` 并保存 `health-after-restart-5.json`。 |
| App 契约同步 | exit 0 | `sprint-0025-app-contract-sync.log` |
| App 定向 | 65/65，exit 0 | `sprint-0025-app-targeted-large-text-final.log` |
| App typecheck | exit 0 | `sprint-0025-app-typecheck-large-text-final.log` |
| App 全量 | 2598/2598，0 fail／0 skip，exit 0 | `sprint-0025-app-full-final.log` |
| iOS 当前源码构建 | 0 error／0 warning，安装并启动 | `sprint-0025-app-ios-run-final.log`。前两次曾因磁盘满失败，清理可再生缓存后最终成功；失败日志保留。 |
| Git | `diff --check` exit 0；GitNexus staged 固定索引返回 0，all scope 返回 low | 另以 48 文件 staged 清单和 cached diff 核对提交范围。 |

## 真实跨端证据

- Web 创建 `note:53ab6344ccab90377467a888` 版本 1：标题“Sprint 0025 跨端笔记”，提及联系人 `contact_001`，手动联系人 `contact_003`，活动 `event_signup_03`。原生 App 回读相同标题、正文、两位联系人和活动。
- 原生 App 创建 `note:ba1eaa2bf19e31afda3cfa4c` 版本 1，Web 回读相同标题、正文、联系人和活动。
- 原生 App 编辑第一篇笔记，追加 `App confirmed.` 并移除手动联系人。Web 回读版本 2：manualContactIds 为空，mention 与 `contact_001` 保留，活动保留；随后用 expectedVersion 1 更新返回 409／`CONFLICT`。
- 同一创建幂等键重放返回相同 note ID；第二个登录 actor 读取得到 404。最终 Web 重启后版本 2 仍可读取。
- 浏览器证据：`browser-profile-same-account.{png,json}`、`browser-contacts-same-database.{png,json}`。原生证据：`native-notes-list.png`、`native-contact-picker-empty.png`、`native-contact-picker-results.png`、`native-mention-suggestions.png`、`native-web-created-note.png`、`native-web-note-edit-after-save.png`、`native-contact-notes-tab-scrolled.png`、`native-notes-large-text-final.png`、`native-final-rebuild.png`。脱敏 JSON 与 HTTP 回执位于 `build/live-e2e-0025/`。

## 边界与回退

- 本次验证是本地生产 Web/API、隔离数据库和 iOS Simulator，不代表远程部署或实体设备发布；没有访问生产数据库，也没有写外部日历、消息或通知。
- Web 目前没有独立 `/app/notes` 页面；浏览器用于确认同一登录账号和联系人数据库，笔记的 Web 侧创建／读取／更新通过同一生产 Web 的 HTTP API 完成。
- 所有功能变更集中在 `01a1592d9`，可定向 revert；没有数据库迁移。旧 note v1 与旧联系人备注保持兼容读取。

## 交接

- NoteContract／storage schemaVersion 为 2；Contacts list 新增 `total`／`nextCursor`。App 同步副本已验证逐字一致。
- 联系人搜索必须保持服务端分页；不得恢复空查询 A–Z 全量列表，也不得在 App 或 route 先读取全集再 `.slice()`。
- live Web 进程和 Metro 在报告生成时仍运行；构建／验收产物在 `build/`，不进入功能提交。
- BR-019 已登记为 verified；本 Sprint 无剩余实现项。
