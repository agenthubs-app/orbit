# Sprint 0013 — 三语基础与账号、首页、设置

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-12基础与第一组页面；不一次翻译全App。
**目标:** 建立经批准的语言／回退基础，并使账号、首页、设置在中日英下可用。

## 进入条件与基线

0009时区、0011首页范围稳定；D6批准三语范围与账号／设备回退、切换和原文保留策略；基础设施设计已审阅。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。新文件路径是待设计确认的候选；若当前基线已有等价基础设施，复用并把确切路径写回Planner再启动，不另建平行i18n系统。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `app/_layout.tsx`
- `src/screens/profile/AccountAuthScreen.tsx`
- `src/screens/profile/ProfileScreen.tsx`
- `src/screens/home/HomeDashboardScreen.tsx`
- `src/screens/settings/SettingsScreen.tsx`
- `tests/app-wide-account.test.ts`
- `tests/ink-signal-profile.test.ts`
- `tests/ink-signal-settings-account.test.ts`
- `tests/home-dashboard-interactions.test.ts`

条件性新建（先满足进入条件；当前不存在不表示已实现）：
- `src/i18n/OrbitLocaleProvider.tsx`
- `src/i18n/messages.ts`
- `src/i18n/zh.ts`
- `src/i18n/ja.ts`
- `src/i18n/en.ts`
- `tests/app-locale-core.test.tsx`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 重新翻译姓名／公司／聊天原文、改依赖或全部主题、提前改下一组页面。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0013-01 | 账号语言与设备回退按D6唯一策略选择，缺失／非法语言能稳定回退。 | 真实Provider与路由渲染，不只检查字典key存在。 |
| SC-0013-02 | 账号／资料、首页和设置主链路在中日英可完成原操作。 | 三语控件、错误与状态交互；服务端原文原样显示。 |
| SC-0013-03 | 切换语言不丢当前输入、身份或导航目的，跨账号不继承不属于它的偏好。 | 脏稿／切号／恢复回归。 |
| SC-0013-04 | 长翻译仍可读、可点，普通与大字号不裁剪关键控件。 | 相关RNW实际尺寸和一次必要原生长文冒烟。 |
| SC-0013-05 | 其他页面保持原行为并可逐步迁移，既有日期口径不被语言切换改变。 | 一次共享基础设施全量与0009日期不变量。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** H：共享语言Provider／根layout，必须检查全局消费者。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/app-wide-account.test.ts tests/ink-signal-profile.test.ts tests/ink-signal-settings-account.test.ts tests/home-dashboard-interactions.test.ts
```

本轮行为需要新增的测试：`tests/app-locale-core.test.tsx`。创建后必须并入上述目标命令；仅跑旧测试不能证明新增SC。

新语言测试创建后加入；npm run typecheck、一次npm test、git diff --check。D6未批准不新增基础设施。
**不额外运行：** 本轮不跑人脉／活动全部三语截图，它们由0014覆盖；不翻译业务数据。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
