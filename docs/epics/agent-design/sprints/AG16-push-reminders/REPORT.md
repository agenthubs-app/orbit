# Sprint AG16 — 执行总结（推送提醒，H）

对应 [GOAL.md](GOAL.md)。本页是生成者在 run-01 写的；评审结论和最终状态由协调者在页尾补。

## 结果

**已验证能做到：**

- **提醒是逐条任务开的。** 结果仍然一律进站内收件箱。只有自己开了开关的任务，在某一期有新结果、且结果已经进了收件箱之后，才给任务所有者的手机和浏览器各发一条提醒；没开的任务一次都不尝试。没有新内容的那一期不提醒。
- **提醒只有一句话。** 标题「Orbit」，正文「有新结果，请到 Orbit 查看。」（英文、日文各一句，按开提醒时用户所用的语言）。标题、正文、附带数据里没有活动名称、时间、地点、人名，也没有任务的名字；附带数据只有一个不透明的编号。用户把锁屏内容设成「显示内容」也不影响这一类提醒：拼这句话的函数只收语言和运行编号两样。
- **点开去哪。** 编号只对登录后的本人有效：`GET /api/notifications/deliveries/<编号>` 返回收件箱里那一条的地址，别的账号拿同一个编号得到 404。
- **授权被拒或撤销，收件箱和任务都不受影响。** 浏览器点了拒绝就不登记为可发设备。系统里撤销授权时服务端事先不知道：推送服务拒收之后才撤销那台设备的登记，之后不再发；这一期记为「结果已生成、提醒没送到」，任务照常运行，下一期照常进收件箱。
- **补送只补提醒。** 推送服务明确拒收的，下一次派发再送，最多 5 轮；没有应答的不重发（可能已经送到）。补送只读这一期自己的运行记录、任务的状态和开关、所有者的通知设置和设备登记，不读任何资料，不调模型，不重新算；只改运行记录里提醒那一块，收件箱不会多一条。
- **两件事分开记。** 结果算出的时刻（`computedAt`）和提醒的状态、轮数、送达时刻、没送到或没发的原因各记各的；任务历史每期有两行，第二行由服务端写好。
- **每日上限和免打扰时段（D16-4，已批准）。** 撞上了就只进收件箱，之后也不补发，历史里写原因。和其他自动通知共用同一个每日计数。
- **对话里说一句也能开。**「这条任务以后在手机上提醒我」由代码读成改这条任务，出现有的确认卡，点了才生效；卡上写明只改这一条、提醒上不写内容。用户不说任务原名而是描述它时（英文用例），模型只从给它看的任务清单里回答一个序号，代码核对。
- **浏览器推送是新接的。** Web Push 适配器（加密和 VAPID 签名用 `web-push` 库，请求自己发）；订阅地址只接受各家浏览器的推送服务；Service Worker 只处理 `push` 和 `notificationclick`，点开只去本站收件箱；浏览器端的允许、退订、同步函数（打开页面不会弹询问，只有用户点按钮才问，D16-3）。
- **评测。** 运行器补了 `push_delivery`、`push_excludes`、`revoke: { push }`、`fault: { where: push }` 和浏览器推送的模拟端；PSH 区 5 例在门槛运行里硬判定全过。

**仍未实现或未验证：**

- **两端界面没有做。** 提醒开关、这台设备允不允许通知的几种状态、历史的第二行，都要放在 AG15 的「定时任务」页上，那两页还不存在。视觉稿已于 2026-11-20 获批（D16-1～D16-4 全按推荐），页面由另一位执行者在 AG15 的页面建好后做。界面证据（Web 1440/375、不闪动核对、App 截图）记 blocked。
- **没有任何页面注册 Service Worker**，也没有页面调用浏览器端那几个函数；现在没有用户能从界面上打开提醒，只能在对话里开（或直接调接口）。
- **未做真实投递。** 没有用真实手机和真实浏览器各收一条；需要用户另行同意。不能据此说「真实可送达」：Web Push 的加密格式由测试里的模拟浏览器解开验证过，真实推送服务的行为没有验证。
- **正式环境没有 VAPID 密钥**，没有生成也没有配置；不配时浏览器提醒整体关闭（接口返回 `publicKey: null`），手机提醒不受影响。
- **网页收件箱还不认 `?delivery=<编号>`。** Service Worker 点开的地址带这个参数，页面现在只会停在通知页签，不会选中那一条。
- **退出登录时没有退订浏览器。** 要在页面的退出流程里调 `disableWebPush()`，否则退出后那个浏览器还会收到那一句话（不含内容，点开要先登录）。
- **门槛运行里 5 例没过，都不是推送区的**：AE-MEM-008、009、012 和 AE-REF-005（归 AG14，本分支没有 AG14，与 AG15 门槛相同），以及 AE-REF-008（AG11 的不变量，见下）。
- Expo 回执的事后核对（票据接受之后 15 分钟查回执，回执说设备已注销则改记「没送到」并撤销设备）只有单元测试，评测里没有用例走到。

## 运行记录

- 结果：等协调者评审（硬判定见下）。
- Generator：Claude（Fable 5.2），2026-11-20；Planner revision 1，SHA-256 `349b7284185d15c58455bbd8ce6b3fa094f9b3cd0a710155180f41a63866f239`（开工时记录；之后只在页尾追加「进入条件核对」）。
- 基线 HEAD `002c63eb7`（`sprint/AG15-scheduled-tasks-inbox`）；分支 `sprint/AG16-push-reminders`；最终 SHA `7e29f926c`；由协调者合并。
- 档位 H。push：无。生产库、部署、真实推送服务：没有碰。
- 中途两次中断（06:00 前后账号用量上限、09:21–09:56 之间本机断网），都不是在评测运行当中；没有半写的文件。门槛运行里 149 次主模型、25 次判断调用全部返回 200，没有因断网需要重跑的用例。

### 提交

| SHA | 内容 |
|---|---|
| `c660463be` | 产品代码与测试：提醒的发送与补送、Web Push 适配器、设备登记、Service Worker、浏览器端函数、对话里开提醒的卡、三个接口、共享契约与 App 同步副本 |
| `221dda53b` | 运行器：`push_delivery`、`push_excludes`、`revoke: { push }`、推送故障、浏览器推送模拟端、种子里的设备与规则开关；`eval/CHANGES.md` 一行 |
| `094577794` | PLANNER 追加「进入条件核对」（门槛构建自这一提交） |
| `7e29f926c` | PLANNER 追加视觉稿获批一条；两个测试的标题（不改产品代码） |

### 评测运行（都在 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag16/runs/`）

| 运行 | 用途 | 硬判定 | 真实调用（主模型／判断） | 金额（元） |
|---|---|---|---|---|
| `20261120-084350-002c63e-dev-dispatch` | 开发：AE-PSH-002、003（未提交的工作区） | 2/2 | 0／2 | 0.0009 |
| `20261120-084429-002c63e-dev-conv` | 开发：AE-PSH-001、004、005（未提交的工作区） | 3/3 | 7／6 | 0.0176 |
| `20261120-084943-0945777-dev-stab1` | 稳定性第 1 次（PSH 5 例，门槛同一构建） | 5/5 | 7／8 | 0.0194 |
| `20261120-085029-0945777-dev-stab2` | 稳定性第 2 次 | 5/5 | 8／8 | 0.0233 |
| `20261120-085121-0945777-dev-stab3` | 稳定性第 3 次 | 5/5 | 7／8 | 0.0170 |
| `20261120-085225-0945777-AG16-gate` | **门槛**：`--gate AG16 --workers 3`，70 例（PSH ×5、不变量包 65） | 65/70 | 149／25 | 0.2937 |
| `20261120-085921-0945777-dev-ref008-1` | 诊断：AE-REF-008 单独跑 | 1/1 | 2／0 | 0.0051 |
| `20261120-090006-0945777-dev-ref008-2` | 同上 | 1/1 | 2／0 | 0.0034 |
| `20261120-090045-0945777-dev-ref008-3` | 同上 | 1/1 | 2／0 | 0.0045 |

- 三次稳定性运行里 5 例的硬判定结果完全一致：三张卡的文字相同，发往模拟端的提醒相同（中、日、英各自那一句），RU1 列出的都是街拍工作坊、东京街头摄影展、独立出版市集，RU2 都是设计师之夜。第 2 次里 AE-PSH-005 多一次主模型调用（重试），结果不变。
- 门槛运行：主模型 149 次，提示 349,822 token（其中缓存命中 315,648）、生成 61,221 token；判断模型 25 次，输入 11,596 token；DeepSeek 余额 299.75 → 299.27 元（同时有别的线在跑，差额不全是本线的）。本 sprint 全部运行合计约 0.385 元（上限 150）。推送全部是模拟，不计费；`costs.json` 没有推送一栏，每例发了几条见 transcript 的「模拟推送服务收到的提醒」和 trace 的 `notify.push`。含推送的 5 例都列在 `summary.json` 的 `simulatedCases` 里。
- 评审材料已生成：`20261120-085225-0945777-AG16-gate/judging.md`，70 份、每份两次评审。**没有自评。**
- **AE-REF-008**（AG11 的不变量）在门槛运行里没过 `cites`：第一层把「Based on @客户访谈, am I going to make the deadline on @回复田中的询价?」拆成了两个子目标，第二个依赖读不到笔记的第一个，于是没有回答截止时间。这一例只有一次主模型调用（第一层），不经过本 sprint 改过的任何代码，trace 里没有超时。为了弄清是不是不稳定，单独跑了 3 次，3 次都没拆、都通过。**门槛结果仍是没过，这 3 次不顶替它。** 它不属于「只因超时才可单独重跑」的情形，所以没有据此重跑门槛，也没有开修复轮去改 AG11 的行为；怎么处理请协调者定。
- `judge-pack` 在分线环境里仍要带 `ORBIT_AGENT_EVAL_HOME=/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag16`。

### 待登记的运行（`eval/RUNS.md` 由协调者填）

上表 9 行。门槛那一行：`20261120-085225-0945777-AG16-gate`，提交 `0945777`，70 例，硬判定 65/70（未过：AE-MEM-008、AE-MEM-009、AE-MEM-012、AE-REF-005，归 AG14；AE-REF-008，AG11 的不变量，单独重跑 3 次均通过），真实调用 149＋25，0.2937 元，`bundle.sha256` 的校验值开头 `c49fa066fc7d`。

### 测试

- 新增（全部通过）：`tests/services/agent-rule-push-delivery.test.ts`（15）、`tests/services/agent-rule-push-postgres.test.ts`（3，真库）、`tests/services/web-push-adapter.test.ts`（5）、`tests/api/push-tokens-web-subscription.test.ts`（6）、`tests/agent-v1/rule-reminder.test.ts`（6）、`tests/ui/web-push-client.test.ts`（9）、`tests/agent-eval/hard-checks-ag16.test.ts`（6）；App `tests/notifications/rule-reminder-navigation.test.ts`（2）。
- 改了 AG15 的两处断言：`tests/capabilities/agent-automation-runs.test.ts`（原来断言「推送只记下、不发」，现在这套没有设备的测试里记为「没送到：没有设备」）、`tests/agent-v1/rule-domain.test.ts`（卡上「提醒方式」那一行的新说法）。
- 操作链收口集 126 条全过、0 跳过（`closing-set.log`）：数据库测试用 `ORBIT_EVENT_DATABASE_URL` 和 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 指本机专用库 `orbit_ag16_test`（测试在私有 schema 里跑、跑完删掉），先过 `node scripts/assert-local-test-databases.mjs`。
- `npx tsc --noEmit -p .`：只剩基线就有的两处（`tests/scripts/redesign-pixel-lib.test.ts`、`tests/services/contact-profile-inference-postgres.test.ts`）。App `tsc`：只剩基线就有的 `tests/ios-scene-lifecycle-config.test.ts`。
- 契约同步：`shared/contract/agent-v1.ts` 与对应 schema 只加不改（快照工具没有报破坏性变更），同一提交里跑了 `npm run sync:contract`、重写了 `.snapshot.json`；App 的四个同步测试通过。
- **全量对照**（最后一次产品代码改动之后，`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`）：服务端 9278 条、22 条失败，名字与已知清单完全相同，没有新增；App 3584 条、3 条失败，就是已知的 3 条，没有新增。

证据目录：`/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG16/run-01/`（`closing-set.log`、`full-orbits.log`、`full-app.log`、`orbits-fail-names.txt`、`gate-run.log`、`impact/`、三份 `detect-changes-*.txt`）。

## 验收结果

| 验收 | 结果 | 证据 |
|---|---|---|
| AG16-1 提醒由用户逐个任务开启；拒绝或撤销授权后站内结果照常保留 | 服务端与对话 pass（硬判定）；两端提醒开关与授权几种状态的截图 blocked（页面还不存在） | `agent-rule-push-delivery.test.ts`（只给开了开关的任务发、撤销后不再发、收件箱不变、任务仍有效、发送前再查一次开关）；`push-tokens-web-subscription.test.ts`（拒绝授权不登记、收回授权撤销登记、任务页开关只改这一条）；`rule-reminder.test.ts`（卡、点击后才生效）；门槛 AE-PSH-001、002、004、005 |
| AG16-2 提醒内容只说去 Orbit 查看，不含具体资料 | pass（硬判定） | `agent-rule-push-delivery.test.ts`（标题、正文、附带数据不含结果里的词和任务名；三种语言各一句）；`web-push-adapter.test.ts`（模拟浏览器解密后只有固定标题、那一句话和编号）；`web-push-client.test.ts`（Service Worker 只显示服务端给的字、点开只去本站收件箱）；AE-PSH-001、003、004、005 的 `push_excludes` |
| AG16-3 任务完成时间与推送的投递状态分别记录；投递重试不重新计算结果 | pass（硬判定） | `agent-rule-push-delivery.test.ts`（完成时刻不因补送而变、明确拒收补送一次后送达、期间计算次数不变、只有提醒那一块变了、没有应答不重发）；`agent-rule-push-postgres.test.ts`（提醒的待办行与收件箱投递同一事务，派发中途死掉不丢）；AE-PSH-002、003 |
| 真实投递（PLANNER 进入条件 6） | 未做 | 没有用户授权 |

## 与 PLANNER 不同（CONVENTIONS／SPRINTS／brief／协调者指示优先）

1. **分支从 AG15 的分支起**，AG15 未合回；它的页面还没有。
2. **门槛是 PSH ×5**（SPRINTS.md 登记表），PLANNER 写的是 3 例；AE-PSH-004、005 是日文、英文版，要求提醒那句话跟开提醒时用户的语言走，所以规则的 `notify` 多了 `pushLocale`。
3. **没有走现有的投递账本**（`typed-delivery-*`、`NotificationDeliveryService`）。PLANNER 让定时任务的提醒经它建候选、重试；AG15 的 REPORT 建议接在派发器里。选了后者：`scheduler_tick` 调的是派发入口而不是整轮维护；那条账本要求设备先和服务端交接「谁来发」，浏览器没有这一步，会被永远推迟；它在安静时段是推迟到早上汇总，而 D16-4 要的是不发并写明原因。沿用了它的三样：`OrbitPushAdapter`（没有新增第三套）、设备服务、通知设置与每日计数。`typed-delivery-factory.ts`、`typed-delivery-source.ts`、`typed-delivery-worker.ts` 没有改。
4. **浏览器只在这一类提醒的设备清单里出现。** `listActive()` 默认不列浏览器，要 `listActive({ includeWeb: true })` 才列：为手机写的那些发送方（预提醒、消息、跟进）看到的设备和以前完全一样，不会把浏览器订阅当 Expo 令牌发出去。
5. **`ORBIT_WEB_PUSH_SUBJECT`** 不在 CONVENTIONS §2。实现为可选：不设时取站点自己的地址（`AUTH_URL`／`NEXTAUTH_URL`，须为 https）；两样都没有就视为没配置浏览器提醒。请协调者决定是否补进 §2。
6. **新增依赖**：`web-push` 3.6.7（运行时）、`@types/web-push` 3.6.4（开发）。npm 上 2026-11-06 出了 4.0.0，没有用：3.6.7 用了近三年，4.0.0 才两周、接口变化没有核实。合并后协调者的检出要 `npm install`。
7. **App 的 `delivery-navigation.ts` 没有改。** 服务端按它已经认的形状回答（`/inbox/notifications/<编号>`），现有的点开跳转直接可用；加了一条测试证明。
8. **评测的 `push: { count }` 改为只数模拟端接受的提醒**，被拒或没应答的不算发出（原来没有拒收，这一条以前不影响任何用例）；Expo 模拟端对单条消息改为返回单个回执（原来一律返回数组，产品的适配器读不出，之前没有用例走到）。已登记在 `eval/CHANGES.md`。
9. **证据目录**在外置盘，不是 PLANNER 写的 `~/orbit-sprint-evidence/…`。

## 影响分析

索引为本检出单独建（`gnx.sh ag16 analyze --index-only`），加完新文件后重建过一次。改动前做了上游影响分析，输出在证据目录 `impact/`。

| 符号 | 风险 | 本次怎么改的 |
|---|---|---|
| `createStoragePushDeviceService` | CRITICAL | 只加：`listActive` 多一个可选参数（默认行为不变）、`get`、`revoke` 多一个可选的原因 |
| `ruleWriteExecutors` | CRITICAL | 只动「修改」那一个执行器里 `notify` 的写法；其余四个没碰 |
| `rulePart`、`matchRule`（未改） | HIGH | 动词判定里加提醒的代码判据；按名字找不到任务时多一次模型选择；修改路径读提醒的说法 |
| `scheduledRunView` | HIGH | `push` 多出几项，原有三项不变 |
| `notifyWords` | HIGH | 只改开了提醒时的那一句说法 |
| `runHistoryLine`、`pushSaidIn`、`agentAutomationNotify`、`createConfiguredExpoPushAdapter` | HIGH | 没有改 |
| `deliverRun`、`dispatchDueAutomations`、`runRuleItem`、`configuredAutomationDispatchDeps`、`createPushTokenRouteHandlers`、`createNotificationDeliveryRouteHandler`、`prepareRuleOperation`、`runCase`、`createWorldWriter` | LOW | 见下「改了 AG15 的哪些文件」 |
| `buildEvalEnvironment`、`runHardChecks`、`handleControl` | UNKNOWN | 文本搜索确认了调用方（评测环境加载与其测试；运行器；预载脚本自己的请求入口） |

提交前 `detect-changes --scope staged`：产品提交 43 个文件、587 个符号、3 条流程，风险 medium；运行器提交 7 个文件、112 个符号，风险 low；获批记录那次 3 个文件，风险 low；都没有 `partial` 或 `truncated`。

**改了 AG15 的哪些文件**（都只加或只改一处，供 AG15 的执行者回来时对照）：

- `features/agent/automations/contract.ts`：`AgentRuleNotify.pushLocale?`、`AgentRuleSpec.toldFromVersion?`。
- `runs.ts`：`AgentAutomationPushDelivery` 多了 `skipped` 状态、`reason`、`deliveryId`、`targets`；新增编号换算、`pushHistoryLine()`；记录的更新时刻取收件箱和提醒两边较晚的。
- `delivery.ts`：收件箱写成功的那个事务里顺带写提醒的待办行；结果被取消时把等着的提醒一并记为不发。
- `dispatcher.ts`：`deps.push`（可选）、`delivery` 行里键以 `push:` 开头的交给提醒、收件箱送达后立刻发一轮、汇总多两个可选计数；算「告诉过的」时认 `toldFromVersion`。
- `dispatch-configured.ts`：接上提醒的依赖。`task-view.ts`：历史里 `push` 的几项。
- `features/agent-v1/domains/rule/ops.ts`、`apply.ts`、`graph/nodes/rule.ts`、`graph/nodes/route.ts`：见上表。
- `shared/contract/agent-v1.ts` 与 schema：AG15 块里 `push` 那一行加了可选项，文件末尾各加一块 AG16。
- 运行器：`runner.ts`、`hard-checks.ts`、`observations.ts`、`seed.ts`、`env-guard.ts`、`preload/eval-preload.cjs`。

## 假设与额外阅读

- 上下文包之外读了：AG15 的 `runs.ts`／`dispatcher.ts`／`delivery.ts`／`due-index.ts`／`task-view.ts`／`service.ts` 的更新一段、`domains/rule/*`、`graph/nodes/rule.ts`／`route.ts`、`rule/parse.ts`／`prompt.ts`（提醒要从派发器发、要从对话里开）；`delivery-policy.ts`／`delivery-policy-repository.ts`（每日上限和免打扰怎么算）；`app/api/notifications/deliveries/[id]/handler.ts` 和 App 的点开跳转；评测预载、运行器、种子；视觉稿的 AG16 部分。
- **只改提醒开关不算换了一条任务。** 开关一改任务就出新版本，按 AG15 的规矩「告诉过的不再告诉」要从新版本重新算；这样一开提醒，下一期就会把说过的活动再说一遍并且响一声。所以只改开关的那次修改会记下 `toldFromVersion`，之前告诉过的仍然算数；改条数、时间、有效期仍照 AG15 的规矩重新算。
- **用户在通知设置里关掉「更新」这一类时，这类提醒也不发**，历史里写「通知设置里关掉了这类提醒」。视觉稿只说了每日上限和免打扰，这一条是按「宁可少响」自己定的，请确认。
- 早上免打扰结束到 7:50 之间现有通知会攒成一条汇总；定时任务的提醒不参与汇总，这段时间照常发。
- 提醒发出一次，不论几台设备，按一条计入当天的自动通知数；被拒收而没有任何设备收到的不计。
- 一台设备被拒收不影响另一台；有一台送到就算送到。第一轮之后才登记的设备不补发旧提醒。
- 补送间隔 5、10、20 分钟……最长 6 小时，最多 5 轮；之后记为没送到。
- 收件箱送达后，提醒的待办行写在 5 分钟之后（派发器当场就发，这一行只是进程中途死掉时的保底），所以两个派发器不会同时发同一条。
- 订阅地址白名单：`fcm.googleapis.com`、`updates.push.services.mozilla.com`、`*.push.apple.com`、`*.notify.windows.com`，必须 https。别的地址登记时直接拒绝（接口返回 400），不会悄悄存下来。本机模拟端只在 `ORBIT_AGENT_EVAL=1` 时放行。
- 编号 `rule-push:<32 位十六进制>` 就是运行编号的那段哈希换了前缀，不另存一张表；它由工作区、账号、任务、版本、计划时刻算出，不含任何内容。
- 卡上「提醒方式」开着时的说法从「放进站内收件箱，并推送提醒」改成了「放进站内收件箱，并在手机和浏览器上提醒」（英、日同改）；关着时的说法没动。
- 历史第二行里服务端写的是「手机的通知被关了」，不是视觉稿的「这台手机」：服务端不知道是哪台设备在看。页面可用 `push.targets` 里的设备编号和本机编号比对后自己写「这台」。
- 「第一次没送出去，9:20 补送到了」里的时刻不在 `line` 里，页面用 `push.deliveredAt` 拼。

## 交接

**给做页面的执行者（提醒开关、授权几种状态、两行历史）：**

- **开关**：`PUT /api/agent/automations/<任务编号>/reminder`，请求体 `AgentScheduledTaskReminderInputContract`（`{ push: boolean; locale?: "zh" | "en" | "ja" }`，`locale` 传当前界面语言），返回 `{ data: { task: AgentScheduledTaskContract } }`；拨了就生效，不出卡。列表和详情里读 `AgentScheduledTaskContract.notify.push`（`GET /api/agent/automations` 的 `tasks`、`GET /api/agent/automations/<编号>/runs` 的 `task`）。
- **这个浏览器的状态**：`app/(app)/app/orbit-2026/account/web-push-client.ts` 的 `readWebPushState()`，返回 `WebPushState`：`not_asked`（①还没问过）、`on`（②会收到）、`blocked`（③浏览器里禁止了）、`stopped`（④允许过、后来被推送服务拒收）、`off`（允许了但在这里关掉了）、`unavailable`（这个部署没配浏览器提醒）、`unsupported`。按钮「允许这个浏览器通知」「重新允许」调 `enableWebPush()`（只有它会让浏览器弹询问）；「不在这个浏览器上提醒」调 `disableWebPush()`；页面打开时调一次 `syncWebPush()`；退出登录时调 `disableWebPush()`。它们用到的接口：`GET /api/devices/web-push`（`AgentWebPushConfigContract`）、`POST /api/devices/push-tokens`（`{ deviceId, platform: "web", permission, subscription }`）、`GET /api/devices/push-tokens/<设备编号>`（`AgentPushDeviceStateContract`，④ 看 `revokedReason: "provider_rejected"` 和 `revokedAt`）、`DELETE /api/devices/push-tokens/<设备编号>`。
- **这台手机的状态**：App 沿用现有的登记（`src/notifications/push-device-session.ts`）；服务端那一侧同样用 `GET /api/devices/push-tokens/<设备编号>`。
- **两行历史**：`GET /api/agent/automations/<编号>/runs` 的每一期是 `AgentScheduledTaskRunContract`：第一行用 `line` 和 `computedAt`；第二行用 `push`（`AgentScheduledTaskRunPushContract`）：`line`（写好的那句话，`null` 就不显示第二行）、`state`、`attempts`、`deliveredAt`、`lastAttemptAt`、`reason`（`AgentScheduledTaskPushReason`）、`targets`（`AgentScheduledTaskPushTargetContract[]`）。④ 里「11 月 6 日那期」可从历史里找 `targets` 含本机设备且 `state: "revoked"` 的那一期。
- **点开提醒**：App 不用改。网页要让收件箱认 `?tab=notifications&delivery=<编号>`：用 `GET /api/notifications/deliveries/<编号>`，取 `data.target.href` 最后一段（解码后是收件箱条目编号）选中那一条；`target.status` 是 `unavailable` 时停在列表。
- **Service Worker** 在 `public/orbit-push-sw.js`，由 `enableWebPush()`／`syncWebPush()` 注册，页面不用另外注册。
- 网页通知设置页右下那句「浏览器通知尚未开放」到时拿掉。

**后续 sprint 可以依赖的：**

- `pushRun(deps, { ownerId, runId })`（`features/agent/automations/push.ts`）：一轮提醒；`RulePushDeps` 的 `channel`、`devices`、`policy` 都可替换。`configuredRulePushDeps(storage, now)` 是产品自己的那一套。
- `setTaskReminder(service, automationId, { push, locale? })`、`ruleWithReminder()`（`reminder.ts`）；`resolveRuleReminderTarget(actorId, deliveryId)`（`reminder-target.ts`）。
- `createConfiguredWebPushAdapter(env, fetch)`、`parseWebPushSubscription()`、`webPushEndpointAllowed()`、`webPushPublicKey()`（`features/notifications/web-push-adapter.ts`）。
- 评测：`tests/agent-eval/preload/web-push-sim.cjs`（模拟浏览器的密钥和解密）；`evalVapidKeys()`。

**别的线可能冲突的文件：**

- AG15 回来做页面时：上面「改了 AG15 的哪些文件」那一批。
- AG17（要合并 AG15 的分支）、AG14、AG19：`shared/contract/agent-v1.ts` 与 `shared/api-schema/agent-v1.ts`（各在末尾加了一块；schema 那块自带一条 import）、`shared/contract/.snapshot.json`、App 的两份同步副本、`graph/nodes/route.ts`（`isRuleRequest` 里加了一句和一条 import）、`graph/nodes/rule.ts`、`package.json`／`package-lock.json`。
- 运行器：`runner.ts`、`hard-checks.ts`、`observations.ts`、`seed.ts`、`env-guard.ts`、`preload/eval-preload.cjs`、`eval/CHANGES.md`（末尾一行）。

**需要决定：**

1. AE-REF-008 在门槛运行里没过、单独跑 3 次都过：要不要给 AG11 那条行为（有一个引用读不到时，另一个有依据的部分照常回答）加代码规则，由谁加，本门槛是否重跑。
2. 真实投递检查（真实手机和真实浏览器各一条）是否授权；正式环境的 VAPID 密钥谁来生成和配置。
3. 通知设置里关掉「更新」时这类提醒也不发，是否保留。
4. `ORBIT_WEB_PUSH_SUBJECT` 是否进 CONVENTIONS §2；`web-push` 留在 3.6.7 还是升 4.0.0。
5. 只改提醒开关时保留「告诉过的」（`toldFromVersion`），改了 AG15 的一处语义，是否同意。

**回退：** 不合并，或 revert 合并提交。没有新表、没有迁移；运行记录和规则上多出的字段都是可选的。不配 VAPID 密钥时浏览器提醒整体关闭；把所有任务的开关关掉就没有任何提醒发出。

## 协调者对五项待决定的答复（2026-11-20）

本页正文由 Generator 起草，它的会话写不了报告文件，由协调者原样写入。

1. **AE-REF-008 那一次不通过**（AG11 的不变量；第一层把一句话拆开后没有回答）：按波动规则记录——单独重跑三次都通过，本门槛不重跑。「拆开之后每一部分都要有回答」这条放进第三方用例集之后的修复线（AG20）。
2. **真实投递和正式环境的 VAPID 密钥：** 需要用户单独同意，已列入待用户决定的事项。
3. **用户在通知设置里关了「动态」时提醒也不发：** 同意，和视觉稿 D16-4（受每日上限和免打扰管）是同一个原则。
4. **`web-push` 固定在 3.6.7、`ORBIT_WEB_PUSH_SUBJECT` 可选：** 同意；合并时把这个变量补进 CONVENTIONS 第 2 节。
5. **只改提醒开关时保留「已经告诉过的」**（`toldFromVersion`）：同意，打开提醒不应该把以前的结果重新告诉一遍。

界面部分（提醒开关、浏览器的四种授权状态、两行历史、提醒本身）在 AG15 的任务详情页做出来之后，由另一个 Generator 接着做。

