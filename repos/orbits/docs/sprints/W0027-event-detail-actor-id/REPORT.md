# Sprint W0027 — 执行总结

改了哪些文件看 git diff（`app/(app)/app/events/[id]/page.tsx`、新测试 `tests/pages/app-event-detail-actor-id.test.tsx`，另有三个测试文件里的页面源码断言跟着改），这里不逐文件复述。

## 结果

对应 [GOAL.md](GOAL.md)。

- **已验证能做到：**
  - 已登录用户打开活动详情页，页面先把登录会话解析成账号（1 次），再用账号 id 判定「已报名」、名单是否下发、「主办方后台 →」、活动角色、私密活动能否打开，以及账号作用域活动的回退查找。账号 id 与会话 id 不同时：报名记在账号 id 下 → 已报名、名单下发；只记在会话 id 下 → 未报名、名单为空（SC-01）。
  - 主办方或活动角色是账号 id → 看得到「主办方后台 →」、私密活动可打开；只挂在会话 id 上 → 私密活动显示「无权访问」（`event-core-access-denied`），公开活动不显示入口（SC-02）。
  - 未登录：不解析账号；私密活动照旧跳登录（`next` 保持原路径），公开活动与改前一致。已登录但账号解析返回 null 或抛错：显示「暂时不可用」状态页，不跳登录，不调用详情判定，没有任何以会话 id 为参数的读取（SC-03）。
  - 3001 上 verify-plan 显示已报名（参会者页签在）、verify-host 看到「主办方后台 →」、verify-legacy 未报名且无名单；桌面 1440、手机 375，控制台 0 错误（SC-05）。
- **没有达到：** 新增的账号解析读取超出流量上限。按 PLANNER（1000 人、每人每天 2 次）估算约 **118–119 MB／月**，上限 60 MB（SC-04 流量部分 failed）。按 PLANNER 约定：功能提交保留，**不合并**，交用户裁决。

## 运行记录

- 结果：**failed**（SC-04 流量超上限；其余 SC 通过）。用户裁决 D22：先合并，账号解析读取瘦身另开 W0030，发布前完成
- Generator：Claude Opus 5.5／2026-09-29；Planner revision 2，`PLANNER.md` SHA256 `99a0b10f2860840b7940f75900aabefeb197efa635c10b3b6c473689172c6940`；run-01
- 基线：`chat-agent` `b314bfc0`；分支 `sprint/W0027-event-detail-actor-id`；功能 SHA `bc992826`；`chat-agent` 合并 SHA：见登记表
- 档位 H；全量对照：基线 5717 个测试／失败 80／skip 278，HEAD 5729 个／失败 80／skip 278，新增失败 0
- 付费 AI 调用 0；未 push、未部署、未碰生产库
- REPORT 由协调者按 Generator 交回的正文落盘

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0027-01 | pass | 新测试 SC-01 三个用例：账号 id 下的报名 → `youRsvped=true`、名单 2 人下发；只在会话 id 下 → 未报名、`attendees: []`；`account:a:<eventId>` 路由的回退查找参数是 `account:a`，`profile:a:<eventId>` 路由 → not found。每个用例都断言「所有带 actor 参数的读取都是 `account:a`」。RED `01-red-final.txt`（改前 10 失败 2 通过，通过的是两个未登录守护用例）；GREEN `02-green-targeted.txt` |
| SC-W0027-02 | pass | 新测试 SC-02 四个用例，用真实 `resolveCanonicalEventDetailView` + 依赖替身：主办方＝账号 id（公开：入口可见；私密：可打开、名单为空）；活动角色 `reviewer/active` 授予账号 id → 私密可打开、入口可见；主办方或 `owner/operations` 角色只在会话 id 上 → 私密 `event-core-access-denied`、不跳登录，公开 `canOpenOperations=false`；报名只在会话 id 上 → 私密 `forbidden` |
| SC-W0027-03 | pass | 新测试 SC-03 四个用例：未登录私密 → 跳 `/app/account/login?next=%2Fapp%2Fevents%2F<id>`，账号解析 0 次、actor 读取 0；未登录公开 → 调用序列只有 `detail:- → core:<code>`，匿名渲染；解析返回 null／抛错（公开、私密各一次）→ 页面 `Event detail temporarily unavailable`，调用序列只有 `actor:profile:a`，详情判定 0 次，actor 读取 0 |
| SC-W0027-04 | **fail**（计数 pass，流量超上限） | 计数：新测试 SC-04，登录请求账号解析恰好 1 次且排在详情判定之前，未登录 0 次。流量：`04-measure.txt`（脚本 `measure-detail-actor-bytes.ts` 在证据目录，不进仓库），表格见下 |
| SC-W0027-05 | pass | 定向集 8 个文件 90/90，0 skip（`02-green-targeted.txt`，含 PLANNER 列出的 6 个回归文件与 W0024 的活动页测试）；`npx tsc --noEmit -p .` 退出 0（`03-tsc.txt`）；浏览器 `06-browser.json` + `detail-<账号>-<1440\|375>[-host-tab].png`；全量对照新增失败 0（`09-*`） |

证据目录：`~/orbit-sprint-evidence/web/sprint-W0027/run-01/`。

### 身份判定前后对照

| 判定点 | 改前 | 改后 |
| --- | --- | --- |
| 本人报名（`readRegisteredContext`）→ 已报名、名单下发、私密放行 | 会话 id | 账号 id |
| 主办方（`organizerActorId` 比较）→ 主办方入口、私密放行 | 会话 id | 账号 id |
| 活动角色（`accessService.get` 的 `subjectActorId`）→ 主办方入口、私密放行 | 会话 id | 账号 id |
| 账号作用域活动回退查找（`resolveActorEventCanonicalId`） | 会话 id | 账号 id |
| 报名者名单视图（`getOrbitRegisteredEventViewModel`） | 会话 id | 账号 id |
| 私密活动未登录 → 跳登录 | 无会话 | 无会话（不变，不解析账号） |
| `stats.authed`、顶栏（`AccountTopNav`／`PublicTopNav`） | 有无会话 | 有无会话（不变；已登录且解析失败时走不可用状态页，不到这里） |
| 已登录但账号解析失败 | （不存在这一步） | 不可用状态页，证据 id `event-detail-account-unavailable`，不回退会话 id、不跳登录 |

### SC-04：账号解析读取的语句数与返回字节（本机实测）

口径同 W0017／W0021／W0024：每条语句返回行的 JSON 字节之和（拦截 `pg.Client.prototype.query`）。临时 schema 里测，测完删除。账号与资料按真实注册路径（`ensureAccountForUser`）建出，资料按 `seed-verify-accounts` 补齐「引导已完成」，另塞 60 KB 头像和导入文档。会话图读取有列投影，这些大字段不会带出（资料整行 `select *` 为 73,333 B）。

这是详情页的**纯新增路径**：改前详情页只调 `auth()`，不读账号会话图；`app/(app)/app/layout.tsx` 也不解析账号，同一请求里没有可复用的结果。

| 场景 | 语句 | 行 | 单次字节 |
| --- | --- | --- | --- |
| A 会话 id = 账号 id（credentials／verify 账号）：资料按 id 查不到 → 按 accountId 查 → 读账号 | 3 | 2 | 1,984 B |
| B 会话 id = 资料 id ≠ 账号 id（Auth.js profile 主体）：资料按 id 命中 → 读账号 | 2 | 2 | 1,959 B |

单行构成（场景 B）：资料行 1,123 B，其中 payload 450 B，其余是记录元数据列（evidence_ids、source_id、user_id、provider_record_id、source_label、provider、三个时间戳、workspace_id 等）和 JSON 键名；账号行 836 B，payload 只有 157 B。约 60% 的字节是非 payload 的元数据列。

**月增量估算**（1000 人 × 每天 2 次 × 30 天 = 60,000 次登录打开详情页，每次账号解析 1 次）：

| 场景 | 单次 | 月增量 | 上限 |
| --- | --- | --- | --- |
| A | 1,984 B | ≈ 119.0 MB | 60 MB |
| B | 1,959 B | ≈ 117.5 MB | 60 MB |

60 MB／月折合每次约 1,000 B；两行（资料＋账号）光元数据列就接近这个数。

## 全量基线对照

- 用 `git archive` 把 `b314bfc0`（基线）和 `bc992826`（HEAD）导出到临时目录（node_modules、`.env.local` 软链），两份副本对称跑，不动工作树；跑完已删除。
- 环境：`ORBIT_EVENT_DATABASE_URL=postgres://<user>@localhost:5432/orbit_test`，先跑 `scripts/assert-local-test-databases.mjs` 通过；没有 source `.env`。
- 排除 `tests/pages/event-registration-readback.test.tsx`（基线上就会挂起）。

| | 测试数 | 失败 | skip |
| --- | --- | --- | --- |
| 基线 | 5717 | 80 | 278 |
| HEAD | 5729（+12 为新测试） | 80 | 278 |

- `comm` 对比失败清单：新增 0，修复 0（`09-fail-{base,head}.txt`、`09-new-failures.txt`）。
- 已知的 `read-projection-parity-postgres` statement timeout 这次没有出现在新增项里。

## 偏差

1. 多改了两个测试文件：`app-event-detail-live-route-services.test.ts`（2 处）和 `app-event-registration-guide.test.tsx` 也在断言 `actorId: session?.user?.id`，PLANNER 只列了 `app-event-detail-page.test.tsx`。三处一并改成「不含会话 id 作 actorId、含 `resolveAuthenticatedApiActorFromSession(`」，属于 RULES §0 的必要补充。
2. 账号解析失败沿用原「暂时不可用」页，只把描述和证据 id 换成 `event-detail-account-unavailable`。
3. `verify-session-cookie.ts` 不接受 verify-host，浏览器验收时临时复制一份放开正则（`scripts/w0027-tmp-cookie.ts`），用完即删，未提交；仓库里的脚本没改。

## 假设与额外阅读

- 上下文包之外读了这些文件：
  - `tests/pages/app-event-detail-0918.test.tsx`、`app-event-detail-live-route-services.test.ts`、`app-event-registration-guide.test.tsx` 对页面源码的正则。`authed: Boolean(session?.user?.id)` 的断言保留（该行为未变）。
  - `app/(app)/app/events/events-0918/event-detail.tsx` 的 `HostPanel`／参会者页签：主办方入口在隐藏页签里，浏览器验收改为数 `a.ev-host-btn` 和 `[data-events-panel="people"]`。
  - 测量与浏览器验收用：`features/account/storage/account-live-record-provider.ts`（`readAccountSessionGraph` 的查询顺序与列投影）、`features/auth/storage/auth-account-provisioning-provider.ts`、`scripts/seed-verify-accounts.ts`、`scripts/verify-session-cookie.ts`。
  - `app/(app)/app/layout.tsx`：确认布局层不解析账号，新增读取无法与同一请求复用。
- verify-plan、verify-legacy 已 `--reset` 回基线，`--summary` 前后一致；verify-host 不支持单独 reset，本次只读访问，没有写入。
- 3001 验收 server 正常（curl 200），直接使用，没有重启，也没有另起临时 server。
- **GitNexus：**
  - 索引刷新到当前 HEAD 后，`AppEventDetailPage` 的 upstream impact 是 UNKNOWN（0 调用方）；文本搜索确认只由 Next 路由加载，另有 5 个测试读页面源码。
  - `resolveConfiguredCanonicalEventDetailView` 是 LOW（1 个调用方，即本页），只改了调用参数。
  - `resolveCanonicalEventDetailView`（CRITICAL）与 `resolveAuthenticatedApiActorFromSession`（CRITICAL，22 个调用方）没改，只调用。
  - 暂存区 detect-changes：5 个文件、1 个符号（`AppEventDetailPage`）、4 条执行流，risk medium（`08-detect-changes-feature.txt`）。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex `codex review --base chat-agent`（全文 `codex-review.txt`）P2：`next-env.d.ts` 指向 `.next-verify` | 不成立：这是 3001 验收 server 自动改写的工作树未提交文件，`bc992826` 不含它 | 无需修改；对 actor-id 改动本身无意见 |

## 交接

- 详情页判定口径：`resolveAuthenticatedApiActorFromSession` 返回的 `actor.id`，与报名、建活动、活动角色写入，以及活动页（W0024）、`/app/agent`（W0018）一致。已登录但解析不到账号时不进入判定。
- **给 W0028／W0029 的数据：**
  - 详情页新增「账号解析」：每次登录打开 1 次，单次 1,959–1,984 B（2–3 条语句、2 行），按 1000 人 × 每天 2 次 ≈ 118–119 MB／月。
  - 详情页本人报名读取（`readRegisteredCatalogueAttendees`）与名单读取的字节本 Sprint 未测（PLANNER 未要求）。改后只是把参数从会话 id 换成账号 id：对账号 id ≠ 会话 id 的用户，改前读不到行、改后读到真实行，增量性质与 W0024 相同，留给 W0028／W0029 按改后绝对字节实测。
  - 会话图读取约 60% 的字节是记录元数据列而非 payload。若只返回 payload 投影字段与判定所需的最少元数据，单次预计可降到数百字节。但 `readAccountSessionGraph`／`resolveAuthenticatedApiActorFromSession` 是 22 个调用方共用的 CRITICAL 路径，本 Sprint 不改。
- **需要用户裁决（SC-04）：** (a) 接受增量上线，合并 `bc992826`；(b) 另开 Sprint 瘦身账号会话图读取的返回列（影响全部 22 个调用方，收益也是全站的）；(c) 并入 W0028／W0029 的总账一起裁决。
- 观察项（未改）：`events/[id]/operations`、`analytics`、`live`、`center` 子页面仍用 `session.user.id` 做活动权限或身份判定，建议作为下一个 H Sprint。
- 回退方式：本分支未合并，不合并就没有影响；如已合并，revert `bc992826` 即可。
