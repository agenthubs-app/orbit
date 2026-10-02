# Sprint W0040 — 执行总结

> 本报告正文由 Generator（run-01）撰写；子代理写文件被环境拦截，由协调者按原文写入并提交。

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：打开首页（`/app/agent` 真实期与示例判定、`/app/home/events`）不再读取资料「更新建议」图，整 workspace 五集合扫描与建议决定读取（共 6 条语句）从首页消失。本机 `user_verify_plan` 单次首页 SSR 复合读取从 9,593,285 B／17 条语句降到 58,808 B／11 条（−99.39%）；其他账号往同一 workspace 灌 500 条噪声后，本人首页字节与语句数完全不变（改前同条件 +454,900 B）。首页账户卡、失败页、示例判定与读取次数不变；资料编辑页、管理台与 `/api/profile/update-suggestions` 的建议行为不变（`features/profile/**`、`app/api/profile/**`、App 端零改动）。
- 仍未实现或未验证：首页剩余 58.8 KB／次（contacts／events 页面模型复用、legacy events 整 workspace 读取）不在本 Sprint，按 1000 人 × 4 次／天 × 30 天约 7.06 GB／月，单行即超 D39 的 1.6 GB（见 SC-05，登记 D32 风险，W0041＝P2 处理）。资料页／建议接口自身的整 workspace 读取（P1）未动，W0042 处理。未连生产，未做生产效果核对（W40-4）。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5／2026-10-02；Planner revision 2（SHA256 `f7b59b95dea80b8b59addced3f9d405089ab9e96b9a4bd7e0a103e334bd94e43`）
- 分支 `sprint/W0040-home-profile-read-trim`（起点 `chat-agent` = `4ac5a6dc`）；功能 SHA `3543f91a`；报告提交与 `chat-agent` 合并 SHA 记在登记表
- 档位 H。全量对照（RULES §5.2，工作树内；本 Sprint 已提交，改用「把本 Sprint 路径临时检出为 `4ac5a6dc` 版本、移走新测试」代替 stash）：基线 6166 tests／10 fail／700 skip；改后 6190 tests／10 fail／700 skip；**新增失败 0**，消失 0。10 项基线失败（比历史 9 项多出 `W0037 SC-04 ... 我已加入 really PUTs`，改前改后同在，非本 Sprint 引起）清单见证据 `full-baseline-failures.txt`
- `npx tsc --noEmit -p .`：只有 `.next-verify/dev/types/validator.ts` 两条既有生成文件错误，源码 0 错误
- 付费 AI 调用 0；未 push、未部署、未连生产／Preview
- 开关：`AppProfileRouteControls.suggestions?: "include" | "skip"`，默认 `"include"`；首页传 `{ suggestions: "skip" }`
- 证据目录：`~/orbit-sprint-evidence/web/sprint-W0040/run-01/`（`probe.ts`、`matrix.ts`、`measure-before/after.jsonl`、`noise-before/after.jsonl`、`matrix-before/after.json`、`matrix-diff.txt`、`red.txt`、`green.txt`、`guide-demo-red.txt`、`guide-demo-after.txt`、`targeted.txt`、`tsc.txt`、`full-*.txt`、`codex-review.txt`、`impact-*.txt`、`detect-changes-feature.txt`、`sc03-zero-diff.txt`、四张截图 `before/after-agent-1440.jpg`、`before/after-agent-375.jpg`）

### GitNexus impact（索引已 `analyze --index-only` 刷新）

| 符号 | 结果 | 处理 |
| --- | --- | --- |
| `loadAppProfileRouteViewModel` | 名称查询有歧义（测试内同名局部函数）；`--uid` 指定后 impacted 85、direct 4（`loadAppHomeRouteViewModel`、`loadProfileEditorPage`、`loadAppAdminPlatformRouteViewModel`、`app-profile-live-route-services.test.ts`），本次索引报 **MEDIUM**；PLANNER 编制时为 **CRITICAL** | 按 PLANNER 的 CRITICAL／H 档处理；文本搜索调用方一致（另有 `secondary-industry-editors.test.tsx`、`app-profile-onboarding-editor.test.tsx` 测试调用） |
| `loadAppHomeRouteViewModel` | `--uid` 后 impacted 77、direct 3（`agent/page.tsx` 的 `loadHomeModel`、`home/events/page.tsx`、`canonical-participant-event-journeys.test.ts`），本次 **MEDIUM**；PLANNER 记 **CRITICAL** | 同上；签名未变 |
| `readSignalGraph` | **UNKNOWN**（0 调用方解析） | 文本搜索复核与事实 4 一致：`live-signal-service.ts:585／648／720`；本 Sprint 不改 |

detect-changes（staged，功能提交前）：4 files、Risk level low，无 partial／truncated。

### 测量摘要（本机 `localhost`，W0017 口径：每条语句返回行 JSON 字节之和）

脚本开头打印 `resolveLiveDatabaseConnectionConfig()` 的 host／workspaceId（不打印连接串）；先 `assertLocalTestDatabases()` 通过。正式测量前 warm-up 一次不计。

| 账号 | 改前 字节／行／语句 | 改后 字节／行／语句 | 下降 | 改后 6 条图读取 |
| --- | --- | --- | --- | --- |
| `user_verify_new` | 9,558,901／5,702／15 | 24,424／21／9 | 99.74% | 0（改前 6） |
| `user_verify_legacy` | 9,585,147／5,742／17 | 50,670／61／11 | 99.47% | 0（改前 6） |
| `user_verify_plan` | 9,593,285／5,753／17 | 58,808／72／11 | 99.39% | 0（改前 6） |

噪声对照（`ORBIT_WORKSPACE_ID=workspace:w0040-noise-<before|after>-<ts>`，证明行显示 host `localhost`、workspaceId 即临时 workspace；其他 10 个账号往五集合各插 100 条）：改前 0 B→454,900 B（+500 行，语句数 14 不变）；改后 0 B→0 B，语句 8→8、行 0→0，**完全不变**。两次测完 `delete` 后 `remainingRowsInWorkspace: 0`。

## 验收结果

| SC | pass / fail / blocked | 证据（测试文件或场景） |
| --- | --- | --- |
| SC-W0040-01 首页不再触发建议图 | pass | (a) `tests/pages/app-home-profile-read-trim.test.ts` SC-01 四例（有／无 `rawSubject` × 有／无持久资料）`listUpdateSuggestions` 0 次，RED（改前 1 次）→GREEN；(b) `measure-after.jsonl` 三账号 `signalGraphStatements: 0`（改前 6）；(c) `noise-after.jsonl` 噪声增量 0（改前 +454,900 B）；0 skip |
| SC-W0040-02 账户卡与失败页不变 | pass | 同文件 SC-02：5 种成功情况（含建议运行时抛错、无持久资料分支）`home.account` 与 include 默认路径的资料逐项相等；7 种失败（signal／extraction／profile 服务解析失败、`getProfile` 抛错、`success:false`、onboarding 不合格、无 actor）首页 route-state 的 copy／evidenceIds／source／recoveryActions 与 include 对照逐项相等，skip 的资料 route-state 与 include 深相等；另一例单独证明 signal／extraction 解析失败仍让首页失败。`matrix-before/after.json`：33 个场景×actor 组合的首页输出与资料默认输出改前改后逐字节相同（只差首页建议调用次数 15→0）。`home/events`、`agent/page` 既有测试通过。截图（verify-legacy 真实首页，账户卡头像首字与「本周推进」关系目标一致，仅「现在 09:29/09:30」时间不同）；控制台只有既有 `/api/inbox/summary` 503；`/app/home/events` 正常渲染 |
| SC-W0040-03 资料页建议行为不变 | pass | 同文件 SC-03：不传／`{}`／`include` 都恰好 1 次且参数 `{ actorId }`；many／none／throw 三种 `suggestionCount` 3／0／0、`firstSuggestion` 有／无／无、`reviewSummary` 正常／正常／不可用；skip 只改三字段；编辑页与管理台源码未传 `skip`。`app-profile-onboarding-editor.test.tsx`、`tests/api/profile-suggestion-decisions.test.ts` 通过；`git diff chat-agent..HEAD` 在 `features/profile`、`app/api/profile`、`repos/orbit-app`、资料编辑页、管理台目录为空 |
| SC-W0040-04 示例期与开关关闭不回退 | pass | `tests/pages/app-agent-guide-demo-page.test.tsx` 新增 3 例（首页桩先以页面传入的同一 actor 跑真实 `loadAppHomeRouteViewModel`）：示例期 home 恰好 1 次、`home` 为 null、建议 0 次；开关关闭 home／events／registrations／community 各 1 次、建议 0 次；D2 老用户有目标进真实首页、建议 0 次。临时还原首页调用时 3 例全 RED，恢复后 25/25 通过；既有 W0014／W0036／W0037 断言不变 |
| SC-W0040-05 月预算表重算 | pass（表已补；总账超 1.6 GB 如实登记，按 W40-3 不作通过条件） | 见下表 |

定向收口集（新测试＋PLANNER 列的 10 个文件＋`secondary-industry-editors.test.tsx`）：124 pass／0 fail／0 skip。

### SC-05 数据库月预算表（D39 上限 1.6 GB；十进制 MB）

**人群模型。**
- 真实期：1000 位活跃用户 × 首页 4 次／天 × 30 天 = 120,000 次／月。
- 示例期：1000 位新用户 × 10 次（W0036 口径）= 10,000 次／月。
- 单次请求二者互斥。「直接相加」沿用 W0036 的保守口径（示例期用户另算）；「去重」口径假设示例期用户就在 1000 位活跃用户内，其示例期读取已含在每人每天 4 次里，因此 ③ 不另加。
- 单次字节取改后本机实测：真实期用 `user_verify_plan` 58,808 B（三账号最大）；示例期用新用户 `user_verify_new` 24,424 B。若示例期也取 58,808 B，则 ③ 为 588.08 MB。

| 行 | 内容 | 单次 | 月频次 | 10% 档 | 20% 档 | 100% 档 |
| --- | --- | --- | --- | --- | --- | --- |
| ① | 开工时总账（README D32 周检，W0037 后；W0038／W0039 无新增） | — | — | 1,222.78 | 1,282.63 | 1,761.38 |
| ② | 新增：首页 SSR 复合读取（真实期，改后） | 58,808 B | 120,000 | 7,056.96 | 7,056.96 | 7,056.96 |
| ③ | 新增：示例期同一复合读取（改后） | 24,424 B | 10,000 | 244.24 | 244.24 | 244.24 |
| 合计 | 直接相加 ①+②+③ | | | **8,523.98** | **8,583.83** | **9,062.58** |
| 合计 | 去重 ①+② | | | **8,279.74** | **8,339.59** | **8,818.34** |

两种口径三档都超过 1.6 GB（约 5.2～5.7 倍）。主要来源是此前从未进账的首页 SSR 复合读取剩余部分（②，占新增的 97%）：legacy events 整 workspace 读取 17,613 B、evidence 有界读取 14,081 B、contacts／connections 页面模型读取 9,321＋7,149 B、canonical 目录 5,507 B 等。按 W40-3 不作本 Sprint 通过条件，登记为 D32 风险，由 W0041（P2：首页改窄联系人计数与首页活动摘要）处理。

④ 被消除的项（不进总账，对照用；改后均为 0）：

| 项 | 单次 | 月流量（真实期 120,000 次） | 改后 |
| --- | --- | --- | --- |
| 改前本机实测首页复合读取（`user_verify_plan`） | 9,593,285 B | 1,151,194.20 MB（示例期另 10,000 × 9,558,901 B = 95,589.01 MB） | 7,056.96 MB（即 ②） |
| 其中建议图 6 条（本机） | 9,534,477 B | 1,144,137.24 MB | 0 |
| 按生产计数估算的建议图（`PRODUCTION-COUNTS.md`：5×1,527＋34×2,148＋31×2,526＋76×1,543） | 约 276,241 B（估算，非实测） | 约 33,148.92 MB | 0 |

N² 敏感度是带假设的模型，不是生产事实。假设：profiles 行数＝活跃用户数 N；每人贡献的联系人／关系／证据与当前样本成比例，约 55.2 KB；首页每人每天 4 次。生产 5 条 profile 不等于 5 位活跃用户。按此模型，月流量 ≈ 6.63 MB × N²。

| N | 5 | 16 | 100 | 1000 |
| --- | --- | --- | --- | --- |
| 改前建议图月流量 | 165.74 MB | 1,697.22 MB | 66,297.60 MB | 6,629,760 MB |
| 改后 | 0 | 0 | 0 | 0 |

⑤ 参考行（不进总账，供 W40-3 排序）：
- 资料页默认路径 `loadAppProfileRouteViewModel` 单次 9,535,781～9,535,929 B／8 条。
- 建议服务 `listUpdateSuggestions`（即 `/api/profile/update-suggestions` 的读取）单次 9,534,477 B／6 条；三账号相同，因为是整 workspace 读取。
- App 资料建议页和 accept／dismiss 的真实调用频次仍未知，无法给月流量。

## 假设与额外阅读

- 上下文包外读过以下文件，调用方都先经 GitNexus 或文本搜索确认：
  - `profile-service-factory.ts`：看解析失败如何映射。
  - `shared/services/module-mode.ts`：mock 模式与 `createNotImplementedFailure`。
  - `features/profile/mock-service.ts`、`mock-signal-service.ts`、`contract.ts`：造 empty／failure 场景。
  - `features/events/canonical-participant-event-journeys.ts`：测试里注入空旅程。
  - `shared/storage/live-database-config.ts`，`postgres-live-record-store.ts` 的 `listRecords` 与表结构：测量与噪声插入。
  - 脚本 `scripts/run-node-tests.mjs`、`assert-local-test-databases.mjs`、`verify-session-cookie.ts`、`verify-server.sh`。
  - 测试 `tests/pages/app-home-live-route-services.test.ts`，`tests/services/canonical-participant-event-journeys.test.ts` 的调用片段。
- 发现：资料 route 的失败页 `routeStateViewModel("failure")` 自己会再解析 mock 服务。所以「服务解析失败」在测试和 matrix 脚本里只让第一次解析失败（route 自己的服务组合），这与 live 模式下解析失败的真实顺序一致。
- 发现：无 actor 且无持久资料时，改前也会先调用建议，再返回 `PROFILE_ACTOR_REQUIRED`。改后首页不调用，失败页内容不变（SC-02 覆盖）。
- 新增测试在 mock module mode 下运行，不连数据库，没有 PG 用例被 skip。
  - 数据库只用于证据目录里的测量脚本：`node --env-file=.env.local` 只给测量子进程，不 source；脚本断言 host 为 localhost。
  - 全量对照没有 source `.env`；700 个 skip 是基线既有的，改前改后相同。
- 浏览器验证：
  - 3001 上浏览器原有 verify-new 的 HttpOnly 会话 cookie，挡住了注入的值；先调用本机 `/api/auth/signout` 清掉，再注入 verify-legacy。
  - 没用 verify-plan，因为它在 3001 上处于示例期，看不到账户卡。
  - 只浏览、没点写操作，没改账号数据，所以没执行 `--reset`。
  - 改前截图是在 dev server 上临时还原首页那一行（未提交）后截的，截完立即 `git checkout` 恢复。
- 预算表示例期单次取新用户实测值（理由：示例期用户就是新用户），保守替代值已在表注给出。

## review 处理（仅 H 档）

Codex `gpt-5.6-sol`，`codex review --base chat-agent`，全文 `codex-review.txt`。结论：功能改动与定向测试正确；1 条意见。

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| [P2] `repos/orbits/next-env.d.ts` 指向 `.next-verify/dev/types/routes.d.ts`，干净检出会 typecheck 失败，应恢复默认路径 | 不适用于本分支：该文件不在本分支提交里（`git diff chat-agent..HEAD` 只有 4 个文件），是工作树里既有的用户未提交改动（3001 验收 server 运行时会重写）；RULES §4 与协调者要求不得覆盖或暂存 | 不改；合并时确认该文件不随任何提交进入 `chat-agent` |

## 交接

- 接口：`loadAppProfileRouteViewModel(actor, { suggestions: "skip" })` 只跳过 `signalService.listUpdateSuggestions`。
  - 三个建议字段回到「不可用」默认值：`firstSuggestion: null`、`suggestionCount: 0`、`reviewSummary` 为 "Optional profile suggestions are unavailable…"。
  - 服务解析、`getProfile`、onboarding 校验照旧执行。
  - 默认 `"include"`；目前只有首页传 `skip`。
- W0041（P2）起点：首页 SSR 改后剩 11 条语句、58,808 B。逐语句清单在 `measure-after.jsonl` 的 `ssr-home:user_verify_plan`；最大头是 legacy events 整 workspace 读取 17,613 B 与 evidence 有界读取 14,081 B。测量可复用证据目录里的 `probe.ts`（`measure`、`noise` 两种模式）。
- W0042（P1）起点：资料页／建议接口单次 9.53 MB（本机）；`readSignalGraph` 三个调用点见上。要算月成本，需要 App 资料建议页的真实调用频次（W40-5）。
- 待办：README D32 周检登记首页 SSR 复合读取进账后三档 8,523.98／8,583.83／9,062.58 MB（去重 8,279.74／8,339.59／8,818.34 MB），超 1.6 GB；上线后的生产效果核对按 D32 另行授权（W40-4）。
- 回退：`git revert 3543f91a`（只改两处调用与一个可选字段，无迁移、无数据写入）。
