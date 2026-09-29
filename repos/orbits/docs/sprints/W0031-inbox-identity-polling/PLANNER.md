# Sprint W0031 — 收件箱轮询身份确认与 `/api/account/me` 瘦身

**Plan revision:** 1（2026-09-29）。**模式:** existing-codebase / single-generator。运行状态以登记表为准。

**原需求:** RV-03、RV-05。来源：W0030 REPORT「全站受益表」与「观察项」，用户决定 D24（2026-09-29）。

**单一目标:** 收件箱打开时，
1. **客户端**：整个收件箱（红点计数、消息页签、通知页签、通知来源页）每个 15 秒轮询周期只向 `/api/account/me` 确认一次身份，几个轮询共用这一次结果；写操作（发消息、标记已读、处理通知）之前仍单独做一次新鲜确认。轮询周期仍是 15 秒，页面可见行为与新消息出现的及时性不变。
2. **服务端**：`/api/account/me` 的账号会话服务改用轻量读取，只取 `sessionPayload` 需要的列；响应形状与内容逐字段不变，语句数不变，失败语义、闸门、去重、计量与 W0030 相同。

先在**生产构建**下实测真实轮询与页面加载频次作为基线，再改、再测。

**易读目标:** [GOAL.md](GOAL.md)。

**基线:** 编制时 `chat-agent` `4722fcad`。开工时 W0029 应已合并，基线改为 W0029 合并后的 SHA；本文件行号按 `4722fcad` 核对（W0029 不碰本 Sprint 的文件），Generator 开工时用 `git diff 4722fcad HEAD -- <修改白名单>` 复核并在 REPORT 登记。

**进入条件:**
- W0029 已 completed 并合并进 `chat-agent`（执行顺序 W0029 → W0031 → W0019，D24）。
- W31-1～W31-5 已由用户决定（见「开放问题」；未决定前本 Sprint 为 planned，不启动）。
- 本机 PG 测试库 `orbit_test` 可用；3001 验收 server 可用；本机有一个空闲端口（建议 3002）给生产构建用。
- 不需要云端授权，不调用付费 AI，不部署。

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
8. **生产构建**：`next.config` 的 `distDir` 取 `ORBIT_NEXT_DIST_DIR`（默认 `.next`）；`.gitignore` 只忽略 `.next`、`.next-verify`。3001 验收 server 由 `scripts/verify-server.sh` 以 `next dev` 启动（`.next-verify`，本机库 `orbit_newui_events_20260922`，workspace `workspace:orbit-small-staging-20260917`，live 模式，示例开关开）。`npm run build` 会先跑 `images:lqip`、`build:reference-css` 再 `next build --webpack`。`next build` 会改写 `next-env.d.ts`（用户已有未提交改动，按协调者指令不还原、不提交）。

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
| `readAccountSessionGraph`（接口，第 48 行） | MEDIUM，影响 89，直接 7；实现方法（第 310 行）**UNKNOWN** | **不改**（W31-2 推荐 A）；UNKNOWN 已用文本搜索补查：消费者为 `live-service.ts:277`、`authenticated-actor.ts` 回退、`features/guide/progress.ts`、3 个脚本及测试 |

## 决定

### 客户端：共享身份确认（W31-1 推荐 A）

- 在 `inbox-request.ts` 提供唯一的共享确认，两个 `readContactMessageActor` 都走它（私有副本保留自己的错误类型，只换数据来源）：
  - **in-flight 合并**：同时发起的确认只发 1 个请求。共享请求不能挂在某个调用方的 `AbortSignal` 上（一个调用方取消不能让别人失败）；调用方用自己的 signal 做竞速，取消时照旧抛 `AbortError`。
  - **短时复用**：成功结果在短于轮询周期的时间窗内复用（建议 10 秒），保证一个周期内红点计数、页签列表、已选详情的前后几次确认只发 1 次，下一个周期必定重新确认。
  - **失败不记住**：请求失败、响应不合格、`account.id` 为空时不写入复用结果，行为与现在一样（抛同样的错误）。
  - **失效**：任何调用方发现账号不一致（`/api/account/me` 与期望不符，或响应里的 `actorId` 不符、收到 401／403）时清掉复用结果，下一次确认必定重新请求。
  - **写操作强制新鲜**：`confirmMessageWindowRead`、`sendWindowMessage`、`TypedNotificationsTab.act` 等写路径（Generator 开工时 grep 全部写路径列入 REPORT），写之前绕过复用结果重新确认（可与同时进行的确认合并，但不能用时间窗内的旧结果）。
- 计时器、`visibilitychange`、页签切换重启、历史翻页不轮询等现有规则一律不改；轮询周期仍是 15 秒。
- 备选 B（见 W31-1）：轮询读取不再调 `/api/account/me`，只靠事实 2 的响应标记核对；打开面板与写操作前确认。

### 服务端：账号会话服务轻量读取（W31-2 推荐 A）

- `LiveAccountSessionProvider` 新增**可选**方法（建议名 `readAccountSessionView?(identity)`），返回类型就是 `LiveAccountSessionGraph`，对同一数据与 `readAccountSessionGraph(identity)` **深相等**（accounts、profiles、evidenceIds、generatedAt）。
  - 有 subject 且有 `identitySql` 时：语句顺序、回退条件（原始行数为 0 才按 accountId）、账号并行读取与完整图相同；每条语句经 `identitySql.read`（`customRead`，带 `profiles`／`accounts` 集合名，共享闸门与 in-flight 去重，写入驱逐，失败不缓存），SQL 发到 `identitySql.client`（已计量）。
  - 只选 `payload` 投影（资料 12 个字段、账号 4 个字段，同 `PROFILE_SESSION_FIELDS`／`ACCOUNT_SESSION_FIELDS`）、`updated_at`、`evidence_ids`、`readable`（复用 `IDENTITY_ROW_READABLE`）；where、order by、参数顺序照搬 `identitySql()`。
  - `generatedAt`、`evidenceIds` 按事实 5 用**全部原始行**计算（含被跳过的无效行），`updated_at` 的字符串化与 `rowToRecord` 相同。
  - 无 subject 或没有 `identitySql` 时直接调用 `readAccountSessionGraph`，不新增 `limit: "unbounded"`。
- `live-service.ts` 的 `currentSession` 改为 `provider.readAccountSessionView ? provider.readAccountSessionView(identity) : provider.readAccountSessionGraph(identity)`，其余不变。
- `readAccountSessionGraph`、`resolveAuthenticatedApiActor*`、`/api/account/me` handler 不改。

## 流量口径与估算（编制时，dev 频次；以 SC-01 生产实测为准）

口径：1000 人**日活**、30 天，W0017 口径的数据库返回字节（每条语句返回行 JSON 字节之和）。本路径**不在** W0021 的 884 MB 用户路径总账里（W0029 预算表已注明口径外），单列。

频次假设（W31-4 推荐）：沿用 W30-4 ——收件箱每人每天停留 10 分钟（40 个 15 秒周期，消息、通知页签各 20 个）；另加每天打开收件箱 2 次；每人每天页面加载 10 次（`/app/agent` 4、`/app/events` 1、`/app/events/[id]` 2、`/app/contacts`、`/app/tasks`、`/app/start` 各 1）。

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

- 生产构建下 StrictMode 不再重复请求，改前的真实频次可能低于 dev；SC-04 用 SC-01 的生产实测频次重算这两张表。
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
  - 生产构建用独立 distDir（如 `.next-w0031-prod`）和独立端口（如 3002），**不动 3000、3001 及其构建目录**；用完停进程、删目录；构建前后 `git status --short` 除 `next-env.d.ts` 外无变化，任何构建产物都不暂存（SC-01）。
  - 共享确认不能把失败、空账号或别的账号的结果当成功复用；写操作不能用时间窗内的旧结果；共享请求不受单个调用方取消影响（SC-02）。
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
  - `tests/pages/inbox-identity-confirmation.test.ts`（共享确认：合并、复用窗、失败不记住、失效、写前新鲜、取消隔离）。
  - `tests/capabilities/account-session-view-read.test.ts`（会话服务轻量读取：PG 等价矩阵、SQL 形状、闸门、去重、写入失效、计量、`/api/account/me` 响应等价）。
  - 测量与浏览器脚本：只放证据目录。
- **排除：** `/api/account/me` 响应形状；`resolveAuthenticatedApiActor*`；`readAccountSessionGraph`；其他轮询端点的服务端读取（W31-5）；名片批次轮询；轮询周期与 UI；`shared/storage/*`；数据库迁移与索引；部署。

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0031-01 | **生产构建频次，改前与改后**。在基线 SHA 与功能 SHA 上各做一次生产构建（独立 distDir、独立端口，环境变量同 `verify-server.sh`，只把 `next dev` 换成 `next build --webpack`＋`next start`），用 verify-plan 登录，浏览器记录下列场景各 60 秒内每个端点的请求次数：① 页面加载 `/app/agent`；② 收件箱消息页签；③ 消息页签打开一段对话；④ 通知页签；⑤ 通知页签打开一条通知；⑥ 通知来源页；⑦ 页面隐藏 30 秒。<br>**改后要求**：②～⑥ 稳态下 `/api/account/me` 每 15 秒最多 1 次（60 秒内 ≤4，另允许打开面板或切页签时多 1 次）；① `/api/account/me` ≤1；⑦ 0 次；其他端点（`/api/inbox/summary`、`/api/inbox/notifications`、`conversation-summaries`、消息窗口）的每周期次数与改前相同，周期仍为 15 秒。<br>收尾：两个进程已停、两个构建目录已删，`git status --short` 与开工前一致（`next-env.d.ts` 除外），3000／3001 未受影响。 | `01-prod-baseline.json`、`05-prod-after.json`（每场景端点计数＋时间线）；清理命令输出 |
| SC-W0031-02 | **客户端身份确认语义**（替身 `fetch`，假时钟）：<br>(a) 同一周期内红点计数、页签列表、已选详情的前后确认合计只发 1 次 `/api/account/me`；下一周期重新发；<br>(b) 并发确认合并为 1 个请求；一个调用方取消只让它自己抛 `AbortError`，其他调用方照常拿到结果；<br>(c) `/api/account/me` 失败、非 2xx、`success !== true`、`account.id` 为空 → 调用方得到与改前相同的错误，且结果不被复用（下一次确认重新请求）；<br>(d) 账号从 A 变成 B（`/api/account/me` 返回 B，或某个响应的 `actorId` 为 B，或收到 401／403）→ 与改前相同地触发 `onIdentityChanged`／`Account changed`，复用结果被清掉；不会用 A 的结果渲染 B 的数据；<br>(e) 写操作（发消息、确认已读、处理通知）之前一定发出一次新鲜确认，不用时间窗内的旧结果；<br>(f) 现有客户端测试断言不改、全部通过。 | 新测试先 RED 后 GREEN＋现有测试输出 |
| SC-W0031-03 | **会话服务轻量读取等价**。本机 PG 临时 schema 造数据，对每个场景分别用旧路径（`readAccountSessionGraph`）与新路径（`readAccountSessionView`）读取，结果深相等（accounts、profiles、evidenceIds、generatedAt），语句数与顺序相同；再经 `createLiveAccountSessionService` 各生成一次 `/api/account/me` 的 `data`，深相等：<br>- 按资料 id、按账号 id（回退）、都不命中（空库分支）；<br>- 无效资料（缺 `displayName`、`createdAt` 为空白、`accountId` 为数字）命中 id → 不回退，且 `generatedAt`／`evidenceIds` 仍计入该行；<br>- 账号缺失、已删除、`name` 为空；重复记录；已删除与别的工作区不返回；archived 照常返回；<br>- 资料展示字段缺失或非字符串（`optionalString` 行为）；`evidence_ids` 为空、多条、跨行重复；<br>- `created_at`／`updated_at` 为 ±infinity 或超出 JS 日期范围 → 新旧都 reject；`occurred_at`／`deleted_at` 无穷不 reject、超出 JS 范围的有限值 reject；边界在四个会话时区对照；<br>- 无 subject（`demoSignIn`）、mock 模式、未配置库 → 行为不变。<br>**SQL 形状**：只返回 `payload`、`updated_at`、`evidence_ids`、`readable`；不返回 `record_id`、`source_*`、`provider*`、`user_id`、`target_*`、`search_text` 等；含 `lifecycle_state <> 'deleted'`。<br>**闸门／去重／计量**（同 W0030 SC-02）：`assertAllowed` 次数与集合名序列与旧路径相同；并发相同读取只发 1 次；失败后重新发；store 写入驱逐进行中的读取；配置层集成测试里共享闸门 snapshot 的 rows／bytes 增量等于轻量 SQL 实际返回量，且 SQL 发到 `configured.client`。<br>**接线**：配置的 PG provider 下 `/api/account/me` 的会话服务调轻量读取 1 次、`readAccountSessionGraph` 0 次。 | 新测试先 RED 后 GREEN；PG 部分在 `orbit_test` 上 0 skip |
| SC-W0031-04 | **流量**：<br>- 按 W0030 的造数（真实注册路径、60 KB 头像与导入文档）出单次对照：`/api/account/me` 的账号解析、会话服务各自的语句数、行数、字节，改前改后；**会话服务单次字节 ≤ 改前的 50%**，语句数不变。<br>- 用 SC-01 的生产实测频次（缺的场景用上文假设补，写明）重算「次／人／天」与月估算两张表：改前、改后各一行，另列「每次节省字节」，便于频次改了直接重算。<br>- 月上限按 W31-3 的用户决定判定；未决定时只报告、不判定，并登记给 W0019。 | 测量输出＋REPORT 两张表 |
| SC-W0031-05 | **回归**：<br>- `npx tsc --noEmit -p .` 通过；<br>- 上下文包列出的客户端与服务端测试全部通过；`unbounded-list-reads` 中 `account-live-record-provider.ts` 计数不超过 5（该审计文件的基线失败项与本 Sprint 无关，照 W0030 处理）；<br>- 3001 上 verify-plan 打开收件箱消息、通知两个页签和一条通知来源，桌面 1440 与手机 375，控制台 0 错误；新消息在 15 秒内出现（用第二个验收账号发一条，或用种子脚本造一条，只读账号不写）；<br>- 一次全量基线对照，没有新增失败；<br>- 一次 Codex 代码 review（重点：确认复用与失效、写前新鲜、取消隔离、`generatedAt`／`evidenceIds` 计算、闸门集合名），由同一 Generator 修复。 | tsc、测试输出、截图、RULES §5.2 对照、review 记录 |

## 一次 Generator 的执行顺序

1. 复核进入条件（W0029 已合并；W31-1～5 已决定），保存基线与 Planner 哈希；`git diff 4722fcad HEAD -- <修改白名单>` 核对行号；GitNexus 全量重建索引（`analyze --force --index-only`），逐个符号 upstream impact，UNKNOWN 文本补查。
2. **生产基线（SC-01 改前）**：在基线 SHA 上 `ORBIT_NEXT_DIST_DIR=.next-w0031-prod` 构建并在空闲端口 `next start`（优先 `npx next build --webpack`；若缺 `images:lqip`／`build:reference-css` 的产物再跑这两个脚本，并确认 `git status --short` 不变），跑浏览器脚本，停进程、删目录。再跑单次字节测量拿改前数据。
3. 写 RED：SC-02 共享确认测试、SC-03 等价矩阵与 SQL 形状、SC-03 接线断言。
4. 最小实现：共享确认 → 各调用点切换（写前新鲜）→ provider 新方法与 SQL → `currentSession` 切换 → 补替身。
5. 定向测试与 tsc；测改后单次字节；对新 SQL 做 EXPLAIN（资料按 id、按 accountId、账号按 id）。
6. **生产复测（SC-01 改后）**：在功能提交上重复第 2 步的构建、测量与清理。
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

## 开放问题（附推荐默认）

| 编号 | 问题 | 选项 | 推荐 |
| --- | --- | --- | --- |
| W31-1 | 轮询时怎么确认身份 | **A**：共享确认，整个收件箱每 15 秒最多 1 次 `/api/account/me`，写操作前强制新鲜确认；响应里的 `actorId` 照旧核对。月估算约 2.06 GB（含服务端瘦身）。<br>**B**：轮询读取完全不调 `/api/account/me`，只靠事实 2 的响应标记发现账号变化（空通知列表没有标记，靠同周期的红点计数 `summary.actorId` 兜底，最迟一个周期发现）；只在打开面板和写操作前确认。月估算约 0.48 GB，但要把「响应标记不符」接到 `onIdentityChanged`（现在只显示读取失败），改动面和测试更多。 | **A**：与 D24 字面一致，行为变化最小；B 的节省更大，可作为后续候选 |
| W31-2 | 会话服务轻量读取放哪 | **A**：provider 新增可选方法，只 `live-service` 调用；`readAccountSessionGraph` 不变（同 W30-2 A）。<br>**B**：直接把 `readAccountSessionGraph` 的有 subject 分支改成轻量 SQL（输出不变，引导进度、脚本、解析回退都受益），但要回归它的全部消费者。 | **A**：改动集中，回归面小；其他消费者频率低 |
| W31-3 | `/api/account/me` 路径（解析＋会话服务）的月上限 | 按 A：建议 ≤2.5 GB／月（估算约 2.06 GB 留约 20% 余量）；按 B：建议 ≤0.6 GB／月。以 SC-01 生产实测频次重算后判定，超出则本项 failed、交用户裁决。口径外单列，不并入 884 MB 用户路径总账。 | 随 W31-1：选 A 则 ≤2.5 GB |
| W31-4 | 频次假设 | **A**：沿用 W30-4（收件箱每天 10 分钟、消息／通知各半），加「每天打开收件箱 2 次」「每天页面加载 10 次」，1000 人全按日活。<br>**B**：用户给出其他频次。 | **A**：只影响估算，REPORT 同时给「每次节省字节」便于重算 |
| W31-5 | 轮询端点自身的账号解析（`/api/inbox/summary`、`/api/inbox/notifications`、`conversation-summaries` 每请求 1 次，420 B，约 1.0 GB／月） | **A**：本 Sprint 不做，登记为后续候选。<br>**B**：纳入本 Sprint（例如合并成一个轮询端点，或复用同周期解析），范围扩大到接口层。 | **A**：保持本 Sprint 只处理 D24 点名的两件事 |

## 观察项（不在本 Sprint 处理）

- 名片批次轮询（上传／识别中每 2.5 秒一次）仍按 W0030 估算，未在生产构建下实测。
- W0030 全站受益表中其他页面入口的账号解析，已由 W0030 改轻；频次本身不在本 Sprint 范围。

## 修订记录

- revision 1（2026-09-29）：初版。依据 D24、W0030 REPORT 全站受益表与观察项；GitNexus 在 `4722fcad` 全量重建索引后查询。待方案 review 与 W31-1～5 决定。
