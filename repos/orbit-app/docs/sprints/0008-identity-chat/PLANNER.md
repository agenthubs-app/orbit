# Sprint 0008 — 平台身份、邀请与合法聊天

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** R-05／B4。**单一目标:** 使用服务端验证的接收方资格，完成授权测试用户之间的邀请、绑定与聊天。
**基线:** 承接 0002 实际 REPORT；启动时记录 HEAD／相关 diff，不接管其他未提交工作。
**已有成果:** [证据第 15 节](../../verification/2026-09-13-app-connectivity.md#15-r-05回复草稿的写入边界)的草稿单次保存、匹配回执、身份撤销和失败保留已实现；这些结果不等于真实投递。
**进入条件:** 0002 的环境就绪；B4 发布已验证绑定、候选／冲突、资格及撤销、有效邀请链接、双用户认证投递和回执契约；两名测试用户与邀请／绑定／站内发信对象获准。
**契约前置:** B4 的方法／路径、身份字段、资格时效、幂等与发送失败语义须补入本 Planner 并审阅；现有预览 API 不能被本计划改名为投递协议。

## B4 已批准技术契约（2026-09-14）

用户已明确启动 E 线并授予完成本线所需权限；本节冻结本次 run-01 使用的 B4 契约。现有 `/api/contact-invitations` 和 `/api/chat/conversations` 保留草稿／预览语义，真实身份与投递使用独立 `/api/relationship-communication/**` 路径。

- `GET /api/relationship-communication/eligibility?contactId=...` 返回服务端状态 `unregistered | pending | conflict | confirmed | revoked | expired | forbidden`、允许动作、`qualificationVersion`、`expiresAt`、绑定账号的公开显示名及可用 `conversationId`。客户端输入的姓名、照片或账号 ID 不参与资格判定。
- `POST /api/relationship-communication/invitations` 仅由联系人所有者创建七天有效邀请。服务端生成不可预测 token，只在响应链接中返回明文，持久层保存 token 哈希；创建不发送邮件、短信或站内消息。`POST /api/relationship-communication/invitations/:token/accept` 要求已登录、非邀请方、会话邮箱与邀请邮箱匹配并显式 `confirmed: true`；幂等接受生成唯一绑定及会话。`DELETE` 撤销邀请或绑定并推进资格版本。
- `GET /api/relationship-communication/conversations` 与 `GET /api/relationship-communication/conversations/:id` 仅向参与账号返回共享会话／消息。`POST .../:id/messages` 必须携带 `Idempotency-Key` 和当前 `qualificationVersion`，发送时重新校验未撤销绑定；消息 ID 由会话、发送者和 requestId 稳定派生。服务端完成持久化并回读匹配账号、会话、消息后才返回 `delivered` 回执，失败不产生成功回执。
- `POST /api/relationship-communication/conversations/:id/read` 由 0012 使用，按当前账号保存最后已读消息和服务端时间；本 Sprint 只发布接口形状，不在 0008 声明已读／推送验收完成。
- 存储继续使用现有 `orbit_records`，新增独立 collection，不做数据库迁移。邀请、绑定、会话、消息和已读记录均带 workspace 及参与账号边界；消息是一条双方共享记录，避免双写分叉。共享响应类型放入 `shared/contract/relationship-communication.ts` 并通过既有 `sync:contract` 同步到 App。

**2026-09-14 产品决定：** 用户明确取消 App 聊天详情的“生成摘要”功能，不转接摘要模板；见 [0006 入口清单](../0006-contact-mentions/PLANNER.md#已确认的入口决定2026-09-14)第 4 项。启动前须把取消该功能的实现范围与行为验证补入本 Planner 并审阅；不得恢复该功能，也不把本决定扩大为删除历史摘要或移除其他端仍在使用的 API。此次仅记录已批准要求，原运行状态、SC 和验证结果不变。

## 范围与文件

- 读取：[原计划 R-05](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md#r-05身份聊天与邀请)、[Relationship Chat 缺口](../../api-gaps.md#relationship-chat)、0002 REPORT（执行后才产生）。
- 读取：`src/api/endpoints.ts`、`src/api/AuthSessionProvider.tsx`、`src/screens/inbox/RelationshipInboxScreen.tsx`，确定现有身份及草稿入口；不改通用认证生命周期。
- 修改白名单：`src/screens/contacts/ContactDetailScreen.tsx`、`src/screens/contacts/ContactIntrosScreen.tsx`、`src/screens/chat/RelationshipChatScreen.tsx`、`src/screens/chat/RelationshipChatDetailScreen.tsx`、`src/view-models/relationship-chat.ts`。
- 条件性新建：`src/api/contact-communication.ts`、`src/view-models/contact-communication.ts`，仅承载审阅后 B4 的消费与显示；不得在此实现绑定或授权业务规则。
- 已批准必要 Web/API 范围：`repos/orbits/shared/contract/relationship-communication.ts`、`repos/orbits/features/relationship-communication/**`、`repos/orbits/app/api/relationship-communication/**` 及对应 `repos/orbits/tests/**`；仅实现本节契约，不改变旧邀请／草稿 API。
- 已批准必要 App 接线：`src/api/endpoints.ts` 与由同步命令生成的 `src/api/contract/relationship-communication.ts`；新增路径只服务本 Sprint 的资格、邀请、真实会话和投递。
- 测试白名单：下列现有测试；新增 `tests/contact-communication-eligibility.test.tsx`、`tests/relationship-chat-delivery-interactions.test.ts`、`tests/relationship-invitation-screen-source.test.ts` 及 Web/API 对应 route、service、page、live-store 测试。
- 文档产出仅本 Sprint `REPORT.md`；原始证据在 `build/harness-state/evidence/sprint-0008/run-01/`，先确认被忽略。
- 排除：联系人自动匹配、外部邮件／短信投递、陌生人发信、收件箱消息已读与推送（0012）、修改后端或手改生成副本。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0008-01 | 未注册、匹配中、冲突、无权限、已确认各显示服务端状态；未知或过期资格不能发送，手填姓名／照片／contactId 不改变资格。 | 新 eligibility 测试覆盖每个状态及错误／旧账号回执。 |
| SC-0008-02 | 用户可预览、复制或系统分享有效服务端邀请链接；打开联系人／邀请入口不自动发邮件、短信或站内消息。 | eligibility 路由交互断言副作用；Simulator 查看系统分享面板；授权双用户链接验证。 |
| SC-0008-03 | 测试用户接受邀请并注册／绑定后，发起方刷新才显示可聊天；冲突或撤销后发送受控拒绝且输入保留。 | 两用户同对象资格变化、原生刷新与服务端拒绝回执；新 delivery 交互测试。 |
| SC-0008-04 | 真实发送只有匹配账号、会话及消息的投递回执才显示成功；双击／重试遵守幂等，预览草稿仍明确是草稿，失败不清空输入。 | 新 delivery 测试与既有 draft 回归；授权真实收发的消息 ID／回执对应。 |
| SC-0008-05 | 双用户在实际非空会话收发后重开仍看到同一消息，Web 与 App 回读一致；切账号／撤销资格后旧会话内容和迟到回执不泄漏。 | 同环境 App/API 版本、双方接收与重开记录、原生非空正文及跨端证据。 |

## 一次 Generator 的执行顺序

1. 核对 B4、双用户与具体发送授权；缺真实投递接口或对象则登记 blocked，不消耗 run-01。
2. 记录 Planner 哈希、HEAD 和文件锁；对待改符号 upstream impact，HIGH／CRITICAL 先报告，再补资格／回执 RED。
3. 按批准契约消费资格、邀请和发送；保留既有草稿防护，发送 API 与预览 API 按真实能力展示。
4. 同一 Generator 完成必要回归及两用户场景；仅按 RULES 有限修复，不调用 Evaluator、self_assess 或其他实现者。
5. 独立功能验证后由协调者路径限定暂存、detect_changes、commit，汇总 REPORT 并结束，不再生成第二轮。

## 最小测试与检查

- 档位：本次编制为 D；未来实施为 H，涉及身份、权限撤销和真实消息写入，必须类型检查、传递消费者与提交前一次全量。
- 以下命令 cwd 均为 `/Users/xzhao/Projects/orbit/repos/orbit-app`，本轮仅声明、不执行。

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/relationship-chat-view-model.test.ts tests/relationship-chat-delivery-interactions.test.ts tests/relationship-chat-screen-source.test.ts tests/relationship-chat-detail-screen-source.test.ts
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-contact-detail.test.ts tests/contact-intros-screen-source.test.ts tests/relationship-inbox-interactions.test.ts tests/relationship-inbox-lifecycle.test.ts
```

- 新文件创建后：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contact-communication-eligibility.test.tsx tests/relationship-chat-delivery-interactions.test.ts tests/relationship-invitation-screen-source.test.ts`，分别承担 SC-01～04 及原生邀请路由边界。
- H 最终集：`npm run typecheck`、`npm test`、`git diff --check`；B4 已批准共享副本改变才加 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/domain-sync.test.ts`。 同版本全量已包含这些同步用例时直接引用结果，不再单独重跑。
- 现有 `/api/chat/conversations` 及 `/:id/messages` 是草稿边界；`canSendInMock`／`mock_recorded_locally` 不证明真实收件人或投递。新路径须由 B4 供给，不能猜测。
- 原生／跨端：SC-02 分享面板可只预览；实际分享、接受邀请、注册／绑定、收发及撤销只用已批准双方；非空正文／重开不可用空列表替代。
- 不运行：OCR、无关 AI 生成、Lighthouse、全平台截图和全部业务旅程；消息发送授权不外推为邮件／短信或其他接收人授权。

## 失败与交接

无绑定、邀请或双用户投递契约则不启动；只完成预览不得关闭 SC-03～05。账号／对象授权与运行环境分别列缺项。
运行中撤销或服务错误按真实结果停止依赖动作，保留未发送输入并交 blocked／failed 报告；不以本地消息插入冒充送达。
REPORT 记录 SC→文件→功能 SHA→证据、双方脱敏身份／会话／消息 ID、授权与版本、未提交及未验项；为 0012 提供可用目标、已读依赖与两端影响。
