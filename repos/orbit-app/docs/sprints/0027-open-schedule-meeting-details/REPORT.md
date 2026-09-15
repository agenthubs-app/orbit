# Sprint 0027 — 执行总结

## 目标实现情况

对应 [GOAL.md](GOAL.md)，本轮已经让日历里的待办、活动、个人日程和会议分别进入真实详情页面。会议详情可以新增、修改或清空说明，保存失败和版本冲突会保留正在编辑的文字。

- appointment 产生的会议继续使用参会人共享说明；服务端校验 participant、expected version 和 idempotency key，同版本并发只有一次成功，说明更新不会改变会议状态、时间、提醒或外部日历。
- 运行时验收发现当前首页会议来自旧 `orbitScheduleItems`，并没有 appointment aggregate。为避免真实数据继续 404，本轮追加了 actor-scoped 私有会议说明兼容接口；页面明确显示“这是你的个人会议说明”，不把它冒充参会人共享内容。
- 当前登录态 iOS Simulator 已逐类打开待办、活动、个人日程和旧会议，并完成旧会议新增说明、保存、返回日历、重新打开回读和清空恢复。临时个人日程已在验收后删除。
- 没有远程部署。Web 全量仍有 22 项本 Sprint 之外的既有／环境失败；本轮新增与直接回归、两端类型、Web 生产构建和 iOS 构建均通过。

## 运行记录

- 目标／原需求：每条行程／日程可以打开，会议支持添加和编辑详情。
- 结果：`completed`。
- run：run-01；Generator owner：C 线任务 `01a0a041-c352-7022-98de-1783b8b1adb8`；2026-09-15 16:34–17:45 JST。
- Planner revision／SHA256：revision 1；`01635159a35495b325ed401aaff09a3224940578d321c8eec2ff4de542efba84`。
- 基线 HEAD／承接的脏文件：`5bfd59e96e555019a88749a2f2b461a7d2ac06a8`；根 `AGENTS.md`、`CLAUDE.md`、Web `next-env.d.ts` 和既有未跟踪设计／prototype／output／tmp 均未暂存。
- 被验收的最后功能 HEAD：`0cbc45ffa`；前置功能提交 `3ca1f5936`；Planner 提交 `01bcceeb5`。
- 原环境／账号角色／设备：本地 live Web/API `127.0.0.1:3000`；当前登录账号；iOS Simulator `9BF990F2-45B8-42CE-8543-E583B941DA17`；C Metro 8082。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| appointment 共享会议说明、participant 授权、CAS／幂等 route 与共享契约 | Web appointment service/handler/route、shared contract/schema、PostgreSQL 与 route/service tests | `3ca1f5936` | SC-0027-02～05 |
| 四类日程稳定目的地、会议详情读写、三语、草稿／冲突／错误回执保护 | App schedule/meeting route、screen、API、view-model、i18n 与 tests | `3ca1f5936` | SC-0027-01～05 |
| 当前旧会议兼容：私有说明 API、来源分流、真实标题和可见性提示 | Web schedule meeting details route/service；App endpoint/screen/view-model；直接 tests | `0cbc45ffa` | SC-0027-01、03、05 |

## 验收结果

| SC | 结果 | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0027-01 | pass | App 日程回归 90/90；Simulator 截图 `07-task-opened.png`、`08-event-opened.png`、`10-personal-opened.png`、`03-meeting-detail.png` | 四类条目均进入各自详情；会议不再回到日历或 404。 |
| SC-0027-02 | pass | Web GET projection、schema、App parser/view-model；Simulator `03-meeting-detail.png` | appointment 字段与旧记录空态通过；旧 schedule meeting 显示真实标题、时间、方式和私有可见性。 |
| SC-0027-03 | pass | Web 预约回归 25/25、PostgreSQL 1/1、App 交互；Simulator `04-meeting-edit.png`～`06-meeting-reopened.png` | 新增、精确回执、重开回读和显式清空通过；两种来源按共享／私有语义分开。 |
| SC-0027-04 | pass | participant/foreign actor、CAS、幂等、409／503／错误回执 tests | appointment 同版本并发只成功一次；重试不重复递增；App 保留草稿。 |
| SC-0027-05 | pass | contract `cmp`、两端 typecheck、Web build/health、iOS build、运行态清空恢复 | 说明写入未改变 appointment 投影；Web 新产物已运行；App 使用同一 API 验收。 |

## 最小验证与未运行项

| 命令／场景 | 版本／时间 | 退出码／结果 | 对应 SC／证据路径 |
| --- | --- | --- | --- |
| Web appointment／legacy meeting service、route、contract 回归 | `0cbc45ffa` 前工作树 | exit 0；25/25 | `build/harness-logs/sprint-0027-web-regression-final.log` |
| appointment PostgreSQL 共享、幂等、并发 | 同上 | exit 0；1/1 | `build/harness-logs/sprint-0027-web-details-postgres-final.log` |
| App 日程／会议／个人日程／route／endpoint 回归 | 同上 | exit 0；90/90 | `build/harness-logs/sprint-0027-app-schedule-regression-final.log` |
| App legacy meeting 页面交互 | 同上 | exit 0；4/4 | `build/harness-logs/sprint-0027-legacy-interaction-green.log` |
| App／Web typecheck | 同上 | 两端 exit 0 | `sprint-0027-app-typecheck-final.log`；`sprint-0027-web-typecheck-final.log` |
| shared contract/schema 精确同步 | 同上 | `cmp` exit 0 | `sprint-0027-contract-sync-exact-final.log` |
| Web 全量 | `3ca1f5936` 后 | exit 1；3193 pass、22 fail、166 skip | `sprint-0027-web-full.log`；失败为既有审计夹具、无 provider key／cloud OCR、trace seed 等范围，0027 新测试无失败。 |
| App 全量 | `3ca1f5936` 后 | exit 1；2808/2810 | `sprint-0027-app-full.log`；2 项均为新 route 审计清单遗漏，修复后 route audits 36/36，最终受影响组合 90/90；按 Sprint 规则未重复全量。 |
| Web 生产构建与 3000 health | `0cbc45ffa` 前工作树 | build exit 0；48/48 static pages；health `live/ok`；新 route 未登录为 401 | `sprint-0027-web-production-build-final.log`、`sprint-0027-web-production-server-final.log` |
| iOS Simulator build | 同上 | exit 0；`BUILD SUCCEEDED` | `sprint-0027-ios-xcodebuild-final.log` |
| 登录态 Simulator 四类打开、会议保存→重开→清空 | 同上 | pass | `build/harness-state/evidence/sprint-0027/run-01/native/` |

首次使用独立 DerivedData 的 iOS build 因本机空间不足失败；仅删除本轮生成的 1.7GB 临时目录后，复用现有 DerivedData 构建成功。依赖包仍有既有 Swift warning，本轮没有原生源码改动。

GitNexus 必需的 `detect_changes` 已在提交前调用，但当前根 checkout 未出现在 MCP 可用仓库列表；`orbits` 子索引对根级 staged diff 返回 0。该工具结果不作为低风险证据；本轮用 23 文件精确暂存清单、`git diff --cached --check`、直接回归、构建和 Simulator 证据核对提交范围。

## 交接

- 已验证成果／仍欠功能：0027 的五项 SC 均完成；远程部署和实体设备不在本 Sprint 授权范围。
- 分支／提交：独立分支 `codex/c-line-sprint-0027`；提交依次为 `01bcceeb5`、`3ca1f5936`、`0cbc45ffa`，未合并到 `chat-agent`。
- 未提交改动、文件所有权及活进程句柄：根 `AGENTS.md`／`CLAUDE.md`、Web `next-env.d.ts` 与全部既有未跟踪文件仍由原所有者处理；Web 3000 PID `69685`，C Metro 8082 PID `73813`；E Metro 8081 PID `2898` 未触碰。
- App／API 实际版本、另一端影响：App 和 Web 必须同时消费新增 `title`／`visibility` 字段；appointment route 为参会人共享，legacy schedule route 为 actor 私有。
- 费用：0 次 provider／OCR／外部 API 新调用，0 新费用；没有远程部署或外部日历写入。
- 已知风险／恢复方式：legacy 私有说明复用现有 live-record upsert；共享 appointment 路径保留数据库原子 CAS。需要回退时按提交逆序审阅 revert，不自动改用户数据。
- 下一步：由总控在审阅后合并上述独立分支；无需继续 0027 Generator。
