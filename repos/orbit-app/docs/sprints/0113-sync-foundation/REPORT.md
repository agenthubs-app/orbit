# Sprint 0113 执行报告：同步地基（断网第 0 期上半）

**run-01。** Generator 为子代理（没有再派子代理），报告由协调者代存。分支 `sprint/0113-sync-foundation`，基线 `cbd09c5fe` 加开工提交 `ee61e7d75`，没有推送。

**状态：completed。** 有两点要先说清楚：
- **orbits 全量：** 收口时跑出 1 条失败，是我自己新加的主人审计测试。它拦下了我后来新增的一处 reassign 调用，还没登记进清单。登记后该文件 3/3 通过，按规则没有重跑全量。
- **Simulator 上的「注册表升级重建」：** 看到了重建，但分不清原因是注册表升级还是纪元轮换（第 7 节）。

## 1. 结论

**通用 upsert 不再清空主人（SC-02）：**
- 更新不传主人时（省略或 null），保留原主人。
- 没有主人的行，可以赋上第一个主人。0114 补写主人要用这条。
- 传入另一个主人时拒绝，报 `LIVE_RECORD_OWNER_CONFLICT`，不再悄悄转手。
- 显式改主人走新接口 `reassignRecordOwner`：
  - 同步类别必须提供已登记的处理方式，目前登记清单为空，所以一律拒绝；
  - 非同步类别可以改，但要带上预期的原主人。
- 内存版 store 行为一致。
- 另外 3 处 `user_id = excluded.user_id` 同样处理了：约定提醒投影、见面投影、`scripts/sync-cloud-records`。
  - 同步脚本遇到主人冲突时跳过这一行、列出来，并以非零退出码结束。

**主人/身份检查（SC-03）：两层。**
- **数据库层：** `orbit_records` 上加了守卫触发器。凡是把已注册类别（含附属类别）的有主人行改成别的主人、清空主人、或移出集合，都报 `SYNC_OWNER_CHANGE_UNREGISTERED`。产品代码、批量脚本、临时手写 SQL 都会被拦。
- **静态审计：** 在默认全量里运行，扫描 `app/features/shared/scripts/lib` 下所有给主人或可见性字段赋值的语句，以及所有 `reassignRecordOwner` 调用。
  - 扫描规则从注册表推出来，所以 0115 新加类别会自动纳入。
  - 现有 8 个写入方都登记了分类，每一类都有文本核验。
  - 只凭文本无法核验的两处：两个写 `events` 的文件用了参数化的集合名，归为「非同步类别」，靠人工核实（第 9 节）。

**注册表 v2（SC-01）：**
- 每个类别声明 ownership、visibilityInputs、attachments、fields（下发字段白名单）和 source（万能表或专用表）。页面只发白名单里的字段。
- 版本号升到 2，generation 和游标随之变化。
- 三类现有数据的双账号测试和改前结果一致。

**专用表流水号（SC-04）：**
- 5 张活动表加了 `sync_revision`：events、configuration_heads、membership_heads、admission_application_heads、publication_heads。
- 和万能表、消息表共用同一条序列和同一把提交顺序锁，触发器是严格版，不取锁就报 55P03。
- 所有写入方都在事务开头取锁，写入锁审计已扩展到这几张表。
- 探针类别 `probe-event-memberships` 从 membership_heads 读取，不下发给任何账号，已跑通：首次全量 2 行 → 改一行只传 1 行 → 再同步 0 行。

**App：**
- **按租约同步：** 同步哪些类别由服务器租约决定，再用 `KNOWN_SYNC_DOMAINS` 和平台白名单收窄；未知类别直接忽略。
- **原生端一台设备只保留一个身份（来自 0130）：** 打开某个身份时，删除本机其他身份的库文件和密钥。每次删除前先写入待清理标记；删到一半失败时拒绝打开新身份，下次启动会补完。0130 的挂起/恢复行为不变。

**付费调用 0 次。**

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 三类行为不变；App 重建时不丢待上传 | 通过 | 真库：拓扑、租约、提交顺序测试改前 21/21（`baseline-sync-postgres.txt`），改后同一批加迁移测试 28/28。新增「v1 注册表的书签被拒（409）→ 全量重拉结果相同」。App：「注册表版本变化 → 三类各从头拉一次；待上传行保持 pending 且内容不被覆盖；outbox 不动；之后没变化就 0 页」。phoneweb 两个账号：租约是三类、manifest registryVersion=2，断网三类都显示「截至」 |
| 02 upsert 不清主人；显式接口；4 处同类写法 | 通过（先 RED） | `live-record-owner-postgres` 8 条。改前 7 条失败（`red-live-record-owner.txt`），改后 8/8 |
| 03 产品代码和批量脚本改主人都被拦下 | 通过（先 RED） | 静态审计的自测：故意写的产品代码、批量脚本（注释里有 where 也藏不住）、专用表脚本全部被报出。去掉数据库守卫后，守卫测试 2 条失败（`red-sync-owner-guard.txt`）。把两处旧写法换回去，审计报 `OWNER_OVERWRITE`（`red-sync-owner-audit-old-writers.txt`）。本机开发库 `orbit_events` 上改笔记主人被拒（`orbit_events-guards.txt`） |
| 04 专用表领号并保证提交顺序；探针类别增量同步 | 通过（先 RED） | `event-sync-revision-postgres` 7 条。把 3 个写入方换回旧版后，5 条报 `SYNC_WRITE_LOCK_REQUIRED`（`red-event-writers-unlocked.txt`）。并发测试：第二个写入方要等第一个提交。对照组：没有锁时，书签会漏掉先领号的那一行 |
| 05 读取成本、棘轮、全量、typecheck | 通过（全量见第 5 节） | 棘轮文件没有改动。三类数据没有新增查询。manifest 条件读的键加上了注册表版本，所以升级后不会回放旧的 manifest |

## 3. 设计取舍

- **传入另一个主人时拒绝，而不是悄悄保留旧主人：** 失败要看得见。
  - 全量测试里暴露出唯一依赖「upsert 转手」的产品代码：演示种子 `buildDemoOrganizerProjection`，会把 organizers 转给规范登录账号。
  - 已改为显式调用 `reassignRecordOwner`，organizers 不是同步类别。
  - 其余约 20 个测试夹具原本用 upsert 把生成数据「改主人」。改为用 `writeAsOwner`（显式接口）；涉及同步类别的夹具，改为从一开始就按正确主人播种。
- **锁键改用 `to_regclass`：** 只有活动表的测试库里没有 `orbit_records`，改后这些库里写入方也能取锁。只要 `orbit_records` 存在，算出的键和旧写法相同，已有测试钉住了两者相等。
- **活动表取锁放在事务开头：**
  - 好处：这样不会和行锁形成死锁。
  - 代价：报名、审核、配置、发布的写入，会和笔记、待办、日程、消息一起排队。锁只持有几毫秒，这个取舍和 0109 相同。
  - 这些事务默认是 serializable，排队可能让 40001 重试变多；各写入方原本就有重试。
- **迁移放在哪：**
  - 活动表的迁移是一段可以重复执行的 SQL，接在 `runOrbitRecordsMigration` 最后，也就是由 `db:migrate:live` 执行。
  - 主人守卫接在 sync-revision 迁移里，一次性版和在线版都装。`--check` 输出里新增了 `ownerGuardInstalled`。
- **数据库守卫只装在 `orbit_records` 上：** 专用表类别靠静态审计。0115 注册真实的专用表类别时，可以用同样的方式加触发器。
- **ownership 的「推导」规则：** 类型里已声明。读取服务遇到推导规则会明确报 `SYNC_DOMAIN_SOURCE_UNSUPPORTED`，要等 0115 的第一个推导类别来实现。
- **App 这边：** 协调器的改动在行为上等同于重构。我把新写的两条 App 测试放到改前的代码上跑，也都通过（`baseline-coordinator-old-code.txt`），说明三类数据确实不变。它们是回归保护，不是 RED。

## 4. 新增测试及各自证明什么

**orbits：**
- `live-record-owner-postgres`（8 条，真库加内存 store）：
  - 省略主人或传 null 时保留主人；
  - 转手被拒，原行不变；
  - 可以赋第一个主人；
  - `reassignRecordOwner` 能改非同步类别，拒绝同步类别和伪造的处理方式名称；
  - 约定提醒和见面两个投影不会接管别人的行；
  - `sync-cloud-records` 作为子进程跑两个 schema：遇到冲突跳过并退出码 1，云端没有主人的行不清空本地主人。
- `sync-owner-guard-postgres`（3 条）：
  - 批量脚本的原生 SQL 改主人、清主人、移出集合，全部被拒，附属类别也拦；
  - 伪造的处理方式名称打不开守卫；
  - 赋第一个主人、只改 payload、非同步类别改主人，照常通过。
- `sync-owner-audit`（3 条）：真实代码树干净；SET 子句解析正确；9 类反例全部被报出。
- `sync-write-lock-audit` 新增 2 条：活动表的写入方要么登记、要么取锁；反例全部被报出。
- `event-sync-revision-postgres`（7 条）：
  - 迁移为已有行回填，编号唯一、和万能表共用一条序列，重跑不变；
  - relax 放宽后再迁移，回到严格版；
  - 产品写入方每写一次都领到更新的编号；
  - 探针类别的增量同步和隔离；
  - 探针类别不下发，账号访问返回 404；
  - 并发时的提交顺序，以及对照组。
- 拓扑测试新增 1 条：v1 注册表的书签被拒。
- 迁移测试加断言：在线迁移会装上守卫。
- 7 个活动测试文件改为严格版的库，证明各写入方都取锁：admission 三个、generation-delegate、profile-repair-apply、canonical-registration、analytics。

**App：**
- `sync-coordinator-lease` 新增 2 条：未知类别被忽略、新下发的类别开始同步；注册表升级时重建不丢待上传行。
- `sync-lifecycle` 新增 4 条：
  - 打开身份时删除其他身份的库和密钥，包括本进程从没打开过的；
  - 删除中断时拒绝打开新身份，重启后补完；
  - 挂起后恢复同一身份不删任何东西，冷启动也保留自己的库；
  - 加载器列目录（目录不存在时返回空）。

## 5. 全量、Postgres、typecheck

**orbits 全量：**
- 第一次（`b2320fd69` 之前）：5283 条，40 条失败，全部是 `LIVE_RECORD_OWNER_CONFLICT`，都是测试夹具依赖 upsert 转手加上演示种子。修完后，这 23 个文件 158/158 通过。
- 收口在 `ee37a4301` 上：5283 条，4748 通过，**1 条失败**，534 跳过。
  - 失败的是 `sync-owner-audit`，它发现了 demo reassign 这个新调用方。
  - 已在 `1e68382fb` 登记，该文件 3/3 通过，没有重跑全量。
- 和基线（0 失败）比，没有其他失败。

**App 全量：** 3729/3729 通过。

**Postgres 环境：**
- 205 个文件：凡是设置了 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`、`ORBIT_EVENT_DATABASE_URL` 或 `ORBIT_DEMO_TEST_DATABASE_URL` 的测试文件都算进来。三个变量都指向 `orbit_test`，经 `run-node-tests.mjs` 跑，带付费拦截，`--test-concurrency=1`。
- 结果：1033 条，951 通过，66 失败，16 跳过，没有付费请求被拦。
- 66 条失败都是已知原因：
  - 4 个必须用 cutover 库的文件，共 64 条：contact-search-pagination 23、canonical-reminder-command-transaction 12、canonical-reminder-wake 26、read-projection-parity 3。
  - 另 2 条是强行设置 `ORBIT_EVENT_DATABASE_URL` 引起的：business-card-batch-schema、event-core-backfill-command。0109 也记录过。
- 上面 4 个文件改用 `orbit_cutover_test_20260917` 跑：73 条，66 通过，7 条失败，都是 contact-search-pagination 原有的 7 条。

**typecheck 与 lint：** orbits 的 `typecheck`、`typecheck:app`、`lint` 和 App 的 `typecheck` 都是 0 错误。

**读取棘轮：** 文件没有改动。

## 6. 提交

- `b2320fd69` feat(orbits): sync foundation — registry v2, owner-preserving upsert, owner/identity guard and audit, event table sync revisions (0113)
- `ee37a4301` feat(app): lease-driven sync domains and one identity per device on native (0113)
- `1e68382fb` test(orbits): the owner audit lists the demo organizer reassign as a non-sync owner change (0113)（最后一个提交）

工作区只剩你原有的文件：各个 codex-review.md、`.claude/skills/gitnexus/`、`output/`，以及构建生成的 `next-env.d.ts`。

## 7. 运行时证据

证据目录：`repos/orbit-app/build/harness-state/evidence/sprint-0113/run-01/`，下有 `commands/` 和 `screens/`。

**迁移，按顺序执行：**
1. **演练：** 从 `orbit_events` 复制一份临时库（9245 行真实数据），依次跑 sync-revision 迁移和 `migrate-live` 两遍。
   - 守卫装上；活动表 16/16、3/3、16/16 行都有编号且不重复。
   - 临时库已删除。
2. **`orbit_test`：** 同样的命令，结果为严格版，守卫已装。
3. **`orbit_events`：** 在代码提交、测试通过之后执行，结果为 strict，`ownerGuardInstalled=true`，活动表全部有编号（`migrate-orbit_events.txt`）。
   - 在回滚的事务里验证：不取锁改活动表被拒；取锁后领到编号 19820；改笔记主人被守卫拒绝。
4. 3000 端口全程在跑，没有碰过。

**phoneweb（Chromium，3100 本地构建，`localhost:32113`，A、B 两个账号）：**
- 租约是三类，registryVersion=2，manifest 也是三类。
- 我在真实的租约响应里注入了一个未知类别 `future-events`。App 没有请求它的页面，页面错误为 0。
- 断网后 notes、tasks、个人日程都显示「无法连接 · 显示截至 9月28日 08:30」。
- B 看不到 A 的笔记。
- 探针类别对账号返回 404。
- 页面请求列表里会出现一条 probe 请求，是我的脚本自己发的，不是 App 发的。

**Simulator（Debug 加 Metro）：**
- 重启并连 3000 的演示账号时，三类数据做了一次从头同步，3 个页面都是 200、没有 409，库文件的 inode 不变。所以这次重建来自纪元轮换还是注册表升级，我无法区分。**注册表升级触发重建由 App 测试和服务端 409 测试证明，没有在设备上单独证实。**
- 切到 3100、登录 QA A 之后，只有 A 的一个库文件。
- **一身份规则的真机验证：** 我在 App 的 SQLite 目录里放了一个其他身份的库文件，然后强制退出、冷启动。那个文件被删掉，A 自己的库 inode 不变（`sim-one-identity.txt`）。
- **断网：** 只停了 3100 的进程组。笔记、待办、个人日程都显示「Offline · showing content as of Sep 28 at 8:36 AM」，新建按钮提示需要联网（`sim-offline.txt`，截图 `sim-1x-*`）。

**收尾：**
- Simulator 的服务器地址已改回 `http://127.0.0.1:3000`。演示账号恢复正常（52 条未完成），本机只剩演示账号一个库。
- 3100、两个 worker、phoneweb、Metro 都已停止，现在只剩 3000 在监听。
- QA 数据在一个事务里删除：`orbit_records` 16 行、两个 QA 账号的 read receipts 92 条、我运行期间的匿名 web receipts 16 条。
- `orbit_records` 删除后是 9245 行，主键 md5 `5865a6fc…`，和开工前一致。
- `orbit_test` 保留了严格版和守卫。

## 8. GitNexus

- `createPostgresLiveRecordStore`：**CRITICAL**（240 处，结果 partial）。
- `createMemoryLiveRecordStore`：**CRITICAL**（217 处）。
- `createPostgresCanonicalRegistrationMethods`：**CRITICAL**（36 处）。
- `createPostgresEventOperationsRepository`：**CRITICAL**（52 处）。
- `createPostgresEventAdmissionRepository`：**HIGH**。
- `createSyncLifecycle`：MEDIUM（79 处）；`runOrbitRecordsMigration`：MEDIUM。
- 其余为 LOW。
- `migrateSyncRevisionOnline` 是 UNKNOWN。文本搜索确认调用方只有 `scripts/migrate-sync-revision.ts` 和测试。
- 因为 upsert 通过对象属性调用，图谱查不到调用方。我用 AST 扫描列出了全部 130 处调用，最终靠全量测试的运行时拒绝确认：唯一依赖转手的产品代码是 demo organizer projection。
- 每次提交前的 detect-changes（staged）都是 low，没有受影响的执行流程。

## 9. 生产步骤（需要你确认，我没有碰生产）

**① 只读检查：**
- `npm run db:migrate:sync-revision -- --check`：会多输出 `ownerGuardInstalled`。
- 查 5 张活动表各有多少行、是否已有 `sync_revision` 列：
  `select count(*) from event_ops_events` 等，以及 information_schema 查询。

**② 执行顺序：**
1. 部署代码。这时数据库还没变，活动表写入方取的是一把无用的空锁。行为变化只有一项：upsert 传入另一个主人会报错，这本来就不该发生。
2. `npm run db:migrate:sync-revision`：装守卫。替换函数不锁表；创建触发器时短暂持有 SHARE ROW EXCLUSIVE。
3. `npm run db:migrate:live`：最后一步是活动表迁移。在一个事务里：取提交顺序锁，对 5 张表持 ACCESS EXCLUSIVE，完成加列、回填、NOT NULL、唯一索引、触发器。几千行是毫秒级；可以重复执行。
4. `--check` 确认 `ownerGuardInstalled: true`；活动表没有空的 `sync_revision`。
5. 冒烟：报名、取消报名、主办方保存配置、审核决定、新建笔记/待办/日程。

**顺序不能反过来：** 先迁移、后部署新代码的话，活动相关写入会报 `SYNC_WRITE_LOCK_REQUIRED`；而且旧的 upsert 在清主人时会被守卫拒绝。

**③ 回滚：**
- 活动表：先执行 `EVENT_SYNC_REVISION_RELAX_SQL`，把触发器换成不检查锁的版本。再跑一次 `db:migrate:live` 就回到严格版。
- 守卫：最后手段是 `drop trigger orbit_records_sync_owner_guard_trigger on orbit_records`。
- **如果要把代码回退到 0113 之前，必须先 relax 活动表、再删掉守卫。**

## 10. 需要你知道或决定的事

1. **全局锁排队：** 报名、审核、配置、发布现在也会和笔记、待办、日程、消息写入一起排队，属于 serializable 事务。高峰期 40001 重试可能变多。
2. **两处依赖人工核实：** 两个写 `events` 集合的文件（`owner-migration`、`seed-demo-workspace`）用参数化的集合名，归为「非同步类别」，静态审计核实不了。0115 如果改从万能表的 `events` 集合读取，要重新审查这两处。目前计划是从专用表读，不受影响。
3. **静态审计测不到的写法：**
   - 把集合名放在变量里、在 SQL 里动态改主人的写法。数据库守卫在运行时同样会拦住。
   - 通过 JS 调用 upsert 转手。这种情况由 store 在运行时拒绝。
4. **原生端清理不到孤儿密钥：** 只能通过列库文件来找其他身份。库文件已经不在、只剩密钥的情况清理不到。密钥里不含数据，风险较低。
5. **交接给 0114、0115、0118：**
   - 说明书的字段定义在 `features/sync/domain-registry.ts`；
   - 改主人的处理方式登记在 `SYNC_OWNER_CHANGE_HANDLERS`，调用方登记在 `REASSIGN_CALL_MANIFEST`；
   - 专用表的写入方登记在 `EVENT_TABLE_WRITE_MANIFEST`；
   - 0115 要在 `KNOWN_SYNC_DOMAINS` 加上 App 端的条目；
   - 0115 如果要把专用表类别下发给设备，要么扩展 manifest 条件读的水位，要么保持现在的「不走 304」；
   - 0118 按同一接口加上个人子空间来源。
6. **违规记录：** 我在 `repos/orbits` 目录里跑过一次 `git diff --stat`，读到的是遗留的嵌套 `.git`，只读，没有副作用。另外，早期几次 Postgres 测试是直接用 `npx tsx --test` 跑的，没有付费拦截。后来同一批文件全部改用 `run-node-tests.mjs` 重跑过，拦截器报告 0 次付费请求。
## 11. 协调者复核

协调者在 `1e68382fb` 上独立复核：

- **orbits 全量**：5283 条，4749 通过，**0 失败**，534 跳过。子代理那次「局部修复后没有重跑全量」，这次补上了。
- **App 全量**：3729 条，3727 通过，2 条失败：
  - `ink-signal-settings-account`「narrow-large…」，4 秒；
  - `ink-signal-card-review`「single open fields…」，3 秒。
  - 这两个文件单独各跑 3 次，都全部通过（14/14、32/32）。本 Sprint 没有改它们，属于已知的 ink-signal 界面测试在全量负载下的超时，已加入观察名单。
- **Postgres 测试**：`orbit_test` 上全部使用数据库环境变量的文件，排除需要 cutover 库的 4 个，共 280 条，275 通过，0 失败，5 跳过。
- **本机开发库**：`--check` 结果为 strict，`ownerGuardInstalled=true`。3000 开发服务器日志里没有 `SYNC_OWNER_CHANGE_UNREGISTERED`、`LIVE_RECORD_OWNER_CONFLICT`、`SYNC_WRITE_LOCK_REQUIRED` 报错，也没有失败的写入请求。
- **生产顺序**：先部署、再跑 `db:migrate:sync-revision`（装守卫），最后跑 `db:migrate:live`（活动表）。这和 0108 的顺序一致，已合并到 `PRODUCTION_ROLLOUT.md`。
- **第 10 节第 1 条（全局锁排队范围扩大）**：记为生产上线后要观察的指标，已写进上线清单。
