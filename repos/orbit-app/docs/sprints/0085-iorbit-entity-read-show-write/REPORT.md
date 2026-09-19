# Sprint 0085 报告 — IORBIT 实体草稿卡

**状态:** 见登记表。**run-01，唯一一次 Generator。**

## 先用人话说

原来的会话（`agent-session-mobile-3ede834e…`）里，模型读到了笔记，整理出了待办，然后**用文字演了一遍确认流程**——"你回一句，我就提交创建"——而那个按钮并不存在。三轮对话，零次写入。

问题不在 prompt 写得不够好。问题是**模型根本没有写入能力，它只能描述写入**。所以改法是把确认从模型手里拿走：

- 模型唯一能提出写入的方式，是交出一个 **EntityDraft** 结构对象，schema 要么收下要么整个拒绝；
- 唯一碰到真实记录的那条边是 `confirm()`，它只能由用户动作触发；
- 用户打字说"确认"也走同一条代码，不是模型说了算。

## 固定版本

- 基线 `chat-agent` = `1e302a42f`（0084 合并后）。Planner 记的 `12a9f9653` 是立项基线；SC 未变。
- Planner SHA256 `f45ef0b8…` 未改。
- 设计案 https://claude.ai/artifact/De2NsaKmsAe7JaSRJSvqHc，**2026-09-19 用户明确批准**。

## 最关键的一件事：光改 prompt 没用

按设计案给 planner 加了 entityDraft 输出和路由规则之后，**拿原句对着 live 模型复现，仍然不出草稿**：

```
intent: data_query        ← 仍然路由到 notes_query
entityDraft: undefined
assistantMessage: "…**待办提案（尚未写入）** - 标题：… - 截止：…"   ← 还是用文字演
```

原因是结构性的，不是措辞问题：**planner 每轮只能选一个 intent**，而"根据这篇笔记整理一个待办"要求它既读笔记又起草。它把这一次机会花在了读上。而且在 planner 阶段它还没看到笔记内容，此时产出的任何草稿字段都是编的。

所以草稿必须在**工具返回之后**才问：新增一次 bounded 调用，拿到 artifacts，只返回 `{kind, fields, sourceRefs}`。触发条件是对用户原话的确定性正则——**要不要多花一次模型调用，不能由模型自己决定**；普通查询一次也不多花。

`安排` 故意不算触发动词：「查一下我的日程安排」是查询，而一张没人要的卡片比漏一张更糟。

## SC 映射与证据

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-0085-01 设计案获批 | pass | artifact + 登记表批准记录 |
| SC-0085-02 五种卡片 + 去掉"AI 运行依据" | **部分** | 去掉运行依据：done（面板连同 state/fetch/props 一并删除，三处断言改为断言其不存在）。**五种统一展示卡片：未做**，见下「一处报告错误」 |
| SC-0085-03 原失败样本走通 | pass | 见下「live 全链路」 |
| SC-0085-04 五实体各走通一次；未确认前不写 | **部分** | 待办／笔记／日程 live 全链路通过；活动与人脉各自受阻，原因已定位，见「两处受阻」 |
| SC-0085-05 无回归；两端 typecheck 0 | 见「命令与退出码」 | |

### live 全链路（真实数据库 + 真实模型，非 mock）

拿原失败样本的同一句话：

```
1. draft: task "[SIM-E2E-D] Note full flow 待办" state=pending_confirmation
   liveDatabaseWriteExecuted: false      ← 出卡片时没有写入
2. tasks before confirm: 64
3. confirm: 200 → state=created, createdRecordId=task:…
4. tasks after confirm: 65               ← 确认后才写
5. created task read back: "[SIM-E2E-D] Note full flow 待办"
6. confirming twice: 404                 ← 幂等：没有第二次写
7. tasks after second confirm: 65
```

笔记与日程同样走通（`note:71c682…`、日程 `startsAt=2026-09-25T14:00:00+09:00`）。

### 两处受阻（如实记录，不算通过）

**1. 人脉：被一条既有护栏挡在模型之前。**
`features/orbit-ai/live-agent-runtime.ts:750` 的 `stateChangeBoundaryPayload` 捕获联系人变更类措辞并直接停住：「联系人资料变更、任务或提醒都要先确认。Orbit 已停在本地确认边界：**没有调用模型**……」。草稿链路根本没机会跑。
这条护栏存在的理由，正是草稿卡现在提供的保障；但**放宽一条安全护栏是需要单独决定的事**，不适合夹在本 Sprint 里悄悄改。适配器已写好并有测试，后续 Sprint 只需处理这一个决定。

**2. 活动：草稿正常，写入被活动服务自己的前置条件拒绝。**
`confirm` 返回 503，原因是活动服务要求 `A source note is required before staging a manual event in the mock.`。
这一条其实是**失败可见性按设计工作了**：卡片保持可确认、错误原文透传、可重试，而不是静默失败。

## 一处报告错误（2026-09-19 更正）

本报告初版把 SC-0085-02 记成 pass，证据写的是"五种 kind 各自渲染的屏幕测试"。**那是错的对应**：那些测试验的是**草稿卡**（创建用）能渲染五种 kind，而 SC-0085-02 要的是设计案里的**展示**卡片——

> 展示：五种实体各有统一的小卡片；点卡片进入对应详情页。统一规格：36px 类别图标 + 类别名 + 一行标题（超出省略）+ 一行关键属性 + 一行"为什么出现在这里"。整卡可点，跳到既有详情页。

这一半**没有做**。对话里的展示层仍是本 Sprint 之前那套各不相同的面板：

| 实体 | 展示现状 | 是否本 Sprint 产出 |
| --- | --- | --- |
| 人脉 | `AiContactArtifactPanel` | 否，既有 |
| 活动 | `EventInlinePanel` | 否，既有 |
| 待办 | `FollowupsInlinePanel` | 否，既有 |
| 日程 | `ScheduleInlinePanel` | 否，既有 |
| 笔记 | **无卡片** | — |

实测（真实 API）：问"谁可以帮我引荐餐饮行业的人"，服务端返回结构化 `contact_recommendations`，App view-model 确实产出 1 张卡（标题"可优先联系的人"）；但**正文同时把同一批人用大段文字重复了一遍**（"近藤大輔 · 门店经营者（蓝海科技）— 关系强度 68、业务相关度 78……"），正是 TODO 第 4 条里"只有活动的卡片形式算好，其他三种都不行"说的那个问题。

怎么发生的：写报告时我把"草稿卡覆盖五种 kind"当成了"五种实体各有卡片"。两件事共用"卡片"这个词，但一个是创建前的确认卡，一个是展示已有记录的卡。**是用户在 Simulator 上试出来的，不是我自查出来的。**

统一展示卡片另立 [0094](../0094-iorbit-entity-display-cards/GOAL.md)。

## 与 PLANNER 的偏差

**1. 没有复用既有的 agent action queue。** 它已经有提案、执行器、幂等和补偿，看上去是现成的。但它自己的契约写明「接受或忽略动作只改变队列状态；真正的外部副作用必须走额外确认/执行层」——写入是异步 outbox。设计案要的是「确认 → 写入 → 回读 → 卡片变已创建」的同步 UX；接到那条链上，卡片会在记录还不存在时就说已创建。所以草稿状态机是独立的小服务，写入直接走各领域已有的 service（tasks／notes／schedule／events／contact-drafts），不新开 agent 专用写接口。

**2. 草稿落在 live record，pending 那张用索引查。** `targetId` 存 `pending`/`settled`，按 `sourceId + targetId` 有界查询。扫会话全部草稿历史来找那一张是无界读，0071–0078 花了四个 Sprint 才把无界读清干净。

**3. 失败原因不吞。** `draftEntity` 的失败带 `api_key_missing / request_failed / no_output / unparsable`。这一条立刻自证了价值：第一次 live 跑返回 `no_output`，因为这个调用用了 Gemini 专用的响应读取器，而当前 provider 是 DeepSeek。如果只返回一个静默的 false，它看起来会和"模型选择不产出草稿"完全一样。

**4. 删除"AI 运行依据"连带删掉了它承载的运行审计入口。** 设计案写的是「直接移除」。面板一走，`runReferences`／`aiRunDetailView`／`inspectAiRun` 就没有入口了，留着就是不可达代码，所以一并删除。三处断言它存在的测试改成断言它不存在——这是一个明写的决定，不是静默的缺口。

## 命令与退出码

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit`（orbits） | 0 |
| `npx tsc --noEmit`（App） | 0 |
| orbits 定向集（草稿状态机／适配器／仓储／planner 输出／路由） | 37/37 |
| orbits planner 邻接集（self-profile／query-routing／natural-language-actions／memory 等 8 文件） | 120/120 |
| App 定向集（草稿 view-model／会话 view-model／屏幕源／app-wide／AI 首页） | 169/169 |
| App `ink-signal-ai-conversation`（含新增 7 条草稿卡用例） | 102/102 |
| live 全链路（真实 DB + 真实模型） | 见上表 |

### orbits 全量：这一轮的数字不可信，原因已定位

先说结论：**本轮 orbits 全量不能用来判断有没有回归**，因为 `ORBIT_EVENT_DATABASE_URL` 指向的 Neon 云库**传输额度已用尽**：

```
error: Your project has exceeded the data transfer quota.  code: 53000
```

这批测试直接读 `ORBIT_EVENT_DATABASE_URL`（不经 `resolveLiveDatabaseConnectionConfig`），所以 `.env.local` 里的 `ORBIT_DATABASE_TARGET=local` 不会把它们改道到本机库。应用本身走本机库，所以 live 验证不受影响。

为了不靠猜，在 `/Volumes/ORICO/Dev/worktrees/orbit/baseline-0085`（按仓库 worktree 政策放外置盘）对 0085 之前的 `1e302a42f` 跑了一次同样的全量做对照：

| | 通过 | 失败 |
| --- | --- | --- |
| 基线 `1e302a42f` | 3805 | 119 |
| 本线（首轮，含模拟器构建与 dev server 争用） | 3835 | 197 |
| 本线（无争用重跑） | 3845 | 177 |

差集里 31 条"新增失败"**全部是 real-PostgreSQL 测试**（迁移、预约、活动分析、密码找回、encounter worker……），没有一条碰到本 Sprint 改动的文件。单独重跑它们仍然是同一条额度错误。基线先跑，把剩余额度用掉了，本线后跑撞得更狠——这解释了 119 → 177 的差。

**真正因本 Sprint 产生、并且已修的回归有三条**（都不在上面那 31 条里）：

1. `orbit-ai-task-authorization`：该测试给会话路由钉了一份依赖白名单，草稿状态机是新依赖。已显式登记，并把 `propose` 计入计数——查询既不能碰待办，也不能碰草稿。纯匹配函数 `readEntityDraftIntent` 放行为真实实现，否则这条测试会在"读不写"上打转却从不运行判定确认的那段代码。
2. `orbit-agent-gemini-live`：timing 序列多了一个 `entity_draft` span。断言改为**且必须 skipped**——这条 fixture 既不综合也不要求创建，那次额外模型调用就不该发生。
3. 首轮全量本身：我让模拟器构建和 dev server 与它抢资源，那一轮数字作废，已重跑。

### App 全量：3525/3525，0 失败（204s）

收口时 App 全量红过两条，都是本 Sprint 造成、都已修：

1. **契约副本过期**：往 `shared/contract/orbit-ai.ts` 加了卡片契约却没同步 App 的逐字副本。跑 `npm run sync:contract` 同步。
2. **离线读取清单（`offline-read-inventory`）**：这条值得单独写下来。

它报了三件事，两件我确实错了——新端点 `/api/ai/entity-drafts/:id` 没登记；被删掉的运行依据 fetch 留着一条 `GET /api/ai/runs/:id` 的孤儿登记。第三件说"这个屏幕不再调用 `POST /api/ai/conversations`"，而那段代码我根本没碰。

**根因是 `computedPathFamilies` 用源码行号做 key。** 加了两行 import，`client.post(request.path)` 从 345 行挪到 350 行，它的登记就悄悄失配了，报出来的却是"端点没被调用"。验证方法：在基线文件里只加一行**没有使用**的 import，同样三条失败原样出现——一个没被使用的 import 不可能改变一个屏幕调用哪些端点。

修的是 key，不是把预算调大（先后试过 `seen.size > 60` 调到 140／5000、`stack.size > 30` 调到 60，都不是原因）；审计的保证一条没松。

**这是一个留给后来人的坑**：这几个文件里，任何在已登记调用点**上方**的增删都会让登记静默失配，而失败信息会指向错误的方向。

## 下一步

- 人脉写入需要先决定是否放宽 `stateChangeBoundaryPayload`；活动写入需要活动服务放开 source note 前置条件。两者都建议单列一个 Sprint（下一个空号 0093），卡片与状态机不动。
- 设计案里"同时只有一张待确认草稿"已实现（新草稿把旧的置为 `superseded`）。
