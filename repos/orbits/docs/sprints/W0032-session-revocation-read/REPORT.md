# Sprint W0032 — 执行总结

对应 [GOAL.md](GOAL.md)。改了哪些文件看 git diff，这里不逐文件复述。

## 结果

- 已验证能做到：
  - 每次登录状态检查只发一条 SQL，只取判定要用的几项：状态、账号编号、密码修改时间、「能否正常读」标记。密码哈希和找回密码信息不再读出。生产构建实测每次从 850 B 降到 145 B（17.1%）；用真实注册、重设路径造的账号，每次 946–1,355 B 降到 149–172 B（11.4%–17.3%），满足「≤ 改前 30%」的硬条件（SC-04）。
  - 检查不再和其他请求合并读取（D31）。重设完成之后才发起的检查一定发出自己的查询，并判定失效。同进程、两个独立实例都已测过；同一用户同时 5 次检查就发 5 条查询；旧写法下同样的场景会搭上重设前的旧结果，测试能测出来（SC-02 (d)）。生产构建里并发实验的共享命中从 40 次降到 0 次（SC-01）。
  - 判定结果和旧读取完全相同：等价矩阵 36 个场景，覆盖正常、改过密码、各种坏数据，时间戳相关场景在 4 个时区对照（SC-02 (a)）。
  - 读库失败时，行为和改前一样：会话 cookie 被清掉，页面跳到登录，接口返回 401。读取闸门超预算时，检查照样放行。这 3 条 Auth.js 集成测试改前、改后结果相同（SC-03 (e)）。
  - 在 3001 上把 verify-plan 的密码修改时间改成当前时间：同一个 cookie 的下一个页面请求 307 跳到 `/app/account/login?next=%2Fapp%2Fagent`，下一个接口请求返回 401，`/api/auth/session` 清除 cookie。之后已恢复账号（SC-05）。
- 仍未实现或未验证：
  - **SC-04 月上限判定为 fail**：按规定取区间上端，改后每月 1,610–2,941 MB，上端超过 2.0 GB；只算已知部分就有 1,436–1,703 MB。按 D30 交用户按实测放宽上限，没有扩大改动。改前同口径为 9,435–14,535 MB。
  - SC-01 (c) 第二条字面不成立：页面文档和 RSC 请求在串行探针里，每个请求从 2 条变成 3 条（见「偏差」1）。

## 运行记录

- 结果：completed（SC-04 月上限一项 fail，按 D30 放宽；SC-01 (c) 一条偏差，协调者裁定见文末）
- Generator：Claude Opus 5.5，2026-09-29，run-01；Planner revision 3（sha256 `635e4b46b853ac70bc489b96966b3f1476c750aa31c19ecb616e79eb9df34e6b`）
- 分支 `sprint/W0032-session-revocation-read`，基线 `4ef753de`（`git diff b3db05d5 HEAD -- features/auth shared/storage auth.ts proxy.ts app/api/_shared` 为空）；功能 SHA `49df2c77`；`chat-agent` 合并 SHA：见登记表
- 档位 H。全量对照：两份 `git archive` 副本依次运行，排除 `event-registration-readback`，跑完已删除。基线 5,809 个测试、失败 89；HEAD 5,826 个测试、失败 89；两边失败清单完全相同，新增失败 0
- 付费 AI 调用 0；未 push；未部署；未碰生产库
- REPORT 由协调者按 Generator 交回的正文落盘
- 证据：`~/orbit-sprint-evidence/web/sprint-W0032/run-01/`

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0032-01 生产构建实测 | pass（(c) 一条偏差，已裁定） | 请求清单 `01-base-browser.json`、`05-after-browser.json`；SQL `01-base-sql.jsonl`、`05-after-sql.jsonl`；分析 `0{1-base,5-after}-analysis.{json,txt}`；探针 `*-probes.json`；按时间窗统计 `window-count.py`；规程 `01-base-step*.txt`、`05-after-step*.txt` |
| SC-W0032-02 等价、单读取、不共享、失效时机 | pass | `tests/capabilities/session-revocation-read.test.ts`（14 条，PG 部分 0 skip）；RED `03-red-read.txt`（11 fail），GREEN `04-green-read.txt`（14/14）；变异 `04-mutations.txt` |
| SC-W0032-03 SQL 形状、闸门、不共享、计量、失败即登出 | pass | 同上文件 SC-03 (a)～(d)；`tests/pages/session-revocation-auth-integration.test.ts`：改前 `03-auth-integration-before.txt` 3/3，改后 `04-auth-integration-after.txt` 3/3 |
| SC-W0032-04 流量 | 单次字节 pass；月上限 **fail**（上端 2,941 MB > 2,000 MB，按 D30 放宽） | `06-measure-bytes.txt`（脚本 `measure-w0032-session-bytes.ts`）、`06-explain.txt`、`10-traffic.txt`（脚本 `traffic.py`） |
| SC-W0032-05 回归 | pass | `04-tsc.txt` exit 0；定向 `05-targeted.txt` 97/97；3001 `08-browser-3001.json` 与 8 张 `08-*.png`；指纹 `08-fingerprint-*.txt`、`08-summary-*.txt`；全量 `09-*` |

### SC-01 生产构建实测（verify-plan，`next start` 单实例，基线 3012，改后 3013）

**串行探针**（一次只发一个请求，每类 5 次）：

| 请求类型 | 改前：语句数／每条字节 | 改后：语句数（＝逻辑检查次数）／每条字节 |
| --- | --- | --- |
| `/api/account/me`、`/api/inbox/summary`、`/api/inbox/notifications`、`conversation-summaries`、`/api/auth/session` | 2 ／ 850 B | 2 ／ 145 B |
| 页面文档 `/app/agent` | 2 ／ 850 B | **3** ／ 145 B |
| RSC 请求 `/app/events`（`RSC: 1`） | 2 ／ 850 B | **3** ／ 145 B |

**受控并发实验**（按时间窗统计）：

| 实验 | 请求数 | 逻辑检查 | 改前 leader SQL／共享命中 | 改后 leader SQL／共享命中 |
| --- | --- | --- | --- | --- |
| me、summary 串行 20 轮 | 40 | 80 | 80 ／ 0 | 80 ／ 0 |
| me、summary 同时发 20 轮 | 40 | 80 | **40 ／ 40** | 80 ／ **0** |
| 同一用户同时 5 个 me，共 5 轮 | 25 | 50 | 10 ／ 40 | 50 ／ **0** |

- 1.55–1.67 条的实测解释：并发时同一用户的检查被进程内 in-flight 去重合并；页面请求内 layout 与 page 的两次检查也被合并。
- 并发时 `sql-tap` 的逐请求归属不可靠（pg 连接池把排队中的查询放在释放连接的那个请求的异步上下文里执行），并发一栏改用时间窗统计；串行探针不受影响。

**完整请求清单**（只列经过 matcher 的请求）：

| 场景 | 请求（文档 + API + server action） | 改前 SQL（leader）／字节 | 改后 SQL（＝逻辑检查）／字节 |
| --- | --- | --- | --- |
| 首次加载 `/app/agent` | 1 + 10 + 1 | 13 ／ 11,050 | 25 ／ 3,625 |
| 首次加载 `/app/events` | 1 + 2 | 6 ／ 5,100 | 7 ／ 1,015 |
| 首次加载 `/app/events/[id]` | 1 + 3 | 7 ／ 5,950 | 9 ／ 1,305 |
| 首次加载 `/app/contacts`（落到 dashboard） | 1 + 2 | 6 ／ 5,100 | 7 ／ 1,015 |
| 首次加载 `/app/tasks` | 1 + 4 | 6 ／ 5,100 | 11 ／ 1,595 |
| 首次加载 `/app/start` | 1 | 2 ／ 1,700 | 3 ／ 435 |
| 收件箱消息页签（20 秒） | 5 API | 6 ／ 5,100 | 10 ／ 1,450 |
| 收件箱通知页签（20 秒） | 5 API | 6 ／ 5,100 | 10 ／ 1,450 |
| 顶部导航 → `/app/events`、`/app/contacts/dashboard`、返回、→ `/app/agent` | 各 1 文档 + 2 API（agent 为 10 + 1） | 6、6、6、13 | 7、7、7、25 |
| **合计（14 个场景）** | 83 | 106 ／ 90,100 | 178 ／ 25,810（28.6%） |

- 顶部导航（iOrbit、活动、人脉）是普通链接，点击是整页文档请求；每次停留 5 秒，改前改后都没有观察到 RSC 请求或 `<Link>` 预取。
- 规程收尾：两轮都在启动前确认端口空闲，只结束本轮记下的 PID（基线 10467／10498，改后 13086／13112），确认退出后按 `.next-w0032-` 前缀核对再删除构建目录。3001 前后都是 PID 83693、HTTP 200；3000 始终没有进程；`.next`、`.next-verify` 未触碰；`tsconfig.json` md5 不变；`next-env.d.ts` 每轮都已还原；`git status --short` 与开工前一致。

### SC-02／SC-03 新读取

- SQL（`features/auth/session-revocation.ts`，带注释 `/* auth-session-revocation:v1 */`）：子查询按 `getRecord` 的 where 取 1 行（`workspace_id`、`collection_name`、`record_id`，`lifecycle_state <> 'deleted'`，`limit 1`），同时算出 `readable`（`payload` 是对象，且四个时间列满足 `IDENTITY_ROW_READABLE` 规则，用 `jsDateSafeTimestampSql` 组合）。常规行返回 `lifecycle_state`、`readable`、`id`（`payload -> 'id'`）、`password_changed_at`（`payload -> 'passwordChangedAt'`，jsonb 原值）；不可读行在同一结果中带回原生的 `occurred_at`、`created_at`、`updated_at`、`deleted_at`、`payload`（c1～c5），交给真正的 `rowToRecord` 后用同一判定函数判定。
- 判定：新旧路径共用 `isSessionCurrent(lifecycleState, payload, input)`，表达式与旧代码逐字相同；lifecycle 映射同 `rowToRecord`。
- 唯一 key：`JSON.stringify(["auth-session-revocation:v1:unshared", workspaceId, recordId, seq])`，`seq` 为模块级单调递增计数器。检查仍经 `customRead`，只过一次闸门（`auth_users`）、走计量客户端；任意两次调用都不合并。1,000 次调用后去重表没有残留。不需要改 shared 契约。
- 旧路径：`database` 没有 `client`／`customRead` 时（测试替身）仍走 `store.getRecord`；`password-reset.test.ts` 未改，照常通过。
- 变异检验（`04-mutations.txt`）：改成 `->> 'id'`、key 去掉序号、未知 lifecycle 不映射为 active，都被测试抓到。
- RED 说明：(d) ② 跨实例在改前代码上也通过（改前各实例的去重表本来就互不共享），这条锁的是改后仍成立；D31 要堵的是 (d) ①，改前 RED 为「Y 等 X」超时。
- EXPLAIN（本机开发库，8,715 行）：`Index Scan using orbit_records_pkey`，不需要新索引。

### SC-04 流量（W0017 口径，1000 人日活 × 30 天，MB／GB 十进制）

| 账号状态 | 改前 | 改后 | 比例 |
| --- | --- | --- | --- |
| 刚注册 | 946 B | 149 B | 15.8% |
| 申请重设中（带 `passwordReset`） | 1,306 B | 149 B | 11.4% |
| 重设后 | 995 B | 172 B | 17.3% |
| 重设后再申请（有残留） | 1,355 B | 172 B | 12.7% |
| 生产构建 verify-plan | 850 B | 145 B | 17.1% |

- 每人每天的逻辑检查次数：已知部分 330 次（`/api/account/me` 56 × 2；收件箱其他轮询 80 × 2；页面加载红点 10 × 2；打开收件箱时的列表读取 4 × 2；页面文档 10 × 3）。页面内其他请求按每天 10 次页面加载计：下界 +40 次（共 370 次，6 个页面实测平均；RSC 与预取实测为 0）；上界 +240 次（共 570 次，每次页面加载按 `/app/agent` 计，RSC 与预取虽实测为 0 仍各按 1 次、每次 3 次检查计）。

| 口径 | 改前（850 B） | 改后（145–172 B） |
| --- | --- | --- |
| **跨实例不去重上限**（判定口径） | 9,435–14,535 MB | **1,610–2,941 MB** |
| 单实例实测（改前 leader／逻辑 = 0.596） | 约 5,619–8,656 MB | 与上限口径相同（不再共享） |
| 其中只算已知部分 | 8,415 MB | 1,436–1,703 MB |

- 改后单实例的 SQL 条数比改前多：改前约 40% 的逻辑检查被合并掉，改后全部各自执行，折合 651–1,190 MB，已计入改后总数。
- 判定：区间上端 2,941 MB 超过 W32-3 的 2.0 GB，本项 **fail**。上端里约 1,238 MB 来自上界假设（其他 API 826 MB、server action 103 MB、RSC 155 MB、预取 155 MB）。

## 偏差

1. SC-01 (c) 第二条「串行探针中每请求语句数与改前相同」对页面文档和 RSC 请求不成立（2 → 3）：改前的 2 条里已经有 1 次是同一请求内 layout 与 page 的并发检查被去重合并；D31 要求检查不参加去重，W32-1 A 又不做请求内去重，所以改后是真实的 3 次逻辑检查。API 类请求仍是 2 → 2。流量表已按 3 次计。
2. 顶部导航实际是 iOrbit、活动、人脉（`/app/contacts/dashboard`），没有 `/app/tasks`；这些链接是整页加载，没有观察到 RSC 或预取，按 SC-04 规则给了上界。
3. `--reset verify-plan` 会删掉开工前就有的 `guideState.grandfathered`；用 verify-plan 正常访问一次 `/app/agent` 后，summary 与开工前完全一致；非 verify 行指纹始终不变（`b594b525…`）。

## 假设与额外阅读

- 上下文包之外读了：`features/sync/read-budget-gate.ts` 第 169–183 行；`shared/storage/live-database-config.ts`；`shared/storage/migrations.ts`（`lifecycle_state` 的 CHECK 约束，等价矩阵的临时 schema 里删掉了它才能造「未知值」）；`features/auth/mobile-crypto.ts` 的 `issueAuthJsCookie`；`node_modules/next-auth/lib/index.js`（`proxy` 用 `x-forwarded-proto` 决定 cookie 名，集成测试因此补了 `host` 与 `x-forwarded-proto: http`）；`scripts/seed-verify-accounts.ts` 头注释。
- 生产计量的 `sql-tap.cjs` 从 W0031 复制并扩展（每个请求记一行，含 rsc、prefetch、探针标签；`auth_users` 语句分 full、light 两类，记 recordId 的哈希），只放证据目录。
- 3001 撤销验收用临时脚本（用完删除，副本 `browser-3001.mjs` 在证据目录），只更新 verify-plan 一行的 `passwordChangedAt`，cookie 不落盘。
- RED 首轮因 (d) ① 在旧代码上一直等待被中断过一次，遗留的临时 schema 已删除；之后给 Y 加了 2 秒超时。

## GitNexus

- 开工 `analyze --force --index-only`（`00-gitnexus-analyze.txt`），impact 见 `00-impact.txt`：`isPasswordSessionCurrent` LOW（1 个调用方 `auth.ts:jwt`），按 PLANNER 视为 H 档（Auth.js 动态调用，覆盖全部登录请求），文本搜索确认只有 `auth.ts` 与 `password-reset.test.ts` 两处调用。只调用、不修改：`authUserRecordId` HIGH、`rowToRecord` CRITICAL、`jsDateSafeTimestampSql` CRITICAL。
- 提交前 `detect-changes --scope staged`（`07-detect-changes.txt`）：3 个文件、1 个符号、0 个受影响流程，risk low。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex `codex review --base chat-agent` P2：`next-env.d.ts` 指向 `.next-verify` | 不成立：工作树未提交文件，分支 diff 不含它 | 无需修改；对功能改动无意见 |

## 交接

- 接口：`isPasswordSessionCurrent(input, database?)`。`database` 同时带 `client` 与 `customRead` 时走新读取，否则走 `store.getRecord`。新 SQL 带注释 `/* auth-session-revocation:v1 */`，去重 key 前缀 `auth-session-revocation:v1:unshared`。
- 给 W0019：本路径月流量实测 1,610–2,941 MB（跨实例不去重）；上线后在 Neon 对照：`auth_users` 的读取应只剩带上述注释的轻量语句（每条约 145–172 B），19 列整行读取只剩登录时 `getUserByEmail` 等非检查路径。
- 回退：revert `49df2c77`。退回整行读取与进程内去重，无数据迁移。

## 协调者裁定与用户决定

- review 表：Codex `codex review --base chat-agent`（全文 `codex-review.txt`）唯一意见 P2「`next-env.d.ts` 指向 `.next-verify`」不成立——3001 验收 server 自动改写的工作树未提交文件，分支 diff 不含它；对会话检查改动本身无意见。
- 偏差 1（页面文档／RSC 每请求 2 → 3 条）：是 D31「不参加去重」的直接后果，逻辑检查次数本来就是 3，流量表已按 3 计。协调者接受（2026-09-29）。
- SC-04 月上限：按 D30 放宽；用户决定 D32：本路径上限放宽到 ≤3.0 GB（实测 1,610–2,941 MB）；各本账合计约 4.9–6.3 GB，先发布，W0019 加发布门：上线后每周看 Neon 出站，到 3.5 GB 启动下一轮瘦身或升级套餐。
