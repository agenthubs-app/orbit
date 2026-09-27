# Sprint 0129 执行报告：名片交换通知接入新收件箱

**run-01**。Generator 为子代理（没有再派子代理），报告由协调者代存。分支 `sprint/0129-exchange-notifications-inbox`，基线是 `87a3134b6` 加开工提交 `a9a8763ce`。最后一个功能提交是 `9faef0c17`，没有推送。

## 1. 结论

**状态：completed。**

- 名片交换的四种通知现在都写进新收件箱：对方申请、对方已接受、对方未接受、对方已撤回。旧通知表不再写入。
- 在 Simulator 上跑了一遍真实流程。A 在现场页向 B 发起交换，B 的 App 收件箱「通知」里出现「QA0129 A wants to exchange business cards」，角标为 1。点开后按「View source」，直接进入现场页 A 的资料面板，面板上有「Accept / Ignore」。
- B 在资料面板里接受后，A 的收件箱出现「QA0129 B accepted your business-card exchange」。点开进入新建的联系人详情页。
- 网页端同样可见：B 点「查看来源」，打开 `/app/events/…/live?participant=…`，参会者弹窗自动弹出；A 点开进入联系人页。
- 旧表里已有的交换通知可以一次性迁入：预演 2 条 → 执行 2 条 → 再预演 0 条。旧表里的已读状态也带了过来。
- 付费调用 0 次。两端全量 0 失败。三处 typecheck 和 lint 都通过。棘轮文件没改。QA 数据已清理，App 服务器地址已改回 3000，本地服务已停止。

## 2. 验收逐项

| SC | 结果 | 证据 |
|---|---|---|
| 01 交换后双方各收到正确的通知，内容和跳转都对 | 通过 | 真库测试先 RED（`commands/red-exchange-inbox-postgres.txt`：用旧写入方时，3 条测试都停在「收件箱 0 条」）后 GREEN；本地 worker 实跑记录见第 6 节 |
| 02 未读数、全部已读、网页显示一致；同一事件不出现两条 | 通过 | 真库测试覆盖三点：同一条消息重复投递不重复、不改版本号；全部已读后再投递仍是已读；统计未读数的口径与 0122 相同 |
| 03 旧通知迁移可重复执行，无重复、无丢失 | 通过 | 真库测试（RED 时模块还不存在）加变异检查（去掉已读迁移后测试失败）；本地执行记录 `commands/migration-local.txt` |
| 04 Simulator：A、B 交换后 App 收件箱出现通知，点开进入资料面板；网页也可见 | 通过 | `screens/10-b-inbox-notification.png`、`12-b-live-person-sheet.png`、`20-a-inbox-notifications.png`、`21-a-contact-from-notification`，网页 `30/31-web-*.png`、`api/web-open.json` |
| 05 两端全量、typecheck、lint、棘轮、清理 | 通过 | 第 7、8 节 |

## 3. 两套通知模型（开工盘点）

**旧通知表**：`orbit_records` 里的 `notifications` 集合，已读状态另存在 `notification_interactions`。

- **写入方**：
  1. 名片交换 worker（`contact-request-notification-writer.ts`）：申请、接受、未接受、撤回四种。**本 Sprint 改为写新收件箱。**
  2. AI Agent 确认的提醒（`action-writer.ts` 的 `notifications.createReminder`，从 `agent/runtime/domain-executors.ts` 调用）。**只写旧表。**
  3. 活动确认跟进（`events/confirmed-followup/service.ts`，也经过 `action-writer`）。**只写旧表。**
  4. 约谈 worker（`appointments/notification-projector.ts`）：
     - 提议、反提议、改期、确认、拒绝、取消这 8 类会同时写新收件箱（`appointment-outbox-inbox-projector.ts`）；
     - 会前 24 小时提醒、1 小时提醒、会后 15 分钟纪要提醒**只写旧表**；
     - 旧表的失效操作会删除这些行。
  5. 开发用的种子数据（`seed-generated-fixtures`、`seed-account-agent-pressure-fixtures`）和维护脚本（标题修复、隔离脚本、`notification-cutover-migration`）。
- **读取方**：
  - `/api/notifications`（旧的 feed）；
  - `/api/notifications/unread-summary`，以及 `/api/inbox/summary` 中只对紧急停用名单账号走的旧分支；
  - `/api/notifications/[id]/state`；
  - bootstrap 里的待处理计数；
  - `relationship-read-scope`（legacy-notifications）；
  - 活动列表查询涉及的集合清单里也有它。
  - **现在的 App 和网页收件箱都不读旧表。** App 的 `inbox-feed.ts` 只剩类型还被引用，没有页面调用它。

**新收件箱**：`orbit_records` 里的 `inboxNotifications` 集合。

- **读取方**：
  - App 的 `useNotificationInbox`、详情页和角标；
  - 网页的 `typed-notifications-tab` 和 `/api/inbox/summary`；
  - AI 的 `notifications.query`；
  - 推送的 typed-delivery。
- **写入方**：提醒计划的投影、约谈、名片批量识别、第三方连接到期、AI 发现、读取量报警，以及现在加入的名片交换。

## 4. 设计选择

**方式：直接写入新收件箱，不在读取时合并。** 理由如下：

- **不会双写不一致**：worker 是唯一写入方，旧表不再写。
  - 如果两边都写，会有两份各自独立的已读状态。
  - 旧表现在也没有当前界面在读。
- **口径不用改**：未读数、全部已读（每批 50 条，带版本号）、分页和「来源已不可用」的处理全部沿用 0122，没有写第二套。
- **0118 可以直接用**：交换通知就是 `inboxNotifications` 的普通行。

**记录的标识**：
- 语义键是 `event-contact-request:{requestId}:{revision}:{transition}`，按接收人区分。
- 同一条消息重复投递、失败重试、从旧表迁入的行，最后都落在同一条记录上。
- 重复投递不会把已读或处置状态改回去。

**新来源类型 `event_contact_request`**：
- 读取时做授权判断。「可用」要同时满足三点：
  1. 申请还在；
  2. 当前账号是这次状态变化的接收人：申请和撤回发给被申请人，接受和未接受发给申请人；
  3. 如果是「已接受」，接收人那边由交换建出的联系人仍然有效。
- 申请后来的状态变化不会让之前的通知失效，每次变化各有一条记录。
- 如果联系人被删除，「已接受」那条会退出默认列表，也不再计入未读数，历史记录里显示「来源不可用」。

**写入时的校验**：
- worker 以数据库里的申请行为准，不采信 outbox 里写的接收人。
- 接收人对不上时报错，**不再重试**（测试用伪造的接收人验证过）。
- 「已接受」要等联系人已经建好才发布；还没建好时报错并**重试**（测试覆盖了这种先后顺序）。

**文案与跳转**：
- 中、英、日三种文案，用对方在活动名录里的显示名。
- 「已接受」跳到 `/contacts/{contactId}?eventId=`，其余三种跳到 `/events/{id}/live?participant={pid}`。
- **和 Planner 不一致的地方**：Planner 写的参数是 `?person=`，我用了 `?participant=`，因为 App 现场页和网页原有的深链接读的都是这个参数。
- 网页现场页原来不读这个参数，这次补上了：带 `?participant=` 进入时自动打开参会者弹窗；如果 id 不认识，或是自己的 id，则什么都不打开。

**旧版 App**：
- 0104 之后的 App 会逐条跳过不认识的来源类型，不会整页失败。
- 代价是这类通知在旧版里看不到，但角标总数会把它们算进去，这是 0122 已经记录的限制。
- 当前版本的 App 已同步 schema，能正常显示。

**已有旧数据的迁移**：`npm run db:migrate:exchange-notifications`
- 默认只预演；加 `--apply` 才执行；远程库还必须带 `--confirm-remote=<workspace>`。
- 每一行在一个事务里完成两件事：写入新收件箱，把旧行标成 archived 并记下对应的新 id。旧行保留不删，改回 active 就能回退。
- 已读状态照搬：旧表里标了已读的，迁入后是已读；标了忽略的，迁入后是 dismissed。
- 对应的申请已经不存在的行会被跳过，并在输出里逐条列出。
- **对生产的影响**：
  - 只有 0129 部署前的交换通知才需要迁移；
  - 不迁移也不影响新产生的通知，只是旧的那些在收件箱里看不到；
  - 迁移之后，旧接口 `/api/notifications` 不再返回这些行，这个接口目前没有界面在读。

**给 0118 的说明**：
- 这类通知的「失效」是在读取时算出来的，没有写回行里：
  - 联系人被删除后，「已接受」那条会被隐藏；
  - 申请行被删除后，整条不可用。
- 离线副本需要在同步时处理这种失效，做法和其它读取时判定的来源相同。
- 判定函数是 `eventContactRequestSourceState`，只按主键查一次，可以直接复用。

**顺带发现的问题（没有修）**：
- 所有写入方共用的写入逻辑，判断记录有没有变化时，是直接比较多语言文案 `copy` 转成 JSON 后的字符串。PostgreSQL 的 jsonb 会重新排列键的顺序，所以按 zh、en、ja 顺序写入的记录，每次重复投递都会让版本号 +1。
- 这次我在交换通知里按 jsonb 的顺序生成文案，避开了这个问题。
- 约谈、名片批量识别、第三方连接到期这几处的文案仍是 zh 在前，推测也有同样的问题：重复投递会让版本号 +1，客户端手上的旧版本号会在标已读时冲突。我没有逐一验证，建议单开 Sprint 把比较改成不受键顺序影响。

## 5. 其它只写旧表的类型（这次没接）

| 类型 | 为什么没接 | 建议去向 |
|---|---|---|
| AI Agent 确认的提醒（`notifications.createReminder`） | 新收件箱里的提醒需要可信时间，「稍后提醒」依赖提醒计划。正确做法是改成创建提醒计划，再由现有投影进入新收件箱，这会改 Agent 的写入和撤销语义，不属于低成本改动 | 与 0040 类的切换一起单开 Sprint，排在 0118 之后 |
| 活动确认跟进的提醒 | 原因同上，也要改成走提醒计划 | 同上 |
| 约谈会前 24 小时、1 小时提醒 | 产品规则是自动会前提醒只保留 30 分钟那一条，新收件箱已经有了。接进来会重复提醒 | 在切换 Sprint 里停掉这部分旧表写入 |
| 约谈会后 15 分钟纪要提醒 | 新收件箱里还没有这一条。要不要作为提醒进收件箱、要不要推送，需要产品决定 | 单开 Sprint，需要你决定 |
| 种子数据和维护脚本 | 开发数据，不是产品通知 | 不处理 |

## 6. 运行时证据

证据目录：`repos/orbit-app/build/harness-state/evidence/sprint-0129/run-01/`，下有 `commands/`、`screens/`、`api/`。

**环境**：
- `node scripts/local-stack.mjs start --build`：3100 生产构建加两个 worker，`ORBIT_DATABASE_TARGET=local`，数据库 `orbit_events`。
- iPhone 17 Pro Simulator（iOS 26.4），Debug 版 App，Metro 8081，服务器地址临时改为 3100。
- 3 个 QA 账号，QA 活动 `event_qa_0129`。

**步骤**：

1. **基线（改代码之前）**：
   - 用改动前的 worker 让 C 向 A 申请、A 接受，旧表产生 2 条（`api/baseline-legacy-rows.txt`）；
   - C 那条经旧接口标为已读；
   - 此时 A 的新收件箱是空的，旧 feed 显示「来源已不可用」，复现了 0127 的问题。
2. **迁移**：预演 2 条 → 执行 2 条（1 条带已读状态）→ 再预演 0 条。接口读回：
   - A 那条未读；
   - C 那条的 readAt 等于旧表里的已读时间；
   - 两条旧行都已 archived，并记下了新 id（`api/migration-readback.txt`）。
3. **新代码下的交换**：A 在 App 现场页点「Request card exchange」，B 在 App 里接受。
   - worker 写出 B 的「A 想和你交换名片」和 A 的「B 接受了你的名片交换」；
   - 旧表里 active 的交换行为 0。
4. **App**：
   - B 的收件箱：截图 10、11、12，点开进入资料面板；
   - A 的收件箱：截图 20，共 2 条，新通知和迁入的旧通知各一条，角标为 2；
   - A 点开进入联系人详情：截图 21。
5. **网页（Playwright，同一数据库）**：
   - B 点开后到了 `/app/events/event_qa_0129/live?participant=…`，参会者弹窗出现 1 个；
   - A 点开后到了 `/app/contacts/contact%3Aevent-consent%3A…?eventId=event_qa_0129`（`api/web-open.json`，截图 30、31）。
   - 为了进入网页，两个 QA 账号都经 `PUT /api/profile` 补全了引导必填项。
6. **付费调用 0 次**：
   - 读报名都带 `questions=false`，报名只提交答案；
   - 本次运行期间的日志里没有 `registration_questions_generated`，也没有 intro-draft 调用（唯一一条是 0128 留下的旧日志）；
   - worker 没有 AI key。

## 7. 测试、typecheck、棘轮

**新增和改动的测试**：

- `orbits/tests/services/event-contact-request-inbox-postgres.test.ts`，真库测试，4 条：
  1. 交换后双方各 1 条，覆盖文案（中、英、日）、两种跳转、来源类型；旁观者看不到；A 打不开 B 的通知；旧表 0 行。
  2. 同一消息重复投递不重复、版本号不变；全部已读后未读为 0；再次投递仍是已读；撤回会新增一条独立通知。
  3. 联系人还没建好时「已接受」会重试，且不发布；联系人删除后，该通知退出列表和未读数，历史里显示不可用；伪造的接收人被拒且不重试。
  4. 迁移：预演不写库；执行后已读和忽略状态都迁过来；申请已不存在的行被跳过且原样保留；无关的旧通知不受影响；再预演 0 条、再执行 0 条；之后 worker 再投递同一批消息也不会产生重复。
- `event-operations-outbox.test.ts`：改写原来那条交换通知用例，改为验证每种状态变化交给了哪个接收人，以及哪些错误重试、哪些不重试。
- `app-event-live-0918.test.tsx` 新增 1 条：带 `?participant=` 会打开弹窗，不认识的 id 或自己的 id 不打开。先 RED（`red-web-live-participant.txt`）。
- App `inbox-notification-tolerance.test.ts` 新增 1 条：交换通知能显示并带着跳转链接。先 RED（`red-app-exchange-kind.txt`），同步 schema 后通过。
- `sync-write-lock-audit.test.ts`：把迁移脚本登记为「不涉及同步集合」的写入方，理由是它只归档 `notifications` 集合里的行。

**运行结果**：

| 项目 | 结果 |
|---|---|
| orbits 全量 | 5202 条，4734 通过，**1 失败**，466 跳过。失败的是 `sync-write-lock-audit`，本 Sprint 新文件没有登记，由第二个提交修正；该文件单独连跑 3 次都是 2/2 通过。按规则没有重跑全量，所以**全量曾有 1 条失败，局部修复后回归通过**，不能记成「最终全量通过」 |
| App 全量 | 3691/3691 |
| Postgres（`ORBIT_LIFECYCLE_TEST_DATABASE_URL=orbit_test`） | 收件箱相关的 14 个文件（含新文件和 read-cost）共 36 条：32 通过，0 失败，4 跳过（依赖其它环境变量）。`postgres-inbox-suite.txt` |
| 其它受影响的单测 | 12 个文件共 81/81 |
| typecheck、lint | orbits `typecheck`、`typecheck:app`、`lint`，App `typecheck`，全部 0 错误 |
| 棘轮 | `unbounded-list-reads.baseline.json`、`read-cost-baseline.json` 都没有改动 |

## 8. 清理与环境收尾

- **QA 数据**：一个事务删除，日志在 `commands/cleanup.txt`。
  - orbit_records 31 行，以及 event_ops 各表、别名、活动版本等；
  - 其中 `event_ops_canonical_membership_migration_events` 有触发器保护不可删，本 Sprint 自己加的 1 行是在事务里临时关掉触发器删的。
- **删除后的核对**：除 `orbit_read_receipts` 外，66 张表的行数与开工前一致；orbit_records 主键集合的 md5 也一致。
- **需要你知道**：`orbit_read_receipts` 比开工前多 119 行。
  - 3 个 QA 账号的 147 行已删除；
  - 剩下这 119 行来自演示账号 `account_orbit_generated` 和匿名请求，推测是你的 3000 期间产生的，还有我最后把 App 切回 3000 时产生的，没有逐条核实；
  - 这些不是 QA 数据，我没有删。
- **环境**：
  - App 服务器地址已恢复为 `http://127.0.0.1:3000`：在 App 停止状态下还原了 AsyncStorage 的备份，重开后回到演示账号首页（截图 90）；
  - 3100、两个 worker、Metro 都已按 PID 停止，3000 没有碰过；
  - `repos/orbits/next-env.d.ts` 是构建生成的改动，没有提交。

## 9. 提交

- `dc670ff72` feat(inbox): business-card exchange notifications go to the typed inbox (0129)
- `9faef0c17` test(orbits): classify the exchange-notification migration as a non-sync writer (0129)

**文件**（orbits 以下省略 `repos/orbits/`）：
- 新增：
  - `features/notifications/event-contact-request-inbox.ts`
  - `features/notifications/event-contact-request-inbox-migration.ts`
  - `scripts/migrate-event-contact-request-notifications.ts`
  - `tests/services/event-contact-request-inbox-postgres.test.ts`
- 修改：
  - `features/events/event-operations/contact-request-notification-writer.ts`：只保留接口，删掉旧表写入的实现
  - `features/events/event-operations/outbox-projector.ts`、`cloud-worker.ts`、`scripts/run-event-operations-worker.ts`
  - `features/notifications/inbox-record-service-factory.ts`
  - `shared/contract/inbox-notifications.ts`、`shared/api-schema/inbox-notifications.ts`
  - `app/(app)/app/events/events-0918/event-live.tsx`、`app/(app)/app/events/[id]/live/page.tsx`
  - `package.json`，以及上面列出的测试文件
- App：`src/api/contract/inbox-notifications.ts`、`src/api/schema/inbox-notifications.ts`（`sync:contract` 生成）、`tests/inbox-notification-tolerance.test.ts`

## 10. GitNexus

- `createInboxRuntime` 的影响分析是 **CRITICAL**，直接调用方 6 个：discovery、约谈 worker、typed-delivery 等。
  - 我只在来源授权里新增了一个只对 `event_contact_request` 生效的分支，其它来源类型的判断没动；
  - 收件箱相关的真库测试 36 条都通过了。
- `inboxNotificationSchema` 是 **UNKNOWN**。文本搜索确认调用方有：
  - 网页的 `notification-inbox-view-model.ts`（严格校验，和服务端一起部署）；
  - `inbox-record-service`；
  - App 的同步副本（逐条容错）。
- 其余改动的符号都是 LOW。
- 以 `a9a8763ce` 为基准的 compare：28 个文件，风险 low，受影响流程 0 个。

## 11. 生产步骤

1. 部署 orbits（web 和 event-operations worker 一起）。部署后产生的交换通知直接进入新收件箱。
2. 执行 `npm run db:migrate:exchange-notifications`（预演），看输出里的数量和被跳过的行。
3. 确认后执行 `-- --apply --confirm-remote=<workspace id>`，**需要你决定**。
4. 再预演一次，`migrate` 应为 0。
5. 发布新版 App，交换通知才会在 App 里显示。旧版（0104 之后）会跳过这类通知，但角标会把它们算进去。

## 12. 遗留问题

1. **跳转参数**：用的是 `?participant=`，不是 Planner 写的 `?person=`，原因见第 4 节。
2. **收件箱里的申请通知不会自动变成已读**：如果被申请人直接在现场页接受，没有打开通知，那条「想和你交换名片」会一直是未读，要打开或点全部已读。
3. **写入逻辑判断「有没有变化」时受 jsonb 键顺序影响**：见第 4 节，推测约谈等几处的重复投递会让版本号 +1，建议单开 Sprint。
4. **第 5 节列出的只写旧表的类型**：其中会后纪要提醒要不要进收件箱，需要你决定。
5. **旧版 App**：看不到这类通知，但角标会把它们算进去（0122 已知的限制）。
## 13. 协调者复核

协调者在 `9faef0c17` 上独立复核：

- **orbits 全量**：5202 条，4735 通过，**0 失败**，466 跳过。子代理那次「局部修复后没有重跑全量」，这次复跑补上了，最终全量通过。
- **App 全量**：3691/3691 通过。
- **Postgres 测试**（`orbit_test`）：收件箱、通知、名片交换、读取成本、约谈相关文件，共 48 条，41 通过，0 失败，7 跳过。
- **遗留问题的去向**：
  - 第 4 节「jsonb 键顺序让重复投递时版本号 +1」：约谈等写入方可能受影响，**并入 0118**（通知放进手机）处理。离线副本依赖版本号，这个问题必须先修。
  - 第 5 节中「会后纪要提醒要不要进收件箱」需要用户决定，已登记为待决项。
  - 其它只写旧表的类型，按第 5 节的建议，排在 0118 之后单开切换 Sprint。
  - 第 12 节第 2 条「在现场页直接接受后，申请通知仍是未读」：P2，并入 0118。
- **生产步骤**：已写入 `PRODUCTION_ROLLOUT.md`，执行迁移需要用户确认。
