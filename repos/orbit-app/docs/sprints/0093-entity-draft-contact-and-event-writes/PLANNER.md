# Sprint 0093 — 人脉与活动的草稿写入：解开两处既有阻挡

**Plan revision:** 1。**模式:** existing-codebase / single-generator（含一次安全边界决定）。运行状态只在登记表。
**原需求:** 0085 设计案授权的拆分（"若实现量超出一个 Sprint，其余实体的写入拆出，卡片与状态机不拆"）。
**单一目标:** 让人脉与活动也能经草稿卡确认创建，且不降低既有安全保证。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0085 合并后的 `chat-agent`。未启动，run_count = 0。
**进入条件:** 人脉那一项涉及放宽一条安全护栏，**需要用户明确同意**才能进入实现步；活动那一项无此门。

## 已查明的事实（全部来自 0085 的真实链路验证）

| 事实 | 位置／证据 |
| --- | --- |
| 人脉被护栏拦在模型之前 | `features/orbit-ai/live-agent-runtime.ts:750` `stateChangeBoundaryPayload`。实测回复：「联系人资料变更、任务或提醒都要先确认。Orbit 已停在本地确认边界：**没有调用模型**……」`entityDraft: undefined`，草稿链路完全没机会跑 |
| 活动草稿正常，写入被服务拒绝 | `confirm` 返回 503，原文 `A source note is required before staging a manual event in the mock.`；卡片保持 pending、原因透传、可重试 |
| 两个适配器都已写好并有测试 | `features/orbit-ai/entity-drafts/adapters.ts` 的 `createContactDraftAdapter`／`createEventDraftAdapter`；`tests/services/entity-draft-adapters.test.ts` 覆盖成功、服务拒绝、无回读 id 三种情况 |
| 人脉是唯一的两段式 | Orbit 没有"直接建联系人"的接口，确认后落成 contact draft，再走既有确认页转正 |
| 状态机与卡片不需要改 | 待办／笔记／日程已用同一条链路在真实库走通 |

**判断 1：护栏不能简单删掉，要收窄。** `stateChangeBoundaryPayload` 存在的理由是"未经确认不得写入联系人"。草稿卡现在正好提供了这个保证，但护栏是按**措辞**拦截的，它不知道下游有没有确认门。可行方向是让它只拦"要求直接生效"的措辞，放行"起草/添加为联系人"这类进入草稿卡的请求；**必须保留一条反例测试**：绕过草稿卡的直接写入企图仍然被拦。
**判断 2：活动的 source note 前置条件要查清是产品规则还是 mock 遗留。** 错误文案里有 `in the mock` 字样，需要确认 live 实现是否也强制。若是产品规则，则草稿卡应在确认前就提示需要来源笔记，而不是等到写入失败。
**判断 3：不因为放行而降低"确认前不写"的保证。** 任何改动后，`liveDatabaseWriteExecuted` 在确认前必须仍为 false。

## 范围与文件

- orbits：`features/orbit-ai/live-agent-runtime.ts`（护栏收窄）、活动创建的 source note 前置条件所在处（待第一步确定）、对应测试。
- 排除：改草稿状态机、卡片规格、其余三种实体的写入路径；改联系人确认页本身。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0093-01 | 护栏收窄后，"把某某添加为联系人"出人脉草稿卡；确认后落成联系人草稿并可跳转确认页 | 真实库走通记录 |
| SC-0093-02 | 绕过草稿卡的直接写入企图仍被拦截 | 反例测试 |
| SC-0093-03 | 活动 source note 前置条件查清并给出处置；活动可从草稿卡确认创建，或在确认前就说明缺什么 | 真实库走通记录 + 结论 |
| SC-0093-04 | 两种实体：未确认前 `liveDatabaseWriteExecuted` 恒为 false；重复确认不重复写 | 真实库计数前后对照 |
| SC-0093-05 | 无回归：两端 typecheck 0；orbit-ai 与 acquisition 定向集通过 | 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0093-entity-draft-remaining-writes`。2. 查清两处阻挡的确切语义。3. 护栏收窄方案 → **等用户同意**。4. RED→GREEN。5. 真实库两种实体各走通一次 → 收口。

## 失败与交接

护栏收窄未获同意则只做活动那一半，人脉记为 blocked；不得为了让人脉走通而绕过护栏另开一条写路径。
