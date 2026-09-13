# Sprint 0014 — 人脉、名片与活动三语

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-12第二组；复用0004、0007、0008业务语义。
**目标:** 将人脉、名片、活动发现／报名的UI迁入已稳定的三语体系。

## 进入条件与基线

0013提供稳定语言接口；0004／0007／0008功能和标签范围稳定；D6该组范围批准。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。共享字典由本Sprint独占，不能与0015同时写；若需并行，Planner先分离明确无重叠文件，不能由Generator临场改分工。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `src/screens/contacts`
- `src/screens/events`
- `src/view-models/contacts.ts`
- `src/view-models/events.ts`
- `src/i18n/zh.ts`
- `src/i18n/ja.ts`
- `src/i18n/en.ts`
- `tests/ink-signal-contacts.test.ts`
- `tests/ink-signal-card-review.test.ts`
- `tests/ink-signal-events.test.ts`
- `tests/event-registration-interactions.test.ts`

条件性新建（先满足进入条件；当前不存在不表示已实现）：
- `tests/app-locale-relationships-events.test.tsx`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 改报名资格、OCR结构化、联系人权限、复制服务端语言规则、修改语言Provider接口。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0014-01 | 人脉列表／详情／邀请的UI、错误和状态在中日英完整可用。 | 本组真实路由三语交互和授权边界；不是只检查静态字符串。 |
| SC-0014-02 | 名片摄入／复核／进度UI可切换语言，姓名／公司和OCR原文不被改写；输出语言只按现有或批准契约传递。 | 真实复核路由、长字段及请求／保存payload不变量，不为文案验收重复付费OCR。 |
| SC-0014-03 | 活动发现／详情／报名三语显示正确，筛选、答案与动作语义不变。 | 组合筛选和报名交互在三语下的有效／失败场景。 |
| SC-0014-04 | 切换语言和长文不会覆盖草稿、改变稳定ID或遮挡主要操作。 | 脏稿、动态语言切换、关键控件尺寸／原生必要冒烟。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** 先按L候选；不得改共享语言策略。实际修改共享view-model或影响权限／写入时升级H，提交前全量。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-contacts.test.ts tests/ink-signal-card-review.test.ts tests/ink-signal-events.test.ts tests/event-registration-interactions.test.ts
```

本轮行为需要新增的测试：`tests/app-locale-relationships-events.test.tsx`。创建后必须并入上述目标命令；仅跑旧测试不能证明新增SC。

新三语测试创建后加入；npm run typecheck、git diff --check；仅当实际impact升级H或达到三个L集成门槛时全量。启动前将两个Screen目录进一步收窄为实际文件列表，禁止目录级盲改。
**不额外运行：** 不重复模型／真实OCR调用；UI迁移不能重做后端业务。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
