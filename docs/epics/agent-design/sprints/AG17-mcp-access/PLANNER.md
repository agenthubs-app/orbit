# Sprint AG17 — 外部 Agent 接入（MCP）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R17（设计稿 §5.1「通过 MCP 使用 Orbit」、§5.4）；顺带 AG-R02 的外部出处与 24 小时过期，AG-R19 的门槛用例。
**单一目标:** 新建无状态 MCP 端点和 Orbit 自己的授权服务；四个工具 `search_records`、`get_record`、`propose_change`、`get_proposal` 按授权范围读记录，把外部提议冻结成待确认的卡并返回不透明的确认链接；Web 加授权同意页、确认链接页和连接管理。先用评测里的模拟外部客户端验收全部契约，再与 Claude、Codex 各人工联调一次。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`；编制时 HEAD `324943ad5`，Generator 启动时填实际 HEAD 和各前序 REPORT 的固定 SHA。未启动不填 run。
**进入条件:**
1. AG06 completed（SPRINTS.md 所列依赖）。门槛用例还要用到下列交付，SPRINTS.md 没列为依赖，本页补为进入条件：AG02（`decideAction()`、`expiresAt`、`expired`、`CARD_EXPIRED`、`CARD_CLOSED`）、AG05（读取适配器、字段授权、分页游标）、AG07（Web 确认卡组件，确认链接页复用）、AG15（一次性定时器、收件箱「外部提议」来源；AE-MCP-003 判 `inbox`，AE-MCP-005 用 `scheduler_tick`）。AG15 未完成不启动。与 SPRINTS.md「AG14 与 AG17 可并行」不矛盾，前提是 AG15 已先完成。
2. 设计稿「2026-11-15 已定的事项」即产品批准；§5.4 的传输、授权、四个工具、确认链接、连接管理照做，不再逐项索要。
3. 授权同意页、确认链接页、设置里的连接管理三处网页视觉稿经用户批准。未批准时只做服务端与无界面的测试，界面部分暂停。
4. 付费模型调用已允许，上限见「最小测试与检查」。AG00 的本机评测环境可用（库 `orbit_agent_eval`、端口 3100、对外只放行 DeepSeek 与 Gemini），`npm run agent-eval:env` 自检通过。
5. AG17-5 的后半（与 Claude、Codex 各联调一次）另需：用户授权一个外网可达的地址（本机服务经隧道暴露，或部署到测试服，二选一），并由用户本人在两个客户端里登录 Orbit、点同意。缺这两样时离线部分照常收口，本 sprint 记 blocked，不记 completed。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `docs/superpowers/specs/2026-11-15-orbit-agent-v1-software-design.zh-CN.md`：§5.1 末两段（外部 Agent 只取预览和确认入口）、§5.2「数据已变／权限撤回」与「卡片过期」两行、§5.4 全文、附录 D（`canceled` 含撤权作废，`expired`，`CARD_EXPIRED`、`CARD_CLOSED`）、附录 E「外部连接」行（`agentConnections` 的字段）。
- `docs/epics/agent-design/eval/cases/MCP.yaml` 全部 8 例；`cases/SCL.yaml` 的 AE-SCL-031、AE-SCL-032；`eval/world/base-v1.yaml:151-160`（`conn-claude`、`conn-readonly`）、`regular-v1.yaml:287`（`rconn-claude`）、`large-v1.yaml:352`（`lconn-codex`）：范围名写作 `memos:read`、`todos:read`、`todos:propose`、`contacts:read`、`proposals:read`。
- `docs/epics/agent-design/eval/README.md` §3.1、§3.4：步骤 `mcp`、`mcp_paginate`、`open_link`、`revoke: { connection }`，判定 `mcp_tool_list`、`mcp_result_has`、`mcp_result_excludes`、`mcp_collected`、`http_status`（判最后一次调用）。
- `repos/orbits/proxy.ts`：matcher 是 `/app/:path*`、`/api/:path*`；`/api/*` 没有会话一律回 401 JSON，不带 `WWW-Authenticate`，放行只靠 `isPublicApiPath`；账号删除闸门只对有会话的请求生效。
- `repos/orbits/auth.ts`：NextAuth v5，JWT 会话，无数据库 adapter。它只管 Orbit 自己的登录，不是 OAuth 授权服务器，仓库里也没有授权服务器的代码。
- `repos/orbits/app/api/_shared/authenticated-actor.ts`：会话到规范账号的唯一边界；令牌验证通过后用同一函数换出 actor，不另写一套账号解析。
- `repos/orbits/features/integrations/token-vault.ts`、`oauth-state.ts`：现成的 AES-256-GCM 加密存储与 HMAC 签名 state（Orbit 作为 Google 的客户端），可参照写法，不复用其数据。`features/account/data-rights/handlers.ts:30` 用 `AUTH_URL ?? NEXTAUTH_URL` 作公开地址。
- `repos/orbits/features/auth/app-auth-routing.ts`：`/app/agent`、`/app/settings` 在 `ORBIT_PRIVATE_APP_PREFIXES` 里，未登录由 proxy 带 `next` 跳登录页；确认链接页和同意页放在这两个前缀下即得登录跳转。
- `repos/orbits/app/(app)/app/orbit-2026/account/AccountLayout.tsx`（`menu` 与 `AccountSection`）、`IntegrationsSettings.tsx`（卡片列表与 `ConfirmDialog` 撤销确认）、`settings-copy.ts`；`app/(app)/app/settings/integrations/page.tsx` 是新设置页的样板。
- `repos/orbits/features/agent/runtime/service.ts`、`contract.ts`：账本接口；AG02 扩展后的样子以 AG02 REPORT 为准。
- `repos/orbits/package.json`：没有 MCP SDK，有 `jose`、`zod`、`next` 16.2.9、`next-auth` 5 beta。默认手写最小的 JSON-RPC 处理（`initialize`、`ping`、`tools/list`、`tools/call`），不加依赖；若改用官方 SDK，先核实所选版本支持 2026-07-28 的无状态模式并写进 REPORT。
- `repos/orbits/docs/development/web-no-flash-and-cache-rules.md`：三张新页面按它验收（Web RULES 0.1）。

### 关键符号
本 worktree 没有 GitNexus 索引。Generator 启动时先按根目录 `CLAUDE.md` 建索引，对每个要改的符号跑 upstream impact（CONVENTIONS §5）；建不起来就用文本搜索补查并写进 REPORT。下面的数字是 2026-11-15 文本搜索命中的文件数，含定义所在文件。
- `export const proxy = auth(async (request) => {` 与其中的 `function isPublicApiPath(pathname: string): boolean {`（`proxy.ts`）：全站入口，只有 proxy 自己调用，测试在 `tests/ui/api-auth-proxy-boundary.test.ts`。按 HIGH 对待。
- `export async function resolveAuthenticatedApiActorFromSession(session: AuthenticatedApiSessionIdentity,): Promise<AuthenticatedApiActor | null>`：21 个文件。只调用，不改。
- `export function authenticatedApiActorRequiredResponse(mode: FeatureMode,): Response`：156 个文件。不改；MCP 的 401 另写，因为它不带质询头。
- `proposeAction: (input: AgentActionProposalInput) => Promise<AgentActionRecord>;`（14 个文件）、`cancelAction: (actionId: string) => Promise<AgentActionRecord>;`（5 个文件）：外部提议入账本、撤销时作废未确认的卡，经这里或 AG02 的等价接口。
- `export type AccountSection =`（`AccountLayout.tsx`；`AccountLayout` 被 12 个文件使用）：加一个设置分区。
- 约定名，代码里还没有：AG00 `emitTrace(event)`；AG02 `decideAction()`；AG05 `domains/registry.ts`、`references/authorize.ts`；AG06 `resolveIntents()`、`freezeCard()`。

### 前序交接要点（CONVENTIONS §4 的约定名，启动时按各 REPORT 核对，有出入追加更正）
- AG00：评测命令、对外连接守卫、`emitTrace(event)`。上述 MCP 步骤与判定哪些已在运行器里，以 AG00 REPORT 为准；没有的由本 sprint 接到模拟外部客户端上。
- AG02：`origin` 含外部连接（连接 ID + 外部请求键）、`revision`、`expiresAt`、状态 `expired`、`decideAction()`；决定只认用户交互端的会话。
- AG05：五类记录的 `read`、字段白名单、大小上限与游标；`references/authorize.ts`。
- AG06：`OperationIntent`、`resolveIntents()`、`freezeCard()`；`todo`、`memo` 的 `prepare`、`applyApproved`。
- AG07：Web 确认卡组件、结果文档的客户端读取。AG15：一次性定时器；收件箱新来源「外部提议」。
- AG12、AG13（已完成时）：联系人、私有活动、参会、日程的适配器。没有 `prepare` 的领域，同意页不提供「可提议」。

### 易错边界（都对应到验收项）
1. **质询（AG17-1）。** 无令牌、过期或已撤销：401，`WWW-Authenticate: Bearer resource_metadata="<RFC 9728 元数据地址>"`，响应体没有任何记录内容（AE-MCP-007 R2、R3）。范围不足：403，`error="insufficient_scope"` 并写明缺哪个范围（AE-MCP-001、AE-MCP-006、AE-SCL-031）。proxy 的会话 401 不能先截走这些请求。
2. **令牌只对本服务有效（AG17-1）。** 授权请求带 `resource`，令牌受众绑定 MCP 地址（由 `AUTH_URL` 推出；要新变量就先登记到 CONVENTIONS §2）。别的受众的令牌、网页会话 cookie、Google 集成令牌一律不认，也不向下游转发。刷新令牌每次轮换，旧刷新令牌再用即作废整条连接。撤销要立即生效，所以每次调用都查连接状态，不能只验签名。
3. **客户端登记不连外网（AG17-1）。** 优先客户端编号元数据文档，只放行 Claude、Claude Code、ChatGPT、Codex 的文档；不做动态注册。取文档是对外连接，评测里会被守卫拦下并作废整次运行，所以 `ORBIT_AGENT_EVAL=1` 时读本机录好的副本，生产按白名单地址取，限大小和超时。模拟客户端用 Claude 的文档和回调 `https://claude.ai/api/mcp/auth_callback`，运行器只从跳转里取授权码，不访问该地址。PKCE 缺失或不符一律拒。
4. **协议与来源（AG17-1）。** 按 2026-07-28 版无状态 Streamable HTTP 应答；收到 2025-11-25 版的 `initialize` 握手照常应答；协商到的版本记进调用日志。浏览器来的请求带了白名单外的 `Origin` 就拒绝，防 DNS 重绑定。
5. **清单与标注（AG17-1、AG17-2）。** 清单按已授予范围过滤（`conn-codex` 只见 `search_records`、`get_record`），绕过清单直接调也按范围拒。三个读工具 `readOnlyHint: true`；`propose_change` 标 `readOnlyHint: false`、`destructiveHint: false`、`idempotentHint: true`；四个都带标题和 `openWorldHint: false`。ChatGPT、Codex 把没标只读的工具当写入，读工具漏标就是错。
6. **没有替用户确认的路径（AG17-2）。** 只有四个工具；`propose_change` 参数里带 `approved`、`decision` 一类字段被拒；令牌访问 `/api/agent/ledger/[id]/transition` 得 401；外部声明“用户已同意”不改变卡的状态。
7. **提议的幂等与冻结（AG17-2）。** 幂等键按连接计：同键同内容返回同一个 `proposal_id`（AE-MCP-003 R3），同键不同内容返回冲突。服务端自己读目标现值出差异，不信外部给的旧值；只收已登记 `prepare` 的操作且有对应 `:propose` 范围。卡的出处是外部连接，`expiresAt` 为创建后 24 小时，同时写收件箱一条，写明是哪个客户端提的。
8. **领域名两种写法（AG17-2）。** 用例里 `search_records` 的 `domain` 既有 `todos`、`memos`，也有 `memo`、`contact`；`get_record` 的 `type` 用单数。输入结构要同时接受单复数并映射到同一范围，否则 AE-SCL-031、AE-SCL-032 在参数校验就失败。
9. **确认链接（AG17-3）。** `confirm_url` 只含随机不可猜的编号，放在普通工具结果里；不用协议里仍不稳定的 URL 征询。打开先登录；不是提议所属账号时只显示换账号提示，页面和接口响应里没有记录内容，点击不被接受（AE-MCP-004 R1）。页面按存储的状态重出差异；到期后说明已失效、要由外部 Agent 重新提议（AE-MCP-005）。
10. **结果里不放什么（AG17-4）。** 记忆、完整会话、联系方式不在任何范围：查 `memory`、`conversations` 得到“外部连接不能读这类内容”的说明（AE-MCP-002）；联系人只给姓名、公司、职位、行业、地区这类字段（AE-SCL-032）；笔记不带出关联人的邮箱电话（AE-SCL-031）；他人数据为零；不返回令牌、带登录态的链接、回执以外的账本内容；没有整库导出。记录里的自由文本放进标明是用户数据的字段（AE-MCP-008 R1）。
11. **撤销（AG17-5）。** 撤销后该连接的令牌和刷新令牌在下一次调用即 401；未确认的卡变 `canceled`，再点返回 `CARD_CLOSED`（AE-MCP-007、AE-SCL-032）；已执行的修改和回执保留（AE-MCP-004）。撤销与进行中的 `propose_change` 并发时，不能留下有效的卡。每次调用记录连接、工具、范围和返回条数，并更新上次使用时间。
12. **路由命名。** `app/api/connections/` 已被人脉关系占用，连接管理的接口放 `app/api/agent/` 下。

## 范围与文件

- 读取：上下文包所列；前序 REPORT 只读 AG00、AG02、AG05、AG06、AG07、AG15 的交接段。
- 新建（`repos/orbits/` 下）：
  - `features/agent-v1/mcp/`：`transport.ts`（JSON-RPC、无状态应答、版本协商、`Origin` 校验）；`auth/`（两份元数据、授权码与 PKCE、令牌签发与轮换、客户端文档白名单与评测副本）；`tools/`（四个工具的输入结构、标注与输出投影）；`connections.ts`（`agentConnections` 的增查撤与调用记录）；`confirm-link.ts`（不透明编号与卡的对应）。
  - 端点：MCP 端点与授权端点二选一放法：不在 `/api/` 下；或放在 `app/api/agent/mcp/`、`app/api/agent/oauth/` 并加进 `isPublicApiPath`，由处理器自己验令牌。元数据 `app/.well-known/oauth-protected-resource/`、`app/.well-known/oauth-authorization-server/`。
  - 连接管理接口：`app/api/agent/connections/route.ts`（列出）、`app/api/agent/connections/[id]/route.ts`（撤销）。
  - 页面：同意页 `app/(app)/app/settings/agent-connections/authorize/page.tsx`；连接管理 `app/(app)/app/settings/agent-connections/page.tsx` 与组件 `app/(app)/app/orbit-2026/account/AgentConnectionsSettings.tsx`；确认链接页 `app/(app)/app/agent/proposals/[proposalId]/page.tsx`，用 AG07 的确认卡组件。
  - 评测：`tests/agent-eval/` 下的模拟外部客户端，走发现 → 401 → 元数据 → 授权（用夹具账号的登录会话在同意页勾选范围）→ 换令牌 → 调工具；夹具里的 `connections` 由它按这条产品链路生成，不直接写库。客户端文档的录好副本作为新夹具放 `docs/epics/agent-design/eval/world/`，在 `eval/CHANGES.md` 登记（不改任何用例）。
  - 测试：`tests/agent-v1/mcp/` 下 `auth-challenge.test.ts`、`token-audience.test.ts`、`tools.test.ts`、`propose-confirm.test.ts`、`result-projection.test.ts`、`revoke.test.ts`；`tests/pages/agent-proposal-confirm-page.test.tsx`、`tests/pages/agent-connections-settings.test.tsx`。
- 修改：`proxy.ts` 与 `tests/ui/api-auth-proxy-boundary.test.ts`（只在端点放 `/api/` 下时）；`AccountLayout.tsx`（菜单加一项）、`orbit-2026/copy/account.ts`、`settings-copy.ts`；`shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts`（连接与提议的传输结构）；AG15 未含「外部提议」来源时改 `shared/contract/inbox-notifications.ts`。
- 排除：App 端界面（App 只有同步副本变化；收件箱里的外部提议由 AG15 的两端界面显示）；动态客户端注册；URL 方式的征询；开放记忆、会话、联系方式的范围；ChatGPT 的联调；生产部署、开隧道、push。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG17-1 | 未授权时返回规范要求的质询；令牌只对本服务有效；工具清单按已授予的范围过滤。 | `auth-challenge.test.ts`（无令牌、过期、已撤销得 401 带 `resource_metadata`；范围不足得 403 `insufficient_scope`；proxy 不截；`Origin` 校验；2025-11-25 握手）；`token-audience.test.ts`（他受众令牌、会话 cookie、Google 令牌被拒；刷新轮换与重用作废；PKCE；白名单外的客户端文档被拒，评测里零对外连接）；`tools.test.ts` 的清单过滤；门槛 AE-MCP-006、AE-MCP-007、AE-SCL-031 |
| AG17-2 | 四个工具按设计稿 §5.4 工作；没有任何工具能替用户确认。 | `tools.test.ts`（四个工具的输入输出、标注、单复数领域名、分页游标）；`propose-confirm.test.ts`（同键同内容同编号、异内容冲突；带批准字段被拒；令牌调决定接口 401；点击前零写入）；门槛 AE-MCP-001、AE-MCP-003、AE-MCP-006 |
| AG17-3 | 提议返回的链接不带登录态和用户数据；打开后要登录并核对账号；24 小时后失效。 | `propose-confirm.test.ts`（链接只含不透明编号；未登录跳登录；他人账号零内容、点击不被接受；到期 `CARD_EXPIRED`）；`agent-proposal-confirm-page.test.tsx`；门槛 AE-MCP-003、AE-MCP-004、AE-MCP-005；确认链接页与同意页 1440／375 截图，按不闪动规则在本地生产构建上逐帧测量 |
| AG17-4 | 工具结果里没有授权范围外的字段、他人数据、记忆、联系方式。 | `result-projection.test.ts`（每类记录的输出字段白名单；记忆、会话查询被拒；自由文本标为用户数据；不含令牌和带登录态的链接）；门槛 AE-MCP-001、AE-MCP-002、AE-MCP-008、AE-SCL-031、AE-SCL-032 的 `mcp_result_excludes` 全过 |
| AG17-5 | 撤销连接后令牌立即失效，没确认的提议作废；先用模拟客户端验收，再与 Codex、Claude 各联调一次。 | `revoke.test.ts`（撤销后下一次调用 401；未确认的卡 `canceled`、点击得 `CARD_CLOSED`；已执行的保留；与提议并发）；`agent-connections-settings.test.tsx`；门槛 AE-MCP-004、AE-MCP-007、AE-SCL-032；连接管理页 1440／375 截图；**人工联调·Claude**、**人工联调·Codex** 两份单独记录（见下） |

## 一次 Generator 的执行顺序

1. 核对进入条件，读 AG00、AG02、AG05、AG06、AG07、AG15 的交接段，按 REPORT 更正上下文包并追加记录；登记 run-01、Planner SHA256、HEAD、门槛用例与夹具的校验值；建 GitNexus 索引，对 `proxy`、`isPublicApiPath`、`AccountSection` 与账本的提议、作废接口跑 upstream impact，HIGH/CRITICAL 先报告。
2. 先写失败测试：质询与 403、令牌受众、清单过滤、四个工具的契约、结果投影、撤销。
3. 授权服务与端点：元数据、PKCE 授权码、令牌与轮换、客户端文档白名单与评测副本、`agentConnections`、无状态端点、proxy 放行；四个工具接 AG05 读取、AG06 冻结、AG02 出处与过期、AG15 收件箱与定时器。
4. 三张网页（视觉稿已批准才做）：同意页、确认链接页、连接管理；不闪动测量与 1440／375 截图。
5. 接模拟外部客户端与运行器步骤，跑门槛、两份独立评审、`agent-eval:report` 登记 RUNS.md；不过就修，整套重跑，最多两个修复轮次。
6. 全量基线对照，路径限定提交，写 REPORT。用户授权地址并在客户端里点同意后，逐个客户端做人工联调，结果追加进 REPORT。

## 最小测试与检查

- **档位 H。** 身份、授权、令牌、新的写入入口和共享契约都在变（Web RULES 5.1），proxy 是全站入口。
- **开发定向集**（cwd `repos/orbits`）：`tests/agent-v1/mcp/*.test.ts`、两个新页面测试；proxy 的既有消费者 `tests/ui/api-auth-proxy-boundary.test.ts`、`tests/ui/maintenance-proxy-integration.test.ts`、`tests/ui/profile-onboarding-proxy.test.ts`、`tests/pages/session-revocation-auth-integration.test.ts`；`tests/api/agent-action-ledger-routes.test.ts`（决定接口不认令牌）。
- **收口集**：上面各完整文件，加 impact 列出的 AG02、AG06、AG15 测试消费者，`npx tsc --noEmit -p .`。改了 `shared/` 就在同一提交里于 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts` 与 App 的 `npm run typecheck`。
- **门槛**：先 `npm run agent-eval:check`、`npm run agent-eval:env`，再 `npm run agent-eval:run -- --gate AG17`。包含 MCP 区 8 例（AE-MCP-001～008，小账号）、SCL 的 AE-SCL-031（常规账号）与 AE-SCL-032（较大账号）、不变量包；三个账号都在内。
- **评审**：门槛里每例由两个互不相见的新 Claude 会话各评一次（`npm run agent-eval:judge-pack -- --run <运行编号>`），不一致做第三次并列人工复核；`npm run agent-eval:report -- --run <运行编号>` 给出 RUNS.md 的一行。
- **全量**：H 档在本地代码收口跑一次 `npm test`，按 Web RULES 5.2 与基线比失败清单，只查新增项；暂存基线用带唯一标签的 `git stash push -u -m <标签> -- <路径>` 并按 SHA 恢复（stash 栈与其他工作树共享）；不 source `.env`；数据库测试前跑 `node scripts/assert-local-test-databases.mjs`。
- **费用**：真实模型调用只来自 AE-MCP-002、AE-MCP-008 的对话步骤和不变量包；每次完整运行 30 元以内，本 sprint 累计 150 元以内，超出先停下报告；REPORT 记次数与 token。
- **证据**：截图、命令输出、人工联调记录放 `~/orbit-sprint-evidence/agent-design/sprint-AG17/run-01/`，不留令牌和 cookie；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **人工联调（两项，各自单列，需要用户授权）**：本机测试环境只在本机、对外只连两家模型，外部客户端连不进来，所以要一个外网可达的地址（隧道或测试服），这一步不算评测运行。用户本人在 Claude（自定义连接器）和 Codex 里登录 Orbit 并点同意，任何工具都不能替用户完成。每个客户端走一遍：登记方式 → 401 质询 → 回调地址 → 授权 → 协商到的协议版本 → 列工具 → 读 → `propose_change`（客户端是否提示）→ 链接怎样显示 → 打开确认 → `get_proposal` 回执 → 令牌刷新 → 范围升级 → 撤销 → 再调得 401。只用专门的测试账号，不用真实用户数据。
- **不运行**：App 全量（App 只有同步副本变化，已由四个同步测试与 typecheck 覆盖）；封存集（留给 AG18）；ChatGPT 联调（设计稿只要求 Codex 与 Claude）。

## 失败与交接

外部条件缺失（前序未完成、视觉稿未批准）先不启动或只暂停对应部分。run 开始后门槛不过，修复后整套重跑，最多两个修复轮次，仍不过如实结束为 failed，不降低验收条件。人工联调缺授权时，离线部分照常收口、提交、写 REPORT，状态记 blocked（只差两项人工联调）；授权到位后在同一 run 里补做并追加记录，不开第二个 Generator。
分支：从 `orbit-agent-claude` 建 `sprint/AG17-mcp-access`，路径限定提交（禁止 `git add .`／`git add -A`），提交前 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`。交接列本线分支和固定最终 SHA，由协调者 `--no-ff` 合回 `orbit-agent-claude`，在合并树跑收口集与 typecheck 后才登记 completed。REPORT 含验收映射、SHA、命令与退出码、RUNS.md 行、费用、两份人工联调记录、未完成项。push、部署、开隧道都需要用户单独授权。

## 进入条件核对（2026-11-19，追加记录；原文不改，原文 SHA-256 `0a70ea00f9d41ec9c63759486431cef6d65b6236d4142abb9d02e1017f8f2b6f`）

协调者 2026-11-19 核对并交给本 run（run-01，线 `ag17`，分支 `sprint/AG17-mcp-access`，基线 HEAD `98869bb4c`，集成线 `agent-v1-integration`）：

1. AG02、AG05、AG06、AG07 已完成并合并，AG08～AG13 也是。
2. **AG15（定时任务、一次性定时器、收件箱）与本 sprint 并行，不在前面。** 本 PLANNER 用它两处：收件箱里来源为「外部提议」的一条（AE-MCP-003 判 `inbox`）、由一次性定时器到点标过期（AE-MCP-005 用 `scheduler_tick`）。这两处做成小接缝（`features/agent-v1/mcp/confirm-link.ts` 的 `ProposalSeams`，接线处 `configured.ts` 的 `PROPOSAL_SEAMS`）；过期在打开链接和点击确认时都按存储的 `expiresAt` 判，没有定时器也不会执行过期的卡。AE-MCP-003、AE-MCP-005 在协调者合并 AG15、接上接缝之前保持不过，不为它们开修复轮。
3. **三张网页（同意页、确认链接页、设置里的连接管理）的视觉稿还没批准。** 先做服务端和不需要页面的测试；确认链接页的卡片沿用 Web 确认卡组件；页面布局等协调者送来批准的视觉稿。
4. 与 Claude、Codex 的真实联调需要用户另外授权并本人登录，本 run 不做，记为未完成。
5. 并行的其他线：AG14 记忆（MCP 不得返回记忆，加一条记忆出现后仍能抓住的测试）、AG15、AG19。

### 上下文包更正（按前序 REPORT 与实际代码）

- 「本 worktree 没有 GitNexus 索引」：已用 `gnx.sh ag17 analyze --index-only` 建好，影响分析结果见 REPORT。
- `freezeCard()` 在 `features/agent/runtime/service.ts`（AG02），不在 `propose/`；它固定给 7 天有效期，本 sprint 加了按出处取有效期（外部连接 24 小时）。
- 账本按账号分库（`<工作区>:agent-actor:<账号>`），所以别的账号即使拿到卡的编号也读不到这张卡；确认链接页另用提议编号核对账号。
- 评测端口与库：本线用 3190 起的端口和 `orbit_agent_eval_ag17`（line-brief），不是 3100／3110 和 `orbit_agent_eval`。
- MCP 规范 2026-07-28 版已发布，启动时读了传输、版本、授权、客户端登记四页：没有 `initialize` 握手，每个请求在 `_meta` 和 `MCP-Protocol-Version` 头里带版本，另有 `Mcp-Method`、`Mcp-Name` 两个镜像头，头与正文不一致回 400（`-32020`），版本不支持回 400（`-32022`）并列出支持的版本，必须实现 `server/discover`，GET／DELETE 回 405。端点按此实现，并照旧应答 2025-11-25 版的 `initialize`。
- 客户端身份文档：Claude 是 `https://claude.ai/oauth/mcp-oauth-client-metadata`（回调 `https://claude.ai/api/mcp/auth_callback`），Claude Code 是 `https://claude.ai/oauth/claude-code-client-metadata`（本机回调，端口任意）。ChatGPT、Codex 的登记方式没有查到可核实的文档地址，留到真实联调时核实后再加进名单。
