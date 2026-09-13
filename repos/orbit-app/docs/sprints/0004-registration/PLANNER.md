# Sprint 0004 — 报名资格与答案回读

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-04；保留已完成问卷脏稿、版本、公开详情和网络失败停写。
**目标:** 用户可按权威资格完成报名、取消和重报，答案与状态能被业务后续使用。

## 进入条件与基线

0002／0003结果可用；问卷真实500恢复；B2发布资格、允许动作、服务端时间、问卷版本和匹配消费语义；具备授权活动／账号。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。真实问卷500仍是提供方问题；本Sprint不修Web。若关联页面消费缺契约，进入前明确，不由Generator新增未批准接口。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `src/screens/events/EventRegistrationScreen.tsx`
- `src/screens/events/EventDetailScreen.tsx`
- `src/view-models/event-registration.ts`
- `tests/event-registration-interactions.test.ts`
- `tests/event-registration-view-model.test.ts`
- `tests/ink-signal-event-detail.test.ts`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 用本地日期代替服务端资格、改活动发布规则、清除真实答案、为页面造报名集合API。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0004-01 | 未开放／截止／结束／取消／满额／待审／已报名与取消重报按服务端允许动作显示和提交。 | 参数化资格矩阵及临界时间；不只验一个成功状态。 |
| SC-0004-02 | 问卷变化、刷新和失败仍保留可恢复草稿，旧版／失败读取不能继续提交。 | 既有registration交互加本轮版本／冲突边界。 |
| SC-0004-03 | 重复动作不意外重复报名，只有正确账号／活动／版本回执才确认成功。 | 同步防重、幂等／迟到回执、权限撤销与请求归属。 |
| SC-0004-04 | 成功后本人状态、人数、详情、相关列表、首页／日历按实际契约回读一致。 | 授权报名／取消／重报的同记录回读；不能只验证触发GET。 |
| SC-0004-05 | 个性化答案保持原值，匹配消费的是同一账号、同一活动的答案。 | 真实授权样本及后续匹配证据，Web↔App回读；无证据则受阻。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** H：报名写入、资格和跨页状态。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/event-registration-interactions.test.ts tests/event-registration-view-model.test.ts tests/ink-signal-event-detail.test.ts
```

npm run typecheck、一次提交前npm test、git diff --check；仅契约改变时同步检查。SC04／05有真实写入前置。
**不额外运行：** 不重跑名片或完整原生主题矩阵；缺问卷不能用旧缓存或匿名401冒充。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
