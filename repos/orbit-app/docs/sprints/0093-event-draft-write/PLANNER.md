# Sprint 0093 — 活动草稿写入：解开 source note 前置条件

**Plan revision:** 2（revision 1 含人脉；2026-09-19 用户决定放弃人脉那条路，本版删去）。
**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 0085 设计案授权的拆分。
**单一目标:** 让活动也能从草稿卡确认创建，或在确认前说明缺什么。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0085 合并后的 `chat-agent`。未启动，run_count = 0。
**进入条件:** 本机 `orbit_test` 测试库可用（2026-09-19 起 real-PostgreSQL 测试指向它）。

## 已查明的事实

| 事实 | 证据 |
| --- | --- |
| 草稿生成正常 | live 实测：`1. draft: event "关西跨境商务对接会" state=pending_confirmation` |
| 写入被活动服务拒绝 | `confirm` → 503，原文 `A source note is required before staging a manual event in the mock.`；卡片保持 pending、原因透传、可重试 |
| 失败可见性按设计工作 | 这一条不是 bug，是 0085 的失败路径按预期运行 |
| 适配器已写好并有测试 | `createEventDraftAdapter`；`tests/services/entity-draft-adapters.test.ts` 覆盖成功与服务拒绝两种情况 |
| 错误文案里有 `in the mock` | 需要确认 live 实现是否也强制这条前置条件 |

**判断 1：先分清产品规则与 mock 遗留。** 文案里的 `in the mock` 提示这可能只是 mock 分支的限制。若 live 不强制，则这是配置／路由问题；若 live 也强制，则它是产品规则，草稿卡应当提前告知。
**判断 2：不为了让它通过而绕开活动服务。** 写入必须继续走 `createEventCrudAndImportService`，不新开 agent 专用写路径——这是 0085 已确立的边界。
**判断 3：确认前不写的保证不受影响。** 任何改动后 `liveDatabaseWriteExecuted` 在确认前必须仍为 false。

## 范围与文件

- orbits：活动创建的 source note 前置条件所在处（`features/events/event-crud-and-import/*`，具体在第一步确定后按 RULES 第 0 节登记）、必要时 `features/orbit-ai/entity-drafts/adapters.ts` 的提前校验、对应测试。
- App：若采用"确认前告知"，则改 `src/view-models/ai-entity-draft.ts` 的卡片规格与 i18n。
- 排除：人脉的任何创建路径；改草稿状态机与其余三种实体的写入。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0093-01 | source note 前置条件的性质写清（产品规则 / mock 遗留） | 源码位置 + 结论 |
| SC-0093-02 | 活动可从草稿卡确认创建，或在确认前说明缺什么并给出补救入口 | 真实库走通记录 |
| SC-0093-03 | 未确认前不写；重复确认不重复写 | 真实库计数前后对照 |
| SC-0093-04 | 无回归：两端 typecheck 0；orbit-ai 与 events 定向集通过 | 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0093-event-draft-write`。2. 查清前置条件性质。3. 按结论决定修法并登记。4. RED→GREEN。5. 真实库走通 → 收口。

## 失败与交接

若该前置条件属于产品规则且补来源笔记的交互超出本 Sprint，则只落"确认前告知缺什么"，把补来源的入口单列，不把写入失败当作已修。
