# Sprint AG16 — 推送提醒

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R16（设计稿 §5.3 的“用户从哪里收结果”“什么时候不打扰”两段）；AG-R19（门槛用例）。
**单一目标:** 定时任务某一期有新结果时，按该任务自己的提醒开关，给浏览器（新接 Web Push：Service Worker、订阅、授权）和 App（沿用现有 Expo 通道）各发一条不含资料的提醒；任务完成时间与投递状态分开记录，投递重试只补提醒，不重新计算。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad55f9dfd21793057f6b22c7727540fac1`，开工时改填实际 HEAD；前序 REPORT 只读 AG15 一份。
**进入条件:**
1. AG15 已 completed 并合回 `orbit-agent-claude`（登记表依赖）。
2. 产品批准：“2026-11-15 已定的事项”里“通知：结果一律进站内收件箱；浏览器与 App 推送是可选的提醒”，以及 §5.3 两段。
3. 付费模型调用已允许；本区只有 AE-PSH-001 有一轮对话出卡，上限见费用一条。
4. 环境：AG00 的 `agent-eval:*` 命令可用，运行器带本机推送模拟端（AE-PSH 文件头约定一；没有就由本 sprint 在 `tests/agent-eval/` 补）；`ORBIT_PUSH_TOKEN_KEY` 本机生成（`push-token-vault.ts:20–28`）；浏览器推送用的一对 VAPID 密钥本机生成、不进仓库。新变量名 `ORBIT_WEB_PUSH_VAPID_PUBLIC_KEY`、`ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY`、`ORBIT_WEB_PUSH_SUBJECT` 是本页的提议，CONVENTIONS §2 还没有，开工前由协调者补进去。
5. 视觉稿：两端“我的定时任务”里的提醒开关、浏览器的请求授权、已拒绝、已撤销几种状态，以及任务历史里“结果已生成、提醒没送到”的说法，已获用户批准（AG15 的获批稿已含则复用，否则补一版）。
6. 真实投递检查需要用户另行授权：真实手机经 Expo、真实浏览器经其推送服务各收一条。没有授权就不做，REPORT 写“未做真实投递”，不能写成已可送达。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `repos/orbits/features/notifications/push-adapter.ts`：`OrbitPushAdapter`（:14–25），`send` 返回的是推送服务的回执号，`verified` 只在核过回执后才置；`createConfiguredExpoPushAdapter`（:27–97）读 `ORBIT_EXPO_PUSH_ENDPOINT`、`ORBIT_EXPO_PUSH_ACCESS_TOKEN`，明确拒收时抛带 `notAccepted` 的错误。
- `repos/orbits/features/notifications/push-provider.ts`、`expo-push-provider.ts`：另一套 `PushProvider`，只被 `reminder-plan-service.ts` 用，自带两次重试（:13、:55–87）。本 sprint 走 `OrbitPushAdapter` 这条，不新增第三套。
- `repos/orbits/features/notifications/push-device-service.ts`：平台已含 `"web"`（:17）；`register` 收 `token: string`（:44–50）；`listActive` 只返回未撤销且授权为 granted 或 provisional 的设备；记录的说明写着 “Orbit mobile push registration”（:112）。浏览器订阅（endpoint 加两把密钥）要序列化后当作 token 加密存放。
- `repos/orbits/features/notifications/push-token-vault.ts`：AES‑256‑GCM，密钥来自 `ORBIT_PUSH_TOKEN_KEY`（:34–70）。
- `repos/orbits/shared/contract/notifications.ts`：`PushDevicePlatformCode` 已含 `"web"`（:4）；`NotificationDeliveryContract`（:34–58）有 `attempt`、`status`、`deliveredAt`，`data` 只放 `deliveryId`；`NotificationDeliveryPhaseCode`（:18–21）只有 `pre_event`、`post_event`、`commitment`。
- `repos/orbits/features/notifications/typed-delivery-factory.ts:15–35`：`materialize()` 把未读收件箱条目变成推送候选（AG15 已把定时任务的新来源排除在外）。
- `repos/orbits/features/notifications/typed-delivery-worker.ts`：发送前重查来源、偏好和设备（:44–53）；用户把锁屏内容设成 `full` 时会把条目标题和正文放进推送（:54、:58），不含资料的说法在 `privateBody`（:8）；明确拒收才重试，结果未知不重发（:61–63）；`DeviceNotRegistered` 时撤销设备（:28、:62）。
- `repos/orbits/features/notifications/typed-delivery-source.ts:28–63`：按来源种类决定能否推送（已有 `secretaryPushAllowed`，:13–16）。
- `repos/orbits/features/notifications/delivery-pass.ts:81–111` 与 `features/operations/maintenance/configured-tasks.ts:264–282`（`notification_redelivery`）：每次维护按有设备的账号跑一次投递。
- `repos/orbits/app/api/devices/push-tokens/handler.ts:24–70`：设备登记接口，平台取自请求体，浏览器订阅也走它。
- `repos/orbits` 里没有 Service Worker 和 Web Push 代码（`public/` 下没有，搜 `serviceWorker`、`PushManager`、`VAPID` 都没有结果），`package.json` 里也没有发送库。
- App：`repos/orbit-app/src/notifications/push-device-session.ts`、`push-registration-queue.ts`、`native-notifications.ts`、`delivery-navigation.ts`（`authorizedDeliveryHref`）是现有的 Expo 登记与点开跳转；`push-device-session.web.ts` 是 App 自己的网页构建，不是 Next.js 浏览器端。
- AG15 的产物：规则的 `notify`、`agentAutomationRuns`、待投递记录、“我的定时任务”页（以 AG15 REPORT 为准）。
- 用例：`docs/epics/agent-design/eval/cases/PSH.yaml`（文件头四条约定）；eval README §10、§13。
- 现有测试：`tests/services/notification-push-policy-adapter.test.ts`、`expo-push-provider.test.ts`、`push-device-consolidation.test.ts`、`typed-notification-source-postgres.test.ts`、`tests/api/push-token-routes.test.ts`、`tests/capabilities/notification-delivery-ledger.test.ts`；App `tests/push-device-session-web.test.ts`、`tests/notifications/merged-notification-lifecycle.test.ts`。

### 关键符号
本 worktree 没有 GitNexus 索引。Generator 先按根目录 `CLAUDE.md` 建索引，再对下列每个要改的符号做 upstream impact，HIGH/CRITICAL 先报告；建不起来就用文本搜索补查并在 REPORT 写明（CONVENTIONS §5）。引用数是编制时在 `repos/orbits` 的 `app features shared scripts tests` 下 `grep -rlw` 得到的文件数，含定义文件。
- `export interface OrbitPushAdapter {`（push-adapter.ts:14）：6 个文件。`export interface OrbitPushMessage {`（push-adapter.ts:1）要加可选的平台字段，供按平台分发。
- `export function createConfiguredExpoPushAdapter(`（push-adapter.ts:27）：6 个文件，测试 1 个。
- `export function createTypedDeliveryWorker(input:{actorId:string;ledger:NotificationDeliveryService;repository:DeliveryPolicyRepository;devices:PushDeviceService;push:OrbitPushAdapter|null;sources:TypedDeliverySources;now?:()=>string}) {`（typed-delivery-worker.ts:22）：6 个文件，测试 4 个。
- `export function createTypedDeliverySources(input:{actorId:string;client:TransactionalPostgresClient;workspaceId:string;repository:DeliveryPolicyRepository;now?:()=>string}) {`（typed-delivery-source.ts:28）：5 个文件，测试 3 个。
- `export function createStoragePushDeviceService({`（push-device-service.ts:153）：4 个文件，测试 3 个。`export function createPushTokenRouteHandlers(`（handler.ts:24）：4 个文件，测试 1 个。
- `export interface NotificationDeliveryContract {`（shared/contract/notifications.ts:34）：3 个文件；改它要同步 App。

### 前序交接要点
以下名字取自 CONVENTIONS §4，是约定。开工时对照 AG15 REPORT，不一致就按 REPORT 更正本节并留追加记录，原文和原哈希保留。
- AG15：规则字段 `notify`（站内必选，推送可选）；`agentAutomationRuns` 的每期记录与它的待投递记录；收件箱新来源“定时任务结果”；`domains/rule` 的 `rule.update`（开提醒要出卡，AE-PSH-001）；“我的定时任务”页与提醒开关的位置；派发器每期只算一次。
- AG00：`emitTrace()` 与 `notify.push` 事件；对外连接守卫会拦下任何推送服务（eval README §10）。

### 易错边界（都对应到下方验收项）
1. **逐个任务开**（AG16-1）：只有 `notify.push` 为真的规则那一期才建推送候选；从对话里开提醒是改规则，照样出卡、点了才生效（AE-PSH-001）；发送时再查一次该规则仍有效、仍属本人、提醒仍开着，否则不发。没开的规则一次投递都不尝试（AE-PSH-001 的 RU2）。
2. **只发给允许了的设备**（AG16-1）：浏览器点过拒绝就不订阅、不登记为可用设备（AE-PSH-001 的 PD2）；系统里撤销授权时服务端事先不知道，推送服务拒收后撤销该设备，不再发；站内结果完整保留，规则不停（AE-PSH-002）。
3. **不含资料**（AG16-2）：定时任务提醒的标题、正文和附带数据一律用不含资料的固定说法（如“有新结果，请到 Orbit 查看”），不受用户锁屏内容设为 `full` 的影响；附带数据只放不透明的投递编号；点开后到收件箱那一条，由登录态再读内容。`push_excludes` 列的活动名、地点都不能出现（AE-PSH-001、003）。
4. **两样分开记**（AG16-3）：运行记录里的完成时刻与投递记录里的状态、尝试次数、送达时刻分开存，两端任务历史分别显示；提醒没送到记为“结果已生成、提醒没送到”，不记成任务失败（AE-PSH-002）。
5. **重试只补提醒**（AG16-3，AE-PSH-003）：投递失败交给现有投递账本重试，不重新跑规则、不再读资料、不调模型，收件箱仍只有一条；9:20 那次派发不能让 RU1 再跑一期。重试只针对推送服务明确拒收；结果未知按现有逻辑不重发，不要为了过用例改成重发。
6. **浏览器推送是新的**（AG16-1、AG16-2）：Service Worker 只处理 `push` 和 `notificationclick`，显示服务端给的固定说法，点开只跳到本站的收件箱地址；订阅前先由用户点按钮再请求授权，不在页面打开时自动弹；退订或换浏览器要撤销旧登记。发送按设备平台分到 Expo 或 Web Push 适配器。
7. **测试不连真实推送服务**（全部验收项）：测试和评测里两个适配器都指向本机模拟端，`notify.push` 事件的 `source` 记为 `simulated`；`revoke: { push: app }` 由模拟端在之后的发送上拒收。真实投递是单独标注的一次人工检查，见进入条件 6。

## 范围与文件

- 读取：上下文包所列；AG15 REPORT 的交接节。
- 修改：
  - `repos/orbits/features/notifications/push-adapter.ts`（消息加可选平台字段）、`typed-delivery-factory.ts`（定时任务结果按规则开关建候选；按平台选适配器）、`typed-delivery-source.ts`（定时任务结果的推送条件与不含资料的说法）、`typed-delivery-worker.ts`（定时任务结果不走 `full` 锁屏内容；把平台带进发送）、`push-device-service.ts`（浏览器订阅的登记说明）。
  - `repos/orbits/app/api/devices/push-tokens/handler.ts`：校验浏览器订阅的形状。
  - AG15 的规则与运行记录：运行记录关联投递编号，任务历史读投递状态（文件以 AG15 REPORT 为准，`features/agent/automations/` 下）。
  - `repos/orbits/shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts`：任务历史里投递状态的传输字段；`shared/contract/notifications.ts` 只在确需新的投递阶段取值时改。
  - 两端“我的定时任务”页的提醒开关（AG15 建的文件）；App `repos/orbit-app/src/notifications/delivery-navigation.ts`（定时任务提醒点开到收件箱那一条）。
  - `repos/orbits/package.json`：新增一个 Web Push 发送库（锁定确切版本）。
- 新建：
  - `repos/orbits/public/orbit-push-sw.js`（Service Worker）。
  - `repos/orbits/app/(app)/app/orbit-2026/account/web-push-client.ts`（授权、订阅、退订，登记到 `/api/devices/push-tokens`）。
  - `repos/orbits/features/notifications/web-push-adapter.ts`（实现 `OrbitPushAdapter`，读上面三个 VAPID 变量）。
  - 测试：`tests/services/agent-rule-push-delivery.test.ts`（逐任务开关、不含资料、重试不重算、撤销后不发）、`tests/services/web-push-adapter.test.ts`（用本机模拟端，不连外网）、`tests/api/push-tokens-web-subscription.test.ts`；App 端在 `repos/orbit-app/tests/` 加提醒开关与点开跳转的测试。
- 排除：其他种类通知的推送规则（预提醒、跟进、消息）保持原样；提醒频率的场景评测（设计稿 §9 单独做）；静默时段的新设置；真实推送服务的自动化测试；部署与生产密钥配置。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG16-1 | 提醒由用户逐个任务开启；拒绝或撤销授权后站内结果照常保留。 | `agent-rule-push-delivery.test.ts`：只给开了提醒的规则建候选、撤销后不再发、收件箱不变、规则仍有效；`push-tokens-web-subscription.test.ts`：拒绝授权不登记；门槛 AE-PSH-001、002；两端提醒开关与授权几种状态的截图（Web 1440/375 并按 `docs/development/web-no-flash-and-cache-rules.md` 核对不闪动，App 连同一套本机服务） |
| AG16-2 | 提醒内容只说去 Orbit 查看，不含具体资料。 | `agent-rule-push-delivery.test.ts`：锁屏内容设为 `full` 时定时任务提醒的标题、正文、附带数据仍不含资料；`web-push-adapter.test.ts`：发给模拟端的载荷只有固定说法和投递编号；AE-PSH-001、003 |
| AG16-3 | 任务完成时间与推送的投递状态分别记录；投递重试不重新计算结果。 | `agent-rule-push-delivery.test.ts`：完成时刻与投递状态分开存、明确拒收重试一次后送达、重试期间规则执行次数不变、结果未知不重发；AE-PSH-002、003 |

## 一次 Generator 的执行顺序

1. 复核进入条件；登记 run-01、本页 SHA256 和基线 HEAD；记下门槛用例与夹具的校验值；动手前在基线上跑一次 `npm test` 存失败清单；建 GitNexus 索引；按 AG15 REPORT 校正上下文包；确认运行器已有本机推送模拟端和 `push_delivery`、`push_excludes`、`revoke: { push }`，缺的按 eval README §3.4 的含义在 `repos/orbits/tests/agent-eval/` 补上，不改用例。
2. 对关键符号做 impact；先写失败测试：没开提醒的规则不建候选、`full` 锁屏下仍不含资料、重试不重算、撤销后不发。
3. 服务端：定时任务结果的推送条件、不含资料的说法、按平台分发、运行记录关联投递状态；`web-push-adapter.ts` 与订阅登记校验。
4. 浏览器端：Service Worker、授权与订阅；App 端：提醒开关接线与点开跳转（视觉稿批准后）；`shared/` 改动的同一提交里跑 App 同步。
5. 门槛运行与双评；浏览器 1440/375；App 按 App 规则 5.4 连同一套本机服务验证；收口全量对照；路径限定提交；写 REPORT。
6. 获得授权后做一次真实投递人工检查，单独记录；交接分支与最终 SHA，由协调者合回 `orbit-agent-claude`。

## 最小测试与检查

- **档位：登记表定 L，本计划按 H 执行。** RULES 5.1 规定改共享契约要按 H；App 规则 5.1 规定依赖改变要跑全量。本计划预计两样都有（任务历史的投递字段进 `shared/contract/agent-v1.ts`，并新增一个 Web Push 发送库），所以按 H 的定向集做，收口跑一次全量对照。实现时若两样都没发生，退回 L 并在 REPORT 写明。
- **开发定向集**（cwd `repos/orbits`）：上面新建的三个测试文件；`tests/services/notification-push-policy-adapter.test.ts`、`expo-push-provider.test.ts`、`tests/api/push-token-routes.test.ts`。数据库测试读 `ORBIT_EVENT_DATABASE_URL`，必须指本机测试库，先跑 `node scripts/assert-local-test-databases.mjs`，REPORT 证明没有被 skip。
- **操作链收口集**：上述文件完整跑；投递管线的消费者 `tests/services/typed-notification-source-postgres.test.ts`、`historical-inbox-delivery-postgres.test.ts`、`typed-delivery-cutover-offsets-postgres.test.ts`、`typed-message-materialize-cost-postgres.test.ts`、`schedule-reminder-refresh-cutover-postgres.test.ts`、`push-device-consolidation.test.ts`、`tests/capabilities/notification-delivery-ledger.test.ts`；AG15 新建的 `agent-automation-runs.test.ts`；`npx tsc --noEmit -p .`。
- **契约同步**：改 `shared/` 的同一提交里，在 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`；App 另跑 `npm run typecheck`、`tests/push-device-session-web.test.ts`、`tests/notifications/merged-notification-lifecycle.test.ts` 和新加测试的完整文件。
- **门槛**：`npm run agent-eval:run -- --gate AG16`，含 PSH 区 3 例（AE-PSH-001～003）和不变量包；本区没有分到 SCL 用例，三例都在小账号上。三例都含模拟（推送），`summary.json` 单列，真实与模拟次数分两栏。
- **评审**：`npm run agent-eval:judge-pack -- --run <运行编号>` 出材料，每例由两个互不相见的 Claude 新会话各评一次，不一致的做第三次并进人工复核清单；`npm run agent-eval:report -- --run <运行编号>` 汇总并登记 `eval/RUNS.md`。失败修复后整套门槛重跑，最多两轮。
- **全量对照**：收口跑一次 `npm test`，与第 1 步的基线失败清单 `comm -13` 比较，只查新增项；不 source `.env` 系列文件；不用裸 `git stash`。
- **费用**：真实模型调用每次完整运行 30 元以内，本 sprint 累计 150 元以内，超出先停下报告；次数、token、金额和 DeepSeek 余额差记进 `costs.json` 与 REPORT。推送一律模拟，不计费。
- **证据**：截图与命令输出放 `~/orbit-sprint-evidence/agent-design/sprint-AG16/run-01/`；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`；真实投递检查另放 `run-01/manual-real-delivery/`，只留时间、设备类型、是否送达和通知截图，不留 token、订阅地址或密钥。
- **不运行**：封存集；`--all`；自动化测试连真实推送服务；未经授权的真实投递；Lighthouse、axe 等验收项没要求的检查。

## 失败与交接

外部条件缺失（AG15 未完成、视觉稿未批准、密钥缺失）先不启动，或只做不受影响的部分并把受影响的证据记 blocked；run 已开始则按规则产出 failed 或 blocked 报告，不开第二次 Generator。真实投递没有授权时只记“未做”，不影响三项验收的判定，也不能写成真实可送达。
报告包含：验收项与证据的对应、功能 SHA、命令与退出码、门槛运行编号与 `RUNS.md` 一行、双评不一致清单、新增依赖与版本、新环境变量、模拟与真实投递分开的结果、费用、未提交与失败项、下一步。
分支：从 `orbit-agent-claude` 建 `sprint/AG16-push-reminders`；只暂存本 sprint 的文件，禁止 `git add .`；提交前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`，`partial` 或 `truncated` 要重跑。由协调者 `git merge --no-ff` 合回 `orbit-agent-claude`，在合并树跑收口集与 typecheck 后才登记 completed。push 需要用户授权。

## 进入条件核对（协调者 2026-11-20 核对，Generator 在 run-01 开工时追加；以上原文未改）

原文 SHA-256：`349b7284185d15c58455bbd8ce6b3fa094f9b3cd0a710155180f41a63866f239`。基线 HEAD：`002c63eb7`（`sprint/AG15-scheduled-tasks-inbox`）。分支 `sprint/AG16-push-reminders`，检出 `.worktrees/ag16`，评测端口 3230–3245。门槛用例文件 `eval/cases/PSH.yaml` SHA-256 `ebd9b6db8c29740538d163c147bf8e50e13c95162ec4b1246cb95888703d5982`（现有 5 例：AE-PSH-001～005，004、005 是日文、英文版）。

1. **分支从 AG15 的分支起，不是从集成线起。** AG15 的服务端已完成并过了门槛（`002c63eb7`），它的两端「定时任务」页还没做（视觉稿等用户批准），所以提醒开关在界面上的位置还不存在。进入条件 1（AG15 已 completed 并合回）按协调者指示改为：在 AG15 的分支上并行开工。
2. **AG15 留下的接口**（以它的 REPORT 为准，上下文包「前序交接要点」据此更正）：`agentAutomationNotify(automation): { inApp; push }`；`AgentAutomationRunRecord.delivery.push`；`createAutomationRunStore(store, workspaceId)` 的 `get/save/list`；`dispatcher.ts` 里 `deliverRun()` 之后的挂点。每期的投递状态已经和结果的 `computedAt` 分开存。现有推送管线（`typed-delivery-factory.ts` 的 `materialize()`）已经跳过定时任务的三种来源。
3. **涵盖 AG16 的视觉稿已画、未批准**（进入条件 5 未满足）。本次只做不依赖它的部分：只给开了开关的任务发；固定的一句话，标题、正文、附带数据都不含资料；两个适配器（App 走 Expo，浏览器走 Web Push：VAPID 密钥按 CONVENTIONS §2、Service Worker、订阅存储），测试和评测里指向本机模拟端，`notify.push` 事件标 `source: simulated`；授权被拒或撤销时收件箱结果完整、任务照常；补送不重算、不读资料、不调模型；投递状态与结果完成时刻分开记；对话里开提醒的卡（沿用现有确认卡）；页面要用的设置与接口；评测运行器的推送模拟端与 `push_delivery`、`push_excludes`、`revoke: { push }`；单元测试。界面证据（两端提醒开关、浏览器授权几种状态的截图）记 blocked。未批准稿的 AG16 部分（16-1～16-5、D16-1～D16-4）只作参考；数据要能表达 16-4 的每一行历史。
4. **真实投递**（进入条件 6）没有用户授权：不做，REPORT 写「未做真实投递」。
5. 新增依赖要在 REPORT 写明名称和版本。
6. 同时在跑的线：AG19、AG14、AG17（即将合并 AG15 的分支）、独立测试套件（`tp`）。AG15 的 Generator 之后还要回到同一批文件做页面：对 AG15 文件的改动要小，并在 REPORT 点名。
7. 环境变量：CONVENTIONS §2 只登记了 `ORBIT_WEB_PUSH_VAPID_PUBLIC_KEY`、`ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY`；本页提议的 `ORBIT_WEB_PUSH_SUBJECT` 没有登记。实现为可选：不设时取站点自己的地址（`AUTH_URL`／`NEXTAUTH_URL`，须为 https），在 REPORT 里列为与 CONVENTIONS 的出入。
8. 证据目录在外置盘：`/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG16/run-01/`；评测日志在 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag16/runs/`（不是本页写的 `~/orbit-sprint-evidence/…`）。
9. **2026-11-20 追加（协调者转达）：用户已批准 AG15、AG16 的视觉稿，D16-1～D16-4 全按推荐**——每条任务一个开关管手机和浏览器；提醒那句话是「有新结果，请到 Orbit 查看。」；浏览器只在点了按钮之后才询问；提醒受每日上限和免打扰时段管，历史里写明为什么没发。服务端已按这四项实现（第 3 条里「未批准」的说法到此为止）。两端页面在 AG15 的页面建好之后由另一位执行者做，本次停在服务端；界面证据仍记 blocked。
