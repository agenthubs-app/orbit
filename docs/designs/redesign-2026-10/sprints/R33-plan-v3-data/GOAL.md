# Sprint R33 — 计划 v3：数据、契约与事实层

## 要实现什么

服务端能存、读、校验计划初稿 v3 的新内容（目标结果、理由段、判定与信心、顺序理由、对比条、关键数字、风险、来源清单含网页来源），能按联系人累积备注里抽出的事实（不覆盖、不丢旧的、超长备注切段），并为联网搜索和准备卡登记好 AI 用途与配额。界面不动。

## 做完能看到什么

- 用 `schemaVersion: 3` 写入一份计划再读出来，新字段原样回来；旧的 `schemaVersion: 2` 计划照旧读写，页面没有任何变化。
- 给同一联系人连写三条备注（其中一条 3000 字），`contact_facts` 里是三条备注抽出的事实并集，每条带来源备注和日期，重复的事实只有一行；在备注页手动加一条事实也进同一张表。
- `ai_usage_ledger` 接受 `plan_search`、`plan_prep` 两个用途；契约快照只有新增，App 的同步副本跟上。

## 怎么验收

单元与集成测试：v2 / v3 往返、`checkDraftV3` 对四种坏输出的处置、事实累积与合并、切段抽取（mock provider，真实调用 0 次）、迁移 v8 在测试库前进后退。契约：`node scripts/contract-snapshot.mjs` diff 只有新增；App 仓库 `npm run sync:contract` 无差异后的 typecheck 通过。不涉及真实网络、生产库和部署。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。本页说明预期目标，不代表已实现；整体设计见 [plan-v3/DESIGN.md](../plan-v3/DESIGN.md)。
