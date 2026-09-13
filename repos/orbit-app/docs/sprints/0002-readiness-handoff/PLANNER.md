# Sprint 0002 — 接口、授权与原生验收就绪清单

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-01及B1～B8、D决策和R-00～R-12运行前置的文档盘点。
**目标:** 把既有事实转成可接手的依赖／审批／最小原生验收清单，后续Generator只领取就绪目标。

## 进入条件与基线

用户恢复本Sprint；仅使用已有源码／文档和明确无副作用的静态检查，不启动真实业务请求。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。已有R-06缺引用DTO和R-07缺同卡协议已证实。只对未定论或新版本部分作有限调查；同假设只读诊断最多3次。后续Planners缺具体字段时先补完并审阅，不让Generator临场猜契约。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `docs/api-gaps.md`
- `docs/verification/2026-09-13-app-connectivity.md`
- `docs/superpowers/plans/2026-09-08-app-wide-native-qa-matrix.md`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 修后端、配置密钥、迁移、真实账号／推送／OCR操作；不重复实现已完成的AI、资料和前后台功能。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0002-01 | 每个后续Sprint的缺项被区分为缺协议、运行失败、产品决策或样本／授权，并有恢复条件。 | 当前计划、API缺口、相关源码及本Sprint报告逐项映射；不能把全部B编号称为接口不存在。 |
| SC-0002-02 | AI真实生成／续聊／保存和R-11已提交子功能被准确复用，不列为从零任务。 | 核对执行证据11.3与23节及Git提交；最新事实优先，旧失败保留。 |
| SC-0002-03 | 过时的固定资料替换和泛称ID POST续聊文档得到纠正。 | api-gaps的Profile／AI章节与当前源码、证据7／10／11.3一致。 |
| SC-0002-04 | Web恢复会话可能自动保存、批次GET可能初始化迁移，以及问卷／通知详情失败被分别交接。 | 只读源码链路和既有请求证据；标建议责任方未接单，不制造实际数据丢失结论。 |
| SC-0002-05 | 导航／设备最小矩阵只列真实缺测，并区分RNW、Simulator、实体相机／推送／Android。 | 既有矩阵增量diff和各场景前置；没有执行就不能填通过。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** D：只交文档，不改变产品行为。
在 App cwd，现有最小相关回归：
本轮无产品测试命令；执行 `git diff --check`，只做下面声明的文档事实／链接检查。

git diff --check；逐一验证修改文档链接／源码锚点和声明版本。无需typecheck或npm test。
**不额外运行：** 不跑产品测试／原生／HTTP，尤其不把GET当作无副作用的保证。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
