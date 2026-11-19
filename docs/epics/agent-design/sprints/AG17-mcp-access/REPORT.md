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
