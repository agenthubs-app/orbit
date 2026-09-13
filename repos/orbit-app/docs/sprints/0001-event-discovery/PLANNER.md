# Sprint 0001 — 活动筛选收尾

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-09；承接现有未提交修复，不重新实现。
**目标:** 交付当前活动发现截断修复；保留每页8条、现有组合筛选与真实活动ID。

## 进入条件与基线

用户恢复执行；四文件差异仍属于本功能。已批准活动页面设计与原地提交安排继续有效；不要求等待报名问卷服务恢复。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。暂停点HEAD为62bbe0af1，四文件56+/8-；变更前103/103，5项RED→最终5/5，类型通过。首次GREEN为3/5，两个测试漏重新展开菜单，修正后通过。日志在/tmp/orbit-r09-discovery-{baseline,red,green,green-final,types}-20260913.log；上次2574全量只覆盖修改前版本。已有RED不重做。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `src/screens/events/EventsScreen.tsx`
- `src/view-models/events.ts`
- `tests/ink-signal-events.test.ts`
- `tests/screen-state.test.ts`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 账号时区、首页布局、报名写入、推荐业务规则、Web/API修改；不为验收创建真实活动。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0001-01 | 17个地点／话题选项全部可到达，第9和第17项筛出正确活动并保留真实导航ID。 | 现有新增两项实际/events路由交互；不是字符串源码检查。 |
| SC-0001-02 | 单活动第4个话题可搜索／筛选；空白与重复标签不制造额外选项。 | 现有第4标签交互及screen-state完整话题断言。 |
| SC-0001-03 | 选择／清空后列表仍8→16→全部／收起，数量与组合筛选保持原语义。 | 两个完整相关测试文件的分页和组合筛选用例。 |
| SC-0001-04 | 既有Simulator活动页可只读进入；真实公开集合范围如实说明，操作不新增报名／推荐写入。 | 原账号只读GET和页面核对；样本不足9项时该边界使用受控测试，不伪造原生覆盖。 |
| SC-0001-05 | 共享列表／详情话题转换的其他消费者不回归，修改仅限四个文件和报告。 | 一次全量、类型、实际diff与暂存detect_changes。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** H：eventTopics impact已为CRITICAL，2个直接转换函数，间接30符号／5模块。两个目标文件后跑一次全量，覆盖传递消费者；不重复另跑一套与全量完全重叠的宽回归。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-events.test.ts tests/screen-state.test.ts
```

必须 npm run typecheck、npm test、git diff --check；原生只做SC04的活动冒烟。没有契约变化，不单独重复同步测试。
**不额外运行：** 不重新做已完成R-11前后台验收、不触发AI/OCR、不跑全平台视觉矩阵。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
