# Sprint AG11 — 两端用 @ 指定上下文

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R11（设计稿 §3.6、§10「@ 选择器」行、附录 E「消息引用」行）；AG-R19（门槛用例）。
**单一目标:** Web 与 App 的输入框都能用 @ 或「添加上下文」搜索、多选、查看类型、移除六类记录；消息带六类引用及各自在句中的起止位置；服务端每轮逐条授权后按编号读取；引用不授予修改权，不建关联，不写记忆。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`；开工时重新记录 HEAD，并读 AG01、AG05、AG07、AG13 的 REPORT。
**进入条件:**
1. AG05、AG07 completed（登记表的依赖）。**另需 AG13 已合回**：门槛用例 AE-REF-002 用夹具增量 `private-event-reunion`（私有活动 P1、参会自述 A1），这两个集合和 `EventRef` 由 AG13 建。登记表只写了 AG05、AG07，与此不一致；开工前由协调者确认顺序，AG13 未合回则不启动。
2. 设计稿「2026-11-15 已定的事项」即产品批准，不重复索要。
3. **视觉稿已获批准**：@ 选择器的手机稿与网页稿，按 §10「出稿方式」画（设备框、编号标注、现状与改后对照、改动文件清单、要拍板的项，不改的区域嵌真实截图），批准链接追加到本页。没有批准不启动。
4. 真实模型调用已允许，费用上限见下文；评测环境 `npm run agent-eval:env` 自检通过（AG00 交付），`ORBIT_DEEPSEEK_MODEL=deepseek-flash`，`ORBIT_GEMINI_DECISION_API_KEY` 可用。
5. App 验收按 App RULES 5.4：本机 Web 生产构建与 iOS 模拟器登录同一账号、连同一个库。

### 进入条件核对（协调者，2026-11-19）

- **条件 1**：AG13 已合回 `orbit-agent-claude`（`52d0fc3cb`，REPORT 结论 completed），可以启动。
- **条件 3**：视觉稿已获批准。https://claude.ai/artifact/GaVqELQ97p4J8QGEE7XjEa ，用户 2026-11-19 回复「可以, 没问题, 按照这个实现」。八项都按推荐：
  - **D1**：句子里留着色的「@名字」，输入框上方再有一行小标签（类型 + 名字 + ×）；同名的标签再带一小段区分信息。
  - **D2**：点掉标签后，句子里的字留下，去掉 @ 和颜色，变成普通文字，不再绑定。
  - **D3**：选择器顶上有分类按钮：全部、联系人、笔记、待办、日程、活动、我去过；默认「全部」，结果按类分组。
  - **D4**：参会那一类在分类和标签上都叫「我去过」，与 AG13 一致，不用设计稿 §10 的「我参加过的」。
  - **D5**：两端输入框左边都是同一个「＋」按钮，提示和读屏名字叫「添加上下文」；打 @ 也能打开同一个选择器。Web 现有的「＋」变成真按钮；App 的「@」按钮换成「＋」。
  - **D6**：打 @ 打开时，选一条就关；点「＋」打开时可以连选几条，底部「完成（N）」，按顺序插到光标处。
  - **D7**：有「打不开了」的标签也能发送；回答里说明哪条打不开、请重新选，其余照常回答（§3.6）。标签变虚线并写「打不开了」，句子里的 @ 划掉。
  - **D8**：App 离线时选择器照常打开，只列手机里已有的联系人；其他五类合成一句「联网后才能搜」，不发请求，联网后自动恢复。
  - 稿里还定了：选择器从输入框上方展开，页面其余部分不动（不闪）；键盘 ↑↓／回车／Esc；手机上分类那排可以左右滑，结果最多占半屏；自己打的「@名字」没在选择器里点过就是普通文字。
- **档位**：按 H 执行（见下文「最小测试与检查」）；登记表的档位已经写作 H。
- **证据位置**：`~/orbit-sprint-evidence` 已搬到外置盘 `/Volumes/ORICO/Dev/orbit-sprint-evidence`，原路径是指向那里的链接，下文的路径照常可用。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `repos/orbit-app/src/screens/ai/ContactMentionPicker.tsx`：现有 App 选择器，只搜联系人（`GET /api/contacts/page?limit=8&query=`），游标翻页，已选的从结果里剔除；要扩成六类分组。
- `repos/orbit-app/src/screens/ai/ContactReferenceChip.tsx`：已选标签；名字先取本机联系人副本，缺了才单条读 `/api/contacts/:id`；点按即移除。
- `repos/orbit-app/src/screens/ai/AiConversationScreen.tsx`：:236 `selectedReferences` 存在 `useJournalState`（草稿日志，恢复时还原）；:425 `requestForSend` 把它放进 `reliable.references`；:609–616 增删；:1029–1030 标签行与选择器挂载点。
- `repos/orbits/app/(app)/app/agent/iorbit-0918/use-agent-chat.ts`：Web 发送；:398–399 写死 `protocolVersion: 2, references: []`，普通发送的引用永远为空。
- `repos/orbits/app/(app)/app/agent/iorbit-2026/IOrbit2026.tsx`：**Web 真正的输入框在这里**（:389 `data-orbit-agent-chat-composer` 表单、:391 textarea，:314/:322 调 `chat.ask`）。CONVENTIONS 第 1 节写的 `orbit-2026/iorbit/` 目录里只有 `page-context.ts`、`entity-draft.ts`。
- `repos/orbits/app/(app)/app/orbit-2026/iorbit/page-context.ts`：页面上下文（人脉筛选与数量）的做法：只带可校验的筛选，服务端重算；与 @ 引用是并存的两条通道，不混用。
- `repos/orbits/shared/contract/ai-sessions.ts`、`shared/api-schema/ai-sessions.ts`：引用类型只有 `contact | event | note`，没有位置；schema 限 20 条。
- `repos/orbits/features/orbit-ai/ai-session-reference-authorization.ts`：只核对联系人，其他类型直接放过；调用方 `app/api/ai/conversations/route.ts`:785 与 `app/api/ai/conversations/sessions/handler.ts`:195。
- `repos/orbits/shared/contract/global-search.ts`：全局搜索只分人、活动、对话三组，没有笔记、待办、日程、参会记录，不能直接当选择器的数据源。
- `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`:770–771：App 各界面调用的接口清单，新接口要登记。
- `repos/orbit-app/src/hooks/useLocalContacts.ts`：App 本机有联系人副本，没有笔记、待办、日程的副本；离线时能选的只有联系人。
- 测试夹具：`repos/orbits/tests/capabilities/ai-session-reference-authorization.test.ts`、`tests/capabilities/ai-session-origin.test.ts`、`tests/pages/app-agent-chat-characterization.test.tsx`；`repos/orbit-app/tests/ai-contact-mentions-interactions.test.tsx`、`tests/ai-conversation-screen-source.test.ts`。

### 关键符号
文件数为文本搜索结果，含定义文件和 App 副本。
- `export function ContactMentionPicker({ onSelect, selectedIds, scopeKey }: {` — 5 个文件。
- `export function ContactReferenceChip({ id, knownName, scopeKey, onRemove, style, textStyle }: {` — 4。
- `export type AiSessionReferenceType = "contact" | "event" | "note";` — 4。
- `export interface AiSessionReferenceContract {` — 11（服务端 5、App 6）。
- `export interface ReliableAiSendInputContract {` — 8；`export const reliableAiSendInputSchema: z.ZodType<ReliableAiSendInputContract> =` — 5。
- `export async function authorizeAiSessionContactReferences(input: {` — 4。
- `export function useAgentChat({ history, suggests }: { history: AgentChatHistoryStore; suggests: OrbitAgentViewModel["suggests"] }) {` — 5。
- 本 worktree 没有 GitNexus 索引。Generator 先按根 `CLAUDE.md` 建索引，再对每个要改的符号做 upstream impact；建不起来用文本搜索补查并写进 REPORT（CONVENTIONS 第 5 节）。

### 前序交接要点
以下是 CONVENTIONS 第 4 节约定的名字，开工时按前序 REPORT 核对，有出入追加更正记录。
- AG01：协议版本 3 与 `acceptMessage()`。新类型和位置只随版本 3 发送；版本 2 的旧端照旧。
- AG05：`features/agent-v1/references/authorize.ts`（六类引用的服务端授权）、`domains/registry.ts` 的 `read`、`answer/` 的 `verifyCitations()`；读不到的引用给 `REFERENCE_NOT_ACCESSIBLE`。
- AG07：两端对话界面与确认卡组件；本 sprint 的标签行和选择器挂在它改过的输入区上。
- AG13：`private_events`、`event_attendance_notes`、`EventRef`，`privateEvent`、`attendance` 适配器的 `read`。

### 易错边界（括号里是对应验收项）
1. **位置**：每个引用带标记在消息里的起止位置；两个标记文字相同，按出现先后对应（REF.yaml 约定）；名称只供展示，服务端只认类型加编号，不按名称重查（AG11-2）。
2. **每轮重新授权**：按本轮账号、工作区、类型逐条核对；删掉或没权限的引用提示重新选择，同句其余部分照常交付；恢复对话不沿用旧摘要（AG11-2）。
3. **移除即不发**：点掉标签、删改输入框里的标记文字、取消选择，都同时去掉绑定；App 草稿日志恢复后不能复活已移除的引用；纯文字 `@名字` 不生成绑定，走普通消歧（AG11-3）。
4. **不授予修改权**：@ 待办再要求修改，仍出卡、点击才写；@ 平台活动只得到可读字段，回答说明改不了；同句 @ 的几条记录之间不建关联，也不写记忆（AG11-4）。
5. **兼容**：旧端继续发 `contact | event | note`（版本 2），服务端照常处理，`note` 视同 `memo`；`event` 引用在版本 3 上带 `EventRef` 区分平台与私有（AG11-1）。
6. **六类都做通**：§3.6 明说不能用协议枚举代替业务验收；每一类在两端都有搜索结果、类型标示、移除（AG11-1）。
7. **离线与失效**：App 离线时只列本机已有的联系人，其他类型显示离线说明，不发请求；选中的记录已打不开时标签显示「打不开了」（§10 状态，AG11-1）。
8. **「日历」与「本周日历」**：选一条日程是引用；说「本周日历」是带日期范围的查询，两者不互相冒充（AG11-1）。

## 范围与文件

- 读取：上文必读文件；AG01、AG05、AG07、AG13 的 REPORT；`docs/epics/agent-design/eval/cases/REF.yaml`，`SCL.yaml` 的 AE-SCL-021、AE-SCL-022。
- 修改（路径相对 `repos/orbits`，App 另注）：
  - 契约：`shared/contract/ai-sessions.ts`、`shared/api-schema/ai-sessions.ts`（版本 3 的引用：六类加位置；版本 2 原样保留）；App 副本 `repos/orbit-app/src/api/contract/ai-sessions.ts`、`src/api/schema/ai-sessions.ts` 只经 `npm run sync:contract` 写出。
  - 服务端：`features/agent-v1/references/authorize.ts`（AG05 的文件，补位置校验），`features/orbit-ai/ai-session-reference-authorization.ts` 及两处调用方（版本 2 路径改走新授权，或保留并在 REPORT 写明理由）。
  - Web：`app/(app)/app/agent/iorbit-0918/use-agent-chat.ts`（发送带引用）、`app/(app)/app/agent/iorbit-2026/IOrbit2026.tsx` 与 `IOrbit2026.module.css`（@ 与「添加上下文」入口、标签行）。
  - App：`src/screens/ai/ContactMentionPicker.tsx`、`ContactReferenceChip.tsx`、`AiConversationScreen.tsx`、`src/data/offline-read/route-domain-inventory.ts`、`src/i18n/{zh,en,ja}/aiMention.ts`。
- 新建：
  - `features/agent-v1/references/search.ts`：六类按名称搜索，只查本人，每类有上限，同名记录带区分信息（公司或日期）。
  - `app/api/agent/references/search/route.ts`：选择器用的只读接口；结果结构写进 `shared/contract/agent-v1.ts` 与 `shared/api-schema/agent-v1.ts`（前序已建则追加）。
  - Web 选择器组件 `app/(app)/app/agent/iorbit-2026/ReferencePicker.tsx`（名以实际为准）。
  - 测试：`tests/agent-v1/references-search.test.ts`、`tests/agent-v1/references-authorize-positions.test.ts`、`tests/pages/iorbit-reference-picker.test.tsx`；`repos/orbit-app/tests/ai-reference-picker-interactions.test.tsx`。
- 排除：引用内容的读取与回答（AG05）；确认卡（AG07）；私有活动、参会自述的写入（AG13）；记忆（AG14）；`pageContext` 的行为；全局搜索面板。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG11-1 | 两端都能搜索、多选、查看类型、移除六类记录。 | `references-search.test.ts`（六类各有命中，只返回本人，同名带区分信息，另一账号零命中）；`iorbit-reference-picker.test.tsx` 与 App `ai-reference-picker-interactions.test.tsx`（分组、多选、移除、离线只列本机联系人）；门槛 AE-REF-001（Web：笔记、联系人、待办）、AE-REF-002（App：日程、活动、参会记录）；Web 1440／375 截图，按 `docs/development/web-no-flash-and-cache-rules.md` 在本机生产构建上测选择器开合前后位置不变；App 模拟器截图，同账号两端各发一条。 |
| AG11-2 | 两条同名记录按所选的编号各自读到原记录。 | `references-authorize-positions.test.ts`（位置越界、重叠、与标记不符被拒；同文字两标记按先后对应；他人记录、已删记录给 `REFERENCE_NOT_ACCESSIBLE`）；门槛 AE-REF-003、AE-REF-006、AE-SCL-021、AE-SCL-022。 |
| AG11-3 | 移除标记后不再发送旧的绑定。 | 两端组件测试：点掉标签、删改标记文字后的发送体里没有旧引用；App 草稿恢复后不复活；门槛 AE-REF-003 第二轮、AE-REF-004。 |
| AG11-4 | 引用不授予修改权，也不自动建立关联或记忆。 | 门槛 AE-REF-001（要改才出卡，`memory_state: []`）、AE-REF-005（平台活动不出卡）；服务端测试断言带引用的一轮结束后关联字段与记忆集合零写入。 |

## 一次 Generator 的执行顺序

1. 核对进入条件（AG05、AG07、AG13 的 REPORT，视觉稿批准链接），登记 run-01、本页 SHA256、基线 HEAD；建 GitNexus 索引，对关键符号做 upstream impact，HIGH/CRITICAL 先报告。
2. 契约：先写位置与旧端兼容的失败测试，再把版本 3 的引用写进 `shared/contract`、`shared/api-schema`；同一提交在 `repos/orbit-app` 跑 `npm run sync:contract` 和四个同步测试。
3. 服务端：授权补六类与位置校验，旧路径接上；新建搜索与接口；定向测试转绿。
4. Web：选择器、标签行、发送带引用、移除；组件测试；本机生产构建上截图与不闪动测量。
5. App：选择器扩到六类、标签、离线、草稿恢复；组件测试与 App typecheck；按 App RULES 5.4 起本机 Web 生产构建，模拟器同账号跨端发送。
6. 跑门槛与双评，路径限定提交到 `sprint/AG11-at-references`，写 REPORT，交协调者合并。

## 最小测试与检查

- **档位：H。** 登记表写的是 L，但本 sprint 改共享契约 `shared/contract/ai-sessions.ts` 并改读取授权，RULES 5.1 把这两类列为 H。按 H 执行，收口做一次 I 全量对照；登记表的档位请协调者更正或明确驳回。
- **开发定向集**：cwd `repos/orbits`，新测试三份加 `tests/capabilities/ai-session-reference-authorization.test.ts`、`tests/capabilities/ai-session-origin.test.ts`；cwd `repos/orbit-app`，新测试加 `tests/ai-contact-mentions-interactions.test.tsx`。
- **操作链收口集**：上述完整文件；`tests/pages/app-agent-chat-characterization.test.tsx`、`tests/pages/iorbit-stop-response.test.tsx`、`tests/pages/iorbit-page-context.test.ts`（页面上下文不受影响）；App `tests/ai-conversation-screen-source.test.ts`、`tests/app-locale-assistant-workflows.test.tsx`；`npx tsc --noEmit -p .`（`repos/orbits`）与 `npm run typecheck`（`repos/orbit-app`）。
- **契约同步**：cwd `repos/orbit-app` 执行 `npm run sync:contract`，跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`，与契约改动同一提交。
- **门槛命令**：`npm run agent-eval:run -- --gate AG11`，包含 REF 区 6 例（AE-REF-001～006，小账号）、SCL 的 AE-SCL-021（常规）与 AE-SCL-022（较大），以及不变量包。
- **评审**：门槛运行的每例由两个互不相见的 Claude 会话各评一次（`npm run agent-eval:judge-pack -- --run <运行编号>`），不一致做第三次并列入人工复核；`agent-eval:report` 的结论登记进 `eval/RUNS.md`。
- **全量对照**：`repos/orbits` 按 RULES 5.2 跑失败清单对照，只调查新增项；本 worktree 与其他 worktree 共用 stash 栈，stash 带唯一标签并按 SHA 取回。App 端按 App RULES 5.1 的 I 档跑一次 `npm test` 对照。
- **费用**：真实模型调用每次完整运行 30 元以内，本 sprint 累计 150 元以内，超出先停下报告；次数与 token 记进 REPORT。
- **证据位置**：截图与命令输出放 `~/orbit-sprint-evidence/agent-design/sprint-AG11/run-01/`，评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行**：`--all` 与封存集（AG18）；真实联网（本 sprint 用例都要求零联网）；实体设备（本机模拟器足够）。

## 失败与交接

外部条件缺失（AG13 未合回、视觉稿未批准、评测自检不过）先不启动。run 已开始，按 eval README 第 6 节最多两个修复轮次，每次整套门槛重跑；仍不过就如实结束为 failed，不为通过改用例，用例确实写错按第 7 节记进 `eval/CHANGES.md`。
REPORT 含验收映射、功能 SHA／文件／理由、命令与退出码、门槛运行编号与评审结论、费用、未提交与下一步。分支 `sprint/AG11-at-references` 从 `orbit-agent-claude` 建；固定最终 SHA 交协调者以 `--no-ff` 合回 `orbit-agent-claude`，合并树跑受影响测试和两端 typecheck 后才登记 completed。

## 追加记录：开工核对的更正（Generator，2026-11-19，run-01）

原文和开工时的 SHA-256（`efc07dbd…a6329`）不变，以下是按前序 REPORT 与代码核对后的出入：

1. **AG13 没有交出 `privateEvent`、`attendance` 的 `read` 适配器。** CONVENTIONS 第 4 节和本页上下文包都写了，代码里 `references/authorize.ts` 仍把 attendance 一律判为打不开，`DomainKind` 也没有这两类。本 sprint 在活动适配器里按编号补读（`private_event:…`、`attendance:…`，只读本人的），见 REPORT。
2. **门槛里 REF 区是 5 例，不是 6 例**：AE-REF-002、003、004、006、008。AE-REF-001、005、007 带 `gate: AG14`，不在本门槛（与 SPRINTS.md 登记表的「REF ×5」一致）。验收映射里引用 AE-REF-001、005 的地方，以开发运行代替门槛证据。
3. **`memory_state` 第一次在门槛里用到（AE-REF-002）**，运行器原把它标为 AG14 才有证据。本 sprint 实现了它的空列表形式（结束时账号没有记忆条目），带条目的形式仍等 AG14（CONVENTIONS 第 7 节）。
4. **契约快照只允许加字段**：位置与 `eventKind` 作为可选字段加在 `AiSessionReferenceContract` 上（协议 2 校验时丢掉），没有另起 `AgentReferenceContract` 接口。
5. **档位按 H**（登记表已是 H）。
