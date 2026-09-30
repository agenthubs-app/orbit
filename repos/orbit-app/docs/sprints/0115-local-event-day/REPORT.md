# Sprint 0115 执行报告：活动现场放进手机（断网 1a）

**run-01。** Generator 为子代理（没有再派子代理），报告由协调者代存。分支是 `sprint/0115-local-event-day`，基线 `cc4c3daf5`，加开工提交 `1edb68ede`。没有推送。

**状态：completed。** 5 个 SC 都有同一版本的证据，两端全量都是 0 失败，付费调用 0 次。

### 1. 结论

**现在能做到的：**
- **报名后同步：** 下一次同步会把三类数据放进手机：
  - 活动的公开信息：标题、介绍、场地、时区、起止时间；
  - 配置时间：签到开放、结果开放、第一轮和第二轮开始；
  - 本人的报名状态，以及发布给本人的那一份结果：本人所在的桌、推荐给本人的人，以及参会者名录的公开字段。
- **断网时能打开：** 活动详情、现场页（首页、推荐、参会者、分组、议程、资料面板）和日历页都能打开。
  - 页面顶部是 0108 的琥珀色提示条：「无法连接 · 显示截至 X 的内容」。
  - 签到、交换名片、记笔记、约时间都标「需要联网」，也不会发出任何请求。
  - phoneweb 和 Simulator 上都实测过。
- **取消报名或报名被拒后：** 下一次同步会下发删除，手机上的这场活动和发布给本人的结果被撤下，只留一行「报名已取消 / 报名未通过」的状态。
  - phoneweb 实测：取消后，日历不再显示这场活动；详情页显示「报名已取消 · 这场活动的资料已从本机移除」。
  - Simulator 同一账号同步后断网冷启动，显示的也是这一句。
- **日历页改成本地优先（协调者追加项）：** 活动部分读本 Sprint 的本地数据，待办和个人日程读 0108 的本地副本。断网时不再是三张「暂时连不上」。
- **不放进手机的：** 别人的座位和推荐、关系图、主办方和工作人员视角的数据（管理台、签到名单、生成记录），以及公开活动目录。

**仍然做不到的：**
- 离线时看不到名片交换状态和本人的签到状态，这两样没有放进手机，页面上写的是「需要联网」。
- 议程在服务端没有任何来源，所以没有同步。议程页显示空状态，外加由配置时间推出来的「现场流程」，这和在线时一致。

### 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 隔离 | 通过 | 真库测试 `sync-event-domains-postgres`「isolation」一条：A 只收到自己报名的两场活动，只收到自己的桌和推荐。B 的推荐文字、C 所在的桌、只有 B 报名的活动、主办方 id、`actorId`、`graph`、`contactRequests`、`evidenceIds`、`profileAnswers` 都不在 A 的数据里。名录每人只有 10 个公开字段。主办方没有报名，三类数据收到 0 行。运行时：A 在 3 号桌，推荐 92% 和 81%；B 在 4 号桌，推荐 88%，互相看不到对方的内容 |
| 02 取消 / 被拒后撤下 | 通过 | 真库测试：取消后活动和结果各收到 1 条删除，状态行变为 cancelled；重新报名后又回来。走真实审核流程被拒，状态行显示 rejected，没有活动和结果。App 测试：删除下发后本机行消失。运行时见第 7 节 |
| 03 增量 | 通过 | 真库测试：首次全量 → 改一次场地，只有活动这一类传 1 行，另两类 0 行 → 再同步 0 行；别人的改动不推进 A 的书签；新发布结果到达后，结果这一类传 1 行 |
| 04 断网截图 | 通过 | phoneweb：A 的 `A-03`～`A-09` 和 B 的 `B-*`，覆盖日历、详情、现场首页、参会者、资料面板、议程、分组。Simulator：`sim-10`～`sim-15`，以及取消后的 `sim-20`、`sim-21` |
| 05 成本、全量、typecheck | 通过 | 见第 5 节 |

### 3. 设计取舍

- **三个同步类别：**
  - `event-registrations`、`registered-events`、`event-published-results`，主人按规则推算。
  - 起点永远是本人自己的报名记录和申请记录（`actor_id` 为本人）。没有这两类记录的活动，服务器一行都不读。
  - 读取代码在 `features/sync/event-domain-reader.ts`。
- **流水号：** 每行的流水号取它所依赖的几张表的流水号里最大的那个。这几张表共用一条序列和同一把提交顺序锁（0113），所以不同活动的行不会撞号，书签也可靠。
- **撤下：** 取消或被拒时，报名记录的主人不变，但会领到新流水号，于是这一行作为删除下发。首次全量不下发删除。
- **结果开放时间：** 结果到开放时间之前不下发。开放不是一次写入，而是时间到了，所以我把「已开放的活动集合」算进结果这一类的 generation。时间一到，generation 变化，设备上的旧书签会被拒绝（409），设备随之重拉。主办方重新发布、而新结果还没开放时，旧结果会作为删除下发，和在线时显示「结果尚未开放」保持一致。
- **manifest 保留 304：** 把三类活动数据的水位和已开放集合合成一个摘要（一条 SQL），放进条件读取的键里。结果：
  - 没有变化时返回 304，代价是水位查询 1 条加摘要查询 1 条；原来只有水位查询 1 条。
  - 改活动、取消报名、新发布，都会返回 200。
- **数据库守卫：** 在 `event_ops_membership_heads` 和 `event_ops_admission_application_heads` 上加了守卫触发器。凡是把记录改到另一个人、另一场活动或另一个 workspace，都报 `SYNC_OWNER_CHANGE_UNREGISTERED`；目前没有登记可以这样改的处理方式。原有 `orbit_records` 守卫的 SQL 没有改。
- **下发字段白名单与现场接口共用：** 把 `publicParticipant`、`publicTable`、推荐的投影从路由文件移到 `attendee-public.ts`，operations 接口和同步共用同一个隐私边界。
- **防止单场大活动拖垮同步：** 名录超过预算时，只保留本人同桌和推荐里出现的人，并标 `directoryComplete:false`。每页控制在 768KB 以内。
- **App：**
  - 服务器的回应优先。服务器回 403 时，显示拒绝页，本机副本不会盖住它。
  - 没有服务器回应时（断网或还在加载），显示本机副本。
  - 断网时资料面板不发任何网络请求。
- **浏览器镜像：** 三类都放进浏览器镜像。逐类的论证写在威胁模型第 2 节「活动现场：决定与接受的风险」：
  - 这些内容与同一会话从 operations 接口能明文读到的相同；
  - 同源脚本本来就能直接调这个接口，本地副本多出来的只是「会话过期或断网后，页面打开期间仍能解密」这一段窗口；
  - 风险比笔记小，没有本人写的私密原文。
- **日历页的来源：**
  - 原生只读本地副本；浏览器在镜像可用时读本地，不可用时（例如局域网 http 地址）沿用原来的三个在线接口。
  - **行为变化：** 日历上的活动从「全部公开活动」改成「你报名的活动」，这正是协调者追加项的要求。

**下发的字段（白名单）：**
- `event-registrations`：`eventId`、`membershipStatus`、`admissionStatus`
- `registered-events`：`eventId`、`participantId`、`title`、`description`、`venue`、`timeZone`、`startsAt`、`endsAt`、`lifecycleState`、`checkInOpensAt`、`eventStartsAt`、`eventEndsAt`、`profileEditDeadlineAt`、`resultsAvailableAt`、`roundOneStartsAt`、`roundTwoStartsAt`
- `event-published-results`：`eventId`、`generationId`、`publishedAt`、`resultsAvailableAt`、`me`、`directory`（公开 10 字段）、`directoryComplete`、`recommendations`（本人的）、`roundOneTable`、`roundTwoTable`（本人的桌）

**断网时各现场操作的提示文案：**
- 签到按钮：「立即签到 · 需要联网」
- 资料面板：名片一行显示「需要联网」；「申请交换名片 · 需要联网」；记笔记和约时间置灰，下方写「需要联网」
- 活动详情：顶部提示条，外加「报名、取消报名、签到和交换名片需要联网」，报名底栏隐藏

### 4. 新增和修改的测试

每条新测试都先看到失败，失败记录放在 `commands/red-*.txt`。

**orbits：**
- `sync-event-domains-postgres`，真库 8 条：
  - 注册表和租约；
  - 隔离；
  - 取消、被拒；
  - 增量；
  - 结果开放前不下发、开放后重建；
  - 撤权后返回 403，旧 epoch 的书签返回 409；
  - manifest 的 304 和 200；
  - 数据库守卫。
- `sync-owner-audit` 新增 3 个反例：
  - 把申请记录改给别人、把报名记录改到别的活动，都会被报出；
  - 只改状态的写法不算改主人，不被报出。
- `sync-write-lock-audit` 新增 2 条：推算类别读的每张表都有流水号或者不可变；在原地更新 publications 或 configurations 会被报出。
- `offline-policy` 矩阵新增 3 条读取登记。
- `sync-lease-manifest-domains` 新增 1 条：生产注册表的租约包含活动类别；304 时的查询只有摘要和水位两条。

**App：**
- `event-day-local`（5 条）：本地行组装成现场页的 workspace、详情和日历数据；没有结果时显示 locked 或 not_generated；取消或被拒后没有 workspace；坏数据被忽略。
- `event-day-sync`（4 条）：真实协调器加真实 SQLite，覆盖拉取、删除、撤权、浏览器白名单。
- `event-live-interactions` 新增 2 条：
  - 断网本地渲染；
  - 在线时服务器优先、403 不被本地副本盖住。这条在旧代码上本来就通过，是回归保护，不算 RED。
- `canonical-event-detail-screen` 新增 2 条：断网详情；取消后显示「已从本机移除」。
- `ink-signal-schedule` 新增 1 条：浏览器镜像离线日历有「截至」提示条，不发任何在线读取。

**修改的旧测试：**
- 3 个 topology 或锁测试改为显式传入 `RECORD_SYNC_DOMAINS`：它们的 schema 里没有活动表，测的也只是万能表的三类。
- 3 个断言白名单的浏览器测试补上新类别。
- `schedule-screen-source` 的静态检查改为指向新的 source 文件。
- 4 个页面 harness 补了 `useLocalEventDay` 的替身。

### 5. 全量、Postgres、typecheck

- **orbits 全量：** 5300 条，4752 通过，**0 失败**，548 跳过。
- **App 全量：** 3744/3744 通过。
- **Postgres 环境测试：**
  - 设置了数据库环境变量、并引用了本次改动模块的测试文件共 124 个，文件清单见 `commands/pg-main.txt` 和 `pg-cutover.txt`。
  - 其中 120 个在 `orbit_test` 上跑（`--test-concurrency=1`）：510 条，493 通过，15 跳过，2 条失败。
  - 这 2 条是 0113 就登记过的「强行设置 `ORBIT_EVENT_DATABASE_URL` 引起的失败」，所在文件是 `event-core-backfill-command` 和 `business-card-batch-schema`。不强行设置时，这两个文件 37 条，35 通过，0 失败。
  - 另外 4 个文件在 `orbit_cutover_test_20260917` 上跑：73 条，66 通过，7 条失败，都是 `contact-search-pagination` 原有的 7 条。
- **typecheck 与 lint：** orbits 的 `typecheck`、`typecheck:app`、`lint`，以及 App 的 `typecheck`，全部 0 错误。
- **读取量棘轮：** 文件没有改动，也没有新增 `listRecords`。

### 6. 提交与文件

**提交：**
- `96e58cd0f` feat(orbits): event day sync domains — derived owner reader, owner guard on event heads, conditional manifest covers events (0115)
- `dbb1b686a` feat(app): event detail, live page and calendar read the device copy of the event day; offline shows 截至 and needs-network (0115)（最后一个功能提交）

**主要文件：**
- orbits：
  - 新增：`features/sync/event-domain-reader.ts`、`features/events/event-operations/attendee-public.ts`
  - 修改：`domain-registry.ts`、`domain-read-service.ts`、`owner-guard.ts`、`event-operations/storage/sync-revision.ts`、`app/api/sync/domain-handlers.ts`、`operations/attendee-response.ts`、`shared/contract/sync.ts`、`shared/api-schema/offline-policy.ts`
- App：
  - 新增：`view-models/event-day-local.ts`、`hooks/useLocalEventDay.ts`、`screens/schedule/schedule-calendar-source{,.web,-mirror}.ts`
  - 修改：`EventLiveScreen`、`LivePersonSheet`、`EventDetailScreen`、`ScheduleScreen`、`sync-domains`、`web-mirror-storage`、`local-sync-repository`、`route-domain-inventory`、zh/en/ja 词典，以及 `docs/phoneweb/local-mirror-threat-model.md`

**工作区：** 只剩你原有的文件：各个 codex-review.md、`.claude/skills/gitnexus/`、`output/`，以及构建生成的 `next-env.d.ts`。

### 7. 运行时证据

证据目录：`repos/orbit-app/build/harness-state/evidence/sprint-0115/run-01/`，下有 `commands/` 和 `screens/`。

**本机开发库：**
- 对 `orbit_events` 执行了 `ORBIT_DATABASE_TARGET=local npm run db:migrate:live`，两个新守卫已经装上（`migrate-orbit_events.txt`）。

**QA 数据：**
- 用现有接口注册了 3 个账号：主办方加 A、B。
- 用产品仓储函数（配置、报名、生成、发布）造了一场活动，另加两个只有资料、没有账号的参会者。
- 发布结果用的是确定性数据，AI provider 碰到就会报错。task_attempts 为 0，说明没有触发任何 AI 调用。
- 公开详情接口需要别名和 `source_payload`，这两样是用 SQL 补写的。

**phoneweb**（`localhost:32115`，上游 3100，Chromium，脚本 `phoneweb-event-day.mjs`）：
- 在线时三类数据的首页各 1 行，下发的字段和白名单一致。
- 断网后：
  - 日历有提示条、有这场活动；
  - 详情显示「已报名」「签到 9/28 09:35 开放」；
  - 现场首页显示 3 号桌、「立即签到 · 需要联网」、推荐 92% 和 81%；
  - 参会者 3 人；资料面板显示「第 2 轮 · 7 号桌」「申请交换名片 · 需要联网」；
  - 议程显示空状态加现场流程；分组显示「本组主题：储能」。
- 断网期间尝试的写请求 0 次，页面错误 0 次。

**取消报名：**
- 过了报名截止时间后，页面上不再出现取消按钮。所以我在页面里直接调用 UI 背后的同一个产品接口 `POST /api/events/:id/registration/cancel`，返回 200。
- 下一次同步收到：报名这一类 1 行（cancelled），活动这一类 `delete`，结果这一类 `delete`。
- 断网后日历不再显示这场活动，详情页显示「报名已取消 · 这场活动的资料已从本机移除」。

**Simulator**（Debug 加 Metro，服务器地址 3100，账号 A，英文界面）：
- 只停 3100 的进程组来模拟断网。
- 日历、详情、现场首页（Table 3、「Check in now · Needs a connection」）、参会者、资料面板、议程都能看到本地内容，都有「Offline · showing content as of …」。
- 恢复 3100 后，手机同步到取消。再断网，杀掉 App 冷启动，详情显示「Registration cancelled · this event's details were removed from this device」。

**收尾：**
- Simulator 的服务器地址已改回 `http://127.0.0.1:3000`，演示账号恢复（17 项待办），本机只剩一个库文件。
- 3100、两个 worker、phoneweb、Metro 都已停止，现在只剩你的 3000 在监听。
- **QA 数据已删除**（`cleanup.txt`）：
  - `orbit_records` 删除后是 9245 行，主键 md5 `5865a6fc…`，和开工前一致。
  - 活动表回到 16 场活动、3 条报名、0 条发布。
  - 删除了 QA 账号的 read receipts，以及这段时间内 web/other 来源的匿名 receipts，共 198 条。
  - 另外保留了 61 条匿名的 app 来源 receipts，可能来自 3000，没有删。
- 付费调用 0 次。

### 8. GitNexus

- `createDomainReadService`、`createSyncDomainHandlers`、`createLocalSyncRepository`、`createWebSyncLifecycle`、`scheduleToCalendarView`、`toAttendeeOperationsResponse` 都是 LOW。
- `ScheduleScreen` 和 `EventLiveScreen` 的影响为 0，因为 expo-router 的路由文件不在图谱里，已用文本搜索确认调用方。
- 两次暂存区 detect-changes：orbits 那次是 low；App 那次是 medium，1 个受影响流程，是日历，由 `ink-signal-schedule` 全部通过覆盖。
- 与基线比较的结果是 medium，其中混进了你那些没提交的 codex-review.md。

### 9. 生产步骤（需要你确认，我没有碰生产）

1. 部署代码。
2. 执行 `npm run db:migrate:live`，会在报名记录表和申请记录表上装守卫触发器。
   - 产品代码从不改这些记录的人、活动或 workspace，所以先部署还是先迁移都安全。
   - 只读确认：
     ```sql
     select tgname from pg_trigger where tgname like '%sync_owner_guard%';
     ```
     应该有 3 行。
3. 发布 App 和 phoneweb（web export）。已有设备会给三个新类别各拉一次首页，不需要清库重建。

**回滚：**
```sql
drop trigger event_ops_membership_heads_sync_owner_guard_trigger on event_ops_membership_heads;
drop trigger event_ops_admission_application_heads_sync_owner_guard_trigger on event_ops_admission_application_heads;
```
再回退代码即可。

### 10. 需要你知道或决定的事

1. **从日历点活动：** 进的是 `/schedule/events/:id` 预览页。这个页面没有本地副本，断网时仍会报错。要不要改成进 `/events/:id`（有离线支持），需要你决定。
2. **活动详情在服务器报错时：** 如果服务器返回 404 或 5xx，而本机有副本，页面也会显示副本，提示条写的是「无法连接」。对 5xx 来说这个说法不太准确。
3. **整场活动被删除：** 只有种子重置和运维清理会这样做。这时源记录直接消失，设备收不到删除，要等下次换身份、退出登录或撤权才会清掉。已写进威胁模型的「未缓解」。
4. **过了截止时间就不能在页面上取消：** 原有 UI 在报名截止后不提供取消按钮，所以运行时是在页面里调用同一个产品接口完成取消的。
5. **manifest 的 304 多一条查询：** 每次没有变化的检查，多一条摘要查询（1 行）。
6. **违规记录：** 没有。Python 都经 `uv run` 执行；没有使用 git stash；没有碰 3000。
## 11. 协调者复核

协调者在 `dbb1b686a` 上独立复核：

- **orbits 全量**：5300 条，4752 通过，0 失败，548 跳过。
- **App 全量**：3744 条，3743 通过，1 条失败，是已登记的不稳定用例 `tasks-unification-interactions`「suggestion next page…」，与本 Sprint 无关。
- **Postgres 测试**：`orbit_test` 上全部使用数据库环境变量的文件，排除需要 cutover 库的 4 个，共 294 条，289 通过，0 失败，5 跳过。
- **截图抽查**：
  - `A-05`：断网现场首页显示「3 号桌」、推荐 92% 和 81%、「立即签到 · 需要联网」和「截至」提示条，符合方案。头像显示「【」，是因为测试账号名以「【QA0115】」开头，不是缺陷。
  - `A-22`：取消后断网打开详情，同时出现红色错误框和「已从本机移除」，显示效果不理想。
- **第 10 节各条的处理（协调者按授权决定，并入 0131）**：
  - 第 1 条：日历里点已报名的活动，改为进入 `/events/:id`。
  - 第 2 条：404 和 5xx 分开处理，改提示条文案。
  - `A-22` 的问题：改为中性的状态说明，不显示错误框。
  - 第 3 条（整场活动被删除时，设备收不到删除）：接受这个限制，已写进威胁模型。
- **生产步骤**：已写入 `PRODUCTION_ROLLOUT.md`。
