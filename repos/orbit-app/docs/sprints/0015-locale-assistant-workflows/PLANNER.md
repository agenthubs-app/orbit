# Sprint 0015 — AI、事项与收件箱三语

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-12第三组；基于0006、0010、0012已稳定功能。
**目标:** 完成IORBIT、待办／日历、收件箱的三语UI并保留用户内容与草稿。

## 进入条件与基线

0013语言基础稳定；0006／0010／0012就绪；0014已释放共享字典写锁；D6该组已批准。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。0016再做全链路原生矩阵；本轮必要SC仍需真实可观察证据，不能只统计语言key数量。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `src/screens/ai`
- `src/screens/tasks`
- `src/screens/today`
- `src/screens/schedule`
- `src/screens/inbox`
- `src/i18n/zh.ts`
- `src/i18n/ja.ts`
- `src/i18n/en.ts`
- `tests/ink-signal-ai-conversation.test.ts`
- `tests/ink-signal-tasks.test.ts`
- `tests/ink-signal-schedule.test.ts`
- `tests/ink-signal-inbox.test.ts`

条件性新建（先满足进入条件；当前不存在不表示已实现）：
- `tests/app-locale-assistant-workflows.test.tsx`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 自动翻译个人对话／邮件、改模型／工具权限、重新实现前后台和事项协议、扩大Provider职责。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0015-01 | IORBIT消息控件／历史／错误在三语可用，输入、引用ID与历史原文保留；输出语言只按现有或批准契约传递。 | 已有会话路由加三语交互与请求语言断言，UI切换不自动生成，不为文案验收重复付费。 |
| SC-0015-02 | 待办／个人日程／日历UI三语可编辑和回读，日期时区不随文案偏移。 | 相关路由与0009日期不变量，失败保稿。 |
| SC-0015-03 | 收件箱／提醒UI三语可用，正文与未发送稿保留，状态回写语义不变。 | inbox交互与已读／权限边界，不重新请求真实消息造样本。 |
| SC-0015-04 | 长翻译、键盘和大字号下主要操作可达；语言切换不重挂整屏丢稿。 | 相关布局／草稿测试和最小原生冒烟。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** L候选，仅文案消费；共享状态／生成／写入实际受影响时升级H。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-ai-conversation.test.ts tests/ink-signal-tasks.test.ts tests/ink-signal-schedule.test.ts tests/ink-signal-inbox.test.ts
```

本轮行为需要新增的测试：`tests/app-locale-assistant-workflows.test.tsx`。创建后必须并入上述目标命令；仅跑旧测试不能证明新增SC。

创建三语测试后加入；npm run typecheck、git diff --check；H或三个L集成门槛触发一次全量。启动前把Screen目录收窄为具体文件。
**不额外运行：** 不因翻译调用真实模型或发送邮件，不重复全App多设备矩阵。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
