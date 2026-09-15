# 两端当前状态

## 2026-09-15 B 线 0029 数据权威与 AI 只读面

- Web/API 以 `c4a1beef2` 建立 machine-readable authority registry，`8c9e43015` 将日程新写入统一到 `personal_schedule_items`，`5fff469ab` 增加 visibility manifest 与 `notes.query`、`tasks.query`、`followups.query`、`schedule.query` 四个 actor-scoped 只读工具。
- App/Web 由 `dd28ec473` 把 push device identity 收口到 SecureStore ID 与复数 push-token API；App 同步 `data_query` artifact contract。旧 schedule/push 链只保留分类读取、迁移与撤销窗口。
- 本地定向、全量、两端 typecheck、Web production build 和独立 iPhone 17 Pro Max / iOS 26.4 安装启动证据见 [BR-021](2026-09-15-data-authority-ai-read-surface.md)。真实账号、数据库 migration apply 与授权 calendar provider 因环境缺失保持开放；本地结果不表示远程部署或生产验收。

## 2026-09-15 C 线 0026 canonical 身份增量

- App `f5f595df4` 在登录／恢复后从既有 `/api/account/me` 读取 canonical `account.id`，并把待办、个人日程、笔记、快照、草稿、AI intent、人脉与消息边界接到 `auth.actorId`；`3385369dd` 补齐关系邀请 scope。
- 身份接口失败、缺字段或空 ID 时 fail closed，不回退 Auth.js raw `userId`，foreign owner 继续被拒绝。活动会话、名片导入 session scope、认证和密码重置保留 raw subject，已逐项审计。
- App 类型检查和完整回归通过；当前 live Web health 为 `live/ok`；iOS 当前源码构建 0 error／0 warning，登录态 Simulator 在 8082 bundle 下读取待办、日程与笔记工作区。BR-020 现为 `verified`，详见 [交接](2026-09-15-canonical-app-identity.md)与 [Sprint 0026 报告](../repos/orbit-app/docs/sprints/0026-canonical-app-account-identity/REPORT.md)。

## 2026-09-15 B 线 0021 验收增量

- AI 会话组织功能在 `3de117902` 基础上由 `9bc7039a5` 修复原生连续 `Modal` 切换；历史→整理器与整理器→删除确认不再互相遮挡，Web 保留同步切换行为。
- 同一全新合成账号在运行中的本地 Web/API 与当前 App bundle 完成 App 创建／改名→Web 读取、Web 改名→App 重载读取、App 删除→Web 确认消失；当前 iOS Simulator 的长按、可访问更多、组选择、删除确认和真实 409 冲突反馈均可见。
- Web 0021 定向 39/39、App 定向 95/95、弹窗修复文件 73/73、两端 typecheck 和隔离 PostgreSQL 证据通过。两条确定性会话均经正式 API 写入并在验收后删除，未调用模型；0021 现为 completed，详见 [BR-003](handoffs.md#br-003--ai-会话)与 [Sprint 0021 报告](../repos/orbit-app/docs/sprints/0021-ai-session-organization/REPORT.md)。

## 2026-09-15 A 线 0014 增量

- App `9761b343d` 将人脉列表／详情／关系搜索／邀请、名片摄入／复核、活动发现／详情／报名接入 0013 的中／日／英账号语言环境；产品 chrome 与已知枚举本地化，姓名、公司、OCR 原文、活动内容、题目、答案和稳定 ID 保持 literal。
- 动态切换语言保留搜索／筛选、编辑草稿、来源选择和报名答案；默认中文返回标签、概览入口、窄屏、dark 与双倍字号兼容已复验。
- App 0014 目标组合 197/197，兼容失败修复复验 42/42，最终清空全部 provider key 的全量 2753/2753、typecheck 与 diff-check 通过。Web/API 本轮无产品变更；同步仍复用 BR-015 的刷新式账号语言偏好，不表示实体设备或共同远程环境已验收。详情见 [BR-016](handoffs.md#br-016--人脉名片与活动三语消费)与 [Sprint 0014 报告](../repos/orbit-app/docs/sprints/0014-locale-relationships-events/REPORT.md)。

## 2026-09-15 A 线 0013 增量

- Web/API `cc3930449` 新增 actor-scoped 账号语言偏好 GET/PUT、版本冲突、幂等回执和 SERIALIZABLE 事务保护；App `1bd99f737`、`9d5c13622` 建立中／日／英 Provider，并迁移账号、资料、首页、设置及其可达密码／权限页面。
- 设备 A 保存→独立设备 B 服务端 GET 回读、服务／路由／真实 PostgreSQL 13/13、App Provider 7/7、Profile 166/166、受影响组合 157/157、日期不变量 5/5 和原生 EN/JA 大字号通过。
- 业务原文和用户输入保持 literal；设备自动语言不写入账号。同步为登录／前台／显式刷新，不声称实时推送；未部署或写生产数据库。详情见 [BR-015](handoffs.md#br-015--账号语言偏好与三语基础)与 [Sprint 0013 报告](../repos/orbit-app/docs/sprints/0013-locale-foundation/REPORT.md)。

## 2026-09-15 A 线 0011 增量

- 首页由 `727aeeae2` 使用真实推荐活动替换旧联系跟进区块，按既有排序最多显示五条未完成待办并在成功完成后补位；Pipeline 保持独立入口。
- Web/API 由 `7a2e9f767` 提供 actor-scoped source version、持久化生成时间/分析版本和服务端受信执行标记；Web UI `3038e8ea7`、App `9a10522b1` 只在用户显式发送 IORBIT 草稿后生成。关系目标字段级版本写入为 `a1d7d7665`。
- 本地结果：App 2715/2715、0011 组合 72/72+28/28+5/5、生命周期组合 128/128；Web 0011 组合 99/99；两端 typecheck 通过，provider keys 全部清空。
- 运行时阻塞已收窄：登录态 Simulator 首页／Pipeline、旧路径和同账号 Web↔App relationshipGoal 双向回读均已完成；仅真实 provider 显式生成后的持久报告与两端重开回读未执行。详情见 [BR-014](handoffs.md#br-014--首页与可信人脉分析)与 [Sprint 0011 报告](../repos/orbit-app/docs/sprints/0011-home-analysis/REPORT.md)。

2026-09-15 本地主线增量：事项与个人日程编辑已在 `d005c2b79` 同时接通 Web/API 与 App，独立 PostgreSQL 和 iOS Simulator 完成同记录双向回读；待办统一由 `ef5d0b02d` 将 App 全部／人脉和未完成／已完成视图接到同一 canonical 集合，并完成 App→Web→App 同记录完成／恢复回读；身份邀请与共享聊天由 E 线原提交 `6d8173b78`、主线集成 `64629369d` 接通，消息状态由原提交 `218fb3d4b`、主线集成 `8c9bf60cc` 接通。0012 仍缺真实 Expo project、push server key 和双用户实体／持续前台证据，保持 blocked；这些本地结果不表示远程部署或生产 OAuth 已验收。
2026-09-15 最新运行时验收：Web 已按当前源码完成 Next.js 生产构建并以 live 模式连接隔离 PostgreSQL；Web 浏览器与原生 iOS Simulator 使用同一服务地址和同一登录账号。BR-017 已完成 Web→App、App→Web、刷新、版本冲突与 actor 隔离；BR-018 已完成原生预填、显式发送、建议接受、幂等、Web 回读、返回来源和含糊日期零写入。两项均更新为 `verified`。这是本地生产进程验收，不代表远程部署或实体设备发布状态。

2026-09-15 12:44 JST Notes 4a 运行时验收：BR-019 已完成 Note v2、服务端有界联系人搜索、App 六个笔记状态和联系人笔记页签。Web 按当时源码完成 Next.js 生产构建并以 live 模式连接隔离 PostgreSQL，原生 App 当时源码构建 0 error／0 warning；Web 浏览器与 iOS Simulator 使用同一服务地址、`qa@orbit.test` 和同一数据库，双向创建／编辑／搜索、幂等、版本冲突与 actor 隔离通过。BR-017～019 均为 `verified`。这是本地生产进程验收，不代表远程部署或实体设备发布状态。

自本次起，涉及 App 可见行为、API、共享契约或状态同步时，Web/API 必须实际运行；Web 端每次更新后先重新生产构建、停止旧进程并启动新产物、检查健康状态，再进行 App 验收。具体规则见 [协作流程](workflow.md#app-开发时保持-webapi-实际运行) 和 [Sprint 规则](../repos/orbit-app/docs/sprints/RULES.md#54-app-开发期间的-web-运行门槛)。

2026-09-10 保存进度集成：用户已接受 App 1389 通过/1 失败、Web 3134 通过/8 失败的当前版本，授权合并到 `chat-agent` 并普通推送；未完成验收不因此关闭。当前结果、远程输入和边界见 [集成交接](2026-09-10-chat-agent-integration.md)。下方 2026-09-07 数字保留为历史快照，不是当前测试或发布状态。

最后核实：2026-09-07，基于本地 HEAD `862cb54b4` 加当时的未提交 App 改动。精确采集时间与路径清单见 [快照](snapshots/2026-09-07-baseline.json)。

## 2026-09-15 D 线增量

- Web/API 由 D 线原提交 `0a1ca09a4`、主线集成 `011b575bb` 提供双面名片 manifest、卡片级原子确认、来源持久化和旧单面兼容；App 同步完成显式正反面采集、两面复核与确认消费者。
- 本地结果：App 2603/2603、两端 typecheck、隔离 PostgreSQL 名片 API／repository 28/28。Web 全量保留 47 个既有失败；4 个宿主 provider key 导致的新增失败在完整清空 key 后 63/63 通过。
- 真实验证仍 blocked：实体 iPhone 离线，没有共同 API/OCR 环境、授权样本和联系人对象。详情及关闭条件见 [BR-012](handoffs.md#br-012--双面名片卡片级确认)与 [Sprint 0007 报告](../repos/orbit-app/docs/sprints/0007-two-sided-cards/REPORT.md)。

## Web / API

- 路径：`repos/orbits`；package 声明 Next.js 16.2.9、React 18.3.1，生产环境要求 Node 22。
- 同时承担 Web 产品 UI、HTTP API、认证、业务服务、数据库访问和 worker。Web 的 server page/route adapter 可以直接调用 `features/**` 的服务；部分交互也通过 HTTP。App 功能不会因 Web 页内新增一段服务调用而自动获得。
- `app/(app)/app` 中有 43 个精确 `page.tsx` 产品路由；`app/api` 中有 199 个 `route.ts` 文件。后者包括多种业务/内部/认证路由，不是 199 个移动端可调用操作，也不代表全部通过运行时验证。
- 最近已提交变化：移动人脉总览 API；共享 Schema；行业/语言字典隔离；Node 22 生产构建修复；测试类型零错误约束及数据库测试夹具隔离。
- 采集时 `repos/orbits` 无 Git 未提交项，但不能据此推断另一个开发者、其他工作树或远程没有进行中工作。
- 服务工厂支持 mock/hybrid/live。实际可用性仍取决于认证、模块配置、数据库、AI provider、worker 和部署状态；本轮没有读取密钥或访问业务数据库。

入口证据：[Web 规则](../repos/orbits/AGENTS.md)、[跨端契约说明](../repos/orbits/docs/cross-client-contract.md)、[发布记录](../repos/orbits/docs/operations/free-beta-launch.md)。

## App

- 路径：`repos/orbit-app`；package 声明 Expo 57、Expo Router 57、React 19，React Native 声明为 `latest`，实际安装版本应另查 lockfile；iOS 优先。
- 原生页面 → hooks/view-model → HTTP client → Web API。App 不在构建时导入 Web feature 源码，不直接连接业务数据库。
- 58 个路由文件含分组折叠、跳转入口及 legacy catch-all；Web 产品路由在移除 `/app` 前缀后均有同名入口。**同名仍可不同功能**：Web `/app/agent` 是 AI 工作区，App `/agent` 是建议动作页，App AI 主入口是 `/ai`。
- 已有账号登录、AI 会话与 Web 历史、人脉与分析、任务与日程、报名/取消、活动运营/审核/签到/角色、权限和通知相关实现。不能继续沿用旧 README 中“移动端不运行匹配/不改角色”等概括判断现状。
- 当前未提交改动：74 个 tracked 文件，主要覆盖主题 tokens、组件、各屏幕主题接入、AI 阅读界面和相关测试；另有未跟踪主题文件、测试、设计文档和 prototype。它们是正在开发的工作，不属于本轮 bridge 新增实现。
- `src/data/snapshot-store.ts` 用本地 SQLite 保存成功 GET 的快照，键为服务器 + 登录用户 + 路径。它是读取缓存，不是业务数据库副本或离线写入同步队列。
- `useApiResource` 在挂载/路径或身份变更/显式 refresh 时拉取；某些长任务页面另外轮询。没有从这些通用 hooks 看到全局跨端实时失效通知。另一端改数据后，当前屏幕可能要刷新才更新。

入口证据：[App 规则](../repos/orbit-app/AGENTS.md)、[客户端](../repos/orbit-app/src/api/client.ts)、[资源加载](../repos/orbit-app/src/hooks/useApiResource.ts)、[本地快照](../repos/orbit-app/src/data/snapshot-store.ts)。

## 本轮实际检查

执行环境 Node `v25.8.1`；这些结果不替代 Node 22 生产环境验证。

| 检查 | 本轮结果 | 能证明什么 |
| --- | --- | --- |
| App 契约/Schema/字典/路由检查 | 7 通过、0 失败 | 文件副本一致及 Web 子路由入口覆盖 |
| 独立路由盘点 | 43 Web / 58 App，缺少同名入口 0 | 含 Web 根页面；既有路由测试未单独覆盖根 page.tsx |
| App `npm test` | 752 通过、0 失败、0 跳过 | 当前工作树的测试基线；不是实机 E2E |
| App `npm run typecheck` | exit 0 | 全量类型检查 |
| Web `npm run typecheck` | exit 0 | 全量类型检查 |
| Web 契约与 mobile dashboard 定向测试 | 14 通过、0 失败 | 类型目录边界、Schema、actor 传递、部分失败和路由处理 |
| Web 全量测试 / 生产构建 | 本轮未执行 | 发布状态只引用下面带日期的既有记录 |
| 同账号 Web ↔ App 双向写入后回读 | 本轮未执行 | 仍需按模块完成业务验收 |

精确命令见 [协作流程](workflow.md)。上述 App 7 项包含在其 752 项中，不相加作为独立测试总数。

## 已知发布状态（既有记录，不是本轮重跑）

`repos/orbits/docs/operations/free-beta-launch.md` 在 2026-09-06 记载：Node 22 本地生产构建、基本生产冒烟、数据库备份恢复已通过；隔离数据库全量回归为 2,216 通过、21 失败、1 跳过。阶段 1C 尚未通过；远程数据库迁移、环境配置、Netlify 部署、worker 和 iOS 公网接入未完成。

本轮未联系远程服务，不确认这些远程状态此后是否变化。不得把本地源码或本轮类型检查通过写成“已上线”或“Web 全量回归通过”。

## 优先处理顺序

1. BR-001：厘清 Today 中哪些业务能力两端必须相同，明确映射与缺口。
2. BR-002 / BR-003：登记 Agent 高级设置和会话历史操作差异，确定移动端覆盖范围。
3. BR-004 / BR-005：收敛未共享 DTO 和跨端刷新/写入一致性验证。
4. BR-006：Web 发布门槛解除后再验收同一远程环境下的 App；不以此阻止本地对齐盘点。
