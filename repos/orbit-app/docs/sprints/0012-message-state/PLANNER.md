# Sprint 0012 — 消息已读、目标与前台更新

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** R-11。**单一目标:** 持续前台时消息与角标按真实状态更新，点击合法目标，已读／忽略和设备推送可追溯。
**基线:** 承接 0008 REPORT；[证据第 16～20、23 节](../../verification/2026-09-13-app-connectivity.md#23-r-11收件箱正文前后台恢复)的角标刷新、身份／目标隔离、提醒回执、通知动作及前后台草稿恢复保留。
**进入条件:** 0008 真实会话可用；提供消息已读／未读、前台更新方式／时效、目标及权限失效契约；提醒状态共享字段发布；授权两用户、非空消息、有效投递对象与实体推送设备齐全。
**契约前置:** 消息状态写入和前台刷新／订阅的真实路径、序列／幂等及允许延迟须补入 Planner 并审阅。API 配置负责人须解决已记录投递详情 GET 缺设备密钥的问题，本 Sprint 不生成密钥。

## 范围与文件

- 读取：[原计划 R-11](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md#r-11消息提醒和未读一致性)、[Relationship Inbox 缺口](../../api-gaps.md#relationship-inbox)、0008 REPORT；历史前后台恢复只承接有效证据。
- 修改白名单：`src/screens/inbox/RelationshipInboxScreen.tsx`、`src/view-models/relationship-inbox.ts`、`src/view-models/inbox-notification-actions.ts`、`src/hooks/useRelationshipInboxBadgeCount.ts`。
- 修改白名单：`src/components/OrbitNotificationsCoordinator.tsx`、`src/notifications/NotificationLifecycle.tsx`、`src/notifications/notification-model.ts`、`src/notifications/push-registration-queue.ts`、`src/notifications/push-device-session.ts`。
- 读取：`src/api/AuthSessionProvider.tsx`、`src/notifications/native-notifications.ts`、`src/screens/home/HomeDashboardScreen.tsx`、`src/screens/ai/AiScreen.tsx`；不改通用 client/cache 或重挂载草稿组件。
- 条件性新建：`src/api/message-state.ts`、`tests/message-state-interactions.test.tsx`；仅消费已批准状态及前台更新契约，当前尚不存在。
- 测试白名单：新交互及下列现有测试；文档仅本 Sprint `REPORT.md`；原始证据在 `build/harness-state/evidence/sprint-0012/run-01/`，先确认被忽略。
- 排除：重做前后台恢复／回复草稿保护、实现消息投递（0008）、伪造消息已读 endpoint、自动发信、后端密钥／设备服务修改、完整导航／字号验收（0016）。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0012-01 | 消息已读与支持持久化的提醒 read／ignored 只在匹配回执后生效；返回首页／IORBIT、重开及 Web 回读计数一致，旧列表临时忽略保持明确提示。 | 新 message-state 与既有 notification-state 交互；授权状态写入及同对象跨端回读。 |
| SC-0012-02 | App 持续前台收到新消息后，在批准时效内更新列表、会话及角标；断网／恢复无重复项，不重挂载或覆盖用户未发送草稿。 | 新交互控制更新事件／定时器与序列；授权两用户真实收发、原生连续前台截图和时间记录。 |
| SC-0012-03 | 点消息／提醒打开真实受支持目标；目标删除、无权限、过期或非法链接有明确反馈，不能用提醒 ID 代替任务／联系人 ID。 | 新交互与既有目标回归；有效、已删除及无权限授权对象的原生导航／HTTP 结果。 |
| SC-0012-04 | 登出、切账号／服务器、权限撤销和后台变化取消旧读取／动作／更新源；旧回执及推送不恢复旧正文或计数，同账号草稿仍保留。 | 现有 inbox／badge 生命周期与新状态交互；真实权限撤销场景，旧会话内容不得闪回。 |
| SC-0012-05 | 通知偏好和系统权限控制设备注册；token 变化、重复激活、登出／换号正确去重／解绑；实体设备收到测试推送并进入当前账号合法目标。 | 注册竞态／合并生命周期回归、授权实体推送与服务端设备状态回读；拒绝权限不注册。 |

## 一次 Generator 的执行顺序

1. 核对消息／目标／前台时效协议、设备配置和授权对象；缺任一必需条件登记 blocked，run_count 保持 0，不用空正文样本启动验收。
2. 锁定文件与唯一设备／账号 owner，记录 Planner 哈希和 HEAD／diff；逐符号 upstream impact，HIGH／CRITICAL 先报告。
3. 针对剩余已读、前台更新及设备状态差异补 RED，按发布契约最小接入；保留既有取消、草稿和回执保护。
4. 同一 Generator 执行必要回归、H 最终集与原生／真实持久化场景；不调 Evaluator、自评分或第二个实现者。
5. 各独立功能验证后由协调者路径限定暂存、detect_changes、commit；记录完整 REPORT、未验项及后续 0016／0017 输入后结束。

## 最小测试与检查

- 档位：本次编制为 D；未来实施为 H，涉及状态写入、权限、共享角标和设备注册，必须类型检查、作用域失败覆盖及提交前一次全量。
- 以下命令 cwd 均为 `/Users/xzhao/Projects/orbit/repos/orbit-app`，本轮仅声明、不执行。

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/relationship-inbox-interactions.test.ts tests/relationship-inbox-lifecycle.test.ts tests/relationship-inbox-badge-lifecycle.test.ts tests/relationship-inbox-view-model.test.ts tests/inbox-notification-state.test.ts
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/notification-model.test.ts tests/notification-sync.test.ts tests/notifications/merged-notification-lifecycle.test.ts tests/notifications/notification-registration-races.test.ts tests/notifications/push-notification-permission.test.ts tests/notifications/push-notification-settings.test.ts
```

- 新文件创建后：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/message-state-interactions.test.tsx`，覆盖 SC-01～04；共享角标直接消费者另跑 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/home-dashboard-interactions.test.ts tests/ink-signal-ai-home.test.ts`。
- H 最终集：`npm run typecheck`、`npm test`、`git diff --check`；批准的消息／提醒副本改变才加 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/domain-sync.test.ts`。 同版本全量已包含这些同步用例时直接引用结果，不再单独重跑。
- 现有提醒状态为 `POST /api/notifications/:id/state`；投递详情为 `GET /api/notifications/deliveries/:id`。前者不等于消息已读，后者当前密钥阻塞须先由负责人解除。
- 原生／跨端：必需非空正文、持续前台到达、目标拒绝、已读／忽略两端回读与实体推送；Simulator 与受控测试只证明各自覆盖的部分。
- 不运行：AI／OCR、全部业务旅程、Lighthouse、全平台截图及无关构建；不重复完整历史前后台验收，除非本次改动使旧证据失效。

## 失败与交接

无消息状态契约、合法目标、投递配置、双用户或实体设备时分别记录依赖；不得把仅本次忽略、200 空正文或设备注册测试当作真实完成。
运行中依赖／权限失效按 RULES 结束 blocked／failed，保留有效独立功能与失败事实；不恢复未知旧动作、不自动启动第二轮 Generator。
REPORT 记录 SC→文件→功能 SHA→证据、消息／目标／设备脱敏 ID、前台时效、App/API 版本、两端影响、未提交与未验项；向 Bridge 协调者提供交接内容。
