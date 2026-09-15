# Sprint 0026 — 执行总结

## 目标实现情况

Sprint 0026 已完成。App 不再把 Auth.js raw `userId` 当作业务 owner；登录和恢复会话通过既有 `GET /api/account/me` 取得 canonical `account.id`，并同时保留原始 `auth.user.id`。待办、个人日程、笔记及相关快照、草稿、AI intent、人脉、消息和邀请均使用 canonical `auth.actorId`。

账号接口失败、未登录、缺字段或空 ID 时 Provider fail closed，不回退 raw ID，也不从第一条业务记录猜 owner。外部 owner 继续被拒绝。活动会话、名片导入 session scope、认证和密码重置仍按明确的认证主体语义使用 raw ID，逐项理由记录在[身份审计](IDENTITY_AUDIT.md)。

## 运行记录

- 结果：completed；SC-0026-01～05 全部 pass。
- run：run-01；Generator owner：C 线 `/root`；2026-09-15 15:20～16:17 JST。
- Planner revision／SHA-256：revision 1；`716e6886b4df3295480860e07cdf81e94d1fcfda8b6de9202d5c5bbe4f159bb1`；档位 H + I。
- 基线 HEAD：`34f95a20a1953b824444b61a5d691d95a070f165`；规划提交 `577eadea5`；功能提交 `f5f595df4`；邀请 scope 补漏 `3385369dd`。
- 既有用户内容：根 `AGENTS.md`、`CLAUDE.md`、`.gitnexus`、设计图片、prototype、`output/` 与 `tmp/` 未纳入功能或报告提交。
- 环境：当前 live Web/API `http://127.0.0.1:3000`；iOS Simulator `9BF990F2-45B8-42CE-8543-E583B941DA17`；C 线 Metro 端口 8082。

## 改了什么

| 功能 | 实现与行为 | commit | SC |
| --- | --- | --- | --- |
| canonical 身份解析 | 新增严格 parser；只有 signed-in 且非空的 `account.id` 可成为 accountId／actorId | `f5f595df4` | 01、05 |
| 登录与恢复 | raw user 校验通过后再读 `/api/account/me`；身份失败不接受／不恢复会话；换 raw user 或 account 时清快照与通知 scope | `f5f595df4` | 01、05 |
| 待办 owner | 列表、详情、日期写入与关系工具改用 canonical actor；详情同时严格核对 `accountId`／`ownerUserId` | `f5f595df4` | 02 |
| 日程与笔记 owner | 个人日程读写、笔记列表／详情／新建／编辑／草稿／建议使用 canonical actor | `f5f595df4` | 03、04 |
| 配对消费者 | 快照、语言、首页、联系人需求、AI prefill／send intent、收件箱、聊天等 producer／consumer 使用同一 canonical scope | `f5f595df4` | 05 |
| 邀请审计补漏 | 关系邀请服务以 `actor.accountId` 为参与账号；邀请接受页 scope 改用 canonical actor | `3385369dd` | 05 |

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-0026-01 | pass | parser／Provider 覆盖 raw ID 与 account ID 不同、相同、失败、未登录、缺字段和空值；恢复完成前不开放 authenticated UI。 |
| SC-0026-02 | pass | task owner view-model、详情、日期和统一列表测试覆盖合法 canonical owner 与 foreign owner；Simulator 读取 54 条未完成待办并能打开列表。 |
| SC-0026-03 | pass | personal schedule 列表／详情／写回组合通过；Simulator 当日读取 3 条日程，日历和首页均显示真实条目。 |
| SC-0026-04 | pass | notes view-model、列表、详情、编辑、草稿、建议、联系人搜索／提及组合 33/33；Simulator 打开笔记工作区。当前 localhost 账号该集合为 0 条，这是成功空集合，不是授权失败。 |
| SC-0026-05 | pass | raw 消费者审计完成；App typecheck、契约同步和最终全量 2804/2804；Web health live/ok；iOS 当前源码构建与登录恢复三链通过。 |

## 自动化与构建

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| canonical identity／Provider | 10/10，exit 0 | raw/canonical 分离、登录／恢复失败关闭。 |
| notes 定向 | 33/33，exit 0 | 列表、详情、编辑、草稿、建议、搜索、提及与联系人笔记。 |
| 任务、日程与 snapshot | 任务详情 23/23、日期＋日程 39/39、统一任务 16/16、snapshot 7/7 | canonical owner、foreign owner、写回与 scope 隔离。 |
| 受影响页面组合 | locale/app-wide/home 106/106；AI 327/327；contacts/inbox/chat 200/200；workspaces/tasks/badge 101/101 | 为共享 actor cache 的直接消费者补齐 canonical fixture。 |
| 邀请补漏组合 | 21/21，exit 0 | 邀请、聊天投递、聊天列表与收件箱。 |
| App typecheck／contract sync | exit 0／exit 0 | `tsc --noEmit`；同步 21 个 contract、8 个 schema、2 个 domain 文件，无产品 diff。 |
| App 最终全量 | 2804/2804，exit 0 | `build/harness-logs/sprint-0026-app-full-final.log`；dot reporter，每个点对应一个通过测试。 |
| iOS 当前源码构建 | Build Succeeded；0 error／0 warning | `build/harness-logs/sprint-0026-ios-build.log`；安装后恢复到 C 线 8082 bundle。Expo 安装曾临时生成指向默认 8081 的打开动作，但未启动、停止或修改 8081 进程。 |
| Web runtime | `/api/health` HTTP 200、`live/ok`；匿名 `/api/account/me` HTTP 401 | 本 Sprint 无 Web 源码变化，按 Planner 不重建／重启服务。登录态 App 能通过 account/me 才会开放三条受保护业务链。 |
| GitNexus | `useApiResource` CRITICAL；功能 staged HIGH；邀请组件 UNKNOWN／staged 0 | 共享 cache 影响 51 个符号和 9 条流程，完整回归已覆盖。邀请组件在陈旧索引中未找到，使用精确源码断言和相关组合测试补证。 |

首轮完整测试在功能实现后发现四类旧夹具仍只提供 raw user 或硬编码旧源码形状：snapshot、relationship chat source、event registration、notification races。它们按新身份契约修正后，主协调任务完整 App 测试 exit 0；邀请审计补漏后又运行本报告记录的 2804/2804。没有把中间失败写成最终通过。

## 原生与运行态证据

- `native/tasks.png`：登录态读取全部／人脉筛选和 54 条未完成待办。
- `native/launch.png`：日历读取 3 条当日日程及真实时间块。
- `native/notes.png`：笔记工作区以成功空集合打开，没有跳回登录或 owner 错误。
- `native/final-build-8082.png`：当前源码重建后回到 C 线 8082，首页同时读取 1 条当前日程和 12 条今日待办。
- 截图位于 `build/harness-state/evidence/sprint-0026/run-01/native/`，运行日志位于 `build/harness-logs/`，不进入 Git 功能提交。

## 边界与回退

- 本次验证使用本地 live Web/API 和 iOS Simulator，不表示远程部署、生产 OAuth 或实体设备发布；没有写生产数据库或外部系统。
- `/api/account/me` 是唯一 canonical identity 来源。下游不得用 `auth.user.id` fallback，也不得从 task、schedule、note、contact 或 batch 的首条记录推断当前账号。
- 主功能可定向 revert `f5f595df4`，邀请 scope 可定向 revert `3385369dd`；两者均无数据库迁移和 Web 契约变化。
- Bridge 交接为 [BR-020](../../../../../bridge/2026-09-15-canonical-app-identity.md)；本 Sprint 无剩余实现项。
