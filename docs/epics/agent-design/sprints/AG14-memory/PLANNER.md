# Sprint AG14 — 个人记忆

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R14（设计稿 §6、§10 记忆管理一行、附录 E 个人记忆一行）；AG-R19（门槛用例）。
**单一目标:** 记忆条目按“规范账号＋当前工作区”存放，带版本、状态、适用场景、结构化值和有效期；对话里经记忆卡新增、更正、删除；召回时约束类每次加载，其余按任务相关最多取 5 条，回答开头写明；忘掉后新会话、恢复的旧会话和旧消息再提取都不再用；Web 与 App 设置页和对话读同一批条目。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad55f9dfd21793057f6b22c7727540fac1`，开工时改填实际 HEAD；前序 REPORT 只读 AG06、AG08 两份及本页引用到的 AG02、AG03、AG05、AG07 交接节。
**进入条件:**
1. AG06、AG08 已 completed 并合回 `orbit-agent-claude`（登记表依赖）。
2. 产品批准：设计稿“2026-11-15 已定的事项”里“记忆按规范账号＋当前工作区，约束类条目每次都加载”，以及 §6 全文。
3. 付费模型调用已允许，上限见“最小测试与检查”的费用一条。
4. 环境：AG00 的 `agent-eval:*` 命令可用；本机库 `orbit_agent_eval`；`ORBIT_DEEPSEEK_MODEL=deepseek-flash` 与 `ORBIT_GEMINI_DECISION_API_KEY` 在本机配好；评测环境 `ORBIT_AGENT_V1_MODE=on`、`ORBIT_AGENT_EVAL=1`。
5. 视觉稿：记忆卡（新增、更正、删除三种）、回答开头依据行里的记忆说法、Web 与 App 的记忆管理区，已按设计稿 §10“出稿方式”获用户批准。未批准时只做服务端，界面相关的证据记 blocked。
6. 生产库上的盘点与迁移（含只读盘点）不在本 sprint 授权内。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `repos/orbits/features/agent/memory/contract.ts`：`AgentMemory` 现只有 `memoryId, category, content, source, createdAt, updatedAt`；设置只有 `enabled`、`allowConversationLearning` 两个开关。
- `repos/orbits/features/agent/memory/service.ts`：分区键 `${workspaceId}:agent-actor:${actorId}`（:29–35）；默认学习关（:15–19）；`remove` 直接 `deleteRecord`，不留删除标记（:196–206）；`context()` 只看 `enabled`，不分类、不看相关性，按更新时间取前 20 条（:236–245）。
- `repos/orbits/features/agent/memory/service-factory.ts`：工作区取配置库的 `configured?.workspaceId`（:46，来源见 `shared/storage/live-database-config.ts:56–59`），按 mode＋工作区＋actor 缓存实例（:47–56）。
- `repos/orbits/app/api/agent/memory/request.ts`：管理接口用 `session.user.id` 作 actor（:65），即 Auth.js 原始编号；同目录 `route.ts`、`settings/route.ts`、`[id]/route.ts` 都经它。
- `repos/orbits/app/api/_shared/authenticated-actor.ts`：`resolveAuthenticatedApiActorIdentity` 按 profile→account 解析规范账号（:84–103），工作区写进 `AuthenticatedApiActor.workspaceId`（:139）。
- `repos/orbits/app/api/ai/conversations/request-context.ts`：对话入口在 live 模式用规范账号。与上面管理接口不同源，这就是设计稿 §6“账号一致性要先验收”指的分歧。
- `repos/orbits/app/api/ai/conversations/route.ts`：:690–719 把 `memoryService.context()` 整批塞进模型输入；:428–436 学习关时回固定文字。`app/api/ai/conversations/[id]/route.ts:139` 恢复会话时也取记忆。
- `repos/orbits/features/agent/natural-language-actions/service.ts:61、204–211`：`AgentMemoryLearningDisabledError`。`features/agent/runtime/domain-executors.ts:394–420`：唯一的记忆执行器 `memory.save`，只会新增。
- `repos/orbits/app/(app)/app/orbit-2026/account/IorbitSettings.tsx`：记忆区只能看和删（:101–113、:171–179），没有开关、新增、修改、到期日、分组。
- `repos/orbit-app/src/screens/me/settings-api.ts:34–40`、`AccountIorbitContent.tsx:8–22`：App 同样只有列表和删除，DTO 由 App 自己的 `memorySchema` 解析。
- 用例与夹具：`docs/epics/agent-design/eval/cases/MEM.yaml`；`cases/SCL.yaml` 的 AE-SCL-027、028；`eval/world/base-v1.yaml:103–120`（MM1–MM3、`mem-learn-on`）。
- 现有测试：`repos/orbits/tests/capabilities/agent-memory.test.ts`、`agent-natural-language-actions.test.ts`、`tests/pages/settings-secondary.test.ts`。

### 关键符号
本 worktree 没有 GitNexus 索引。Generator 先按根目录 `CLAUDE.md` 建索引，再对下列每个要改的符号做 upstream impact，HIGH/CRITICAL 先报告；建不起来就用文本搜索补查并在 REPORT 写明（CONVENTIONS §5）。引用数是编制时在 `repos/orbits` 的 `app features shared scripts tests` 下 `grep -rlw` 得到的文件数，含定义文件。
- `export function createStorageAgentMemoryService({` … `}: StorageAgentMemoryServiceOptions): AgentMemoryService {`（service.ts:91–97）：6 个文件，测试 4 个。
- `export function createAgentMemoryService({` … `}: CreateAgentMemoryServiceOptions): AgentMemoryService {`（service-factory.ts:25–29）：15 个文件，测试 5 个；对话、会话详情、信号、自动化、工作进程、运行时工厂都经它。
- `export async function resolveAgentMemoryRequest(): Promise<AgentMemoryRequestContext | null> {`（request.ts:63）：4 个文件。
- `export function resolveAuthenticatedApiActorIdentity({` … `}: ResolveAuthenticatedApiActorInput): AuthenticatedApiActor | null {`（authenticated-actor.ts:62–67）：7 个文件；`resolveAuthenticatedApiActor` 188 个文件。本 sprint 只调用不改，若要改按 CRITICAL 处理。
- `export async function resolveOrbitAgentConversationRequestContext(`（request-context.ts:9）：8 个文件，测试 5 个。
- `export interface AgentMemoryService {`（contract.ts:53）：5 个文件。`export function IorbitSettings() {`（IorbitSettings.tsx:62）：3 个文件，测试 1 个。

### 前序交接要点
以下名字取自 CONVENTIONS §4，是约定。开工时逐条对照前序 REPORT，不一致就按 REPORT 更正本节并留追加记录，原文和原哈希保留。
- AG00：`emitTrace(event)`；本 sprint 发 `memory.recall`（条目编号与版本）。
- AG02：账本的 `origin`、`revision`、各版载荷、`expiresAt`，`decideAction()`；记忆卡走同一账本与决定接口。
- AG03：`context/` 的 `buildFirstLayerContext()` 与会话级状态，`graph/` 的 `AgentGraphState` 与检查点，`route/` 的能力清单（`appliesTo` 取值对齐它）。
- AG05：`answer/` 的 `AnswerOutput` 与 `verifyCitations()`，“为什么排第一”只能引用本轮用过的记忆和读取（AE-MEM-011）。
- AG06：`propose/` 的 `OperationIntent`、`resolveIntents()`、`freezeCard()` 与执行器登记方式。
- AG07：两端确认卡组件与回答开头的依据行；本 sprint 只供内容和“用在：推荐活动时”。
- AG08：`askJudgment()`；“这次”与“以后”规则分不清时可问一道判断题。

### 易错边界（都对应到下方验收项）
1. **同一个人**（AG14-5）：设置接口、对话、恢复会话、后台运行一律经同一规范身份解析得到 `accountId` 和 `workspaceId`；`request.ts` 不再拿 `session.user.id` 当分区键。
2. **工作区取自已解析的身份**（AG14-5）：用 `AuthenticatedApiActor.workspaceId`，服务工厂不另读配置；缓存键改为账号＋工作区，避免换账号拿到上一位的实例（AE-MEM-012）。
3. **迁移只搬能证明的**（AG14-5）：先只读盘点旧分区，列出原编号、能否经 profile→account 唯一解析、条目数；只搬唯一解析的，解析不到或一对多的留原处并进待核对清单；禁止按姓名、邮箱、显示名合并。本 sprint 只在本机库上跑。
4. **点了才保存**（AG14-1，AE-MEM-002）：对话里的新增、修改、删除都出卡，点击后由执行器写；模型说“已记住”不算。设置页里用户自己动手的增删改是用户操作，不走卡。
5. **学习开关关着**（AG14-1，AE-MEM-003）：不出卡、不保存，这一轮照用，并说明只用这一次和长期保存的两种办法；不再抛 `AgentMemoryLearningDisabledError` 回固定文字。开关关着不妨碍改或删已有条目（AE-MEM-007）。
6. **召回**（AG14-2）：“回答时参考这些”关着时什么都不取（AE-MEM-010）；约束类在适用范围内（含 `all`）每次加载，不占名额，每个工作区最多 20 条；其余按 `appliesTo` 与有效期筛，最多 5 条，无匹配返回空；过期的不取（RMM05、LMM04）；先套本轮硬条件，再按偏好排序；时间未公布的活动不算命中。`appliesTo` 按用例与夹具的写法存（`event.recommend`、`all`），与 AG03 能力清单不一致时在适配层映射。
7. **这次与以后**（AG14-3）：“这次……”不出卡、不改条目、不升版本（AE-MEM-006）；“以后……”出 `memory.update`，卡上列同一条的前后值，按 `revision` 条件更新，改的是原条目不是新增（AE-MEM-007）。
8. **忘掉**（AG14-4）：删除是把状态改为已删除并推进该工作区的记忆版本，留删除标记（编号、类别、适用场景、`sourceMessageRef`），正文不留；召回前核对状态与版本；恢复旧会话时检查点里的记忆版本落后就按最新版本重建（AE-MEM-009）；从旧消息提取遇到带删除标记的来源一律跳过，用户再次明确说“记住”才重新提议（AE-MEM-008 全程只有两张卡）。
9. **另一个账号**（AG14-5，AE-MEM-012）：回答、卡片、设置列表、读取日志里都没有甲的条目；乙说“忘掉”时说明没有可忘的，不出卡。

## 范围与文件

- 读取：上下文包所列；前序 REPORT 只读交接节。
- 修改：
  - `repos/orbits/features/agent/memory/contract.ts`、`service.ts`、`service-factory.ts`：新字段 `revision, status, appliesTo, structured, validFrom, validUntil, sourceMessageRef`；分区改为规范账号＋工作区；工作区记忆版本与删除标记；按版本条件更新；软删除。
  - `repos/orbits/app/api/agent/memory/request.ts` 与同目录三个路由：改走规范身份；收发新字段。
  - `repos/orbits/app/api/ai/conversations/route.ts`、`app/api/ai/conversations/[id]/route.ts`：只把记忆取法换成 `recallFor()`，其余管线不动。
  - `repos/orbits/app/(app)/app/orbit-2026/account/IorbitSettings.tsx`、`settings-copy.ts`、`SettingsSecondary.module.css`：按获批视觉稿改记忆区。
  - `repos/orbit-app/src/screens/me/settings-api.ts`、`AccountIorbitContent.tsx`、`AccountIorbitScreen.tsx`：同上。App 的 `src/api/contract` 等副本只由 `npm run sync:contract` 写出。
  - 新入口接线点：AG03 的 `context/` 与检查点状态、AG06 的执行器登记处，以 REPORT 为准。
- 新建：
  - `repos/orbits/features/agent/memory/recall.ts`（`recallFor()`，可在无会话时按账号＋工作区调用，供 AG15）、`forget.ts`（删除标记与记忆版本）、`ownership-inventory.ts`（盘点与迁移逻辑）。
  - `repos/orbits/features/agent-v1/domains/memory/`：`memory.create`、`memory.update`、`memory.delete` 的 `prepare` 与 `applyApproved`。
  - `repos/orbits/scripts/migrate-agent-memory-scope.ts`：默认只读盘点，带 `--apply` 才搬；输出写到证据目录。
  - `repos/orbits/shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts`：追加记忆条目与设置的传输结构。
  - 测试：`tests/capabilities/agent-memory-scope.test.ts`、`agent-memory-recall.test.ts`、`agent-memory-forget.test.ts`、`tests/api/agent-memory-routes.test.ts`、`tests/services/agent-memory-ownership-inventory.test.ts`；App 端在 `repos/orbit-app/tests/` 加记忆设置测试。
- 排除：自动整理记忆（EPIC 排除项）；MCP 读记忆（任何范围都不开放）；定时运行里的召回接线（AG15）；`scripts/run-agent-worker.ts` 的改造（AG15）；生产库的盘点、迁移和部署。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG14-1 | “记住……”出一张记忆卡，点击后才保存；学习开关关着时只用于当前这一轮。 | `agent-memory-scope.test.ts`：确认前零写入，执行器写入与卡一致，学习关时零卡零写；门槛 AE-MEM-001、002、003 |
| AG14-2 | 新会话里只在相关的任务上用到它，回答开头写明；约束类条目每次都加载。 | `agent-memory-recall.test.ts`：约束不占名额、过期不取、无匹配为空、使用开关关时为空；`memory.recall` 事件；AE-MEM-001、004、005、011，AE-SCL-027（常规），AE-SCL-028（较大） |
| AG14-3 | “这次……”只改本次，“以后……”显示前后值并确认后更新。 | `domains/memory` 适配器测试：临时例外零写零升版，update 带前后值并按 `revision` 条件写；AE-MEM-006、007，AE-SCL-028 |
| AG14-4 | 忘掉之后，新会话和恢复的旧会话都不再使用，也不会从旧对话里重新提取。 | `agent-memory-forget.test.ts`：删除标记、版本推进、恢复时重建、提取跳过；AE-MEM-008、009（不变量） |
| AG14-5 | 设置页与对话看到的是同一批条目；另一个账号全程看不到。 | `tests/api/agent-memory-routes.test.ts`：设置接口与对话同一规范账号，乙读、改、删甲均为 0；`agent-memory-ownership-inventory.test.ts`：只搬唯一解析的，歧义留原处，同名同邮箱不合并；本机库盘点输出；AE-MEM-010、012（不变量）；Web 设置页 1440/375 截图并按 `docs/development/web-no-flash-and-cache-rules.md` 核对不闪动；App 连同一本机服务读到同一批条目 |

## 一次 Generator 的执行顺序

1. 复核进入条件；登记 run-01、本页 SHA256 和基线 HEAD；记下门槛用例与夹具的校验值（eval README §7）；动手前在基线上跑一次 `npm test` 存失败清单；建 GitNexus 索引；按前序 REPORT 校正上下文包；确认运行器已实现 `resume_conversation`、`settings_memory_list`、`setting: { memory_use }`，缺的按 eval README §3.4 的含义在 `repos/orbits/tests/agent-eval/` 补上，不改用例。
2. 对关键符号做 impact；先写失败测试：分区与身份同源、乙不可见、盘点只搬可证实条目、软删除与版本。
3. 存储层：契约字段、分区、版本与删除标记、`recallFor()`；盘点与迁移脚本在本机库对一份含旧分区（Auth.js 编号、账号编号、解析不到三种）的数据跑一遍，输出存证据目录。
4. 对话侧：三个记忆适配器与执行器登记；学习开关语义；临时例外；恢复会话重建；旧消息提取跳过删除标记；`memory.recall` 事件；旧入口改用 `recallFor()`。
5. 界面（视觉稿批准后）：Web 与 App 设置页、记忆卡内容；`shared/` 改动的同一提交里跑 App 同步；浏览器 1440/375；App 按 App 规则 5.4 连同一套本机服务回读。
6. 门槛运行与双评；收口全量对照；路径限定提交；写 REPORT；交接分支与最终 SHA，由协调者合回 `orbit-agent-claude`。

## 最小测试与检查

- **档位：H。** 身份与分区改变、数据迁移、共享契约、跨账号隔离、付费模型调用，都属 RULES 5.1 的 H。
- **开发定向集**（cwd `repos/orbits`）：上面新建的五个测试文件；`tests/capabilities/agent-memory.test.ts` 改成新分区下的断言；`tests/capabilities/agent-natural-language-actions.test.ts` 改成学习关时不抛错。数据库测试读 `ORBIT_EVENT_DATABASE_URL`，必须指本机测试库，先跑 `node scripts/assert-local-test-databases.mjs`，REPORT 证明没有被 skip。
- **操作链收口集**：上述文件完整跑一遍；引用 `createAgentMemoryService` 或 `createStorageAgentMemoryService` 的直接消费者 `tests/api/orbit-ai-reliable-reply-identity.test.ts`、`tests/api/orbit-ai-task-authorization.test.ts`、`tests/capabilities/agent-workflows-e2e.test.ts`、`tests/capabilities/agent-pre-event-brief-delivery.test.tsx`、`tests/integration/mock-capability-loop.test.ts`、`tests/pages/settings-secondary.test.ts`、`tests/services/ai-session-paging-postgres.test.ts`、`tests/services/agent-run-trace-postgres.test.ts`；`npx tsc --noEmit -p .`。
- **契约同步**：改 `shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts` 的同一提交里，在 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`。App 界面也改了，另跑 App 的 `npm run typecheck` 和改动测试所在的完整文件。
- **门槛**：`npm run agent-eval:run -- --gate AG14`，含 MEM 区 12 例（AE-MEM-001～012）、分给 AG14 的 AE-SCL-027（常规账号）与 AE-SCL-028（较大账号）、不变量包（本区的 AE-MEM-008、009、012 在内）。三个账号都有用例。
- **评审**：`npm run agent-eval:judge-pack -- --run <运行编号>` 出材料，门槛里每例由两个互不相见的 Claude 新会话各评一次，不一致的做第三次并进人工复核清单；`npm run agent-eval:report -- --run <运行编号>` 汇总并登记 `eval/RUNS.md`。失败修复后整套门槛重跑，最多两轮。
- **全量对照**：H 档收口跑一次 `npm test`，与第 1 步的基线失败清单 `comm -13` 比较，只查新增项；不 source `.env` 系列文件。基线在动手前跑好，不用裸 `git stash`（本 worktree 的 stash 与其他会话共用）。
- **费用**：真实模型调用每次完整运行 30 元以内，本 sprint 累计 150 元以内，超出先停下报告；次数、token、金额和 DeepSeek 余额差记进 `costs.json` 与 REPORT。
- **证据**：截图、命令输出、盘点结果（只留脱敏编号和计数）放 `~/orbit-sprint-evidence/agent-design/sprint-AG14/run-01/`；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行**：封存集（只在 AG18）；`--all`；生产库上的盘点与迁移；Lighthouse、axe 等验收项没要求的检查。

## 失败与交接

外部条件缺失（前序未完成、视觉稿未批准、密钥缺失）先不启动，或只做不受影响的部分并把受影响的证据记 blocked；run 已开始则按规则产出 failed 或 blocked 报告，不开第二次 Generator。
报告包含：验收项与证据的对应、功能 SHA、命令与退出码、门槛运行编号与 `RUNS.md` 一行、双评不一致清单、盘点结果（可搬与待核对的条数）、费用、未提交与失败项、下一步。给 AG15 的交接写明 `recallFor()` 的签名和无会话调用方式。
分支：从 `orbit-agent-claude` 建 `sprint/AG14-memory`；只暂存本 sprint 的文件，禁止 `git add .`；提交前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`，`partial` 或 `truncated` 要重跑。由协调者 `git merge --no-ff` 合回 `orbit-agent-claude`，在合并树跑收口集与 typecheck 后才登记 completed。push 需要用户授权。

---

## 追加记录（run-01 开工时；原文不改）

原文 SHA-256（追加前）：`600a315586a7dfce33f86da968c962f3e2dc0c5365e7f0641a227716e163441d`。基线 HEAD：`98869bb4c36cc05ef30f034e6260091b028783e0`（集成线 `agent-v1-integration`，上文写的 `orbit-agent-claude` 一律读作它）。执行分支 `sprint/AG14-memory`，检出在 `.worktrees/ag14`，并行线 `ag14`。

### 进入条件核对（协调者 2026-11-19）

1. AG06、AG08 已 completed 并合并，AG09–AG13 也是；集成线 `agent-v1-integration` @ `98869bb4c`。满足。
2. 产品批准（§6 与“2026-11-15 已定的事项”）：满足。
3. 付费模型调用：允许，每次完整门槛 30 元、本 sprint 150 元以内。
4. 环境：本线用自己的库 `orbit_agent_eval_ag14`、端口 3150–3165、证据目录 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag14`。满足。
5. **视觉稿未批准**（另一个 agent 在画）。按协调者的安排：不依赖它的部分先做完——按账号＋工作区存取、召回、记忆卡的内容与三个执行器、“这次／以后”的规则、忘掉（含恢复旧会话、不从旧聊天重新提取）、设置接口、契约、评测运行器补的词、单测、旧数据盘点（只读，只在本机测试库）。对话里的卡沿用现有确认卡组件。Web 与 App 设置页和任何新的可见元素，等协调者送来获批的稿子再做；先到那一步就跑不需要页面的门槛用例、报告、等待。
6. 生产库上的盘点与迁移不在授权内：不做。

### 开工时对上下文包的校正

- **分区写法不变，换的是填进去的编号。** 原文写“分区改为规范账号＋工作区”。`<工作区>:agent-actor:<编号>` 这个写法被账号数据清除、运行留存、评测运行器的归属判断等十几处共用（`features/account/data-rights/purge/agent.ts` 等），另起一个前缀会让它们漏掉记忆。所以保留写法，所有入口填规范账号编号：对话、恢复会话、后台运行本来就是，只有设置接口原来填的是登录会话的用户编号，现在改走同一个身份解析器。旧分区里填着非规范编号的，由盘点脚本列出，只搬能唯一解析的。
- **记忆版本不另存一条记录。** 原文写“工作区另存记忆版本号”。版本号取该账号在该工作区全部条目（含已删除的标记）的 `revision` 之和：新增、修改、删除各加一，只增不减，不需要第二条记录，也就没有两处不一致的可能。删除标记就是那条记录本身：状态改为已删除，正文、结构化值、检索文本清空，留编号、类别、适用场景、`sourceMessageRef`。
- **工作区。** CONVENTIONS §1：第一版的“当前工作区”就是部署的工作区编号。`AuthenticatedApiActor.workspaceId` 读的是同一份配置。服务工厂收下它并核对与库的配置一致（不一致拒绝），后台调用方没有请求身份时不传。
- **GitNexus。** 本检出的索引已建；`createStorageAgentMemoryService`（CRITICAL，29）、`cardWriteExecutors`（CRITICAL，48）、`memoriesFor`／`routeNode`／`intakeNode`／`understandNode`／`buildFirstLayerContext`／`cardIntentOf`（HIGH）等见 REPORT「影响分析」。
- **AG10 的只读 `deps.memories`** 生产执行器从未接上（AG10 REPORT 第 67 行）；本 sprint 换成 `deps.memory`（一轮读一次该账号的记忆），排序里的 `memoriesFor()` 不再使用。
- **评测运行器要补的词**：`resume_conversation`、`setting: { memory_use | memory_learn }`、`settings_memory_list`、`memory_recalled`、带条目的 `memory_state`、卡片项的 `target: new`；补丁与用例的 `settings: { memory_learn }`。另：评测把读 `agentMemories` 记成“读业务记录”，而 AE-MEM-005 的 `private_reads_within` 不含记忆条目、`memory_recalled` 才列它——本账号读自己的记忆不再算进 `no_private_reads`／`private_reads_within`，跨账号读仍由 `no_cross_account` 判（登记在评测 CHANGES.md）。
