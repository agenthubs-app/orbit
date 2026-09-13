# Sprint 0019 — 笔记建议与完整范围验收

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-13建议和R-14后期收口；依赖0018已交付原文／关联。
**目标:** 基于笔记版本生成可确认的事项建议，用户接受后只创建一次，并完成含笔记的最终验收。

## 进入条件与基线

0018完成；D5/B6/B8批准来源ID／版本、相关人脉、日期歧义、建议类型、接受幂等和原文变更规则；授权笔记／事项及费用前置就绪。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。没有批准的建议协议时不启动，不能用客户端推断补业务规则。实际执行结束必须报告原总目标尚欠哪些条件，即使本Sprint代码已经提交。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `src/screens/notes/NoteDetailScreen.tsx`
- `src/view-models/notes.ts`
- `src/screens/tasks/TaskDetailScreen.tsx`
- `src/view-models/today-tasks.ts`
- `docs/verification/2026-09-13-app-connectivity.md`

条件性新建（先满足进入条件；当前不存在不表示已实现）：
- `src/view-models/note-suggestions.ts`
- `tests/note-suggestions-interactions.test.tsx`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 读笔记自动创建事项、多人关联就复制任务、无声推断歧义日期、自动通知／外部日历写入。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0019-01 | 建议记录来源笔记ID／版本和相关人脉，日期歧义需用户确认。 | 真实契约映射与明确／歧义日期交互。 |
| SC-0019-02 | 用户确认前不创建；接受重试只创建一次，不因多人关联重复创建。 | HTTP边界和服务端幂等／实际事项回读证据。 |
| SC-0019-03 | 原文版本改变使旧建议重新校验，失败／拒绝不丢原文或输入。 | 失效建议、冲突和失败恢复场景。 |
| SC-0019-04 | 接受结果在笔记、人脉及首页／任务／日历的适用位置一致，Web↔App可回读。 | 同来源／事项ID和版本的真实双向结果。 |
| SC-0019-05 | 含笔记的原R-00～R-14要求逐项核对完成，失败和后期余项不隐藏。 | 最终一次全量／类型／同步、版本／费用／commit交接；缺任一必需项不宣称全部完成。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** H + I：建议接受写入、来源版本与最终整合。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contact-notes-view-model.test.ts tests/today-tasks-view-model.test.ts tests/schedule-view-model.test.ts
```

本轮行为需要新增的测试：`tests/note-suggestions-interactions.test.tsx`。创建后必须并入上述目标命令；仅跑旧测试不能证明新增SC。

新测试创建后加入目标命令；npm run typecheck、npm test、契约同步检查、git diff --check；同版本全量一次同时满足H/I。
**不额外运行：** 不重新生成整套App、不在成功后追加评分或优化轮。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
