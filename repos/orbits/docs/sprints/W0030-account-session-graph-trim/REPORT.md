# Sprint W0030 — 执行总结

对应 [GOAL.md](GOAL.md)。改了哪些文件看 git diff，这里不逐文件复述。

## 结果

- 已验证能做到：
  - 已登录用户打开页面或调用接口时，「认出是哪个账号」这一步现在只从数据库取：资料的 id、所属账号 id、显示名、两个时间戳；账号的 id、名称、两个时间戳；一列「这行时间戳能否解析」的布尔值。来源、证据编号、工作区等记录管理信息不再返回（SC-01、SC-04）。
  - 认出的账号和以前完全一样：用资料 id 登录、用账号 id 登录、认不出（null）、数据有问题时照旧跳过或报错，在本机 PG 上逐项对照一致，语句数也相同（SC-01）。
  - 读取预算闸门对账号、资料照旧放行；每条语句都带集合名过闸门，次数和顺序与以前一样；同时发起的相同读取只查一次；失败不缓存；写入之后不会复用写入前的读取；新读取的行数和字节照样计入读取预算（SC-02）。
  - 活动详情页每次认账号从 1,984 B 降到 420 B（按资料 id 登录时 1,959 B → 409 B），每月约 25.2 MB，低于 60 MB 上限（SC-04）。
  - 3001 上的浏览器验收（桌面 1440 与手机 375，控制台 0 错误，SC-05）：verify-plan 看已报名活动详情页、活动页、iOrbit 首页、人脉页；verify-host 看详情页主办方入口。
- 仍未实现或未验证：
  - `/api/account/me`（账号会话服务）仍读完整会话图，按计划不改。收件箱打开时每 15 秒要调它 3–4 次，见「观察项」。
  - 名片批次轮询在本机不调付费识别就无法触发，频次按源码推算。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5，2026-09-29，run-01；Planner revision 3（sha256 `898758dbf920e59c9a625e2bdcc9c578022c25c1726198f16668d3edffe0f56a`）
- 分支 `sprint/W0030-account-session-graph-trim`，基线 `3dfdf7c7`；功能 SHA `3677fd16`，测试补充 `012c685a`；`chat-agent` 合并 SHA：见登记表
- 档位 H。全量对照：基线 5750 个测试、失败 80；HEAD（`3677fd16`）5763 个测试、失败 80；新增失败 0（`09-fail-*.txt`，`09-new-failures.txt` 为空）；两份副本已删除
- 付费 AI 调用 0；未 push；未碰生产库
- REPORT 由协调者按 Generator 交回的正文落盘
- 证据：`~/orbit-sprint-evidence/web/sprint-W0030/run-01/`

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0030-01 等价（含失败语义） | pass | 见「SC-01 覆盖」 |
| SC-W0030-02 闸门、去重、写入失效、计量 | pass | 见「SC-02 覆盖」 |
| SC-W0030-03 调用方行为不变 | pass | 见「SC-03 覆盖」 |
| SC-W0030-04 流量 | pass | 字节 `04-measure.txt`（脚本 `measure-w0030-identity-bytes.ts`）；端点实测 `07-polling.json`、`07-page-loads.json`；每端点 SQL `07-poll-cycle-before.txt`／`07-poll-cycle-after.txt`；EXPLAIN `05-explain.txt` |
| SC-W0030-05 回归 | pass | `03-tsc.txt` exit 0；浏览器 `06-browser.json` 与 12 张截图，控制台 0 错误；全量对照无新增失败；Codex 代码 review 见下 |

### SC-01 覆盖

测试文件 `tests/capabilities/account-session-identity-read.test.ts`，PG 部分在 `orbit_test` 上 0 skip。

- PG 场景 37 个，新旧读取经同一判定函数，结果深相等、语句数相同：会话 id＝资料 id／账号 id／都不是；按 id 命中无效资料 3 种都不回退；账号缺失、已删除、名称空白；按 id 重复与回退路径重复都取到同一条；已删除资料、别的工作区；archived（无效资料仍阻止回退，archived 资料和账号照常解析）；`session.name` 为 null 与非 null；会话 id 带空格、只有空白；资料与账号的 `created_at`／`updated_at` 为 ±infinity 时报错、`occurred_at`／`deleted_at` 为 ±infinity 时不报错；超出 JS 日期范围的 `created_at`／`occurred_at`／`deleted_at` 报错；JS 日期上限。
- 边界场景在 UTC、Asia/Shanghai、America/Los_Angeles、Pacific/Kiritimati 四个会话时区再对照一次。
- SQL 形状：只返回 `payload` 与 `readable`；资料 payload 只有 5 个字段；含 `lifecycle_state <> 'deleted'`，不含 `= 'active'`；排序与旧读取相同。
- RED `01-red.txt`（12/13 fail），GREEN `02-green-new-test.txt`（14/14）。变异检验 `02-mutation-check.txt`：改成 `= 'active'` 有 4 条失败；改成「有效资料为 0 才回退」有 1 条失败。

### SC-02 覆盖

- (a) 闸门集合名序列与旧路径相同：账号 id 登录是 profiles, profiles, accounts；资料 id 登录是 profiles, accounts。
- (b) 真实闸门处于打开状态时，解析照样成功，SQL 照发。
- (c) 并发的相同解析每条语句只发 1 次、结果相同；闸门每次逻辑调用都查；第一次失败后重新发 SQL。
- (d) 配置 store 上的删除写入会驱逐进行中的轻量读取。
- (e) 按 env 构造 `createConfiguredStorageAccountSessionProvider`，底层用真实 `createPgLiveRecordSqlClient` 连 `orbit_test`：3 条语句全部经 `configured.client`；共享闸门 snapshot 的 rows／bytes 增量等于返回行 JSON 字节之和。
- (f) SQL 抛错时 reject，不变成 null；时间戳不可读的行也 reject。

### SC-03 覆盖

- 配置 PG 下，`resolveAuthenticatedApiActorFromSession` 只发 3 条轻量语句、0 条完整图语句；加了轻量依赖的 provider 上，`readAccountSessionGraph` 输出与原来深相等。
- PLANNER 列的 16 份测试＋审计：`03-regression-sc03.txt`，136 条（134 pass、1 skip、1 fail）。fail 是审计棘轮里与本 Sprint 无关的 `orbit-agent-chat-session-live-record-provider.ts`（5 > 4），基线同样失败；`account-live-record-provider.ts` 计数仍为 5。skip 的 `inbox-summary-request` 补上 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 后单独跑通过（`03-regression-inbox-lifecycle.txt`）。
- 映射表其余现有测试：`03-regression-mapping.txt`，135 条；唯一失败在基线失败清单里；4 个 skip 需要一次性 profile 集群，起只开 Unix socket 的临时集群后 13/13 通过（`03-regression-profile-socket.txt`），集群已删除。

### SC-04 实测（W0017 口径：每条语句返回行 JSON 字节之和）

| 场景 | 改前（完整图） | 改后（轻量） |
| --- | --- | --- |
| A 会话 id＝账号 id（verify／credentials） | 3 条／2 行／1,984 B | 3 条／2 行／**420 B** |
| B 会话 id＝资料 id（Auth.js profile 主体） | 2 条／2 行／1,959 B | 2 条／2 行／**409 B** |

- 每行列构成：改前资料行 1,148 B（19 列）、账号行 836 B；改后资料行 235 B（payload 207、readable 4）、账号行 185 B。造数含 60 KB 头像和导入文档，都不会被带出。
- 月估算（1000 人 × 每天 2 次详情页 × 30 天＝60,000 次）：A 119.0 MB → **25.2 MB**；B 117.5 MB → **24.5 MB**；上限 60 MB。

### 全站受益表（信息项，不设上限；D23 W30-4 口径）

- 收件箱轮询实测（3001，verify-plan，`07-polling.json`）：收件箱关着时 0 次请求；页面隐藏后轮询停止。每个 15 秒周期，消息页签请求 `/api/account/me` ×3、`conversation-summaries` ×1、`/api/inbox/summary` ×1；通知页签 `/api/account/me` ×4、`/api/inbox/summary` ×1、`/api/inbox/notifications` ×1。
- 每次请求账号解析 1 次：改前 3 条／1,978 B，改后 3 条／420 B。同一进程里同时发出的一个周期会被 in-flight 去重合并成 1 次解析；生产上并发请求可能落在不同实例，所以下表按「不去重」给上限。
- 页面入口按每个页面加载实际触发的 API 计（dev 模式，StrictMode 会让部分请求翻倍，偏高）。名片批次按源码推算（上传／识别中每 2.5 秒一次，识别结束即停）。

1000 人都按日活，每次节省 1,564 B（场景 A）：

| 入口／端点 | 每人每天解析次数 | 次／月 | 改前 MB | 改后 MB | 节省 MB |
| --- | --- | --- | --- | --- | --- |
| `/app/agent` | 48 | 1,440,000 | 2,857.0 | 604.8 | 2,252.2 |
| `/app/events` | 4 | 120,000 | 238.1 | 50.4 | 187.7 |
| `/app/events/[id]` | 8 | 240,000 | 476.2 | 100.8 | 375.4 |
| `/app/contacts` | 4 | 120,000 | 238.1 | 50.4 | 187.7 |
| `/app/tasks` | 11 | 330,000 | 654.7 | 138.6 | 516.1 |
| `/app/start` | 1 | 30,000 | 59.5 | 12.6 | 46.9 |
| 轮询 `/api/account/me` | 140 | 4,200,000 | 8,332.8 | 1,764.0 | 6,568.8 |
| 轮询 `/api/inbox/summary` | 40 | 1,200,000 | 2,380.8 | 504.0 | 1,876.8 |
| 轮询 `conversation-summaries` | 20 | 600,000 | 1,190.4 | 252.0 | 938.4 |
| 轮询 `/api/inbox/notifications` | 20 | 600,000 | 1,190.4 | 252.0 | 938.4 |
| 名片批次（每周 1 批 × 48 次） | — | 205,714 | 408.1 | 86.4 | 321.7 |
| **合计（上限，不去重）** | | 9,085,714 | 18,026.1 | 3,816.0 | **14,210.1** |

- 收件箱 40 个周期按「消息、通知各 20 个」假设。轮询完全去重（每周期 1 次解析）时，轮询部分节省 1,876.8 MB／月（下限）。

### EXPLAIN（本机 24,000 行合成数据，`05-explain.txt`）

- 资料按 id、账号按 id：走 `orbit_records_identity_payload_idx`；资料按 accountId：走 `orbit_records_profile_account_idx`；之后按旧顺序排序。不需要新索引。

## 调用方清单与测试映射（按 `3dfdf7c7` 重新生成，`00-callers.txt`）

- A 静态直接：23 个入口 24 处，另加包装函数 1 处；B 依赖注入：2 处；与 PLANNER 相同。
- C 经 `resolveAuthenticatedApiActor` 间接：**148 个文件 162 处**（PLANNER 写 143／157），差异来自统计过滤（无空格的 `options.resolveActor??resolveAuthenticatedApiActor` 写法与对象简写）。
- A、B 的测试映射沿用 PLANNER 表，表中每份现有测试都跑过并通过；唯一失败是基线就有的失败。
- 没有专门测试的 3 个入口（`agent/strategy/page.tsx`、`tasks/page.tsx`、`api/notifications/[id]/state/route.ts`）：静态检查确认调用参数只来自 session 字段（`00-static-check-uncovered.txt`），由 SC-01 集中等价测试覆盖。
- actor 的全部字段在新旧路径下深相等（`00-caller-fields.txt`），任何调用方字段都不受影响。

## 偏差

1. **没有改 `shared/storage/configured-live-record-store.ts`**：复用 W0028 的 `ConfiguredPostgresLiveRecordStore.customRead`（与 store 共用闸门和 in-flight 去重表，写入会驱逐，失败不缓存），provider 依赖为 `identitySql: { client, read }`（与 W0028 `statusSql` 同形），而不是 PLANNER 草案里的 `readOnce`。
2. **时间戳判断复用 W0028 的 `jsDateSafeTimestampSql`，比 PLANNER 多查两处**：`created_at`／`updated_at` 超出 JS 日期范围；`occurred_at`／`deleted_at` 是超出 JS 日期范围的有限值。旧读取在这些情况下也会报错，新旧一致，测试覆盖。
3. SQL 参数顺序与 `listQuery` 相同，payload 投影用同一个 `jsonb_each` 子查询，非对象 payload 在两边同样报错。
4. 测试时区与 `deleted_at` 边界场景是功能提交后单独补的（`012c685a`，只改这一个测试文件，定向 14/14）；全量对照跑在 `3677fd16` 上。
5. `next-env.d.ts` 按协调者指令不还原。

## 假设与额外阅读

- 上下文包之外读了：`shared/storage/live-database-config.ts`；`shared/storage/postgres-read-metrics.ts`；W0028 先例（`postgres-js-date-sql.ts`、registration `live-record-provider.ts`、`event-registration-status-read.test.ts` 夹具）；`shared/storage/migrations.ts` 的索引；verify 相关脚本参数；`tests/pages/profile-onboarding-access.test.ts` 开头；全站受益表所需的前端轮询与处理器入口（`app/(app)/app/inbox/*`、`use-card-batch.ts`、`ingest-v2-client.ts`、`account/me`、`inbox/summary`、`inbox/notifications`、`relationship-communication/read-handler.ts` 及各页面加载 API 的处理器入口）。
- 命名：`LiveAccountSessionIdentity`、`readAccountSessionIdentity` 沿用 PLANNER；新增类型 `AccountSessionIdentitySql`、`LiveAccountSessionIdentityInput`；返回列名 `readable`。
- 没有 SQL 依赖或 subject 为空时，轻量读取直接调用 `readAccountSessionGraph` 再映射，不新增 `limit: "unbounded"`。
- JS 日期上限那一格（`275760-09-13`）旧读取是否报错取决于会话时区，只断言新旧一致。
- 浏览器验收：verify-host 的 cookie 由临时复制的 `scripts/w0030-tmp-cookie.ts` 签发，用完删除；浏览器脚本副本 `browser-check.mjs` 在证据目录；cookie 没落盘。verify-plan 只读使用，结束后 `--reset verify-plan`，summary 与验收前一致（`10-summary-after.txt`）；verify-host 只读使用。
- 一次性 profile 集群建在 `/tmp/orbit-profile-cas.XXXXXX`（测试要求该前缀），只开 Unix socket，用完已停止并删除。

## GitNexus

- 开工时全量重建索引（`00-gitnexus-analyze.txt`）。impact（`00-impact.txt`），没有 UNKNOWN：`resolveAuthenticatedApiActorFromSession` CRITICAL（影响 89，直接 24）；`resolveAuthenticatedApiActorIdentity` CRITICAL（77）；`createStorageAccountSessionProvider` CRITICAL（34）；`createConfiguredStorageAccountSessionProvider` CRITICAL（86，直接 6）。
- 提交前 `detect-changes --scope staged`（`08-detect-changes-feature.txt`）：3 个文件、30 个符号、249 个流程，risk critical。原因是全站共用的身份解析入口和 provider 接口的新增可选成员；签名与返回不变，由等价矩阵和全量对照覆盖。测试补充提交只动测试文件（`08-detect-changes-test.txt`）。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex `codex review --base chat-agent`（全文 `codex-review.txt`）P2：`next-env.d.ts` 指向 `.next-verify` | 不成立：3001 验收 server 自动改写的工作树未提交文件，分支 diff 不含它 | 无需修改；Codex 对身份读取优化本身无意见 |

## 交接

- 新接口：`LiveAccountSessionProvider.readAccountSessionIdentity?(identity)` 返回 `LiveAccountSessionIdentity { accounts: { id }[]; profiles: { id, accountId, displayName }[] }`（配置的 PG provider 一定实现）；`createStorageAccountSessionProvider({ identitySql: { client, read } })`；`resolveAuthenticatedApiActorIdentity` 的 `graph` 参数类型放宽为 `LiveAccountSessionIdentity | null`。
- **给 W0029「预算重算」表 C 行**：详情页账号解析单次 420 B（3 条语句）或 409 B（2 条语句）；按 1000 人 × 每天 2 次 × 30 天，**25.2 MB／月**（改前 119.0 MB）。
- 给 W0019：上线后在 Neon 控制台对照账号解析语句（`orbit_records`，返回列只有 `payload` 和 `readable`）的返回量；旧的 19 列语句应只剩账号会话服务一处。
- 用户裁决（D24）：`/api/account/me` 轮询流量发布前由 W0031 解决。
- 后续候选：`/api/account/me` 的账号会话服务仍读完整图（每次约 1,978 B，收件箱打开时每 15 秒调 3–4 次，每个页面加载调 2 次；按上表频次约 9.5 GB／月）；`features/guide/progress.ts` 的 `configuredAccountCreatedAt`；活动子页面（operations、analytics、live、center）仍用会话 id。
- 回退：revert `012c685a` 和 `3677fd16`。新方法和参数都是增量，解析入口退回 `readAccountSessionGraph` 即恢复原行为。

## 观察项（不在本 Sprint 处理）

- 收件箱轮询里 `/api/account/me` 每周期被调 3–4 次：`inbox-request.ts` 的 `readContactMessageActor` 每次请求都先问一次身份。本 Sprint 已把其中的账号解析变轻，账号会话服务的完整图读取没动。
- 页面加载的 API 次数来自 dev 模式，React StrictMode 会让部分请求翻倍，生产数字应更低。
