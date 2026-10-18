# R21 iOrbit · E 线执行报告

状态：E 线已完成可独立交付的 R21 范围并停止在跨线／门禁阻塞项：SC-11/12 依赖 B 的 inbox 服务与 Web 选中深链，SC-13/14 依赖 A 的左侧抽屉/正式 token 和可用的原生截图链。Web/App 全量与正式像素门禁均未通过，详见下文。证据目录：`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-e/R21/run-01/`、`run-02/`。本报告只覆盖 E 线当前提交，未推送、未合并、未连接 Neon/生产、未部署。付费 AI 真调用：**0 次**。

## 基线与提交

- 开工及 RD-33 续工前均在 `line-e` 执行 `git pull --rebase origin redesign`；续工时基底 `324218dda`。仅修改 E 工作树；未改 A/D 组件、壳或 Bridge 台账。
- 实现提交从 `3fdb9f996` 到 `b35984cfe`（本报告提交另计），覆盖本人会话全文搜索、PIN_LIMIT、软删撤销、90 日边界、pageContext、R30 iOrbit 搜索，Web/App 起始与历史视图、停止与继续、计划与草稿深链、读取失败重试、旧 App 呈现清理、像素 smoke 清单及路由回归。完整列表以 `git log --oneline --reverse origin/redesign..HEAD` 为准；rebase 后旧 hash 已失效。各提交均含 `Co-Authored-By: Codex <noreply@openai.com>`；仅本地提交。
- RD-33 明确：真流式与跨设备回执推迟到下个 Sprint；本 Sprint 验完整响应的停止、迟到抑制、重试与配额耗尽。App 语音入口隐藏，待录音依赖。kit/01-system 优先于 b4；本报告列偏差。Web demo 保留旧实现，`/app/agent/actions?entry=` 保留旧链接，只迁 R21 画板入口。

用户明确禁止运行 GitNexus，因此未做项目 AGENTS 要求的 graph impact / detect-changes。改动范围以源码调用点、定向测试和下述回归核查；不能把未做的图分析写成低风险证明。

## SC 对照

| SC | 当前结果与证据 | 未完成项 |
| --- | --- | --- |
| 01 App 全屏 | `/ai` 用 `AppScreen inset="kit"` 和新起始页，≡/✕、单行输入、左缘手势、历史入口已接；浏览器窄屏 320px、字体放大 1.8 倍下标题与输入不越界 1/1；路由仍保留原会话 controller。签名 iPhone 16e Simulator 登录后，AX 实测起始页、历史抽屉、本人存储会话导航；历史首读超时后「Retry」恢复。 | 原生浅深截图/逐板像素和返回焦点链尚未验；A 的 FullDrawer 只从右侧进入。 |
| 02 Web 起始 | 登录后 1440/1024/390 浅深、日文布局实拍；有本人历史的宽屏现在默认展开左栏，1440 本机 QA 截图 `run-02/web-start-auto-history-1440.png`；未登录重定向 `/app/account/login?next=%2Fapp%2Fagent`。 | 修正默认左栏后的正式逐板像素复跑待结果；截图含 dev server 渲染提示，不作门禁图。 |
| 03 历史读搜 | 本人分页、标题/8,000 字后正文命中和 actor 隔离有定向测试；Web/App 历史搜索、东京分组、App 离线副本标旧已接。 | 两端多页录屏与完整离线/跨端操作链待验。 |
| 04 历史操作 | 服务端事务最多 5 个置顶，第 6 个 HTTP 409 `PIN_LIMIT`；App 解码/提示；版本冲突仍 `CONFLICT`；服务端 5 秒 token 撤销。Web/App 改名、置顶、删除/撤销视图已接；两端页内撤销控件按服务端 `undoUntil` 失效，不从收到回执时另起 5 秒；App 延迟回执浏览器测试先红后绿 1/1、首页整文件 14/14，Web 延迟回执定向 1/1、旧 demo 历史整文件 24/24。两个同 actor 本机浏览器上下文：旧 revision 改名得 409 `CONFLICT`，另一端回读新标题；A 删除/B 5 秒内恢复、A 回读恢复，日志在 `manual/two-client-session-{cas,undo}.log`。 | 真正两个设备实操和 b4/b11 像素证据未完；App kit Toast 的 undo 按固定 5 秒自收到回执展示，迟到回执时可能晚于服务端期限，点击仍由服务端拒绝；A 需提供截至绝对时间的 Toast 能力。 |
| 05 90 日 | 东京日 89/90/91、活动变更、置顶/解除、他人隔离、幂等测试通过。本机 `orbit_line_e_test` 执行两轮：首轮扫描 4/删除 `r21-day92`，次轮扫描 3/删除 0；之前 `r21-day91` 与消息软删，day89/day90/pinned/他人保持 active。生产调度未启用。 | 生产任务属于单独授权。 |
| 06 会话中 | Web/App 停止与继续、可靠请求重试和单击防重入已接；Web 停止后迟到的完整响应不覆盖状态；建议卡直接发送，手工双击拦截见 1 个 POST；App 保留联系人 @ picker 和来源/草稿卡。定向测试以假的 HTTP 429 模型响应模拟额度耗尽：同一 request ID 重放，两次发送仅一次 provider HTTP 尝试（`run-02/targeted-quota-provider-429.log`）。两端新视图没有语音入口。 | 真流式与跨设备回执依 RD-33 推迟；实际配额服务耗尽链和 App 原生录屏仍待验。 |
| 07 Web pageContext | 仅允许 `/app/contacts` 的行业筛选，服务端按 actor 重算 count 并校验；开关默认关、一次发送后复位。实抓关闭时 POST 无字段，开启时含 `route=/app/contacts`、行业筛选和 `count=3`，双击只 1 POST；捕获在 `manual/page-context-capture.json`。 | 其他列表筛选未列入 allowlist；跨页及恶意 URL 更多浏览器录屏、b4 #54 门禁未完。 |
| 08 只预填 | Web `?q`、全局搜索和 ⌘K 只预填；旧 pendingAsk 发原始 query，不把来源文字拼接为指令；App `prefillIntent` 沿原一次性消费。手工 Web 从联系人页进入直到用户提交前为 0 POST。匿名访问 `?q=提问` 得 307，经已登录 QA 进入后输入仍为「提问」且发送数 0；用户改为「提问（编辑）」后拦截到唯一 POST，原文正确、无 `pageContext`，日志 `manual/login-prefill-{chain,send-chain}.log`。 | App 全局入口完整 e2e/真实计费计数待验。 |
| 09 计划与草稿 | 两端读取本人 intake 和 v2 summary，overview/review/done/new typed href 已接；Web/App 通过会话与 draftId 打开本人 pending card，确认/失败可重试。Web 本机拦截演练可见草稿及确认回执，图 `manual/web-draft-1440.png`；App 草稿深链 9/9。 | D 线 R20a 判断待ち入口待接；contact_draft 与整条跨端链、b4 #47–50 未验。 |
| 10 删旧屏 | 真实 `/app/agent` 用新 Web 视图，App 两路由呈现新视图；旧 demo 仍落 `IOrbitShell`，旧 `/app/agent/actions?entry=` 经路由定向测试 10/10 仍解析选中 entry。App `AiScreen.tsx` 中不再可达的旧呈现区块删去 1,311 行；其 Ionicons 与旧 UI allowlist 两行随实际用量降为零，定向 ratchet/起始页 21/21。按 RD-33 保留两条 Web 旧路径与仍被使用的 hooks/controller。 | 真实 fixture 的 actions 选中态尚未浏览器验；App 控制器仍沿用 `AiScreen` 文件名，会话视图仍沿用 `AiConversationScreen`；Web demo 专用旧文件仍被引用，不按原 SC-10 全文件删除标准声称完成。 |
| 11 搜索服务 | `searchConversations(actorId,q,limit)` 只读本人 iOrbit；Unicode highlights、预算、平台 href 重建、未知 kind 过滤有定向测试。 | B 线 inbox 本人会话读取与 Web 深链未交；四格 inbox 不能标完成。 |
| 12 R30 四 chip | live 接 iOrbit 会话候选，`types` 自动含 conversations；App/Web iOrbit href 与 demo href 修正。 | inbox 候选和 Web 选中态依 B；两端四条实际导航及 W-R30-P01/A-R30-P06 未验。 |
| 13 App 像素 | b4/b11 全板预检已记录于 `preflight-checklist.md`；`app-R21.json` 登记大数据起始、历史浅深和 b11 全屏头五个 smoke 视图。RD-33 以 kit/01-system 为规格，b4 缺精确 token 的差异单列归因。签名 iPhone 16e Simulator 以日文实测起始、历史搜索和本人会话；历史搜索实拍 `run-02/app-symlink-shot.png` 可目视核对右侧 kit Drawer。 | 五视图原生逐板像素门禁与浅深截图未过：`idb screenshot` 返回 `No Image available to encode`，`simctl io screenshot` 直写 ORICO 返回 NSCocoa 513。不得将一张搜索态实拍冒充正式门禁；A 左侧 FullDrawer 变体尚未交。 |
| 14 Web 像素 | 六张 1440/1024/390 浅深起始截图及 1024/390 本人历史 fixture 截图在 `manual/`，b4/b8/b11 预检已做；`web-R21.json` 增 b8 #11/12 历史状态。第二轮 compare/style-diff 为 6/6 未过（`run-02/web-{pixel,style-diff}-r2/`）；1024 历史图从固定侧栏改成 kit Drawer 后单图 r3 仍未过，原始差异率反而由 0.5478 增至 0.7384（`run-02/web-{pixel,style-diff}-r3-tablet/`）。RD-33 以 kit/01-system 为规格。 | 设计左侧抽屉与当前 kit 右侧 Drawer 的方向差异占大面积；实际数据与画板样本也不同，未标像素通过。A 交左侧变体后重验。 |

## 验证与门禁

- 定向：Web 会话/组织/搜索 50/50、App 解码 4/4、Web 搜索/置顶 27/27、PostgreSQL 摘要全文 1/1 与并发置顶 1/1、Web 停止/聊天 19/19、App 会话 22/22、Web 实体草稿和 retention 10/10、App 草稿 9/9、90 日服务 1/1。App 历史分页、App 全局搜索、Web 上下文等定向测试也通过；具体日志在证据目录。
- 本机 PostgreSQL 清理首轮非零、次轮 0；查询 `orbit_records` 显示被删会话与消息 `deleted`，其他本人/他人记录 `active`。不涉及生产配置。
- 本机 QA actor 通过 `POST /api/ai/conversations/sessions` 存四个演示会话，仅供 E 线像素和双端操作；没有 AI 提供方请求。1024/390 历史截图无 `pageerror`，且各出现四组日期分段。
- 旧首页断言已迁至新路由行为：`ink-signal-ai-home` 12/12（左滑后；另有大字号窄屏 1/1）、`ai-home-loading-terminal-states` 5/5、`ai-home-guidance-render` 10/10；App workspace 浏览器全文件复跑 47/47。
- App 旧呈现代码删后，起始页、Ionicons 与旧 UI allowlist 定向复跑 21/21（`run-02/targeted-app-legacy-cleanup.log`），App typecheck 通过。按测试预加载固定的中文 locale 修正了六条旧日文断言，受影响两文件 15/15（`run-02/targeted-app-home-locale-r2.log`）；App 全量仍以最终日志为准。
- 旧 Web iOrbit 用例已对齐 live `IOrbit2026` 和 demo `IOrbitShell` 两条路线、原文待发送问题及 DELETE 的 5 秒撤销回执；guide 页面 22/22、history 23/23、chat 17/17 分别复跑通过。原测试环境的 React SSR 警告仍见日志，不记作门禁通过。
- RD-33 续工重新入 `heavy.sh e -- …` 公平队列。Web/App 最新 typecheck、Web lint、Web 生产 build、App iOS export 通过；Web build 首轮被内存事务 runner 的回调类型挡住，修复后 r2 exit 0（`run-02/web-build-r2.log`）。App 离线 API 读取面审计 21/21、硬编码文案审计 5/5、起始/历史浏览器 19/19、会话浏览器 106/106。Web 全量 r3：7,552 项中通过 6,556、失败 6、跳过 990；与 r2 相同的 6 项均在 E 未改的 manifest P0 候选、联系信息合并、add-scan 夹具/浏览器、旧全站按钮 ratchet，细目见 `run-02/web-full-tests-r3.log`。新增 R21 用例已过；全量门禁仍失败。App 全量 r4：3,122 项中通过 3,089、失败 31、跳过 2，仍以 exit 1 记门禁失败。R21 起始、历史、单次发送、迟到 DELETE 撤销和 `PIN_LIMIT` 用例通过；先前 R21 字典路径造成的硬编码审计失败已修，定向 45/45。余下失败在加联系人、任务、inbox 和较早字典快照；任务用例中的 iOrbit 断言在进入 iOrbit 前就找不到任务页按钮，不作为 iOrbit 通过或失败证据。`run-02/app-full-tests-r4.log` 保留细目。App 原生 `xcodebuild` r2 和带 Xcode 本地签名的增量 build 均 exit 0（`run-02/app-xcodebuild-{r2,signed}.log`）。签名包在独立 iPhone 16e Simulator 登录 QA actor 后显示 iOrbit 起始、历史和存储会话；AX 实测首读超时可重试，未发 AI 提供方请求。原生截图与像素门禁待验。
- 对 Web r2 的六个失败源文件与测试执行 `git diff origin/redesign..HEAD -- <path>` 为零；E 未改这些源/测试，不在 E 文件边界里直接修。全站按钮 ratchet 的超额列表没有新 `iorbit-2026` 组件。此定位不把全量测试称为通过。
- Web 全站 `copy:qa` 在 6,492 条文案中仍报 218 项，均非新 `web.iorbit` 域；新 iOrbit 域单独扫描 85 条 / 0 问题（`run-02/web-copy-qa-r3.log` 与定向命令），未把全站 gate 记为通过。App iOS export、`expo prebuild --platform ios --no-install` 与 `pod install` 通过。首个 `xcodebuild` 命令把含空格的 `platform=iOS Simulator` 未加引号，Xcode 将 destination 解析为 `{platform:iOS}` 并以 70 退出，**尚未编译源码**；引号修正后的 r2 原生编译成功。Web 像素 r2 六图的原始差异率依次为 0.0577、0.0432、0.1646、0.5478、0.2784、0.1525；样式配对依次 35/138、6/74、2/58、14/124、10/104、2/58，均未达到门禁。1024 历史抽屉改 breakpoint 后单图 r3 原始差异率 0.7384、30/30 超带、style-diff 14/124 配对及 74 项差异，明确未过。
- 预检 `b4`：near 26、missing 118、疑似功能 40；`b11`：missing 20、疑似功能 4；`b8`：near 2、missing 18、疑似功能 22。手机/浏览器装饰按规则排除。未在 E 样式中造近似 token。逐条见 `preflight-checklist.md`。
- 原生截图存储限制：一次 `simctl` 临时路径实验将 PNG 短暂写到内置盘 `/tmp/orbit-line-e-r21-shot.png`，随即移至 ORICO 证据目录 `run-02/app-symlink-shot.png`，内置盘临时文件已不存在。这一步不符合本 Sprint 截图只放 ORICO 的约束；此后停止该路径，安全的直接 ORICO 尝试均失败，故未复跑原生像素门禁。历史搜索与存储会话的 AX 记录位于 `run-02/app-native-{history-search,conversation}-ax.txt`。

## 交接与待定

| 条目 | 本端版本 / 结果 | 另一端影响、未完事项及验证范围 | 来源 |
| --- | --- | --- | --- |
| R21-D18 | `1a6fe6f51` 本机 90 日任务两轮已验；生产未启用 | 授权后由运行环境负责人配置生产任务并验首跑/回滚。 | SC-05 |
| R21-R30 | `3fdb9f996` 本人 iOrbit 搜索 + `searchLive` 跨端 href + live conversation chip | 重跑 W-R30-P01/A-R30-P06；Web/App 各打开 iOrbit/inbox 所选会话。当前只验 iOrbit 服务与映射。 | SC-11/12 |
| R21-B | E 侧 Web href 约定 `/app/inbox?conversationId=<id>`、App `/inbox/<id>` | B 线交 inbox 本人只读会话服务、Web 选中态与权限测试，再接真实候选。 | SC-11/12 |
| R21-A | E 页沿 R31a/b kit 编排，RD-33 指定 kit/01-system 优先；预检清单列 b4 token 差异 | A 线后续定稿缺失 token、左侧 FullDrawer 变体；Toast 的 undo 需要按服务端绝对 `undoUntil` 消失，当前 kit 固定从展示起 5 秒。若交付再重跑对应像素/交互门禁。 | SC-01/04/13/14 |
| R21-D | E 侧会话草稿深链 `draftId` 已接 | D 线从 R20a `entity_draft` 判断待ち接入会话；`contact_draft` 保持联系人落点，跨端验一次。 | SC-09 |

RD-33 已决定：kit/01-system 优先，Web demo 和旧 actions 本 Sprint 保留，真流式、跨设备回执和 App 语音延到下个 Sprint。剩余跨线交付为 A 正式 token/左侧 FullDrawer、B inbox 服务及 Web 选中深链、D R20a 草稿入口。生产调度、Neon/生产迁移、部署、TestFlight 和合回 `chat-agent` 均待用户另行授权，本轮未执行。

## 自定决定与待主会话决定

- E 线把 pageContext 范围收紧为本人联系人列表的行业筛选；其他页面未有可验证的筛选摘要契约，按服务端拒绝处理。历史抽屉在 Web 1200px 以下改用 R31 kit Drawer，宽屏保持本人历史侧栏；kit 目前从右侧进入，与 b4/b8 左侧抽屉板不同。
- 待主会话协调 A 的左侧 FullDrawer、绝对截止时间 Toast 和正式 token，B 的 inbox 本人会话读取/Web 选中深链，D 的 `entity_draft` 入口；这些交付到位后重验对应 SC-04/09/11/12/13/14。生产任务与发布动作需另行授权。未收到上述交付前，不将相关 SC 记为完成。

SC-06 当前 Gemini provider 在 `features/orbit-ai/gemini-provider.ts` 使用 `stream: false`，Web/App 收到最终响应；App 尚无录音依赖。完整响应的停止和迟到抑制证据不能代替流式事件或按住录音。E 线 Next dev server（3700）与 Metro（8086）已停止，两端口无监听；`Orbit Line E` 模拟器已关机。未触碰 3000 端口。
