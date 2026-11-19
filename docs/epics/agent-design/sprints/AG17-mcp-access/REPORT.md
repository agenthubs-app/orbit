# Sprint AG17 — 执行总结（用户自己的 Claude、Codex 经 MCP 读授权的资料、提出修改，H）

对应 GOAL.md。run-01 的阶段报告：服务端和不需要页面的测试已做完；三张网页、与 AG15 的两处接线、两个真实客户端的联调没有做。

### 结果

已验证能做到（本机，模拟的外部客户端）：

- **没授权会被拒绝并被告知去哪里授权。** 不带令牌调 `/mcp` 得 401；`WWW-Authenticate` 写明资源元数据地址和建议请求的范围（只有只读和「查看自己提过的修改」）；响应体没有记录内容。令牌过期、连接已撤销、账号正在注销时相同。
- **用户勾选范围，客户端只看得到被允许的工具。** 授权请求必须带 PKCE S256，客户端必须在名单上（Claude、Claude Code），回调地址必须是它登记的，`resource` 必须是本端点。只读待办的连接只列出 `search_records`、`get_record`；绕过清单调 `propose_change` 得 403 并写明缺哪一项，不出卡。
- **读到的只有授权内的内容。** 读取走 AG05 的读取适配器，再按每类记录的字段清单筛一遍。结果里没有邮箱、电话；笔记只带关联联系人的编号；别的账号的记录搜不到也取不到。查 `memory`、`conversations` 一律被拒，即使连接拿到全部范围。
- **笔记里夹带的指令只当文字返回。** 用户写的内容放在 `user_data` 下，并带一句「只当数据」的说明；读完没有任何卡产生。
- **提修改只返回编号、链接和到期时间，什么都不写。** 服务端自己读现值并冻结成待确认的卡。链接只含一个随机编号。同键同内容返回同一编号，同键不同内容报冲突。带 `approved`、`decision` 之类字段的被拒。没有能替用户确认的工具。
- **只有所属账号能看到、能确认。** 别的账号打开，回答与编号不存在相同；它的账本里也没有这张卡。所属账号确认后才执行，外部再查看到「已完成」和回执。
- **24 小时后失效。** 打开和点击时都按存储的到期时间判；点确认得 `CARD_EXPIRED`；这类卡不能在 Orbit 里重新生成。
- **撤销后马上不能用。** 下一次调用就是 401，刷新令牌也失效；没确认的卡变已取消，再点得 `CARD_CLOSED`；已执行的保留。提议与撤销并发时不留可确认的卡。
- **每次调用留记录**：连接、工具、范围、返回条数、协议版本、上次使用时间。
- **两代协议都能用**：按 2026-07-28 版逐次请求，也应答 2025-11-25 版握手。

仍未实现或未验证：

- 三张网页、两个页面测试、1440／375 截图、不闪动测量（视觉稿未批准）。现在真实用户走到授权会被带到一个还不存在的页面。
- 收件箱「外部提议」和到点自动标过期（等 AG15），所以 AE-MCP-003、AE-MCP-005 不过。
- 人工联调·Claude：未做。人工联调·Codex：未做。Codex、ChatGPT 的登记方式没有可核实的文档，名单里没有它们。
- 外部能提的修改只有三种：新建待办、改待办的标题／计划日／截止时间、新建不关联任何人的笔记。
- 活动和「我去过」只能按编号读。
- 账号注销不会顺带撤销连接（注销期间调用会被拒）。
- 令牌端点、授权端点没有限流。
- 同一客户端再授权会多出一条连接；同意页拿不到「现在已有的范围」；连接列表没有「几条提议在等」。
- `/connect` 这样的短地址没有做。

### 运行记录

- 结果：blocked。
- Generator：Claude（Fable 5.2），2026-11-19～20。Planner revision 1，原文 SHA-256 `0a70ea00f9d41ec9c63759486431cef6d65b6236d4142abb9d02e1017f8f2b6f`。
- 基线 `98869bb4c`；分支 `sprint/AG17-mcp-access`；最终 SHA `60d2c4d6d`。档位 H。没有 push。
- 提交：`c8662ed54` 服务端；`f4db01ee7` 评测；`c6cdcc6f3` 两条上限；`60d2c4d6d` 默认只读。
- 全量（`60d2c4d6d`）：服务端 9238 条，22 失败，名字与基线相同（基线 9172 条）；App 3582 条，4 失败，其中 3 条是基线，另 1 条 `shell-back-restore` 单独跑 3／3 通过。
- App typecheck 有 1 处报错，在 `tests/ios-scene-lifecycle-config.test.ts`，本 sprint 没碰这个文件；没有在基线上复核。
- 费用：主模型 158 次、判断 16 次；提示 379,068、生成 63,840、判断输入 6,163 token；0.3032 元。

### 验收结果

| 验收 | 结果 | 证据 |
| --- | --- | --- |
| AG17-1 | 服务端 pass | `auth-challenge.test.ts`、`token-audience.test.ts`、`tools.test.ts`；AE-MCP-006、007、AE-SCL-031 |
| AG17-2 | pass，AE-MCP-003 差 `inbox` | `tools.test.ts`、`propose-confirm.test.ts`；AE-MCP-001、006 |
| AG17-3 | 服务端 pass；页面 blocked；AE-MCP-005 差 `scheduler_tick` | `propose-confirm.test.ts`；AE-MCP-004 |
| AG17-4 | pass | `result-projection.test.ts`；五例 `mcp_result_excludes` 全过 |
| AG17-5 | 模拟客户端 pass；页面 blocked；两项联调未做 | `revoke.test.ts`；AE-MCP-004、007、AE-SCL-032 |

`tests/agent-v1/mcp/` 共 6 个测试文件、63 条。

门槛运行 `20261120-003956-60d2c4d-AG17-gate-run-01`：75 例中 68 例代码判定通过（494 项通过、16 项不通过、12 项无法判定）。不通过的 7 例：AE-MCP-003、AE-MCP-005、AE-SCH-004 等 AG15；AE-MEM-008、AE-MEM-009、AE-MEM-012、AE-REF-005 等 AG14。评审材料已生成，尚未评审。

### 与 PLANNER 不同

1. 端点在 `/api/` 之外：`/mcp`、`/oauth/authorize`、`/oauth/token`、两处 `/.well-known/`。`proxy.ts`、`isPublicApiPath` 没有改。
2. AG15 并行：两处做成接缝，AE-MCP-003、005 留红。
3. 协议按已发布的 2026-07-28 版：没有握手，有 `server/discover`、镜像头校验、版本不支持的应答；旧版握手照常应答。没有加 SDK。
4. 没有加新变量：用 `ORBIT_MCP_BASE_URL`，退到 `AUTH_URL`；生产环境都没设就回 503。
5. 多出的文件：`mcp/scopes.ts`、`records.ts`、`views.ts`、`configured.ts`、`app/api/_shared/mcp-access.ts`、同意接口和读提议接口。没有迁移。
6. 账本两处小改：外部连接的卡 24 小时、过期不能重新生成；过期和作废各多一句说明。
7. 可提的修改限三种。
8. 名单只有 Claude、Claude Code。夹具里的「Codex」用 Claude Code 的文档走旧版握手。
9. 评测口径：`http_status` 判最后一次工具调用；`mcp_result_has` 的时刻允许晚 120 秒以内，请协调者确认。
10. 另加三条保护：一条连接 24 小时最多新提 100 条；请求体最多 256 KB；401 带建议范围，同意页不预先勾「可以提修改」。
11. `ag07-no-internal-words.test.ts` 排除了 `mcp/transport.ts`（协议错误文字只给客户端软件读）。
12. 契约快照从基线重新生成。

### 影响分析

| 符号 | 结果 | 处理 |
| --- | --- | --- |
| `proxy` | UNKNOWN／LOW，按 HIGH 对待 | 没有改 |
| `isPublicApiPath` | LOW | 没有改 |
| `AccountSection` | HIGH，45 处 | 还没有改 |
| `proposeAction` | HIGH，135 处 | 没有改 |
| `cancelAction` | UNKNOWN，文本搜索确认 | 只调用 |
| `freezeCard` | LOW／UNKNOWN，3 处调用 | 改一行 |
| `regenerateCard` | UNKNOWN，1 处调用 | 加一个分支 |
| `decideAction`／`cardMessages` | UNKNOWN／MEDIUM | 只加文字 |

收口时对基线的整体比较报 critical（49 个文件、958 个符号、97 个流程）。它列出的 10 条流程都只经过新加的符号。

### 视觉稿里服务端还没支持的四处（稿子 2026-11-20 发给用户，尚未批准）

- **每类三档：** 「可以提修改」现在只有待办和笔记有；其余四类只有不给看和只读。
- **再来多要时带出现有的选择：** 现在每次授权都新建一条连接，同意页拿不到现有的范围。
- **连接卡上「N 项等你确认」：** 列表接口没有这个数。
- **短地址 `/connect`：** 没有加；服务地址是 `/mcp`，令牌绑定在它上面。

已经支持的：申请的范围先放只读、「可以提修改」只能由用户自己勾；设置里只能断开；别的账号的链接和打错的链接得到同一个回答；撤销时报出作废了几条没确认的修改。

### 证据

`/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG17/run-01/`：`impact-upstream.json.txt`、`detect-changes-compare.txt`、`full-orbits.log`、`full-fail-names.txt`、`full-app.log`、`gate-run-01.log`、`smoke.txt`、`seed.log`、两份构建日志。

### 交接

- **页面接口**（只认网页会话，类型在 `shared/contract/agent-v1.ts` 的 AG17 一节）：
  - `GET /api/agent/connections`
  - `DELETE /api/agent/connections/<id>`
  - `GET` 和 `POST /api/agent/connections/authorize`
  - `GET /api/agent/proposals/<proposalId>`
  - 确认照旧走 `POST /api/agent/ledger/<actionId>/transition`。
- **页面地址**：`/app/settings/agent-connections/authorize`、`/app/agent/proposals/<proposalId>`。
- **AG15 合并后**：接 `features/agent-v1/mcp/configured.ts` 的 `PROPOSAL_SEAMS`（`notifyProposed`、`scheduleExpiry`）；运行器的 `scheduler_tick` 由 AG15 提供。
- **AG14**：`result-projection.test.ts` 有三条会在记忆被接进 MCP 时变红。
- **上线前**：设 `ORBIT_MCP_BASE_URL`，确认 `/.well-known/*`、`/mcp`、`/oauth/*` 能路由到。
- **回退**：没有迁移和数据写入，不合并或 revert 即可。
- **容易和别的线冲突的文件**：`repos/orbits/shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts`、`.snapshot.json` 及 App 的副本；`features/agent/runtime/decision.ts`、`service.ts`；`tests/agent-eval/lib/runner.ts`、`hard-checks.ts`、`seed.ts`、`preload/eval-preload.cjs`；`docs/epics/agent-design/eval/CHANGES.md`、`eval/README.md`；`tests/agent-v1/ag07-no-internal-words.test.ts`。
- **评审材料**：`agent-eval:judge-pack` 不读 `.env.agent-eval`，并行线上要在命令行带 `ORBIT_AGENT_EVAL_HOME=<本线的目录>`。

### 待登记的运行

| 运行编号 | 提交 | 用途 | 用例 | 代码判定通过 | 主模型 | 费用（元） |
| --- | --- | --- | --- | --- | --- | --- |
| `20261120-001424-c8662ed-AG17-dev-1` | c8662ed | 开发 | 3 | 2 | 0 | 0 |
| `20261120-001443-c8662ed-AG17-dev-2` | c8662ed | 开发 | 7 | 6 | 3 | 0.0054 |
| `20261120-003755-60d2c4d-AG17-dev-3` | 60d2c4d | 开发，十例 | 10 | 8 | 3 | 0.0049 |
| `20261120-003904-60d2c4d-AG17-dev-4` | 60d2c4d | AE-MCP-002、008 第二遍 | 2 | 2 | 3 | 0.0052 |
| `20261120-003921-60d2c4d-AG17-dev-5` | 60d2c4d | 同上第三遍 | 2 | 2 | 3 | 0.0064 |
| `20261120-003956-60d2c4d-AG17-gate-run-01` | 60d2c4d | AG17 门槛 | 75 | 68 | 146（判断 16） | 0.2814 |
| `20261120-004437-60d2c4d-AG17-smoke-prep` | 60d2c4d | 冒烟前恢复小世界 | 1 | 1 | 0 | 0 |

AE-MCP-002、AE-MCP-008 三遍的代码判定和评审要点一致。门槛日志包校验值前缀 `f1e99d8c57a8`。

本报告由 Generator 起草、协调者代为写入（Generator 会话的写文件工具拒绝写报告文件）。

## 追加：合并 AG15、接上收件箱与到期定时器（Generator，2026-11-20）

协调者 2026-11-20 的指示：把 `sprint/AG15-scheduled-tasks-inbox`（`002c63eb7`）合进本分支，接上两处接缝，重跑 AE-MCP-003、AE-MCP-005 和整套门槛。视觉稿仍未批准，页面和四项依赖视觉稿的服务端改动都没有做。

### 做了什么

- **合并**：`dd3af6860`（`--no-ff`）。冲突处两边都保留：
  - `features/agent/runtime/decision.ts`：两个 sprint 的卡片文字并存；已过期的卡，被下一期取代的说「已被取代」（AG15），其余按出处取文字（外部提议说「请让提出它的那个助手重新提一次」）。
  - `shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts`：AG17、AG15 两块前后相接。
  - `shared/contract/.snapshot.json` 与 App 的两份同步副本：重新生成（857 个契约类型），四个同步测试通过。
  - `runner.ts`、`hard-checks.ts`、`seed.ts`、评测预载、`eval/CHANGES.md`、`eval/README.md`、`service.ts` 自动合并，没有冲突。
- **收件箱**（`8789c2065`）：新提议第一次生成时写一条收件箱记录，来源 `external_proposal`，标题写明是哪个客户端提的（「Claude 提了一项修改，等你确认」，日、英各一句），正文是卡片自己的摘要，指向这张卡，随卡到期。内容在 `features/agent-v1/mcp/inbox.ts`，接线在 `configured.ts` 的 `PROPOSAL_SEAMS.notifyProposed`。同一个键重复提不会再写。收件箱写失败时提议照样成立、链接照样能用，失败记进追踪（`notify.inbox`，`outcome: failed`）。
- **到期定时器：没有按指示另设一个 `wake` 定时器，原因如下。** AG15 给每个账号的账本都包了一层（`withCardExpiryTimers`）：账本每冻结一张卡就自己设一个 `card_expiry` 定时器，外部提议的卡也经这个账本冻结，所以定时器已经有了。再设一个 `wake` 定时器只会多出一个到点什么都不做的定时器（AG15 的 `wake` 处理现在只记一条追踪）。因此删掉了原来留的 `scheduleExpiry` 接缝。证据见 AE-MCP-005 的 trace：冻结时 `timer.set`（`card_expiry`），`scheduler_tick` 之后 `timer.fired`（`card_expired`）和 `card.state`（`to: expired`，`via: timer`），之后点击得到 `CARD_EXPIRED`。撤销连接时卡已变为已取消，定时器到点时不再改它。
- **评测快照重建**：合并后第一次重跑时，派发入口回 503、定时器设不上（`relation "agent_automation_due" does not exist`）——本线的三个世界快照是合并前种的，没有 AG15 的到期索引表。停服务、重新 `agent-eval:seed`、再起服务后正常。**别的线合并 AG15 之后也要重新种一次。**
- `eval/CHANGES.md` 加一行：`mcp_result_has` 的 120 秒容差已由协调者确认保留。

### 运行（都在 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag17/runs/`，构建自 `8789c2065`）

| 运行 | 用途 | 代码判定 | 主模型／判断 | 费用（元） |
|---|---|---|---|---|
| `20261120-081359-8789c20-AG17-dev-6-after-ag15` | 合并后第一次重跑（快照还是旧的）：AE-MCP-003 过；AE-MCP-005、AE-SCH-004 因缺表不过 | 1/3 | 0／0 | 0 |
| `20261120-081643-8789c20-AG17-dev-7-after-reseed` | 重新种库后：AE-MCP-003、005、007、AE-SCH-004 | 4/4 | 0／1 | 0.0004 |
| `20261120-081733-8789c20-AG17-gate-run-01b-with-AG15` | **AG17 门槛（合并 AG15 后）** | 69/75 | 143／21 | 0.2725 |
| `20261120-082438-…-AG17-rerun-1-web006-ref006` | AE-WEB-006、AE-REF-006 单独重跑第 1 次 | 2/2 | 3／1 | 0.0066 |
| `20261120-082507-…-AG17-rerun-2-web006-ref006` | 同上第 2 次 | 2/2 | 3／1 | 0.0067 |
| `20261120-082537-…-AG17-rerun-3-web006-ref006` | 同上第 3 次 | 2/2 | 3／1 | 0.0071 |

门槛 `…-gate-run-01b-with-AG15`：75 例，69 例代码判定通过；判定项 493 过、18 不过、9 看不出。评审材料已生成（`judging.md`，每例两份），没有评审。日志包校验值前缀 `56db3b5145d5`。

- **本 sprint 的 10 例（MCP ×8、SCL ×2）全部通过**，包括 AE-MCP-003（收件箱 1 条）和 AE-MCP-005（定时器到点标过期）。AE-SCH-004（AG15）也通过。
- 不过的 6 例：
  - AE-MEM-008、009、012，AE-REF-005：等 AG14，预期之内。
  - **AE-WEB-006**：判断模型（Gemini）两次调用在 3 秒被中止，按超时规则单独重跑 3 次，3 次都过。
  - **AE-REF-006**（AG11 的不变量用例）：这一次第一层把「看看 @回复田中的询价 的截止时间」拆成依赖「根据 @客户访谈」的子目标，打不开的那条挡住了能读的那条，回答没有引用 T44。没有超时。run-01 的门槛里它是过的，单独重跑 3 次也都过（5 次里 1 次不过）。这是 AG11 那条规则「有一条打不开时其余照常读」在拆分方式变化时不稳，不在本 sprint 的改动范围里，没有修，报给协调者。

### 全量测试（`8789c2065`）

服务端 9292 条，22 条失败，名字与基线清单完全相同（`full-fail-names-after-ag15.txt`）。App：四个同步测试通过；typecheck 仍只有 `tests/ios-scene-lifecycle-config.test.ts` 那一处（本 sprint 没碰过这个文件）；App 全量在合并前的 `60d2c4d6d` 上跑过一次，合并后没有再跑（App 里的变化只有两份同步副本）。

### 费用（累计）

本次追加：主模型 152 次、判断 25 次，提示 365,297、生成 61,754、判断输入 7,544 token，0.2932 元。整个 sprint 累计：主模型 310 次、判断 41 次，0.5964 元（上限 150 元）。

### 验收结果更新

| 验收 | 结果 |
|---|---|
| AG17-1 | 服务端 pass（不变） |
| AG17-2 | pass，AE-MCP-003 现在全过 |
| AG17-3 | 服务端 pass，AE-MCP-005 现在全过；页面仍 blocked（视觉稿） |
| AG17-4 | pass（不变） |
| AG17-5 | 模拟客户端 pass；连接管理页 blocked；两项真实联调未做 |

状态仍是 blocked：只差三张网页（及其测试、截图、不闪动测量）和两项真实联调。

### 证据（追加到 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG17/run-01/`）

`gate-run-01b.log`、`build-3.log`、`reseed-after-ag15.log`、`full-orbits-after-ag15.log`、`full-fail-names-after-ag15.txt`。

### 交接更新

- 「AG15 合并后要接的两处」已完成：收件箱接在 `PROPOSAL_SEAMS.notifyProposed`；到期定时器由账本自己设，`ProposalSeams` 里不再有 `scheduleExpiry`。
- 收件箱里这条记录的目标是卡（`target.kind: "card"`，`href: null`，照 AG15 的写法）。AG15 的收件箱界面做出来时，点这一条应当打开确认链接页还是直接显示卡，要在界面稿里定；确认链接页的地址需要提议编号，现在记录里只有卡的编号。
- 撤销连接、提议过期之后，收件箱里那条记录不会被本 sprint 主动改写；它是否还显示，由 AG15 的可见性规则（卡在读者自己的账本里就可见）和记录自己的到期时间决定。
- 本线的评测快照已在合并后的表结构上重建。

### 协调者对新提出的两项的答复（2026-11-20）

- **AE-REF-006 那一次不通过**（AG11 的用例；第一层让能读的记录等那条打不开的）：按波动规则记录——同一例单独重跑三次都通过，不在本 sprint 修。「互不相干的两部分不该互相等」这条规则放进第三方用例集之后的修复线（AG20）。
- **收件箱条目点开去哪：** 视觉稿（未批准）画的是手机上点这一行打开确认页，电脑上右栏直接显示同一张卡。等稿子获批后随页面一起做。

