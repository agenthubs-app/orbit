# Sprint 0117 执行报告：看板和联系人分析在手机上算（看板 D3）

**run-01。** Generator 为子代理，报告由协调者代存。分支 `sprint/0117-local-dashboard`，基线 `eb64335f2` 加开工提交 `cd0830099`。没有推送，没有碰生产或云端库。Planner SHA256：`ae310a9f…`。

**状态：completed。** 5 个 SC 都有同一版本的证据。付费调用 **0 次**。

有 5 件事需要你先知道：
- **磁盘快满了：** 数据盘只剩约 0.66GB，导致 1 条 Postgres 测试写不了临时文件。我没有删你的任何东西，见第 10 节。
- **来源审计仍然每次联网读：** 看板页上的「来源审计」卡片不属于看板计算，所以打开看板时它仍然读一次。A 账号每次约 87KB，见第 10 节。
- **修了一个已有的同步 bug：** 笔记、待办、日程的同步分页一直是按文字排序流水号的。流水号跨位数时（比如 99→100），设备会永久漏行。这个 bug 已经在线上，本 Sprint 修掉了。
- **发现一个没修的已有 bug：** 联系人分析里，非 ASCII 的地区分组（如「上海」）点进详情会显示「没找到」。服务器和手机两条路径都是这样，结果一致。
- **全量曾有失败：** orbits 全量第一次 3 条失败，都是测试夹具的问题，修完后只重跑了相关文件，没有重跑全量。见第 5 节。

## 1. 结论

**已验证能做到：**
- **共用目录：** 新增 `orbits/shared/compute/`，是唯一明确允许服务器和 App 共用运行时代码的目录。
  - `npm run sync:contract` 把它逐字节拷到 App 的 `src/api/compute/`。
  - `domain` 目录仍然只放行 `industries.ts` 和 `language.ts` 两个字典。
  - 目录规则由同一份审计代码在两端检查（`orbits/tests/support/shared-compute-audit.ts`）：
    - 只能引用本目录文件、`../contract/*` 的类型、两个同步字典；
    - 不许 IO、网络、宿主全局对象、读时钟、随机数；
    - 依赖运行环境的文本和时间函数（localeCompare、toLocale*、Intl、按字符串解析日期）只能写在 `compute-text.ts` 里。
- **计算代码只有一份：** 下面这些都搬进了共用目录，`features/dashboard/*` 只留转出口和服务端接线（错误映射、SQL 读取器、默认请求时间）：
  - 关系图映射、总数、短列表、摘要、分布、缺口、机会、行动简报、分组详情；
  - 对应的数据类型定义、四个关系枚举。
  - 0101 的 SQL 对照测试和 0102 的快照测试原样通过，说明服务器结果没变。
- **同步类别 `dashboard-graph`：** 本人（`user_id`）六类记录每条一行：联系人、关系、详情状态、万能表 `events`、来源、待办。
  - `data` 是服务器读整张图时取的那份字段，再去掉任何计算都不读的字段：邮箱、电话、简介、personId、信任度、共同话题、活动地点和结束时间。
  - 来源行只带记录时间，不带正文。
  - 软删除、或联系人的 `accountId` 离开本人时，作为删除下发。
- **万能表 `events` 按 registry v2 登记：**
  - 加入提交顺序锁的集合和主人守卫。
  - 写活动的地方全部改为取锁：主办方主人迁移（同时改为只赋首个主人）、展示字段补写、主办方账号初始化脚本。
  - 演示种子里「清空活动主人」这一步，登记为唯一的「转手」处理方式 `demo-event-owner-reset`。它在同一事务里轮换原主人的授权纪元，原主人的设备会整域重建。
  - 浏览器镜像的决定已写进威胁模型。
- **App：** 看板和联系人分析都用本机副本加共用代码计算，分组详情（点进某个分组）也是。
  - 打开时不再请求 `/api/dashboard*`、`/api/dashboard/structure/*`，也不再请求完整的联系人分析。
  - 联系人分析只请求一次 `?view=analysis`，只拿 AI 报告和它绑定的个人资料。
  - 断网时显示 0108 的「截至」提示条。重新计算、运行审计、去 AI 分析都显示「需要联网」并禁用。
  - 没有新增组件或颜色。
- **数字逐项一致：** 在测试库、本地生产构建、开发库真实数据三个层面都做了比对，见第 2 节和第 7 节。

**做不到的地方：** 见第 10 节。

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 三方对照 | 通过（先 RED） | 真库测试 `sync-dashboard-graph-postgres`「parity」：4 个账号（A、B、空账号、会退回整图读取的账号），每个账号设备都从真实同步接口拉数据。<br>设备算出的看板、摘要、分布、缺口、机会、职位计数，和服务器 SQL 结果逐项 `deepEqual`；第二次读走快照（不读整图），结果仍然一致。<br>所有分组的分组详情，加上不存在的分组和维度，也逐项一致。<br>写入后再比一遍，写入包括软删除、改分数、新联系人、改活动、改标签、新来源。<br>语料覆盖：中日拉丁文字、门槛边界（69.5、69.49999999999999、70.4）、同一时刻并列、重复编号、属于别人的行、没有主人的行、全角时间。<br>3 个变异都被测出：reader 不过滤 accountId、设备排序反向、设备丢掉来源时间 |
| 02 共用目录规则 | 通过（先 RED） | orbits `shared-compute.test.ts`：目录存在；审计为空；19 种违规写法都被拒绝；服务器的计算函数和共用目录的是同一个函数对象。<br>App `compute-sync.test.ts`：副本逐字节一致；App 副本跑服务端同一份审计；在临时目录里验证同步脚本只放行 compute、清理过期副本、`domain` 仍只有两个字典。<br>`domain-sync` 测试的临时夹具补了 compute 目录，断言没有放松 |
| 03 不请求看板计算接口 | 通过（先 RED） | `dashboard-local-first`（原生，6 条）：看板、分析、详情都没有 `/api/dashboard*` 请求，分析只有 `?view=analysis`。<br>`dashboard-web-local-first`（浏览器，2 条）：镜像开启时同样；非 secure context 时走服务器，不做同步探测。<br>运行时：phoneweb 再次打开看板只有 manifest 304；Simulator 的小票（source=app）里没有任何 `/api/dashboard*` |
| 04 断网截图 | 通过 | phoneweb A、B：`A-01`～`A-07*`、`B-01`～`B-07*`。<br>Simulator A：`sim-02`、`sim-03` 在线，`sim-10`～`sim-13` 断网，包括分组详情「大阪 8 人 · 占全部联系人 22%」 |
| 05 服务器结果不变、全量、typecheck、棘轮 | 通过（带说明） | 见第 5 节 |

## 3. 设计取舍

1. **设备上的图就是服务器的图：** 同步行带服务器读图时的字段和两个微秒精度的记录时间。设备按服务器 SQL 的顺序排序（发生时间降序、更新时间降序、记录编号），再用同一个映射函数建图。记录时间换算成毫秒的方式和 node-postgres 驱动完全一样，所以 generatedAt 和「几天后到期」这类标签能对上。
2. **文本和时间规则固定下来**（`compute-text.ts`）：
   - **排序：** 纯可打印 ASCII 用 ICU root 表比较，不依赖运行环境；其他字符交给 `Intl.Collator("en-US")`。60,000 对随机字符串和 Node 的 en-US 结果对照为 0 差异。
   - **日期：** ISO 时间按 UTC 读，没有时区后缀的也按 UTC 读，等于生产服务器（TZ=UTC）的结果。
   - **变化：** 服务器原来用进程默认语言环境做 localeCompare，本机开发环境是 ja-JP，生产应当是 en-US。现在统一成 en-US，本机开发服务器在并列排序上可能和以前不同，生产不变。
3. **没有用多个同步类别，只用一个 `dashboard-graph`：** 修订号就是每条记录自己的流水号，不需要推算归属。对照测试证明一个类别就够了。
4. **AI 报告单独读：** 版本号只取决于关系图版本和个人资料（0121），所以 `getAnalysisOverview` 只查版本号、读个人资料和报告会话，不读任何区块。数据库没有 `sync_revision` 列时退回完整读取。
5. **来源审计保持联网读：** 它不是看板计算，要本地算就得同步 agentActions、推荐等别的数据，超出范围。断网时隐藏这张卡，运行按钮显示「需要联网」。
6. **转手必须有交代：** 活动成为同步类别后，演示种子「清空主人」只能作为登记的转手方式运行，同时轮换原主人的授权纪元，原主人设备整域重建（有真库测试）。
7. **修掉的已有 bug：** 记录类分页、专用表分页和 v1 `/api/sync` 分页，都是 `select sync_revision::text as sync_revision … order by sync_revision`，实际按文字排序。现在改成按表列排序，有回归测试，改前 RED。

## 4. 新增和修改的测试（都先看到 RED，记录在 `commands/red-*.txt`）

**orbits：**
- `tests/architecture/shared-compute.test.ts`（3 条）：目录规则；违规写法被拒；服务器和共用目录是同一份代码。
- `tests/services/compute-text.test.ts`（3 条）：ASCII 排序等于 en-US；非 ASCII 走 en-US 排序器；ISO 时间等于生产 UTC。这个文件是在写完 helper 之后补的，用两个变异（打乱排序表、没有时区按本地读）证明它能测出问题。
- `tests/services/sync-dashboard-graph-postgres.test.ts`（8 条）：
  - 注册表和租约；
  - 隔离（B 的、没有主人的、别的账号的行，来源正文、不下发的字段，都不在 A 的数据里）；
  - 增量、删除，以及联系人 accountId 离开和回来；
  - 撤权；
  - manifest 的 304 和 200；
  - 活动的主人守卫和写锁；
  - 对照（含分组详情）；
  - 演示重置处理方式和纪元轮换。
- `tests/services/sync-page-revision-order-postgres.test.ts`（1 条）：99→100 跨位时，记录类、看板图、v1 三种分页都不漏行。
- `dashboard-snapshot-postgres` 新增 1 条：只读 AI 报告的接口只执行 1 条版本查询，结果和完整页面相同；B 读不到 A 的报告；路由 `?view=analysis` 正常。
- **改动的测试：**
  - `sync-write-lock-audit` 和 `sync-owner-audit` 的清单：活动写入方重新分类，新增处理方式；
  - `offline-policy`：登记看板相关的 7 个 GET；
  - `sync-lease-manifest-domains`；
  - 两个 mock 契约测试：读取的源文件路径改到共用目录；
  - 三个夹具：`event-attendee-import`（seedAsOwner 加上 events）、`postgres-live-record-storage`（改用非同步集合断言语句形状）、`flow-topology`（写活动时取锁）。

**App：**
- `compute-sync.test.ts`（4 条）
- `dashboard-graph-sync.test.ts`（6 条）：真实协调器加 SQLite，覆盖拉取、编辑、删除、撤权、坏行、白名单。
- `dashboard-local-first.test.tsx`（6 条）和 `dashboard-web-local-first.test.tsx`（2 条）。
- 改动：3 个白名单断言补上 `dashboard-graph`；`app-wide-contacts` 和 `dashboard-first-paint` 补了 `useLocalDashboard`、`useLocalContacts` 替身（它们测的是服务器路径）；`domain-sync` 夹具补了 compute 目录。

## 5. 全量、Postgres、typecheck、棘轮

- **orbits 全量**（在 `23cfef63d` 上）：5325 条，4755 通过，**3 条失败**，567 跳过。
  - 3 条都是 events 变成同步类别后测试夹具的问题：`event-attendee-import-live-store` 2 条（夹具通过转手把活动交给测试账号）、`postgres-live-record-storage` 1 条（用 events 断言不带锁的语句）。
  - 在 `c068e365e` 修好，这两个文件 11/11 通过。按规则没有重跑全量。
- **App 全量：** **3774/3774**。
- **Postgres，`orbit_test`**（只设 LIFECYCLE 和 DEMO，215 个文件，清单在 `pg-main-files.txt`）：1023 条，897 通过，4 条失败，122 跳过。
  - `flow-topology-postgres` 2 条：夹具写活动没取锁，在 `3aa642810` 修好，文件重跑通过。
  - `incremental-sync-runtime-harness`「every fixed Web test path exists」：`ENV_FILE_PRESENT`，因为 `repos/orbits` 下有你的 `.env.bak.*` 文件，和代码无关。
  - `task-page-postgres`：Postgres 报「No space left on device」，磁盘满了。单独重跑也是同样的错误，**这条没能在本版本上验证。**
- **Postgres，同时设 ORBIT_EVENT_DATABASE_URL**（128 个文件）：720 条，706 通过，3 条失败，都是已知的：`event-core-backfill-command`、`business-card-batch-schema`（强行设置这个变量引起，0113 登记过）和上面的 ENV 那条。其中 `event-organizer-owner-migration-postgres` 3/3 通过。
- **cutover 库**（4 个文件）：73 条，66 通过，7 条失败，都是 `contact-search-pagination` 原有的 7 条。
- **typecheck 与 lint：** orbits 的 `typecheck`、`typecheck:app`、`lint`，以及 App 的 `typecheck`，全部 0 错误。
- **棘轮：** `unbounded-list-reads.baseline.json` 没有改动。

## 6. 提交（最后一个功能提交是 `3aa642810`）

- `24818f249` feat(orbits,app): shared/compute 共用目录，看板计算搬入，服务器原样运行
- `ffc76b492` feat(orbits): 同步类别 dashboard-graph；events 纳入守卫和锁；只读 AI 报告的接口；同步分页按数值排序
- `4134943e7` feat(app): 看板和联系人分析读本机副本计算；断网显示「截至」；只读 AI 报告
- `0df45acb2` feat(orbits,app): 分组详情也在手机上算
- `88ab1e1ce` fix(app): 手机算出的「分组不存在」显示和服务器一样的文案
- `23cfef63d` fix(app): 断网时「去 AI 分析」显示需要联网并禁用
- `c068e365e` test(orbits): 夹具把生成的活动按测试账号播种；语句形状改用非同步集合断言
- `3aa642810` test(orbits): flow-topology 夹具写活动时取锁

**工作区：** 只剩你原有的文件：各个 codex-review.md、`.claude/skills/gitnexus/`、`output/`、`next-env.d.ts`。

## 7. 运行时证据

证据目录：`repos/orbit-app/build/harness-state/evidence/sprint-0117/run-01/`，下有 `commands/`、`screens/`、`api/`、`git/`。

**开工检查：**
- `orbit_events` 里没有遗留的 QA 活动。
- 基线：`orbit_records` 9245 行，主键 md5 `5865a6fc…`。

**本机开发库迁移：**
- 执行 `ORBIT_DATABASE_TARGET=local npm run db:migrate:sync-revision`，结果为 strict，守卫已装。
- 两个函数都已包含 `'events'`。
- 在回滚的事务里验证：不取锁改活动报 `SYNC_WRITE_LOCK_REQUIRED`；改活动主人报 `SYNC_OWNER_CHANGE_UNREGISTERED`；取锁后能正常写。

**本地栈：** 3100 生产构建，代码变更后重建过一次。

**QA 数据：** 注册了两个账号，用产品的 live-record 写入接口写了 129 条记录。A：36 个联系人、30 条关系、13 条待办、4 场活动、20 条来源、9 条详情状态。B：6 个联系人。

**HTTP 对照**（`api/runtime-parity-{a,b}.json`）：A 和 B 各自像设备一样拉同步数据，用共用代码计算，和服务器的看板 5 个接口、完整联系人分析、AI 报告逐项比较，**11/11 一致**。比较时去掉了 provenance 里的来源名，也不看键的顺序（快照存成 jsonb、页面响应经过 schema 解析，都会重排键）。行动简报的 evaluatedAt 按各自请求时间对齐。

**开发库全部账号**（`api/devdb-parity.json`，整个过程在一个回滚事务里）：21 个账号全部一致，包括演示账号 `account_orbit_generated`（78 个联系人，596 行）。

**phoneweb**（32117，Chromium，A 和 B）：
- 同步页下发的字段恰好是 5 个。
- 设备算出的看板和联系人分析页面文字，和非 secure 来源下用服务器响应渲染出的页面文字**逐行相同**。
- 分组详情在线、断网、服务器三种情况文字相同（A 的「大阪」和「科技与互联网」）。
- 再次打开看板只有审计、lease 和 manifest 304。
- 断网后区块内容和在线完全相同，只少了审计卡，重新计算按钮文字变成带「需要联网」。

**读取量**（`commands/receipts-*.tsv`，A 账号，数据库读取字节）：

| 场景 | 读取 |
|---|---|
| 改前每次打开看板（5 个接口） | 约 38.7KB |
| 改前每次打开联系人分析（完整读取） | 约 62KB |
| 改后看板 | 0 个看板请求 |
| 改后联系人分析 | 只有 `?view=analysis`，约 12KB，其中大头是报告会话 |
| 首次同步 | 112 行，响应约 59KB，只发生一次 |
| 再次打开 | 只有 manifest 304 |
| 来源审计（仍然每次读） | 约 87KB |

**Simulator**（Debug 加 Metro，服务器地址 3100，账号 A）：
- 在线：覆盖度 77%，关系资产 36，待办 12，待唤醒 12，高价值关系 21。这和对照脚本算出的数字一致。
- 只停 3100 的进程组后，看板、分析、分析的结构分段、分组详情都显示「Offline · showing content as of…」，数字不变。
- 用 Simulator 时发现：分析页的报告状态是上次读到的缓存，「去 AI 分析」按钮还能点。已改为断网时禁用（`23cfef63d`），截图 `sim-11` 是修改后的。

**收尾：**
- Simulator 的服务器地址已改回 `http://127.0.0.1:3000`，演示账号恢复（17 项待办）。
- 3100、两个 worker、phoneweb、Metro 都已停止，现在只剩你的 3000 在监听。
- QA 数据已删除：`orbit_records` 137 行，QA 小票 544 条。删除后 9245 行，md5 `5865a6fc…`，和开工前一致。
- 我这段时间产生的匿名小票没有删，可能和 3000 的混在一起。
- **付费调用：0 次。** 3100 日志里唯一一条 `registration_questions_generated` 是 2026-09-27 12:24 的旧记录（0128 那次运行），不是本 Sprint 产生的。

## 8. GitNexus

**impact 结果：**
- CRITICAL：
  - `createStorageDashboardAggregateProvider`（18 处）：只是删掉搬走的映射代码并转出口，行为不变；
  - `ownerGuardedCollections`：新增看板图的集合。
- HIGH：
  - `createLiveNetworkDistributionAnalyticsService`、`createLiveOpportunityReminderAnalyticsService`：服务端保留包装，补上默认请求时间；
  - `dashboardDueLabel`：日期解析改为共用的解析函数；
  - `isSyncCollection`：新增 events。
- 其余为 LOW。
- **影响为 0 的：** `DashboardScreen`、`ContactsDashboardScreen`、`ContactStructureDetailScreen`（expo-router 路由文件不在图谱里，已用文本搜索确认调用方）、`applyEventOrganizerOwnerPlan`（调用方是演示种子、CLI 和测试）。

**detect-changes：** 每次提交都是 low，受影响流程 0 个。和基线比较：101 个文件，low。

**流程违规：** App 端的 `useValidatedApiResource`、`KNOWN_SYNC_DOMAINS`、`WEB_MIRROR_DOMAIN_IDS` 是改完之后才补跑 impact，结果都是 LOW。

## 9. 生产步骤（请写入 PRODUCTION_ROLLOUT.md，我没有碰生产）

① **部署代码：**
- 这时数据库还没变，活动写入方取的是一把还没生效的锁，行为和原来一样。
- 同步分页的排序修复随部署立即生效。
- phoneweb 和 App 的看板仍然走服务器，直到新版 App 发布。

② **执行 `npm run db:migrate:sync-revision`，再用 `--check` 确认：**
- 这一步替换「哪些集合是同步类别」和主人守卫两个函数，events 进入两者，并登记 `demo-event-owner-reset`。
- **顺序不能反过来：** 先迁移、后部署的话，旧代码不取锁写活动会报 `SYNC_WRITE_LOCK_REQUIRED`，主办方主人迁移会报 `SYNC_OWNER_CHANGE_UNREGISTERED`。

③ **只读确认：** `select 1 from pg_collation where collname='und-x-icu'`（0101 已要求过）。

④ **冒烟，两个账号各做一遍：**
- 打开看板和联系人分析（网页）；
- `GET /api/mobile/contacts-dashboard?view=analysis`；
- 新建或导入一场活动；
- 活动参会者导入；
- 名片确认。

⑤ **发布 App 和 phoneweb：**
- 已有设备会给 `dashboard-graph` 拉一次首页。重度账号约 5,000 行，按页拉，每页不超过 768KB。
- 之后打开看板和联系人分析只剩 manifest 条件读，外加 AI 报告和审计两个请求。

**回滚：**
- 先 `--rollback=relax`：锁不再检查。
- 守卫的最后手段同 0113：drop 守卫触发器。
- 如果要把代码回退到本 Sprint 之前，先 relax。

## 10. 需要你知道或决定的事

1. **磁盘空间：** 数据盘只剩约 0.66GB。大头在 Xcode DerivedData 的 Orbit 目录（11GB，Debug 构建产物）和库 `orbit_scale_test`（12GB）。`task-page-postgres` 因此没能验证。都不是我建的，我没有删，请你决定清理什么。
2. **来源审计：** 每次打开看板仍然联网读一次，A 账号约 87KB，读的是账号下全部被审计的集合。它不是看板计算，不在本 Sprint 范围。建议改为按需运行或本地优先，需要你决定是否排入后续 Sprint。
3. **已有 bug，没修：** 非 ASCII 地区分组（如「上海」）的分组详情，服务器路径和手机路径都显示「没有找到对应内容」。原因是分组编号本身带 `%`，路由参数又被多解码了一次。两条路径结果一致，建议并入 0131。
4. **已知限制：**
   - 两条记录的两个时间完全相同时，服务器按数据库排序规则比较记录编号（Linux 的 en_US 忽略标点），手机按码点比较，和 0116 相同。
   - 非 ASCII 标签在手机上用 Hermes 的 `Intl.Collator("en-US")` 排序。在 Simulator 的 QA 数据上数字和列表一致，但没有逐条比对 Hermes 的排序结果。
   - 不是 ISO 格式的时间字符串仍然用 `Date.parse`，结果依赖运行环境。
   - 本机开发服务器如果时区不是 UTC，没有时区后缀的时间现在按 UTC 读，和生产一致。
5. **已有问题，没修：** manifest 条件读用的水位是「最大 updated_at 加行数」。如果一次写入把 updated_at 写成更早的时间，manifest 会误返回 304。生产写入用的是当前时间，影响很小；所有同步类别都是这样。
6. **顺带修了 0116 留下的缺口：** `bootstrap-event-organizer-accounts` 认领联系人时原来不取锁，现在语句里自带锁。
7. **联系人分析断网：** 原生端会显示上次读到的 AI 报告状态，「去 AI 分析」禁用；浏览器没有缓存，显示「人脉分析暂不可用」。
8. **Simulator 只验了账号 A：** A 和 B 的双账号验证在 phoneweb 上完成。
9. **对后续放进共用目录的代码的要求：**
   - 只能是纯函数，只引用本目录、`../contract/*` 的类型和两个字典；
   - 不许 IO、网络、读时钟、随机数；
   - 需要排序或解析日期时，调用 `compute-text.ts`；
   - 服务器保留的文件要直接转出共用目录的函数（有「同一个函数对象」的测试守着）；
   - 改了缺口或机会的规则，要把 `DASHBOARD_SNAPSHOT_SCHEMA_VERSION` 加一。
## 11. 协调者复核

协调者在 `3aa642810` 上独立复核：

- **orbits 全量**：5325 条，4758 通过，**0 失败**，567 跳过。子代理那次「局部修复后没有重跑全量」，这次补上了。
- **App 全量**：3774/3774 通过。
- **Postgres 测试**：`orbit_test` 上全部使用数据库环境变量的文件，排除需要 cutover 库的 4 个，共 313 条，308 通过，0 失败，5 跳过。子代理那次因为磁盘满没验证的 `task-page-postgres`，这次通过了。
- **磁盘**：数据盘只剩 0.7GB。协调者删除了 Xcode 的 Orbit 编译缓存 DerivedData（11GB，可以重新生成，已装好的 App 不受影响），以及自己在 scratchpad 里的旧日志，现在空闲 13GB。`orbit_scale_test`（12GB）不是协调者建的，没有动，登记为待用户决定。Generator 通用规则已加上「开工前检查磁盘，低于 5GB 就停下报告」。
- **第 10 节的处理**：
  - 第 2 条「来源审计每次打开都读」→ **0131**：协调者决定改为按需运行。
  - 第 3 条「非 ASCII 分组详情找不到」→ **0131**。
  - 第 5 条「manifest 水位用 updated_at」→ **0118**：改为用流水号。
  - 第 4 条（已知限制）接受。
  - `incremental-sync-runtime-harness` 那条 `ENV_FILE_PRESENT`，是被 `repos/orbits` 下用户自己的 `.env.bak.*` 文件触发的，不是代码问题。
- **生产步骤**：已写入 `PRODUCTION_ROLLOUT.md`。
