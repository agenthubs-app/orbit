# Sprint 0099 执行报告：请求读取小票（监控 O1）

**run-01**。Generator 是子代理，报告由协调者代存（子代理的运行环境不允许写报告文件）。分支 `sprint/0099-read-cost-tickets`，未推送。
**状态：completed**。五项 SC 都有同版本证据，协调者复核记录见最后一节。

## 1. 结论

- **现在能做的**：
  - 服务器每处理一个读了数据库的请求，就在响应发出后写一张小票：一行进 `orbit_read_receipts` 表，一行 JSON 日志；配了 Axiom 密钥时再发一份给 Axiom。
  - 小票字段：路由模板（如 `GET /api/events/[id]`）、来源（app/web/cron/queue/other）、账号、查询数、行数、字节数、数据库耗时、失败查询数、响应字节数、状态码、抽样率。
  - `proxy.ts` 里的会话查询会并进同一个请求的小票。
  - 后台维护任务记为 `task:maintenance:<名字>`；不属于任何请求的读取记为 `unattributed`，不会丢。
  - 8 个连接池全部接入计量，以后新建连接池没接入，审计会失败。
  - 298 个路由一个都没改。
- **现在做不到的**：
  - 没读数据库的请求没有小票。
  - 直接调 `auth()`、不经过统一身份解析的路由，小票上账号为空。
  - 状态码、响应字节数和 HTTP 方法在 Vercel 上拿不拿得到，还没验证（遗留问题第 1 条）。

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| SC-0099-01 账本 5 个操作的小票和账本一致 | 通过 | ① 真实 Postgres 测试：用和读取成本基线测试相同的数据和 5 条链，每条链写一张小票，查询数/行数/字节数等于同一次运行里 `ledger.measure` 的结果。基线实测 contacts.list 6/2064/1409601、tasks.list 1/92/125682、notes.list 1/12/12116、dashboard 1/5068/3570222、events.list 1/13/21268，和冻结基线完全一致。② 真实 HTTP：`next build --webpack` 后 `next start -p 3100`，连本地 `orbit_events`，用 QA 账号走账号密码登录，请求 `/api/contacts`、`/api/tasks`、`/api/notes`、`/api/dashboard`、`/api/events`、`/api/inbox/summary`、`/api/events/event_08` 和一个网页；表里的小票路由、来源、账号（已脱敏）、各项数字都正确。③ 服务器日志逐条查询求和，与 65 张正常小票逐项一致 |
| SC-0099-02 小票写入失败时请求不变 | 通过 | 真实路由测试：把表改名后，状态码和响应体与正常时完全相同，只多一条警告 `read_receipt_write_failed` 42P01。单测：写入抛 `ECONNREFUSED`，客户端收到的仍是原来的 201 和原响应体。运行时注入：在 `orbit_events` 上按「正常 → 表改名 → 恢复」三轮请求 6 个接口，状态码、字节数和响应体哈希三轮一致（哈希前去掉 `collectedAt`、`asOf` 两个每次都会变的时间字段）。 |
| SC-0099-03 8 个连接池接入，未接入的会让审计失败 | 通过 | 先看到失败：审计列出 6 处未接入（名片识别 ×3、活动运营客户端、画像修复脚本、维护任务）。改为 `meterPostgresPool(new Pool(...))` 后通过。审计本身也被检查：临时放一个未接入的连接池会被报出来；列入例外的文件如果不再调用计量函数，同样会被报出来。 |
| SC-0099-04 日志和 Axiom 里没有原始账号、SQL、参数；没配 Axiom 时不发外部请求 | 通过 | 单测覆盖载荷内容；账号在日志和 Axiom 里只有 16 位十六进制指纹；缺任一 Axiom 变量时，把全局 fetch 换成「一调用就报错」的桩，调用次数为 0。运行时日志里原始账号出现 0 次。 |
| SC-0099-05 后台读取按任务名或 unattributed 记录；全量、typecheck、棘轮 | 通过 | 单测覆盖归属顺序（后台任务 → 当前请求 → unattributed）。Postgres 测试里，请求之外的读取写成一行 unattributed。全量和 typecheck 见第 5 节。 |

另做了一次变异检查：临时让字节数永远加 0，4 条 Postgres 测试里有 3 条变红，随后恢复。这说明测试确实在检查数字。

## 3. 设计选择

- **怎么把读取归到请求**：
  - `instrumentation.ts` 在 Node 运行时安装一个 Next 适配器。请求里第一次读数据库时，适配器只读 Next 内部的请求状态拿到路由模板，然后登记一次 `after()`，在响应发出后写小票。
  - 每个 HTTP 请求到达时，Node 自带的 `http.server.request.start` 和 `http.server.response.finish` 事件给它打上请求编号和方法，并在响应结束时给出状态码和响应字节数（按 socket 已写字节算，包含响应头）。
  - 请求编号在 `proxy.ts` 运行之前就打上了，所以 proxy 的会话查询会并进路由的小票；proxy 自己直接回的请求记为 `GET (proxy)`。
  - 没有采用「逐个包装路由 + 审计」的备选方案，因为要改 298 个文件，导出写法又不统一，和主线正在进行的工作冲突风险大。
  - 代价：依赖 Next 内部模块 `next/dist/server/app-render/*.external`。所有访问都做了保护，Next 升级后如果失效，读取会落到 `unattributed`；Postgres 测试直接依赖这些模块，失效时会变红。
- **账号**：只在 `resolveAuthenticatedApiActorFromSession` 里记录。数据库存原始账号编号；日志和 Axiom 只放 `sha256("orbit-read-receipt:v1:"+id)` 的前 16 位十六进制。
- **计量接入点**：在 `createPostgresReadMetricsRunner` 里统一接上小票计量。原来的读取预算闸门 `configuredReadMetrics` 没有改。
- **表** `orbit_read_receipts`：

  | 列 | 说明 |
  |---|---|
  | `id` | 自增主键 |
  | `occurred_at` | 时间，有索引 |
  | `route` | 路由模板 |
  | `source` | 来源 |
  | `account_id` | 原始账号编号 |
  | `query_count`、`row_count`、`byte_count`、`db_ms` | 查询数、行数、字节数、数据库耗时 |
  | `failed_query_count` | 失败查询数 |
  | `response_bytes`、`status_code` | 响应字节数、状态码 |
  | `sample_rate` | 抽样率 |

  建表挂在 `runOrbitRecordsMigration` 的最后一步，用现有的 `npm run db:migrate:live` 执行。
- **环境变量**：

  | 变量 | 默认 | 作用 |
  |---|---|---|
  | `ORBIT_READ_RECEIPTS` | Next 的 Node 服务器里默认开，测试和脚本里默认关 | `0` 关闭，`1` 强制打开 |
  | `ORBIT_READ_RECEIPTS_SAMPLE_RATE` | 1 | 按请求抽样 |
  | `AXIOM_TOKEN` + `AXIOM_DATASET` | 未设 | 两个都设了才发送；每批最多 100 条，超时 3 秒 |

- **不属于任何请求的读取**：进一个进程级账本，每 60 秒或满 1000 条查询写一次。

## 4. 文件与提交

路径都在 `repos/orbits` 下。

- **新增**：
  - `instrumentation.ts`
  - `shared/observability/read-receipts.ts`、`read-receipts-next.ts`、`read-receipts-sink.ts`、`read-receipts-configured.ts`
  - `shared/storage/metered-postgres-pool.ts`
- **修改**：
  - `shared/storage/postgres-read-metrics.ts`
  - `shared/storage/migrations.ts`
  - `app/api/_shared/authenticated-actor.ts`
  - `features/operations/maintenance/pass.ts`
  - 6 个连接池文件
  - `docs/operations/postgres-read-metrics.md`
- **测试**：
  - `tests/audits/postgres-pool-metering.test.ts`
  - `tests/observability/read-receipts.test.ts`（10 条）
  - `tests/observability/read-receipts-postgres.test.ts`（4 条，真实 Postgres）
  - `tests/support/next-request-scope.ts`、`next-async-local-storage.ts`
  - `tests/performance/read-cost-chains.ts`：5 条链抽成公共函数，基线测试和小票测试共用
  - `tests/services/postgres-live-record-storage.test.ts`：迁移语句多了一条
- **提交**：
  - `0680ee41f` feat(orbits): request read receipts for every server request (0099 O1)
  - `bd127bcf8` fix(orbits): run the read-receipts migration last to keep migration order

## 5. 全量、typecheck、棘轮（子代理执行）

- **orbits**：
  - 第 1 次：35 条失败，其中 2 条是新增。原因是 `relationship-lifecycle-migrations` 写死了迁移顺序，新建表的语句插在了第二步。
  - 修复后第 2 次（`bd127bcf8`）：5132 条，4708 通过，33 失败，391 跳过，127 秒。33 条按名字全部在 `0098-main-health/orbits-known-failures.txt` 里。
  - 已知清单里有 2 条这次通过了：本 Sprint 对 `orbit_test` 跑了迁移，补齐了它缺的基础表。
- **App**：3596 条，1 失败，是已知的 route-parity。
- **typecheck**：orbits、orbits:app、App 都是 0 错误。
- **读取上限棘轮**：基线文件没改，实际共 170 处。审计仍是红的，原因同 0098：`orbit-agent-chat-session-live-record-provider.ts` 5 > 4，属于已知问题，转 0109。
- **GitNexus**：
  - `resolveAuthenticatedApiActorFromSession`、`createEventOperationsPostgresClient`、`configuredReadMetrics` 为 CRITICAL；最后一个最终没有改。
  - `createPostgresReadMetricsRunner` 为 HIGH，但所有配置好的数据库读取都经过它，实际应按 CRITICAL 看待。
  - 应对：所有改动都只是附加计量，异常全部吞掉，并跑了两端全量。

## 6. 生产环境需要用户做的

1. **先迁移，再部署**：对生产库执行 `npm run db:migrate:live`（可以重复执行）。如果先部署，在表建好之前每个请求都会打一条警告，但请求本身不受影响。
2. **环境变量**：不配也默认开启。接 Axiom 要配 `AXIOM_TOKEN`、`AXIOM_DATASET`；紧急关闭设 `ORBIT_READ_RECEIPTS=0`。
3. **上线后先检查**：前几张小票的 `status_code`、`response_bytes` 和路由方法是否为空。

## 7. 遗留问题

1. **Vercel 上还没验证 Node 的 `http.server.*` 事件会不会触发。** 如果不触发：状态码和响应字节数为空，路由没有方法前缀，proxy 的读取不会并进路由小票，而是单独记为 `? (proxy)`。补救办法是让 `proxy.ts` 往请求头里写入方法。这个改动很小，但 proxy 是高风险路径，本 Sprint 没有做。
2. 依赖 Next 内部模块，升级 Next 后要看 Postgres 测试是否还是绿的。
3. 约 18 个直接调 `auth()` 的路由，小票上没有账号。
4. 响应字节数包含响应头；登录那个 POST 请求没有响应字节数。
5. 写入失败的 SQL（包括小票写入失败）也按原有规则记为失败查询，进 `unattributed`。
6. `unattributed` 靠定时器写入，serverless 实例被冻结时可能来不及写。
7. `scripts/` 目录下的连接池不在审计范围内。
8. **本地数据库**：`orbit_events` 新建了 `orbit_read_receipts`，留有约 80 行本地小票；`orbit_test` 补上了基础表。
9. **环境风险**：`repos/orbits/.env` 里的 `ORBIT_EVENT_DATABASE_URL` 指向 Neon 云端库，本机能连到本地库，完全靠 `.env.local` 里的 `ORBIT_DATABASE_TARGET=local`。本 Sprint 所有命令都显式指定了本地目标。
10. `repos/orbits` 里有一个遗留的独立 `.git`（main 分支，旧提交）。子代理误在里面执行过一次 `git add`，已撤销。
11. 端口 3000 上的 dev server 是在本 Sprint 之前启动的，要重启才会加载 `instrumentation.ts`。

## 8. 协调者复核
协调者在 `bd127bcf8` 上独立执行：

- **定向测试**：`node scripts/run-node-tests.mjs` 跑 3 个新测试文件，结果 16 条，12 通过，4 跳过。那 4 条跳过是 Postgres 测试，只有设置了 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 才会执行，和既有的读取成本基线测试是同一个约定；所以**默认全量不会执行它们**。设置 `ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://localhost:5432/orbit_test` 后，再跑这 4 条加上读取成本基线测试，共 6 条全部通过。
- **orbits 全量**：5132 条，4708 通过，33 失败，391 跳过，125 秒。按名字和 `0098-main-health/orbits-known-failures.txt` 对照，没有新增失败。
- **运行时抽查**：在主检出 `next build --webpack` 后，用 `next start -p 3100` 连本地库，未登录请求 `/api/events/public/event_08` 两次，都是 200。表里新增两行小票：`GET /api/events/public/[id] | other | 无账号 | 3 查询 | 3 行 | 2536 字节 | 200 | 响应 2689 字节`。另请求了一次未登录的 `/api/tasks`，返回 401，没有读数据库，所以没有小票，和设计一致。
- **diff 审查**：没有新增 skip 或 only。
- **0098 补充复核**：在外接盘 worktree 上重跑 App 全量，3596 条，1 失败（route-parity），和子代理的结果一致。

**之后每个 Sprint 的验证注意**：默认全量会跳过需要 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 的 Postgres 测试。凡是涉及数据库行为的 Sprint，要设置这个变量再跑一遍它们的定向测试。
