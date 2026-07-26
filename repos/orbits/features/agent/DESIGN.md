# Actions 模块设计文档

## 设计定位

Actions 负责把 Orbit 已经掌握的关系证据转成“下一步动作”。它不是不受约束的自动执行器。当前产品原则是：Actions 可以排序、解释、准备和预览动作；用户确认后可以执行 capability manifest 明确登记的 Orbit 内部写操作；外部发送、外部日程修改和联系人写入仍必须停在各自的权限与确认边界前。

这个模块原先在文档中称为 Agent。现在产品术语改为 Actions，用来强调它管理的是外部副作用动作的确认、沙箱和审计边界，而不是一个自由自治的 AI agent。当前代码路径和兼容 API 仍沿用 `features/agent`、`/app/agent` 和 `/api/agent/*`。

这个模块让 AI chat 和侧边功能页能共享同一套动作队列，而不是各自生成一套不可追踪建议。

## 子能力范围

- `agent-action-queue-mock`：生成关系动作队列，包含优先级、证据、目标联系人和建议动作。
- `agent-autonomy-settings-mock`：定义自动化等级和可执行范围。
- `external-action-sandbox-mock`：模拟外部动作执行前的 no-op sandbox。

## 契约与数据边界

主契约在当前 legacy 路径 `features/agent/contract.ts`。核心字段包括 action type、priority、source reference、provenance、confirmation need、decision state 和 no-side-effect ledger。Actions 动作只能引用其他模块已经确认的证据，不能自己发明联系人事实。

`features/agent/service.ts` 定义 action queue、decision 和 autonomy 服务接口。`service-factory.ts` 是唯一入口。

细粒度运行能力统一登记在 `features/agent/capabilities/registry.ts`。这里是
Agent 工具名、工作流键、执行器键、风险等级、确认策略、权限、触发器、展示入口
和撤销能力的唯一描述层。`shared/services/capability-registry.ts` 仍只负责整个产品的
粗粒度模块清单，两者职责不同：前者回答“Agent 可以做哪一个动作”，后者回答
“产品有哪些业务模块”。

新增 Agent 能力时必须先登记 manifest，再接入 planner、workflow 或 executor。
页面、模型 provider 和调度器不得分别维护另一套风险等级或权限表。实际业务逻辑
仍由各 feature service 拥有；能力清单只负责发现、路由和策略元数据，不复制执行
实现。

## 自动任务与触发

`features/agent/automations` 是 actor 隔离的自动任务内核。用户只能为 capability
manifest 中明确标记 `userConfigurableAutomation: true` 的只读能力创建任务；
当前开放跟进复核、人脉推荐、活动推荐和关系上下文复核。高风险写操作和外部动作
不能绕过原有确认策略进入自动任务。

调度支持一次、每天和每周三种计划，并把用户的 IANA 时区写入任务，而不是在服务端
换算后丢失时区。任务创建、暂停、恢复、立即运行、失败结果和最近一次 AI 输出都写入
live record store。存储 workspace 还会追加 actor scope，避免不同账号之间读取或
运行彼此的任务。

`scripts/run-agent-worker.ts` 是唯一后台轮询入口，同时处理 runtime outbox 和到期
自动任务，避免维护两套 worker 生命周期。运行 live worker 需要：

- `ORBIT_AGENT_WORKER_ACTOR_ID`：该 worker 服务的账号 actor id。
- `ORBIT_AGENT_WORKER_ID`：可选的实例标识。
- `ORBIT_AGENT_WORKER_POLL_MS`：可选轮询间隔，默认 2000ms，最低 500ms。
- live database 配置和当前 AI provider 配置。

可通过 `npm run agent:worker` 启动。HTTP 部署也可以调用
`POST /api/internal/agent/automations`，生产环境必须配置
`ORBIT_AGENT_WORKER_SECRET` 并使用 Bearer header；actor 身份只能来自
`x-orbit-actor-id` 服务端边界，不能从请求 body 注入。

Web 服务不会在确认请求内同步执行 outbox。这样即使浏览器断开、请求超时或 worker
重启，已确认意图、幂等键和执行回执仍能独立恢复。相应地，本地完整验收必须同时启动
Web 和与测试账号匹配的 actor-scoped worker；只启动 `npm run dev` 时，动作会正确停在
`approved`，但不会伪装成已经完成。

## 用户可控 Memory

`features/agent/memory` 保存跨对话长期有效、且由用户明确管理的个人上下文。Memory
只包含身份称呼、长期目标、表达偏好和稳定约束四类信息；联系人关系、活动和跟进事实
仍由各自业务模块拥有，不能复制到 Memory 形成第二份事实来源。

Memory 使用 actor 隔离的 live record store，workspace 会追加当前账号的 actor id。
客户端不能在对话请求里直接注入 memory；API 在完成身份解析后从服务端读取当前
actor 的上下文，并通过独立的 `userMemory` 字段传给 planner 和 synthesis provider。
模型提示明确规定 Memory 不能覆盖安全规则、权限策略、工具边界和用户本轮要求。

用户可以在设置页查看、新增、编辑和删除每条 Memory，也可以全局关闭使用。关闭后
服务端向模型返回空上下文，但保留原数据，重新开启即可恢复。会话学习默认关闭；
即使用户开启，也只允许后续写操作流程提出待确认记忆，不能静默抽取或自动落库。
关闭会话学习时，服务端会在创建 Run 和 Action 之前拒绝 `memory.save` proposal，
因此页面不会出现虚假的确认卡，outbox 和 Memory 也不会留下半成品。

相关 API：

- `GET/POST /api/agent/memory`：读取和新增当前 actor 的 Memory。
- `PATCH/DELETE /api/agent/memory/:id`：编辑或删除一条 Memory。
- `GET/PATCH /api/agent/memory/settings`：读取或更新使用与学习开关。

## 结果反馈与业务结果学习

`features/agent/feedback` 只保存用户主动提交的结果评价和后续业务结果，不从聊天内容
猜测“是否有帮助”或“是否促成会面”。评价包括 `helpful`、`not_relevant`；业务结果
包括 `contacted`、`meeting_booked`、`goal_advanced`。同一 Run 只有一条 actor-scoped
记录，后续结果会和先前评价合并，并保留本轮真实来源模块与 evidence ids。

聊天结果下方可以记录评价和业务结果；设置页可以检查或删除任意记录。最近记录会由
服务端压缩为独立的 `userRecordedOutcomes` 上下文交给 planner 和 synthesis。它只能
作为弱个性化信号，不能覆盖当前请求、工具证据、安全规则、权限、确认策略和工具
allowlist。客户端不能在对话请求中伪造这份上下文。

相关 API：

- `GET/POST /api/agent/feedback`：列出当前 actor 的结果学习记录或按 Run 合并写入。
- `GET/DELETE /api/agent/feedback/:runId`：读取或删除一条 Run 级学习记录。

## 自然语言写操作

自然语言写操作遵循“模型只提议、服务端决定、worker 执行”的单向边界。Planner 的
`action_proposal` 输出不会直接进入客户端执行，也不能携带任意工具名。当前只接受
五种有界能力：

- `followups.createTask`：创建跟进任务。
- `notifications.createReminder`：创建提醒。
- `followups.saveDraft`：保存草稿，不发送消息。
- `memory.save`：保存一条用户可控 Memory。
- `calendar.syncEvent`：在已单独授权的 Google Calendar 或 Microsoft
  Calendar 创建事件。

每个 proposal 都必须通过严格 schema 校验，并声明 `requiresUserConfirmation: true`。
同一次模型输出不能混合只读工具调用和写操作提议。对话 API 会消费并移除模型输出的
`actionRequests`，再根据 Capability Registry 重新检查能力是否允许 chat trigger、
是否有运行时执行器、所需权限和逐次确认策略。任何一步不满足都会 fail closed，不会
把未持久化或不可执行的“假确认卡片”返回给用户。

通过校验的提议会创建一个幂等的 `natural_language_action_v1` run。确认前操作保持
`awaiting_confirmation`，没有业务副作用；确认后才写入 outbox，由统一 worker 调用
现有业务 executor。执行结果、证据、payload hash、receipt 与补偿状态全部进入操作
账本。支持补偿的操作可以从对话卡片或操作账本撤销，重复确认和重复撤销都必须幂等。

相对时间由模型结合服务端提供的当前时间和用户默认时区转换为绝对 ISO 时间；最终值
仍由 action schema 验证。外部消息永不由这条链路发送。外部日历 action 在创建确认卡
前检查 provider 写权限，worker 执行时再次检查；只有逐次确认后才调用 provider，并把
provider record id 写入执行回执。

## 集成健康与外部执行

`features/integrations` 把“登录账号”“OAuth 授权”“连接健康”和“Agent 执行权限”
分成四层。授权 token 继续按 actor 加密存储；健康检查使用只读 provider endpoint，
不会因为点击“检查连接”产生写操作。检查结果按 actor 持久化，设置页展示连接状态、
上次检查时间和当前实际具备的能力，而不是只展示原始 scope 字符串。

标准能力映射为 `calendar.read`、`calendar.write` 和 `mail.metadata.read`。邮件集成只
允许元数据读取，不存在发送 executor。日历写操作需要 Capability Registry 声明的
`calendar.events.write`，proposal service 与 integration service 都会验证；缺失
连接或 scope 时 fail closed，不创建确认卡，也不会发出 provider 请求。

确认后的日历写入复用统一 runtime outbox、幂等键和 receipt。Google Calendar 使用
稳定 provider event id，Microsoft Calendar 使用 transaction id。provider 请求失败
进入现有重试/死信状态，不绕过操作账本重试。当前 provider 侧删除没有稳定回执输入，
因此自然语言日历写入不会承诺一键撤销。

本地或部署环境需要先配置 `ORBIT_INTEGRATION_TOKEN_KEY`（base64 编码的 32-byte key）
和 `ORBIT_INTEGRATION_STATE_SECRET`，再按 provider 配置以下同前缀字段：
`AUTHORIZATION_ENDPOINT`、`TOKEN_ENDPOINT`、`API_BASE_URL`、`CLIENT_ID`、
`CLIENT_SECRET`、`REDIRECT_URI`、`SCOPES`。

- Google Calendar 前缀 `ORBIT_GOOGLE_CALENDAR`，标准 API base 为
  `https://www.googleapis.com/calendar/v3`。
- Gmail 前缀 `ORBIT_GMAIL`，标准 API base 为
  `https://gmail.googleapis.com/gmail/v1/users/me`。
- Microsoft Graph 前缀 `ORBIT_MICROSOFT_GRAPH`，标准 API base 为
  `https://graph.microsoft.com/v1.0`。

provider 控制台的 OAuth callback 必须与对应 `REDIRECT_URI` 完全一致；Orbit 登录 OAuth
不能替代上述数据授权。

## Mock 行为

Mock action queue 根据本地关系、活动和跟进 fixture 生成稳定动作。Sandbox 返回 no-op preview，不发消息、不写数据库、不触发通知。Autonomy mock 只表达策略，不真的调度后台任务。

## Live 替换方案

Live Actions 可以接规划器、LLM、任务调度器或外部动作 provider，但必须维持同一 contract。LLM 输出必须经过 validator 和 mapper，不能直接进入页面。外部动作 provider 必须挂在 sandbox 或 confirmation guard 后面。

## API 与页面使用

当前产品入口仍是 legacy route `/app/agent`，也会被 `/app` 的 AI command center 调用。API 包括 action list、accept、dismiss、settings 和 sandbox external actions。页面显示动作理由、来源证据、确认需求和外部影响边界。

设置入口统一在 `/app/settings`。外观、Memory、自动任务、执行通知和外部数据连接都由
设置页承载；`/app/contacts/all-actions` 只负责展示可追溯、可撤销的操作账本，不再同时
承担配置职责。这样用户只需要记住一个配置入口，账本也可以保持单一审计职责。

## 运行可观测性与边界

`/dev/orbit-ai/trace` 展示一次 Agent 请求从本地边界、规划器、工具映射、artifact 执行
到 synthesis 的阶段状态、耗时、工具参数与失败位置。trace 只记录经过裁剪的诊断信息，
不把 provider 密钥、OAuth token 或原始用户 Memory 暴露给页面。

服务范围判断位于 planner 之前。明显超出 Orbit 人脉、活动和关系工作范围的请求由
`service-scope-v1` 本地规则直接路由到安全回复和可复核的人脉建议，planner 阶段标记为
`skipped`。这条前置护栏不会产生写操作；当 loop 配置允许后续 synthesis 时，synthesis
只能润色既定边界，不能重新开放被拒绝的能力。

所有工具调用和写操作 proposal 都必须经过 Capability Registry 与严格 schema 校验。
模型不能动态发明工具、权限、风险等级或 executor；无效参数、未登记能力、缺少权限和
混合读写请求一律 fail closed。

## 测试要求

- action queue 测试确认每个动作有 evidence 和 priority。
- accept/dismiss 测试确认只改变本地 preview，不执行外部副作用。
- autonomy 测试覆盖 low、medium、high 等策略状态。
- sandbox 测试确认 external side effect 标记为 false。
- 页面测试确认用户能看见确认保护和动作来源。
- 浏览器验收必须使用真实登录态和实际 AI provider，覆盖只读推荐、服务范围护栏、
  Memory CRUD 与开关、自动任务生命周期、写操作确认/回执/撤销，以及外部连接
  fail-closed 状态。
- provider OAuth 凭据不可用时，不允许用 mock 冒充真实外部成功；浏览器验收连接不可用
  与不发出写请求的行为，provider 请求契约在受控 service-boundary 测试中验证。

## 团队协作规则

Actions 团队不能直接改 Contacts、Events、Followups 的 fixture 来制造动作。需要新证据时，先通过对应模块 contract 增加字段，再让 Actions 消费该字段。Actions 只负责编排下一步，不拥有原始事实。
