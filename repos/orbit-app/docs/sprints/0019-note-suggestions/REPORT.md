# Sprint 0019 — 执行总结

## 2026-09-15 真实共同环境补充验收

原 run-01 缺少的 SC-0019-04 已在同一套本地生产 Web/API、隔离 PostgreSQL、同一登录账号和原生 iOS Simulator 中补齐；这次只恢复外部验收，没有重开 Generator 或修改功能代码。SC-0019-04 当前为 `pass`，Sprint 仍为 `blocked`，剩余阻塞仅为 SC-0019-05 所要求的 R-00～R-14 全范围关闭。

- 原生 App 从版本 2 笔记进入 IORBIT 时预填“请根据这篇笔记整理一个待办，并明确标题和日期。”；导航阶段 Web API 的任务数仍为 0，证明没有自动写入。
- 用户在 App 显式发送后得到带来源笔记的建议，并在 App 点击“加入待办”。Web API 随后回读唯一任务 `task:fe3c19d33bb96e32f5bd343e`，其 `sourceNoteId` 为 `note:5a6524e05324e73d81b111b0`、`sourceNoteVersion` 为 2，并保留联系人和 `suggestionId`。
- 使用相同接受幂等键重放 accept 返回同一个 task ID，Web 任务总数仍为 1。原生任务详情显示“IORBIT 确认”和“查看来源笔记”，点击后返回相同版本 2 笔记。
- 另一篇正文含 `tomorrow` 的版本 2 笔记在原生 App 显示“需要确认日期”；Web 任务总数仍为 1，没有为含糊日期创建建议事项。
- 脱敏原始证据位于 `build/live-e2e-0019/`：`native-prefill.png`、`tasks-after-app-prefill.json`、`tasks-after-app-accept.json`、`task-accept-replay.json`、`native-date-confirmation.png` 和对应 accessibility JSON。实际会话运行记录完成；未写外部日历或通知。

原报告下方保留 run-01 当时 SC-0019-04 为 `blocked` 的历史事实；当前状态以上述补充为准。本次环境是本地生产 Web 进程与 iOS Simulator，不代表远程部署或实体设备发布验收。

## 目标实现情况

- 本轮实现了“从这篇笔记整理待办”链路：笔记页只携带当前笔记 ID／版本和可编辑模板进入 IORBIT，显式发送后才由服务端按 actor 读取笔记并生成建议，确认接受后才创建事项。
- 本地已验证来源版本、完整联系人集合、日期歧义确认、接受幂等、旧版本拒绝、失败保稿、笔记与事项互相返回，以及现有联系人／首页／任务／日历投影继续消费同一事项。
- run-01 结束时尚未完成真实共同环境验收；2026-09-15 09:21 JST 已按上方补充完成，SC-0019-04 当前为 pass。原 R-00～R-14 对应的多个前序 Sprint 仍为 running／blocked，因此 SC-0019-05 和 Sprint 结果仍为 blocked。未写外部日历／通知、未部署。

## 运行记录

- 目标／原需求：R-13 建议与 R-14 收口；笔记来源建议、明确接受、唯一事项和全部原需求核对。
- 结果：blocked；功能与真实跨端／原生 App 场景已验证，仍缺 R-00～R-14 全部关闭证据。
- run：run-01；Generator owner `/root`；开始 2026-09-15 07:45 JST，结束 2026-09-15 08:16 JST。
- Planner revision／SHA256：revision 2；`02281c85f0e8faf049e0edf1416ca84e146347b47d07f9226442bb69dd1e263a`。
- 基线 HEAD／承接的脏文件：`36bf8f5ca`；根 `AGENTS.md`、`CLAUDE.md` 为既有用户改动，本轮未写、未暂存、未提交。
- 被验收的最后功能 HEAD：`15685b18e8ba0b8b8c355306e27b7c72439b7469`。
- 环境／账号角色／设备（脱敏）：原 run 使用 Node 测试 actor 与 React Native Web 渲染器；补充验收使用生产构建的 live Web/API、隔离 PostgreSQL、同一 QA 登录账号和原生 iOS Simulator。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| actor 侧读取来源笔记、来源元数据、日期确认和建议生成 | `repos/orbits/features/orbit-ai/**`、`repos/orbits/app/api/ai/conversations/route.ts`、共享 AI 契约 | `15685b18e` | SC-0019-01、03 |
| 来源版本重验、接受幂等、唯一事项及联系人／来源投影 | `repos/orbits/features/tasks/**`、共享 tasks 契约 | `15685b18e` | SC-0019-02、03、04 本地部分 |
| 笔记模板入口、IORBIT 保稿／确认、笔记与事项互链 | `repos/orbit-app/src/screens/{notes,ai,tasks}/**`、`src/view-models/**`、同步契约 | `15685b18e` | SC-0019-01～04 本地部分 |
| HTTP、服务、严格解码与真实组件交互回归 | 两端对应 `tests/**` | `15685b18e` | SC-0019-01～03；SC-0019-04 仅本地投影 |

## 验收结果

| SC | pass / fail / blocked / not_run / not_applicable | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0019-01 | pass | App 笔记／IORBIT 组件交互；Web AI service/API 测试 | 导航、预填和刷新零写入；显式发送携带 `{id, version}`；建议保存来源和联系人；含糊相对日期进入 `needs_date_confirmation`，不创建建议或事项并保留输入。 |
| SC-0019-02 | pass | Web suggestion service/API 测试；App 确认交互 | 确认前零事项；同一 suggestion 重复接受返回同一 task ID；多人关联只创建一个事项。 |
| SC-0019-03 | pass | 旧版本、错误回执、失败和作用域变化测试 | 未接受建议在来源版本变化后返回冲突；已接受重试保持原事项；失败保留笔记和输入。 |
| SC-0019-04 | pass | 同一 live Web/API、隔离 PostgreSQL、同账号 Web/App 和原生 iOS Simulator；App 显式接受后 Web 回读，任务详情返回来源 | 唯一 task 保留 source note ID/version、suggestion ID 与联系人；重复接受不复制；日期含糊时零新增。 |
| SC-0019-05 | blocked | 两端类型、契约同步、App 全量及 Web 全量已运行；Sprint 登记表逐项核对 R-00～R-14 | 0003 仍 running，0004～0007、0009～0018 等必需前序仍有 blocked 项；Web 全量也保留 52 个既有环境／审计失败，不能宣布全部原需求完成。 |

## 最小验证与未运行项

| 命令／场景 | 版本／时间 | 退出码／结果 | 对应 SC／证据路径 |
| --- | --- | --- | --- |
| Web AI/task service、API、contract 定向测试 | `15685b18e` 前，2026-09-15 | exit 0；37 pass、0 fail；补充 suggestion/API 12/12 | SC-0019-01～03 |
| Web `npm run typecheck` | 功能提交前后 | exit 0 | Web API／共享契约边界 |
| App 受影响组件／view-model／source 定向集 | 同上 | exit 0；174/174、41/41、9/9 | SC-0019-01～04 本地部分 |
| App `npm run typecheck` 与契约同步检查 | 同上 | exit 0 | App 消费契约边界 |
| App `npm test` 最终重跑 | 同上 | exit 0；2590 pass、0 fail、0 skip | H/I 档 App 全量；`build/harness-logs/sprint-0019-app-full.log` |
| Web `npm test` | 同上 | exit 1；3008 pass、52 fail、183 skip | H/I 档 Web 全量；新增 0019 测试通过，失败数与 0018 基线相同；`build/harness-logs/sprint-0019-web-full.log` |
| `git diff --check` | 功能暂存内容 | exit 0 | 全部本地实现 |

首次 App 全量为 2589/2590，唯一失败是旧 source 测试只接受 `suggested` 状态；测试按新契约同时接受 `needs_date_confirmation` 后定向通过，日志保留为 `sprint-0019-app-full-initial.log`。第二次全量为 2569/2590，21 项来自同一浏览器 context 异常关闭；失败文件单独运行 28/28 通过，随后第三次同命令完整重跑 2590/2590，异常日志保留为 `sprint-0019-app-full-browser-crash.log`。没有把失败尝试隐藏或记成通过。

Web 全量的 52 项失败与 0018 数量相同，属于既有环境／产品审计范围；本 Sprint 新增的 notes/task suggestion 测试通过。GitNexus `detect_changes(scope: staged)` 已按规则执行，但固定主检出索引无法读取当前 worktree 暂存区并返回 0；提交前另用 staged 文件清单与 `git diff --cached --check` 核对 32 个功能文件，排除用户根文件。

原 run 未执行的同账号跨端读写、App 接受→Web 回读、真实 actor／版本冲突和原生 App 交互已由上方补充验收完成。当前必需但未执行的范围只剩 R-00～R-14 所有 blocked Sprint 的关闭证据。

## 交接

- 已验证成果／仍欠功能：功能 commit `15685b18e` 交付完整的笔记来源建议链路；SC-0019-04 已补齐，仍欠 SC-0019-05 的全范围关闭。
- 未提交改动、文件所有权及活进程句柄：报告生成时仅本轮 Sprint／Bridge 文档待提交；根 `AGENTS.md`、`CLAUDE.md` 属于用户；没有测试活进程。
- App／API 实际版本、另一端影响：两端同在 `15685b18e`，共享 task interaction、suggestion 和 task source 字段；旧消费者只见新增可选字段。
- 费用：原累计 `$0.012780 / $5`；补充验收执行两次 live agent 请求。测试进程未配置 OpenAI／Anthropic／Google provider key，run trace 未返回 token 或费用，未识别到可单独计费增量；账本仍记录 `$0.012780 / $5`。
- 已知风险／恢复或回退方式：已验证隔离 PostgreSQL、本地生产进程和 iOS Simulator，尚不证明远程部署或实体设备发布状态；可按功能 commit 定向 revert，不触发迁移或外部删除。
- 下一步／依赖恢复条件／需 Planner 处理的失败 SC：BR-010 双向验收已完成；逐项关闭 R-00～R-14 对应前序 Sprint 后重新核对 SC-0019-05。
