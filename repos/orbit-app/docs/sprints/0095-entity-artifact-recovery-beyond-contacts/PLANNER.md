# Sprint 0095 — 会话恢复要保留五种实体，而不只是人脉

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 0094 未完成的那一半（0094 REPORT「仍未完成」一节）。
**单一目标:** 会话恢复保留五种实体 artifact，使 0094 的统一卡片在可靠发送后对五种都成立。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0094 合并后的 `chat-agent`。未启动，run_count = 0。
**进入条件:** 无。0094 已把客户端侧做好并验证。

## 已查明的事实（实测）

| 事实 | 证据 |
| --- | --- |
| 恢复层按 kind 过滤 | `features/orbit-ai/storage/orbit-agent-chat-session-artifact-reader.ts:10` 的 `otherKinds` 含 `event_recommendations`／`data_query` 等；第 49–50 行据此丢弃 |
| 落盘映射写死人脉 | 同文件用 `contactArtifactToDisplay()`，该函数（`shared/api-schema/ai-artifacts.ts:38`）把 `kind` 硬编码为 `contact_recommendations` |
| 实际后果 | 六个待办／日程／笔记会话的恢复接口全部 `turns=0 artifactKinds=[]`；而同样的 API 回包直接跑 view-model 能产出卡片（待办 4 张） |
| 客户端已就绪 | 0094 的 `aiEntityCardsFromArtifact` 对五种 kind 都有单测，夹具是真实抓包 |
| 带安全性质的校验 | `displayItem` refinement：`contactHref` 要么 null，要么 id 以 `contact-recommendation:` 开头且 href 恰为 `/contacts/<id>`——把证据 id 与详情链接绑定 |

**判断 1：refinement 不能简单删掉，要按 kind 推广。** 它保证"链接指向的就是这条记录"。五种实体各自的 id 前缀与详情路径是已知的（0094 的 `aiEntityRecordIdFor`／`hrefFor` 已经实现了这套映射），所以是把一条人脉专用规则推广成一张 kind→前缀→路径 的表，不是放宽。**必须保留一条反例测试**：id 前缀与 href 不匹配的条目被拒绝。
**判断 2：落盘形状要么按 kind 保留，要么统一。** `contactArtifactToDisplay` 写死 kind 是问题根源；优先让它保留真实 kind，而不是新增四个平行函数。
**判断 3：条目预算不变。** 现有 200 条 / 16 artifact / 131KB 的上限是防止恢复数据撑爆，放开 kind 不等于放开量。

## 范围与文件

- orbits：`features/orbit-ai/storage/orbit-agent-chat-session-artifact-reader.ts`、`shared/api-schema/ai-artifacts.ts`（`contactArtifactToDisplay`、`displayItem` refinement、`contactArtifactDisplaySchema` 的 `kind` 字面量）。
- App：`src/api/schema/ai-artifacts.ts` 的逐字副本需同步（`npm run sync:contract`）。
- 测试：恢复层五种 kind 各一例 + 链接不匹配的反例；App 侧 `sessionEntityCards` 五种 kind。
- 排除：改卡片规格（0094 已定）；改关键词内联面板；改人脉以外实体的详情页。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0095-01 | 恢复层保留五种 artifact，`turns` 非空 | 五种实体各问一句后查恢复接口 |
| SC-0095-02 | 重新加载会话后五种卡片仍在 | phoneweb 前后对照 |
| SC-0095-03 | 每种卡片链接指向自己的实体；前缀与路径不匹配的条目被拒 | 反例测试 |
| SC-0095-04 | 人脉原有绑定不被放宽 | 既有人脉用例不退化 |
| SC-0095-05 | 无回归：两端 typecheck 0、契约副本同步、两端全量 | 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0095-entity-artifact-recovery`。2. 把 refinement 推广成 kind→前缀→路径 表（含反例）。3. 让 `contactArtifactToDisplay` 保留真实 kind。4. 放开 `otherKinds`。5. 同步契约副本。6. 五种实体真实走通 + 重载会话 → 收口。

## 失败与交接

若某一种实体的 id 前缀与详情路径无法稳定推导，则该种记为缺口并保留过滤，不为了让卡片出现而放宽链接校验。
