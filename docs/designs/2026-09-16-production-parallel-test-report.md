# Production 合成数据：并行测试报告

日期：2026-09-16。范围：当前 P0 数据、登录归属、云端后台及 Web/App 共同环境，不代表整个产品全量验收。

## 基线与边界

- 本地源码：`chat-agent` / `f564a0c12`；Production 运行源码 `b7e1f43e6`，部署 `dpl_5JaVX9ko5phE3T4cdFTGcmmcMFxs`；关系 fixture 投影 `1f9cca960` 已应用。
- 正式测试入口：`https://orbit-puce-kappa.vercel.app`，Neon Production，`workspace:orbit-demo-fixtures`。
- 按用户要求以 `gpt-5.6-luna` / `max` 分别执行活动 worker、App、只读数据核查；主代理独占 Web 实际业务操作，避免共享会话互相干扰。另一路 Luna max 补齐 App 测试浏览器并收尾交互测试。
- 子代理未部署、未迁移或修改 Production 数据。主代理仅通过正式 UI 新增明确标注的合成测试记录；没有发送邮件、邀请或外部消息。本轮未修改产品代码、依赖清单或锁文件。
- GitNexus query/impact/detect-changes 已尝试但 SIGSEGV；不能记为图分析通过。诊断按 gitnexus-debugging 的证据链核查源码和定向测试，未实施修复。

## 自动化与运行时结果

| 分线 | 已取得的结果 | 不能据此声称 |
| --- | --- | --- |
| 活动 worker | 131/131 通过，Web typecheck 通过；内存测试、隔离本机 PostgreSQL、API/页面权限与 durable worker 边界 | Production 存在持续执行的 worker，或真实模型生成/发布已通过 |
| App 纯测试 | HTTP、canonical 身份、任务、日程 135/135，typecheck 通过；配置解析到正式 HTTPS API | 原生 App 已安装或 Production 登录和双向读写已验收 |
| App 交互测试 | 初次 182 项中 81 通过、101 因缺少 Playwright Chromium 失败；补浏览器后这 101 项为 99 通过、2 失败、0 skip；两个失败在上海时区串行复现，在东京时区对照 2/2 通过 | 属于测试时区假设未显式固定；原组合仍保留 2 fail，不把条件对照冒充默认环境全绿；浏览器测试不替代原生 Production 验收 |
| Web 定向回归 | 25 项中 24 通过、1 个旧源码结构断言失败 | 不把旧断言误报为生产数据库连接失败 |
| Production Web | 新建待办、编辑备注、刷新、完成、刷新、恢复、Today 回读、另一账号拒绝访问通过 | 所有历史 fixture 已被当前任务 API 消费，或 AI 已能查询该任务 |
| Production 数据 | READ ONLY + REPEATABLE READ 核查 8,715 条记录：5 类检查通过、1 类失败、2 类无实例未验证、查询错误 0 | 不以 seed 行数检查替代实际 schema 与读取链路检查；通过不代表全域端到端覆盖 |

各组合可能重叠，不汇总成虚高的“全量通过总数”。Worker stdout 仅保留在子代理执行记录中，没有持久化日志文件；其隔离测试 schema 清理后匹配数量为 0。

App 原始日志（本机临时证据）：

- `/tmp/orbit-p0a-app-http-pure-20260916.log`
- `/tmp/orbit-p0a-app-http-20260916.log`
- `/tmp/orbit-p0a-app-typecheck-20260916.log`
- `/tmp/orbit-p0a-expo-doctor-20260916.log`
- `/tmp/orbit-p0a-app-http-interactive-rerun-20260916.log`

复跑前通过 `npx --no-install playwright install chromium` 安装 Playwright 1.60.0 对应的 Chromium v1223；未升级项目依赖。101 项中失败的是 `ink-signal-schedule.test.ts:144` 等待 `14:20` 和 `ink-signal-tasks.test.ts:157` 等待 `9月10日 09:00`，均超时 1,500ms。子代理分别以 `TZ=Asia/Shanghai` 串行重跑，仍各 0 pass / 1 fail；主代理以 `TZ=Asia/Tokyo`、`--test-concurrency=1` 和匹配这两个 test name 的过滤对照，两项均通过，exit 0。没有延长 timeout、修改断言或产品代码。

两个测试固定 UTC fixture 并断言东京本地文本，却没有给 `browser.newPage` 配置 `timezoneId`，因此会受宿主时区影响。修复方向是让 fixture 的期望时区显式化，并另保留多时区行为覆盖；本轮未修改测试。上海串行日志：`/tmp/orbit-p0a-app-http-schedule-failure-serial-20260916.log`、`/tmp/orbit-p0a-app-http-tasks-failure-serial-20260916.log`；东京对照输出保留在主代理工具记录中。

交互重跑命令在 `repos/orbit-app` 执行，清除 provider key/token/secret/database 变量：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs`，文件为 `tests/{api-resource-scope,app-timezone-interactions,auth-session-provider-races,ink-signal-schedule,ink-signal-tasks,task-date-interactions,task-detail-interactions}.test.ts` 和 `tests/personal-schedule-interactions.test.tsx`。

## 本轮实际发现

### 1. Web 两个页面仍混用登录主体和业务账号

主测试账号的登录 subject 与 canonical account 不同。联系人页可读取 66 人，但 iOrbit 首屏显示 0 人脉、0 跟进。

- `repos/orbits/app/(app)/app/agent/page.tsx:110` 直接使用 `session.user.id` 作为 actor，传给 home/chat/event 读取器，未在该入口解析 canonical account。
- `repos/orbits/app/(app)/app/tasks/personal/page.tsx:11` 同样把 raw subject 传给个人日程客户端。
- `repos/orbits/app/(app)/app/tasks/personal-schedule-client.ts:9` 正确要求响应的 `accountId`、`ownerUserId` 等于 actor，但页面提供了错误身份。实际保存显示“无法确认日程所属账号”。错误发生于成功响应后的 decode，不能仅凭 UI 报错断言没有写入。
- 修复方向：在页面业务边界解析 canonical 身份，保留客户端归属与回执检查；用 raw subject ≠ canonical account 的用例覆盖页面与保存回读，不删除安全检查。

### 2. iOrbit 只读查不到刚创建的任务

主代理明确要求只读查找已存在的测试任务、禁止业务写入与外发，回复“没有可核查的结果”。待办页同期能读取该任务。此项为独立失败验收点；首屏身份问题已确认，但对话查询的完整失败原因仍需沿 AI 路由/工具选择/数据读取链路定位，不能仅凭相似现象断言同一根因。

### 3. 66 条关系待办仍是旧格式，当前任务 API 无法读取

Production 有 80 条非 deleted 的 legacy TaskDTO（49 open、17 scheduled、14 dismissed），不是数据丢失。当前 reader 要求 `{ version: 1, task, activities }` 包装及 canonical 字段，旧记录不满足，repository decode 后过滤。数据库中仅 2 条任务能被当前 canonical reader 解析，分别属于不同 owner；主账号 UI 正确只看到本轮新建的 1 条，但不能看到此前整理的 66 条关系待办。

需按现有任务契约逐字段投影，保留原 ID、归属、来源、状态语义与历史；不能只把记录包一层或把 dismissed 误变成当前任务。此前生命周期 preflight 0 issues 只证明其覆盖的关系规则，**不证明当前 tasks API 可读**。核查脚本 `/tmp/orbit-c-audit.j4udY4/audit.ts` 直接复用 `features/tasks/task-record.ts` decoder，并对照 `features/tasks/repository.ts` 读取过滤逻辑；主代理已复核此证据。

其余数据检查：个人日程的归属和 legacy 边界、conversation/message 的归属关联、event registration 与 canonical membership 身份、所检查的 active 派生引用均未发现孤儿。当前没有 note 记录，不能验证笔记联系人引用；40 条 notification 只有自身 notification target，没有 reminder plan/delivery，**待办→提醒→通知→详情链路仍没有有效测试实例**。这些空样本不能计为通过。只读审计 stdout 仅在子代理执行记录中，未另存文件；没有为补日志重复查询 Production。

### 4. 活动 worker 缺 Production 承载入口

当前 `repos/orbits/vercel.json` 仅声明 business-card、password-reset、agent-action、maintenance 四类队列；maintenance 清单未包含 event-operations。现有 `run-event-operations-worker.ts` 的长驻循环不能直接等同于 Vercel 已部署执行。

后续需给现有 worker 落实有界执行入口、持久触发、lease/fencing、失败重试和后续调度，再验收真实生成→发布→参与者回读。优先评估现有 Vercel 承载，不以开发机器长驻替代云服务，也不在测试阶段擅自新增付费平台。

### 5. 原生 App 构建环境不兼容

本机 Xcode 26.1.1 / Swift 6.2.1；锁定 Expo 57.0.8、React Native 0.86.0、expo-modules-jsi 57.0.4。现有构建日志有 16 条 `weak let` 诊断，分布于 14 个源文件；修正先前“15 errors”的简略记录。本轮没有重跑已知不兼容的全量原生构建、修改 node_modules 或清理 DerivedData。

[Expo 官方支持矩阵](https://docs.expo.dev/versions/latest/#support-for-android-and-ios-versions) 要求 SDK 57 使用 Xcode 26.4+；[官方仓库同类报告](https://github.com/expo/expo/issues/47819) 与本地错误吻合。没有可用的已安装 Orbit 原生 App，Expo Go 缺 ExpoAsset，不能替代 development build。下一步是兼容工具链下构建安装，再做正式 API 的认证与双向回读。

Expo Doctor 18/21 通过；三个失败是缺 expo-font peer、当前 Hermes 版本内存回归提示、16 个依赖版本未与 SDK 建议版本对齐。它们需在依赖维护时核实，不是本轮直接全量升级的理由。

### 6. 一项 Web 回归断言落后于实现

`repos/orbits/tests/pages/app-home-live-route-services.test.ts:210` 仍要求两个 provider 都使用 `createConfiguredPostgresLiveRecordStore`，而 profile provider 已迁移到共享 transactional runtime；测试内注释已承认这个变化，断言却未更新。需修正断言并保留实际事务与共享连接行为覆盖；当前只能认定结构断言过时，不能据此认定运行时正确或错误。

## 测试产生的记录

- 任务 `task:10ac0c81e45a15698adcda9a`，标题 `[并行验收] 云端待办持久化 2026-09-16`。最终为未完成，备注已持久化；主账号可读，主办方另一账号不可读。保留供后续 App 回读。
- 个人日程 `personal:167c07ce4fb92805838c6e5a`：`[并行验收] 云端个人日程 2026-09-18`，北京时间 15:00–15:30；DB 只读确认恰好一条，属于 `account_orbit_generated`，没有 legacy 冲突。发生归属回执错误后没有重复提交。修复应回读这条已有记录，而不是再次创建。
- iOrbit 增加了一次只读查询对话；未要求或观察到外部动作。

以上均属合成测试 workspace，真实上线前统一清理，当前不提前删除。

## 后续顺序

1. 先修正已确认的 Web canonical 身份入口与失败回执体验，确保同账号页面一致；补主体不同于账号的回归。
2. 完成当前 fixture → canonical tasks/schedule/通知引用及 AI 只读面的端到端核验；为笔记与提醒各补最小有效实例验证引用和权限，不以批量造数代替覆盖，也不重跑旧 seed 覆盖现有测试数据。
3. 可并行推进云端活动 worker 接入与原生兼容工具链准备；之后各自补运行时验收。
4. 最后在同一 Production 环境做 Web↔App 回读；正式接收真实用户前才清理合成数据、切换正式 workspace、落实备份与凭据轮换。

本轮是测试与诊断交付，不代表上述修复或整个目标已完成。
