# R21 iOrbit · E 线执行报告

状态：进行中。证据目录：`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-e/R21/run-01/`。本报告只覆盖 E 线当前提交，未推送、未合并、未连接 Neon/生产、未部署。付费 AI 真调用：**0 次**。

## 基线与提交

- 开工先在 `line-e` 执行 `git pull --rebase origin redesign`，起点 `caa94af4d`。仅修改 E 工作树；未改 A/D 组件、壳或 Bridge 台账。
- `66d73c21f`：本人会话全文搜索、PIN_LIMIT、软删撤销、90 日边界、pageContext 契约、R30 iOrbit 会话搜索。
- `84afeda52`：Web/App 起始、历史和上下文视图；预检清单。
- `898c2718f`：Web/App 停止与继续发送。
- `657204b3e`：计划类型入口、实体草稿深链、本机清理命令。
- `894a5ca07`：本机清理命令复用 actor-scoped 组织服务。
- `658be1590`、`a18d76b97`、`6a6bec74d`：草稿、Web 历史及 App 历史读取失败可见且可重试。
- `9986326d2`、`4e9d2993f`、`a5f2347a3`、`c5205be78`、`9afa4e70a`：App 四个起始问题及新路由的浏览器回归用例。以上提交均含 `Co-Authored-By: Codex <noreply@openai.com>`；仅本地提交。
- `e50551e09`、`99430c68f`：Web 像素清单补 1024/390 历史状态并等待真实会话加载；`888243ba3`：App 历史行左滑操作与浏览器手势测试；`34ee55157`：App 大字号窄屏边界用例；`0aa5df51b`：登记 App 起始/历史/全屏头的五个 smoke 画板与空白归因模板。提交均含相同 trailer。
- `5faa1ce5f`、`1ef149c26`：Web live 路由与旧页面用例改按新视图和撤销回执验证；提交含相同 trailer。

用户明确禁止运行 GitNexus，因此未做项目 AGENTS 要求的 graph impact / detect-changes。改动范围以源码调用点、定向测试和下述回归核查；不能把未做的图分析写成低风险证明。

## SC 对照

| SC | 当前结果与证据 | 未完成项 |
| --- | --- | --- |
| 01 App 全屏 | `/ai` 用 `AppScreen inset="kit"` 和新起始页，≡/✕、单行输入、左缘手势、历史入口已接；浏览器窄屏 320px、字体放大 1.8 倍下标题与输入不越界 1/1；路由仍保留原会话 controller。 | 原生 Simulator 浅深录屏与返回焦点链尚未验；A 的 FullDrawer 只从右侧进入。 |
| 02 Web 起始 | 登录后 1440/1024/390 浅深、日文布局实拍；未登录重定向 `/app/account/login?next=%2Fapp%2Fagent`，六次截图无 `pageerror`。 | 正式逐板像素门禁待跑。 |
| 03 历史读搜 | 本人分页、标题/8,000 字后正文命中和 actor 隔离有定向测试；Web/App 历史搜索、东京分组、App 离线副本标旧已接。 | 两端多页录屏与完整离线/跨端操作链待验。 |
| 04 历史操作 | 服务端事务最多 5 个置顶，第 6 个 HTTP 409 `PIN_LIMIT`；App 解码/提示；版本冲突仍 `CONFLICT`；服务端 5 秒 token 撤销。Web/App 改名、置顶、删除/撤销视图已接；App 左滑动作浏览器测试 1/1。两个同 actor 本机浏览器上下文：旧 revision 改名得 409 `CONFLICT`，另一端回读新标题；A 删除/B 5 秒内恢复、A 回读恢复，日志在 `manual/two-client-session-{cas,undo}.log`。 | 真正两个设备实操和 b4/b11 像素证据未完。 |
| 05 90 日 | 东京日 89/90/91、活动变更、置顶/解除、他人隔离、幂等测试通过。本机 `orbit_line_e_test` 执行两轮：首轮扫描 4/删除 `r21-day92`，次轮扫描 3/删除 0；之前 `r21-day91` 与消息软删，day89/day90/pinned/他人保持 active。生产调度未启用。 | 生产任务属于单独授权。 |
| 06 会话中 | Web/App 停止与继续、可靠请求重试和单击防重入已接，定向测试通过；Web 停止后迟到的完整响应不覆盖状态；建议卡直接发送，手工双击拦截见 1 个 POST；App 保留原联系人 @ picker 和来源/草稿卡。 | 真流式事件及其迟到事件、断线/双设备回执、事件 @、App 按住录音、无 key/额度耗尽新增付费调用 0 的完整链未验/未实现。 |
| 07 Web pageContext | 仅允许 `/app/contacts` 的行业筛选，服务端按 actor 重算 count 并校验；开关默认关、一次发送后复位。实抓关闭时 POST 无字段，开启时含 `route=/app/contacts`、行业筛选和 `count=3`，双击只 1 POST；捕获在 `manual/page-context-capture.json`。 | 其他列表筛选未列入 allowlist；跨页及恶意 URL 更多浏览器录屏、b4 #54 门禁未完。 |
| 08 只预填 | Web `?q`、全局搜索和 ⌘K 只预填；旧 pendingAsk 发原始 query，不把来源文字拼接为指令；App `prefillIntent` 沿原一次性消费。手工 Web 从联系人页进入直到用户提交前为 0 POST。匿名访问 `?q=提问` 得 307，经已登录 QA 进入后输入仍为「提问」且发送数 0；用户改为「提问（编辑）」后拦截到唯一 POST，原文正确、无 `pageContext`，日志 `manual/login-prefill-{chain,send-chain}.log`。 | App 全局入口完整 e2e/真实计费计数待验。 |
| 09 计划与草稿 | 两端读取本人 intake 和 v2 summary，overview/review/done/new typed href 已接；Web/App 通过会话与 draftId 打开本人 pending card，确认/失败可重试。Web 本机拦截演练可见草稿及确认回执，图 `manual/web-draft-1440.png`；App 草稿深链 9/9。 | D 线 R20a 判断待ち入口待接；contact_draft 与整条跨端链、b4 #47–50 未验。 |
| 10 删旧屏 | 真实 `/app/agent` 用新 Web 视图，App 两路由呈现新视图；原链接仍落路由。 | Web demo 仍用旧 `IOrbitShell`，`agent/actions` 仍用旧 actions，Web hooks/rich 组件和 App controller 仍被引用；旧专用文件与允许清单未归零。 |
| 11 搜索服务 | `searchConversations(actorId,q,limit)` 只读本人 iOrbit；Unicode highlights、预算、平台 href 重建、未知 kind 过滤有定向测试。 | B 线 inbox 本人会话读取与 Web 深链未交；四格 inbox 不能标完成。 |
| 12 R30 四 chip | live 接 iOrbit 会话候选，`types` 自动含 conversations；App/Web iOrbit href 与 demo href 修正。 | inbox 候选和 Web 选中态依 B；两端四条实际导航及 W-R30-P01/A-R30-P06 未验。 |
| 13 App 像素 | b4/b11 全板预检已记录于 `preflight-checklist.md`；`app-R21.json` 登记大数据起始、历史浅深和 b11 全屏头五个 smoke 视图，归因模板为空。 | App Simulator 原生录屏、真实 attribution、全部有效板覆盖尚无；A 缺正式 token 与左侧 FullDrawer 变体。 |
| 14 Web 像素 | 六张 1440/1024/390 浅深起始截图及 1024/390 本人历史 fixture 截图在 `manual/`，b4/b8/b11 预检已做；`web-R21.json` 增 b8 #11/12 历史状态。 | 逐板 compare/style-diff/attribution 正式门禁排队；A 缺正式 token，未标像素通过。 |

## 验证与门禁

- 定向：Web 会话/组织/搜索 50/50、App 解码 4/4、Web 搜索/置顶 27/27、PostgreSQL 摘要全文 1/1 与并发置顶 1/1、Web 停止/聊天 19/19、App 会话 22/22、Web 实体草稿和 retention 10/10、App 草稿 9/9、90 日服务 1/1。App 历史分页、App 全局搜索、Web 上下文等定向测试也通过；具体日志在证据目录。
- 本机 PostgreSQL 清理首轮非零、次轮 0；查询 `orbit_records` 显示被删会话与消息 `deleted`，其他本人/他人记录 `active`。不涉及生产配置。
- 本机 QA actor 通过 `POST /api/ai/conversations/sessions` 存四个演示会话，仅供 E 线像素和双端操作；没有 AI 提供方请求。1024/390 历史截图无 `pageerror`，且各出现四组日期分段。
- 旧首页断言已迁至新路由行为：`ink-signal-ai-home` 12/12（左滑后；另有大字号窄屏 1/1）、`ai-home-loading-terminal-states` 5/5、`ai-home-guidance-render` 10/10；App workspace 浏览器全文件复跑 47/47。
- 旧 Web iOrbit 用例已对齐 live `IOrbit2026` 和 demo `IOrbitShell` 两条路线、原文待发送问题及 DELETE 的 5 秒撤销回执；guide 页面 22/22、history 23/23、chat 17/17 分别复跑通过。原测试环境的 React SSR 警告仍见日志，不记作门禁通过。
- 全量 Web/App 测试、Web/App typecheck、Web 像素 compare、Web build/App iOS export、Web lint 已经通过 `heavy.sh e -- …` 入公平队列，尚无结果。队列被 A 线从 16:43 JST 开始的视觉作业占用，不能提前宣称通过。
- 预检 `b4`：near 26、missing 118、疑似功能 40；`b11`：missing 20、疑似功能 4；`b8`：near 2、missing 18、疑似功能 22。手机/浏览器装饰按规则排除。未在 E 样式中造近似 token。逐条见 `preflight-checklist.md`。

## 交接与待定

| 条目 | 本端版本 / 结果 | 另一端影响、未完事项及验证范围 | 来源 |
| --- | --- | --- | --- |
| R21-D18 | `894a5ca07` 本机 90 日任务两轮已验；生产未启用 | 授权后由运行环境负责人配置生产任务并验首跑/回滚。 | SC-05 |
| R21-R30 | `66d73c21f` 本人 iOrbit 搜索 + `searchLive` 跨端 href + live conversation chip | 重跑 W-R30-P01/A-R30-P06；Web/App 各打开 iOrbit/inbox 所选会话。当前只验 iOrbit 服务与映射。 | SC-11/12 |
| R21-B | E 侧 Web href 约定 `/app/inbox?conversationId=<id>`、App `/inbox/<id>` | B 线交 inbox 本人只读会话服务、Web 选中态与权限测试，再接真实候选。 | SC-11/12 |
| R21-A | E 页沿 R31a/b kit 编排，预检清单列正式 token 缺口 | A 线定稿缺失 token、左侧 FullDrawer 变体；交后重跑像素门禁。 | SC-01/13/14 |
| R21-D | E 侧会话草稿深链 `draftId` 已接 | D 线从 R20a `entity_draft` 判断待ち接入会话；`contact_draft` 保持联系人落点，跨端验一次。 | SC-09 |

待主会话决定：b4 与新 kit 的未定 token/间距冲突、Web demo 壳与旧 actions 的迁移范围、无录音依赖的 App 语音交互实现方案，以及 SC-06 真流式/跨设备回执验收所需的实际环境。生产调度、Neon/生产迁移、部署、TestFlight 和合回 `chat-agent` 均待用户另行授权。本轮未执行。

SC-06 的实现基线与验收文字有冲突：当前 Gemini provider 在 `features/orbit-ai/gemini-provider.ts` 使用 `stream: false`，Web/App 收到的是最终响应；App 依赖表里没有录音包。因此现有 stop/重试只能验证完整响应的中止与迟到抑制，不能当作流式事件或按住录音已经实现。需要主会话确定流式响应契约和原生录音方案后再扩展这一链。
