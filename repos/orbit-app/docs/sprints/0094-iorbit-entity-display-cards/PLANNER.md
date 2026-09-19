# Sprint 0094 — 对话里五种实体的统一小卡片

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** TODO 第 4 条的「展示」那一条；0085 设计案 SC-0085-02 未完成的那一半。
**单一目标:** 五种实体在对话里用同一种卡片规格展示，点卡进详情，正文不再重复卡片内容。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0093 合并后的 `chat-agent`。未启动，run_count = 0。
**进入条件:** 无。设计案已批准（0085 的 artifact 里「展示：五种实体，同一张小卡片」一节即为本 Sprint 的规格）。

## 已查明的事实（实测，非推断）

| 事实 | 证据 |
| --- | --- |
| 展示层是五种各不相同的东西 | `AiContactArtifactPanel`（人脉）、`EventInlinePanel`、`FollowupsInlinePanel`、`ScheduleInlinePanel`；**笔记没有任何卡片** |
| 人脉的数据是结构化的，卡片也确实出得来 | 真实 API 问"谁可以帮我引荐餐饮行业的人"→ `contact_recommendations` artifact，`generatedView.sections[].items[]` 带 id／body／actions／evidenceIds；App view-model 产出 1 张卡（标题"可优先联系的人"） |
| 但正文把同一批人又讲了一遍 | 同一次回复的 `assistantMessage`："近藤大輔 · 门店经营者（蓝海科技）— 关系强度 68、业务相关度 78……"，与卡片内容重复 |
| 0085 没做这一半 | 0085 REPORT「一处报告错误」一节 |
| 规格已在设计案里定好 | 类别图标 + 类别名 + 一行标题（省略）+ 一行关键属性 + 一行"为什么出现在这里"；整卡可点 |

**判断 1：卡片组件只做一个，五种实体喂同一个组件。** 现在四个面板各写各的，是这次不一致的根源；再加一个"笔记面板"只会让它变成五个。新组件 + 五个 kind 的映射，与 0084 把四角色规格收进 `rowRoleStyles` 是同一种做法。
**判断 2：正文重复要在服务端收口，不是在客户端裁剪。** 模型之所以把人名又列一遍，是 synthesis 指令里写着「Briefly point out the strongest matches by name and why they fit」。卡片已经把这件事做了，指令要相应改：让它说卡片**没有**说的（取舍理由、下一步），不要复述卡片已有的字段。客户端做正则裁剪会把有用的话一起裁掉。
**判断 3：笔记的卡片需要数据源确认。** 其余四种都有现成 artifact／panel 数据；笔记要先查清对话里拿不拿得到笔记记录，拿不到就说明缺口，不编一个空卡。

## 范围与文件

- App：新建 `src/screens/ai/cards/AiEntityCard.tsx`（统一卡片）+ `src/view-models/ai-entity-card.ts`（五种 kind → 卡片字段的映射）；改 `AiConversationScreen.tsx` 用它替换四个面板；i18n 三语。
- orbits：`features/orbit-ai/gemini-provider.ts` 的 synthesis 指令（正文不复述卡片字段）。
- 测试：卡片 view-model 单测（五种 kind × 字段映射 × 点击目标）、屏幕测试、synthesis 指令的定向断言。
- 排除：改各实体的详情页；改草稿卡（0085 已定）；人脉的创建路径（0093 已放弃）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0094-01 | 五种实体共用一个卡片组件，字段映射由 view-model 决定 | 单测：五种 kind 各自的标题／属性／来源行 |
| SC-0094-02 | 每种卡片整卡可点，跳到该实体既有详情页 | 单测 + 屏幕测试 |
| SC-0094-03 | 正文不再复述卡片已列出的人名与属性 | synthesis 指令改动 + 真实问答前后对照 |
| SC-0094-04 | 笔记有卡片，或写明数据源缺口 | 真实问答记录 |
| SC-0094-05 | 无回归：两端 typecheck 0；AI 相关定向集与两端全量 | 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0094-entity-display-cards`。2. 五种实体各跑一次真实问答，记录现状数据形状。3. view-model + 卡片组件 RED→GREEN。4. 替换四个面板、补笔记。5. 改 synthesis 指令，前后对照。6. 收口。

## 失败与交接

笔记若确实拿不到记录，本 Sprint 只交付四种并写明缺口，不做空卡。正文去重若影响回答质量（例如卡片被折叠时信息丢失），保留正文并记录，不为了"不重复"牺牲可读性。
