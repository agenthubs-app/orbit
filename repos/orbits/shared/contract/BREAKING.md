# 契约破坏性变更登记（R08）

`shared/contract` 只加不改：可以加新类型、加可选字段、给枚举加值、把字段类型放宽。
`scripts/contract-snapshot.mjs`（和 `tests/contracts/contract-append-only.test.ts`）按 TypeScript 解析后的形状
（含 `extends`、交叉类型、内嵌对象、类型参数、`index.ts` 的导出名单）拦下：

- 删类型、字段或 `index.ts` 的导出（改名等于删）；
- 可选字段改成必填，或给已有类型加必填字段（包括经新的 `extends` 带进来的）；
- 枚举少了值；
- 字段类型不是旧类型的放宽。加联合成员算放宽，但 **`null`、`unknown`、`any` 不算**，必填字段加 `undefined` 也不算：已经发出去的客户端会读到它处理不了的值；
- 改了类型参数。

文件头注释里写了 JSDoc 标签 `@draft` 的契约（目前只有 `plan-v2.ts`，到 R22 定稿）不进快照、不检查。
运行时 schema 与契约是否一致，由 `tests/contracts/redesign-schema-parity.test.ts` 检查（R08 新增的 7 组）。

**读取与发布口径**（README 通用规则 10，**产品负责人已确认（2026-10-10）**）：响应宽进（不用 `.strict()`，枚举用 `tolerantEnum` / `knownValues`），请求和服务端写入严格。
`minSupportedAppVersion`（契约 11）在首次正式发布之后才启用：发布前破坏性改动在本表登记后直接改，App 重新发布即可；
发布后，已装版本读不了的变更要先发一版能读的 App，或同时抬高 `minSupportedAppVersion`。

确实要破坏时，在下面的表格里登记一行（每一列都要填；id 用反引号，和检查报错里的 id 一致；
不完整的行、表格外的文字都不算），然后 `node scripts/contract-snapshot.mjs --write` 更新快照，
提交信息以 `contract:` 开头并注明「App 需要同步」。

| 日期 | id | 改动 | 原因 | 甲乙同意 | App 跟进 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-10 | `index.ts::(exports)=PlanV2Summary` | R22 计划 v2.2 契约定稿：`PlanV2Summary` 改为 `PlanV2HomeSummary`；`PlanV2SummaryResponse` 从 `{ summary, score }` 改为 `{ current, goals }`；`PlanScoreView.total` 不再限 ≤100（不封顶）、`byType` 改为 `segments`；`PlanV2Step` 的 `id / personTypeKey` 改为 `key / personTypeKeys[]`；`PlanV2PersonType` 字段整套更换（`plan-v2.ts` 在 R08 是 `@draft`，不在快照里，这里一并记录） | R08 草案只定了顶层，R22 按 plan-v2.2/DESIGN.md 定全字段；分数按设计不封顶 | 甲（执行）、乙（用户 2026-10-10「都按推荐，开工 R22」） | 同一提交带 App 同步副本；App 尚无计划界面，只有 `tests/contract-fixtures-parse.test.ts` 读它 |
| 2026-10-10 | `index.ts::(exports)=PlanIntakeSummary` | R22 删除 `PlanIntakeSummary`，生成流程的形状由 R23 的 `PlanIntakeView` 取代 | 草案里的 intake 摘要不够表达背景三块、≤5 问与前提（DESIGN §3.2） | 甲（执行）、乙（用户 2026-10-10「都按推荐，开工 R22」） | 同上；App 没有使用方 |
