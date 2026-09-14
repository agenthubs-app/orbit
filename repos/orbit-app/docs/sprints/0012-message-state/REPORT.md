# Sprint 0012 — 消息状态与前台更新执行总结

## 目标实现情况

本轮已完成消息列表、会话正文、未读角标和持久已读状态的真实接线。App 只消费 0008 发布的 `/api/relationship-communication/conversations/**` 会话，不再把草稿预览当成真实消息；服务端内容必须属于当前账号、保持 active、消息已投递且 ID、时间、参与方和未读数一致，否则整份读取失败关闭。

列表、详情和首页／IORBIT 角标在 App 聚焦且处于前台时每 15 秒更新。切账号、切服务器、失焦、后台或登出会取消旧请求；刷新保留已经显示的内容和未发送草稿。打开未读会话只向真实 read endpoint 提交最后消息 ID，收到完全匹配的服务端回执后才触发列表和角标重读。提醒 read／ignored 沿用既有精确回执和目标 allowlist，并在成功后立即使角标失效重读。

实现、类型检查、iOS JavaScript 打包、配置 PostgreSQL 的双账号持久化回读和 App 全量 2589/2589 均已通过。当前环境没有 Expo 登录、Expo project ID 或 `ORBIT_PUSH_TOKEN_KEY`，也没有可登录的授权双用户原生验收账号；因此真实持续前台到达、真实删除／越权目标和实体推送三项必需证据不能执行。本轮代码已经提交，但 Sprint 按规则以 blocked 结束，不能把受控浏览器和服务测试冒充实体／跨端验收。

## 运行记录

- 目标／原需求：R-11；消息及时更新，角标、已读和通知目标与真实服务端状态一致。
- 结果：blocked；实现已交付，SC-0012-02、03、05 的外部原生／账号／推送证据缺失。
- run：run-01；唯一 Generator `/root/e_line`；2026-09-15 00:36～01:39 JST。
- Planner revision：1 + 已批准消息状态契约；结束 SHA256 `5ee4a862134ff0e5c6807dc27da80571ad021b6a8f6f70599f7985409eaa5cd2`。
- 基线 HEAD：`d81368c58`；根 `AGENTS.md`、`CLAUDE.md` 的用户改动未接管。
- 被验收的最后功能 HEAD：`218fb3d4bc30ab0a45750f2e3a04592e133b1710`，已本地提交，未 push／merge／部署。
- 环境：App 受控浏览器运行时、iOS Hermes export、配置 PostgreSQL live store；Expo CLI 未登录，推送 project／server key 均缺失。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 当前 actor 的真实会话解码、重复／撤销／越权失败关闭、精确已读目标和进程内失效事件 | `src/api/message-state.ts` | `218fb3d4b` | 01～04 |
| 收件箱列表／详情 15 秒前台更新、已读回执、提醒成功后立即重读 | `src/screens/inbox/RelationshipInboxScreen.tsx` | `218fb3d4b` | 01～04 |
| 首页与 IORBIT 角标改读真实会话并与提醒合计，上限 99 | `src/hooks/useRelationshipInboxBadgeCount.ts` | `218fb3d4b` | 01、02、04 |
| 状态、轮询、草稿、生命周期、目标、通知注册和全局消费者回归 | `tests/message-state-interactions.test.tsx` 及 11 个相关测试文件 | `218fb3d4b` | 01～05 |

## 验收结果

| SC | 结果 | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0012-01 | pass | App 已读／提醒交互、badge 回归；0008 PostgreSQL live-store 重新执行 | 精确 read／ignored 回执才生效；两账号消息、重开回读与已读状态在真实存储中一致。 |
| SC-0012-02 | blocked | 15 秒 fake-clock、失效事件、断网／恢复、脏草稿测试均通过 | 实现和受控时序已验证；缺可登录授权双用户的原生持续前台收发、截图和实测到达时间。 |
| SC-0012-03 | blocked | 目标 allowlist、非法链接、HTTP／结构失败和导航交互均通过 | 代码只接受真实受支持目标并显示失败；缺同版本真实已删除／无权限对象的授权原生导航证据。 |
| SC-0012-04 | pass | inbox／badge 生命周期、账号／服务器／前后台切换、迟到 401／回执和 0008 撤销绑定回归 | 旧 scope 不能恢复正文、计数或动作；同账号草稿在普通刷新中保留。 |
| SC-0012-05 | blocked | notification registration、permission、opt-out、token 变化、登出／换号竞态回归通过 | 注册实现无需修改并通过自动化；缺 Expo project ID、Expo 登录和 `ORBIT_PUSH_TOKEN_KEY`，实体接收与服务端设备回读未运行。 |

## 最小验证与未运行项

| 命令／场景 | 版本／时间 | 退出码／结果 | 对应 SC／证据路径 |
| --- | --- | --- | --- |
| `npm run typecheck` | `218fb3d4b`，2026-09-15 | exit 0 | App 全量 TypeScript |
| 0012 与直接消费者／通知生命周期定向集 | `218fb3d4b` | 411/411 pass | SC-01～05 自动化行为 |
| App `npm test` | `218fb3d4b` | 2589/2589 pass，0 skip | `build/harness-logs/sprint-0012-app-full.log`（被忽略） |
| App 首次全量 | 提交前 | 2570 pass、19 fail | 失败均为旧端点／路由测试夹具；修正夹具并收紧重复会话拒绝后，当前完整全量通过。 |
| PostgreSQL `relationship-communication-live-store` | API `6d8173b78`，App `218fb3d4b` | 1/1 pass | 双账号持久化、重开、已读、撤销 |
| `npx expo export --platform ios` | `218fb3d4b` | exit 0；1776 modules，Hermes bundle 6 MB | 当前 iOS JavaScript 可打包 |
| Expo／推送配置核查 | 2026-09-15 | blocked | 环境变量无 project ID／server key，`npx expo whoami` 为 Not logged in；未调用实体推送。 |
| `git diff --check` | 提交前 | exit 0 | 14 个功能文件无空白错误 |
| GitNexus | 提交前／后 | 工具基线异常 | staged 错误返回空集；detached worktree compare 又把 512 个未改文件计为 CRITICAL。实际范围以 `git show 218fb3d4b` 的 14 文件、定向和全量回归为准，未将错误图结果写成低风险。 |

## 交接

- App `218fb3d4b` 消费 API `6d8173b78` 的列表、详情和 read endpoint；0012 没有修改 Web/API。Bridge 协调者应保持这两个版本配对，旧 `/api/chat/relationship-inbox` 只保留草稿预览用途。
- 功能实现没有剩余代码项。必需验收缺项是：授权双用户原生持续前台收发、真实删除／越权目标，以及配置 Expo project、服务端推送 key 后的实体注册／接收／解绑回读。
- 根 `AGENTS.md`、`CLAUDE.md` 仍为用户改动；功能提交未包含它们。测试日志和 export 位于被忽略的 build／临时目录，不进 Git。
- 本轮没有新增 AI、OCR 或 provider 调用，费用增量为 0；原累计预算不重置。
- 功能回退点为 `218fb3d4b` 的定向 revert。恢复缺失环境后应新建关联本报告 blocked SC 的验收 Sprint，不能改写或重开本次 run-01。
