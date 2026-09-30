# Sprint 0109 执行报告：用户之间的消息改用三张专用表（消息 M2）

**run-01。** Generator 为子代理（没有再派子代理），报告由协调者代存。分支 `sprint/0109-message-tables`，基线 `b6acd1119` 加开工提交 `fa36f3c7a`，没有推送。
**状态：completed。** 所有 SC 都有同一版本的证据。第 9 节列了几处有意改变的行为，需要你知道。

## 1. 结论

- **三张表**：
  - `relationship_conversations`：绑定已并入这张表。
  - `relationship_conversation_members`：已读状态并入这张表，并建了收件箱索引（账号, 最新消息时间）。
  - `relationship_messages`：主键是（对话, 序号）。消息编号沿用原来的 digest 算法并设唯一约束，去重靠它。
  - 邀请和回复草稿仍留在万能表。
- **写入**：接受邀请、发送、已读、撤销，每一种都在一个 read committed 事务里完成。事务先取 0108 的提交顺序锁，再锁对话行。
  - 发送时序号加一、插入消息，再更新两行成员：发送人读到这一条，对方未读 +1。
- **读取**：
  - 收件箱列表走成员索引，消息翻页走主键，未读数是本人各成员行未读数之和。
  - 通知投递（包括候选挑选）和 AI 发现都改为只经过本人的成员行读新表。
  - 所有路由的响应形状不变。消息游标的格式也没变，所以切换前发出的游标仍然能用。
- **撤销**：对话状态改为 revoked，两行成员标为 left。双方的列表、未读数、消息、草稿接口都不再返回这个对话。服务器上的对话、成员和消息都保留。
- **搬迁**：新增 `npm run db:migrate:relationship-messages`，默认只预演，加 `--apply` 才执行，可以重复执行，旧集合只读不改。
  - 本机开发库 `orbit_events`：预演 create 1 → 执行 → 再预演 create 0。现在是 1 个对话、2 行成员、1 条消息。
- **最后两处读旧集合已清掉**：profile-signal 不再读 `messages`，审计不再读 `conversations`。
- **读取棘轮**：162 → 157（−5）。

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 规模 | 通过 | `relationship-message-scale-postgres.test.ts`：造了 100,060 行成员（10 万用户）、50,030 个对话、256,200 条消息，其中探测对话有 5,040 条。执行计划：<br>• 收件箱列表和未读数走 `relationship_members_inbox_idx`<br>• 消息翻页走 `relationship_messages_pkey` 倒序扫描<br>• 三个查询都没有对成员表或消息表做全表扫描<br>中位耗时从 1000 用户到 10 万用户：列表 1.14→1.05ms，未读 0.29→0.22ms，翻页 0.76→0.68ms。EXPLAIN 全文见 `commands/scale-100k.txt` |
| 02 去重、并发 | 通过（先 RED） | • 同一个 requestId 发两次只存一条，下一条序号是 2；同一 requestId 换内容返回 409<br>• 两人同时各发 50 条，序号正好是 1–100；成员行的未读数和重新计数一致；并发重放 100 次后仍是 100 条 |
| 03 未读、撤销 | 通过（先 RED） | 未读数等于对方发来且未读的条数，打开后归零，自己发的不算；把已读位置指回旧消息时会重新计数。撤销后见上文，另外带旧资格版本号发送返回 409 |
| 04 隔离、形状不变 | 通过（先 RED） | **新旧对照**：用旧代码录下 46 个路由响应和旧集合里的 20 行数据。新代码把这些行搬进新表后，同样 46 个请求经同样的路由处理器返回，内容逐一相同（只排除时间戳 asOf/refreshedAt）。第三个账号在任何接口都拿不到对话，也写不进任何东西。App 和网页没有改动 |
| 05 棘轮、搬迁、真机、全量 | 通过 | 棘轮 −5；搬迁可重复执行（测试和 CLI 都验证过）；phoneweb 与 Simulator 两个账号互发、草稿、已读、撤销（第 6 节）；全量结果见第 5 节 |

**RED 记录**：`commands/red-message-tables-postgres.txt`。把改动过的 10 个产品文件换回 HEAD 版本后运行，9 条里 8 条失败。原因是旧代码不建新表（报 relation does not exist），也没有序号和成员状态。草稿那条在旧代码上也通过，因为它本来就是回归保护。

**新增和改写的测试，各证明什么：**

- `relationship-message-tables-postgres`，9 条：
  - 与旧代码逐项对照；
  - 搬迁可重复执行，旧行不被改动，旧代码迟到写入的消息只追加一次，坏数据会列入跳过；
  - 去重、并发、未读、0122 的草稿语义、撤销、隔离；
  - 不取锁直接写新表会被拒绝（55P03）。
- `sync-write-lock-audit` +2：所有写新表的文件都必须登记并取锁。自测里造了未登记、未取锁、语句变多、登记已失效四种反例，都会被报出。
- `notification-discovery-message-postgres`：AI 发现读取消息需要授权；作者是真实发送人；扫描只覆盖本人的对话；撤销后读不到。
- `typed-notification-source-postgres`，改为测试库：已读状态、撤销、错误的版本号或对话，都能正确拦住。
- 原来用内存存储的测试（capability 7 条、routes、live-store）改用真库，断言保持不变。
- bounded-reader、unread-summary、inbox-summary、materialize：改用新表，并验证其他账号的数据增长时读取成本不变。
- profile-signal 两个测试文件、审计测试：旧集合里照样有种子数据，但证明它们不再被读取。

## 3. 设计取舍

- **流水号：同时取锁、并沿用同一条序列和严格触发器。**
  - 三张表都从 `orbit_records_sync_revision_seq` 取号。触发器要求事务已持有 0108 的同一把锁（同一个锁键），否则报 `SYNC_WRITE_LOCK_REQUIRED`。
  - 理由：0119 放进手机时要靠成员行的流水号挑行。如果提交顺序没有保证，设备可能漏掉一条消息，或者漏掉「我已离开这个对话」。
  - 代价：发送、已读、接受邀请会和笔记、待办、日程写入一起排队，锁只持有几毫秒。
  - 为什么用 read committed：取锁之后的每条语句都要能看到等待期间别人提交的序号。serializable 的快照在等锁之前就已经取好，第二个发送者会遇到序列化失败。为此给共享的 `transaction()` 加了可选的 `isolation` 参数，默认行为不变。
- **兼容旧游标**：消息游标还是（sentAt, messageId），服务端按 messageId 查出它的序号再翻页。所以切换前客户端手上的游标仍然有效。
- **`GET conversations/[id]` 改为有上限**：只返回最近 200 条，更早的走 `/messages` 翻页。App 和网页都不调用这个接口。
- **两处有界的点查**：
  - 邀请状态：只查本人发给这个联系人的最近 50 条邀请。
  - 联系人解析：按 `payloadId` 和本人查，最多 2 条。
- **为什么先建空表**：你在 3000 端口的 dev server 直接运行这个工作区的代码。改代码之前，我先在 `orbit_events` 上建了空表（只加表，旧代码不受影响），避免 dev server 的消息接口报错。数据搬迁是在代码提交、测试通过之后才执行的。

## 4. 提交与文件

- `057ae72ad` feat(orbits): relationship messages move to three dedicated tables (0109)
- `8a8dfcb0d` test(orbits): migration step count includes the message tables; parity test pins live mode (0109)（最后一个功能提交）

**新增文件**：
- `features/relationship-communication/message-tables.ts`、`message-store.ts`、`message-migration.ts`
- `scripts/migrate-relationship-messages.ts`
- 测试辅助：`tests/support/relationship-message-harness.ts`、`relationship-parity-scenario.ts`
- 新旧对照数据：`tests/fixtures/relationship-message-parity.golden.json`
- 3 个新测试文件

**修改文件**：
- 关系沟通模块：service、service-factory、bounded-reader、unread-summary、read-service
- 通知：typed-delivery-source、typed-delivery-factory、discovery/source-adapters
- 清理旧集合读取：profile-signal provider、audit provider
- 共享存储：`shared/storage/migrations.ts`（新表迁移放在最后一步）、`transactional-postgres.ts`
- `package.json`（新增 npm 命令）、棘轮基线、写入审计及相关测试

工作区剩余的未提交内容：`next-env.d.ts`（构建生成）、你原有的 codex-review.md 文件、`.claude/skills/gitnexus/`、`output/`。

## 5. 全量、Postgres、typecheck、棘轮

- **orbits 全量**：5214 条，4727 通过，**1 条失败**，485 跳过，1 条 todo（已知的 0112 登记项）。
  - 失败的是 `postgres-live-record-storage` 里的「migration can run through an async SQL client」。原因是本 Sprint 给迁移多加了一步，断言里的步骤数过期了。已修（`8a8dfcb0d`），该文件单独跑 5/5 通过。
  - 按规则没有重跑全量，所以这里如实记作「全量曾失败 1 条，局部修复后回归通过」。
  - 跳过数从 457 增加到 485，主要是原来用内存存储的关系沟通测试改成真库测试，默认全量里会跳过。
- **App 全量**：3718/3718 通过。
- **Postgres 环境**（`ORBIT_LIFECYCLE_TEST_DATABASE_URL=…/orbit_test`）：
  - 19 个文件共 69 条：67 条通过，1 条 todo，另 1 条是对照测试。它在未固定 feature mode 的环境下失败，是因为错误信封里会带上当前模式。已改为在测试里固定为 live，之后连续两次 9/9 通过，在 mock 环境下也通过。
  - 另外，discovery-worker 的 3 条测试在 orbit_test 上通过。
  - 规模测试需要额外设置 `ORBIT_RELATIONSHIP_SCALE_USERS=100000`，已通过。
- **typecheck**：`typecheck`、`typecheck:app`、App 的 `typecheck` 都是 0 错误；`lint` 通过。
- **棘轮**：162 → 157。
  - relationship-communication 的 service.ts 3→0、service-factory.ts 1→0，profile-signal 7→6。
  - 审计文件的计数还是 1：它只有一个 `limit: "unbounded"`，在所有集合的循环里共用，去掉 conversations 后计数不变。

## 6. 运行时证据

证据目录：`repos/orbit-app/build/harness-state/evidence/sprint-0109/run-01/`，下有 `commands/` 和 `screens/`。

**环境**：
- `local-stack start --build`：3100 本地生产构建加两个 worker，连本机库 `orbit_events`。
- phoneweb：重新导出的 App 网页版，端口 32109，转发到 3100。
- iPhone 17 Pro Simulator：Debug 版 App，Metro 8081，服务器地址临时改为 3100。
- 两个 QA 账号：A 用 phoneweb，B 用 App。

**流程**：
1. 通过真实 HTTP 建联系人、发邀请、B 接受。新表里生成 1 个对话和 2 行成员，流水号为 14816–14818。
2. **A 在 phoneweb**：
   - 保存草稿，重开页面后草稿读回；
   - 发送后，服务端把草稿清空（0122 语义）。
   - 截图 01–04。
3. **B 在 App**：
   - 收件箱显示「Messages 1」，列表项带未读 1（截图 14）；
   - 打开对话后，未读数接口返回 0；
   - 保存草稿，接口读回；
   - 回复。表里第 2 条序号为 2，B 的 read_seq=2，A 的未读为 1（截图 15–17）。
4. **A 在 phoneweb**：看到未读 1 和预览，打开后未读归零（截图 05–06）。
5. **A 撤销**：
   - 双方的 summaries 都为空，未读都是 0，消息接口 404；
   - B 用旧资格版本号发送返回 409；
   - 表里状态为 revoked、两行成员 left、2 条消息保留；
   - App 和 phoneweb 的收件箱都显示暂无消息（截图 18、08）。
6. **3000 端口**：用 B 的会话做了认证冒烟，三个消息接口都返回 200。dev server 全程没有被停过。

**收尾**：
- Simulator 的服务器地址已改回 `http://127.0.0.1:3000`（截图 19）。
- Metro、phoneweb、local stack 都按 PID 或端口停掉了。现在只剩 3000 在监听。
- QA 数据在一个事务里删除：`orbit_records` 11 行、新表 1/2/2 行、两个账号的读取小票 170 行，残留 0。
- 前后库行数对照：只有 `orbit_read_receipts` 多了 50 行，来自 3000 上演示账号的正常使用和匿名的注册/登录请求，没有删除。
- **付费调用**：0 次。没有点「润色草稿」，也没有走 onboarding。

## 7. GitNexus

- `createStorageProfileSignalProvider`：**HIGH**。只删掉了读 messages 的那一处，两个测试文件已更新。
- `runOrbitRecordsMigration`：MEDIUM，只在最后追加一步。
- 其余改动的符号都是 LOW。`createConfiguredRelationshipCommunicationService` 等几个符号的影响分析结果为空；我用文本搜索确认了调用方：只有 handler 和 read-handler 调用。
- detect-changes（staged 和相对 `fa36f3c7a` 的 compare）：low，没有受影响的执行流程。

## 8. 生产步骤（需你确认，我没有碰生产）

**① 只读查行数**：

```sql
select collection_name, lifecycle_state, count(*) from orbit_records
 where workspace_id = '<生产 workspace>' and collection_name in (
  'relationship_communication_bindings','relationship_communication_conversations',
  'relationship_communication_messages','relationship_communication_reads',
  'relationship_communication_invitations','relationshipConversationDrafts')
 group by 1,2 order by 1,2;
select to_regclass('relationship_conversations'), to_regclass('relationship_messages');
```

也可以用 `npm run db:migrate:relationship-messages`（不带 `--apply`）。它只打印各项计数，不写库。

**② 执行顺序**：

1. 建表：`npm run db:migrate:live`，或者在第 3 步用 `--apply` 自动建表。只加表，旧代码不受影响。
2. 预演，看 create 和 skipped 的数量。
3. `-- --apply --confirm-remote=<workspace>`。
4. 再预演一次，create 应为 0。
5. 部署新代码。
6. 再预演。如果部署窗口里旧实例还写过消息，会显示 appendedMessages > 0；再执行一次 `--apply` 追加进去，重复到 0 为止。
7. 冒烟：列表、发送、已读都要验证。

**顺序不能反过来**：新代码只读新表，表不存在时消息接口会返回 503。

**回滚**：可以重新部署旧代码，旧集合一直没动过。但切换之后发出的消息只存在新表里，旧代码看不到。旧集合什么时候删除，另行决定。

## 9. 需要你知道的事

1. **有意改变的行为（按 PLANNER 执行）**：
   - 自己发一条消息，就算读到了这一条。旧代码里，没打开对话就直接回复时，对方之前发来的消息还算未读；现在归零。
   - profile-signal 不再根据旧 chat 消息给出「寻找」建议，旧数据来源在 0104 之后已经不存在。
   - 审计报告里的 chat_summary 固定为 0 条。
2. 全局的提交顺序锁现在也覆盖消息的发送、已读和接受邀请，和笔记、待办、日程写入一起排队。这与 0108 的取舍相同。
3. 棘轮基线里有两处实际计数已经比登记值低，都不是本 Sprint 改的：`contact-live-record-provider` 实际 3、登记 4，`personal-schedule/service` 实际 1、登记 2。我没有下调它们。
4. 网页版（Next）收件箱在运行时没有截到图：新注册的账号会被重定向到 onboarding。网页消费方由现有测试覆盖，phoneweb 已经完整走过全流程。
5. 在 Simulator 里第一次保存草稿时，正文被截成了「Thursday 3pm works f」。这是测试驱动 idb 输入还没完成就点了保存，第二次保存正确。它不是产品问题，我如实记录。
6. 小的遗留，都没有改：
   - 两个 handler 里读取预算闸门的标签还写着旧集合名，只是一个标签；
   - `LIVE_IMPLEMENTATION.md` 没有更新；
   - `orbit_events` 里的旧集合行保留着，本来就要保留；
   - 0119 需要的「按账号取流水号」索引没有预先建，留给 0119 决定。

## 10. 补充：协调者复核发现的 2 个 Postgres 测试失败

两个测试失败的原因相同，我修了代码，也补了测试环境，提交是 `886220528`。按你要求，把受影响模块的全部真库测试文件跑了一遍，结果干净。

**原因**
- `historical-inbox-delivery-postgres` 和 `typed-delivery-cutover-offsets-postgres` 是手工建表的：只执行了 `ORBIT_RECORDS_SCHEMA_SQL`，没有按 `db:migrate:live` 的方式建三张消息表。
- 回答你的问题：**是的，即使这一页全是普通通知，`materialize()` 在处理完通知页之后也一定会查成员表和消息表。** 0109 之前它同样每次都会扫消息，只是查的是万能表，所以不依赖新表。
- 这不是有意设计的：库里没有新表时，整次 materialize 会报 42P01 失败。结果是这个账号的通知候选也发不出去，通知游标也保存不了。

**修复**
- **代码**（`typed-delivery-factory.ts`）：只在错误码是 42P01（表不存在）时容忍。
  - 通知候选照常生成。
  - 消息候选跳过，并记录一条 `typed_delivery_message_tables_missing` 日志。
  - 消息游标保持原值，等表建好后再补上。
  - 其他任何错误仍然让这次运行失败。
- **生产顺序不变**：仍然先迁移、再部署。这次改动只是让「还没迁移」时的通知投递不被连带停掉。
- **测试环境**：两个测试改为同时建消息表，和生产的建表方式一致。原有断言一条没改。
- **新增测试**：「缺少消息表时通知照常」。
  - 在上一个提交的 factory 上运行会失败，报 42P01，记录在 `commands/red-missing-tables.txt`。
  - 修复后通过：返回 `{notifications:0,messages:0}`，消息游标保持原值，也记了日志。

**测试结果**
- 用 grep 找出所有涉及通知投递 / 收件箱物化 / 关系沟通读取 / 迁移、并且需要 Postgres 环境的测试，共 44 个文件，清单在 `commands/pg-affected-files.txt`。命令：
  ```
  cd repos/orbits && ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://localhost:5432/orbit_test \
    npx tsx --test --test-concurrency=1 $(cat …/commands/pg-affected-files.txt)
  ```
  结果：**171 条，150 通过，0 失败，21 跳过。** 跳过的是需要 `ORBIT_EVENT_DATABASE_URL` 的测试。
- 另外把 `ORBIT_EVENT_DATABASE_URL` 也指向 orbit_test 跑了一遍，那 21 条都执行了：171 条，167 通过，3 失败，1 跳过。3 条失败都与本 Sprint 无关：
  - `event-core-backfill-command` 和 `business-card-batch-schema`：是我对整批测试强行设置这个变量引起的。不设时它们都通过。
  - `agent-run-trace-postgres` 的「pre-0103 behaviour」：本来就不稳定。把 migrations.ts 换回 0109 之前的版本，跑 6 次也失败了 2 次。
- 两个原本失败的文件，加上 materialize 测试文件：8/8 通过。
- 写入审计和读取棘轮：7/7 通过。typecheck 0 错误。GitNexus detect-changes 为 low，没有受影响的执行流程。

现在最后一个功能提交是 `886220528`。
## 11. 协调者复核

- **在 `8a8dfcb0d` 上**：orbits 全量 5214 条，0 失败；App 全量 3718/3718 通过。
- **扩大范围跑 Postgres 测试时发现 2 条失败**：`historical-inbox-delivery`、`typed-delivery-cutover-offsets`，报错 42P01（缺成员表）。子代理挑的测试范围没覆盖这两个文件。退回子代理修复，见第 10 节。
- **在 `886220528` 上复核**：
  - orbits 全量 5215 条，4728 通过，0 失败，486 跳过。
  - 受影响的 44 个 Postgres 测试文件（清单在 `commands/pg-affected-files.txt`）：171 条，150 通过，0 失败，21 跳过。
  - App 代码在修复中没有改动，沿用上面的全量结果。
- **本机开发库**：三张新表分别是 1/2/1 行，没有空流水号。3000 服务器正常。
- **第 9 节第 3 条**（棘轮基线里有两处登记值偏高）：交给 0112 下调。
- **第 9 节第 6 条里「0119 需要按账号取流水号的索引」**：交给 0119 决定。
- **生产步骤**：已写入 `PRODUCTION_ROLLOUT.md`，须先迁移再部署；行数查询和搬迁都需要用户确认。
