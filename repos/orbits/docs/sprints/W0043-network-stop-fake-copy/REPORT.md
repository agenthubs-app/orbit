# Sprint W0043 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 人脉概览、AI 人脉分析（结构／机会）、关系管线、分组详情页，在中英文界面下都不再出现后端调试英文（如「X added to the live relationship database」「Rule-based summary…」「Due today」），也不再出现编造的「173 天未联系」（SC-02、SC-05）。
  - 后端返回空时，每个区块显示自己的真实空态（SC-01）。例：本机 9 位联系人的账号打开「机会」，看到「当前没有优先行动建议」「暂无待唤醒关系」，以及关系目标和「生成计划」入口。
  - 只有区块读取失败或整页失败时，才显示「来源暂时不可用」；生成中显示「分析生成中」。概览和管线同样如此（见 review 处理）。
  - 英文界面下，系统分组名、最近动态（「New contact · 王敏」）、到期标签（Today or overdue／In 5 days）、分组详情洞察句，都是英文模板或用户原文（SC-03）。
  - 没有真实句子的结构诊断、结构洞察、机会 hero 整块不显示（W43-3）；W0050 之前不显示覆盖度分数和缺口（W43-2）。
- 仍未实现或未验证：见「交接 · 遗留项」，都是开工前就存在、不在本 Sprint 范围的问题。

## 运行记录

- 结果：本地 SC 全部 pass，等待协调者合并后标 completed。
- Generator：Opus 5.5，2026-10-02。Planner revision 4（SHA256 d02ea2c2…afe44e7）。run-01 中途被看门狗中断一次，从 checkpoint 续做同一个 run。
- 分支 sprint/W0043-network-stop-fake-copy，基线 00703fde。功能 SHA：e493eff3（实现）、ecd8214c（review 修复）。chat-agent 合并 SHA：见 README 运行记录。
- 档位 H。全量 npm test 对照：
  - 本分支 6252 项 / 失败 9 / 跳过 712；基线 6222 项 / 失败 9 / 跳过 712。
  - 新增失败 0，两边失败清单逐条相同。其中「the entire project typechecks」来自 .next/types 过期产物。
  - 基线跑法：把 10 个修改文件临时检出为 00703fde 版本后运行；3 个新增文件当时仍在工作树里，旧代码不引用它们，不影响对照。
- 收口集 14 个文件，133/133 通过，0 跳过。tsc 源码 0 错。
- 付费 AI 调用 0 次。未 push。
- 证据目录：~/orbit-sprint-evidence/web/sprint-W0043/run-01/
  - 20 张截图
  - page-text-check.json
  - shots-script.mjs
  - closure-set-final.txt
  - full-head.txt、full-base.txt、fail-new.txt（空）
  - sc04-diff-stat.txt
  - codex-review.txt
- 报告由协调者按 Generator 原文写入（子代理写文件被拦）。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0043-01 | pass | app-network-overview.test.tsx（夹具 A zh/en、逐区块失败、pending 覆盖区）；app-contacts-analysis-view-model.test.ts（夹具 A/B/C、整页 error） |
| SC-W0043-02 | pass | 用 network-debug-payload 夹具渲染概览、结构、机会、管线，zh/en 禁用片段 0 命中；视图模型白名单测试 |
| SC-W0043-03 | pass | app-network-copy.test.ts（15 个系统分组 id、dueLabel）；视图模型 zh/en 对照；概览最近动态；app-contacts-structure-detail.test.tsx |
| SC-W0043-04 | pass | sc04-diff-stat.txt 不含 shared/、features/、app/api/；5 个指定测试未改动且通过 |
| SC-W0043-05 | pass | 账号 verify-plan，5 个页面 × zh/en × 1440/375，0 命中；控制台只有 /api/inbox/summary 503（预先存在） |

## 假设与额外阅读

- 额外读过的文件及原因：
  - dashboard-summary-postgres-reader.ts、shared/compute/dashboard-{distribution,opportunity}.ts、features/connections/live-service.ts：取调试句原文，构造夹具。
  - contacts-view-model-adapter.ts：确认联系人 id 与 activityId 同源。
  - network-shell.tsx：只读 CSS。
  - orbit-language-server.ts：排查姓名被改坏的原因。
- 新增文件：
  - analysis/network-copy.ts：双语模板和封闭集映射。
  - tests/fixtures/network-debug-payload.ts：调试句夹具。
  - tests/pages/app-network-copy.test.ts：封闭集单测。
- 实现上的取舍：
  - AnalysisAction 删掉 evidence/steps 两个字段：这是后端句子，界面不渲染；示例数据同步删除。
  - coverage 只保留 { summary }。
  - "No due date" 显示为「未设截止 / No deadline」；"Due today" 显示为「今天到期或已逾期」。
  - 待唤醒列表显示公司名；示例模式保留示例的 reason。
  - 只有 coverage 和 goal 都可读时，才给「生成计划」入口。
  - 详情页洞察句用本页同一套「强/中/弱关系」叫法。
  - 区块加 data-network-section，方便按区域断言。

## review 处理（H 档，Codex 一次）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P1 概览：整页 error 被合并成「分析生成中」，最近动态还显示空态 | 采纳 | 显式区分 ready/pending/error；error 时显示「来源暂时不可用」；补 zh/en 测试（ecd8214c） |
| P1 管线：各种状态都折成「暂无建议」 | 采纳 | 按状态渲染；改正旧断言；补 zh/en × 5 状态矩阵测试 |
| P1 分析页覆盖区：缺 pending/unavailable 分支，「生成计划」入口无条件显示 | 采纳 | 按 coverage 与 goal 状态分支；逐区块失败夹具，按区域断言 |
| P3 英文洞察句语法错误 | 采纳 | 改为 "This group has N contacts; most are warm ties."，测试同步 |

## 交接

- network-copy.ts 是 W0049～W0052 双语文案的基础，提供：systemBucketName、dueLabelCopy、activityTypeLabel、activitySourceLabel、contactIdFromActivityId、actionLinkLabel、structureDetailInsight。
- 视图白名单规则（后端句子字段不进 ContactsAnalysisView）后续不得放宽。
- 四个 summary 目前是空串，等 W0049/W0050 用快照填回；填回后，组件会自动渲染对应的 hero 和洞察卡。
- 状态规则：ready/empty 带数据；pending 显示「分析生成中」；unavailable 和整页 error 显示「来源暂时不可用」。
- 夹具文件 network-debug-payload.ts 提供：夹具 A/B/B'/C、forbiddenHits()、networkSections()。
- 遗留项（都是开工前就有的问题）：
  1. localizeOrbitTree 在英文界面下改坏用户姓名（例：佐々木 → S々木），概览和管线都受影响；建议另开 Sprint，让它跳过用户数据字段。
  2. 管线卡片「下一步」显示系统生成的中文模板句，建议放进 W0055 或文案 Sprint。
  3. 全局布局的 /api/inbox/summary 返回 503。
  4. 375 宽度下，「建议动作」「待唤醒关系」标题竖排换行。
  5. 英文「1 groups」单复数，以及「依据 N 位」的人数口径，留给 W0052。
- 没有需要用户决定或授权的事项。
- 回退：git revert ecd8214c e493eff3。
