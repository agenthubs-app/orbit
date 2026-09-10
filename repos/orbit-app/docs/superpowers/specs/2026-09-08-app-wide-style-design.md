# Orbit 全 App 视觉统一 — 执行规格
日期：2026-09-08

## 授权与交付
用户确认了全 App 方案，并明确要求「请直接执行不要问我了」。本文记录已确认的方案和可逆实施细节，不另设重复设计选择。沿用当前工作区；只交付本地修改，不提交、推送、发布或修改业务记录。全局覆盖尚未完成，不能用此前三页的通过记录代替本轮验收。

## 目标
整个原生 App 使用同一套视觉语言，保留现有导航、页面用途、业务流程、数据、权限与 API 边界。不是重新选品牌方向，不是只改颜色，也不是把不同页面强制变成联系人列表。

## 视觉规范
- 复用当前已选色板，不更换品牌色：浅色主动作 #006DB8，主文字 #20242C，次文字 #626874，页面 surface #FFFEFC，内嵌底色 #F3F3F2，分隔 #E5E4E0。深色沿用已有 darkColors（主动作 #A2AFD3、页面 #22262E、文字 #F0F0EC）。
- 原生系统 SF/PingFang 字体，不下载新字体、不新增海报式宣传文案或装饰素材。
- 大标题 28/36、700；内容标题 22/30、600；章节 18/26、600；主要人物/列表标题 17/24、600；正文 15/23；辅助 13/20；说明 12/18。现有联系人详情 24/32 姓名、14/23 正文和 AI 对话排版可保留为语义变体，不能机械放大所有文字。
- 页面水平留白 22pt，最大内容宽度 540pt；组件内部仍使用 8/12/16/24pt 间距。原生安全区、键盘滚动、刷新和返回行为保留。
- 主操作最小高 50pt，圆角 8pt；普通可点击控件最小触控范围 44pt，文字可换行或控件可增长，不能用固定高度裁剪内容。输入框最小高 44pt、圆角 10pt。状态标签、时间文字不是按钮，不强制膨胀为 44pt。
- 主要内容放在页面底面，用文字层级、间距与细分隔组织；普通 DataCard 默认为开放 section。真正需要边界的表单、风险/错误提示、选择区域与弹层使用 inset 表面（圆角 12pt），避免内外多层卡片。
- 页头采用无外框的原生返回入口与清晰标题，不再堆叠无信息价值的 Orbit eyebrow。有业务含义的上下文标签保留。页面不新增导航层。
- 按钮使用一致的主次层级；一个操作区域只突出主要动作，次操作保持可发现。禁用、加载、按下、错误、空态在两种外观下可辨识。
- 对话保留消息阅读和输入器；日历保留日/周/月与时间网格；活动保留封面；关系图/统计保留图表结构。统一字体、控件与底面，不破坏这些语义布局。

## 实施边界
- 仅修改 repos/orbit-app；不修改后端、API 合同、数据库或鉴权策略。
- 保留已有脏工作，尤其 AI 首页提示、收件箱邮件式实现、联系人三页样式和相关测试。
- 不删字段、联系人、筛选或功能入口来获得视觉整洁；保留搜索、展开、失败重试、编辑草稿。
- 保留名片采集已有扫描/识别/确认流程；不把未实现的双面扫描或发送能力伪装为本轮成果。
- 先用 GitNexus upstream impact 分析每个被修改的函数/样式入口。repo 参数使用绝对路径 /Users/xzhao/Projects/orbit，避免同名 worktree 索引。HIGH/CRITICAL 修改前报告。新符号未索引记 UNKNOWN。
- 先添加真实渲染/交互失败回归，再实现。不得仅写源码包含字符串的样式测试来声称覆盖了视觉行为。
- 不新增依赖，不自动生成图片，不修改系统权限或用户真实业务记录。

## 共享接口
在 src/design/tokens.ts 新增 layout = {pageInset:22, contentMax:540, toolbar:44, control:44, primaryControl:50, contentBottom:48}；保留现有 token 名称。radius.control=8、radius.input=10、radius.card=12；typography.display=28、typography.title=22、typography.section=18，其余保持现有值。新增 textStyles 对象提供上述字体角色和行高。
在 src/design/controls.ts 新增 createControlStyles(colors: OrbitColors)，返回 primaryButton、primaryButtonText、secondaryButton、secondaryButtonText、input、chip、chipText、selectedChip、selectedChipText。返回对象可直接 spread 到既有 StyleSheet；不包含行为、路由或状态。
DataCard 保留既有 props，新增 variant?: "section" | "inset"（默认 section）。AppScreen 保留既有 props，新增 headerVariant?: "large" | "compact"（默认 large），不修改返回/无历史 fallback 语义。ContactPage 不需要删除，改为复用 shared layout/text/radius tokens，保留联系人返回目标。

## 全量覆盖清单
共 58 个入口（不含 layout），4 个跳转入口；多个入口复用组件，不能声称有 58 个独立界面。
| 组 | 路由 |
| --- | --- |
| AI | /ai、/ai/[id]、/agent |
| 人脉 | /contacts、/contacts/list、/contacts/[id]、/contacts/new、/contacts/dashboard、/contacts/graph、/contacts/pipeline、/contacts/intros、/contacts/analysis/[dimension]/[bucketId]、/contacts/all-actions |
| 活动 | /events、/events/[id]、/events/[id]/register、/events/[id]/attendees、/events/center、/events/[id]/operations、/events/[id]/operations/admission、/events/[id]/operations/check-in、/events/[id]/operations/roles、/events/[id]/analytics |
| 消息 | /inbox、/inbox/[id]、/chat、/chat/[id] |
| 日程与任务 | /schedule、/schedule/events/[id]、/today、/tasks、/tasks/[id]、/followups |
| 账号与设置 | /profile、/account、/account/login、/account/signup、/account/forgot-password、/account/permissions、/settings、/settings/api |
| 运营与其他 | /admin、/admin/access、/admin/events、/login-admin、/platform、/o/[slug]、/register、/register/[code]、/party、/party/checkin、/party/graph、/home/events、/dashboard |
| 跳转兼容 | /、/home、/account/mobile-google、/[...legacy] |
非路由界面包含 AI 侧栏/历史/输入菜单、联系人筛选/完整资料/编辑、名片相机/采集方式/确认、收件箱编辑预览、权限提示、各处展开/空态/加载/错误。

## 验收
1. 全量页面清单每项记录直接修改或继承共用组件的结果，不能无说明遗漏辅助/管理页面。
2. 每批真实渲染/交互回归覆盖操作未丢失、窄屏可用、文本未裁剪、可见反馈；已知远端与原生边界只在测试中替代，不修改生产业务。
3. 全套 npm test、npm run typecheck、git diff --check 通过；原有源码断言若约束旧设计，须以真实消费者回归替代并说明。
4. 原生模拟器逐条导航检查可达路由；受数据/角色限制页面如实记录限制，并用受控 fixture 覆盖成功/失败内容，不能把权限空态当作业务成功态。
5. 浅深色、320pt 窄屏（渲染）、正常与大字、键盘、弹层/编辑状态和关键功能流均有证据。截图写到 /tmp 后归档，避免 Metro 采集中间刷新。
6. 独立任务审查与全量审查，不以代理自报完成代替检查。完成后提供原生截图与覆盖记录，未通过项不能标完成。

