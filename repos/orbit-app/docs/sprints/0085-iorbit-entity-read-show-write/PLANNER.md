# Sprint 0085 — IORBIT 对五种实体的读、展示、写

**Plan revision:** 1。**模式:** existing-codebase / single-generator（含一次用户批准门）。运行状态只在登记表。
**原需求:** TODO.md 第 4 条（用户目标定义）。
**单一目标:** 五种实体（人脉／活动／待办／日程／笔记）在 IORBIT 对话中可读、可卡片展示、可经确认创建；建议动作成为创建入口；去掉"AI 运行依据"。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `12a9f9653`。未启动，run_count = 0。
**进入条件:** 设计案获批（这是改变 agent 行动方式的任务，按"先出设计案再实现"）；模型提供方可用；本机库有五种实体的样本数据。
**设计案（已产出，待批准）:** https://claude.ai/artifact/De2NsaKmsAe7JaSRJSvqHc —— 已回答判断 1 的四件事：五种卡片规格、草稿→待确认→写入→已创建状态机（同时只一张待确认草稿）、五个写入口（待办/笔记/日程/活动走 POST，人脉走 contact-drafts/manual 两段式）、以及"一次模型调用 + 确定性流水线，不引入多智能体 workflow"的取舍。

## 已查明的事实

| 事实 | 数据 |
| --- | --- |
| 失败样本 | session `agent-session-mobile-3ede834e-…`：三轮 `routingDecision.intent = data_query`，无 `actionRequests`、无 `taskInteraction`，`liveDatabaseWriteExecuted: false`；模型用文字承诺"确认后创建" |
| 现有写链 | planner `plan.actionRequests`（`features/agent/natural-language-actions/contract.ts`：`followups.createTask`、`notifications.createReminder`、`followups.saveDraft`、`memory.save`、`calendar.syncEvent`）→ `task-interaction-service.ts` → `taskInteraction.state` → App 调 `/api/task-suggestions/:id/accept` |
| 缺口 | 人脉／活动／日程／笔记无创建能力；"确认"无状态机；待办／日程／笔记无卡片；建议动作不可点 |
| 展示现状 | 活动卡片（agent 面板）与人脉面板（`AiContactArtifactPanel`）存在；`AiConversationScreen.tsx:1010–1024` 渲染"AI 运行依据" |
| 架构原则（0067 前既定） | 理解在模型、检索与写入确定性在代码；写入前必须用户确认 |

**判断 1：设计案先行，且必须回答四件事。** ① 五种实体卡片的字段规格（≤4 行信息，点开进详情）；② 草稿→确认→创建→回读的状态机（含"确认"/"改时间"/"取消"的文本意图映射，与卡片按钮等价）；③ 每种实体的写入接口清单（复用现有 REST：tasks／contacts／events／schedule-items／notes 的 create）与幂等键；④ prompt 单体 vs workflow 拆解的取舍——建议：planner 只产结构化"实体草稿"（schema 校验），确认与写入全部在代码里，不让模型参与确认。
**判断 2：草稿卡是唯一写入入口。** 建议动作小窗改造为草稿卡（可编辑、可确认、可取消）；服务端持久化草稿（会话内 revision），确认走确定性写入并回读生成"已创建"卡。
**判断 3：去掉"AI 运行依据"是独立小改动，随本 Sprint 一起落。**

## 范围与文件

- 设计案：artifact（副本入 `docs/designs/`）。
- orbits（获批后）：`features/orbit-ai/live-agent-runtime.ts`、planner 契约与 schema（实体草稿输出）、`features/agent/natural-language-actions/*`（四种新能力）、新建草稿状态机服务与写入适配器、`app/api/chat/conversations/*`（草稿确认路由）、对应测试。
- App（获批后）：`src/screens/ai/AiConversationScreen.tsx`（草稿卡、实体卡、去运行依据）、新建 `src/screens/ai/cards/*`、`src/view-models/*`、i18n；`tests/ai-*`。
- 排除：个人记忆／个人信息；多轮跨会话记忆；语音。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0085-01 | 设计案回答判断 1 的四件事并获批 | artifact + 批准记录 |
| SC-0085-02 | 五种实体各有卡片；点开进详情；回复下无"AI 运行依据" | 屏幕测试 + 截图 |
| SC-0085-03 | 失败样本原话（根据笔记整理待办）→ 草稿卡 → 确认 → 待办创建成功并回读；文本"确认"与按钮等价 | Simulator/phoneweb 走通 + 服务端状态机单测 |
| SC-0085-04 | 人脉、活动、日程、笔记各走通一次创建；未确认前 `liveDatabaseWriteExecuted` 恒为 false | 服务端集成用例 |
| SC-0085-05 | 无回归：两端全量对照；typecheck 0；0070 账本不新增无界读 | 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0085-iorbit-entities`。2. 设计案 → **等待批准**。3. 服务端：草稿 schema、状态机、写入适配器 RED→GREEN。4. App：卡片、草稿卡、去运行依据。5. 五实体真机走通、全量、收口。若设计案表明超出一个 Sprint，在 REPORT 中拆为 0085（展示 + 待办写）与 0086（其余四实体写）并登记。

## 最小测试与检查

- 档位：orbits H／App H。定向集：orbit-ai 状态机与 planner schema 测试、conversations 路由、App ai 屏幕测试；收口两端全量。

## 失败与交接

设计案未批准则停在步骤 2，登记 paused。模型不稳定导致草稿 schema 校验失败率高时，记录失败率并把规则兜底（正则抽取）作为可选降级，不得放宽确认门。
