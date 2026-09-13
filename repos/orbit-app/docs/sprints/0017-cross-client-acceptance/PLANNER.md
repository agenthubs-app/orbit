# Sprint 0017 — 真实业务与双向跨端收口

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-01、R-14与R-00～R-12剩余必需验收；不包含后期笔记。
**目标:** 在共同版本和授权记录上完成主链路与五类记录的双向跨端验收。

## 进入条件与基线

0003～0016的必要行为、契约、决策和设备前置已具备；共同App/API版本、普通／主办方／双用户、隔离对象与真实操作授权就绪；原AI/OCR账本可核。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。任一必需条件失败／受阻就保留未完成并交Planner，不自动再生成。成功仅代表主链路，不宣称包含0018～0019的整个原计划完成。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `docs/verification/2026-09-13-app-connectivity.md`
- `docs/superpowers/plans/2026-09-08-app-wide-native-qa-matrix.md`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 将当前缺功能改称不适用、临时修Web／密钥／迁移、向真实陌生人发信、未授权发布。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0017-01 | 注册／Google→资料→首页→搜索→报名→首页／日历主链路的字段、答案、状态、人数和匹配一致。 | 授权同账号实际场景及L1～L5分层记录。 |
| SC-0017-02 | 名片→一个联系人→授权字段→@历史，以及邀请→绑定→聊天→撤权拒绝都可复现。 | 授权双用户／真实摄入与必要失败场景；不以草稿冒充发送。 |
| SC-0017-03 | 主办方运营／审核／签到有正确角色和非空样本，普通账号同入口受控拒绝。 | 实际角色／回执／回读及权限证据。 |
| SC-0017-04 | 资料、联系人授权字段、AI会话、任务／日程、报名分别完成Web写→App回读和反方向。 | 同一脱敏ID／版本／摘要、允许刷新方式；只有一个方向不通过。 |
| SC-0017-05 | 消息已读／提醒／推送及最终候选版本完整验证和交接齐全，余项如实保留。 | 一次全量、类型、同步、必要实体推送／设备记录；App/API版本与另一端影响。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** I：主链路最终整合验收。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/domain-sync.test.ts
```

npm test、npm run typecheck、git diff --check；同步用例已包含在同版本全量时直接引用结果，不重复上述命令。每个SC必要真实操作由单一owner执行，费用不重置。
**不额外运行：** 不重复已经在同版本充分验证且无影响变化的原生场景；不把修复生成混进验收Sprint。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
