# Sprint 0016 — 导航、字号与原生验收

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-09导航、R-12原生；基于0014／0015界面稳定版本。
**目标:** 对稳定主链路给出导航、字号、键盘与设备行为的真实原生验收结果。

## 进入条件与基线

0014／0015完成；非空授权样本、Simulator和必要实体设备／Android可用；涉及Dynamic Type补丁的专项方案已批准且实现已交付，否则该项不能通过。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。若专项原生修复尚未规划，应在本轮启动前取得明确前序计划，而不是临时把node_modules加入白名单。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `docs/superpowers/plans/2026-09-08-app-wide-native-qa-matrix.md`
- `docs/verification/2026-09-13-app-connectivity.md`
- `tests/initial-route.test.ts`
- `tests/mobile-route-access.test.ts`
- `tests/route-parity.test.ts`
- `tests/ink-signal-shell.test.ts`
- `tests/native/task-title-layout.mjs`
- `tests/native/conversation-layout.mjs`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 现场擅自修改RN依赖／原生补丁、重做视觉、为非空样本创建真实业务记录。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0016-01 | 冷启动、四根页、IORBIT进入／关闭、深链／登录回跳、无历史返回与失效目标逐项符合预期。 | 既有导航测试和同版本Simulator实际路径；通知直达需真实有效对象。 |
| SC-0016-02 | 浅／深色、键盘、安全区、触控与三语长内容不遮挡主操作。 | 集中原生截图／操作证据，重复场景复用同一证据。 |
| SC-0016-03 | 普通／大字号与运行中双向多次Dynamic Type切换不裁字、不丢稿／焦点。 | 真实AX测量和切换过程；旧待办标题32→64证据只覆盖旧普通字号场景。 |
| SC-0016-04 | VoiceOver、实体iPhone相关能力和Android返回有独立结果。 | 各设备／能力实际证据；不存在设备即blocked，不用RNW或iOS代替。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** I：原生整合检查；已有同候选版本全量可复用，不因纯记录再重复跑。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/initial-route.test.ts tests/mobile-route-access.test.ts tests/route-parity.test.ts tests/ink-signal-shell.test.ts
```

如果缺当前候选版本集成结果，npm test与npm run typecheck各一次；git diff --check。既有native脚本按其实际用法和uv约束执行，不猜参数。
**不额外运行：** 不做同页面无意义多份截图或Lighthouse；发现需代码修复而不在白名单时报告失败，交Planner另行处理，不启动第二轮Generator。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
