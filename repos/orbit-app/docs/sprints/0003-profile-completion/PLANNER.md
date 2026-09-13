# Sprint 0003 — 注册与资料完成

**Plan revision:** 2（补入已确认生日精度与隐私规则）。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-03，复用固定资料替换已移除及现有草稿保护。
**目标:** 合法新用户或已有用户可按服务端判定补齐资料，再返回原本目标。

## 进入条件与基线

0002有B1/D2明确结论；提供方发布权威资料完成判定、必填范围与行业关联职位来源，Planner补入确切字段／版本并审阅；新／已有授权账号与Google回跳环境可用。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。后端profile完成判定和D2未确认时此Sprint不能ready。报告分开记代码测试、Google、资料写回与双端结果。

## 已确认的资料规则（2026-09-14）

- 姓名和行业必填，自我介绍选填；不新增公司／职位必填。
- 生日需要填写完整年月日，且仅本人可见；年月日精度已确认，不再作为产品待决项。生日按日历日期保存，不转换成受时区影响的时间戳。
- 生日不得出现在公开资料、其他用户的联系人资料投影或 AI 本人资料工具输出。旧账号缺生日不伪造日期；是否进入补全由获批的服务端完成判定统一处理。
- 上述决定不替代 B1 实际字段／版本、跨端写入边界、账号和 Google 回跳环境。技术范围补齐并审阅后才启动，不因生日精度确认直接标 ready。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `src/screens/profile/AccountAuthScreen.tsx`
- `src/screens/profile/ProfileScreen.tsx`
- `src/api/AuthSessionProvider.tsx`
- `src/view-models/account-auth.ts`
- `src/view-models/profile.ts`
- `src/view-models/mobile-profile.ts`
- `tests/account-auth-view-model.test.ts`
- `tests/ink-signal-profile.test.ts`
- `tests/app-wide-account.test.ts`

条件性新建（先满足进入条件；当前不存在不表示已实现）：
- `tests/profile-completion-interactions.test.tsx`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 擅自新增公司／职位必填、把活动目标写成长期资料、重做视觉、修改后端注册或Google配置。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0003-01 | 缺项用户进入补全，完整用户不会重复被拦截。 | 以真实发布的complete状态／字段构建两类路由交互，不由App猜条件。 |
| SC-0003-02 | 行业／职位按批准来源选择；生日保存完整年月日且仅本人可读，跨时区不变日；自我介绍及提供／寻找／话题等可选内容仍可自填，提取结果须本人确认保存。 | 受控选择／确认／提交与回读，闰日／无效日期、另一账号／公开资料／AI 输出不含生日的断言；不能只隐藏 UI。 |
| SC-0003-03 | 刷新、保存失败、版本冲突和切账号不会丢稿或串资料。 | 补全路由失败／隔离交互，复用现有profile回归。 |
| SC-0003-04 | 完成补全返回原活动／页面；非法目标按已有访问边界拒绝。 | 实际登录／资料路由与合法／非法next场景。 |
| SC-0003-05 | 授权注册与Google系统回跳后，同一用户资料可在App和Web回读。 | 必要原生OAuth及同字段双端证据；缺Google环境不能用按钮点击代替。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** H：账号／资料写入与通用鉴权会影响其他消费者。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/account-auth-view-model.test.ts tests/ink-signal-profile.test.ts tests/app-wide-account.test.ts
```

本轮行为需要新增的测试：`tests/profile-completion-interactions.test.tsx`。创建后必须并入上述目标命令；仅跑旧测试不能证明新增SC。

新增测试创建后加入同一目标命令；npm run typecheck、提交前npm test、git diff --check。契约更新时通过批准同步并跑同步检查。
**不额外运行：** 不重复OCR、活动运营或全部视觉回归；只验证本次账号／资料SC。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
