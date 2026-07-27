# iOrbit 全产品功能补全与真实流程治理 Prompt

> 用途：在新的 GPT-5.6 Sol Session 中创建长期 Goal。由于 Goal 文本限制为
> 4000 字以内，请把本文末尾的“Goal 启动词”粘贴到 Goal 中；模型必须先完整读取
> 本文件，再按这里的要求持续执行。

## 最终目标

在现有 iOrbit Agent 已基本可用的基础上，系统完成其余所有产品页面的功能盘点、
成熟产品对标、交互设计、架构治理、真实数据接入、按钮功能覆盖、自动化测试和
最终风险扫描。

最终应达到：

1. 用户能理解每个页面的用途。
2. 所有可见按钮、链接、菜单和操作都有明确且正确的行为。
3. 页面之间使用同一套真实业务实体、登录态、权限和路由。
4. 不把 Mock 数据伪装成真实业务结果。
5. 核心业务流程能使用真实数据库和真实 AI Provider 完成。
6. 桌面端和移动端具备完整的加载、空状态、错误、权限和确认反馈。
7. 架构简洁、可复用、可测试，不堆页面级补丁。
8. 形成可持续运行的页面和功能覆盖扫描机制。

## 当前背景

- 工作目录：`/Users/li/work/orbit`
- 主要 Web 项目：`/Users/li/work/orbit/repos/orbits`
- 当前工作分支通常为 `chat-agent`，开始前必须确认。
- Agent、Today、Party、联系人详情 Agent 入口、活动详情 Agent 入口和首页
  Agent 入口已做过一轮真实流程适配。
- DeepSeek Provider 已通过 `.env.local` 配置并完成过真实调用。
- 不得输出、记录或提交 API Key、密码、Token、Cookie 等密钥。
- 仓库可能存在用户未提交的 `AGENTS.md`、`CLAUDE.md`、
  `.claude/skills/**`、`.claude/launch.json` 等文件。必须保留，不得提交。
- 测试集中可能存在锁定旧首页、旧 Agent DOM、旧主题功能或独立存储未配置的
  历史失败。必须逐条分类，不得用“历史问题”概括后忽略。

## 不可违反的工作原则

1. 根据真实代码、真实数据和真实浏览器行为判断，不得主观臆测。
2. 从根因解决问题；不得隐藏按钮、吞掉错误、写死 ID、伪造成功状态或静默切换
   Mock。
3. 修改函数、类或方法前遵守仓库 `AGENTS.md`：先做 GitNexus impact
   analysis；HIGH/CRITICAL 风险先报告；提交前运行 `detect_changes()`。
4. 优先复用已有组件、领域模型、服务、Provider、Presenter、路由 helper 和
   Design Token。
5. 同一种逻辑出现两次以上时，判断并优先抽成共享能力。
6. 不把所有逻辑塞进巨型组件，也不为每个页面重复创建相似 helper。
7. 不得覆盖、stash、reset、删除或误提交用户已有修改。
8. 每完成一个独立、可验证阶段就 Commit；Commit 只包含本任务文件。
9. 完成后推送当前分支到远程。
10. 仅当需要新权限、凭据或会改变产品方向的关键选择时才询问用户；普通实现
    判断根据证据自主完成。
11. 不得只输出计划或审计报告；发现可在当前范围修复的问题后必须实施、测试和
    提交。

## 第一阶段：同步代码并建立基线

1. 检查分支、远程状态和工作区修改。
2. 在不覆盖用户修改的前提下获取远程最新代码；有冲突风险时准确报告，不得擅自
   stash/reset。
3. 确认 Web、数据库、AI Provider、Worker 的启动方式和真实配置状态。
4. 运行生产构建和全量测试，记录总数、通过数、失败数及逐项分类。
5. 使用真实登录账号进入产品，记录登录态和可访问范围。
6. 日志、报告和提交中不得暴露 `.env.local` 的敏感值。

## 第二阶段：建立全产品 Surface Manifest

自动扫描所有生产页面，不只检查 Agent：

- `/`、`/app`
- 登录、注册、忘记密码
- 首页、个人中心、Profile、Settings
- Agent、Chat、Inbox
- 活动列表、详情、报名、Organizer、Platform、Admin
- Today／日程
- 人脉列表、详情、Dashboard、Pipeline、Graph、Intros、Import、Scan、
  All Actions
- Party、Check-in、Graph
- 所有重定向、错误页、空状态和移动端弹层／导航

为每个页面建立机器可读清单，至少包含：

- 路由、页面定位、访问权限
- 登录前与登录后行为
- 数据来源及 Live／Mock／Fixture／Derived／AI Generated 状态
- 数据库、AI、外部集成依赖
- 页面所有按钮、链接、菜单和快捷键
- 操作目标、读写属性、确认、撤销／补偿
- loading、empty、partial、error、permission denied 状态
- 桌面端、移动端表现
- 测试覆盖和已知风险

产物至少包括（可按现有目录调整名称）：

- `docs/audits/product-surface-manifest.md`
- `docs/audits/product-surface-manifest.json`
- `docs/audits/button-action-coverage.md`
- 可重复运行的扫描脚本及其测试

这些产物必须进入仓库，不能只存在于聊天记录。

## 第三阶段：产品定位、竞品对标和功能决策

iOrbit Agent 的定位不是普通聊天机器人，而是：

> 连接个人关系、活动、日程、沟通和执行流程的智能关系操作系统入口。

使用最新官方资料研究成熟产品的方法，优先官方产品页、帮助中心和技术文档：

- ChatGPT／Claude：对话、工具调用、任务状态、确认、引用和过程透明度
- Microsoft Copilot／Gemini：跨业务数据上下文和权限继承
- Notion AI：工作区上下文、引用和结构化结果
- Linear／Asana／Notion：任务、状态、批量操作和反馈
- Salesforce／HubSpot／Attio：联系人、关系、活动记录和 CRM 操作
- Clay／Common Room：关系信号、联系人丰富和来源追踪
- Motion／Reclaim：日程建议、冲突处理和自动安排
- Intercom／Slack：消息草稿、收件箱、未读状态和协作反馈
- 成熟活动／社区产品：报名、签到、撮合、现场及会后跟进

必须回答：

1. 用户如何理解 AI 正在做什么？
2. 如何区分建议、草稿、待确认、执行中和已执行？
3. 如何保护高风险操作？
4. 如何展示来源、证据和更新时间？
5. 如何处理失败、重试、撤销和补偿？
6. 如何避免每个页面堆重复 Agent 入口？
7. 业务页面和总 Agent 入口如何分工？
8. 哪些功能能切实提升体验？
9. 哪些功能看似先进但当前价值低，应暂缓？
10. 哪些能力必须先补数据、身份和权限架构？

输出功能决策表，分为：

- 必须保留
- 必须补齐
- 应该优化
- 应该合并
- 应该移除
- 暂缓实现
- 依赖外部集成后实现

每项写明用户价值、依赖、风险、复杂度和优先级。不得机械照抄竞品 UI。

## 第四阶段：建立统一可复用架构

### 路由与实体身份

- 每个实体只有一个真实 ID 和 canonical route。
- Route Alias 只做重定向。
- URL 保留必要业务上下文。
- 禁止不同页面各自创造联系人或活动 ID。
- 禁止根据姓名拼接实体 ID。

### 数据来源

统一区分：

- Live
- Mock
- Fixture
- Derived
- AI Generated
- User Confirmed
- Externally Executed

每个页面可追踪数据来源、生成时间、数据库读取、AI 调用、写操作和预览状态。

### Action Registry

建立或完善统一操作注册机制。每个 Action 至少描述：

- action id、label
- entity type、entity id
- permission
- read/write 类型
- confirmation policy
- execution handler
- success／failure feedback
- retry policy
- undo／compensation policy
- audit／evidence
- Agent 和页面是否可调用

页面按钮调用共享 Action，不自己重复拼请求和改变业务状态。

### Agent Context

业务页面进入 Agent 时统一携带结构化上下文：

- entity type、entity id
- 用户目标、页面来源
- 是否只读
- 是否允许草稿
- 是否允许执行
- 确认等级

若当前只支持 `q`，保持兼容但使用统一 helper，并为结构化上下文预留扩展，不得
在每个页面重复编码 prompt。

### 状态模型

统一定义并复用：

- loading
- empty
- partial
- ready
- draft
- pending confirmation
- executing
- succeeded
- failed
- retryable
- compensated
- permission denied
- unavailable

### 登录态与权限

- 所有页面使用同一登录来源。
- 服务端权限和客户端显示一致。
- 未登录用户看不到登录后专属操作。
- 已登录用户不显示错误的登录／注册按钮。
- 不得用隐藏按钮代替服务端鉴权。
- 桌面端和移动端权限一致。

### UI 组件

优先复用 Top Navigation、Mobile Menu、Entity Header、Empty/Error State、
Loading Skeleton、Confirmation Dialog、Action Status、Evidence Panel、
Agent Entry、Toast／Inline Feedback、Form、Button、Menu、Modal 和响应式布局。

## 第五阶段：扫描所有按钮和交互

建立可重复执行的 Button／Action Coverage 扫描，至少覆盖：

- `<button>`、`<a>`、`role="button"`
- `onClick`、表单提交、菜单项、卡片点击
- 图标按钮、FAB、弹层、下拉菜单、键盘快捷键

逐项检查：

1. 可访问名称是否明确。
2. 是否有真实 handler 或合法 href。
3. href 是否对应真实路由。
4. 是否使用演示或写死 ID。
5. 是否只 `preventDefault()` 而无后续行为。
6. 是否调用 Mock API 或显示假成功。
7. 是否有 TODO／NOT_IMPLEMENTED。
8. 是否有 loading／disabled 防重复提交。
9. 是否有成功、失败反馈。
10. 是否需要确认、撤销或补偿。
11. 桌面端与移动端是否一致。
12. 登录前能否错误触发登录后操作。
13. 是否被其他元素覆盖、点击区域不足或不可点击。
14. 是否可能重复写入或产生未捕获异常。

## 第六阶段：真实数据与 Mock 审计

扫描生产路由中的：

- fixture import、mock service、demo id、sample record
- 静态假数字、静态假成功、演示 fallback
- Live 失败后静默切 Mock
- TODO、NOT_IMPLEMENTED
- 未配置却显示正常业务结果
- 只改前端状态但未持久化
- AI 结果没有真实 Provider 调用
- 数据写入后没有复读验证

逐项分类：

- 合理测试 Mock
- 合理 `/dev/**` Fixture
- 明确标记的演示模式
- 不应进入生产路径的 Mock
- 真实流程尚未实现
- 真实流程已实现但页面未接入
- 页面已接入但缺少验证

生产 Live 失败时必须诚实显示受控失败及恢复路径，禁止静默展示演示数据。

## 第七阶段：按优先级实施

### P0

- 死链、无行为按钮、假成功
- 登录态／权限错误
- 写死实体 ID
- 生产页面静默使用 Mock
- 页面崩溃、数据误写
- 高风险操作无确认
- 桌面／移动端关键流程不一致

### P1

- 缺少 loading／empty／error
- 重复提交
- 页面上下文丢失
- Agent 上下文不完整
- 数据来源不透明
- 操作完成无反馈
- 移动端不可用
- 可访问性问题

### P2

- 视觉层级、信息密度、文案一致性
- 组件复用、响应式细节、次要效率优化

每完成一组：

1. 运行影响分析。
2. 编写／更新测试。
3. 实施代码。
4. 运行针对性测试。
5. 浏览器真实验证。
6. 检查控制台错误和失败请求。
7. Commit。
8. 更新 Manifest 和风险清单。

## 第八阶段：真实浏览器端到端验证

不得只靠单元测试，至少覆盖：

### 登录与导航

- 未登录首页、登录、注册入口
- 登录后首页、所有顶部导航、移动端菜单
- 退出登录、刷新、登录过期

### Agent

- 首页目标进入 Agent
- 真实调用 DeepSeek
- 联系人／活动详情进入 Agent
- 返回引用和业务上下文
- 区分草稿与执行
- 未确认时不得产生外部写操作

### 人脉

- 列表、搜索、筛选、详情
- 标签／状态、跟进
- Pipeline、Graph、Intros、Import／Scan、All Actions

### 活动

- 列表、详情、报名、活动 Agent
- Party、Check-in、Graph
- 现场到会后流程

### Today／日程

- 日历切换、真实联系人链接、真实活动链接
- 起草消息、安排约见
- 待确认、已确认、失败恢复

### 设置与资料

- Profile、Agent Settings、Memory、Automation、Feedback、Theme、权限与集成

桌面端和移动端都验证主要流程。禁止用固定 sleep 代替状态验证；每步验证明确
URL、DOM、数据库状态、API 结果或反馈。

## 第九阶段：最终可靠性与风险扫描

重新扫描整个代码库，覆盖：

- 未实现／部分实现功能
- Mock 残留和 Live 配置依赖
- 数据一致性、权限、安全、隐私
- 可访问性、响应式、性能
- 重复代码、巨型组件、循环依赖
- 未捕获异常、API 超时、重试、幂等性
- 重复写入、撤销／补偿、审计记录
- 测试、浏览器兼容和移动端缺口

每条风险写明页面／文件、具体问题、触发方法、用户影响、风险等级、是否已修复、
未修复原因和后续动作。禁止用“还有少量问题”等模糊描述。

## Goal 完成标准

只有全部满足才能标记 Goal 完成：

1. 所有生产页面已有 Surface Manifest。
2. 已有按钮／交互覆盖清单和可重复扫描机制。
3. 已完成成熟产品对标和功能决策表。
4. 已明确业务页面与 Agent 的职责边界。
5. 已建立／完善共享 Action、状态、路由、身份和 Agent Context 架构。
6. 所有 P0 已修复。
7. P1 已修复，或有具名、有证据的外部阻塞。
8. 生产页面没有未标记的 Mock 冒充 Live。
9. 所有关键按钮都有真实行为、正确禁用或诚实的不可用说明。
10. 关键路由无死链。
11. 登录态和权限在桌面／移动端一致。
12. Agent、联系人、活动、日程、Party 的业务上下文连续。
13. DeepSeek 真实流程验证通过。
14. 生产构建和 TypeScript 通过。
15. 本轮相关测试全部通过。
16. 全量测试每个失败都有明确分类，不存在来源不明失败。
17. 浏览器端到端测试通过，且无本轮引入的控制台错误。
18. 所有改动分阶段 Commit 并成功推送远程。
19. 用户原有未提交修改未被覆盖或误提交。

## 最终交付

最终报告必须给出：

1. 产品定位结论。
2. 页面、功能、按钮和交互总数。
3. 已修复功能清单。
4. 新增或复用的共享架构。
5. 真实流程与 Mock 流程清单。
6. 桌面端和移动端验证结果。
7. 构建和测试结果。
8. 剩余风险及外部阻塞。
9. 每个 Commit 的 hash 和说明。
10. 远程推送结果。
11. 用户可立即测试的完整路径。
12. Manifest、报告和扫描脚本的文件链接。

---

## Goal 启动词（复制到新 Session，少于 4000 字）

你正在 `/Users/li/work/orbit` 仓库工作。请创建并持续执行一个 Goal：系统完成
iOrbit 除已基本可用的 Agent 外，其余所有生产页面的功能盘点、成熟产品对标、
架构治理、按钮覆盖、真实数据接入、桌面/移动端验证和最终风险扫描。

开始前完整读取并严格执行：
`/Users/li/work/orbit/docs/prompts/iorbit-product-surface-completion-goal.md`

同时读取并遵守仓库 `AGENTS.md`。修改符号前做 GitNexus impact analysis，
HIGH/CRITICAL 风险先报告；提交前运行 `detect_changes()`。先检查当前分支、远程
状态及用户未提交修改，在不覆盖、不 stash、不 reset、不误提交用户文件的前提下
获取最新代码。不得输出或提交 `.env.local` 中的任何密钥。

必须从真实代码、数据库、API、登录态和浏览器行为出发，不得主观臆测，不得通过
隐藏按钮、吞错、写死 ID、假成功或 Live 失败后静默切 Mock 解决问题。优先复用
已有组件、领域模型、Provider、Presenter、路由和状态 helper；重复逻辑应抽成
简洁共享能力。不得只交付方案或报告：完成审计后按 P0→P1→P2 实施修复，每个
阶段执行影响分析、测试、真实浏览器验证、Manifest 更新和独立 Commit。

必须扫描所有生产路由、按钮、链接、表单、菜单、卡片操作、FAB、弹层和快捷键，
建立可持续维护的 Surface Manifest、Button/Action Coverage 和 Mock/Live
清单。检查行为、路由、实体 ID、权限、确认、撤销、幂等、loading、empty、
partial、error、移动端、可访问性和真实持久化。对标成熟 Agent、CRM、日程、
任务、消息和活动产品的官方设计资料，形成“保留、补齐、优化、合并、移除、
暂缓、依赖集成”的功能决策表，但不得机械照抄。

真实验证至少覆盖登录和导航、首页到 Agent、DeepSeek 调用、联系人/活动上下文
Agent、Today、活动报名、Party/Check-in/Graph、人脉各子页面、Chat/Inbox、
Profile、Settings、Organizer/Platform/Admin。桌面端与移动端都要验证。禁止
使用固定 sleep 代替 URL、DOM、API、数据库状态或成功反馈验证。

只有当文档中“Goal 完成标准”全部满足，所有 P0 修复，本轮测试和生产构建通过，
全量测试失败逐项分类，真实浏览器链路通过，所有改动分阶段提交并推送远程，且
用户原有修改未被覆盖时，才能将 Goal 标记完成。除非缺少新的权限、凭据或存在
会改变产品方向的关键选择，否则不要停下来询问；请自主持续执行直到真正完成。
