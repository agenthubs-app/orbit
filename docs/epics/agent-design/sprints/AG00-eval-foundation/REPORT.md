# Sprint AG00 — 执行总结

> Generator 的工具不允许子 agent 写这个文件，内容由 Generator 交回，协调者原样入库（只把转义的尖括号还原，并把交接要点译成中文放在文末）。

## 结果
- 已验证能做到：一条命令（`npm run agent-eval:env`）建好本机库 `orbit_agent_eval`、在 127.0.0.1:3110 起生产构建服务并自检（19 项）。服务进程只连得上 DeepSeek、Gemini 模型接口和本机，其余连接（含 DNS）被拦并记 `egress.blocked`，整次运行作废。小／常规／较大三个世界经产品写入服务生成、各存一份 pg_dump 快照，数据量与夹具逐项一致，每例从快照恢复（同一运行三次恢复的 world-before digest 相同 `8ec69f92…`）。运行器扮演 Web／App 从正常入口发消息、点卡，产出 §4 全部文件；模型请求／响应、读写、卡片进日志，无密钥；真实、模拟、回放分开计数；费用与 DeepSeek 余额有记录。四种假实现的前三种被代码判定抓住，第四种交评审。现有 Agent 跑完 221 个可见用例作基线。
- 仍未实现：现有产品没有的夹具字段（私有活动、参会自述、外部连接、预置卡片、推送设备、Memo 往来字段、记忆适用范围与版本、联系人别名与版本、待办多值关联、正式跟进阶段、“已参加”）列在 `~/orbit-sprint-evidence/agent-eval/env/snapshots/<world>.seed.json` 的 gaps 里，不硬造。现有系统给不出证据的判定和做不了的步骤记为「无法判定」／「步骤不受支持」，按不通过计。

## 运行记录
- 结果：门槛等待评审（代码判定 8/8）。Generator Claude Opus 5.5，2026-11-15；Planner rev 1，SHA-256 2abf2782202849bcc1b187bc7af2e907c3910bdb9792e2958442e4ee680331a0；基线 HEAD 85eb50434。
- 分支 sprint/AG00-eval-foundation：295277cc0（AG00-1）、9ee7926b8（AG00-2..4 与产品埋点）、1bc33da3b（被拦连接按用例归属）、9f01d3218（换世界不关共享连接池；单例出错不中断运行）。合并：等待协调者。档位 H。push 无。
- 门槛：20261115-191200-1bc33da-AG00-gate（7 例 7/7，真实 5／模拟 1，0.0089 元）；20261115-191228-1bc33da-AG00-gate-AE-H-006（1/1，作废为期望结果，0.0008 元）。
- 基线：20261115-193948-9f01d32-baseline（221 例，代码判定通过 10；真实 573／模拟 7；输入 2,325,116（缓存命中 2,040,064）／输出 275,586 token；1.4282 元；余额 60.52→59.14）。第一次基线运行（20261115-191244-1bc33da-baseline，停在第 146 例，运行器缺陷，无 summary）已作废。
- 全量对照：开工前 26 失败，收口 26 失败，新增 0（npm-test-*.txt）。
- 付费调用合计：DeepSeek 真实约 590 次（含开发运行），约 1.5 元；Gemini 0。

- 评审（协调者补记）：两次门槛运行各例由两个互不相见的 Claude 会话评审，结论一致，门槛 8/8 通过（AE-H-005 两次都把 R2 判为不通过，与用例期望一致）。基线中代码判定通过的 10 例单评：7 过，AE-BND-001、AE-EVT-004、AE-WEB-002 不过；基线结论 7/221，不变量违规 66 例。三行已登记 RUNS.md。协调者复核：agent-eval:check 0 问题、tests/agent-eval 59/59、typecheck:app 通过、三个运行目录中检索两个密钥 0 命中、评测环境文件不入库且无远程地址。

## 验收结果
| SC | 结果 | 证据 |
|---|---|---|
| AG00-1 | pass | case-checker.test.ts、vocabulary.test.ts；agent-eval:check：21 文件 222 例 0 问题、世界事实 0 问题 |
| AG00-2 | pass（待评审） | env-guard／egress-guard／world-generator 测试；env.json；三账号数据量（甲 8/10/6/2…；丙 300/400/120/80/12/1/15/25；丁 3000/5000/1500/800/40/1/120/200；平台活动 7/60/600）；AE-H-006；world-before digest 一致 |
| AG00-3 | pass（待评审） | H-001/007/008；trace.test.ts；trace-audit-3-cases.md；secret-scan-gate.txt／secret-scan-baseline.txt 0 命中 |
| AG00-4 | 代码判定部分 pass，评审部分待评审 | H-002/003/004（expect_hard_fail 判对）；hard-checks.test.ts；report.test.ts |
| AG00-5 | 运行完成，待评审后登记 RUNS.md | 基线运行目录与 report.md |

## 与 PLANNER 不同（CONVENTIONS／SPRINTS 优先）
1. 端口 3110（CONVENTIONS §2），3000／3100 拒绝。
2. 三个世界三份快照：平台活动工作区共享，同库会让小账号看到 667 场活动。账号乙同一用户编号；全部在 workspace:agent-eval，按账号隔离。
3. db.write／read.* 在服务进程的 pg 驱动层观察（预加载），未改 configured-live-record-store／transactional-postgres：五十多处写入直接写 SQL，存储层埋点会漏。不是触发器；绕过服务的写入只在 db-diff 出现。emitTrace 用于 card.frozen／card.decision／exec.*（proposeAction、processOutbox、草稿提议／确认／取消）。
4. 锚定时钟：每例拨到用例时钟后随真实时间走，advance_clock 推进；TZ=Asia/Tokyo；Postgres now() 仍为真实时间。
5. 种子用产品函数：联系人 initializeAcquiredRelationship（含关系与证据），笔记、待办、日程、记忆、规则、会话用领域服务，平台活动用主办方 create+publish，报名用 seedCanonicalRegistration；正式跟进写成关系类待办，“已参加”存为已报名。
6. 故障点：model／understand 在预加载，executor 经 takeEvalFault("executor")；judgment、web 有接口但现有产品无调用方。
7. 现有 Agent 的引用取 artifacts／provenance.evidenceIds 中的夹具编号；追问取 routingDecision.intent=clarification；委托取 orbit_agent_chat_requests 记录。
8. --seed-cards 属 AG02，现在明确报错。

## 影响分析
索引用 `npx gitnexus@latest analyze --index-only` 建（run.cjs 版本读不了，存储版本 40 对 42，后续一律用 npx gitnexus@latest）。proposeAction HIGH（125）、processOutbox HIGH（128）、createEntityDraftService HIGH（3）；改动只加评测外空操作的 emitTrace 与评测专用故障点，定向测试全绿。每次提交前 detect-changes --scope staged，风险 low。tsc -p tsconfig.build.json 干净；tsconfig.json 的 14 个错误是已有的（orbit-app 无依赖、redesign-pixel-lib.test.ts）。

## 假设与额外阅读
额外读了会话 GET handler、草稿与账本点卡接口、联系人读写提供者（证据编号不能为空）、主办方生命周期与报名仓库、能力注册表、对话契约、DeepSeek 价格页（2026-11-15，deepseek-flash 峰谷价，旧名 deepseek-v4-flash 按 Flash 计）。评测环境文件 repos/orbits/.env.agent-eval（忽略入库）只含本机库、开关、两个密钥与给评测库新生成的本地密钥，无远程地址；服务从最小环境起步。Gemini Decision 与 DeepSeek Search/Fetch 价格未核实，分别留给 AG08、AG09。

## 交接（给后续 sprint）

### 命令（都在 `repos/orbits` 下）
- `agent-eval:env`：可带 `--build`、`--stop`、`--status`。服务跑的是生产构建 `next start`，改了产品代码后要先 `--stop` 再 `--build`。
- `agent-eval:seed [-- --world X]`：需先停服务；会重建库并重写快照。
- `agent-eval:run`：`--gate AGnn`、`--all` 或 `--case a,b`，可加 `--label`；`--sealed` 已有但 AG00 未用过。带 `egress_probe` 的用例只能用 `--case` 跑。`--seed-cards` 留给 AG02。
- `agent-eval:judge-pack -- --run <id> [--only-hard-pass] [--judges N] [--cases …]`
- `agent-eval:report -- --run <id> [--with <id>] [--append-runs] [--purpose …]`

### 加词
- 先在 README §3.4 加词，再加到 `tests/agent-eval/lib/vocabulary.ts`；`vocabulary.test.ts` 会核对两边一致。
- 步骤写在 `tests/agent-eval/lib/runner.ts` 的 `runStep` 分支里；不支持的步骤在 `STEP_SUPPORT_NOTE` 写原因。
- 判定写在 `tests/agent-eval/lib/hard-checks.ts` 的 `CHECKS` 里，并把该词从 `NOT_YET` 删掉（`NOT_YET` 记着每个判定预计由哪个 sprint 提供证据）。
- 判定读取的证据在 `lib/observations.ts` 里组装；卡片、读取、回答的接线在 `runner.ts` 末尾。

### 事件
- 产品代码调用 `features/agent-v1/observability/trace.ts` 的 `emitTrace({type, source, …})`；新故障点用 `takeEvalFault(where)`。
- 预加载 `tests/agent-eval/preload/eval-preload.cjs` 负责：对外连接守卫、时钟、模型与网页拦截（`categoryOf`、`replayFor`）、SQL 观察、`/__agent-eval/*` 控制路由，以及 `/__agent-eval/push/expo/*` 的推送模拟。

### 其他
- 哪些表算业务数据：`observations.ts` 的 `BUSINESS_COLLECTIONS` 与 `PRIVATE_READ_COLLECTIONS`。
- 只改设置或改已有记录的 patch 目前报「不支持」；需要时扩展 `runner.ts` 的 `applyPatches`。
- 价格在 `lib/costs.ts` 的 `PRICE_TABLE`。加新版本，不改旧版本。
