# Sprint W0032 — 登录会话有效性检查（`isPasswordSessionCurrent`）读取瘦身

**Plan revision:** 1（2026-09-29）。**模式:** existing-codebase / single-generator。运行状态以登记表为准。

**原需求:** RV-03、RV-05。来源：W0031 REPORT「观察项」1，用户决定 D28（2026-09-29）。

**单一目标:** 每个登录请求上的会话有效性检查（Auth.js `jwt` 回调 → `isPasswordSessionCurrent`）改为只读判定所需的列，不再整行读取 `auth_users`（约 850 B／条）。**安全行为完全不变**：密码重设或账号失效后，旧会话在同样的时机（下一次 `auth()` 调用）失效；读不到、坏数据时的结果与现在一致（D20 口径）。先按生产构建实测每类请求的检查次数与字节，再改、再测，给出月流量。

**易读目标:** [GOAL.md](GOAL.md)。

**基线:** 编制时 `chat-agent` `b3db05d5`（W0031 已合并，`f4e04a54`）。行号按 `b3db05d5` 核对；开工时 `git diff b3db05d5 HEAD -- <修改白名单> auth.ts proxy.ts` 复核并在 REPORT 登记。

**进入条件:**
- W0031 已 completed 并合并（D28 依赖）。✔
- 开放问题 W32-1～W32-5 已由用户决定（见文末）。**未决定前不启动。**
- 本机 PG 测试库 `orbit_test` 可用；3001 验收 server 可用；本机有两个空闲端口给生产构建（建议 3012 基线、3013 改后，启动前探测）。
- 同一工作树上没有其他 Generator 在跑（生产构建会写 distDir 和 `next-env.d.ts`）。W0033 若并行，必须按 RULES §2 在外接盘另建 worktree，且两边不得同时跑生产构建或同时写 3001 的 verify 账号数据。
- 不需要云端授权，不调用付费 AI，不部署，不碰生产库。

## 已查清的事实（`b3db05d5`）

1. **判定逻辑**（`features/auth/session-revocation.ts`，全文 11 行）：
   ```ts
   export async function isPasswordSessionCurrent(input: { email: string; userId: string; authenticatedAt: number }, database = createConfiguredPostgresLiveRecordStore() as { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string } | null): Promise<boolean>
   ```
   - `database` 为 null（未配置库）→ `process.env.NODE_ENV !== "production"`。
   - `store.getRecord({ workspaceId, collectionName: "auth_users", recordId: authUserRecordId(email) })`：SQL 选全部 19 列（`recordColumns`），`lifecycle_state <> 'deleted'`，`limit 1`，经 `rowToRecord` 转换。
   - 返回 false：记录不存在；`lifecycleState !== "active"`（注意 `rowToRecord` 把 archived／deleted 以外的任何值都映射成 `"active"`）；`payload.id !== userId`（严格相等，`payload.id` 是数字时不等）。
   - `payload.passwordChangedAt` 不是字符串 → true；是字符串 → `Date.parse(changedAt) < authenticatedAt`（无法解析的字符串得 NaN → false；相等 → false）。
   - **抛错**（`rowToRecord`）：`created_at`／`updated_at` 为 null、±infinity（pg 解析成 `Infinity`，`requiredTimestamp` 抛错）或超出 JS 日期范围（`toISOString` 抛 RangeError）；`occurred_at`／`deleted_at` 超出 JS 范围的有限值抛错，无穷不抛；`payload` 为 jsonb 字符串标量时 `JSON.parse` 可能抛错或解析出对象。
   - 实际判定只用到：行是否存在（非 deleted）、`lifecycle_state`、`payload->'id'`、`payload->'passwordChangedAt'`，外加上述「能否被 `rowToRecord` 正常转换」。
2. **调用时机**（`auth.ts` 第 63–70 行，next-auth `5.0.0-beta.32`／`@auth/core` `0.41.3`，Next `16.2.9`）：`jwt` 回调在**没有 `user`**（即不是刚登录那一次）且 token 有 `email`、`sub` 时调用检查；返回 false 则回调返回 null。`@auth/core/lib/actions/session.js` 第 21–62 行：每次读会话都解码 JWT → 调 `jwt` 回调 → 非 null 则调 `session` 回调并重签 cookie；**回调返回 null 或抛错都会清掉会话 cookie**（抛错时记 `JWTSessionError`）。所以读库失败或闸门拒绝，当前行为是该请求按未登录处理并清 cookie。
3. **每个请求检查几次**（静态核对，Generator 须实测确认）：
   - `proxy.ts` 第 33 行 `export const proxy = auth(async (request) => …)`，matcher `["/app/:path*", "/api/:path*"]`（第 170 行）：所有 `/app/*` 页面与 `/api/*` 请求（含公开白名单与 `/api/auth/*`）在入口先读一次会话 → 1 次检查。
   - API：多数 handler 经 `resolveAuthenticatedApiActor()`（`app/api/_shared/authenticated-actor.ts` 第 104 行）调 `auth()` → 再 1 次。`/api/account/me`、`/api/inbox/*` 都走这条。**API 请求理论上每个 2 次。**
   - 页面：proxy 1 次＋`app/(app)/app/layout.tsx` 第 27 行 `auth()` 1 次＋各 `page.tsx` 的 `auth()`（约 30 个页面文件）1 次 → **至少 3 次**；页面内的 server action、子组件若再调 `auth()` 另计。
   - W0031 实测平均 1.55–1.67 条／`/api/account/me` 低于 2 的推测原因：`getRecord` 走 configured store 的进程内 in-flight 去重（`createReadDedupedLiveRecordStore`），同一用户并发的请求（例如红点 `summary` 与 `me` 同时发出）的入口检查合并成一条 SQL，而 `sql-tap.cjs` 只把这条 SQL 归给真正发出它的那个请求。**这是推测，SC-01 要用逐个串行请求证实。**
4. **读取经过的机制**：`createConfiguredPostgresLiveRecordStore()` 按连接串缓存（每次调用返回同一实例），`store.getRecord` 依次经过读取预算闸门（`auth_users` 在 `READ_BUDGET_CRITICAL_COLLECTIONS` 中）、in-flight 去重（key＝`getRecord\0` + 规范化查询）、计量客户端（`configuredReadMetrics`）。同一实例上有 `customRead({ collectionName, key, read })`（W0028），同一闸门、同一去重表（key 前缀 `customRead\0`）、写入经 store 时驱逐。
5. **密码重设写入**：`features/auth/password-reset-store.ts` 第 54–64 行 `consume` 用原生 SQL `UPDATE … payload || jsonb_build_object('passwordHash', …, 'passwordChangedAt', $4, 'updatedAt', $4)`，**不经过 store**，因此不会驱逐 in-flight 去重表。这是现状（见观察项 2），新读取沿用同样行为即可保证「同样时机」。
6. **可复用的轻量读取模式**：W0030 `IDENTITY_ROW_READABLE`（`features/account/storage/account-live-record-provider.ts` 第 197–202 行，未导出）用 `jsDateSafeTimestampSql`（`shared/storage/postgres-js-date-sql.ts` 第 15 行）判定四个时间列能否被 JS 正常转换；不可读时抛错。W0031 `readAccountSessionView` 的去重 key 含用途与投影版本（`"account-session-view:v1"`）。
7. **现有测试**：`tests/capabilities/password-reset.test.ts` 第 235–248 行直接调 `isPasswordSessionCurrent(…, { store: records, workspaceId })`，传入的 `database` **没有 `customRead`／`client`**，因此只会覆盖退回旧路径的分支，不能证明新读取。
8. **流量量级**（W0031 生产实测）：整行约 850 B／条。

## 调用方与风险（GitNexus，`b3db05d5`，索引落后 3 个文档提交）

- `isPasswordSessionCurrent`：upstream **LOW**（1 个直接调用方 `auth.ts:jwt`，0 执行流）。**不可按 LOW 对待**：`jwt` 由 Auth.js 动态调用，图上看不到；实际覆盖全部登录请求（proxy、页面、接口、移动端 cookie）。按 RULES §5.1 属身份类变化 → H 档。
- `authUserRecordId`：upstream CRITICAL（3048，`partial: true`），本 Sprint 只调用不修改。
- `auth.ts` 的 `jwt`、`proxy`、`resolveAuthenticatedApiActor`：不修改。
- 开工时 Generator 须 `node .gitnexus/run.cjs analyze --force --index-only` 后重跑以上 impact 并存证据。

## 决定（按推荐默认写；W32-n 用户改选时同步修订）

### 新读取（`features/auth/session-revocation.ts` 内）

- `database` 参数类型放宽为 `{ store; workspaceId; client?; customRead? } | null`（`createConfiguredPostgresLiveRecordStore()` 的返回值本来就有后两项）。**两者都有时走新读取；否则走原 `store.getRecord`**（与 W30-2／W31-2 的「可选新方法，缺失时退回」同一思路，测试替身不受影响）。
- 新读取经 `customRead({ collectionName: "auth_users", key, read })`，SQL 发到 `client`（已计量）：
  - key：`JSON.stringify(["auth-session-revocation:v1", workspaceId, recordId])`，与 `getRecord` 去重 key、W0030／W0031 的 customRead key 都不相撞。
  - where 与 `getRecord` 相同：`workspace_id = $1 and collection_name = $2 and record_id = $3 and lifecycle_state <> 'deleted' limit 1`（参数顺序相同）。
  - 返回列只有：`lifecycle_state`；`payload->'id'`（**jsonb，不用 `->>`**，保持数字与字符串的区别）；`payload->'passwordChangedAt'`（jsonb，保持 `typeof` 判定）；`readable`＝`jsonb_typeof(payload) = 'object'` 且四个时间列按 `IDENTITY_ROW_READABLE` 同样的规则可被 JS 转换（用 `jsDateSafeTimestampSql` 在本文件内组合，不改 `account-live-record-provider.ts`）。
  - 判定逻辑与现有代码逐行对应：无行 → false；`lifecycle_state` 为 `archived` 或 `deleted` 以外的值都视为 active；`id !== userId` → false；`passwordChangedAt` 规则不变。
  - **`readable !== true` 时退回原 `store.getRecord` 路径再判定一次**，让坏数据得到与现在完全相同的结果（抛同样的错或返回同样的值）。只在坏数据行上多一次读取。
- 不加任何跨请求缓存（W32-2）；是否做同请求去重按 W32-1。
- `auth.ts`、`proxy.ts`、`authenticated-actor.ts`、`configured-live-record-store.ts`、`postgres-live-record-store.ts` 不改。

### 生产构建操作规程（SC-01、SC-04）

照搬 [W0031 PLANNER「生产构建操作规程」](../W0031-inbox-identity-polling/PLANNER.md#生产构建操作规程sc-01review-p1) 第 1～8 步与「绝对禁止」，只替换：

| 轮次 | 代码 | distDir | 端口 |
| --- | --- | --- | --- |
| 基线 | 基线 SHA | `.next-w0032-base` | 3012（被占则顺延到空闲端口，REPORT 登记） |
| 改后 | 功能 SHA | `.next-w0032-after` | 3013（同上） |

- 构建与启动命令、环境变量同 W0031；启动时加 `NODE_OPTIONS=--require <证据目录>/sql-tap.cjs` 和 `W0032_SQL_TAP=<证据目录>/<轮次>-sql.jsonl`。
- `sql-tap.cjs` 从 `~/orbit-sprint-evidence/web/sprint-W0031/run-01/` 复制到本 Sprint 证据目录后扩展 `classify`：参数里含 `auth_users` 的整行读取记为 `auth-session-full`，新 SQL 记为 `auth-session-light`（按 SQL 形状识别，例如只选 `lifecycle_state` 与 `payload->'id'`），其余沿用。脚本只放证据目录，不进仓库。
- 删目录前核对路径以 `.next-w0032-` 开头；前后记录 3001 的 PID 与 HTTP 状态码必须相同；绝不移动、删除或改写 `.next`、`.next-verify`；不在 3000、3001 上重启或结束进程。
- 构建会改写 `next-env.d.ts`：每轮结束还原为开工前内容，不提交。

## 流量口径与估算（编制时估算，以 SC-01／SC-04 实测为准）

口径同 W0031：1000 人**日活**、30 天，W0017 口径（每条语句返回行 JSON 字节之和），MB／GB 十进制。本路径单独记账，不并入 1.2 GB 用户路径总账（D27），也不并入 `/api/account/me` 路径的 2.5 GB（D25 W31-3）。

三种次数分开：**请求数**（浏览器发出的页面与接口请求）、**逻辑检查次数**（每个请求里 `jwt` 回调调用检查的次数）、**实测 SQL 执行次数**（进程内去重合并后真正发到库的语句数）。月估算给**单实例实测**与**跨实例不去重上限**（＝逻辑检查次数 × 每次字节）两个口径，按上限口径判定。

编制时的每人每天请求构成（W0031 改后实测频次＋W31-4 假设，页面内其他接口待 SC-01 实测补齐）：

| 来源 | 请求／人／天 | 每请求逻辑检查（推测） | 逻辑检查／人／天 |
| --- | --- | --- | --- |
| `/api/account/me`（W0031 改后合计） | 56 | 2 | 112 |
| 收件箱轮询其他端点（40 周期 × 2 个） | 80 | 2 | 160 |
| 页面加载时的红点 `summary` | 10 | 2 | 20 |
| 打开收件箱的额外列表读取（约） | 4 | 2 | 8 |
| 页面文档请求（10 次） | 10 | ≥3 | ≥30 |
| 页面内其他接口、RSC 导航 | 待实测 | 待实测 | 待实测 |
| **合计（已知部分）** | **160** | — | **≥330** |

| 情形（跨实例不去重上限，已知部分） | 每次字节 | 月估算 |
| --- | --- | --- |
| 改前 | 约 850 B | 330 × 850 × 30,000 ≈ **8,415 MB** |
| 改后（估算 150–250 B，以实测为准） | 约 150–250 B | **约 1,485–2,475 MB** |

- 单实例实测会因进程内去重低一些（W0031 的 `/api/account/me` 约 0.8 倍）。
- 若 W32-1 选 B（同一次页面渲染只查一次），页面文档请求每次少 1 次以上，按上表约少 10 次／人／天（约 3%）；选 C 可让所有 API 请求减半，但有安全风险（见 W32-1）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

- **必读（行号按 `b3db05d5`）：**
  - `features/auth/session-revocation.ts`：全文（11 行），唯一的实现文件。
  - `auth.ts`：第 60–96 行（`jwt` 回调，只读）。
  - `proxy.ts`：第 33 行、第 168–171 行（入口 `auth()` 与 matcher，只读）。
  - `app/api/_shared/authenticated-actor.ts`：第 104–116 行（handler 的 `auth()`，只读）。
  - `shared/storage/configured-live-record-store.ts`：第 25–45 行（`customRead` 契约）、第 121–128 行（`createGatedDedupedCustomRead`）、第 171–175 行（`getRecord` 去重）、第 192–243 行（缓存实例与组装），只读。
  - `shared/storage/postgres-live-record-store.ts`：第 53–160 行（行类型、`recordColumns`、`timestampToString`、`requiredTimestamp`、`payloadFromRow`、`rowToRecord`）、第 368–390 行（`getRecord` SQL），只读。
  - `shared/storage/postgres-js-date-sql.ts`：`jsDateSafeTimestampSql`，只读。
  - `features/account/storage/account-live-record-provider.ts`：第 197–275 行（`IDENTITY_ROW_READABLE`、W0030 `customRead` 写法与「不可读即抛错」），只读参考。
  - `features/auth/password-reset-store.ts`：第 54–64 行（`consume`，写 `passwordChangedAt`），只读。
  - `node_modules/@auth/core/lib/actions/session.js`：第 21–62 行（回调返回 null／抛错都清 cookie），只读。
- **测试与夹具：**
  - `tests/capabilities/password-reset.test.ts`：第 200–260 行（注册 → 申请 → 重设 → `isPasswordSessionCurrent` 前后判定的现成流程）。
  - `tests/capabilities/account-session-view-read.test.ts`：PG 临时 schema、四时区、配置层计量集成测试、交叉并发的写法（第 39–40、272 行起、第 527 行、第 577 行 `DB_ENV_KEYS`）。
  - `tests/services/read-budget-gate.test.ts`、`tests/storage/configured-live-record-store.test.ts`：闸门与去重（只读参考，必要时跑）。
  - `tests/pages/mobile-auth-routes.test.ts`、`tests/pages/app-account-auth-live-route-services.test.ts`：登录相关回归。
- **测量：** 复制 W0031 证据目录的 `sql-tap.cjs`、`prod-measure.mjs`、`analyze-prod.py`、`measure-w0031-session-bytes.ts` 到本 Sprint 证据目录再改，不放进仓库。
- **前序交接要点：**
  - W0028：`customRead({ collectionName, key, read })` 与 store 共用闸门与去重，写入驱逐，失败不缓存；`jsDateSafeTimestampSql`；时区对照用 UTC、Asia/Shanghai、America/Los_Angeles、Pacific/Kiritimati。
  - W0030／W0031：轻量读取为可选分支，缺失时退回旧读取（D23、D25）；坏数据失败语义与旧读取一致（D20）；去重 key 含用途与投影版本。
  - W0031：生产构建规程、`sql-tap.cjs` 按 HTTP 请求归属语句（`AsyncLocalStorage`）；W0031 改后 `/api/account/me` 每人每天 56 次。
  - W0016：3001 验收 server；cookie 用 `node --import tsx scripts/verify-session-cookie.ts verify-plan --header` 签发；用完 `node --import tsx scripts/seed-verify-accounts.ts --reset verify-plan`。
- **易错边界（都有对应 SC）：**
  - 不能引入任何跨请求缓存或延长 in-flight 共享；改密码后的下一次检查必须读到新值（SC-02）。
  - `payload->'id'` 与 `payload->'passwordChangedAt'` 必须取 jsonb 原值，不能用 `->>`，否则数字 id 会与字符串 userId 相等、非字符串的修改时间会被当成字符串（SC-02）。
  - `lifecycle_state` 的映射规则要与 `rowToRecord` 一致（未知值视为 active）（SC-02）。
  - 坏数据（时间列、非对象 payload）必须与旧路径结果完全相同：不可读时退回旧路径（SC-02）。
  - 去重 key 必须含用途与版本，不与 `getRecord` 或其他 customRead 相撞；闸门集合名仍是 `auth_users`；SQL 必须发到计量客户端（SC-03）。
  - 新读取返回的内容里不能有 `passwordHash`、`passwordReset`（SC-03）。
  - 测试替身（只有 `store`、`workspaceId`）必须仍走旧路径，现有断言不改（SC-02、SC-05）。
  - 生产构建只动自己的 distDir 和 PID，不碰 3000／3001／`.next`／`.next-verify`（SC-01）。

## 范围与文件

- **修改：** `features/auth/session-revocation.ts`。
- **新建：** `tests/capabilities/session-revocation-read.test.ts`（等价矩阵、真实重设流程、SQL 形状、闸门／去重／计量、替身退回）。测量脚本只放证据目录。
- **若 W32-1 选 B：** 另允许修改 `features/auth/session-revocation.ts` 内的同请求去重包装，并新增对应测试；不改 `auth.ts` 的判定逻辑。
- **排除：** `auth.ts`、`proxy.ts` 的调用结构；`resolveAuthenticatedApiActor*`；Auth.js 版本与 cookie 策略；`shared/storage/*`；密码重设流程；读失败即登出的现有行为（观察项 1）；App 端；迁移与索引；部署。

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0032-01 | **生产构建实测（改前与改后）**，按上文规程：<br>(a) **串行探针**（一次只发一个请求，排除进程内去重）：用 verify-plan cookie 依次请求 `/api/account/me`、`/api/inbox/summary`、`/api/inbox/notifications`、`/api/inbox/conversation-summaries`（以实际端点为准）、`/app/agent` 文档、`/app/events` 文档、一次 RSC 导航请求（带 `RSC: 1` 头）、`/api/auth/session`；每个请求记录 `auth-session-*` 语句数、行数、字节。给出「每类请求逻辑检查次数」表，并用它**解释 W0031 平均 1.55–1.67 条的来源**（证实或推翻事实 3 的推测）。<br>(b) **真实场景**：沿用 W0031 的场景 ①～⑤（页面加载、消息页签、打开对话、通知页签、打开通知），稳态 60 秒，统计每请求平均 `auth-session-*` 语句数与字节（单实例实测）。<br>(c) 改后：`auth-session-full` 在正常数据下为 0，`auth-session-light` 的每请求语句数与改前 `auth-session-full` 相同（W32-1 选 A 时）；每次字节见 SC-04。<br>(d) 规程收尾：两个本次 PID 已退出、两个 distDir 已删；3001 PID 与状态码前后相同；`.next`、`.next-verify` 未触碰；`git status --short` 与开工前一致（`next-env.d.ts` 除外，已还原）。 | `01-prod-base-*.json`、`05-prod-after-*.json`、`*-sql.jsonl`、串行探针表；规程各步输出 |
| SC-W0032-02 | **安全行为等价**（本机 `orbit_test` 临时 schema，0 skip）：同一数据分别用旧路径（替身 `{ store, workspaceId }`）和新路径（真实 configured store，含 `client`／`customRead`）调用 `isPasswordSessionCurrent`，**结果相同（同为 true、同为 false、或同为 reject）**：<br>- 记录不存在；别的工作区；`lifecycle_state` 为 active／archived／deleted／未知值；<br>- `payload.id` 相同／不同／为数字（与字符串 userId 字面相同）／缺失；<br>- `passwordChangedAt` 缺失／为数字／为对象／为无法解析的字符串／早于、等于、晚于 `authenticatedAt`；<br>- 坏数据：`created_at`／`updated_at` 为 ±infinity 或超出 JS 日期范围，`occurred_at`／`deleted_at` 为无穷（不抛）与超出范围的有限值（抛），四个会话时区对照；payload 为 jsonb 字符串标量、数组、数字；<br>- `database` 为 null 时 `NODE_ENV` 为 production／非 production。<br>**同样时机**：真实流程（注册 → 申请重设 → `consume`）在新路径上：重设前 true；`consume` 提交后的**第一次**调用即 false；新登录（`authenticatedAt` 晚于修改时间）true；两次相继调用各自发出 SQL（无跨调用缓存）。<br>**替身不变**：`password-reset.test.ts` 第 235–248 行不改、照常通过。 | 新测试先 RED（新路径尚不存在时，SQL 形状／计数断言失败）后 GREEN；PG 部分 0 skip 的输出 |
| SC-W0032-03 | **读取机制不变**：<br>- SQL 形状：只返回 `lifecycle_state`、payload 的 `id`、`passwordChangedAt` 与 `readable`；返回行里没有 `passwordHash`、`passwordReset`、`record_id`、`source_*`、`provider*`、`search_text`、`evidence_ids`；where 含 `lifecycle_state <> 'deleted'` 与 `limit 1`；<br>- 闸门：每次逻辑调用 `assertAllowed({ collectionName: "auth_users" })` 1 次（与旧路径次数、集合名相同）；闸门拒绝时与旧路径同样 reject；<br>- 去重：并发相同检查只发 1 条 SQL；失败不缓存（下次重新发）；经 store 的写入驱逐进行中的读取；key 与 `getRecord`、W0030／W0031 customRead 并发时互不串用；key 构成写进 REPORT；<br>- 计量：配置层集成测试中共享闸门 rows／bytes 增量等于新 SQL 实际返回量，SQL 发到 `configured.client`；<br>- 不可读行退回旧路径：该情形下恰好多 1 次 `getRecord`，结果与旧路径相同。 | 新测试输出 |
| SC-W0032-04 | **流量**：<br>- 单次对照：真实注册路径造的账号（含一次密码重设后的 `passwordReset` 残留），改前 `auth-session-full` 与改后 `auth-session-light` 每次字节；**改后 ≤ 改前的 30%**（W32-3），语句数不变。<br>- 用 SC-01 的每类请求逻辑检查次数与 W32-4 的频次重算「次／人／天」与月估算：每行分列请求数、逻辑检查次数、实测 SQL 执行次数；月估算给单实例实测与跨实例不去重上限两列，改前改后各一行，另列「每次节省字节」；MB／GB 十进制。<br>- 按 W32-3 的月上限判定（跨实例不去重口径），超出则本项 failed、交用户裁决；结果登记给 W0019。 | 测量输出＋REPORT 两张表 |
| SC-W0032-05 | **回归**：<br>- `npx tsc --noEmit -p .` 通过；<br>- 上下文包列出的测试文件全部通过（基线失败项除外，逐条对照）；<br>- 3001 上 verify-plan 打开 `/app/agent`、`/app/events`、收件箱消息与通知页签，桌面 1440 与手机 375，控制台 0 错误；<br>- 3001 撤销验收：用证据目录里的临时脚本把本机开发库 verify-plan 的 `passwordChangedAt` 设为当前时间（只写该 verify 账号），同一 cookie 的下一个页面请求被重定向到登录、下一个 API 请求返回 401；之后 `--reset verify-plan` 并核对非 verify 行指纹不变；<br>- 一次全量基线对照（RULES §5.2），无新增失败；<br>- 一次 Codex 代码 review（重点：jsonb 取值与 `->>`、lifecycle 映射、坏数据退回、去重 key、闸门集合名、计量客户端、无跨请求缓存），由同一 Generator 修复。 | tsc、测试输出、截图、撤销验收记录、§5.2 对照、review 记录 |

## 一次 Generator 的执行顺序

1. 复核进入条件（W32-1～5 已决定），保存基线与 Planner 哈希；`git diff b3db05d5 HEAD -- features/auth auth.ts proxy.ts shared/storage` 核对；GitNexus 全量重建后 upstream impact，UNKNOWN 与动态调用用文本搜索补查。
2. **生产基线（SC-01 改前）**：按规程 `.next-w0032-base`／3012 构建、启动（带 sql-tap）、串行探针、真实场景、只结束本次 PID、删目录、复核 3001。
3. 写 RED：SC-02 等价矩阵与真实重设流程、SC-03 形状／闸门／去重／计量。
4. 最小实现：`session-revocation.ts` 新读取与退回分支（W32-1 选 B 时再加同请求去重）。
5. 定向测试与 tsc；单次字节测量；对新 SQL 做 EXPLAIN（应走主键）。
6. **生产复测（SC-01 改后）**：`.next-w0032-after`／3013，同一规程。
7. 3001 浏览器与撤销验收 → 暂存区 `detect-changes` → 按路径提交（`next-env.d.ts` 不提交）→ 全量对照 → Codex 代码 review，同一 Generator 修复 → 写 REPORT 并交接。

## 最小测试与检查

- **档位：H。** 理由：身份类变化，覆盖全部登录请求（Auth.js 动态调用，GitNexus 的 LOW 不反映真实范围）；新增 SQL 经共享闸门与去重。
- **开发定向集：** 新测试；`password-reset.test.ts`、`password-reset-queue.test.ts`、`read-budget-gate.test.ts`、`configured-live-record-store.test.ts`、`mobile-auth-routes.test.ts`、`app-account-auth-live-route-services.test.ts`。PG 测试先导出 `ORBIT_EVENT_DATABASE_URL`（本机 `orbit_test`）并跑 `node scripts/assert-local-test-databases.mjs`；**不要 source `.env`**。
- **收口：** SC-05 全部。
- **不运行：** 付费 AI、Preview、生产库、部署。

## 失败与交接

REPORT 需写明：每类请求逻辑检查次数表与「平均多于 1 次」的实测解释；新 SQL 与返回列；去重 key；等价矩阵覆盖；单次字节与月估算两张表及假设；EXPLAIN；生产构建清理证据；3001 撤销验收记录；给 W0019 的月上限结果与上线后 Neon 对照方法（`auth_users` 读取语句应只剩轻量形状）。

交接：分支 `sprint/W0032-session-revocation-read`，固定最终 SHA，目标合并到 `chat-agent`。

**回退：** revert 本 Sprint 的提交。新读取是可选分支，删去后 `isPasswordSessionCurrent` 退回 `store.getRecord` 即恢复原行为；无数据迁移，无需清理。

## 开放问题（需用户决定，未定前不启动）

| 编号 | 问题 | 选项 | 推荐默认 |
| --- | --- | --- | --- |
| W32-1 | 是否做「同一请求只读一次」 | **A** 只瘦身，不做请求内去重（每请求检查次数照旧，靠 SC-01 实测记录）。<br>**B** 瘦身＋同一次服务端渲染内用 React `cache` 共用一次检查（只合并 layout 与 page 等同一渲染里的 `auth()`；proxy 与 handler 是不同阶段，合不了）；需证明不跨请求、改密码后下一请求照常失效。<br>**C** 瘦身＋proxy 把已核验结果通过内部请求头交给 handler，handler 不再查。可让 API 请求检查减半，但需签名、防止客户端伪造该请求头、处理 proxy 与 handler 之间的时间差，属新的安全边界。 | **A**。按编制时估算 B 只省约 3%，C 省约一半但引入伪造与时序风险，不值得在上线前做。SC-01 的每类请求检查次数表会给出实测，若页面渲染内 `auth()` 远多于 2 次，再单开 Sprint 做 B |
| W32-2 | 是否允许跨请求短时缓存（如同一实例 1–5 秒） | 允许（省更多，但改密码后旧会话最多再用几秒）／不允许 | **不允许**。D28 要求「旧会话立即失效的安全行为不变」 |
| W32-3 | 验收上限 | 单次字节比例；月上限（跨实例不去重口径，十进制） | **单次字节 ≤ 改前的 30%**（硬条件）；**月上限 ≤2.0 GB**，单独记账，不并入 1.2 GB（D27）与 2.5 GB（D25）；超出则 SC-04 failed、交用户裁决。编制时估算改后约 1.5–2.5 GB，上限可能偏紧，若实测超出建议按实测放宽而不是扩大改动 |
| W32-4 | 频次假设 | 沿用 W31-4（收件箱每天 10 分钟、打开 2 次、页面加载 10 次、1000 人全按日活）＋W0031 改后实测频次；页面内其他接口与 RSC 导航按 SC-01 场景 ① 实测补 | **按此**；REPORT 同时给「每次节省字节」和「每类请求检查次数」，便于以后按新频次重算 |
| W32-5 | 读库失败或闸门拒绝时，Auth.js 会清掉会话 cookie（用户被登出），这是现状 | 保持不变／本 Sprint 顺带改成「失败时不清 cookie」 | **保持不变**（D20：失败语义一致）；登记为后续候选，另行评估 |

## 观察项（不在本 Sprint 处理）

1. 读库瞬时失败或读取闸门拒绝 `auth_users` 时，`jwt` 回调抛错，Auth.js 清 cookie，用户被登出（`session.js` 第 58–61 行）。`auth_users` 属关键集合，闸门通常放行；但数据库抖动时会整批登出。见 W32-5。
2. 密码重设 `consume` 用原生 SQL，不驱逐 configured store 的 in-flight 去重表：若某个检查读取在重设提交前已发出、尚未返回，此后几毫秒内同一实例上同一用户的检查会共用这次旧结果。窗口只有一次查询的耗时，新读取沿用同样行为；若要收紧，需要让重设走 store 写入或主动清去重表，登记为候选。
3. 页面文档请求至少 3 次检查（proxy、layout、page），见 W32-1。

## 修订记录

- revision 1（2026-09-29）：初版。依据 D28、W0031 REPORT 观察项 1；源码按 `b3db05d5` 核对；GitNexus impact 在索引落后 3 个文档提交时查询。W32-1～W32-5 为推荐默认，待用户决定；方案 review 待做。
