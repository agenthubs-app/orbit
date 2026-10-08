# Sprint W0032 — 登录会话有效性检查（`isPasswordSessionCurrent`）读取瘦身

**Plan revision:** 3（2026-09-29）。
- revision 1（sha256 `f5fb170ff6e4371fc8c0eaabe37695eed68926f578399c9757fe60e66f0301d4`）经 Codex 方案 review（`scratchpad/w0032/codex-plan-review.txt`，3 条 P1、2 条 P2）修订为 revision 2，并入用户决定 D30。
- revision 3 并入用户决定 D31：检查读取不参加进程内 in-flight 去重，只过闸门与计量。
- 逐条处理见末尾「review 处理」。

**模式:** existing-codebase / single-generator。运行状态以登记表为准。

**原需求:** RV-03、RV-05。来源：W0031 REPORT「观察项」1，用户决定 D28、D30、D31（2026-09-29）。

**单一目标:** 每个登录请求上的会话有效性检查（Auth.js `jwt` 回调 → `isPasswordSessionCurrent`）改为：
- **每次逻辑检查各发一条只返回判定所需列的 SQL**，不再整行读取 `auth_users`（约 850 B／条）；
- **不参加进程内 in-flight 去重**（D31），只过读取预算闸门与计量。这样在所有实例上，密码重设提交之后才发起的检查一定重新读库，不会搭上重设前已发出的查询。

其余安全与失败语义完全不变（D20）：失效时机不变；读库失败照旧清 cookie、按未登录处理；坏数据的判定结果与旧读取相同。先按生产构建实测每类请求的检查次数、字节与去重情况，再改、再测，给出月流量。

**易读目标:** [GOAL.md](GOAL.md)。

**基线:** 编制时 `chat-agent` `b3db05d5`（W0031 已合并，`f4e04a54`）；revision 2、3 按 `a032e523` 复核，本 Sprint 相关文件与 `b3db05d5` 相同。行号按 `b3db05d5`。开工时 `git diff b3db05d5 HEAD -- features/auth shared/storage auth.ts proxy.ts app/api/_shared` 复核并在 REPORT 登记。

**进入条件:**
- W0031 已 completed 并合并（D28 依赖）。✔
- W32-1～W32-6 已由用户决定（D30、D31，2026-09-29，见「已定决定」）。✔
- 本机 PG 测试库 `orbit_test` 可用；3001 验收 server 可用；本机有两个空闲端口给生产构建（建议 3012 基线、3013 改后，启动前探测）。
- 同一工作树上没有其他 Generator 在跑（生产构建会写 distDir 和 `next-env.d.ts`）。W0033 须已收口或在外接盘 worktree；两边不得同时跑生产构建，也不得同时写 3001 的 verify 账号数据。
- 不需要云端授权，不调用付费 AI，不部署，不碰生产库。

## 已定决定（D30、D31，2026-09-29）

| 编号 | 问题 | 决定 |
| --- | --- | --- |
| W32-1 | 是否做「同一请求只读一次」 | **A：只瘦身**，不做请求内去重。B（React `cache` 合并同一渲染内的 `auth()`）与 C（proxy 用内部请求头把结果交给 handler）不做。SC-01 的每类请求检查次数表留作以后评估依据（D30） |
| W32-2 | 是否允许跨请求短时缓存 | **不允许**（D30） |
| W32-3 | 验收上限 | **单次字节 ≤ 改前的 30%（硬条件）**；**月上限 ≤2.0 GB**（跨实例不去重口径，十进制），单独记账，不并入 1.2 GB（D27）与 2.5 GB（D25）；实测超出时交用户按实测放宽上限，**不扩大改动**（D30） |
| W32-4 | 频次假设 | 沿用 W0031 改后实测频次与 W31-4（收件箱每天 10 分钟、打开 2 次、页面加载 10 次、1000 人全按日活）；页面内其他接口、RSC 导航与预取按 SC-01 实测补齐；没测到的项按 SC-04 给上界，不按零计（D30） |
| W32-5 | 读库失败时 Auth.js 清 cookie（用户被登出） | **保持不变**，并用 Auth.js 集成测试锁住（SC-03）（D30） |
| W32-6 | 密码重设提交前已发出的检查读取，可能被重设后到达的请求搭上（review P1） | D30 选 A（`consume` 驱逐本进程去重表）。**D31 改为：检查读取不参加 in-flight 去重**，所有实例上都没有可搭的共享读取。`consume` 驱逐因此不再需要，不做（理由见「决定」） |

## 已查清的事实（`b3db05d5`）

1. **判定逻辑**（`features/auth/session-revocation.ts`，全文 11 行）：
   ```ts
   export async function isPasswordSessionCurrent(input: { email: string; userId: string; authenticatedAt: number }, database = createConfiguredPostgresLiveRecordStore() as { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string } | null): Promise<boolean>
   ```
   - `database` 为 null（未配置库）→ `process.env.NODE_ENV !== "production"`。
   - `store.getRecord({ workspaceId, collectionName: "auth_users", recordId: authUserRecordId(email) })`：SQL 选全部 19 列，`lifecycle_state <> 'deleted'`，`limit 1`，经 `rowToRecord` 转换。
   - 判定顺序：先看 `!user || user.lifecycleState !== "active" || user.payload.id !== input.userId`，成立则 false。再看 `passwordChangedAt`：非字符串 → true；字符串 → `Date.parse(changedAt) < authenticatedAt`（NaN、相等都得 false）。
   - `rowToRecord`（`postgres-live-record-store.ts` 第 129–156 行）把 archived／deleted 以外的任何 `lifecycle_state` 都映射成 `"active"`。字段求值顺序是 `occurredAt`→`createdAt`→`updatedAt`→`deletedAt`→`payload`，以下情况会抛错：
     - `created_at`／`updated_at` 为 null、±infinity（pg 解析成 `Infinity`）或超出 JS 日期范围；
     - `occurred_at`／`deleted_at` 为超出 JS 范围的有限值（无穷不抛）；
     - `payload` 为 jsonb 字符串标量时 `JSON.parse` 失败。
   - payload 为 jsonb `null` 时，`rowToRecord` 不抛错、返回 `payload: null`；判定时访问 `.id` 抛 TypeError，但只在 lifecycle 为 active 时才访问到。payload 为数组、数字、布尔时 `.id` 为 undefined → false。
2. **调用时机**（`auth.ts` 第 63–70 行；next-auth `5.0.0-beta.32`／`@auth/core` `0.41.3`／Next `16.2.9`）：
   - `jwt` 回调在非登录那一次、且 token 有 `email`、`sub` 时调用检查。
   - `@auth/core/lib/actions/session.js` 第 21–62 行：回调返回 null → 清会话 cookie；回调抛错 → 记 `JWTSessionError` 并清 cookie。
   - 上层 `auth()` 得到空会话后，proxy 对 `/app/*` 重定向登录，对非公开 `/api/*` 返回 401。
3. **每个请求检查几次**（静态核对，SC-01 实测）：
   - proxy：`proxy.ts` 第 33 行用 `auth()` 包住 matcher `["/app/:path*", "/api/:path*"]` 的全部请求（含公开白名单与 `/api/auth/*`）→ 1 次。
   - API：handler 经 `resolveAuthenticatedApiActor()`（`authenticated-actor.ts` 第 104 行）再查 1 次，理论合计 2 次。
   - 页面：proxy＋`app/(app)/app/layout.tsx` 第 27 行＋各 `page.tsx` 的 `auth()` → 至少 3 次。
   - 生产环境 `<Link>` 预取与 RSC 导航同样经过 proxy。
4. **W0031 平均 1.55–1.67 条（低于 2）的推测**：`getRecord` 的进程内 in-flight 去重把同一用户并发请求的检查合并了，而 `sql-tap.cjs` 只把合并后的 SQL 归给发出它的那个请求。串行探针只能证明无并发时的次数，**归因要靠 SC-01 (b) 的受控并发实验**。改后不再去重，单实例 SQL 数会升到逻辑检查次数。
5. **读取经过的机制**：
   - `createConfiguredPostgresLiveRecordStore()` 按连接串缓存实例。
   - `store.getRecord` 依次经过：读取预算闸门（`read-budget-gate.ts` 第 133–137 行）→ in-flight 去重 → 计量客户端。
   - `auth_users` 在 `READ_BUDGET_CRITICAL_COLLECTIONS`（第 55 行）中，**闸门对它永远放行**，只记量不拒绝。
   - 计量客户端的 `readMetrics` 由 `configuredReadMetrics(env)`（`transactional-postgres.ts` 第 102–107 行）提供，每条语句的返回量都会 `gate.observe`。
   - `customRead({ collectionName, key, read })`（`configured-live-record-store.ts` 第 121–128 行）：先 `gate?.assertAllowed({ collectionName })`，再 `deduper.once("customRead\0" + key, read)`。**只有 key 相同的进行中调用才会合并**；读取结束（成功或失败）即从表中删除。
   - 去重表不对外暴露。
6. **密码重设写入**：`features/auth/password-reset-store.ts` 第 54–64 行 `consume` 用原生 SQL 更新 `passwordHash`／`passwordChangedAt`，不经过 store，不清去重表。检查读取不再参加去重后，这一点对会话撤销不再有影响（见「决定」）。
7. **可复用的轻量读取模式**：W0030 的 `IDENTITY_ROW_READABLE`（`account-live-record-provider.ts` 第 197–202 行，未导出）用 `jsDateSafeTimestampSql`（`shared/storage/postgres-js-date-sql.ts` 第 15 行）判定四个时间列能否被 JS 正常转换。
8. **现有测试**：
   - `password-reset.test.ts` 第 235–248 行调 `isPasswordSessionCurrent(…, { store: records, workspaceId })`。替身没有 `customRead`／`client`，只覆盖旧路径。
   - `tests/pages/mobile-auth-routes.test.ts` 第 140–165 行已有用 `handlers.GET(new NextRequest(".../api/auth/session", { headers: { cookie } }))` 驱动真实 Auth.js 的写法。

## 调用方与风险（GitNexus，`b3db05d5`，索引落后 3 个文档提交）

- `isPasswordSessionCurrent`：upstream **LOW**（1 个直接调用方 `auth.ts:jwt`，0 执行流）。**不可按 LOW 对待**：`jwt` 由 Auth.js 动态调用，实际覆盖全部登录请求 → H 档。
- `authUserRecordId`：CRITICAL（3048，`partial`），只调用不修改。
- revision 3 起修改对象只剩 `isPasswordSessionCurrent`；`password-reset-*`、`configured-live-record-store.ts` 不再修改。
- 开工时先 `analyze --force --index-only`，再跑 upstream impact；UNKNOWN 与动态调用用文本搜索补查，存证据。

## 决定（实现要求）

### 新读取：一条 SQL、一次闸门、一个快照、不去重（review P1-2；D31）

- `database` 参数类型放宽为 `{ store; workspaceId; client?; customRead? } | null`。
  - `client` 与 `customRead` 都有时走新读取，否则走原 `store.getRecord`（测试替身不受影响）。
  - **新读取内部不再调用 `store.getRecord`**，没有二次读取。
- **不去重的实现（D31）**：`customRead` 必然按 key 做 in-flight 合并，这是 `createGatedDedupedCustomRead` 的固定行为。做法是**每次逻辑检查使用唯一 key**：
  - key 为 `JSON.stringify(["auth-session-revocation:v1:unshared", workspaceId, recordId, seq])`，`seq` 为模块级单调递增计数器。
  - 这样仍经 `customRead` 走同一闸门（`assertAllowed({ collectionName: "auth_users" })`）与同一计量客户端，但任何两次调用都不会合并；读取结束即从去重表删除，不累积。
  - 不改 `configured-live-record-store.ts`，不直接调用 `resolveSharedReadBudgetGate`，不自行拼装闸门与计量。
  - 若 Generator 发现唯一 key 无法保证不合并（例如去重实现变化），停下报告，不自行改 shared 契约。
- 发一条 SQL 到 `client`：
  - where 同 `getRecord`：`workspace_id = $1 and collection_name = $2 and record_id = $3 and lifecycle_state <> 'deleted' limit 1`。
  - 常规返回列：`lifecycle_state`；`payload->'id'`、`payload->'passwordChangedAt'`（**jsonb 原值，不用 `->>`**）；`readable`。
  - `readable` 的条件：`jsonb_typeof(payload) = 'object'`，且四个时间列满足 `IDENTITY_ROW_READABLE` 同样的规则。用 `jsDateSafeTimestampSql` 在本文件内组合，不改 `account-live-record-provider.ts`。
  - **兼容列**：只在 `readable` 为假时带值（`case when not <readable> then <列> end`），为真时是 null。取原生类型的 `occurred_at`、`created_at`、`updated_at`、`deleted_at`、`payload`，别名尽量短（如 `c1`～`c5`），减少常规行上 null 键的字节。
- 结果处理：
  - 无行 → false。
  - `readable` 为真 → 用轻量值按原判定顺序判定。lifecycle 映射同 `rowToRecord`。payload 视为 `{ id, passwordChangedAt }`：jsonb 缺失与 JSON null 都得 null，判定结果与旧路径的 undefined 相同，须测试证明。
  - `readable` 为假 → 用兼容列拼出一个 `PostgresLiveRecordRow`（其余列填无副作用的占位值），调用**真正的 `rowToRecord`**，再走与旧代码逐字相同的判定表达式。
- 这种做法的效果：
  - 每次逻辑检查只过一次闸门，读取在同一快照上，闸门字节按实际返回量记一次；
  - 每次逻辑检查各发一条 SQL，同进程或跨实例都没有共享结果；
  - 不加任何跨请求缓存（W32-2），不做请求内去重（W32-1 A）。

### 为什么不再做 `consume` 驱逐（D31 取代 D30 的 W32-6 A）

- D30 的驱逐只为一个问题：重设后到达的检查加入了重设前已发出的共享读取。检查读取不再参加去重后，每次检查都只拿自己发出的 SQL 的结果。只要这条 SQL 在重设提交之后才开始执行，读到的就是新值（PostgreSQL 读已提交），在所有实例上都成立。驱逐已没有对象。
- 保留驱逐只会多改三个文件（`password-reset-store.ts`、`password-reset-factory.ts`、`configured-live-record-store.ts`），扩大影响面，对会话撤销没有额外收益。因此从修改白名单中收回。
- `auth_users` 的其他读取者（如登录时 `getUserByEmail`）仍走 `getRecord` 去重，不影响会话撤销，不在本 Sprint 范围。

### 生产构建操作规程（SC-01、SC-04）

照搬 [W0031 PLANNER「生产构建操作规程」](../W0031-inbox-identity-polling/PLANNER.md#生产构建操作规程sc-01review-p1) 第 1～8 步与「绝对禁止」，只替换下表与以下几点：

| 轮次 | 代码 | distDir | 端口 |
| --- | --- | --- | --- |
| 基线 | 基线 SHA | `.next-w0032-base` | 3012（被占则顺延，REPORT 登记） |
| 改后 | 功能 SHA | `.next-w0032-after` | 3013（同上） |

- 启动时加 `NODE_OPTIONS=--require <证据目录>/sql-tap.cjs` 与 `W0032_SQL_TAP=<证据目录>/<轮次>-sql.jsonl`。
- `sql-tap.cjs` 从 W0031 证据目录复制后扩展，脚本只放证据目录：
  - 参数含 `auth_users` 的整行读取记为 `auth-session-full`，新 SQL 按形状记为 `auth-session-light`；
  - 每条记录加 `recordId` 参数的哈希（不记原文）。
- 删目录前核对路径以 `.next-w0032-` 开头。
- 3001 的 PID 与 HTTP 状态码前后必须相同；绝不动 `.next`、`.next-verify`，不在 3000、3001 上重启或结束进程。
- `next-env.d.ts` 每轮结束还原，不提交。

## 流量口径与估算（编制时估算，以 SC-01／SC-04 实测为准）

口径同 W0031：1000 人**日活**、30 天，W0017 口径（每条语句返回行 JSON 字节之和，null 键也计入），MB／GB 十进制。本路径单独记账（W32-3）。

每行分开记四种数：
- **请求数**；
- **逻辑检查次数**（`jwt` 回调调用检查的次数）；
- **leader SQL 数**（真正发到库的语句）；
- **共享命中数**（逻辑检查 − leader SQL）。改后应为 0。

月估算给两个口径：**单实例实测**与**跨实例不去重上限**（＝逻辑检查次数 × 每次字节），按上限口径判定。D31 之后两个口径的次数相同：改后单实例实测的 SQL 数会比改前多（改前有共享命中），上限口径与判定不变。

编制时已知部分（W0031 改后实测频次＋W31-4）：

| 来源 | 请求／人／天 | 每请求逻辑检查（推测） | 逻辑检查／人／天 |
| --- | --- | --- | --- |
| `/api/account/me` | 56 | 2 | 112 |
| 收件箱轮询其他端点（40 周期 × 2 个） | 80 | 2 | 160 |
| 页面加载时的红点 `summary` | 10 | 2 | 20 |
| 打开收件箱的额外列表读取（约） | 4 | 2 | 8 |
| 页面文档请求（10 次） | 10 | ≥3 | ≥30 |
| 页面内其他接口、RSC 导航、`<Link>` 预取 | **未知，SC-01 实测；SC-04 须给上界** | 2（API）／≥1（RSC） | — |
| **已知部分合计** | **160** | — | **≥330** |

按已知部分估算：改前约 330 × 850 B × 30,000 ≈ 8,415 MB；改后（每次估算 180–250 B）约 1.8–2.5 GB。**这不是容量预测**，未知项可能让实际数字明显更高。SC-04 用实测替换，并对仍未观测到的项给出显式上界。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

- **必读（行号按 `b3db05d5`）：**
  - `features/auth/session-revocation.ts`：全文（11 行），唯一的实现文件。
  - `shared/storage/configured-live-record-store.ts`，只读：
    - 第 25–45 行（`customRead` 契约）、第 47–118 行（去重器：key 相同才合并，读取结束即删除）；
    - 第 121–128 行（`createGatedDedupedCustomRead`）、第 192–243 行（组装与缓存）。
  - `shared/storage/postgres-live-record-store.ts`，只读：第 53–160 行（行类型、`timestampToString`、`requiredTimestamp`、`payloadFromRow`、`rowToRecord`）、第 368–390 行（`getRecord` SQL）。
  - `shared/storage/postgres-js-date-sql.ts`：`jsDateSafeTimestampSql`，只读。
  - `shared/storage/transactional-postgres.ts`：第 102–107 行（`configuredReadMetrics` 把返回量交给闸门），只读。
  - `features/sync/read-budget-gate.ts`：第 55、95–145 行（关键集合放行、`observe`／`assertAllowed`），只读。
  - `features/account/storage/account-live-record-provider.ts`：第 197–275 行（W0030 写法），只读参考。
  - `features/auth/password-reset-store.ts`：第 54–64 行（`consume`，写 `passwordChangedAt`），只读。
  - `auth.ts` 第 60–96 行；`proxy.ts` 第 33–75 行与第 168–171 行；`app/api/_shared/authenticated-actor.ts` 第 104–116 行：只读。
  - `node_modules/@auth/core/lib/actions/session.js` 第 21–62 行：只读。
- **测试与夹具：**
  - `tests/capabilities/password-reset.test.ts` 第 200–260 行：注册 → 申请 → 重设的现成流程。
  - `tests/capabilities/account-session-view-read.test.ts`：PG 临时 schema、四时区、配置层计量集成的写法（第 39–40、272、527、577 行）。
  - `tests/pages/mobile-auth-routes.test.ts` 第 140–165 行：真实 Auth.js `handlers.GET` 驱动写法。
  - 回归：`tests/services/read-budget-gate.test.ts`、`tests/storage/configured-live-record-store.test.ts`。
- **测量：** 复制 W0031 证据目录的 `sql-tap.cjs`、`prod-measure.mjs`、`analyze-prod.py`、`measure-w0031-session-bytes.ts` 到本 Sprint 证据目录再改，不进仓库。
- **前序交接要点：**
  - W0028：`customRead` 与 store 共用闸门与去重；`jsDateSafeTimestampSql`；四个时区 UTC、Asia/Shanghai、America/Los_Angeles、Pacific/Kiritimati。
  - W0030／W0031：轻量读取为可选分支，缺失时退回旧读取（D23、D25）；坏数据失败语义一致（D20）。
  - W0031：生产构建规程；`sql-tap.cjs` 按 HTTP 请求归属语句；改后 `/api/account/me` 每人每天 56 次。
  - W0016：3001 验收 server；cookie 用 `node --import tsx scripts/verify-session-cookie.ts verify-plan --header` 签发；用完 `node --import tsx scripts/seed-verify-accounts.ts --reset verify-plan`。
- **易错边界（都有对应 SC）：**
  - 检查读取不得与任何其他调用共享结果：同进程并发、跨实例都一样；不加跨请求缓存（SC-02、SC-03）。
  - `payload->'id'`／`payload->'passwordChangedAt'` 取 jsonb 原值；lifecycle 映射同 `rowToRecord`（SC-02）。
  - 坏数据走同一条 SQL 的兼容列与真正的 `rowToRecord`，不得二次读取，不得二次过闸门（SC-02、SC-03）。
  - 仍经 `customRead` 过闸门，SQL 发到计量客户端；返回里没有 `passwordHash`／`passwordReset`（SC-03）。
  - 读库失败后 cookie 必须被清、页面跳登录、API 401，这一行为不能因改动变化（SC-03）。
  - 测试替身行为不变（SC-02、SC-05）。
  - 生产构建只动自己的 distDir 与 PID（SC-01）。

## 范围与文件

- **修改：** `features/auth/session-revocation.ts`。
- **新建：**
  - `tests/capabilities/session-revocation-read.test.ts`：等价矩阵、单 SQL 与单闸门、不共享与重设竞态、SQL 形状、计量。
  - `tests/pages/session-revocation-auth-integration.test.ts`：Auth.js 失败即清 cookie、proxy 跳转与 401。文件名可调整。
  - 测量脚本只放证据目录。
- **排除：**
  - `auth.ts`、`proxy.ts` 的调用结构；`resolveAuthenticatedApiActor*`；Auth.js 版本与 cookie 策略。
  - 请求内去重（W32-1 A）。
  - `shared/storage/*`（含 `configured-live-record-store.ts`）。
  - 密码重设流程（含 `password-reset-store.ts`、`password-reset-factory.ts`）。
  - 其他读取或改写 `auth_users` 的代码。
  - App 端；迁移与索引；部署。

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0032-01 | **生产构建实测（改前与改后）**，按上文规程。<br><br>**(a) 完整请求清单**：用浏览器脚本记录每个日常页面场景的全部网络请求（文档、API、RSC、预取，含带 `RSC: 1` 头或 `_rsc` 参数的请求）：<br>- `/app/agent`、`/app/events`、`/app/events/[id]`、`/app/contacts`、`/app/tasks`、`/app/start` 的首次加载；<br>- 收件箱消息与通知页签；<br>- **RSC 导航**：从 `/app/agent` 点顶部导航依次进入 `/app/events`、`/app/contacts`、`/app/tasks`，再返回；<br>- **预取**：页面停留 5 秒内由 `<Link>` 触发的请求。<br>每个请求逐条记下 `auth-session-*` 的语句数、行数、字节。<br><br>**(b) 归因**：<br>- 串行探针：一次只发一个请求，分别请求 `/api/account/me`、`/api/inbox/summary`、`/api/inbox/notifications`、会话列表端点（以实际为准）、`/app/agent` 文档、一次 RSC 导航、`/api/auth/session`，得出每类请求的逻辑检查次数；<br>- **受控并发实验**：同一 cookie 同时发出 `/api/account/me` 与 `/api/inbox/summary`，重复 20 次，与串行 20 次对照；按 `recordId` 哈希与时间把语句分组；<br>- 报告逐场景列逻辑检查数、leader SQL 数、共享命中数，证实或推翻事实 4 对 1.55–1.67 条的解释。<br><br>**(c) 改后**：<br>- 正常数据下 `auth-session-full` 为 0；<br>- 串行探针中 `auth-session-light` 的每请求语句数与改前 `auth-session-full` 相同（W32-1 A）；<br>- 并发实验中共享命中数为 0，每请求语句数等于串行探针的逻辑检查次数（D31）。<br><br>**(d) 规程收尾**：两个本次 PID 已退出、两个 distDir 已删；3001 的 PID 与状态码前后相同；`.next`、`.next-verify` 未触碰；`git status --short` 与开工前一致（`next-env.d.ts` 已还原）。 | 请求清单 JSON、`*-sql.jsonl`、串行与并发对照表；规程各步输出 |
| SC-W0032-02 | **判定等价、单读取、不共享与失效时机**（本机 `orbit_test` 临时 schema，0 skip）。<br><br>**(a) 等价矩阵**：同一数据分别用旧路径（替身 `{ store, workspaceId }`）与新路径（真实 configured store）调用，结果相同（同 true、同 false、同 reject）。覆盖：<br>- 记录不存在；别的工作区；lifecycle 为 active／archived／deleted／未知值；<br>- `payload.id` 相同／不同／为数字（字面与 userId 相同）／缺失／JSON null；<br>- `passwordChangedAt` 缺失／JSON null／数字／对象／无法解析的字符串／早于、等于、晚于 `authenticatedAt`；<br>- 坏数据：`created_at`／`updated_at` 为 ±infinity 或超出 JS 范围；`occurred_at`／`deleted_at` 为无穷（不抛）或超出范围的有限值（抛）；以上在四个会话时区对照；<br>- payload 为 jsonb 字符串标量（可解析与不可解析两种）、`null`（active 与 archived 各一）、数组、数字；<br>- `database` 为 null 时，`NODE_ENV` 为 production 与非 production 各一次。<br><br>**(b) 单读取**：上述每个场景（含坏数据）新路径恰好 1 条 SQL、`customRead` 1 次、`store.getRecord` 0 次。<br><br>**(c) 失效时机**：真实流程（注册 → 申请重设 → `consume`，用现有两参数 `createPasswordResetStore`）：<br>- 重设前 true；<br>- `consume` 返回后第一次调用 false；<br>- `authenticatedAt` 晚于修改时间的新登录 true；<br>- 相继两次调用各自发 SQL。<br><br>**(d) 不共享与重设竞态**（D31，可控客户端挂起指定语句）：<br>- ① **同进程**：检查 X 的 SQL 挂起（将返回重设前的行）→ `consume` 提交 → 同一 configured store 上发起检查 Y → 断言 Y 另发了自己的 SQL 且得 false；X 放行后只交给 X。<br>- ② **跨实例**：两个独立的 configured store 实例（不同 `createClient`／缓存 key）连同一测试库，重复 ①，X 在实例 1、Y 在实例 2，断言相同。<br>- ③ **并发**：同一用户在同一实例上同时发起 5 次检查 → 5 条 SQL，5 个不同的 customRead key。<br>- ④ **反证**：旧路径（替身经 `getRecord` 去重）下重复 ①，Y 会搭上 X 并得 true，证明测试能测出问题。<br><br>**(e) 替身与既有调用方**：`password-reset.test.ts` 第 235–248 行不改、照常通过。 | 新测试先 RED 后 GREEN；PG 部分 0 skip 的输出 |
| SC-W0032-03 | **读取机制与失败语义**。<br><br>**(a) SQL 形状**：<br>- 常规行只有 `lifecycle_state`、`id`、`passwordChangedAt`、`readable` 与值为 null 的兼容列；不可读行才带原生兼容列；<br>- 任何行都没有 `passwordHash`、`passwordReset`、`record_id`、`source_*`、`provider*`、`search_text`、`evidence_ids`；<br>- where 含 `lifecycle_state <> 'deleted'` 与 `limit 1`。<br><br>**(b) 闸门**：<br>- 每次逻辑调用 `assertAllowed({ collectionName: "auth_users" })` 恰好 1 次（含坏数据行）；<br>- 临界值测试：共享闸门配置成已超预算时，`auth_users` 检查仍放行并得正确结果（关键集合），同时非关键集合被拒；<br>- 闸门 rows／bytes 增量等于该条 SQL 实际返回量，只记一次。<br><br>**(c) 不共享（D31，取代原「去重」断言）**：<br>- 每次调用的 customRead key 唯一，含 `auth-session-revocation:v1:unshared` 前缀与递增序号；<br>- 与 `getRecord`、W0030／W0031 customRead 同时进行时互不串用；<br>- 失败后下一次调用照常发 SQL；<br>- 1,000 次调用结束后去重表没有残留条目；<br>- key 构成写进 REPORT。<br><br>**(d) 计量**：配置层集成测试中 SQL 发到 `configured.client`，读取计量等于返回量。<br><br>**(e) Auth.js 失败即清 cookie**（W32-5，项目安装的 next-auth `5.0.0-beta.32`）：用 `handlers.GET` 驱动 `/api/auth/session`，并以 `NextRequest` 调用导出的 `proxy`：<br>- ① 正常 cookie → 会话有效；<br>- ② 让检查 SQL 出错（例如在测试 schema 中临时改名 `orbit_records`，或让测试数据库连接失败）→ `/api/auth/session` 返回空会话，`Set-Cookie` 清除 `authjs.session-token`；`proxy` 对 `/app/agent` 重定向到 `/app/account/login?next=…`，对 `/api/account/me` 返回 401；<br>- ③ 共享闸门超预算 → 与 ① 相同（`auth_users` 为关键集合，不会被闸门拒绝，锁住这一现状）；<br>- ①～③ 先在改前代码上跑一遍，改后结果须相同。 | 新测试输出（改前、改后各一份） |
| SC-W0032-04 | **流量**。<br><br>**单次对照**：用真实注册路径造的账号（含一次重设后的 `passwordReset` 残留），比较改前 `auth-session-full` 与改后 `auth-session-light` 的每次字节。**改后 ≤ 改前的 30%**（硬条件）。<br><br>**月估算**：用 SC-01 的完整请求清单与逻辑检查次数、W32-4 的频次重算：<br>- 每行分列请求数、逻辑检查次数、leader SQL 数、共享命中数；<br>- 月估算给单实例实测与跨实例不去重上限两列，改前改后各一行，另列「每次节省字节」；MB／GB 十进制；<br>- 写明改后单实例实测 SQL 数高于改前（D31 取消共享），以及这部分增量折合的字节；<br>- **SC-01 仍未观测到的请求类型不得计为零**：按该类最坏合理值给显式上界（例如每次页面加载按实测中 API 请求最多的那一页计，RSC 与预取按每次页面加载各 1 次计），并给出下界到上界的敏感性区间。<br><br>**判定**：按区间上端与 W32-3 的 2.0 GB 比较（跨实例不去重口径，D31 不改变该口径）。超出则本项 failed，交用户按实测放宽上限（D30），不扩大改动。结果登记给 W0019。 | 测量输出＋REPORT 表格（含区间） |
| SC-W0032-05 | **回归**：<br>- `npx tsc --noEmit -p .` 通过；<br>- 上下文包列出的测试文件全部通过（基线失败项逐条对照）；<br>- 3001 上 verify-plan 打开 `/app/agent`、`/app/events`、收件箱消息与通知页签，桌面 1440 与手机 375 各一次，控制台 0 错误；<br>- **3001 撤销验收**：用证据目录里的临时脚本把本机开发库 verify-plan 的 `passwordChangedAt` 设为当前时间（只写该 verify 账号）。同一 cookie 的下一个页面请求被重定向到登录，下一个 API 请求返回 401。之后 `--reset verify-plan`，并核对非 verify 行指纹不变；<br>- 一次全量基线对照（RULES §5.2），无新增失败；<br>- 一次 Codex 代码 review，由同一 Generator 修复。重点：jsonb 取值、lifecycle 映射、兼容列与 `rowToRecord`、单闸门、唯一 key 不共享、计量客户端、无跨请求缓存。 | tsc、测试输出、截图、撤销验收记录、§5.2 对照、review 记录 |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线与 Planner 哈希；按「基线」一节 diff 核对；GitNexus 全量重建后跑 upstream impact，UNKNOWN 与动态调用用文本搜索补查。
2. **生产基线（SC-01 改前）**：按规程用 `.next-w0032-base`／3012 构建、启动（带 sql-tap），完成请求清单、串行探针与并发实验；只结束本次 PID，删目录，复核 3001。
3. 在改前代码上先写并跑 SC-03 (e) 的 Auth.js 集成测试，锁定现状。再写 RED：SC-02（含不共享、重设竞态与反证）、SC-03 (a)～(d)。
4. 最小实现：`session-revocation.ts` 单 SQL、唯一 key 新读取。
5. 定向测试与 tsc；单次字节测量；对新 SQL 做 EXPLAIN（应走主键）。
6. **生产复测（SC-01 改后）**：用 `.next-w0032-after`／3013，同一规程。
7. 3001 浏览器与撤销验收 → 暂存区 `detect-changes` → 按路径提交（`next-env.d.ts` 不提交）→ 全量对照 → Codex 代码 review，同一 Generator 修复 → 写 REPORT 并交接。

## 最小测试与检查

- **档位：H。** 理由：身份类变化，覆盖全部登录请求（Auth.js 动态调用，GitNexus 的 LOW 不反映真实范围）；新增 SQL 经共享闸门与计量。
- **开发定向集：**
  - 两个新测试；
  - `password-reset.test.ts`、`password-reset-queue.test.ts`、`read-budget-gate.test.ts`、`configured-live-record-store.test.ts`、`mobile-auth-routes.test.ts`、`app-account-auth-live-route-services.test.ts`。
  - PG 测试先导出 `ORBIT_EVENT_DATABASE_URL`（本机 `orbit_test`），并跑 `node scripts/assert-local-test-databases.mjs`；**不要 source `.env`**。
- **收口：** SC-05 全部。
- **不运行：** 付费 AI、Preview、生产库、部署。

## 失败与交接

REPORT 写明：
- 完整请求清单，每类请求的逻辑检查次数、leader SQL 数、共享命中数，以及对 1.55–1.67 条的实测解释；
- 新 SQL、返回列与兼容列；唯一 key 构成与不共享的证据；
- 等价矩阵覆盖；Auth.js 集成测试改前改后结果；
- 单次字节与月估算（含上下界区间，以及单实例 SQL 数上升的说明）；EXPLAIN；
- 生产构建清理证据；3001 撤销验收记录；
- 给 W0019：月上限结果，以及上线后在 Neon 对照的方法（`auth_users` 读取语句应只剩轻量形状）。

交接：分支 `sprint/W0032-session-revocation-read`，固定最终 SHA，目标合并到 `chat-agent`。

**回退：** revert 本 Sprint 的提交。新读取是可选分支，删去后退回 `store.getRecord`（恢复整行读取与去重）。无数据迁移。

## 开放问题

无。W32-1～W32-6 已由用户决定（D30、D31），见「已定决定」表。

## 观察项（不在本 Sprint 处理）

1. 读库失败时用户被登出（W32-5 决定保持，SC-03 (e) 锁住）。`auth_users` 是闸门关键集合，闸门本身不会触发这一情形；数据库抖动时会整批登出。
2. `auth_users` 的其他读取（登录 `getUserByEmail` 等）仍走 `getRecord` 去重；密码重设等原生 SQL 写入不驱逐去重表。这些不影响会话撤销，登记为候选。
3. 页面文档请求至少 3 次检查（W32-1 A 不处理）。

## review 处理

| review 意见（`scratchpad/w0032/codex-plan-review.txt`） | 处理 |
| --- | --- |
| P1 `consume` 用原生 SQL，不驱逐进行中的去重读取，「重设提交后第一次调用必为 false」不成立，SC 只测顺序执行 | **接受**。<br>revision 2（D30 W32-6 A）：<br>- shared store 新增 `evictInflightReads`，`consume` 提交前与 `finally` 各驱逐一次；<br>- 加竞态测试；<br>- 保证范围只到同一进程。<br>**revision 3（D31）改为：检查读取不参加 in-flight 去重（唯一 key），所有实例上都成立。**<br>- 驱逐不再需要，`password-reset-store.ts`、`password-reset-factory.ts`、`configured-live-record-store.ts` 收回白名单；<br>- SC-02 (d) 改为同进程、跨实例、并发三种不共享测试，另有反证；<br>- GOAL 的保证范围改回「所有服务器上」。 |
| P1 `readable !== true` 后再调 `store.getRecord`：两次闸门、闸门可能改变结果、两个快照 | **接受**。<br>- 取消退回二次读取，改为单条 SQL：常规行只返回轻量投影，不可读行在同一结果里带原生兼容列（`created_at`、`updated_at`、`occurred_at`、`deleted_at`、`payload`），在同一结果上调用真正的 `rowToRecord`。<br>- SC-02 (b) 要求每个场景（含坏数据）恰好 1 条 SQL、1 次 `customRead`、0 次 `getRecord`；SC-03 (b) 加闸门临界值测试。<br>- 两阶段写入竞态随单 SQL 消失。 |
| P1 失败即登出只靠对 `node_modules` 的静态判断，没有可执行 SC | **接受**。<br>- SC-03 (e) 新增 Auth.js 集成测试，用生产依赖版本：`handlers.GET` 驱动 `/api/auth/session`，并调用导出的 `proxy`。<br>- 注入 SQL 错误后，断言清 `authjs.session-token`、页面重定向登录、API 401；改前先跑，改后结果相同。<br>- 说明：`auth_users` 属闸门关键集合，真实闸门不会拒绝它（`read-budget-gate.ts` 第 136 行）。因此「闸门拒绝」一项改为锁定「超预算仍放行」的现状，而不是注入一个不存在的拒绝。 |
| P2 1.55–1.67 条的归因不可判定 | **接受**。<br>- SC-01 (b) 在串行探针之外加受控并发实验（同一 cookie 同时发 `me` 与 `summary`，20 次，对照串行 20 次）；<br>- sql-tap 记录 `recordId` 哈希；<br>- 报告列逻辑检查数、leader SQL 数、共享命中数。<br>- revision 3 起，改后共享命中数应为 0（SC-01 (c)）。 |
| P2 流量表只算已知部分，却给出预测与硬上限 | **接受**。<br>- SC-01 (a) 要求每个日常页面场景的完整请求清单，写明 RSC 导航复现方式与 `<Link>` 预取观察窗口；<br>- SC-04 要求未观测项给显式上界与敏感性区间，不按零计，按区间上端判定；<br>- 编制时数字标为「已知部分，不是容量预测」。 |

## 修订记录

- revision 1（2026-09-29）：初版。依据 D28、W0031 REPORT 观察项 1；源码按 `b3db05d5` 核对。
- revision 2（2026-09-29）：按 Codex 方案 review（3 条 P1、2 条 P2，全部接受）与用户决定 D30 修订。
  - 新读取改为单 SQL、单闸门、单快照；
  - `consume` 接入去重驱逐（W32-6 A）；
  - 新增 Auth.js 失败即清 cookie 集成测试；
  - SC-01 增加完整请求清单、RSC／预取复现与并发归因实验；
  - SC-04 未观测项给上界区间；
  - 开放问题移入「已定决定」。
- revision 3（2026-09-29）：并入用户决定 D31。
  - 检查读取不参加进程内 in-flight 去重：仍经 `customRead` 过闸门与计量，每次调用使用唯一 key；
  - 删去 `consume` 驱逐，修改白名单收回到只有 `session-revocation.ts`；
  - SC-02 (d) 改为同进程／跨实例／并发不共享测试加反证；SC-03 (c) 改为「不共享」断言；SC-01 (c)、SC-04 写明改后共享命中为 0、单实例 SQL 数上升、判定口径不变；
  - GOAL 保证范围改回所有服务器。
  - SC 数量不变。
