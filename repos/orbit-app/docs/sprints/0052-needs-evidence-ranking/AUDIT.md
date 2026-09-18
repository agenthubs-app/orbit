# Sprint 0052 — 只读诊断

2026-09-16。固定 PhoneWeb 基线 `f7c8a15123b78cfa732db10c7642573b921f3dfe`，ROOT 基线 `8f00f91cd7e3637813e9b9d574b06f8dfefd1bf5`。下列需求匹配服务、契约、schema、App view-model 和列表组件的两基线比较没有差异；这是旧算法局限，不能将它归因于 Sprint 49 没有同步。

## 已查明

- `repos/orbits/features/contact-needs/scoring.ts` 的 `criteriaForNeed` 使用词典加中文分词。真实执行截图需求，得到六个条件：现在、在做、餐厅、ai、系统、一些。无业务意义的词占据分母，点餐没有成为独立业务条件。
- `scoreContactsForNeed` 给每个条件相同权重。只命中 ai 就得到 `round(100 / 6) = 17`。本次执行证实分母与单命中分数；未读取所有截图联系人实际资料，不能声称五个人每个都是同一证据来源。
- `containsAlias` 使用子串匹配，拉丁文短词存在误命中风险；词汇重复和不同语言同义词不应重复计分。
- `evidenceText` 合并角色、组织、简介、关系、证据及 tags。tags 可触发命中，但 `criterionMatch` 的证据候选未包含 tags，可能产生“命中了却没有原始依据”的结果。
- App `ContactNeedsMatchesContent.matchReason` 不使用服务端 reason，而是把 matchedCriteria 标签拼入本地化模板。日文模板为“一致：{labels}”，因此只改服务端 reason 不能解决用户看到的短句。
- 现有服务是只读确定性计算，不调用 AI，也不复用联系人的关系价值分。它在联系人查询前后复读需求版本，避免旧需求分数与新需求混合；新实现保留这项保护。
- 契约和 runtime schema 都将 scoringVersion 限定为 needs-lexical-v1。算法升级必须同时同步类型、schema 和消费者，不能仅改版本字符串。

## 诊断命令与边界

使用固定 Node 22、现有 tsx loader 和 CommonJS require 直接执行 criteriaForNeed，exit 0，六条件/17分如上。第一次 ESM named import 探针因该模块的 CommonJS 加载形式失败，随后修正加载方式；不把第一次失败列为通过。没有调用付费模型、修改数据库或重启服务。

ROOT 已预留全局编号 0052；0051 是另一项历史笔记 Sprint。0050 当前持有报名/取消和共用四字典锁。本 Sprint 只完成调查和规划，尚未派发 Generator；最终启动源、索引刷新、字典锁与唯一执行槽由 ROOT 固定后登记。
