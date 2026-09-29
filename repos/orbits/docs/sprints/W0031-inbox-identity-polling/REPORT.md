# Sprint W0031 — 执行总结

对应 [GOAL.md](GOAL.md)。改了哪些文件看 git diff，这里不逐文件复述。

## 结果

- 已验证能做到：
  - 收件箱开着时，每 15 秒一轮刷新只问一次「我是谁」（`/api/account/me`）。红点、消息页签、通知页签、已打开的对话或通知共用这一次结果。生产构建实测：稳态每 60 秒 4 次，相邻两次最短间隔 14.99 秒。改前每轮 3–6 次。页面加载时红点只问 1 次（改前 2 次）。页面隐藏后不再请求（SC-01）。
  - 发消息、确认已读、处理通知、全部已读、通知设置这些写操作，都在用户点下之后另发一次确认。这次确认不借用之前的结果，也不搭已经在路上的请求。测试覆盖了：旧确认还在路上时账号换成了 B，再点写操作——写请求没有以 A 的身份发出，页面照旧提示账号已变化（SC-02）。
  - 账号变化会被发现，读取失败不会被记住。账号切换前发出、切换后才到的旧结果不会被记住。所有页面都已取消的请求，结果也不会被记住（SC-02）。
  - 服务器回答「我是谁」时，账号会话服务只从数据库取页面要用的字段。接口返回内容逐字段不变，查询条数不变。每次读取从 1,984 B 降到 898 B（45.3%）（SC-03、SC-04）。
  - 按 1000 人每天使用估算，这条路径每月约 2,214 MB（跨实例不去重上限口径，已计入 review 修复后写后确认的请求），低于 D25 的 2.5 GB 上限；改前约 11,828 MB（SC-04）。
  - 写操作之后的第一次确认一定重新请求 `/api/account/me`，写前确认的结果不会被复用（Codex review P2 修复，`2e47997b`）；对话已读回执写完后会再确认一次，期间账号被切换时按 403／`onIdentityChanged` 报出。
  - 3001 上看了收件箱消息页签、通知页签和一条通知详情，桌面 1440 和手机 375，控制台 0 错误。另一个验收账号发来的新消息分别在 13.7 秒和 13.4 秒内出现（SC-05）。
- 仍未实现或未验证：
  - 通知来源页（`/app/inbox/sources/<id>`）在改前、改后的生产构建和 3001 上都返回 404（既有问题，见「观察项」2），场景 ⑥ 只测了请求频次。
  - 轮询接口自身的账号解析按 W31-5 不做。另发现每个登录请求还有一条 `auth_users` 整行读取，不在本 Sprint 口径内，见「观察项」1。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5，2026-09-29，run-01；Planner revision 3（sha256 `b4a58c60076861ee9629d3d32de86b58815e46c1acdf60e46ff3c43770e03b48`）
- 分支 `sprint/W0031-inbox-identity-polling`，基线 `f57c7045`（PLANNER 编制于 `4722fcad`，白名单文件在两者之间没有变化）；功能 SHA `4cb9e4a2`，review 修复 `2e47997b`；`chat-agent` 合并 SHA：见登记表
- 档位 H。全量对照：基线 5784 个测试、失败 81；HEAD 5805 个测试、失败 80；新增失败 0（基线多出的一条是偶发的 appointment 并发测试）。两份副本依次运行，跑完已删除
- 付费 AI 调用 0；未 push；未部署；未碰生产库
- REPORT 由协调者按 Generator 交回的正文落盘
- 证据：`~/orbit-sprint-evidence/web/sprint-W0031/run-01/`

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0031-01 生产构建频次 | pass | `01-prod-baseline.json`、`05-prod-after.json`（原始日志 `01b-prod-baseline-raw.json`、`05-prod-after-raw.json`，SQL `01b-prod-base-sql.jsonl`、`05-prod-after-sql.jsonl`）；规程各步 `01b-prod-base-step*.txt`、`05-prod-after-step*.txt` |
| SC-W0031-02 客户端确认语义 | pass | `tests/pages/inbox-identity-confirmation.test.ts`（10 条）、`tests/pages/typed-notifications-identity-browser.test.ts`（1 条）；RED `02-red-client*.txt`、`02-red-typed-browser.txt`；GREEN `03-client-targeted.txt`、`05-targeted.txt` |
| SC-W0031-03 会话服务轻量读取等价 | pass | `tests/capabilities/account-session-view-read.test.ts`（10 条，PG 部分在 `orbit_test` 上 0 skip）；RED `02-red-server.txt`（10/10 fail），GREEN `03-green-server.txt`；去重 key 变异检验 `03-mutation-key-collision.txt`（2 条失败） |
| SC-W0031-04 流量 | pass | `06-measure-bytes.txt`（脚本 `measure-w0031-session-bytes.ts`）、`06-single-instance.txt`、`06-explain.txt` |
| SC-W0031-05 回归 | pass | `04-tsc.txt` exit 0；`05-targeted.txt` 165 条 163 pass，2 条失败都是基线失败；浏览器 `09-browser-3001.json` 与 10 张 `09-*.png`；全量 `08-*`；Codex 代码 review 见下 |

### SC-01 生产构建实测（verify-plan，`next start` 单实例）

启动阶段：从进入场景到首轮完成（6 秒）。稳态：首轮之后的第一个请求作 t0，统计 `[t0, t0+60s)`。

| 场景 | 启动 me 改前→改后 | 稳态 60 秒 me 改前→改后 | 稳态相邻最短间隔 改后 | 其他端点每 60 秒（改前＝改后） |
| --- | --- | --- | --- | --- |
| ① 页面加载 `/app/agent` | 2 → **1** | 收件箱关着 0 → 0 | — | summary 1（加载时） |
| ② 消息页签 | 4 → **1** | 12 → **4** | 14,997 ms | summary 4、conversation-summaries 4 |
| ③ 打开一段对话 | 4 → 1 → **2**（修复后） | 16 → **4** | 14,993 ms（修复后） | 另加 messages 4；启动时 POST read 1、delivery preferences 1 |
| ④ 通知页签 | 4 → **0**（复用） | 16 → **4** | 14,999 ms | summary 4、notifications 4 |
| ⑤ 打开一条通知 | 2 → **0**（复用） | 24 → **4** | 14,998 ms | 另加通知详情 4 |
| ⑥ 通知来源页（既有 404 路径） | 1 → 1 | 4 → 4 | 14,994 ms | 通知详情 4 |
| ⑦ 页面隐藏 30 秒 | — | 0 → 0 | — | 0 |

- review 修复后（`2e47997b`，生产复测 `12-prod-fix.json`）：场景 ③ 启动阶段是 2 次，超出 SC-01 字面上「启动阶段 ≤1」。这两次是打开对话时自动发出的已读回执的写前确认和写后确认，这是写操作必需的独立确认（SC-02 (e) 与 review P2），不是轮询确认。其余场景启动与稳态次数不变。需要协调者裁决是否接受。

- 规程执行：基线跑了两轮（第 1 轮 SQL 计量没有按请求归属，第 2 轮补上后用于统计，两轮浏览器频次相同），都用 `.next-w0031-base`、端口 3012；改后用 `.next-w0031-after`、端口 3013。每轮启动前确认端口空闲，只结束本轮记下的 PID（npx 与其子进程 next-server），确认退出后按 `.next-w0031-` 前缀核对再删除目录。
- 3001 核对：前后都是 PID 83693、HTTP 200；3000 始终没有进程；`.next`、`.next-verify` 未触碰；`tsconfig.json` 的 md5 不变。构建改写过 `next-env.d.ts`，每次都已还原为开工前内容（未提交）。`git status --short` 与开工前完全一致。

### SC-02 共享确认的最终做法

- 位置 `app/(app)/app/inbox/inbox-request.ts`：`readContactMessageActor(signal?)` 普通确认，全收件箱共用；`readContactMessageActorForWrite(signal?)` 写前屏障；`invalidateInboxActorConfirmation()` 使复用结果失效；`confirmInboxActor(signal?, { write })` 返回结果对象。
- 复用窗 10 秒，从请求发出时计。每个调用方用自己的 signal 竞速；全部消费者都取消时中止底层请求；只有「完成时世代号未变」且「仍有未取消的消费者」的结果才写缓存。
- 失效条件：`/api/account/me` 失败；`/api/account/me` 与期望账号不符；响应里的 `actorId` 不符；对话读写收到 401／403；另外通知页签、红点计数、通知来源页任一读取失败也会失效（比 PLANNER 宽，只在出错时多问一次）。
- 写前屏障：不读复用结果，不加入任何已发出的请求；同一批（请求实际发出前同步到来）的写前确认共用一个请求，批次在一个微任务后关闭；结果不符时不发写请求。
- review 修复（`2e47997b`）：发起写前确认时先让复用结果失效，写前确认自身的结果不写入复用缓存，所以写之后的第一次普通确认一定重新请求；`confirmMessageWindowRead`（已读回执不带 actor）写后再做一次确认。选这个修法而不是「只让写前确认不写缓存」：后者仍会让写后检查复用写之前的读缓存；也不选「各调用点写后强制新鲜」：以后新增的写路径容易漏。
- 写前确认的调用点：`confirmMessageWindowRead`、`sendWindowMessage`、`TypedNotificationsTab` 的 `act` 与 `markRead`（`request()` 按 method 自动走屏障）、`NotificationDeliverySettings.change`、`NotificationDiscoverySettings.change`。
- 既有测试断言只改 1 处：`tests/pages/inbox-summary-client.test.ts` 第 2 个测试把 `["/api/account/me", "/api/inbox/summary", "/api/account/me"]` 改为 `["/api/account/me", "/api/inbox/summary"]`，由新测试 (a) 覆盖。

### SC-03 会话服务轻量读取

- 接口：`LiveAccountSessionProvider.readAccountSessionView?(identity)`，返回 `LiveAccountSessionGraph`。`live-service.ts` 的 `currentSession` 在方法存在时调用它，否则退回 `readAccountSessionGraph`。`readAccountSessionGraph`、`readAccountSessionIdentity`、handler 都未改。
- SQL 返回列：`payload` 投影（资料 12 个字段、账号 4 个字段）、`updated_at`、`evidence_ids`、`readable`（复用 `IDENTITY_ROW_READABLE`）；where、order by、参数顺序同 `identitySql()`；`generatedAt`／`evidenceIds` 用全部原始行计算，顺序与完整图相同。
- 去重 key：`JSON.stringify(["account-session-view:v1", workspaceId, collectionName, lookupField, value, fields])`，与 W0030 的 `["account-session-identity", …]` 隔开。
- 等价矩阵：PG 场景 30 个，每个场景对图本身和经 `createLiveAccountSessionService` 生成的 `/api/account/me` data 各做深相等比较，语句数相同；覆盖无效资料不回退且计入 `generatedAt`／`evidenceIds`、账号缺失／已删除／名称空白、重复记录、archived、展示字段缺失、`evidence_ids` 各种形态、±infinity 与超出 JS 日期范围（4 个时区）、`demoSignIn` 直接走完整图。
- 闸门／去重／计量：闸门集合名序列与完整图相同；并发相同读取只发 1 次；失败不缓存；配置层实测 SQL 全部经 `configured.client`，共享闸门 rows／bytes 增量等于返回量；与 W0030 身份读取同 store、同 subject 并发时各发各的 SQL，写入后两种读取都重新发 SQL。
- 接线：配置的 PG 下 `/api/account/me` 共 5 条语句（身份 3 条、会话视图 2 条），完整图 0 条。

### SC-04 流量（W0017 口径；MB／GB 十进制）

| 场景 | 账号解析（不变） | 会话服务 改前 → 改后 | `/api/account/me` 合计 | 每次节省 |
| --- | --- | --- | --- | --- |
| A 会话 id＝账号 id | 3 条／420 B | 2 条／1,984 B → 2 条／**898 B（45.3%）** | 5 条／2,404 B → 5 条／1,318 B | 1,086 B |
| B 会话 id＝资料 id | 2 条／409 B | 2 条／1,959 B → 2 条／**887 B（45.3%）** | 4 条／2,368 B → 4 条／1,296 B | 1,072 B |

次／人／天（SC-01 生产实测频次，按 D25 W31-4 补齐：收件箱每天 40 个周期，消息、通知各 20 个；每天打开收件箱 2 次；每天加载页面 10 次）：

| 来源 | 客户端请求 改前→改后 | 次／月 改前→改后 | 上限 MB 改前→改后 |
| --- | --- | --- | --- |
| 消息页签轮询（每周期 3→1） | 60 → 20 | 1,800,000 → 600,000 | 4,327.2 → 790.8 |
| 通知页签轮询（每周期 4→1） | 80 → 20 | 2,400,000 → 600,000 | 5,769.6 → 790.8 |
| 打开收件箱 | 2 → ≤2 | 60,000 → 60,000 | 144.2 → 79.1 |
| 对话已读回执（review 修复后新增一行；假设每次打开收件箱读 1 段对话，每天 2 次；改前每次写前 1 次，改后写前＋写后 2 次） | 2 → 4 | 60,000 → 120,000 | 144.2 → 158.2 |
| 页面加载红点（每次 2→1） | 20 → 10 | 600,000 → 300,000 | 1,442.4 → 395.4 |
| **合计** | **164 → 56** | **4,920,000 → 1,680,000** | **11,827.7 → 2,214.2** |

| 口径 | 每次字节 改前→改后 | 每次 SQL 执行 改前→改后 | 月估算 改前 → 改后 |
| --- | --- | --- | --- |
| **跨实例不去重上限**（判定口径） | 2,404 → 1,318 B | 5 → 5 | **11,828 MB → 2,214 MB（≤2,500 MB，通过）** |
| 单实例实测（生产构建，同进程去重生效） | 1,751 → 1,042 B | 4.01 → 4.75 | 8,615 MB → 1,751 MB |
| 只改客户端（上限口径） | 2,404 B | 5 | 4,039 MB |
| 只改服务端（上限口径） | 1,318 B | 5 | 6,485 MB |

- 单实例下「每次 SQL 执行」改后更高：改前一个周期内 3–4 个并发请求在同一进程里合并了一部分，改后每周期只有 1 个请求。
- 打开对话或通知详情时，改前每周期 4–6 次，改后仍是 1 次；上表按只看列表计算，改前数字偏保守。
- EXPLAIN（`06-explain.txt`）与 W0030 相同，不需要新索引。

## 偏差

1. 改了 PLANNER 白名单外的两个设置页 `notification-delivery-settings.tsx`、`notification-discovery-settings.tsx`：它们也调用 `readContactMessageActor`，写路径必须走屏障，只改了写前那一处调用。
2. 失效条件比 PLANNER 宽：通知页签、红点计数、通知来源页任一读取失败都会让复用结果失效，只在出错时多问一次。

## 假设与额外阅读

- 上下文包之外读了：两个通知设置页；`tests/pages/typed-notification-inbox.test.tsx`（通知夹具）；`app/(app)/app/inbox/sources/[id]/page.tsx`、`notification-source-view-model.ts`（排查来源页 404）；`auth.ts`、`features/auth/session-revocation.ts`（查每个请求那条 `other` 语句的来源）；relationship-communication handler、`inbox-record-service-factory.ts`（验收造数）。另派了一个只读子代理查本机怎样造 typed 通知。
- 验收造数只写本机开发库的 verify 账号（verify-plan 邀请 verify-legacy 建立对话并发消息；经 API 建一条笔记，再用临时脚本写一条来源为该笔记的通知，脚本用完已删）；结束后 `--reset verify-plan`、`--reset verify-legacy`，非 verify 行指纹与 summary 与开工前一致（`10-*`）。
- 生产计量用 `NODE_OPTIONS=--require sql-tap.cjs` 拦截 `pg.Client.prototype.query`，并用 AsyncLocalStorage 把每条语句归到发起它的 HTTP 请求；脚本放在证据目录，不进仓库。
- 复用窗取 PLANNER 建议的 10 秒，实测相邻最短间隔 14.99 秒。
- RED 取证：共享确认的新测试在基线代码上导入即失败；另用 shim 版本跑出 (a)(b)(e 同批) 失败、(c)(d)(e)(e 竞态) 通过（改前每次都新发请求，天然满足屏障），说明见 `02-red-client-shim.txt`。

## GitNexus

- 开工时 `analyze --force --index-only` 全量重建（`00-gitnexus-analyze.txt`），impact（`00-impact.txt`）：`fetchBadgeCount` CRITICAL（影响 31，执行流 11）；`createStorageAccountSessionProvider` CRITICAL（34，执行流 31），均已登记，改动只是确认方式和新增可选方法，渲染、计数、签名不变。`readContactMessageActor` UNKNOWN（同名两处），候选 MEDIUM 28 与 LOW 10，已用文本搜索补查全部调用方；`NotificationDeliverySettings`／`NotificationDiscoverySettings` UNKNOWN（与 App 端同名），Web 端候选都是 LOW；其余 LOW。
- 提交前 `detect-changes --scope staged`（`07-detect-changes.txt`）：13 个文件、50 个符号、0 个受影响流程，risk low。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex `codex review`（全文 `codex-review.txt`）P2-1：写前确认结果写入复用缓存，写后的普通确认 10 秒内复用它，写前确认与写请求之间切换账号时，不带 actor 的端点（已读回执）发现不了 | 成立 | `2e47997b`：发起写前确认即让复用结果失效，写前确认结果不入缓存；已读回执写后再确认。RED `11-red-review-p2.txt`（新增 2 条失败），GREEN `11-green-review-p2.txt`（定向 167 条，165 pass，2 条为基线失败）、`11-tsc.txt` exit 0。生产复测 `12-prod-fix.json`：只有场景 ③ 启动阶段 1 → 2（自动已读回执的写后确认），稳态各场景仍每 60 秒 4 次、最短间隔 14,993 ms；月估算 2,056 → 2,214 MB，仍 ≤2.5 GB |
| Codex P2-2：`next-env.d.ts` 指向 `.next-verify` | 不成立：3001 验收 server 自动改写的工作树未提交文件，分支 diff 不含它 | 不处理（按协调者裁决） |

## 交接

- 新接口：客户端 `readContactMessageActorForWrite`、`invalidateInboxActorConfirmation`、`confirmInboxActor`、`INBOX_ACTOR_REUSE_MS = 10_000`（`inbox-request.ts`），以后新增的收件箱写路径必须走 `readContactMessageActorForWrite`；服务端 `LiveAccountSessionProvider.readAccountSessionView?`，配置的 PG provider 一定实现。
- 给 W0019：`/api/account/me` 路径月上限按 W31-3 口径实测 2,214 MB（跨实例不去重，含已读回执写后确认），单实例实测 1,751 MB；上线后在 Neon 控制台对照会话服务语句的返回量（返回列只有 `payload`、`updated_at`、`evidence_ids`、`readable`），19 列的完整图语句应只剩 `features/guide/progress.ts` 等非 `/api/account/me` 调用方。
- 回退：revert `2e47997b` 与 `4cb9e4a2`。客户端恢复每次都确认；服务端退回 `readAccountSessionGraph`。

## 观察项

1. **每个登录请求都有一条 `auth_users` 整行读取**：`auth()` 的 jwt 回调在每个请求上调用 `isPasswordSessionCurrent`（`features/auth/session-revocation.ts`），用 `store.getRecord` 读 auth 用户整行，约 850 B／条。生产实测平均每个 `/api/account/me` 1.55–1.67 条（约 1,318–1,417 B），已超过本 Sprint 瘦身后的会话服务读取；其他轮询端点同样受影响。W0030／W0031 的进程内测量绕过了 `auth()`，之前没看到。
2. **通知来源页 404（既有问题）**：`/app/inbox/sources/[id]` 拿到的 id 仍是 `inbox%3A…`，`NotificationSourcePage` 又 `encodeURIComponent` 一次，请求变成 `inbox%253A…`，返回 404。改前的生产构建也是这样。只影响 discovery 来源的通知。
3. 后续候选沿用 PLANNER：轮询端点自身的账号解析（W31-5）；名片批次轮询；`features/guide/progress.ts` 的 `configuredAccountCreatedAt`（`/app/agent` 页面渲染仍有 1–2 条完整图语句）。

## 协调者裁定

- 场景 ③（打开一段对话）启动阶段 `/api/account/me` 2 次，超过 SC-01 字面「启动阶段 ≤1」：两次是已读回执的写前与写后确认，来自 Codex review P2-1 要求的安全行为，不是轮询；稳态频次与流量上限仍满足。协调者接受此偏差（2026-09-29）。
