# iOrbit Agent 能力与浏览器验收记录

本文记录 2026-08-08 对当前 iOrbit 产品的账号级压力数据、Agent 能力、主要界面和安全边界的实际验收结果。结论来自 `qa@orbit.test` 的真实登录会话、真实页面点击、Postgres live store 和聚焦自动化测试；没有把仅存在于接口或代码里的能力标记为“浏览器通过”。

## 验收口径

- 环境：本地 Next.js live 模式，`http://127.0.0.1:3000`，`ORBIT_MODULE_MODE=live`。
- 测试账号：`qa@orbit.test`，actor 为 `user_ms1n64k3_eh7j0g`。
- 浏览器：Codex 内置浏览器，桌面默认视口与 390×844 手机视口。
- 数据时间区：Asia/Tokyo。
- 状态定义：
  - `PASS`：通过实际浏览器点击观察到正确结果，并有真实数据或明确安全证据。
  - `受控限制`：功能明确 fail closed 或展示“未配置”，没有伪造成功。
  - `FAIL`：界面对用户承诺可用，但真实操作无法完成或结果不一致。

## 测试数据

注入脚本：`repos/orbits/scripts/seed-account-agent-pressure-fixtures.ts`。

运行方式：

```bash
cd repos/orbits
node --import tsx scripts/seed-account-agent-pressure-fixtures.ts --email qa@orbit.test --mode seed
node --import tsx scripts/seed-account-agent-pressure-fixtures.ts --email qa@orbit.test --mode verify
node --import tsx scripts/seed-account-agent-pressure-fixtures.ts --email qa@orbit.test --mode cleanup
```

本次 `seed` 和 `verify` 均返回 `success: true`、`failures: []`。账号当前共有 8,335 条测试记录或 membership：

| 数据集合 | 数量 |
| --- | ---: |
| 活动 | 13 |
| 人物 | 132 |
| 人物关系边 | 440 |
| 参会者 | 500 |
| 联系人 | 66 |
| 连接 | 450 |
| 证据 | 4,447 |
| 跟进任务 | 80 |
| 对话 | 40 |
| 消息 | 200 |
| Agent 动作 | 60 |
| 通知 | 40 |
| 活动意图 | 500 |
| AI 分析 | 240 |
| 匹配推荐 | 350 |
| 互动记忆 | 528 |
| 推荐测试 | 235 |
| 报名投影 | 13 |
| canonical membership | 1 |

所有 live-record 压力数据都带账号命名空间和 `iorbit-account-agent-pressure-fixtures` provider，可按测试账号清理。`event_signup_01` 的 canonical membership 属于 append-only 审计记录，cleanup 不伪造取消或删除历史。

活动存储 ID 与公开 ID 是两个契约：账号侧记录使用命名空间 ID，`sourceMetadata.providerRecordId` 保留原始 Event Core ID。详情页只在用户已登录、账号侧记录存在且 provenance 明确指向已发布公开活动时进行回落；账号自建但未发布的活动不会被伪装成公开详情。

## Agent 能力矩阵

| 能力 | 浏览器结果 | 实际效果 |
| --- | --- | --- |
| `chat.context` 关系上下文 | PASS | 总结与佐藤健一的最近互动、诉求、关系强度 36、业务相关度 76 和下一步；展开后显示 3 条真实记录与账号命名空间 evidence ID；明确无外部操作。 |
| `contacts.recommend` 人脉推荐 | PASS | 返回 3 位真实联系人、推荐理由和证据；“有帮助”反馈写入并在设置页“结果学习”出现。 |
| `events.recommend` 活动推荐 | PASS | 返回“关西跨境商务对接会”“东京 AI 落地伙伴对接会”“日中投资人与创业者沙龙”三场唯一活动；标题为人类可读中文，无重复 actor/canonical 副本，并有真实活动依据。 |
| `followups.reviewQueue` 跟进复核 | PASS | Playbook 试运行返回 5 个可复核跟进任务和 `orbit-ai · followups · 5 条依据`。 |
| 创建跟进任务 | PASS（有限） | 先预览、再确认后写入；Today 按东京时区显示 15:00。当前新任务仍可能显示“未关联联系人”，见已知问题。 |
| 创建提醒 | PASS（站内） | 澄清时间后确认写入，收件箱提醒计数 40→41；未发送外部通知。 |
| 消息/邮件草稿 | PASS（草稿） | 先确认再保存，打开收件箱编辑器并保留正文；不会自动发送，收件人可能仍需手选。 |
| 外部日历 | 受控限制 | provider 未配置时明确失败并保留确认边界；没有伪造已同步。 |
| Agent Memory | PASS | 关闭时拒绝记忆；开启并确认后保存，设置页可查看长期目标；学习开关状态能持久化。 |
| 结果反馈 | PASS | “有帮助”反馈持久化到设置页结果学习记录。 |
| Action ledger | PASS | 已执行/待确认动作、证据和安全字段可在真实界面查看。 |
| Agent Playbook | PASS | 自然语言生成草案、试运行、启用、立即运行、暂停、恢复、删除全生命周期均由浏览器点击通过；运行保持只读。 |

Playbook 修复说明：旧 runner 把服务器安全提示、只读说明和用户指令拼成一段，再交给会话 permission parser，英文 `read` 与中文“日程”可能跨边界误判成外部日历写入。当前 runner 对已注册的只读 capability 直接调用 actor-scoped artifact producer，不再让 permission parser 重新解释服务器指令。

## 界面验收矩阵

### iOrbit / Agent

- `PASS`：登录、dashboard、历史对话、真实提问、证据展开、结果反馈、快速提问、收件箱入口。
- `PASS`：Agent 工作台显示 13 场活动、66 位人脉和 66 个跟进中的联系人。
- `PASS`：从“进入活动旅程”实际点击账号侧 `…:event_signup_03`，成功打开公开“日中投资人与创业者沙龙”。
- `PASS`：阶段条不再无条件谎报“已报名”，改为中性的“报名与回答 2 题”；报名状态由详情页 canonical membership 决定。

### 活动

- `PASS`：公开活动列表 14 场、关键词搜索、AI 筛选、清除筛选、地图/列表切换、地图侧栏和 marker 选择。
- `PASS`：公开活动详情展示时间、地点、主办方、议程、现场示例、会后中心和“向 iOrbit 询问这场活动”深链。
- `PASS`：Today 和 Agent 使用账号侧活动 ID 的链接均通过 provenance 回落到真实公开详情，不再出现 Event not found。
- `PASS`：`event_signup_01` 的测试 canonical membership 在浏览器中显示“已报名”，并进入真实活动旅程状态。
- `PASS`：详情页和列表现在共用 Event Operations 的真实 registration window。`event_signup_02` / `event_signup_03` 在桌面详情显示两处禁用“报名暂不可用”，不存在 `/register` 链接；强制点击禁用按钮后 URL 不变。
- `PASS`：列表不再用陈旧 legacy 投影覆盖 canonical membership。`event_signup_02` / `event_signup_03` 在桌面卡片、地图动作和移动卡片统一显示“查看活动”，`event_signup_01` 仍显示“已报名 · 管理报名”。
- `PASS`：`event_signup_01` 的报名窗口虽已截止，但当前测试账号已有 canonical membership；展开详情后实际点击“管理报名”，进入已保存的活动画像和取消报名入口。
- `PASS`：Admission Journey Lab 的详情 CTA 改用 public code，不再把 `event:...` 内部 ID 交给报名页。浏览器实际点击进入两题问答，选择“投资人或合作伙伴”“分享项目经验与洞察”后生成中文活动画像并保存为“待审核”。

### Today / 日程

- `PASS`：月历、今天、上月/下月、当日/本月全部、78 条压力日程、展开/收起详情。
- `PASS`：Agent 创建任务在 Asia/Tokyo 显示正确的 15:00。
- `PASS`：点击“关西跨境商务对接会”打开真实公开详情。
- `受控限制`：“安排约见”显示“约见服务暂未配置”，并明确不会写交往记录、日历或邀请。

### 人脉与收件箱

- `PASS`：联系人列表 66 人、中文搜索、详情、关系强度、双向价值、证据 ID、时间线和下一步。
- `PASS`：联系人详情“查看依据”展开；“起草邮件”打开收件箱编辑器。
- `PASS`：收件箱搜索、提醒 tab、站内提醒和计数正常。
- `PASS`：Pipeline 66 人分组和证据按钮；Graph 显示 66 人/4 活动并支持 100%↔110% 缩放。
- `PASS`：Introductions 从空状态创建中文引荐草稿，保存后可打开详情。
- `PASS`：Dashboard 展示总人数 66、强关系 54、待跟进 26、星图和分布。
- `受控限制`：导入中心明确显示 OCR、二维码、活动名单、地址簿、引荐连接尚未配置，按钮禁用且不写入。

### 设置与响应式

- `PASS`：浅色→深色→浅色，按钮 `aria-pressed` 与实际状态同步。
- `PASS`：中文→英文→中文，设置标题和页面内容完整切换。
- `PASS`：运行状态刷新后显示 `deepseek · 已配置`、`持久化数据库`、`后台执行器：心跳已过期`。
- `PASS`：Google Calendar、Gmail、Microsoft Calendar/Mail 均明确显示部署环境尚未配置。
- `PASS`：390×844 手机视口下 `innerWidth=clientWidth=scrollWidth=390`，无横向溢出；移动顶栏、历史、收件箱、折叠菜单、Agent 输入和活动旅程可操作。测试结束后已恢复默认视口。
- `PASS`：390×844 活动卡片状态与桌面一致：两场窗口未配置活动显示“查看活动”，已报名活动显示“已报名 · 管理报名”。移动端从卡片继续点击详情时被内置浏览器 URL 安全策略阻止，因此没有绕过策略；相同详情与 CTA 已在桌面真实点击验证。

## 本轮根因修复

1. `next.config.js` 补齐 localhost/127.0.0.1 dev origin，消除浏览器 hydration/HMR 阻塞。
2. 活动推荐用本地化人类标题，并按 canonical ID/时间语义去重账号副本。
3. Today 时间统一按 Asia/Tokyo 展示，避免 UTC 日期造成 00:00 假象。
4. Playbook runner 直接分发已注册只读 artifact，修复“不要执行日程操作”反而触发 permission false positive。
5. 测试数据保留活动 provenance 原始 ID；canonical 详情解析器增加 actor-scoped、provenance-gated 回落，修复 Today/Agent 活动 404。
6. Agent 阶段条移除无条件“已报名”假状态。
7. 新增 `EventRegistrationAvailability`，用 Event Operations 的数据库时间、profile edit deadline 和 registration cutoff 统一计算 `open`、`profile_edit_closed`、`registration_closed`、`unavailable`；详情 badge、主 CTA、现场示例和活动列表都消费同一判定。
8. 修正报名列表合并规则：legacy/importing 活动读取投影，已纳管或配置异常的 canonical 活动只认 canonical membership，避免陈旧投影误报“已报名”。
9. 详情页报名/管理报名统一使用公开活动 code，修复 canonical 内部 ID 无法被公开报名页解析的问题。
10. Registration route tests 显式注入 deterministic Event Record，不再意外连接本机 Postgres，也不再依赖已退役的 legacy catalogue。

GitNexus 对报名运行时、canonical 详情解析和列表合并规则评估为 LOW；活动列表动作、桌面/地图/移动卡片、详情主 CTA、信息卡、现场卡和详情面板评估为 HIGH，因为它们共同覆盖 `AppEventsPage` 和 `AppEventDetailPage` 的用户入口。修改前已向用户报告该 blast radius，并用单一 availability 类型、桌面/移动浏览器和全量自动化回归覆盖；没有 CRITICAL 符号修改。

## 仍需修复或接入

以下项目没有标记为通过：

1. `event_signup_02` / `event_signup_03` 仍没有可写的 canonical registration configuration；当前 UI 已准确禁用并 fail closed，但若要开放报名仍需运营侧配置真实窗口。
2. 约见服务、OCR/二维码/地址簿/活动名单导入和外部日历/邮箱 provider 尚未接入。
3. Agent 创建的跟进任务需要稳定绑定联系人 ID；草稿收件人也应支持由联系人上下文自动带入。
4. Pipeline 的部分来源文案仍为英文；中文界面需要补本地化。
5. 人脉 Dashboard 的“来源分组”显示 0，但联系人有来源元数据，需要核对聚合口径。
6. 后台 Agent worker 心跳已过期，需要独立运行 worker 或修复健康上报。
7. 全量 `npm run typecheck` 仍有既有测试类型错误；本轮聚焦文件独立 TypeScript 检查通过，但不能把全仓 typecheck 标记为绿。

## 自动化验证

原聚焦回归：94/94 通过，覆盖 canonical 活动详情、公开/私有访问、活动详情状态、Agent Playbook/automation、活动去重、chat.context、Today 时区和 Home 响应式约束。报名状态修复新增/相关回归 28/28 通过，覆盖窗口判定、canonical 详情、列表动作、详情禁用入口、public-code 报名路由与 registration API。

全量 `npm test` 最终退出码为 0。此前 6 个失败全部来自 `tests/api/event-registration-routes.test.ts` 未注入 Event Core 事件，测试因而意外连接本机 Postgres 并在沙箱返回 `EPERM`；现在测试显式注入 deterministic Event Record，8/8 路由用例通过，同时保留 production canonical-only loader。

本轮修改文件独立 TypeScript 检查通过。全量 `npm run typecheck` 失败项来自仓库既有测试类型基线，典型包括 admission review route 缺 `actorId`、测试修改只读 `NODE_ENV`、旧 mock contract 与现有 interface 不一致；未观察到指向本轮修改文件的错误。

## 后续验收顺序

1. 先运行 seed/verify，确认 `failures: []`。
2. 登录 `qa@orbit.test`，从 Agent dashboard 点击“进入活动旅程”，确认账号侧 ID 可打开公开详情。
3. 分别测试 `chat.context`、人脉推荐、活动推荐、创建任务、提醒、草稿和 Playbook。
4. 在 Events 真实完成两题报名；只有提交成功且刷新后显示“已报名”才算 PASS。
5. 测试 Today、人脉列表/详情/Pipeline/Graph/Intros/Dashboard、收件箱和设置。
6. 用 390×844 复测移动菜单、输入框、关键 CTA 和横向溢出；结束后恢复默认视口。
7. 运行聚焦测试、全量测试/typecheck，并分别记录新增回归与既有基线错误。

## 主要来源

- `repos/orbits/scripts/seed-account-agent-pressure-fixtures.ts`
- `repos/orbits/features/orbit-ai/live-agent-runtime.ts`
- `repos/orbits/features/orbit-ai/service-factory.ts`
- `repos/orbits/features/agent/automations/runner.ts`
- `repos/orbits/features/events/event-recommendation-tool.ts`
- `repos/orbits/app/(app)/app/canonical-event-detail-view.ts`
- `repos/orbits/app/(app)/app/agent/orbit-agent-dashboard.tsx`
- `repos/orbits/app/(app)/app/today/**`
- `repos/orbits/tests/capabilities/agent-playbooks.test.ts`
- `repos/orbits/tests/capabilities/event-crud-and-import-live-store.test.ts`
- `repos/orbits/tests/pages/app-canonical-event-detail-view.test.ts`
- `repos/orbits/tests/pages/app-followups-live-route-services.test.ts`
