# Sprint AG17 — 执行总结（用户自己的 Claude、Codex 经 MCP 读授权的资料、提出修改，H）

对应 [GOAL.md](GOAL.md)。**状态：completed，随第二次发布于 2026-11-21 上正式站（见页尾「协调者复核与结论」）；与真实 Claude 的联调还没做，Codex 未接。**

本页按时间顺序：先是 run-01 的阶段报告（当时服务端和不需要页面的测试已做完，三张网页、与 AG15 的两处接线、两个真实客户端的联调没有做，结果记为 blocked），后面三段「追加」是之后做的。正文由 Generator 写（前三段 Fable 5.2，追加 3 起 Opus 5.5），协调者原样写入。

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

## 追加：翻页游标对外不可读（Generator，2026-11-20）

评审在 AE-SCL-031、AE-SCL-032 里发现：MCP 工具返回的 `next_cursor` 是可读的 base64，解码后有内部账号编号（`user_agent_eval_r`／`user_agent_eval_l`）和工作区编号。协调者要求先查清它只是泄露还是能越权，再改成不可读。

### （1）查清的结果：只是泄露，不是越权入口

那是 AG05 读取适配器自己的游标（`features/orbit-ai/data-query/query-cursor.ts`）：一段可读的声明（账号、工作区、读取工具、条件哈希、位置、到期时间）加一段 HMAC 签名。服务端**从不**从游标里取账号或工作区：

- 下一页读谁的数据，取自令牌所指连接的账号（`access.scope(connection.accountId)`）；Postgres 读取源的每条查询都以 `workspace_id = $1 and user_id = $2` 开头，两个参数来自这个账号。
- 游标里的账号、工作区、条件哈希只用来**核对**：与当前调用方不一致就拒绝（`INVALID_CURSOR`）。

先写的测试 `tests/agent-v1/mcp/cursor.test.ts` 第 1 条，在改动之前的代码上就通过（账号甲的调用，库里另有账号乙的 25 篇笔记）：

| 送进去的游标 | 结果 |
|---|---|
| 账号改成乙，沿用原签名 | 拒绝 |
| 账号改成乙，并用真密钥重新签名（设想密钥泄露的最坏情况） | 拒绝（与调用方不一致） |
| 工作区改成别的，真密钥重签 | 拒绝 |
| 位置被改，原签名 | 拒绝 |
| 位置改到乙的一条记录上，真密钥重签 | 能读，但读到的全是甲自己的记录 |
| 条件哈希被改，真密钥重签 | 拒绝 |
| 不是 base64、空、只有一段 | 拒绝 |

九种都没有读到乙的任何记录。没有发现一级缺陷。

### （2）改成了什么（`210e35d64`）

- 适配器的游标不再出服务端。`search_records` 返回的是它的密文：AES-256-GCM（与集成令牌保险箱 `features/integrations/token-vault.ts` 同一种做法），每次随机 12 字节的初始向量，把「连接编号、记录种类、查询词的哈希」作为附加认证数据。实现在 `features/agent-v1/mcp/tools/cursor.ts`。
- 效果（`cursor.test.ts` 第 2～4 条）：
  - 读不出任何东西：原样、base64 解码、按点分段解码，都没有账号、工作区、记录编号、时间、查询词、字段名；同一位置两次拿到的游标文本也不同。
  - 只对签发它的那条连接有效：同一账号的另一条连接、别的账号的连接拿去用都被拒；换记录种类、换查询词被拒。
  - 改一个字符、截短、加长、不是 base64、太短，都被拒。
  - 适配器自己的游标（哪怕是本账号真实有效的那种）从外面递进来也被拒，外面只认密文。
  - 连接撤销后，带游标的调用和别的调用一样是 401。
  - 拒绝时是工具错误 `invalid_arguments`，提示「从头再翻」，响应里没有记录内容。
- **用的密钥**：由部署密钥派生（`derivedKey(secret, "search-cursor")`），部署密钥取 `AUTH_SECRET`，没有时取 `NEXTAUTH_SECRET`——与 MCP 访问令牌、同意凭条、提议编号用的是同一个来源（`auth/config.ts` 的 `mcpSecret`）。没有用 `ORBIT_SYNC_CURSOR_SECRET`：同步游标只签名不加密，本来就是给用户自己的客户端看的；这里要的是外部读不出来，而 MCP 模块已经有一套「按用途从部署密钥派生」的做法，游标和它签发的令牌同生同灭更简单。
- **密钥没设时**：`mcpSecret()` 返回空，整个 MCP 服务不建立，`/mcp`、授权端点一律 503，不会发出任何游标；`createCursorSealer` 本身遇到空的或短于 16 个字符的密钥直接抛错。没有「退回明文编码」这条路（测试第 4 条）。

### 评测判定

`mcp_result_excludes` 现在另查每一个 `next_cursor`：按客户端能读的方式读一遍（原样、整体 base64 解码、按点分段解码），读出账号编号、工作区、夹具里任何记录的产品编号、账号或工作区的字段名、或一个可读的时刻，就判不过。MCP 区和 SCL 两例都带这条判定，用例文件没有改，`eval/CHANGES.md` 已登记。用旧日志验证过它抓得住：把新判定套到 `…-AG17-gate-run-01b-with-AG15` 的 AE-SCL-031、AE-SCL-032 上，两例都不过（「the cursor … can be read: it holds user_agent_eval_r」）。测试 `tests/agent-eval/hard-checks-ag17.test.ts`。

### 运行

| 运行 | 用途 | 代码判定 | 主模型／判断 | 费用（元） |
|---|---|---|---|---|
| `20261120-085521-210e35d-AG17-ten-cases-opaque-cursor` | 改后重建，重跑 AG17 的十例 | 10/10 | 3／0 | 0.0055 |

目录 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag17/runs/20261120-085521-210e35d-AG17-ten-cases-opaque-cursor`，评审材料已生成（每例两份），没有评审。AE-SCL-031 的 39 个游标、AE-SCL-032 的 299 个游标都判为读不出东西；400 篇笔记、3000 位联系人照样翻完，不重不漏。整套门槛（75 例）没有重跑：这次只改了 `search_records` 的游标和一条评测判定，上一次门槛是 `…-gate-run-01b-with-AG15`（`8789c2065`）。

全量测试（`210e35d64`）：服务端 9297 条，22 条失败，名字与基线清单完全相同（证据目录 `full-fail-names-opaque-cursor.txt`、`full-orbits-opaque-cursor.log`）。App 没有改动，没有重跑。

费用累计：主模型 313 次、判断 41 次，约 0.60 元。

### 顺带发现，没有改（不在本 sprint 范围，报协调者）

AG05 的读取游标密钥在 `features/agent-v1/domains/configured.ts` 里是 `ORBIT_READ_CURSOR_SECRET ?? AUTH_SECRET ?? NEXTAUTH_SECRET ?? ""`：三个都没设时会用空串派生出一把谁都算得出的密钥（别的几处分页读取也是同样的写法）。因为账号和工作区从不取自游标，伪造这种游标最多只能在自己的记录里挪位置；经 MCP 也碰不到它（外面只认密文，且 MCP 自己没有密钥就不服务）。但它不是「没设就拒绝」，建议另开一项改成缺密钥时不发游标。

### 交接更新

- `ToolDeps` 多了必填的 `cursors: CursorSealer`；`search_records` 的 `next_cursor` 是密文，长度约 800 个字符（原来约 600）。
- 轮换 `AUTH_SECRET` 会让已发出的游标、访问令牌、同意凭条一起失效（客户端从头再翻、重新刷新令牌即可）。
- 容易冲突的文件新增：`repos/orbits/features/agent-v1/mcp/tools/run.ts`、`tests/agent-eval/lib/hard-checks.ts`（`mcp_result_excludes` 末尾加了一段）。

### 协调者的答复（2026-11-20）

- **AG05 读取适配器的游标密钥**（没配置时退回空密钥，不会直接报错）：现在从 MCP 走不到它，伪造的游标也只能在自己的记录里挪位置。记为修复线（AG20）的一项：没有密钥就拒绝，不用空密钥。


## 追加 3：网页与视觉稿要的四处服务端改动（Generator，Opus 5.5，2026-11-20）

视觉稿 2026-11-20 获批（`/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG17/draft/APPROVAL.md`，D1–D11 全取 A）。本段做了三张网页、收件箱里的这一条、登录框多的一行，以及稿子要的四处服务端改动。只有网页，App 没有界面改动（App 里只有同步副本变化）。开工时 PLANNER 文件 SHA-256 `899d090413fa3a2f7f117d34ec423c6e9899e5016c106930b3f6e3901c755c65`（含 2026-11-19 的追加记录），基线 HEAD `1a558c9d1`。

### 做了什么

**服务端（先写测试：`tests/agent-v1/mcp/consent-upgrade.test.ts`，8 条）**

1. **每类三档。** 「可以提修改」仍只有待办和笔记；其余四类在同意页上第三档是灰的，多一句「这一类暂时只能看，还不能提修改」。没有给外部客户端开新的写入路径。
2. **同一客户端对同一账号只有一条连接，原地改。** 换授权码时先把授权码标为已用（两次同时换只有一次能过），再找这个账号下这个客户端还在用的连接：有就把它能做的事换成这次用户选的（可以调高，也可以调低），没有才新建。连接的「连上」日期不变；改动对已发出的令牌立即生效（每次调用都读连接）。断开过的连接不会被改回来，再授权是新的一条。同意页的接口带上现在登录的账号（名字、邮箱，和一个由账号派生的 key，不是账号编号）和这个客户端现在能做什么；预选规则：已有的原样、这次新要的「只读」预选、「可以提修改」只标出来。页面提交时带回 key，和现在登录的不一致就不执行，回 409 和新账号的页面内容。
3. **连接列表带「几项等你确认」**（`waitingProposals`：这条连接 24 小时内提的、还在等确认、没过期的卡）和要抄的地址（`connectAddress`）。断开时作废的就是这几项（测试核对两个数相同）。
4. **短地址。** MCP 端点从 `/mcp` 改为 `/connect`，见下「短地址」。
5. 另：外部助手提的卡过期后不出「重新生成」（`shared/compute/agent-card-view.ts`，两端同一条规则；服务端本来就拒绝）。收件箱这一条改为「Claude 想改 N 项，等你确认」，正文是卡上那句数，目标指向这条提议的确认页地址（只有不透明编号）。浏览器带着名单外的客户端或没登记的回调地址来授权时，`/oauth/authorize` 把它带到同意页的「这个应用现在连不了 Orbit」（地址里没有请求内容）；非浏览器的调用方照旧拿 400。
6. 契约只加不改：新字段（`waitingProposals`、`connectAddress`、同意页的 `account`、`current`、提交里的 `accountKey`）都是可选的，快照重新生成（857 个类型），App 副本同步，四个同步测试通过。

**网页**

- 同意页 `/app/settings/agent-connections/authorize`（第 1–4 组）：没有导航（壳不套这一页）；内容在服务端读好再出页。状态：第一次连接、已经连着想多要（保持原样／允许这些改动）、中途换了账号、连好了、没有连接、连不了、请求过期、没保存成功。
- 确认页 `/app/agent/proposals/<编号>`（第 5–6 组）：带 Orbit 的导航（iOrbit 高亮，D6），手机上「‹ 确认修改」回收件箱；卡片是 AG07 的组件，没改。状态：等确认、过期（没有重新生成）、已确认、连接已断开、点了不改了、别的账号／打错的链接（同一页，D7）。内容在服务端读好再出页。
- 设置 › 外部 AI 助手 `/app/settings/agent-connections`（第 7–8 组）：菜单在「连接」下面（D3）；每个连接一张卡（能看、能提修改、连上日期、上次使用、「它提的 N 项修改等你确认 · 去看」→ 收件箱，D10）；「断开连接」（D4）和三行确认框（没有等确认的就只有两行）；只能断开（D5）；没有连接时三步、地址和复制（D11）。
- 收件箱（第 9 组）：这一条有自己的行（C 方块、标题、「修改1项，新增1项 · 明天 10:40 前有效」）；电脑上右栏是谁提的、有效期和同一张卡，可以直接确认；手机上点这一行打开确认页。
- 登录框（D8）：前面是同意页时多一行「Claude 想连接你的 Orbit · 先登录，再决定给它看什么。」（应用名取自服务端签过的请求凭条，伪造的链接不出名字）；前面是确认链接时「有一条修改等你确认 · 登录后才能看到内容。」。
- 所有固定文字按第 10 组逐字写（`app/(app)/app/orbit-2026/agent-connections/copy.ts`，中文照稿，日文、英文照着译）。测试核对三种语言里都没有 授权、范围、令牌、scope、token、MCP。

### 短地址：是什么、绑在哪、上线前要配什么

- **地址**：`<部署的公开地址>/connect`，正式站就是 `https://orbitailink.com/connect`。设置页显示去掉 `https://` 的 `orbitailink.com/connect`，「复制」复制带 `https://` 的完整地址。
- **它就是 MCP 端点本身，不是别名。** 客户端拿用户给的地址当资源，读 `/.well-known/oauth-protected-resource/connect`，核对里面的 `resource` 和它连的地址相同（RFC 9728 §3.3），再按这个资源要令牌（RFC 8707）。别名会变成第二个资源、要有自己的令牌，所以只留一个端点。所有访问令牌的受众（`aud`）都是 `<公开地址>/connect`；授权请求和换令牌时 `resource` 必须是它（`/mcp` 现在得 `invalid_target`，测试覆盖）。
- **`/mcp` 已删除。** 模拟的外部客户端改从 `/connect` 起走全流程（`tests/agent-eval/lib/mcp-client.ts`），和真实用户抄的地址相同；`eval/CHANGES.md` 登记了一行，用例没改。
- **上线前要配的**：`ORBIT_MCP_BASE_URL=https://orbitailink.com`（或至少 `AUTH_URL` 是这个地址；生产上两者都没有时端点回 503，什么都不发）；`AUTH_SECRET` 已有（令牌、凭条、提议编号、游标都由它派生）；确认部署的路由能到 `/connect`、`/oauth/authorize`、`/oauth/token`、`/.well-known/oauth-protected-resource/connect`、`/.well-known/oauth-authorization-server`（都在 `/api/`、`/app/` 之外，proxy 不拦）。客户端名单现在只有 Claude 和 Claude Code；Codex 的登记方式要在真实联调时核实后加进名单。

### 与稿不同，以及原因（逐组对照见 `run-01/compare.md`）

1. 联系人、活动、我去过、日程四类第三档是灰的（外部能提的修改只有待办、笔记；稿里 1440 大图六行都画成可选，手机说明和 `mini-row.jpg` 画了灰的样子）。
2. 每类一句按 MCP 实际给出的字段写（稿：多给的不写少，少给的不写多）：联系人「姓名、公司、职位、你加的标签和跟进阶段。不含电话和邮箱」（不给行业、地区）；活动「活动的名称、时间和地点」；待办「标题、备注、计划日和截止时间、做完没有」；笔记「标题、正文和日期」；日程「标题、时间、地点和备注」。
3. 「保持原样」：连接不变，浏览器回到客户端并告诉它没同意这次多要的（`access_denied`），客户端原来的令牌照常能用。结果卡写「保持原样 · 正在回到 Claude…」（第 10 组没有这一格）。
4. 请求过期又读不出应用名时写「回到你的 AI 助手，重新点一次连接就行。」
5. 确认卡上没有「详情 ›」（去掉其中一项）：外部提议这次不开放改卡，可以整张「不改了」。卡片组件没改。
6. 评测里写作 Codex 的连接用的是 Claude Code 的文档，设置里显示「Claude Code」；同意页「目前能连的只有 Claude 和 Codex」照稿写，但名单里实际是 Claude 和 Claude Code（见「需要决定」）。
7. 菜单图标用对话气泡（图标库没有插头）。
8. 带时间的几处（「今天 10:40 提的」等）在服务端出页时是同宽骨架，浏览器接上后写入（服务端不知道读者时区）；位置不动（`no-flash.md`）。
9. 收件箱里这一条确认或过期后没有改成「已处理」：它随卡到期（`expiresAt`），确认后右栏显示「已完成」的卡；行本身的状态由 AG15 的收件箱规则管。
10. 产品的资料引导门禁：没填完资料的账号打开同意页、确认页也会先被带去资料引导（现有的 proxy 规则，没有改）。截图前在引导第一步给两个评测账号填了名字和行业。

### 中途发现并修掉的一处（提交 `c3d59b8ed`）

没有配公开地址时（评测、本机开发），Next 给路由处理器的 `request.url` 用它自己的主机名（localhost），页面只能读到 Host 头（127.0.0.1）：授权端点签的凭条，同意页按另一个地址核对，读不出来，页面显示「这次连接请求已经过期」。现在两边都按 Host 头算；生产照旧必须有配置的地址，请求不参与。先写的测试在 `consent-upgrade.test.ts`。

### 影响分析（本段）

| 符号 | 结果 | 处理 |
|---|---|---|
| `AccountSection` | HIGH，45 处 | 只在联合类型里加一项；菜单多一行；`account-overview` 等页面测试通过 |
| `createAuthorizationServer` | HIGH，11 处（都在 MCP 模块和它的测试里） | 改换授权码的顺序与原地改连接；MCP 测试 71 条全过 |
| `createConnectionService` | HIGH，11 处（同上） | 加 `findActive`、`regrant` |
| `createProposalService` | HIGH，11 处（同上） | 加 `waitingCount` |
| `mcpAddresses` | CRITICAL，4320 处（经共享的服务对象扩散） | 只改没配公开地址时的那一支（评测、本机）；生产路径不变，测试覆盖两种 |
| `shellFrameFor`、`shellAppliesTo`、`RouteSkeleton`、`consentView`、`externalProposalInboxEntry`、`addressesFor`、`AuthLogin`、`TypedNotificationsTab` | LOW | — |
| `AuthModal` | MEDIUM | 加一个可选参数 |
| `agentCardView` | UNKNOWN（两个同名，各 LOW） | 只改 `regenerate` 一处；App 副本同步 |
| `connectionView`、`AppAccountLoginPage` | UNKNOWN，文本搜索确认只有本 sprint 的调用方 | — |

`detect-changes --scope staged`：第一个提交 52 个文件、116 个符号、9 条流程，high（都是新加的同意接口 POST 经过的流程）。

### 测试

- 新增：`tests/agent-v1/mcp/consent-upgrade.test.ts`（9 条）、`tests/pages/agent-connection-consent-page.test.tsx`（8）、`tests/pages/agent-proposal-confirm-page.test.tsx`（5）、`tests/pages/agent-connections-settings.test.tsx`（6）。
- 调整：`tools.test.ts`、`cursor.test.ts`、`propose-confirm.test.ts` 里原来假设「同一客户端第二次授权是另一条连接」的地方，改用另一个客户端或在每次授权后立刻核对；`auth-challenge.test.ts`、`token-audience.test.ts` 的地址改为 `/connect`，并加一条 `/mcp` 得 `invalid_target`。
- 相邻测试（壳、设置、收件箱、登录框、AG07 卡片、proxy 边界、agent-v1 全部）：914 条全过。
- `tsc --noEmit`：本 sprint 的文件零错误；剩下的两处（`tests/scripts/redesign-pixel-lib.test.ts`、`tests/services/contact-profile-inference-postgres.test.ts`）不是本 sprint 碰的文件。App：四个同步测试通过；typecheck 只有已知的 `tests/ios-scene-lifecycle-config.test.ts` 一处。

### 证据（`/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG17/run-01/`）

- `compare.md`：截图与稿逐组对照；`draft-boards/`：稿里抽出的 38 张图；`ui/`：46 张截图（1440 与 375）；`ui/shots.log`、`ui-shots-run.log`：截图时的数据怎么来的。
- `no-flash.md`：三张页面在 1440、375 整页打开和从「连接」点菜单进入（客户端跳转）时，标题、菜单、页名、主卡片出现后变化 0 次；同意页、确认页打开后对 `/api/agent/` 零读取，设置页读一次连接列表。
- `tools/`：截图脚本 `shoot.mts`、测量脚本 `flicker.mts`、抽图脚本。
- `build-ui-*.log`、`impact-upstream-ui.txt`、`detect-changes-staged-ui-1.txt`。

### 门槛（构建自 `c3d59b8ed`，重启之后从干净的树重建）

运行 `20261120-122509-c3d59b8-AG17-gate-run-01c-ui`，目录 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag17/runs/20261120-122509-c3d59b8-AG17-gate-run-01c-ui`，日志 `run-01/gate-run-01c.log`，日志包校验值前缀 `d8401b61e1a2`。

- 75 例，70 例代码判定通过；判定项 492 过、19 不过、9 看不出。
- **本 sprint 的 10 例（AE-MCP-001～008、AE-SCL-031、AE-SCL-032）全部通过**，模拟客户端走的是新地址 `/connect`、新的「同一客户端一条连接」规则。
- 不过的 5 例：AE-MEM-008、009、012，AE-REF-005（要 AG14，预期之内）；**AE-CON-007**（AG12 的批量导入用例）：这一次第一层把粘贴的四行当成指代不明，先问「这几位」指谁，没有出导入卡；没有超时。单独重跑 3 次都通过（`…-AG17-rerun-1/2/3-con007`），属于模型波动，不在本 sprint 改动范围（本段没有碰理解和导入的代码），报协调者。
- 评审材料已生成（`judging.md`，75 例各两份），没有评审。

### 费用

本段：门槛主模型 146 次、判断 17 次，0.5576 元；AE-CON-007 单独重跑 3 次，主模型 9 次，0.0223 元。截图和不闪动测量只走 MCP 和页面，没有模型调用。整个 sprint 累计约 1.18 元（上限 150 元）。

### 待登记的运行（本段）

| 运行编号 | 提交 | 用途 | 用例 | 代码判定通过 | 主模型／判断 | 费用（元） |
|---|---|---|---|---|---|---|
| `20261120-122509-c3d59b8-AG17-gate-run-01c-ui` | c3d59b8 | AG17 门槛（网页与四处服务端改动之后） | 75 | 70 | 146／17 | 0.5576 |
| `20261120-123220-c3d59b8-AG17-rerun-1-con007` | c3d59b8 | AE-CON-007 单独重跑第 1 次 | 1 | 1 | 3／0 | 0.0077 |
| `20261120-123235-c3d59b8-AG17-rerun-2-con007` | c3d59b8 | 同上第 2 次 | 1 | 1 | 3／0 | 0.0077 |
| `20261120-123300-c3d59b8-AG17-rerun-3-con007` | c3d59b8 | 同上第 3 次 | 1 | 1 | 3／0 | 0.0069 |

### 验收结果更新

| 验收 | 结果 |
|---|---|
| AG17-1 | pass（不变；地址换成 `/connect`，质询、受众、清单过滤的测试全过） |
| AG17-2 | pass（同一客户端原地改连接后，四个工具与按范围拒绝照旧） |
| AG17-3 | pass：确认链接页（等确认、过期、已确认、已断开、不改了、别的账号／打错的链接），1440／375 截图与稿对照，不闪动测量 0 移动；`agent-proposal-confirm-page.test.tsx` |
| AG17-4 | pass（不变） |
| AG17-5 | 模拟客户端与连接管理页 pass（`agent-connections-settings.test.tsx`、截图、不闪动）；**人工联调·Claude、人工联调·Codex 仍未做**（要用户本人登录与另行同意） |

状态：除两项真实客户端联调以外都已完成；按 PLANNER 记 blocked（只差两项人工联调）。

### 交接更新

- 页面地址：同意页 `/app/settings/agent-connections/authorize`、确认页 `/app/agent/proposals/<编号>`、设置 `/app/settings/agent-connections`；MCP 端点 `/connect`（`/mcp` 已删除）。
- 页面接口新增的字段都是可选的：`GET /api/agent/connections` 多 `connectAddress`、每条连接多 `waitingProposals`；`GET /api/agent/connections/authorize` 多 `account`、`current`；`POST` 可带 `accountKey`，不一致回 409（`ACCOUNT_CHANGED`）。
- 收件箱这一条的目标地址是确认页（`target.href`），来源 `external_proposal`。收件箱里本 sprint 只动了 `typed-notifications-tab.tsx` 的两处（这一种条目用自己的行和右栏）和新文件 `inbox/external-proposal-entry.tsx`；AG15 的界面线改同一个文件时，两处都是一行三元判断，合并时保留即可。
- **容易和别的线冲突的文件（本段新增）**：`app/(app)/app/inbox/typed-notifications-tab.tsx`（AG15）；`app/(app)/app/orbit-2026/shell/shell-routes.ts`、`Orbit2026Shell.tsx`、`RouteSkeleton.tsx`；`app/(app)/app/orbit-2026/account/AccountLayout.tsx`、`copy/account.ts`；`app/(app)/app/orbit-2026/auth-public/auth-login.tsx`、`auth-modal.tsx`、`app/(app)/app/account/login/page.tsx`；`shared/compute/agent-card-view.ts` 及 App 副本；`shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts`、`.snapshot.json` 及 App 副本。
- 上线前：设 `ORBIT_MCP_BASE_URL=https://orbitailink.com`（见「短地址」）。

### 需要决定

1. **同意页写「目前能连的只有 Claude 和 Codex」，但客户端名单里现在是 Claude 和 Claude Code**（Codex 的登记方式还没核实）。是先把这句改成「Claude 和 Claude Code」，还是等真实联调把 Codex 加进名单后保持原句？
2. AE-CON-007 那一次不通过（AG12 用例，第一层把粘贴的表格当指代不明）：要不要放进修复线。
3. 两项真实客户端联调：需要用户另外授权一个外网地址并本人登录同意。

### 全量测试与最后一处修正

- 第一次全量（`c3d59b8ed`）：9325 条，23 条失败；和已知的 22 条相比多一条 `orbit-2026 CSS Modules use only design tokens for colour, stacking, radius and type size`：本段新写的两个样式文件用了裸的圆角、字号和阴影。已改成产品的令牌（`--r-*`、`--fs-*`、`--shadow-float`、`--shadow-seg`，取最接近的一档；只有品牌小方块圆角 10→11、卡片阴影略有不同），提交 `3b594f450`，这条测试通过。
- 因此门槛、评审材料、截图、不闪动测量和全量都在最后的提交 `3b594f450` 上重做了一遍（见下「最后一遍」）；上面 `…-gate-run-01c-ui` 那一节是 `c3d59b8ed` 上的结果，留作记录。

### 最后一遍（全部在最终提交 `3b594f450` 上，构建 `build-ui-5.log`）

- **截图与不闪动**：重拍 45 张（`ui/`），`no-flash.md` 重测：三张页面在 1440、375 整页打开和客户端跳转时，所有测量项出现后变化 0 次；同意页、确认页打开后对 `/api/agent/` 零读取，设置页读一次。`compare.md` 已按这一遍的截图核对（第 8 组：列表第一张是 Claude Code，没有等确认的修改，所以它的确认框只有两行；三行的样子见 `settings-dialog-one-waiting-1440.png`）。截图脚本把评测服务时钟拨后了 25 小时，所以之后截的图里「上次使用」会写「明天」。
- **门槛** `20261120-133314-3b594f4-AG17-gate-run-01d-final`，目录 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag17/runs/20261120-133314-3b594f4-AG17-gate-run-01d-final`，日志 `run-01/gate-run-01d.log`，日志包 `832157c6f855`：75 例 71 例代码判定通过（判定项 497 过、14 不过、9 看不出）；本 sprint 10 例全过；不过的只有要 AG14 的 AE-MEM-008、009、012、AE-REF-005。AE-CON-007 这一次通过。主模型 144 次、判断 16 次，0.2781 元。
- **评审材料**：`…-gate-run-01d-final/judging.md`，75 例各两份，没有评审。

| 运行编号 | 提交 | 用途 | 用例 | 代码判定通过 | 主模型／判断 | 费用（元） |
|---|---|---|---|---|---|---|
| `20261120-133314-3b594f4-AG17-gate-run-01d-final` | 3b594f4 | AG17 门槛（最终提交） | 75 | 71 | 144／16 | 0.2781 |

费用累计（整个 sprint）：约 1.46 元。
- **全量**（`3b594f450`，`LANG=en_US.UTF-8`）：服务端 9325 条，22 条失败，名字与已知清单完全相同（`run-01/full-orbits-ui.log`、`full-fail-names-ui.txt`）。App：只有三份同步副本变化；四个同步测试、App 的两个 agent-v1 卡片测试（9 条）通过，typecheck 只有已知的 `tests/ios-scene-lifecycle-config.test.ts` 一处；App 全量没有跑（PLANNER「不运行」一节：App 只有同步副本变化）。

### 运行记录（本段）

- Generator：Claude Opus 5.5，2026-11-20。最终 SHA `3b594f450`（分支 `sprint/AG17-mcp-access`）；本段提交：`3ae345379` 网页与四处服务端改动、`c07b1db69` 确认页细节、`c3d59b8ed` 未配公开地址时地址一致、`3b594f450` 样式改用令牌。没有 push，没有合并。
- 2026-11-20 11:43 机器重启，之前在跑的构建和截图作废，已在最终提交上重做；12:35 前后因账号用量上限停了约半小时。

### 状态

blocked：除两项真实客户端联调（Claude、Codex，要用户另行授权外网地址并本人登录同意）以外，网页、四处服务端改动、截图对照、不闪动测量、门槛和全量都已完成。

## 追加 4：两位评审在最终门槛里提出的四件事（Generator，2026-11-20，提交 `9b5b33dd4`）

两位评审都让本 sprint 的 10 例通过，都确认游标和提议编号解不出任何可读内容；另外独立指出了两处暴露，协调者加了两件。四件都先写测试。

1. **关联编号不跨类。** 待办、笔记的结果原来对没被授予联系人、活动的连接也带 `contact_ids`、`event_refs`（AE-MCP-001、002、006、AE-SCL-031；AE-SCL-031 第 88 条里还有一个 `private:private_event:` 前缀的编号）。现在：结果里指向另一类记录的字段（`contact_ids`、`event_refs`、`memo_ids`、笔记往来里的人）只在这条连接能读那一类时才有，否则字段整个不出现（不是空数组，也不是个数）。活动的关联在能读活动时，就是 `get_record` 收的编号本身（去掉了适配器自己加的 `platform:`／`private:` 标记）；同意页「活动」一句改为「你报名、收藏和自己加的活动：名称、时间和地点」（稿子原来的说法），所以一个「自己加的活动」的编号不比用户同意的多说什么。测试 `tests/agent-v1/mcp/relation-ids.test.ts`（每一对类别各一条，加端到端一条）；`result-projection.test.ts` 里原来断言「没有联系人权限也带联系人编号」的那条改成断言没有。评测判定 `mcp_result_excludes` 加了一段：这条连接在本例同意步骤里没被授予的类别，结果里出现它的编号或指向它的关联字段就判不过（`hard-checks-ag17.test.ts`）；`eval/CHANGES.md` 登记。
2. **真链接和打错的链接回答一样（D7）。** 原来别的账号打开真链接得 404 和 `PROPOSAL_NOT_FOR_THIS_ACCOUNT`（AE-MCP-004 第 125 条），这个代码本身就说出「这条存在、属于别人」。现在两种情况都是同一个回答：404、`NOT_FOUND`／`PROPOSAL_NOT_FOUND`、同一句话，之前做同样的读取（按编号查一次、不读卡）。接口的逻辑移到 `views.ts` 的 `proposalResponse`，测试 `tests/agent-v1/mcp/cross-account.test.ts` 比较两种回答逐字相同、读取次数相同。页面本来就是同一页（`not_here`）。
3. **跨账号确认真的发到服务端。** 新测试：乙的会话带甲那张卡的编号、版本和哈希直接发确认，得 404，甲的卡仍在等确认，待办没变，乙的账本里什么都没有。运行器：某账号 `open_link` 被拒之后它的 `click` 不再什么都不发，而是由运行器以提议所属账号查出卡（只用于构造请求），再用这个账号的会话直接发出决定，记录回答（AE-MCP-004 乙的那次点击现在真的发出并被拒）。
4. **只说真的：现在只写 Claude。** 客户端名单里是 Claude 和 Claude Code，Codex 从没核实过。所有固定文字只写 Claude：设置页页名下那句、同意页「这个应用现在连不了 Orbit · 目前能连的只有 Claude。」、空状态的第一句和第一步（「在 Claude 里添加 Orbit，填这个地址」）。**这是协调者批准的、对稿子第 10 组的有意偏离**；Codex 核实并加进名单后再改回。测试核对三种语言的固定文字里都没有 Codex。

评审另外说明（只记在这里）：AE-MCP-007、AE-SCL-032 里「没有可用的确认按钮」两项在日志里看不到页面，是按卡的状态和被拒的点击判的。

本段没有重跑整套门槛（协调者：合并所有 sprint 之后在合并树上重跑并评审）。

### 重跑（构建自 `9b5b33dd4`，`build-ui-6.log`）

| 运行编号 | 提交 | 用途 | 用例 | 代码判定通过 | 主模型／判断 | 费用（元） |
|---|---|---|---|---|---|---|
| `20261120-142305-9b5b33d-AG17-ten-cases-judges-fixes` | 9b5b33d | AG17 十例（评审意见修正之后） | 10 | 10 | 3／0 | 0.0040 |

目录 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag17/runs/20261120-142305-9b5b33d-AG17-ten-cases-judges-fixes`，评审材料 `judging.md` 已生成，没有评审。核对：AE-MCP-004 里乙的确认这次真的发到了服务端，得 404 `NOT_FOUND`，没有被接受；乙打开甲的链接得到的代码是 `PROPOSAL_NOT_FOUND`；AE-MCP-001、002、006、AE-SCL-031 的结果里没有 `contact_ids`、`event_refs`（新判定也通过）。

本段的测试：MCP 82 条、评测判定 8 条、三张页面 21 条、`ag07-no-internal-words` 等，共 268 条全过；`tsc` 没有新的错误。全量测试没有在 `9b5b33dd4` 上重跑（协调者只要求十例；改动限于 MCP 投影、提议接口、运行器和页面文字，相邻测试都已跑过）。

## 追加 5：合并树上已红的三条棘轮测试里，本 sprint 新加的违规（Generator，2026-11-20，提交 `aa7b1b1e9`）

集成线按内容比较发现：几条在基线就红的测试里，有本 sprint 文件新加的违规（只按测试名比较看不出来）。本段只移走这些，不改行为、不改样子，不碰别人的违规、不改测试、不抬上限。

| 测试 | 本 sprint 文件的违规：之前 → 之后 |
|---|---|
| `no page has more hard-coded text or missing Japanese than the allow list grants` | `agent-connections/copy.ts` 250 + `parts.tsx` 15 → 0 |
| `skeleton files stay at zero and can never be allow-listed` | 同上两个文件 → 0 |
| `showcases, the root layout, the landing page and orbit-2026 outside copy tables have no hard-coded text` | 同上 250 + 15 → 0 |
| `non-.btn <button> count in app/(app)/app does not increase` | 9 个按钮（`ConsentPage.tsx` 5、`ProposalConfirm.tsx` 2、`AgentConnectionsSettings.tsx` 1、`external-proposal-entry.tsx` 1）→ 0（本分支计数 116 → 107） |
| App：`native app has a route for every web app surface` | 3 条网页路由 → **没有改，等决定**（见下） |

- **文字表**：页面的固定文字搬到 `orbit-2026/copy/agent-connections.ts`，每条写成 `{ zh, ja, en }`（和其他设置页的文字表同一种写法）；原来按位置写的 `agent-connections/copy.ts` 删掉。125 条逐条按数据比较完全相同（`run-01/ratchets/copy-before.json`、`copy-after.json`）；`parts.tsx` 里的日期用字（「{m}月{d}日」、星期名）也搬进去，`dateText` 的输出不变（「11月20日（周五）」「11月20日(金)」「Fri, Nov 20」）。没有用允许名单。
- **按钮**：九个按钮加上共用的 `btn` 类。同意页、确认页、设置页不在旧页面的范围里，`btn` 在那里只把按下时的位移设为无，看不出差别；收件箱那一行在旧页面（`[data-orbit-real-page]`）里，旧的 `.btn` 会改行高、内边距和对齐，所以用 `.inboxRow.inboxRow:global(.btn)` 把这一行自己的值写回去（`ListRow`、`Button` 也是这么做的）。截图对照见 `run-01/ui-ratchet/`。
- **App 路由对照（没有改，需要决定）**：例外清单要求写明用户的决定。这三页「只有网页」是用户 2026-11-20 批准视觉稿时定的；但同一个文件里另一条测试 `every web-only exception records a user decision with a reason`（现在是绿的）要求每一条的 `decidedAt` 都等于 `2026-09-27`。写 2026-09-27 是假日期，写 2026-11-20 会把这条绿测试弄红。所以没有加，三条现成的条目（含理由）放在 `run-01/ratchets/route-parity-exceptions.AG17-entries.txt`，等协调者定：让测试的维护者把日期检查放宽到合法日期（检查器本身已经核对 YYYY-MM-DD 格式），或者另作决定。
- 检查：三条文字棘轮和按钮棘轮的失败输出里没有任何本 sprint 的文件；三张页面测试、MCP 测试、收件箱页面测试、令牌测试共 133 条通过；`tsc` 只有基线的错误。
- **App 路由对照（已按协调者的决定完成，提交 `deaa25b85`）**：协调者决定（本 epic 的常设授权，会列给产品负责人）：`every web-only exception records a user decision with a reason` 里「`decidedAt` 必须等于 2026-09-27」那一句，当初只是因为所有例外都来自同一天的决定，不是要禁止以后的决定；改为接受任何格式正确、不在未来的日期（加一行注释），其余要求（有理由、决定人是用户、原有条目不动）不变。三条例外加进 `tests/route-parity-exceptions.ts`，`decidedAt: 2026-11-20`，理由：用户当天批准 AG17 视觉稿，连接外部助手的页面这一版只有网页；App 在收件箱里显示这种修改，点开时在浏览器里打开确认页。结果：`native app has a route for every web app surface` 只剩基线的 `/settings/account/delete`；`every web-only exception records a user decision with a reason` 通过。App typecheck 只有基线那一处。

## 协调者复核与结论

**结论：completed（真实客户端联调除外）。** 最终提交 `deaa25b85`（`4d0be2b40` 之后两个提交：页面文字进文字表、九个按钮用共用的 `btn`、三条只有网页的路由按协调者决定登记），经集成线 `agent-v1-next` 合并，随第二次发布（`463de7fdd`）在 2026-11-21 09:17 上正式站。AG17-5 的「与 Claude、Codex 各联调一次」没有做，见下。

**评审。** 都是 Claude 新会话，互不相见；门槛里另外 65 例是不变量包，只看代码判定。

| 运行 | 代码判定 | 评审 | 说明 |
|---|---|---|---|
| `20261120-081733-8789c20-AG17-gate-run-01b-with-AG15` | 69/75 | 一位（Fable 5.2），本 sprint 10 例：10/10 | 评审看出翻页游标是可读的 base64、里面有内部账号编号 → 「追加：翻页游标对外不可读」 |
| `20261120-133314-3b594f4-AG17-gate-run-01d-final` | 71/75 | 两位（Fable 5.2）各 10/10 | 没过代码判定的 4 例要 AG14。评审之外指出四处：未授权种类的关系编号（`contact_ids`、`event_refs`）要从结果里去掉；别人的提议编号和打错的编号要回一样的结果；跨账号确认要有服务端测试；对外文字只写 Claude → `9b5b33dd4`，十例重跑 10/10 |
| 上线门槛 `20261121-002824-bdb67c3-release2-gate-all-4` | MCP 区全过 | 两位（Opus 5.5） | — |

**协调者看过的截图。** `consent-first-375`、`settings-list-1440`：与稿一致。

**怎么合并的**（`coordination/next/INTEGRATION-LOG.md`）：
- `1e29899ae` 合 `1a558c9d1`（8 个文件冲突）。合并时核对：MCP 模块和它的路由没有一处引用记忆的存储或领域，`memory`、`conversations` 不在任何授权范围里；能提议的只有 `todo.create`、`todo.update`、`memo.create`。
- `465d0121e` 合 `4d0be2b40`，`2a2f6b0e3` 合 `deaa25b85`。收件箱里外部提议的那一行与 AG15 的重叠，在 AG15 的合并处定了（见 AG15 页尾）。
- `63f202cb1`（接缝修复，协调者决定）：全天的私人活动经 MCP 出去时只有零点的 `starts_at`，没有全天标记；活动和「我去过」的投影都加了 `all_day`，只在为真时出现。

**协调者的决定**（DECISIONS-2026-11-20.md 末节第 2 条）：App 路由对照里「每条只有网页的例外日期必须是 2026-09-27」改成接受任何格式正确、不在未来的日期；AG17 的三页登记为只有网页（2026-11-20，用户批准视觉稿时定）。

**正式站的配置。** 上线时加了环境变量 `ORBIT_MCP_BASE_URL=https://orbitailink.com`；对外的地址就是 `https://orbitailink.com/connect`。

**还没做的：**
- 与真实 Claude 联调：用户 2026-11-20 同意，要用户本人在 Claude 里添加 `https://orbitailink.com/connect`、登录并点同意。
- Codex：接入方式没有核实，不在名单里，所有对外文字只写 Claude。
- 第三方用例集里两处等产品负责人定：带了不认识的字段（例如「已同意」）的提议是拒绝（现在）还是忽略那几个字段，「完成一条待办」要不要能经 MCP 提议；查记录时要不要支持按人筛选。详见 [RELEASE-2.md](../../RELEASE-2.md)。
