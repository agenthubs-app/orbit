# Sprint AG00 — 本机环境、评测底座与基线

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R19（离线 Agent 用例、完整日志、Claude 评审）；为 AG-R20 交出 `emitTrace(event)`。
**单一目标:** 把 [评测规范](../../eval/README.md) 落成可运行的代码：本机隔离环境（库 `orbit_agent_eval`、端口 3100 的服务、本机存储与日志目录）、只放行 DeepSeek 与 Gemini 的对外连接守卫、经产品写入链路生成的三账号数据与快照、从正常入口驱动的运行器、逐事件日志、代码判定、评审材料与汇总、费用与余额记录；用现有 Agent 跑一次全部可见用例作为基线。不改 Agent 行为。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`（开工时填实际 HEAD）。无前序 REPORT。编制时 `docs/epics/` 与设计稿在工作树里是未跟踪文件。
**进入条件:**
1. 依赖：无（登记表 AG00 依赖为 —）。设计稿「2026-11-15 已定的事项」的“评测方式”一行即产品批准。
2. 协调者已把 `docs/epics/agent-design/` 与设计稿提交到 `orbit-agent-claude`；否则用例与夹具的校验值对不上提交号，Generator 也不得把它们带进 Sprint 提交。
3. 付费模型调用：调用本身用户已允许；上限按 EPIC「等你决定」的建议执行（每次完整运行 30 元以内，本 sprint 累计 150 元以内），用户另有决定以用户为准。
4. 环境：本机 Postgres 可建库（`/opt/homebrew/bin` 下有 `createdb`、`psql`、`pg_dump`、`pg_restore`）；`repos/orbits` 需先 `npm ci`（本 worktree 没有 `node_modules`）；`DEEPSEEK_API_KEY`、`AUTH_SECRET` 由用户放进不入库的环境文件（本 worktree 的 `repos/orbits` 下没有 `.env`／`.env.local`）；`npm test` 用的本机测试库另配，不是 `orbit_agent_eval`。
5. 3100 端口空闲。现有 `scripts/local-stack.mjs` 的默认端口也是 3100（`STACK_PORT`），两者不能同时开。
6. 无界面改动，不需要视觉稿。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `docs/epics/agent-design/eval/README.md` 全文：本 sprint 就是把它变成代码；§3.1、§3.2、§3.4 的步骤词和判定词是校验器的白名单，§4 是运行目录的文件清单，§10、§13 是环境与费用规则。
- `eval/judge-prompt.md`：评审材料与 `judge-N.json` 的结构。`eval/RUNS.md`：台账列。`eval/CHANGES.md`：改用例必须先登记。
- `eval/cases/H.yaml`：门槛 8 例，自检词 `use_fake_agent`（四种缺陷）、`egress_probe`，判定词 `trace_complete`、`expect_hard_fail`、`expect_judge_verdicts`、`egress`、`event_sources`、`summary_separates_simulated`、`costs_complete`。
- `eval/world/base-v1.yaml`、`regular-v1.yaml`（`bulk.seed: 261115`）、`large-v1.yaml`：锚点记录、批量规则、干扰、已有对话、联网回放。
- `repos/orbits/scripts/local-stack.mjs`：已有的本机栈。`isLocalDatabaseUrl`、`buildStackEnv`（把四个库地址钉到 `ORBIT_LOCAL_DATABASE_URL`、拒绝 `VERCEL_ENV=production`）、`servicesFor(port)` 可复用；它把日志写在仓库内的 `build/local-stack/`，评测日志不能沿用这个位置。
- `scripts/assert-local-test-databases.mjs`、`scripts/lib/verify-database-target.ts`：本机库断言；后者是“host＋库名＋workspace”三重断言的先例。
- `shared/storage/live-database-config.ts`：`ORBIT_DATABASE_TARGET=local` 时只认 `ORBIT_LOCAL_DATABASE_URL` 与 `ORBIT_LOCAL_WORKSPACE_ID`；一个服务进程只有一个工作区（:56–59）。
- `shared/storage/configured-live-record-store.ts`、`shared/storage/transactional-postgres.ts`：产品读写经过的存储层，`read.*`／`db.write` 埋点的候选位置。
- `tests/support/deny-network-preload.cjs`：现成的“全部拒绝”网络守卫（patch `net`、`tls`、`http(s)`、`dns`、`fetch`、`undici`），对外守卫照它改成两处放行并记录。
- `scripts/test-paid-ai-boundary.mjs`、`scripts/run-node-tests.mjs`：`npm test` 拦下 `api.deepseek.com` 等主机；评测代码自己的单元测试同样不得发真实调用。
- `features/orbit-ai/gemini-provider.ts:19–26`：模型接口地址与默认调用名（现为 `deepseek-v4-flash`，改名属 AG03）；调用走全局 `fetch`（:1327），所以服务进程里的预加载层能在不改 Agent 的前提下记下请求与响应、注入模型故障。
- `app/api/ai/conversations/route.ts`：运行器发消息的入口（`protocolVersion: 2`，:653）；`app/api/ai/conversations/sessions/[id]/handler.ts:260–279` 按 `requestId` 读回发送记录；`app/api/agent/ledger/[id]/transition/route.ts`：点按钮的入口。
- `scripts/verify-session-cookie.ts`：用 `next-auth/jwt` 的 `encode` 签会话 Cookie（RULES 5.4）；App 端也是带 Cookie 调用（`repos/orbit-app/src/api/client.ts` 的 `authCookieHeader`），经 `app/api/auth/mobile/credentials` 取得。
- `scripts/lib/primary-test-account.ts`：建账号走 `ensureAccountForUser`。
- `features/agent/runtime/service-factory.ts:123`：只有 `VERCEL=1` 时才走 `@vercel/queue`，本机在确认请求里直接处理出队。
- `features/agent/evaluation/`：只有 `DESIGN.md` 和 `functional-test-report.ts`，是 `/dev/agent-test-report` 的旧验收报告，与本评测无关，不复用、不改。

### 关键符号
本 worktree 没有 GitNexus 索引（根目录和 `repos/orbits` 下都没有 `.gitnexus`）。Generator 开工先按根 `CLAUDE.md` 建索引，对每个要改的符号做 upstream impact；建不起来就用文本搜索补查并在 REPORT 写明（CONVENTIONS §5）。下列调用方数是编制时的文本搜索（含定义文件）。
- `export function createPostgresLiveRecordStore<`（`shared/storage/postgres-live-record-store.ts:347`）：195 个文件引用，其中测试 135 个，预计 CRITICAL。尽量不在这里埋点。
- `export function createConfiguredPostgresLiveRecordStore<`（`configured-live-record-store.ts:202`）：136 个文件，测试 15 个。
- `export function resolveLiveDatabaseConnectionConfig(`（`live-database-config.ts:28`）：71 个文件，测试 12 个；只读，不改。
- `export function buildStackEnv(processEnv = process.env, files = readEnvFiles(), options = {}) {`（`local-stack.mjs:98`）：2 个文件；只调用，不改。
- `async proposeAction(input) {`（`features/agent/runtime/service.ts:540`）、`processOutbox`（接口 :91）：`card.frozen`／`exec.*` 的候选埋点；`proposeAction` 16 个文件、`processOutbox` 24 个文件。

### 前序交接要点
无前序。本 sprint 按 CONVENTIONS §4 交出：`agent-eval:*` 六条命令；本机库快照；`features/agent-v1/observability/trace.ts` 的 `emitTrace(event)`；对外连接守卫；基线运行。名字一经交出，后续 sprint 照用。

### 易错边界（都对应到下方验收项）
1. **不改 Agent 行为**（AG00-3）：`emitTrace` 只在设了 `ORBIT_AGENT_TRACE_DIR` 时落盘，写失败只吞掉并计数，不影响产品返回；守卫、固定时钟、模型故障注入、联网回放、`egress_probe` 都放在只由 `agent-eval:env` 经 `NODE_OPTIONS=--require` 加载的预加载里，生产构建里不存在。以后需要进产品代码的评测钩子，只在 `ORBIT_AGENT_EVAL=1` 时装上，`VERCEL_ENV=production` 时拒绝启动。
2. **两个来源不能同源**（AG00-4）：`db.write` 由产品写入层自己报；`db-diff.json` 由运行前后两次快照比较算出。H-004 的“悄悄写”只在两者对不上时才抓得到，所以不能用数据库触发器去生成 `db.write`。
3. **只在本机**（AG00-2）：库名必须是 `orbit_agent_eval`、host 必须是本机，不连日常开发的 `orbit_events`；`VERCEL` 必须未设；设 `NEXT_TELEMETRY_DISABLED=1`，否则 Next 的遥测会被拦下、整次作废；文件存储指到评测目录：账号导出用 `ORBIT_LOCAL_EXPORT_STORAGE_DIR`，批量名片图片用 `ORBIT_BATCH_UPLOAD_DIR`（缺省是相对 cwd 的 `.orbit-batch-uploads`，会落进仓库），不设 `ORBIT_BATCH_IMAGE_STORAGE=private-blob`（`features/acquisition/storage/business-card-private-blob-store.ts:49–53`）；其余走 `@vercel/blob` 的路径碰到就被拦下，在 REPORT 列明；端口被占就拒绝启动，不复用别的服务。
4. **夹具走产品写入链路**（AG00-2）：用笔记、待办、日程、联系人、活动、记忆、规则、会话等领域服务的写入函数生成。现有 seed 脚本直接 `upsertRecord`（如 `scripts/seed-account-agent-pressure-fixtures.ts:321`），不能当夹具路径。
5. **工作区与账号**（AG00-2）：夹具写的是每个账号各有工作区（W1、W2…），而产品一个服务进程只认一个工作区。按“同一个评测工作区、按账号隔离”装载，在 REPORT 写明这个对应；若要求真正分开的工作区，需要用户决定。
6. **日志无密钥**（AG00-3）：落盘前去掉 `Authorization`、`Cookie`、查余额用的凭据；合成数据的提示和返回照原文记。
7. **真实、模拟、回放分开**（AG00-3）：模型、判断、联网、执行四类事件都带 `source`；注入的故障不发到 DeepSeek、不计费；`costs.json` 的真实次数和 token 与日志里标 `real` 的加总一致。
8. **封存集不打开**（AG00-1）：校验器和运行器默认跳过 `cases/sealed/`，只有显式 `--sealed` 才读；本 sprint 不运行 `--sealed`。
9. **判不了就不算过**（AG00-5）：现有系统还产生不了证据的判定（例如 `part_plan` 需要 AG03 的节点日志），以及现有产品执行不了的步骤（`mcp`、`regenerate`、`review` 等），记为“无法判定”或“步骤不受支持”，按不通过计并列出原因，运行继续。
10. **评审不调 API**（AG00-4）：运行器只产出评审材料；评审由新开的 Claude 会话完成，`agent-eval:report` 只汇总。

## 范围与文件

- 读取：上面的必读文件；`eval/cases/` 下 21 个可见区文件（只取标题与判定，不改）。
- 修改：`repos/orbits/package.json`（六条 `agent-eval:*` 命令；YAML 解析器加为直接依赖，`package-lock.json` 里的 `js-yaml` 4.2.0 只是传递依赖）；埋点处按 impact 结果选定，候选 `shared/storage/configured-live-record-store.ts`、`shared/storage/transactional-postgres.ts`、`features/agent/runtime/service.ts` 的 `proposeAction` 与 `processOutbox`；若只能落在 CRITICAL 的 `createPostgresLiveRecordStore`，先报告再改；`docs/epics/agent-design/eval/RUNS.md`（只追加）。
- 新建：`repos/orbits/features/agent-v1/observability/trace.ts`（`emitTrace(event)` 与事件类型）；`repos/orbits/tests/agent-eval/`（用例与夹具装载、校验器、批量生成器、经领域服务的数据生成、快照与恢复、客户端模拟与运行器、假实现、代码判定、评审材料、汇总、价格表与费用、`preload/` 下的守卫、固定时钟、模型记录与故障、联网回放）及其 `*.test.ts`；`repos/orbits/scripts/agent-eval/` 下六条命令的入口。评测目录在所有仓库之外：`~/orbit-sprint-evidence/agent-eval/runs/`（运行）与 `~/orbit-sprint-evidence/agent-eval/env/`（`storage/`、`snapshots/`、服务日志）。
- 排除：Agent 的提示词、步骤、模型名默认值；`features/agent/evaluation/`；`cases/sealed/`；`local-stack.mjs` 的行为；`repos/orbit-app`；`shared/contract` 等共享契约；生产库、部署、push。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| AG00-1 | 校验器拒绝不合规的用例和引用了不存在记录的用例，并指出是哪一条。 | `tests/agent-eval/case-checker.test.ts`：缺字段、未定义的步骤词或判定词、引用夹具里没有的编号（如 `T99`）、不存在的 `patches`、`sprint` 与区不符、`sealed/` 默认不读，各报出用例编号与字段；`npm run agent-eval:check` 对 21 个可见区文件的通过输出存证据目录。 |
| AG00-2 | 数据库、应用服务、存储和日志都在本机专用的一份里；运行期间除 DeepSeek 与 Gemini 外的对外连接被拦下并记录；三个账号的数据量与夹具规定一致，可从快照恢复到相同起点。 | `tests/agent-eval/env-guard.test.ts`（远程地址、错库名、3000 端口、`VERCEL_ENV=production` 都拒绝启动）、`egress-guard.test.ts`（两处放行，其他拦下并写 `egress.blocked`）、`world-generator.test.ts`（同种子两次逐条相同）；门槛里 AE-H-006 的单独运行；`env.json`；三账号数据量对照表，以及两次恢复后 `world-before.json` 校验值相同。 |
| AG00-3 | 一次运行从产品的正常入口执行，产出规范里的全部文件。抽三例核对：每次模型请求与响应、每次读取和写入、每张卡片都在日志里，没有密钥；真实调用与模拟分开计数；费用和 DeepSeek 余额有记录。 | 门槛运行里 AE-H-001、AE-H-007、AE-H-008；`tests/agent-eval/trace.test.ts`（未设 `ORBIT_AGENT_TRACE_DIR` 时不写文件、不抛错；写失败不改变返回）；三例人工核对表与全文密钥扫描结果存证据目录。 |
| AG00-4 | 判定可信：注入“未点击就写入”“读了另一个账号”的假实现时，代码判定把对应用例判为不通过；评审逐条引用日志序号，两次独立评审不一致的条目被标出。 | 门槛运行里 AE-H-002、AE-H-003、AE-H-004、AE-H-005；`tests/agent-eval/hard-checks.test.ts`（每个已实现判定用夹具日志各测一次过与不过）；`tests/agent-eval/report.test.ts`（缺证据序号的评审被拒，两评不一致列入人工复核清单）。 |
| AG00-5 | 用现有 Agent 把全部可见用例跑一遍，登记为基线。 | 一次 `--all` 运行目录（AE-H-006 另跑）；`RUNS.md` 第一行；`report.md` 逐区通过数、“无法判定”与“步骤不受支持”清单。 |

## 一次 Generator 的执行顺序

1. 复核进入条件；登记 run-01、本 PLANNER 的 SHA256 与 HEAD；从 `orbit-agent-claude` 建 `sprint/AG00-eval-foundation`；`npm ci`；建 GitNexus 索引；动手前跑一次 `npm test` 存失败清单作基线。
2. AG00-1：先写校验器的失败测试，再实现用例与夹具装载和 `agent-eval:check`。
3. AG00-2：`agent-eval:env`（建库、迁移、预加载、3100 服务、自检写 `env.json`）；批量生成器与 `agent-eval:seed`（经领域服务写入、存快照、按快照恢复）。
4. AG00-3：对埋点符号做 impact 后接 `emitTrace`；运行器扮演 Web 与 App 两端，产出 §4 全部文件；价格表、费用与运行前后的 DeepSeek 余额。
5. AG00-4：代码判定、四种假实现、`agent-eval:judge-pack`、`agent-eval:report`；跑 `--gate AG00`（AE-H-006 单独一次）；两个新会话分别评审，汇总。
6. AG00-5 与收口：跑 `--all` 并评审、登记 `RUNS.md`；全量对照；`detect-changes --scope staged`；按操作链路径限定提交；写 REPORT 交接。

## 最小测试与检查

- **档位 H**：新增对外守卫、在共享存储层埋点、付费模型调用。收口跑一次全量对照（RULES 1.1、5.1）。
- **开发定向集**（cwd `repos/orbits`）：`tests/agent-eval/*.test.ts`（新增）；埋点相关的 `tests/storage/configured-live-record-store.test.ts`、`tests/storage/live-database-target.test.ts`、`tests/architecture/local-test-database-boundary.test.ts`。
- **操作链收口集**：上面全部，加 impact 指出的直接消费者测试；`npx tsc --noEmit -p .`。不改 `shared/contract` 等四个共享目录，不需要 App 同步。
- **全量对照**：第 1 步的失败清单与收口时 `npm test` 的清单用 `comm -13` 比较，只查新增项；不 source `.env` 系列文件。基线在改动前直接跑，不用 RULES 5.2 的 stash 步骤（本机 stash 栈与其他会话共用）。
- **门槛命令**：`npm run agent-eval:run -- --gate AG00`，含 H 区 8 例；AG00 没有分到 SCL 用例；不变量包从 AG02 起才进门槛。AE-H-006 单独一次运行，作废标记是它的期望结果，汇总时并入门槛结论。
- **门槛组成的未决处**：不变量包里有属于更后面 sprint 的用例（例如 AE-WEB-003 属 AG09、AE-MCP-001 属 AG17），它们的功能性判定在早期 sprint 不可能通过。运行器把不变量包的结论分两栏列出：四类不变量判定（越权读取、未批准或重复写入、跨账号记忆、已忘记条目再用）与其余判定；门槛怎样计入由协调者裁决，在 AG02 开工前写进 CONVENTIONS。
- **评审**：门槛用例每例由两个互不相见的 Claude 会话各评一次，不一致的做第三次并列入人工复核清单；基线运行按规范 §5 的全量规则单评，代码判定已不通过的用例照样出评审材料，可分批评。
- **费用**：门槛运行与基线运行各不超过 30 元，本 sprint 累计不超过 150 元；超出先停下报告。每次真实调用的次数与 token 记进 REPORT。
- **证据位置**：`~/orbit-sprint-evidence/agent-design/sprint-AG00/run-01/`（命令输出、核对表）；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/<运行编号>/`；仓库里只在 `RUNS.md` 登记摘要与 `bundle.sha256`。
- **不运行**：`--sealed`；浏览器验证（没有界面改动，RULES 0.1 不适用）；App 端测试（App 不动）。

## 失败与交接

外部条件缺失（密钥、Postgres、端口、文档未提交、费用上限未获认可）先不启动；run 已开始则按规则产出 failed／blocked 报告。门槛不过时最多两个修复轮次，每轮都把门槛整套重跑（规范 §6），每次运行都登记 `RUNS.md`，不挑结果。
REPORT 包含：验收项对应的提交 SHA、文件与证据；命令与退出码；全量对照新增失败；门槛与基线的运行编号、`bundle.sha256`、真实调用次数、token 与费用；工作区对应方式与仍走托管存储的路径；未完成项与下一步。分支 `sprint/AG00-eval-foundation`，固定最终 SHA，由协调者 `--no-ff` 合回 `orbit-agent-claude`，在合并树上跑 `tests/agent-eval/`、`npx tsc --noEmit -p .` 和 `npm run agent-eval:check` 后才标 completed。push 需要用户另行授权。
