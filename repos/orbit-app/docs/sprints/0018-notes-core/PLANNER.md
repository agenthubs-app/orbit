# Sprint 0018 — 独立笔记、多人关联与旧入口切换

**Plan revision:** 3（确认记笔记替换跟进快捷按钮；旧内容迁移仍待审阅）。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-13核心：笔记读写／关联／权限／旧入口切换；建议留0019。
**目标:** 一份笔记正文可关联多个人脉，安全切换旧互动入口且保全既有内容。

## 进入条件与基线

0017主链路验收；B8独立笔记ID／版本／多人关联／私密权限／幂等契约；D7路由设计与迁移／旧内容分类方案获批且提供方完成必要准备。人脉资料备注、身份及授权字段的合法编辑契约须明确；当前只读字段不能由App擅自补写。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。候选新Screen路径需与获批路由设计一致；缺B8不能ready。若范围经设计发现超出单次可交付增量，Planner在启动前拆新编号并保留需求映射，Generator不得临场缩减。

## 已确认的笔记入口（2026-09-14）

用户已确认：首页“记笔记”直接替换原“联系跟进”快捷按钮，仍位于“新建待办”之后，不新增第五个快捷项。首页联系跟进内容区块另由 0011 替换为活动；两个位置均已明确，不再询问是否保留跟进按钮。

该入口打开笔记创建界面，不直接生成 AI 建议，也不在点击时提前保存一条空笔记。笔记列表／已有笔记访问与旧入口切换仍须在 D7 的具体路由中一并落实；本次给出新建入口不等于批准旧内容分类、迁移或删除。

0011 记录首页位置，0018 在真实笔记路由可用后接入入口并验收；不让 0011 反向依赖整个 0018，也不先放可点击的空实现。实施前将 `src/screens/home/HomeDashboardScreen.tsx`、具体 notes 路由及 `tests/home-dashboard-interactions.test.ts` 的接线范围补入跨页白名单并审阅；当前不自动扩张。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `src/screens/contacts/ContactDetailScreen.tsx`
- `src/screens/contacts/ContactNotesSection.tsx`
- `src/view-models/contact-notes.ts`
- `src/view-models/contact-detail-editor.ts`
- `src/view-models/contacts.ts`
- `src/view-models/conversations.ts`
- `tests/contact-notes-interactions.test.ts`
- `tests/contact-notes-view-model.test.ts`
- `tests/contact-detail-editor.test.ts`
- `tests/conversation-view-model.test.ts`
- `tests/ink-signal-contact-detail.test.ts`

条件性新建（先满足进入条件；当前不存在不表示已实现）：
- `src/screens/notes/NotesScreen.tsx`
- `src/screens/notes/NoteDetailScreen.tsx`
- `src/view-models/notes.ts`
- `tests/notes-interactions.test.tsx`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** 未经审批迁移或删除旧数据、把资料备注都当互动笔记、后台自动建议、长期双写。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0018-01 | 笔记只存一份正文，多个人脉详情打开同一笔记／版本。 | 真实ID与关联回读，编辑一处其他关联可见同原文。 |
| SC-0018-02 | 解除某个人脉关联不删正文和其他关联，私密权限／跨账号拒绝有效。 | 关联删除／越权／正文保留交互及授权API结果。 |
| SC-0018-03 | 失败／冲突保护草稿，不覆盖他人新版本，重试遵守服务端幂等。 | 笔记路由失败与并发版本测试。 |
| SC-0018-04 | 首页“记笔记”从确认位置进入真实创建页，取消不创建空笔记；所有笔记编辑在笔记界面完成。新路径与旧内容访问成功后关闭旧互动写入口，资料备注、合法身份及授权字段仍可编辑且失败保稿；移除固定联系人／会话ID的事实替换特判。 | 首页点击→创建／取消→回访交互；切换前后原文／所有者／旧链接与残留写入断言，以及合法编辑／失败回归；不提前删入口、不强制归类或删除旧备注。 |
| SC-0018-05 | 授权笔记和多人关联在Web／App双向回读一致。 | 同一笔记ID／版本、关联集合和必要真实回读。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** H：新数据身份、权限和旧入口迁移。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contact-notes-interactions.test.ts tests/contact-notes-view-model.test.ts tests/contact-detail-editor.test.ts tests/conversation-view-model.test.ts tests/ink-signal-contact-detail.test.ts
```

本轮行为需要新增的测试：`tests/notes-interactions.test.tsx`。创建后必须并入上述目标命令；仅跑旧测试不能证明新增SC。

设计批准后将新路由的确切app路径补入Planner白名单；新测试创建后加入，npm run typecheck、npm test、git diff --check；契约副本仅批准同步。
**不额外运行：** 不提前做笔记建议／邮件发送、不清理未授权历史内容。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
