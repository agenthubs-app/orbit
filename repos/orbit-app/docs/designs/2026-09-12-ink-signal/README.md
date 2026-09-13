# Ink & Signal：已选定设计与实施起点

**当前整包原生验收：未通过／未完成。** 新版已在实际 Simulator 检查首页、人脉、活动、我的、日程、待办、跟进、收件箱、登录和 IORBIT；浅色登录键盘与深色会话键盘已目视确认。大字号热切换和待办长标题仍裁切，名片／运营非空流程未验；诊断退出后当前登录态不可用。详见[原生运行状态核验](2026-09-12-native-status.md)，不以 RNW 结果替代。

状态：2026-09-12 选定的 26 张设计状态均已完成本地实施与 RNW 对照，包括最后的三条名片导入复核流程；真实导入进度缺口已补齐。各批功能差异、回归与独立复审见下文及逐页 QA。当前合并全量测试 **2190/2190**，0 失败／取消／跳过，203.597864791 秒、exit 0；typecheck exit 0。日志 `/tmp/orbit-ink-signal-final-regression3.log`、`/tmp/orbit-ink-signal-final-typecheck3.log`。单独原生标题断言为 RED，不属于这 2190 项；这不是全包完成交接。

## 最后名片批次与合并回归

三条名片流程已完成图片优先、开放字段、真实风险与确认动作；保留七字段、候选保存、去重与原生二次确认。审查修复后的定向 80/80、新名片测试 28 项，独立复审 APPROVE；详见[名片 QA](2026-09-12-card-review-qa.md)。

合并首轮为 2183/2185：两项旧测试仍要求改版前的账号文案及运营区零分隔线。修正为实际入口／顺序／路由和开放分隔的行为断言，没有修改账号或运营生产逻辑。Simulator 另发现 `Keyboard.isVisible` 作为未绑定初始化函数导致启动崩溃，补原生 this 语义的失败回归后改为保留接收者的调用。相关四套测试 57/57、独立复审通过；当时合并为 2188/2188。随后修复真实 Hermes 日期 parts 差异，两条新增回归、四套定向 178/178 和独立复审通过，最终合并为上述 2190/2190。

## 设计来源

- 用户提供：`/Users/xzhao/Downloads/软件UI设计现代化.zip`，4,663,277 bytes。
- SHA-256：`7bdcef7d043f9eea35091a876e9e24d197ae8ed1fae78d2fbbb81cfad55fa881`。
- 原始[实现说明](design_handoff_orbit_ink_signal/README.md)、[HTML 画板](<design_handoff_orbit_ink_signal/Orbit 改版方向.dc.html>)、[底栏参考](design_handoff_orbit_ink_signal/TabBar.dc.html)及截图已原样解包；下载目录的原 ZIP 未修改。
- 仅采用 `1c`、`2a`、`3a`；`1a`、`1b`、底栏 `glass`/`dark` 是被淘汰的设计，不实施。
- ZIP 内有 26 张 PNG 和 4 个其他文件，共 30 个文件。源说明的“35 屏”不能用作已交付或已验收数量。
- 图中手机外框、状态栏和虚构数据不是生产内容。App 使用系统安全区、现有真实头像及活动图片，不把整屏截图当作界面。

## 视觉与功能优先级

用户明确要求严格遵循这份 UI，同时保持 Orbit 自己的功能设计。因此这份包批准的是视觉目标，不授权增加后端能力、改变关系阶段、伪造角色或隐藏失败。

- 白底 `#FFFFFF`、墨黑 `#0B1220`、信号蓝 `#0A5CFF`、分隔线 `#E6E8EE`、列表分隔 `#EEF0F4`、辅助表面 `#F5F7FA`。
- 系统字体；页面水平 inset 16pt；30pt/900 页面标题；15pt/800 区块标题；12pt 辅助信息。正文、长文本、系统字号与触控热区仍须可用。
- 五项底栏：首页、人脉、IORBIT、活动、我的；IORBIT 为独立全屏入口。二级页不带底栏。
- 保留当前 HTTP client、鉴权、任务和日程真实状态、联系人数据含义、申请/报名/角色权限、失败草稿及防串号边界。
- 设计稿里的工作区新建/邀请、关联笔记、直接发送消息等，不能仅因画在图里就新增实现。先按现有能力映射；未提供的行为必须明确标为差异，不制作假成功。
- 笔记中心及旧互动输入迁移继续服从既有 D7 后期实施边界，见[会议任务审阅稿](../../superpowers/plans/2026-09-10-app-meeting-task-review.md)。不得把“写笔记”链接到不相干页面，或在没有替代入口时移除用户的旧内容。
- 深色模式是现有能力，但本包没有选定的深色稿。不得采用淘汰的 `1b`；需保留现有深色行为并单列验证范围，不声称已像素级对齐未提供的设计。
- 只编辑 `repos/orbit-app`，不修改 Web/API、共享生成副本或真实数据库；不提交、推送或部署。

## 页面映射

下表是实施入口清单，不表示对应功能已经完成。路径相对 App 根目录。

| 选定截图 | 现有入口 / 代码 | 必须保持的边界 |
| --- | --- | --- |
| 1c-首页 | `app/home.tsx`；`src/screens/home/HomeDashboardScreen.tsx`；`src/view-models/home-dashboard.ts` | 已成为默认启动页；真实资源／日期筛选／任务完成；旧 `HomeScreen` 的 `/home/events` 保留 |
| 1c-人脉 | `app/(app)/contacts.tsx`；`src/screens/contacts/ContactsScreen.tsx` | 保留检索、关系维度筛选、分析及导入入口 |
| 1c-人脉详情 | `src/screens/contacts/ContactDetailScreen.tsx` | 保留资料编辑与旧内容，不替换关系阶段枚举 |
| 1c-活动 | `src/screens/events/EventsScreen.tsx` | 公开访问、报名状态和主办方权限不变 |
| 1c-我的 | `src/screens/profile/ProfileScreen.tsx` | 保留资料、提取、建议确认和失败草稿 |
| 1c-IORBIT会话 | `src/screens/ai/AiConversationScreen.tsx` | 保留会话身份、真实消息、持久化、引用及确认边界 |
| 2a-IORBIT首页 | `src/screens/ai/AiScreen.tsx` | 保留现有历史、搜索、删除和输入草稿 |
| 2a-活动详情 | `src/screens/events/EventDetailScreen.tsx` | 报名必须进入现有流程，不能绕过资格与问答 |
| 2a-日程-日 | `src/screens/schedule/ScheduleScreen.tsx` | 保留日期、事件跳转与现有数据类型 |
| 2a-日程-周 | 同上 | 切换只改变视图，不修改事件 |
| 2a-日程-月 | 同上 | 保留真实事件指示、选中日期和假日含义 |
| 2a-待办 | `src/screens/tasks/TasksScreen.tsx` | 保留现有分类、状态、创建和筛选 |
| 2a-待办详情 | `src/screens/tasks/TaskDetailScreen.tsx` | 完成、取消、更新仍使用现有操作和失败恢复 |
| 2a-联系跟进 | `src/screens/followups/FollowupsScreen.tsx` | 不混淆建议、已保存待办、草稿和已发送消息 |
| 2a-登录 | `src/screens/profile/AccountAuthScreen.tsx` | 保留真实登录、Google provider 可用性及安全 next 路由 |
| 3a-设置 | `src/screens/settings/SettingsScreen.tsx` | 只展示已有设置，保留通知显式授权和解绑失败反馈 |
| 3a-账号与工作区 | `src/screens/profile/AccountScreen.tsx` | 不捏造成员、管理员或邀请能力 |
| 3a-人脉编辑 | `ContactDetailScreen.tsx` 中 `UpdateContactPanel` | 按当前授权字段编辑；未提供头像接口则不伪造更换成功 |
| 3a-名片导入 | `src/screens/contacts/ContactAcquisitionScreen.tsx`、`BusinessCardBatchScreen.tsx`、`BusinessCardIngestScreen.tsx` | 保留图片、识别、编辑、去重和显式确认状态机 |
| 3a-收件箱 | `src/screens/inbox/RelationshipInboxScreen.tsx` | 保留通知与关系内容、未读事实和真实操作 |
| 3a-活动运营台 | `src/screens/events/EventOperationsScreen.tsx`、`EventOperationsContent.tsx` | 不替换运营、审核、签到的实际能力与访问检查 |
| 3a-无权限-运营台 | 现有活动/账号权限边界 | 不发明申请权限 API 或展示虚构管理员 |
| 3a-空态-人脉 | `ContactsScreen.tsx`、`src/components/EmptyState.tsx` | 只有真实空数据才显示空态；加载和读取失败不得作空态 |
| 3a-加载态-首页 | 新首页装配；`src/components/LoadingState.tsx` | 独立资源失败可见，不显示伪造计数 |
| 3a-失败态-IORBIT | `AiScreen.tsx`、`AiConversationScreen.tsx` | 保留提问和草稿；不凭参考图硬编码错误代码或禁止可用编辑 |
| 3a-大字号-首页 | 新首页装配 | 随实际 fontScale 改为单列，不能靠禁用系统字号规避裁切 |

现有其他页面仍需检查公共样式影响，不以这 26 张截图替代全路由回归。

## 基线与恢复证据

源码起点：根仓库分支 `chat-agent`，HEAD `8b38b4eb8618505ca4f59f20dc323159e1ad784b`。开始时 tracked 文件无修改，既有设计资料、prototype 和会议计划均保留。

1. 首次 `npm test` 因本地缺少锁定依赖 `magic-bytes.js@1.13.1` 产生名片测试装配失败。
2. 补装时错误使用 `--package-lock=false`，导致 npm 忽略锁定解析并升级本地依赖。已停止该进程，没有修改 `package.json` 或 `package-lock.json`。
3. 原地 `npm ci` 曾因 `ENOTEMPTY` 失败。将残余依赖目录移至 `.expo/node_modules.before-ink-signal-recovery-20260912` 保留恢复材料，再执行 `npm ci --ignore-scripts --no-audit --no-fund` 成功。
4. 复核 700 个已安装包与锁文件的版本，差异为 0。Expo `57.0.8`、React Native `0.86.0`、Expo Router `57.0.8`、magic-bytes.js `1.13.1`。
5. `npm run typecheck`：exit 0。
6. 全量 `npm test`：1390 项，1389 通过、1 失败、0 跳过、0 取消，101.165 秒，exit 1。日志 `/tmp/orbit-ink-signal-baseline-20260912.log`。
7. 唯一失败：`tests/route-parity.test.ts`，App 缺少 Web 的 `/contacts/new/import/[id]`。未添加空路由、删除断言或把此项标为通过。

此前 2026-09-10 用户接受相同失败的审批针对保存进度的合并/推送，未扩张为本次新改版的失败基线放行。2026-09-12 用户随后明确“我们的功能为主。如果有缺口的地方，你就仿照它的设计去补足就可以了”，据此先补齐真实导入进度入口，再继续视觉实施。

### 导入缺口补齐（2026-09-12）

- 新增 `BusinessCardImportScreen` 和私有 `/contacts/new/import/[id]`：已有后台准备任务的进度、前台轮询、取消确认、失败重试、完成后进入原批量确认页；不新增后台或文件上传流程。
- 该 API 的 `{data}` / `{error}` 封装尚未纳入共享契约，App 仅为这一消费者适配既有 HTTP client，并验证公开字段。Cookie 防混用、Origin、请求撤销和会话失效规则保持原样；未扩张同步 whitelist。
- 路由、服务器、账号、Cookie、前后台和焦点变化均隔离请求；取消双击、迟到轮询、取消冲突、失效读取和登录回跳有测试覆盖。
- `tests/business-card-import.test.ts`：15 项；`tests/business-card-import-interactions.test.ts`：19 项。新增测试先失败再实现。原路由对齐测试现在通过；两个路由安全/覆盖清单登记真实入口，历史 58 页原生验收记录不扩张。
- 独立审查指出的页码/终态不变量和进度朗读名称已修复并通过复审；当前文件显示已准备页数，不把后台下一页指针当成已完成数量。
- 导入补齐后的全量 `npm test`：1425/1425，0 失败、0 跳过、exit 0，100.244 秒；日志 `/tmp/orbit-ink-signal-import-final3-20260912.log`。中途一次滑动弹层把 44pt 测成 43.99993896484375，已有精确回归和 0.001pt 容差，仍拒绝 43.99pt；未缩小产品触控尺寸。类型检查通过。这是公共样式修改前的完整基线。
- 版本仍是 HEAD `8b38b4eb8618505ca4f59f20dc323159e1ad784b` 加未提交 App 改动。Web/API 未修改，没有真实账号、数据库或跨端写入联验；原生截图和全包视觉对照仍未完成。

## 修改前影响分析

### 公共视觉与导航批次（进行中）

已接入 Ink & Signal 浅色 tokens、墨黑主动作/选中控件、白底描边次动作、16pt inset、五入口浮动底栏和二级页分层返回。深色配色保留。底栏采用源稿 SVG 几何，72pt 正常高度；大字号允许增长，键盘出现时隐藏。随后 `/home` 已接入真实首页，其余导航目的页继续分批改版。

新导航/布局测试 12/12；公共层独立复审通过，修复了登录/权限深链返回到公开账号页，以及有历史时使用真实含义的“返回”标签。公共层完成时全量 `npm test` 1437/1437，0 失败、0 跳过、103.907 秒，日志 `/tmp/orbit-ink-signal-shell-review-full.log`；typecheck、diff check 通过。八个现有 esbuild 测试补上 `.web` 解析顺序，使源 SVG 走真实网页实现；旧暖白/间距/字重期待按已批准设计更新，业务断言保留。这不是逐页视觉 QA 或真实原生验收结论。

GitNexus 使用绝对仓库路径 `/Users/xzhao/Projects/orbit`，避免同名旧工作树。

| 目标 | 直接依赖 | 流程统计 | 风险 |
| --- | ---: | ---: | --- |
| `createControlStyles` | 43 | 最新查询 12 个关联入口统计，含任务、人脉导入、活动、权限、收件箱和详情 | CRITICAL |
| `AppScreen` | 49 | 11 个关联入口统计，含报名、任务、审核、账号与聊天 | CRITICAL |
| `src/design/tokens.ts` | 68 个文件直接导入 | 文件级查询未给出流程，不代表无影响 | CRITICAL |

以上风险已在修改前告知用户。后续逐符号编辑仍须各自检查，不能将这份公共组件报告当成所有页面的授权或分析替代品。

## 接续顺序与完成条件

### 首页批次验证（2026-09-12）

- `/home` 及默认启动目标已接入 `HomeDashboardScreen`；显式 `/ai`、安全深链白名单和旧 `/home/events` 能力保留。搜索、收件箱、七日选择、快捷操作、真实日程／任务／联系人跳转可用。
- 三个区域分别读取既有任务、日程、联系人接口；按东京日期和真实状态投影。完成待办使用原 PATCH 协议、同步点击锁、撤销与迟到结果隔离；失败不伪装成完成或空数据。
- 新首页使用完整账号／服务器／Cookie 作用域。徽标 hook 的可选作用域转发到 `useApiResource`；仅 opt-in 路径新增撤销前解析保护和非 2xx 拒绝，原无作用域调用保持既有行为。修改前 `useApiResource` 影响分析为 CRITICAL，46 个直接调用、12 个入口统计，已告知用户。
- 复审指出的迟到徽标 401、非 2xx 成功封装、联系人根状态校验均已补失败测试并修复。大字号截图又发现 `flex: 0` 导致区域高度坍塌，新增实际位置断言复现后改为内容自适应高度；不以“样式为 column”代替不重叠检查。
- 首页／快照定向测试 61/61；全量 `npm test` 1486/1486，0 失败、0 跳过、105.423 秒；`npm run typecheck` 和 `git diff --check` 通过。日志 `/tmp/orbit-ink-signal-home-round7.log`、`/tmp/orbit-ink-signal-home-full2.log`、`/tmp/orbit-ink-signal-home-typecheck8.log`。
- 同状态 390×844、2× 渲染已和三张源图成组对照；具体修复、功能优先的差异及未验范围见 [首页 QA](2026-09-12-home-qa.md)。没有用伪造工作区、时间、人物或计数替代后端数据。对照数据仅存在于测试夹具。

既有失败已按用户确认补齐并恢复绿色基线。接下来把这份已选定设计拆成测试先行的执行批次：公共样式与页面容器 → 五项导航及 Split Day → 人脉/活动/个人页 → IORBIT → 日程/待办/跟进 → 设置/登录/收件箱/导入/运营及异常态。

### 人脉主页面批次验证（2026-09-12）

`/contacts` 已切换为真实主列表，旧 overview 与 `/contacts/list` 保留。自己的多维筛选、分析、关系进展、深度／关系搜索和添加路径仍可用；真实空集合按源稿展示，失败或不完整读取不伪装成空。搜索同步锁、条件切换取消、完整会话作用域、迟到 401 与异常 2xx 校验已覆盖。新增测试 38 项，定向 88/88，全量 1524/1524、typecheck、diff check 通过，独立复审通过。截图、功能差异和原生未验范围见 [人脉主页面 QA](2026-09-12-contacts-qa.md)。

### 人脉详情与编辑批次验证（2026-09-12）

`/contacts/[id]` 已按 1c／3a 接入开放详情与页面内编辑，真实图片、合作信息、来源证据、关系价值、旧互动和私有备注保留。编辑只写支持字段，取消／无修改不写，失败保留草稿；身份字段明确只读。最终复审补齐动态关系 ID 的重算与读取归属，迟到请求不覆盖当前结果或触发会话退出。定向 80/80、全量 1580/1580、typecheck、diff check 与独立复审通过。视觉对照及功能差异见 [人脉详情与编辑 QA](2026-09-12-contact-detail-qa.md)。下一批继续活动主列表和详情。

每批都需保留真实交互与请求边界，完成针对性测试、类型检查和对应截图对照。最终还需全路由回归、大字号/键盘/返回/失败草稿检查，以及 App 内的跨端影响交接。原生字号热切换的既有缺陷见[原生续查](../2026-09-08-app-wide-style/2026-09-10-native-followup.md)，不能声称设计改版已修复原生依赖问题。

### 活动主页面批次验证（2026-09-12）

`/events` 已对齐 1c 活动列表；公开浏览、真实组合筛选、8 项分页、推荐接受与运营入口保留。公开记录按实际起止时间分类；GET／POST 校验、会话归属、迟到请求和五项安全回执边界已覆盖。大字号品牌断词在公共底栏修复。定向 131/131、全量 1659/1659、typecheck8、diff check 与独立复审通过。截图和功能差异见 [活动主页面 QA](2026-09-12-events-qa.md)。下一批继续活动详情。

### 活动详情批次验证（2026-09-12）

`/events/[id]` 已对齐 2a：真实封面／信息四格／介绍／时间轴／参会者及固定报名入口。费用、来源、现场、会前目标、推荐开场白和会后复核保留；规范活动 ID、访客、已结束／取消、系统分享、三种个人写入回执、刷新草稿和会话隔离均有交互覆盖。真实多语言内容保留，服务占位只精确本地化。定向 195/195、全量 1803/1803、typecheck11、diff check 和最终独立复审通过。截图、修复和未验范围见 [活动详情 QA](2026-09-12-event-detail-qa.md)。继续 [我的页面计划](../../superpowers/plans/2026-09-12-ink-signal-profile.md)。

### 个人页批次验证（2026-09-12）

`/profile` 已对齐 1c：真实身份、等宽统计、基本资料、混排标签和账号入口；编辑、目标关系、建议确认与文本提取保留。三项统计独立校验／重试；失败不显示为零。保存与建议／提取回执校验、草稿保留、同步锁和完整会话作用域均有真实路由／HTTP 覆盖。明确说明现有文档接口不读取图片或 PDF 字节。定向 205/205、全量 1950/1950、typecheck9、diff check 与最终独立复审通过。截图、功能差异及未验范围见 [个人页 QA](2026-09-12-profile-qa.md)。继续 IORBIT 首页、会话与失败状态。

已有公共层及各已列批次本地渲染证据；尚无整包改版完成结论，也没有把 RNW 测试图当作原生验收或发布版本。

### IORBIT 批次验证（2026-09-12）

首页对齐 2a，会话／失败态对齐 1c／3a；真实历史、删除确认、原文、引用、业务面板、任务建议和执行依据保留。初始提交归属、同账号焦点切换保留、失败重试／编辑、仅重试保存、刷新接管与服务保存限额提示均有实际路由测试；不添加无协议支持的 @、笔记或反馈动作。合并定向集合 241/241，最后规范化 ID 修正及新增用例复验 67/67，typecheck13、diff check 与最终独立复审通过。详见 [IORBIT QA](2026-09-12-ai-qa.md)。未运行本批全量测试，未访问真实业务数据库或进行跨端真实写入；继续日程三种视图。

### 日程批次验证（2026-09-12）

日／周／月已接入 2a 结构：周一开头、墨黑分段、56pt 小时线、真实动态时刻、日期下划线和月选中圆。保留四类数据、日本假日、整周记录、所有既有跳转和部分来源失败；原稿无现成接口／页面支持的新建“＋”不伪造。新增 12 项测试，合并日程／活动预览／workspace 回归 78/78，typecheck6、diff check 和最终独立复审通过。二月格数和双倍字号断行已先复现再修复；详见 [日程 QA](2026-09-12-schedule-qa.md)。这批未做真实 HTTP／跨端写入或原生验收；继续待办列表／详情与联系跟进。

### 待办列表与详情批次验证（2026-09-12）

列表已接入下划线标签、同一响应的真实计数、东京日期分组和完成预览；逾期／无日期事项不丢失，完成预览按行状态恢复。详情接入开放元数据、24pt 标题、内容及固定双动作，保留失焦保存、版本冲突草稿、提醒授权、历史和删除。添加入口复用现有 `/today` 表单；关联只按真实 ID 跳转，不编造姓名头像。新增 13 项，合并定向 88/88、typecheck4、diff check 与最终独立复审通过。字号拆字、触控重叠和宽屏动作对齐均先复现再修复，详见 [待办 QA](2026-09-12-tasks-qa.md)。未做原生或真实跨端写入验收；继续联系跟进。

### 登录批次验证（2026-09-12）

登录接入 2a 开放表单、固定关闭、底部注册和 50pt 动作；注册／恢复保持现有流程。邮箱、密码、Google provider、安全 next、恢复锁及失败草稿不变。新 12 项覆盖真实表单交互、视觉几何和全部模式大字号；合并定向 70/70、宽度补验 12/12、typecheck3、diff check 与独立复审 APPROVE。详见 [登录 QA](2026-09-12-auth-qa.md)。没有原生 OAuth 或真实账号写入；继续设置和账号与工作区。
