# Sprint W0031 — 收件箱轮询身份确认与 `/api/account/me` 瘦身

**Plan revision:** 3（2026-09-29）。revision 1 经 Codex 方案 review（`scratchpad/w0031/codex-plan-review.txt`，4 条 P1、3 条 P2）修订为 revision 2，逐条处理见末尾「review 处理」；revision 3 并入用户决定 D25（W31-1 选 A，W31-2～W31-5 按推荐），见「已定决定」。**模式:** existing-codebase / single-generator。运行状态以登记表为准。

**原需求:** RV-03、RV-05。来源：W0030 REPORT「全站受益表」与「观察项」，用户决定 D24（2026-09-29）。

**单一目标:** 收件箱打开时，
1. **客户端**：整个收件箱（红点计数、消息页签、通知页签、通知来源页）每个 15 秒轮询周期只向 `/api/account/me` 确认一次身份，几个轮询共用这一次结果；写操作（发消息、标记已读、处理通知）之前仍单独做一次新鲜确认。轮询周期仍是 15 秒，页面可见行为与新消息出现的及时性不变。
2. **服务端**：`/api/account/me` 的账号会话服务改用轻量读取，只取 `sessionPayload` 需要的列；响应形状与内容逐字段不变，语句数不变，失败语义、闸门、去重、计量与 W0030 相同。

先在**生产构建**下实测真实轮询与页面加载频次作为基线，再改、再测。

**易读目标:** [GOAL.md](GOAL.md)。

**基线:** 编制时 `chat-agent` `4722fcad`。开工时 W0029 应已合并，基线改为 W0029 合并后的 SHA；本文件行号按 `4722fcad` 核对（W0029 不碰本 Sprint 的文件），Generator 开工时用 `git diff 4722fcad HEAD -- <修改白名单>` 复核并在 REPORT 登记。

**进入条件:**
- W0029 已 completed 并合并进 `chat-agent`（执行顺序 W0029 → W0031 → W0019，D24）。
- W31-1～W31-5 已由用户决定（D25，2026-09-29，见「已定决定」）。✔
- 本机 PG 测试库 `orbit_test` 可用；3001 验收 server 可用；本机有空闲端口给生产构建用（建议 3012 给基线、3013 给改后，启动前探测）。
- 同一工作树上没有其他 Generator 在跑（生产构建会写 distDir 和 `next-env.d.ts`）。
- 不需要云端授权，不调用付费 AI，不部署。

## 已定决定（D25，2026-09-29：W31-1 选 A，W31-2～W31-5 按推荐）

| 编号 | 问题 | 决定 |
| --- | --- | --- |
| W31-1 | 轮询时怎么确认身份 | **A**：带世代号的共享确认，整个收件箱每 15 秒最多 1 次 `/api/account/me`；写操作前走独立的写前屏障；响应里的 `actorId` 照旧核对（细则见「决定」一节）。备选 B（轮询不调 `/api/account/me`）不采用，登记为后续候选 |
| W31-2 | 会话服务轻量读取放哪 | **A**：provider 新增可选方法 `readAccountSessionView?`，只 `live-service` 调用；`readAccountSessionGraph` 不变（同 W30-2 A） |
| W31-3 | `/api/account/me` 路径（解析＋会话服务）的月上限 | **≤2.5 GB／月**（十进制），按 SC-01 生产实测频次重算后以「跨实例不去重上限」口径判定，超出则 SC-04 failed、交用户裁决；「单实例实测」只作参考。口径外单列，不并入 884 MB 用户路径总账；登记给 W0019 |
| W31-4 | 频次假设 | **A**：沿用 W30-4（收件箱每天 10 分钟、消息／通知各半），另加每天打开收件箱 2 次、每天页面加载 10 次，1000 人全按日活；REPORT 同时给「每次节省字节」便于重算 |
| W31-5 | 轮询端点自身的账号解析（约 1.0 GB／月） | **A**：本 Sprint 不做，登记为后续候选 |

## 已查清的事实（`4722fcad`）

1. **身份确认的客户端调用点**（`app/(app)/app/inbox/`）
   - `inbox-request.ts:8–13` `readContactMessageActor(signal?)`：`GET /api/account/me`，取 `data.account.id`，空则抛 `No account`。
   - `bounded-contact-messages-view-model.ts:13–17` 有一份**同名私有副本**（抛 `BoundedMessageReadError(403)`），被 `read()`（第 24–31 行，每次读取之后再确认一次）、`confirmMessageWindowRead`（第 52–58 行，写）、`sendWindowMessage`（第 59 行起，写）调用。
   - `typed-notifications-tab.tsx:25–32` `request()`：每个请求**之前和之后各确认一次**，不一致就 `onIdentityChanged`；轮询在第 33–41 行（`setInterval 15000`，列表＋已选详情各一次 `request()`），`open()` 第 42 行、`act()` 第 43 行起。
   - `bounded-contact-messages-tab.tsx:34–48`（对话列表轮询）与第 50–70 行（已打开对话的消息窗口轮询；翻看历史时不轮询），都经 `read()`。
   - `relationship-inbox-panel.tsx`：
     - 第 128–143 行 `readInboxUnreadCounts(language, expectedActor?)`：确认 → `readWebInboxSummary` → 再确认；按 `[language, expectedActor]` 做 in-flight 合并。
     - 第 146–151 行 `fetchBadgeCount`：红点，在 `RelationshipInboxTrigger`（第 1372 行起，挂在 `orbit-account-shell.tsx`，**每个页面加载一次**，第 1387–1397 行）里调用 → 每个页面加载 2 次 `/api/account/me`。
     - 第 919–933 行：面板打开后计数轮询（15 秒），依赖含 `tab`，切页签会重启；第 934–942 行：打开面板时确认一次身份并取得 `actorId`。
   - `notification-source-page.tsx:9–20`：通知来源页每 15 秒 `load()`，前后各确认一次；`visibilitychange` 时重建。
   - 所有轮询在 `document.visibilityState === 'hidden'` 时跳过；面板关着时 0 次（W0030 实测）。
2. **响应里本来就带账号标记**（客户端已在核对）：`/api/inbox/summary` 的 `actorId`（`inbox-summary-client.ts` 核对）、对话列表与消息页的 `actorId`（`bounded-contact-messages-view-model.ts:28`）、通知列表每条的 `actorId`（`notification-inbox-view-model.ts:4`，空列表时没有可核对的条目）、通知详情的 `actorId`（同文件第 5 行）。
3. **W0030 实测频次**（3001，`next dev`，verify-plan，`~/orbit-sprint-evidence/web/sprint-W0030/run-01/07-polling.json`；dev 模式与 StrictMode 会让部分请求翻倍）：每 60 秒消息页签 `/api/account/me` 14 次、通知页签 18 次；页面加载 2 次；每个 15 秒周期消息页签 ×3、通知页签 ×4（另有 `/api/inbox/summary` ×1，`conversation-summaries` 或 `/api/inbox/notifications` ×1）。
4. **服务端**：`app/api/account/me/handler.ts:36–73`：
   - 非 mock 模式先 `resolveAuthenticatedApiActor()`（W0030 后为轻量身份读取：3 条语句／420 B，会话 id＝资料 id 时 2 条／409 B）；
   - 再 `createAccountSessionService(mode).getCurrentSession({ accountId, profileId, scenario, userId })`（`features/account/service-factory.ts:9–35` → `createLiveAccountSessionService({ provider: createConfiguredStorageAccountSessionProvider() })`）；
   - `features/account/live-service.ts`：`getCurrentSession`（第 293–305 行）→ `currentSession`（第 263–281 行）→ `provider.readAccountSessionGraph(identity)` → `sessionPayload`（第 208–261 行）＋`selectAccountAndProfile`（第 105 行起）。
   - `sessionPayload` 用到：账号 `id`、`name`；资料 `id`、`accountId`、`displayName`、`role`、`timezone`、`headline`、`relationshipGoal`、`homeMarket`、`preferredFollowUpWindow`、`preferredLanguage`；`graph.generatedAt`（`signedInAt`、`collectedAt`）；`graph.evidenceIds`（`provenance.evidenceIds`）。空库分支 `emptyLiveStorePayload`（第 190–206 行）同样用 `generatedAt`、`evidenceIds`。
5. **完整图读取**（`features/account/storage/account-live-record-provider.ts:310–384`）：有 subject 时资料按 id →（原始行数为 0 才）按 accountId → 账号按 id；每条都是 `store.listRecords({ limit: "unbounded", payloadFields, omitSearchText: true })`，**选出全部 19 列记录元数据**（`postgres-live-record-store.ts:75–95`），payload 投影为 `PROFILE_SESSION_FIELDS`（12 个，第 66–69 行）／`ACCOUNT_SESSION_FIELDS`（4 个，第 65 行）。`generatedAt` 是全部原始记录 `updatedAt` 的最大值（`latestTimestamp` 第 161–171 行，`rowToRecord` 的 `timestampToString`，即 `Date.toISOString()`）；`evidenceIds` 是全部原始记录 `evidence_ids` 去重（`evidenceIdsFor` 第 173–179 行，空时为 `["evidence:account-live-store-empty"]`）。**注意：这两项包括被 `accountFromRecord`／`profileFromRecord` 判为无效而跳过的行。**无 subject 时（`demoSignIn`）配置 provider 直接返回空图、0 条语句。
6. **W0030 的轻量读取**（同文件）：`IDENTITY_ROW_READABLE`（第 190–195 行，注释第 185–189 行，复用 `jsDateSafeTimestampSql`）、`identitySql()`（第 200–210 行，where／order by／参数顺序与 `listQuery` 相同，只返回 `payload` 投影＋`readable`）、`createIdentitySqlReader`（第 239–268 行，经 `identitySql: { client, read }` 即 `ConfiguredPostgresLiveRecordStore.customRead`）、配置 provider 接线（第 387–407 行）。W0030 实测：完整图 3 条／1,984 B（资料行 1,148 B、账号行 836 B，元数据约占 60%），轻量 420 B。D24 引用的账号会话服务单次约 1,978 B。
7. **审计棘轮**：`tests/audits/unbounded-list-reads.baseline.json:6`，`account-live-record-provider.ts` 计数 5，只许减少。
8. **生产构建**（操作规程见「决定」一节）：`next.config` 的 `distDir` 取 `ORBIT_NEXT_DIST_DIR`（默认 `.next`）；`.gitignore` 只忽略 `.next`、`.next-verify`。3001 验收 server 由 `scripts/verify-server.sh` 以 `next dev` 启动（`.next-verify`，本机库 `orbit_newui_events_20260922`，workspace `workspace:orbit-small-staging-20260917`，live 模式，示例开关开）。`npm run build` 会先跑 `images:lqip`、`build:reference-css` 再 `next build --webpack`。`next build` 会改写 `next-env.d.ts`（用户已有未提交改动，按协调者指令不还原、不提交）。

## 调用方与风险（GitNexus，`4722fcad`，`analyze --force --index-only` 全量重建）

增量索引这次 FTS 失败，按名查询会错配到无关符号；必须 `--force` 全量重建后再查。

| 符号（文件） | 等级 | 本 Sprint 动作 |
| --- | --- | --- |
| `readContactMessageActor`（`inbox-request.ts:8`） | MEDIUM，影响 28，直接 8 | 改为共享确认（或新增共享函数并切换调用点） |
| `readContactMessageActor`（`bounded-contact-messages-view-model.ts:13`，私有副本） | LOW，影响 10，直接 3 | 并入共享确认；写操作走强制新鲜确认 |
| `communicationRequest`（`inbox-request.ts:1`） | HIGH，影响 26，直接 3 | **不改** |
| `readInboxUnreadCounts`（`relationship-inbox-panel.tsx:129`） | LOW，影响 6，直接 2 | 前后确认改用共享确认 |
| `fetchBadgeCount`／`RelationshipInboxPanel`／`RelationshipInboxTrigger`（同文件） | **CRITICAL**，影响 31／31／38，执行流 11（挂在全站账号外壳上） | 只改确认方式，渲染与计数逻辑不改 |
| `TypedNotificationsTab`、`readMessageCards`、`readMessageWindow`、`NotificationSourcePage`、`readWebInboxSummary` | LOW（影响 1–6） | 确认方式随共享确认调整 |
| `createAccountMeGetHandler`（`app/api/account/me/handler.ts`） | LOW，影响 1 | 不改（经 service 间接受益） |
| `createLiveAccountSessionService`（`live-service.ts`）／`createAccountSessionService`（`service-factory.ts`） | LOW，影响 1／3（另一调用方 `api/account/session/sign-out/route.ts:44`，只用 `signOut`／`requireAccount`） | `currentSession` 改调轻量读取（缺方法时退回完整图） |
| `createStorageAccountSessionProvider` | **CRITICAL**，影响 34，直接 1 | 新增可选方法 |
| `createConfiguredStorageAccountSessionProvider` | MEDIUM，影响 86，直接 6 | 接线不变（复用已有 `identitySql`） |
| `readAccountSessionGraph`（接口，第 48 行） | MEDIUM，影响 89，直接 7；实现方法（第 310 行）**UNKNOWN** | **不改**（W31-2 已定 A）；UNKNOWN 已用文本搜索补查：消费者为 `live-service.ts:277`、`authenticated-actor.ts` 回退、`features/guide/progress.ts`、3 个脚本及测试 |

## 决定

### 客户端：共享身份确认（W31-1 已定 A，D25）

- 在 `inbox-request.ts` 提供唯一的共享确认，两个 `readContactMessageActor` 都走它（私有副本保留自己的错误类型，只换数据来源）：
  - **世代号（generation）**：共享确认维护一个单调递增的世代号。每次失效（见下）都把世代号加 1。每个底层请求在发出时记下当时的世代号。
  - **in-flight 合并**：同一世代内、同为普通确认的并发请求只发 1 个。共享请求不能挂在某个调用方的 `AbortSignal` 上（一个调用方取消不能让别人失败）；调用方用自己的 signal 做竞速，取消时照旧抛 `AbortError`。共享请求跟踪「仍在等待的消费者」数量，全部消费者都取消时可以中止底层请求（中止与否由 Generator 定，但见下条写缓存规则）。
  - **写缓存的条件**：底层请求成功完成时，**只有**「发出时的世代号＝当前世代号」**且**「至少还有一个未取消的消费者」才写入复用结果；否则结果只交给仍在等待的消费者（若有），不写缓存。这样「全部消费者取消后请求才完成」「失效后旧请求晚于新请求完成」都不会把旧结果写回。
  - **短时复用**：写入的成功结果在短于轮询周期的时间窗内复用（建议 10 秒），保证一个周期内红点计数、页签列表、已选详情的前后几次确认只发 1 次，下一个周期必定重新确认。
  - **失败不记住**：请求失败、响应不合格、`account.id` 为空时不写入复用结果，行为与现在一样（抛同样的错误）。
  - **失效**：任何调用方发现账号不一致（`/api/account/me` 与期望不符，或响应里的 `actorId` 不符、收到 401／403）时清掉复用结果、世代号加 1；此前发出、尚未完成的普通请求不再被新调用方合并，下一次确认必定重新请求。
  - **写前确认是独立屏障**：`confirmMessageWindowRead`、`sendWindowMessage`、`TypedNotificationsTab.act` 等写路径（Generator 开工时 grep 全部写路径列入 REPORT）写之前调用单独的写前确认：
    - 不读复用结果；
    - **不加入任何在它之前已经发出的普通确认**（哪怕还在进行中），必须在写操作被发起之后新发一个请求；
    - 只允许与「同一时刻、同样是写前确认」的调用合并（即在该写前请求发出之后才到来的写前确认可以共用它）；
    - 写前确认的结果与当前 `actorId` 不符 → 不发写请求，按现有方式报错／触发 `onIdentityChanged`，并使复用结果失效；
    - 写前确认成功后可以按「写缓存的条件」刷新复用结果。
- 计时器、`visibilitychange`、页签切换重启、历史翻页不轮询等现有规则一律不改；轮询周期仍是 15 秒。
- 备选 B（W31-1 未采用，后续候选）：轮询读取不再调 `/api/account/me`，只靠事实 2 的响应标记核对；打开面板与写操作前确认。

### 服务端：账号会话服务轻量读取（W31-2 已定 A，D25）

- `LiveAccountSessionProvider` 新增**可选**方法（建议名 `readAccountSessionView?(identity)`），返回类型就是 `LiveAccountSessionGraph`，对同一数据与 `readAccountSessionGraph(identity)` **深相等**（accounts、profiles、evidenceIds、generatedAt）。
  - 有 subject 且有 `identitySql` 时：语句顺序、回退条件（原始行数为 0 才按 accountId）、账号并行读取与完整图相同；每条语句经 `identitySql.read`（`customRead`，带 `profiles`／`accounts` 集合名，共享闸门与 in-flight 去重，写入驱逐，失败不缓存），SQL 发到 `identitySql.client`（已计量）。
  - **去重 key 与 W0030 身份读取隔离**：`customRead` 的去重表是整个 configured store 共用的，W0030 身份读取的 key 是 `["account-session-identity", workspaceId, collectionName, lookupField, value]`。会话读取的 key 必须同时包含**读取用途与投影版本**（如 `"account-session-view:v1"`）、workspaceId、集合名、查询字段、查询值和投影字段列表，保证与身份读取、与将来改了投影的版本都不会相撞；否则并发时会话读取可能拿到缺少 `updated_at`／`evidence_ids` 的身份读取结果。
  - 只选 `payload` 投影（资料 12 个字段、账号 4 个字段，同 `PROFILE_SESSION_FIELDS`／`ACCOUNT_SESSION_FIELDS`）、`updated_at`、`evidence_ids`、`readable`（复用 `IDENTITY_ROW_READABLE`）；where、order by、参数顺序照搬 `identitySql()`。
  - `generatedAt`、`evidenceIds` 按事实 5 用**全部原始行**计算（含被跳过的无效行），`updated_at` 的字符串化与 `rowToRecord` 相同。
  - 无 subject 或没有 `identitySql` 时直接调用 `readAccountSessionGraph`，不新增 `limit: "unbounded"`。
- `live-service.ts` 的 `currentSession` 改为 `provider.readAccountSessionView ? provider.readAccountSessionView(identity) : provider.readAccountSessionGraph(identity)`，其余不变。
- `readAccountSessionGraph`、`resolveAuthenticatedApiActor*`、`/api/account/me` handler 不改。

### 生产构建操作规程（SC-01；review P1）

基线与改后各用**一个唯一的 distDir 和端口**，不复用：

| 轮次 | 代码 | distDir | 端口 |
| --- | --- | --- | --- |
| 基线 | 基线 SHA（工作树切到该提交后构建） | `.next-w0031-base` | 3012 |
| 改后 | 功能 SHA | `.next-w0031-after` | 3013 |

每一轮按下面顺序做，每步输出存进证据目录：

1. **记录 3001 现状**：`lsof -nP -iTCP:3001 -sTCP:LISTEN` 记下 PID；`curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/` 记下健康状态码。3000 同样记录（只看，不动）。
2. **探测端口空闲**：`lsof -nP -iTCP:<端口> -sTCP:LISTEN` 必须无输出；被占用就换下一个空闲端口并在 REPORT 登记，**不结束占用它的进程**。
3. **构建**（在 `repos/orbits` 下；环境变量与 `scripts/verify-server.sh` 相同，只是不跑 `next dev`）：
   ```sh
   env ORBIT_NEXT_DIST_DIR=<distDir> ORBIT_DATABASE_TARGET="" ORBIT_EXPECTED_DATABASE_HOST=localhost \
     ORBIT_EXPECTED_WORKSPACE_ID=workspace:orbit-small-staging-20260917 ORBIT_WORKSPACE_ID=workspace:orbit-small-staging-20260917 \
     ORBIT_FEATURE_MODE=live ORBIT_MODULE_MODE=live ORBIT_GUIDE_DEMO=on ORBIT_GUIDE_DEMO_SINCE=2026-09-01 \
     AUTH_TRUST_HOST=true ORBIT_VERIFY_EXPECTED_DATABASE_NAME=orbit_newui_events_20260922 \
     npx next build --webpack
   ```
   若因缺 `images:lqip`／`build:reference-css` 产物而失败，先跑这两个脚本，再确认 `git status --short` 与构建前一致（`next-env.d.ts` 除外），不一致就停下报告。
4. **启动**：同一组环境变量、**同一个 `ORBIT_NEXT_DIST_DIR`**，`npx next start --port <端口>`，后台运行；立刻记录本次进程 PID（`$!`，并用 `lsof -nP -iTCP:<端口> -sTCP:LISTEN` 核对监听 PID 属于该进程树）。
5. **测量**：浏览器脚本只访问 `http://localhost:<端口>`。
6. **停止**：只 `kill <本次记录的 PID>`（必要时连同其子进程），轮询确认该 PID 已退出且端口不再监听；**不使用按名字或按端口批量结束进程的命令**。
7. **清理**：确认进程已退出后，才 `rm -rf repos/orbits/<distDir>`（只删本轮这一个目录；路径先 `echo` 核对以 `.next-w0031-` 开头）。
8. **复核**：再次记录 3001 的 PID 与健康状态码，必须与第 1 步相同；`git status --short` 与开工前一致（`next-env.d.ts` 除外）。

绝对禁止：移动、删除或改写 `.next`、`.next-verify`；在 3000、3001 上重启或结束进程；把任何构建目录暂存或提交。

## 流量口径与估算（编制时，dev 频次；以 SC-01 生产实测为准）

口径：1000 人**日活**、30 天，W0017 口径的数据库返回字节（每条语句返回行 JSON 字节之和）。**MB、GB 一律十进制**（1 MB＝1,000,000 B，1 GB＝1,000 MB，与 W0021 的「1.0 GB＝1,000 MB」一致）。本路径**不在** W0021 的 884 MB 用户路径总账里（W0029 预算表已注明口径外），单列。

三种次数要分开（review P2）：
- **客户端请求数**：浏览器发出的 `/api/account/me` 次数（SC-01 实测）。
- **逻辑读取次数**：服务端每个请求触发的账号解析与会话服务读取次数（每个 `/api/account/me` 请求各 1 次）。
- **实测 SQL 执行次数**：进程内 in-flight 去重合并后真正发到数据库的语句数（SC-04 在生产构建单实例下用计量或 SQL 拦截实测）。

月估算给两个口径：**单实例实测**（按实测 SQL 执行次数，含同进程去重的节省）与**跨实例不去重上限**（假设每个逻辑读取都落在不同实例、去重不生效，＝逻辑读取次数 × 每次语句字节）。下表是编制时的「跨实例不去重上限」估算。

频次假设（W31-4 已定 A，D25）：沿用 W30-4 ——收件箱每人每天停留 10 分钟（40 个 15 秒周期，消息、通知页签各 20 个）；另加每天打开收件箱 2 次；每人每天页面加载 10 次（`/app/agent` 4、`/app/events` 1、`/app/events/[id]` 2、`/app/contacts`、`/app/tasks`、`/app/start` 各 1）。

| 来源 | 改前 次／人／天 | 改后（A） | 改后（B） |
| --- | --- | --- | --- |
| 消息页签轮询（20 周期） | 60 | 20 | 0 |
| 通知页签轮询（20 周期） | 80 | 20 | 0 |
| 打开收件箱（2 次） | 2 | ≤2 | 2 |
| 页面加载红点（10 次） | 20 | 10 | 10 |
| **合计** | **162** | **≤52** | **12** |
| 次／月 | 4,860,000 | ≤1,560,000 | 360,000 |

单次字节：改前＝账号解析 420 B＋会话服务完整图约 1,978 B＝约 2,398 B；改后＝420 B＋会话服务轻量读取（估算约 900 B：资料行约 600 B、账号行约 300 B）＝约 1,320 B。

| 情形 | 月估算 |
| --- | --- |
| 改前 | 约 11,654 MB（其中会话服务约 9,613 MB，即 D24 的「约 9.5 GB」口径；账号解析约 2,041 MB） |
| 只改客户端（A），服务端不改 | 约 3,741 MB |
| 只改服务端，客户端不改 | 约 6,415 MB |
| **改后（A＋服务端）** | **约 2,059 MB** |
| 改后（B＋服务端） | 约 475 MB |

- 生产构建下 StrictMode 不再重复请求，改前的真实频次可能低于 dev；SC-04 用 SC-01 的生产实测频次重算这两张表，并把每一行拆成「客户端请求数／逻辑读取次数／实测 SQL 执行次数」三列，月估算同时给「单实例实测」与「跨实例不去重上限」。
- 口径外、本 Sprint 不改：轮询端点自身（`/api/inbox/summary`、`/api/inbox/notifications`、`conversation-summaries`）每个请求 1 次账号解析（420 B），按上述假设每人每天 80 次，约 1,008 MB／月（见 W31-5）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

- **必读（行号按 `4722fcad`）：**
  - `app/(app)/app/inbox/inbox-request.ts`：全文（13 行）。
  - `app/(app)/app/inbox/bounded-contact-messages-view-model.ts`：全文（65 行）。
  - `app/(app)/app/inbox/typed-notifications-tab.tsx`：第 20–50 行。
  - `app/(app)/app/inbox/bounded-contact-messages-tab.tsx`：第 25–75 行。
  - `app/(app)/app/inbox/relationship-inbox-panel.tsx`：第 125–152、905–945、1372–1400 行（只改确认方式）。
  - `app/(app)/app/inbox/notification-source-page.tsx`：全文（28 行）；`inbox-summary-client.ts`、`notification-inbox-view-model.ts`：全文（核对响应标记）。
  - `app/api/account/me/handler.ts`：全文（只读）。
  - `features/account/live-service.ts`：第 100–140、185–305 行。
  - `features/account/storage/account-live-record-provider.ts`：全文（407 行）。
  - `shared/storage/postgres-live-record-store.ts`：第 53–150（行类型、`recordColumns`、`timestampToString`、`rowToRecord`）、192–277 行（`listQuery`），只读。
  - `shared/storage/configured-live-record-store.ts`：第 25–45 行（`customRead` 契约），只读。
- **测试：**
  - 客户端：`tests/pages/app-relationship-inbox-panel.test.tsx`、`tests/pages/bounded-contact-messages-browser.test.ts`、`tests/pages/inbox-summary-client.test.ts`、`tests/ui/orbit-top-nav-structure.test.ts`、`tests/pages/app-agent-iorbit-screens.test.tsx`、`tests/pages/app-agent-chat-history.test.ts`、`tests/api/relationship-pages.test.ts`。
  - 服务端：`tests/capabilities/account-session-identity-read.test.ts`（W0030，PG 夹具、四时区、配置层计量集成测试的写法都可复用）、`tests/capabilities/account-live-store.test.ts`、`tests/capabilities/mock-account-session.test.ts`、`tests/api/account-scoped-aggregate-isolation.test.ts`、`tests/api/authenticated-actor-context.test.ts`、`tests/performance/inbox-summary-request.test.ts`（需 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，W0030 做法）、`tests/storage/configured-live-record-store.test.ts`、`tests/audits/unbounded-list-reads.test.ts`。
- **测量：** 复制 `~/orbit-sprint-evidence/web/sprint-W0030/run-01/` 的 `browser-check.mjs`（端点频次）、`measure-w0030-poll-cycle.ts`（每端点 SQL）、`measure-w0030-identity-bytes.ts`（单次字节）到本 Sprint 证据目录再扩展，不放进仓库。
- **前序交接要点：**
  - W0030：`LiveAccountSessionProvider.readAccountSessionIdentity?`、`createStorageAccountSessionProvider({ identitySql: { client, read } })`、`IDENTITY_ROW_READABLE`；新方法可选、缺失时退回完整图（D23 W30-2 A）；坏数据失败语义与旧读取完全一致（W30-3 A，同 D20）。
  - W0028：`ConfiguredPostgresLiveRecordStore.customRead({ collectionName, key, read })`（与 store 共用闸门与 in-flight 去重，写入驱逐，失败不缓存）、`jsDateSafeTimestampSql(column)`；时区边界在 UTC、Asia/Shanghai、America/Los_Angeles、Pacific/Kiritimati 四个会话时区对照。
  - W0017／W0021：流量口径拦截 `pg.Client.prototype.query`，临时 schema 里测，测完删除。
  - W0016：3001 验收 server（`scripts/verify-server.sh`）；verify 账号会话 id＝账号 id；cookie 用 `scripts/verify-session-cookie.ts` 签发，不在登录表单输入密码；用完 `--reset verify-plan`。
- **易错边界（都有对应 SC）：**
  - 生产构建严格按「生产构建操作规程」：基线、改后两个唯一 distDir（`.next-w0031-base`／`.next-w0031-after`）与端口，build 与 start 传同一 `ORBIT_NEXT_DIST_DIR`，启动前探测端口、记录并只结束本次 PID，确认退出后才删目录；3001 的 PID 与健康状态前后不变；**绝不移动、删除或改写 `.next-verify`**（SC-01）。
  - 共享确认不能把失败、空账号或别的账号的结果当成功复用；世代号变了或已无消费者时，晚到的请求不能写缓存；共享请求不受单个调用方取消影响（SC-02）。
  - 写前确认是独立屏障，不能加入写操作发起前已在进行的普通确认（SC-02）。
  - 会话读取的去重 key 必须含读取用途与投影版本，不能与 W0030 身份读取相撞（SC-03）。
  - 轮询周期、隐藏时停止、切页签重启、历史翻页不轮询都不变；新消息仍最多 15 秒出现（SC-01、SC-02）。
  - 账号不一致时照旧触发 `onIdentityChanged`／`Account changed`，不静默显示别人的数据（SC-02）。
  - `/api/account/me` 响应逐字段不变，含 `provenance.evidenceIds` 与 `collectedAt`、`signedInAt`；`generatedAt`／`evidenceIds` 要算上被跳过的无效行（SC-03）。
  - 轻量读取的语句顺序、回退条件、排序、坏数据失败语义、闸门集合名、计量链路与 W0030 相同；不新增 `limit: "unbounded"`；不改 `readAccountSessionGraph`、`configured-live-record-store.ts`（SC-03、SC-05）。

## 范围与文件

- **修改：**
  - `app/(app)/app/inbox/inbox-request.ts`：共享确认。
  - `app/(app)/app/inbox/bounded-contact-messages-view-model.ts`、`typed-notifications-tab.tsx`、`relationship-inbox-panel.tsx`、`notification-source-page.tsx`：确认调用改走共享确认／写前强制新鲜；不改渲染。
  - `features/account/storage/account-live-record-provider.ts`：新可选方法与 SQL。
  - `features/account/live-service.ts`：`currentSession` 改调轻量读取。
  - 对应测试；tsc 报出的替身（只加方法或类型，不改断言）。
- **新建：**
  - `tests/pages/inbox-identity-confirmation.test.ts`（共享确认：合并、复用窗、失败不记住、失效与世代号、晚到与取消交错、写前屏障竞态、取消隔离）。
  - `tests/capabilities/account-session-view-read.test.ts`（会话服务轻量读取：PG 等价矩阵、SQL 形状、闸门、去重、写入失效、计量、与 W0030 身份读取交叉并发、`/api/account/me` 响应等价）。
  - 测量与浏览器脚本：只放证据目录。
- **排除：** `/api/account/me` 响应形状；`resolveAuthenticatedApiActor*`；`readAccountSessionGraph`；其他轮询端点的服务端读取（W31-5）；名片批次轮询；轮询周期与 UI；`shared/storage/*`；数据库迁移与索引；部署。

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0031-01 | **生产构建频次，改前与改后**。按「生产构建操作规程」在基线 SHA（`.next-w0031-base`，3012）与功能 SHA（`.next-w0031-after`，3013）上各做一次生产构建，用 verify-plan 登录，浏览器记录每个请求的端点与时间戳，场景：① 页面加载 `/app/agent`；② 收件箱消息页签；③ 消息页签打开一段对话；④ 通知页签；⑤ 通知页签打开一条通知；⑥ 通知来源页；⑦ 页面隐藏 30 秒。<br>**分两个阶段记录（review P2）**：<br>- **启动阶段**：从进入场景（加载页面、打开面板、切页签、打开详情）到首轮请求全部完成；单独列出每个端点的次数。改后要求：① `/api/account/me` ≤1；②～⑥ 启动阶段 `/api/account/me` ≤1（切页签、打开详情时若复用窗内已有结果可为 0）。<br>- **稳态阶段**：从首轮完成后的下一个轮询 tick 开始，观察 60 秒，按半开区间 `[t0, t0+60s)` 计数，并逐一核对相邻两次 `/api/account/me` 的时间间隔。改后要求：②～⑥ 稳态下 `[t0, t0+60s)` 内 `/api/account/me` ≤4，且相邻两次间隔 ≥15 秒减 1 秒容差（容差只为计时抖动，REPORT 写明实测最小间隔）；⑦ 0 次；其他端点（`/api/inbox/summary`、`/api/inbox/notifications`、`conversation-summaries`、消息窗口）的每周期次数与改前相同，周期仍为 15 秒。<br>**收尾**：规程第 6～8 步全部完成——两个本次 PID 已退出、两个 distDir 已删；3001 的 PID 与健康状态码与开工前相同；`.next`、`.next-verify` 未被触碰；`git status --short` 与开工前一致（`next-env.d.ts` 除外）。 | `01-prod-baseline.json`、`05-prod-after.json`（每请求时间戳、分阶段计数、相邻间隔）；规程各步命令输出（端口探测、PID、kill 与退出确认、rm 前路径核对、3001 前后 PID／状态码） |
| SC-W0031-02 | **客户端身份确认语义**（替身 `fetch`，假时钟）：<br>(a) 同一周期内红点计数、页签列表、已选详情的前后确认合计只发 1 次 `/api/account/me`；下一周期重新发；<br>(b) 并发确认合并为 1 个请求；一个调用方取消只让它自己抛 `AbortError`，其他调用方照常拿到结果；<br>(c) `/api/account/me` 失败、非 2xx、`success !== true`、`account.id` 为空 → 调用方得到与改前相同的错误，且结果不被复用（下一次确认重新请求）；<br>(d) 账号从 A 变成 B（`/api/account/me` 返回 B，或某个响应的 `actorId` 为 B，或收到 401／403）→ 与改前相同地触发 `onIdentityChanged`／`Account changed`，复用结果被清掉、世代号加 1；不会用 A 的结果渲染 B 的数据；<br>(e) **写前屏障**：写操作（发消息、确认已读、处理通知）之前一定发出一次写操作发起之后才开始的新请求，不用时间窗内的旧结果，也不加入更早开始的普通确认；**竞态测试**：普通确认 pending（将返回 A）→ 账号切换为 B → 发起写操作 → 断言写前确认另发了新请求、拿到 B、写请求没有以 A 的身份发出（按现有方式报错／`onIdentityChanged`）；同批两个写前确认只发 1 个请求；<br>(f) **晚到与取消交错**：① 全部消费者都取消后底层请求才成功完成 → 不写缓存，下一次确认重新请求；② 失效后，旧世代的 A 请求晚于新世代的 B 请求完成 → 缓存保持 B，之后的确认拿到 B；③ 一个消费者取消、另一个仍在等待 → 结果照常交给后者并写缓存（世代未变时）；<br>(g) **既有测试**：非身份请求、可见状态与错误语义的既有断言保持不变；旧的 `/api/account/me` 调用次数断言按新契约更新，改动逐条列在 REPORT，并由 (a)～(f) 的新增 RED 覆盖。 | 新测试先 RED 后 GREEN＋现有测试输出＋REPORT 断言改动清单 |
| SC-W0031-03 | **会话服务轻量读取等价**。本机 PG 临时 schema 造数据，对每个场景分别用旧路径（`readAccountSessionGraph`）与新路径（`readAccountSessionView`）读取，结果深相等（accounts、profiles、evidenceIds、generatedAt），语句数与顺序相同；再经 `createLiveAccountSessionService` 各生成一次 `/api/account/me` 的 `data`，深相等：<br>- 按资料 id、按账号 id（回退）、都不命中（空库分支）；<br>- 无效资料（缺 `displayName`、`createdAt` 为空白、`accountId` 为数字）命中 id → 不回退，且 `generatedAt`／`evidenceIds` 仍计入该行；<br>- 账号缺失、已删除、`name` 为空；重复记录；已删除与别的工作区不返回；archived 照常返回；<br>- 资料展示字段缺失或非字符串（`optionalString` 行为）；`evidence_ids` 为空、多条、跨行重复；<br>- `created_at`／`updated_at` 为 ±infinity 或超出 JS 日期范围 → 新旧都 reject；`occurred_at`／`deleted_at` 无穷不 reject、超出 JS 范围的有限值 reject；边界在四个会话时区对照；<br>- 无 subject（`demoSignIn`）、mock 模式、未配置库 → 行为不变。<br>**SQL 形状**：只返回 `payload`、`updated_at`、`evidence_ids`、`readable`；不返回 `record_id`、`source_*`、`provider*`、`user_id`、`target_*`、`search_text` 等；含 `lifecycle_state <> 'deleted'`。<br>**闸门／去重／计量**（同 W0030 SC-02）：`assertAllowed` 次数与集合名序列与旧路径相同；并发相同读取只发 1 次；失败后重新发；store 写入驱逐进行中的读取；配置层集成测试里共享闸门 snapshot 的 rows／bytes 增量等于轻量 SQL 实际返回量，且 SQL 发到 `configured.client`。<br>**与 W0030 身份读取交叉（review P1）**：同一 configured store 上，对同一 identity 同时并发 `readAccountSessionIdentity` 与 `readAccountSessionView`：两者各自发出自己的 SQL（去重 key 不相撞，会话读取结果含 `updated_at`／`evidence_ids` 且与完整图深相等，身份读取结果与 W0030 相同）；各自的闸门调用与计量 rows／bytes 分别等于各自 SQL 的返回量；两者都在进行中时经同一 store 做一次写入，写入之后发起的两种读取都重新发 SQL。key 的构成（含用途与投影版本）写进 REPORT。<br>**接线**：配置的 PG provider 下 `/api/account/me` 的会话服务调轻量读取 1 次、`readAccountSessionGraph` 0 次。 | 新测试先 RED 后 GREEN；PG 部分在 `orbit_test` 上 0 skip |
| SC-W0031-04 | **流量**：<br>- 按 W0030 的造数（真实注册路径、60 KB 头像与导入文档）出单次对照：`/api/account/me` 的账号解析、会话服务各自的语句数、行数、字节，改前改后；**会话服务单次字节 ≤ 改前的 50%**，语句数不变。<br>- 用 SC-01 的生产实测频次（缺的场景用上文假设补，写明）重算「次／人／天」与月估算两张表：每行分列**客户端请求数、逻辑读取次数、实测 SQL 执行次数**（后者在生产构建单实例下用计量或 SQL 拦截实测）；月估算同时给**单实例实测**与**跨实例不去重上限**两列；改前、改后各一行，另列「每次节省字节」，便于频次改了直接重算；MB／GB 按十进制。<br>- 月上限按 W31-3（D25）：跨实例不去重上限 ≤2.5 GB／月（十进制），超出则本项 failed、交用户裁决；结果登记给 W0019。| 测量输出＋REPORT 两张表 |
| SC-W0031-05 | **回归**：<br>- `npx tsc --noEmit -p .` 通过；<br>- 上下文包列出的客户端与服务端测试全部通过；`unbounded-list-reads` 中 `account-live-record-provider.ts` 计数不超过 5（该审计文件的基线失败项与本 Sprint 无关，照 W0030 处理）；<br>- 3001 上 verify-plan 打开收件箱消息、通知两个页签和一条通知来源，桌面 1440 与手机 375，控制台 0 错误；新消息在 15 秒内出现（用第二个验收账号发一条，或用种子脚本造一条，只读账号不写）；<br>- 一次全量基线对照，没有新增失败；<br>- 一次 Codex 代码 review（重点：确认复用与失效、世代号与晚到请求、写前屏障、取消隔离、去重 key 隔离、`generatedAt`／`evidenceIds` 计算、闸门集合名），由同一 Generator 修复。 | tsc、测试输出、截图、RULES §5.2 对照、review 记录 |

## 一次 Generator 的执行顺序

1. 复核进入条件（W0029 已合并；W31-1～5 已决定），保存基线与 Planner 哈希；`git diff 4722fcad HEAD -- <修改白名单>` 核对行号；GitNexus 全量重建索引（`analyze --force --index-only`），逐个符号 upstream impact，UNKNOWN 文本补查。
2. **生产基线（SC-01 改前）**：在基线 SHA 上按「生产构建操作规程」第 1～8 步（`.next-w0031-base`，端口 3012）构建、启动、测量、只结束本次 PID、确认退出后删目录、复核 3001。再跑单次字节测量拿改前数据（含单实例实测 SQL 执行次数）。
3. 写 RED：SC-02 共享确认测试、SC-03 等价矩阵与 SQL 形状、SC-03 接线断言。
4. 最小实现：共享确认 → 各调用点切换（写前新鲜）→ provider 新方法与 SQL → `currentSession` 切换 → 补替身。
5. 定向测试与 tsc；测改后单次字节；对新 SQL 做 EXPLAIN（资料按 id、按 accountId、账号按 id）。
6. **生产复测（SC-01 改后）**：在功能提交上按同一规程（`.next-w0031-after`，端口 3013）构建、测量与清理。
7. 3001 浏览器验证 → 暂存区 `detect-changes` → 按路径提交（`next-env.d.ts` 不提交）→ 全量对照 → Codex 代码 review，同一 Generator 修复 → 写 REPORT 并交接。

## 最小测试与检查

- **档位：H。** 理由：改的是全站账号外壳上收件箱的身份确认（`RelationshipInboxTrigger`／`fetchBadgeCount` CRITICAL，执行流 11），属 RULES §5.1 的身份类变化；服务端新增 SQL，扩展 CRITICAL 的 `createStorageAccountSessionProvider`；经共享闸门与 in-flight 去重。
- **开发定向集：** 两个新测试；`app-relationship-inbox-panel`、`bounded-contact-messages-browser`、`inbox-summary-client`；`account-live-store`、`account-session-identity-read`、`configured-live-record-store`、`unbounded-list-reads`。PG 测试先导出 `ORBIT_EVENT_DATABASE_URL`（指向本机 `orbit_test`）并跑 `node scripts/assert-local-test-databases.mjs`；**不要 source `.env`**。
- **收口：** SC-05 全部。
- **不运行：** 付费 AI、Preview、生产库、部署。

## 失败与交接

REPORT 需要写明：
- 共享确认的最终做法（复用窗长度、失效条件、写前新鲜的调用点清单）；
- 生产构建改前改后频次表，与 W0030 dev 数字的差异；
- 会话服务轻量读取的命名、SQL 与等价矩阵覆盖；
- 单次字节对照、次／人／天与月估算两张表及假设；
- EXPLAIN 结果；
- 生产构建的清理证据；
- 给 W0019：`/api/account/me` 路径的月上限（按 W31-3），上线后在 Neon 控制台对照会话服务语句（`orbit_records`，返回列只有 `payload`、`updated_at`、`evidence_ids`、`readable`）的返回量；
- 后续候选：轮询端点自身的账号解析（W31-5）、名片批次轮询、`features/guide/progress.ts` 的 `configuredAccountCreatedAt`。

交接：分支 `sprint/W0031-inbox-identity-polling`，固定最终 SHA，目标合并到 `chat-agent`。

回退：revert 本 Sprint 的提交即可。客户端恢复逐次确认；服务端新方法是可选增量，`currentSession` 退回 `readAccountSessionGraph` 即恢复原行为。

## 开放问题

无。W31-1～W31-5 已由用户决定（D25），见「已定决定」表；选项与推荐理由的原文保留在 revision 2（`6e0663ca` 之后的 scratchpad 版本）。

## 观察项（不在本 Sprint 处理）

- 名片批次轮询（上传／识别中每 2.5 秒一次）仍按 W0030 估算，未在生产构建下实测。
- W0030 全站受益表中其他页面入口的账号解析，已由 W0030 改轻；频次本身不在本 Sprint 范围。

## review 处理

| review 意见（`scratchpad/w0031/codex-plan-review.txt`） | 处理 |
| --- | --- |
| P1 写前「强制新鲜确认」仍允许合并更早开始的普通 in-flight 请求，不能证明确认发生在写之前 | **接受**。「决定」一节把写前确认改为独立屏障：不读复用结果、不加入写操作发起前已在进行的普通确认，只与同批写前确认合并；结果与当前 `actorId` 不符则不发写请求。SC-02 (e) 加「普通确认 pending → 切换账号 → 发起写操作」竞态测试与同批合并测试；易错边界同步 |
| P1 取消与失效没有定义共享请求晚到时的缓存竞争 | **接受**。引入世代号：每次失效加 1，底层请求记下发出时的世代号；只有完成时世代号未变且仍有未取消的消费者才写缓存。SC-02 (f) 补「全部消费者取消后完成」「失效后旧 A 请求晚于 B 请求完成」「部分消费者取消」三种交错 |
| P1 轻量会话读取复用 `customRead`，未规定与 W0030 身份读取隔离的去重 key | **接受**。「决定」一节写明 key 必须含读取用途与投影版本（如 `account-session-view:v1`）、workspaceId、集合名、查询字段与值、投影字段；SC-03 加 `readAccountSessionIdentity` 与 `readAccountSessionView` 同 identity 交叉并发测试，分别验证结果、闸门与计量、写入驱逐；易错边界同步 |
| P1 生产构建隔离与清理不足以证明不影响 3001；两个目录与单一 `.next-w0031-prod` 矛盾 | **接受**。新增「生产构建操作规程」：基线 `.next-w0031-base`／3012、改后 `.next-w0031-after`／3013；build 与 start 显式传同一 `ORBIT_NEXT_DIST_DIR`，写出完整命令；启动前 `lsof` 探测端口空闲，记录本次 PID，只 kill 该 PID 并确认退出后才删对应目录（删前核对路径前缀）；前后记录 3001 的 PID 与健康状态码必须不变；明确绝不移动、删除或改写 `.next`、`.next-verify`。SC-01、执行顺序第 2、6 步与进入条件同步 |
| P2 60 秒内 ≤4 次存在计时边界歧义 | **接受**。SC-01 分「启动阶段」与「稳态阶段」记录；稳态从首轮完成后的下一个 tick 起按半开区间 `[t0, t0+60s)` 计数，并逐一核对相邻两次 `/api/account/me` 间隔 ≥15 秒（1 秒计时容差，REPORT 写实测最小间隔） |
| P2 「现有客户端测试断言不改」与主动减少请求次数冲突 | **接受**。SC-02 (g) 改为：非身份请求、可见状态与错误语义的既有断言保持；旧 `/api/account/me` 次数断言按新契约更新，逐条列入 REPORT，由新增 RED 覆盖 |
| P2 流量重算未区分请求数、逻辑读取与 SQL 执行次数，未说明十进制／二进制 | **接受**。「流量口径」一节定义三种次数与「单实例实测」「跨实例不去重上限」两个口径，明确 MB／GB 为十进制；编制时估算标为跨实例上限；SC-04 要求月表分列三种次数和两个口径；W31-3 按跨实例上限判定 |

## 修订记录

- revision 1（2026-09-29）：初版。依据 D24、W0030 REPORT 全站受益表与观察项；GitNexus 在 `4722fcad` 全量重建索引后查询。待方案 review 与 W31-1～5 决定。
- revision 2（2026-09-29）：按 Codex 方案 review（4 条 P1、3 条 P2，全部接受）修订，见「review 处理」：写前确认改为独立屏障；共享确认引入世代号与晚到写缓存规则；会话读取去重 key 含用途与投影版本并加交叉并发测试；新增生产构建操作规程（两个唯一 distDir／端口、PID 管理、3001 前后核对、不碰 `.next-verify`）；SC-01 分启动与稳态阶段、半开区间与间隔判定；SC-02 既有断言口径调整；流量口径分三种次数与两个月估算口径、十进制。W31-1～W31-5 仍为推荐默认，待用户确认。SC 数量不变。
- revision 3（2026-09-29）：并入用户决定 D25（W31-1 选 A：带世代号的共享确认＋写前独立屏障；W31-2～W31-5 按推荐，W31-3 上限定为 ≤2.5 GB／月）；开放问题表移为「已定决定」表，进入条件打勾，各处「推荐」改为「已定」。SC 不变。
