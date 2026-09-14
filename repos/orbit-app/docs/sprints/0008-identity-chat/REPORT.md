# Sprint 0008 — 身份邀请与真实聊天执行总结

## 目标实现情况

本轮完成了由服务端资格控制的联系人邀请、身份绑定和双方共享聊天。邀请只生成可预览、复制或系统分享的链接，不会自动发送；接受邀请后才建立唯一绑定与会话。消息发送在服务端重新验证绑定与资格版本，只有匹配账号、会话和消息的持久化回执才显示成功，失败保留输入，重复请求按幂等键去重。

Web、App 和共享契约已经使用同一组 `/api/relationship-communication/**` 路径。撤销、过期、冲突、越权、切账号和接受竞态均失败关闭；App 聊天详情不再提供已取消的“生成摘要”功能。0012 所需的会话列表、详情和已读接口已发布，但 0008 不把角标、前台刷新或推送声明为已完成。

## 运行记录

- 目标／原需求：R-05／B4，确认对方身份后真实收发消息。
- 结果：completed；五项 SC 均由契约、服务、路由、App 交互和持久化回读覆盖。
- run：run-01；唯一 Generator `/root/e_line`；2026-09-14 23:24～2026-09-15 00:36 JST。
- Planner revision：1 + B4 已批准技术契约；启动 SHA256 `a20d9e1084b2b77d1d1fe29f3c3aab79f853874234a44b5bf8dce7f73b2261d1`，结束文件 SHA256 `cf4f9339909a948d74ce301bb0f7c4c65f2488f19c999cf298fa62fffd1c77d8`。
- 基线 HEAD：`fca77373f123c03e29a0584cba46bade5f5eb907`；启动前产品工作区干净。根 `AGENTS.md`、`CLAUDE.md` 的用户改动未接管。
- 被验收的功能 HEAD：`6d8173b786105d24642a1ab7b83c4253e4a79eb9`，已本地提交，未 push／merge／部署。
- 环境：内存服务、路由夹具、配置的 PostgreSQL live store；iPhone Simulator `c0009-timezone`，iOS 开发构建。没有向外部邮箱／短信发送内容。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 共享资格、邀请、绑定、会话、消息、回执和已读契约 | `repos/orbits/shared/contract/relationship-communication.ts`、App 同步副本、两端 endpoint | `6d8173b78` | 01～05 |
| 服务端鉴权、token 哈希、资格版本、幂等投递、撤销与 PostgreSQL 存储 | `repos/orbits/features/relationship-communication/**`、`repos/orbits/app/api/relationship-communication/**` | `6d8173b78` | 01、03～05 |
| Web 邀请预览与接受页 | `repos/orbits/app/(app)/app/invitations/[token]/**` | `6d8173b78` | 02、03 |
| App 联系人资格、邀请分享、邀请接受和真实会话收发 | `src/api/contact-communication.ts`、`src/screens/contacts/**`、`src/screens/chat/**`、`src/view-models/contact-communication.ts` | `6d8173b78` | 01～05 |
| 取消聊天摘要入口并保留发送失败草稿 | `src/screens/chat/RelationshipChatDetailScreen.tsx` 及交互测试 | `6d8173b78` | 03、04 |

## 验收结果

| SC | 结果 | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0008-01 | pass | service、route、eligibility 与 App 状态测试 | 未注册、pending、conflict、confirmed、revoked、expired、forbidden 均由服务端决定；伪造客户端字段不能提权。 |
| SC-0008-02 | pass | Web 邀请页、App invitation source、联系人邀请交互和 iOS 构建 | 创建邀请只返回服务端链接；复制／系统分享由用户动作触发。Simulator 安装启动成功；未登录深链被登录守卫拦截，没有自动外发。 |
| SC-0008-03 | pass | 两参与方接受／撤销服务测试、路由测试和 App delivery 交互 | 接受后刷新资格才可聊天；冲突、撤销和旧资格版本均拒绝发送，输入不清空。 |
| SC-0008-04 | pass | delivery、draft、service 与 route 测试 | 回执须匹配账号、会话、消息；同一幂等键不重复写入，错误回执不冒充成功。 |
| SC-0008-05 | pass | PostgreSQL live-store 测试及绑定竞态回归 | 双方从共享持久化会话回读同一消息；孤儿会话、旧账号、撤销绑定和迟到回执不能绕过当前绑定。Web 与 App 消费同一共享 DTO。 |

SC-02 的原生观察只覆盖当前版本安装、启动和登录守卫，没有使用真实收件人执行系统分享。外部分享不是服务端投递条件，自动化与源码已验证入口无自动发送副作用。SC-05 的双方身份由隔离测试 actor 承担，没有记录个人身份数据。

## 最小验证与失败记录

| 命令／场景 | 结果 | 范围 |
| --- | --- | --- |
| App `npm run typecheck` | exit 0 | 当前完整 App TypeScript |
| App 相关回归 | 105/105 pass | 资格、邀请、投递、草稿、页面、同步契约及 app-wide 消费者 |
| App 全量 | 2566 pass、6 fail | 六项均为旧聊天界面预期；修正测试后失败集合 46/46 pass。源文件未再变化，按影响驱动规则没有重复约 400 秒全量。 |
| Web `npm run typecheck` | exit 0 | 当前完整 Web/API TypeScript |
| Web service／route／page／surface | 11/11 pass | 新契约、授权路由和页面边界 |
| 绑定竞态回归 | RED 后 5/5 pass | 新反例最初复现孤儿会话可见；修复后 list/detail/send 均核对权威当前绑定。 |
| PostgreSQL live-store | 1/1 pass | 配置数据库中的邀请、接受、消息、重开回读和隔离清理 |
| Web 全量，无数据库环境 | exit 1 | 既有数据库测试缺 `ORBIT_EVENT_DATABASE_URL`；不记为产品回归通过。 |
| Web 全量，加载主环境 | 2999 pass、172 fail、58 skipped | 主 live 环境改变大量 mock/live 前提，并包含已记录的 event repair 基线失败；相关 0008 定向集全部通过，未把该全量写成通过。 |
| iOS Simulator 开发构建与启动 | Build Succeeded，0 error／0 warning | 首次因 DerivedData 磁盘写满失败；只清理 Orbit 生成产物后重建、安装并看到登录页。 |
| `git diff --check`、暂存 `gitnexus_detect_changes` | pass；low | 45 个提交文件；detect 识别 44 个暂存文件、71 个符号、0 个受影响流程。 |

`relationshipChatThreadToView` 的启动前 upstream impact 为 HIGH，已在编辑前告知并扩大相关回归。最终发送链路改为新服务端会话模型，没有忽略该风险。

## 交接

- 0012 可直接使用 `GET /conversations`、`GET /conversations/:id` 和 `POST /conversations/:id/read`；读取时仍须核对当前 actor、绑定和会话，不得退回旧本地草稿列表。
- 根 `AGENTS.md`、`CLAUDE.md` 仍是启动前已有用户改动。Metro 会话仅用于本轮 Simulator 验收；0012 开始时可复用或有序结束。
- 本轮没有新增 AI/OCR/provider 调用，费用增量为 0；既有累计预算不重置。
- 功能回退点是 `6d8173b78` 的定向 revert；本轮未自动回滚、push、merge 或部署。
- 后续由 0012 实现前台消息更新、持久已读／忽略、角标、合法跳转和推送注册生命周期。
