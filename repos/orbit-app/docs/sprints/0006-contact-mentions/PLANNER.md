# Sprint 0006 — 类型化 @联系人与 AI 入口

**Plan revision:** 2（记录已批准入口决定；执行范围仍待补齐审阅）。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-06；继承0005可靠会话，复用已批准D3边界。
**目标:** 用户能用稳定联系人ID提问，业务入口统一预填IORBIT且不提前生成。

## 进入条件与基线

0005完成；B3发送／响应／历史有类型化引用并按actor验权；按下方已确认的D3清单补齐执行范围与验证；存在授权同名联系人样本。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。当前发送parser会忽略自造contactIds字段，类型化协议未就绪前不能实现picker。D3产品入口清单已确认，不重复索要相同批准；文件白名单、模板上下文协议和逐入口验证仍须在启动前补齐并审阅。

## 已确认的入口决定（2026-09-14）

编号对应本次对话中基于当前 App 源码的 13 项盘点，不是 Sprint 编号，也不自动扩展到 Web 的同名或其他入口。用户已明确以下取舍；本节只记录决定，不表示执行已经启动。

| 入口编号 | 当前页面与按钮 | 已确认处理 |
| --- | --- | --- |
| 1 | 联系人详情：起草消息 | 用模板预填 IORBIT，不再以打开收件箱作为这项快捷操作的落点。 |
| 2 | 联系跟进：AI 起草、起草联系消息 | 两个入口都改为模板转入 IORBIT，不在业务页直接生成。是否合并按钮、最终按钮文案尚未设计，不把合并视为已批准。 |
| 3 | 收件箱回复编辑：润色草稿 | 用润色模板转入 IORBIT，带上待处理草稿；不在原页直接调用 AI 改写。 |
| 7 | 联系跟进：生成候选、生成提醒候选 | 两个入口都用对应模板转入 IORBIT，不在业务页直接生成待办或提醒建议。 |
| 4 | 聊天详情：生成摘要 | 取消此功能，不替换为摘要模板。由 0008 修订执行契约承接；本决定不授权删除历史数据或直接移除其他消费者仍使用的服务端接口。 |
| 5、6 | 关系图谱：生成画像；活动详情：换一句 | 保持现状，不做模板转接。 |
| 8、9 | 首页三条快捷提问；聊天列表的 Orbit AI 关系管家 | 保持现状。首页预填问题和聊天列表打开 IORBIT 的行为不在本次改造范围。 |
| 10～13 | 名片导入识别；个人资料提取；报名问答／活动画像；主办方匹配与分桌 | 所有流程内辅助入口保持原流程，不做入口迁移。 |

1、2、3、7 的共同规则：进入 IORBIT 时只准备可编辑模板和必要上下文，用户发送前不调用模型、不提前生成，也不自动发信或创建事项。已有草稿不因跳转被清空。联系人仍按本 Sprint 的稳定 ID 与权限契约引用，不以姓名拼接替代。

实施前尚需补齐：`FollowupsScreen.tsx` 及相应行为测试不在当前白名单，须先修订审阅；`RelationshipChatDetailScreen.tsx` 的摘要取消归 0008，不能在本 Sprint 越界修改。最终模板文案、上下文传递和返回编辑行为在技术设计中具体化。人脉分析行动简报等未编号入口，不因本次决定自动纳入迁移。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `src/screens/ai/AiScreen.tsx`
- `src/screens/ai/AiConversationScreen.tsx`
- `src/screens/contacts/ContactDetailScreen.tsx`
- `src/screens/contacts/ContactsDashboardScreen.tsx`
- `src/screens/inbox/RelationshipInboxScreen.tsx`
- `tests/ink-signal-ai-conversation.test.ts`
- `tests/ink-signal-contact-detail.test.ts`

条件性新建（先满足进入条件；当前不存在不表示已实现）：
- `src/screens/ai/ContactMentionPicker.tsx`
- `tests/ai-contact-mentions-interactions.test.tsx`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 把联系人姓名拼进prompt替代ID、把整库发给模型、擅自转接OCR／报名辅助例外、自动发信。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0006-01 | 按部分姓名／公司可检索，选择同名联系人时传的是所选稳定ID。 | 真实选择交互与HTTP契约断言；不只测试搜索控件。 |
| SC-0006-02 | 删除、无权限和跨账号引用明确失败，历史仍对应原ID。 | 受控权限／删除场景与历史回读；服务端工具权限单独确认。 |
| SC-0006-03 | 批准的业务入口只把待发送上下文带入IORBIT，用户发送前不调用模型。 | 每个转接入口的导航／预填／无自动POST，例外入口维持原功能。 |
| SC-0006-04 | 通用任务可不关联联系人；工具拒绝／不可用／空数据和服务失败各自可解释。 | 引用与无引用路径及错误分支；不强制所有问题都走人脉。 |
| SC-0006-05 | 授权联系人问题保存后双端可回看同一引用，邮件产物保持可编辑草稿不自动发送。 | 最少必要真实引用问答／保存回读；预算继续原账本。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** H：引用权限、AI写入与跨页入口。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-ai-conversation.test.ts tests/ink-signal-contact-detail.test.ts
```

本轮行为需要新增的测试：`tests/ai-contact-mentions-interactions.test.tsx`。创建后必须并入上述目标命令；仅跑旧测试不能证明新增SC。

新引用测试创建后纳入目标命令；npm run typecheck、一次npm test、git diff --check；契约副本只经批准同步。
**不额外运行：** 不重新改会话幂等实现、不另做全联系人分析功能；不做Evaluator循环。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
