# Sprint 0094 报告 — 对话里五种实体的统一小卡片

**状态:** 见登记表（**partial**）。**run-01。**

## 先用人话说

用户在 Simulator 上试，说"跟人相关的还是没有出现卡片"。查下来有三层，一层比一层深：

1. **他试的不是新代码。** Simulator 装的是 dev build，没有内嵌 JS bundle，要靠 Metro 供包；而 Metro 之前被我为了腾测试资源杀掉了。那个 App 一直在跑约 07:02 缓存的包，早于 0085/0087/0089/0090/0093。已重启 Metro 并重新打包。
2. **展示卡片这半边 0085 压根没做**，而我在 0085 报告里把它记成了 pass。已更正，见 0085 REPORT「一处报告错误」。
3. **真正的根因在服务端持久化**，见下。

## 已完成并验证

| 做了什么 | 证据 |
| --- | --- |
| 统一卡片 view-model（五种 kind → 同一套字段） | `tests/ai-entity-card-view-model.test.ts` 7/7，**夹具是五种实体各问一句真话后抓的真实 payload**，不是我想象的形状 |
| 统一卡片组件，整卡可点进详情 | `AiEntityCard` / `AiEntityCardList`；`ink-signal-ai-conversation` 102/102 |
| 人脉真实走通 | phoneweb 截图：短判断 + 8 张 `人脉 / 近藤大輔 / 门店经营者 · 蓝海科技 · 2 周前 / 近藤大輔目前处于持续培育阶段。` |
| 正文不再复述卡片内容 | 改 synthesis 指令。前：整屏列 8 个人名＋关系强度分数，卡片被挤到屏外；后：两三句"先找谁、差距在哪"，卡片在首屏可见 |

## 仍未完成：其余四种在"可靠发送"后没有卡片

**根因（服务端）**：`features/orbit-ai/storage/orbit-agent-chat-session-artifact-reader.ts:10`

```ts
const otherKinds = new Set(["event_recommendations", "email_context", "followup_queue",
  "relationship_chat_context", "generic", "self_profile", "data_query"]);
```

第 49–50 行用它把**所有非人脉 artifact 过滤掉**，再用 `contactArtifactToDisplay()` 落盘——那个函数把 `kind` 写死成 `contact_recommendations`。

App 走的是"可靠发送"：回复先存成会话，再从**会话恢复**重新渲染。所以：

- 人脉：恢复里有 → 出卡片 ✅
- 待办／日程／笔记／活动：恢复里被过滤掉，`turns=0` → 没有任何可渲染的东西 ❌

实测印证：直接拿 API 回包跑 view-model，四种都能产出卡片（待办 4 张）；但查会话恢复接口，六个会话全是 `turns=0 artifactKinds=[]`。

**为什么没有顺手改**：这条链上 `displayItem` schema 带一条 refinement——`contactHref` 要么为 null，要么 id 必须以 `contact-recommendation:` 开头且 href 恰为 `/contacts/<id>`。这是跨端契约里带安全性质的校验（证据 id 与详情链接的绑定）。放宽它去容纳另外四种实体，是一次持久化层 + 跨端契约的改动，不适合在一次很长的会话末尾赶工。

## 与 PLANNER 的偏差

**1. 只替换了 artifact 驱动的那个面板，没动四个"内联面板"。** `PeopleInlinePanel` 等是**关键词启发式**触发、各自单独取数的"相关记录"功能，与"agent 这次找到了什么"是两回事。Planner 写的是"替换四个面板"，实际替换的是 `AiContactArtifactPanel`（artifact 驱动那个）。混为一谈会顺手改掉一个没要求改的功能。

**2. 笔记没有数据缺口。** Planner 判断 3 担心笔记拿不到记录；实测 `data_query` 会返回笔记 item，view-model 也能出卡。它的问题和待办／日程一样，都在恢复层被过滤。

**3. 渲染锚点从"匹配 message id"改成"最后一条 assistant 消息"。** 前者看着更严谨，但可靠发送路径会用客户端 id 重建会话消息，id 一对不上卡片就悄无声息地不渲染。文件里本来就有 `inlinePanelAnchorIndex` 这个惯例，沿用它。

## 命令与退出码

| 命令 | 结果 |
| --- | --- |
| 两端 `npx tsc --noEmit` | 0 / 0 |
| `tests/ai-entity-card-view-model.test.ts`（新增，真实夹具） | 7/7 |
| `tests/ink-signal-ai-conversation.test.ts` | 102/102 |
| orbits synthesis 邻接集 | 48/49（唯一失败是基线里就有的"无 API key 应失败"，环境里有真 key） |
| App 全量 | 见登记表 |

## 下一步

放宽会话恢复层，让它保留五种 artifact 而不只是人脉——含 `displayItem` 那条 href refinement 怎么按 kind 推导。单独立 sprint，因为它动的是持久化与跨端契约。
