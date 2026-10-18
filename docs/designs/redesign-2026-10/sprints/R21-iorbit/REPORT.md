# R21 iOrbit · E 线执行报告

状态：E 线已实现 R21 的本端主链，但 Web/App 全量与像素门禁仍未全部通过；SC-11/12 依赖 B 的 inbox 服务与 Web 选中深链，SC-13/14 的左侧抽屉/正式 token 依赖 A。原生截图链已恢复，逐图差异和余项如下。证据目录：`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-e/R21/run-01/`、`run-02/`、`run-03/`、`run-04/`、`run-05/`。本报告只覆盖 E 线当前提交，未推送、未合并、未连接 Neon/生产、未部署。付费 AI 真调用：**0 次**。

## 基线与提交

- 开工、RD-33 续工及本轮继续前均在 `line-e` 执行 `git pull --rebase origin redesign`；前轮基底 `6ea769085`，本轮重放基底 `d8e6dafb7`。仅修改 E 工作树；未改 A/D 组件、壳或 Bridge 台账。
- 实现提交从 `e9653180e` 到 `ad2930839`（其后有报告提交），覆盖本人会话全文搜索、PIN_LIMIT、软删撤销、90 日边界、pageContext、R30 iOrbit 搜索，Web/App 起始与历史视图、App 离线历史编辑同步、停止与继续、计划与草稿深链、读取失败重试、旧 App 呈现清理、像素 smoke 清单及路由回归。完整列表以 `git log --oneline --reverse d8e6dafb7..HEAD` 为准；rebase 后旧 hash 已失效。各提交均含 `Co-Authored-By: Codex <noreply@openai.com>`；仅本地提交。
- RD-33 明确：真流式与跨设备回执推迟到下个 Sprint；本 Sprint 验完整响应的停止、迟到抑制、重试与配额耗尽。App 语音入口隐藏，待录音依赖。kit/01-system 优先于 b4；本报告列偏差。Web demo 保留旧实现，`/app/agent/actions?entry=` 保留旧链接，只迁 R21 画板入口。

用户明确禁止运行 GitNexus，因此未做项目 AGENTS 要求的 graph impact / detect-changes。改动范围以源码调用点、定向测试和下述回归核查；不能把未做的图分析写成低风险证明。

## 2026-10-19 上游 rebase 复核

- 按主会话要求在干净的 `line-e` 执行 `git pull --rebase origin redesign`，将 50 个本线提交重放到 `d8e6dafb7`。冲突只有两处：Web canonical actor 测试同时保留上游个人日程 stub、本线 live `IOrbit2026` 与 demo `IOrbitShell` stub（重放提交 `0169d93dd`）；App `sync-coordinator.ts` 同时保留 D 线 `isOfflineRelationshipFollowupMutation` 与 E 线 AI 会话 outbox 解析/操作（重放提交 `e987931d1`）。没有跳过提交；冲突文件无残留标记。
- 定向回归：App 离线会话与 task/follow-up outbox 23/23，coordinator lease 20/20；Web canonical actor 与 agent 路由 40/40，均 exit 0。日志在 `run-04/app-rebase-focused.log`、`app-sync-coordinator-lease.log`、`web-rebase-focused.log`。
- 重放后的 App `npm run typecheck`、Web `npm run typecheck:app` 均 exit 0，经 `heavy.sh e` 运行；日志在 `run-04/app-typecheck.log` 和 `web-typecheck.log`。该轮按主会话范围只做冲突交汇点与两端类型检查；`run-03/` 的全量测试和 Web 六图/App 五图像素结论是 rebase 前证据，**未作为新基底的门禁通过结果**。像素收口另排一轮，该轮未启动服务、Metro 或模拟器。

## 2026-10-19 REVIEW 修复与同基底复核

- 在干净的 `line-e` 上 `git pull --rebase origin redesign`，快进到 `382265a47` 后阅读 `REVIEW.md`。本轮只修 REVIEW 的四项代码问题，按路径分别提交：`5891fde62` 修离线 PATCH ACK 顶层字段污染和历史消失；`b582ec11b` 修在线全文搜索失败时的静默本地回退，增加错误与重试，明确离线才展示标旧镜像；`7e283c30e` 修 App 会话列表响应宽进与逐项跳过坏记录，`2a6a99226` 保持契约副本同步，并让服务端写出继续逐项校验；`27925a50f` 让两端 DELETE 带组织 `expectedRevision`，PostgreSQL 在事务内持有 actor 组织锁后核对版本，陈旧删除回 409 `CONFLICT`，App 保留历史并提示。请求体仍严格校验。五个提交均含规定的 Co-Authored-By trailer，未推送。
- 先红后绿的定向证据在 `run-05/`：ACK → 镜像读取 11/11；在线搜索浏览器整文件 10/10；响应 schema 6/6，契约同步 6/6、快照检查 exit 0；DELETE 的 App API/outbox 10/10、App 起始页整文件 15/15、Web 路由 8/8、Web 历史 15/15，隔离 PostgreSQL 组织 CAS 1/1、消息分页删除 1/1。定向 PostgreSQL 明确使用本机 `orbit_line_e_test`，未连 Neon/生产。
- 两端同基底全量均经 `heavy.sh e` 执行。以下「新失败」按测试名称比较 `run-05/{app,web}-{baseline,final}-full.log`，对照文件为 `run-05/{app,web}-failure-comparison.json`；新增测试改变总数，不以总失败数单独推断回归。

| 端 | 干净基线 `382265a47` | 修复后 `27925a50f` | 新失败名称 | 门禁 |
| --- | --- | --- | --- | --- |
| App | 3,155 项：通过 3,140、失败 13、取消 0、跳过 2，exit 1 | 3,160 项：通过 3,146、失败 12、取消 0、跳过 2，exit 1 | 0；基线任务界面超时本次通过 | **未过**，仍有 12 项既有失败 |
| Web | 7,662 项：通过 6,637、失败 16、取消 3、跳过 1,006，exit 1 | 7,662 项：通过 6,640、失败 16、取消 0、跳过 1,006，exit 1 | 0；基线 3 项 PostgreSQL 超时/取消本次通过 | **未过**，仍有 16 项既有失败 |

- 当前提交的 App `npm run typecheck` 与 Web `npm run typecheck:app` 均 exit 0，日志 `run-05/app-final-typecheck.log`、`web-final-typecheck.log`。本轮未重新运行 Web 六图/App 五图像素、生产构建或原生编译；SC-13/14 的 `run-03/` 未过结果仍有效，不能写成当前基底的通过证据。未启动服务、Metro 或模拟器。

## SC 对照

| SC | 当前结果与证据 | 未完成项 |
| --- | --- | --- |
| 01 App 全屏 | `/ai` 用 `AppScreen inset="kit"` 和新起始页，≡/✕、单行输入、左缘手势、历史入口已接；浏览器窄屏 320px、字体放大 1.8 倍下标题与输入不越界 1/1；路由仍保留原会话 controller。签名 iPhone 16e Simulator 登录后，AX 实测起始页、历史抽屉、本人存储会话导航；历史首读超时后「Retry」恢复。原生浅深截图已由比较脚本捕获并逐板对照。 | 像素门禁尚未通过、返回焦点链尚未验；A 的 FullDrawer 只从右侧进入。 |
| 02 Web 起始 | 登录后 1440/1024/390 浅深、日文布局实拍；有本人历史的宽屏默认展开左栏，未登录重定向 `/app/account/login?next=%2Fapp%2Fagent`。六视图正式像素对比在 `run-03/web-pixel-final/`，均为有效截图；起始 W-R21-03 raw 0.0599、20 带超阈。 | 起始页正式像素门禁未过；目前 QA actor 内容及字形/几何与画板混合不符，逐带见下表。 |
| 03 历史读搜 | 本人分页、标题/8,000 字后正文命中和 actor 隔离有定向测试；Web/App 历史搜索、东京分组、App 离线副本标旧已接。App 在线全文搜索失败现在显示错误与重试，不再展示摘要镜像的伪完整命中；会话列表响应丢弃未来字段和单条坏记录。App 离线改名/置顶会覆盖本地镜像，删除会隐藏待上传会话；重连 ACK 仅更新 `organization`，历史仍可读。真实 SQLite + coordinator 的 actor 隔离、重连上传、冲突/丢弃有定向测试；App 冻结请求 → 实际 Web handler → 本人列表回读的置顶/改名/删除内存集成测试 3/3。 | 两台真实设备的离线/跨设备操作链及多页录屏仍待验；测试替身不冒充真机。 |
| 04 历史操作 | 服务端事务最多 5 个置顶，第 6 个 HTTP 409 `PIN_LIMIT`；App 解码/提示；版本冲突仍 `CONFLICT`；服务端 5 秒 token 撤销。Web/App 改名、置顶、删除/撤销视图已接；两端页内撤销控件按服务端 `undoUntil` 失效。App 离线删除进 outbox，创建后延迟 5 秒上传；此期间本机可撤销未上传请求。现在 DELETE 带组织版本前提，陈旧版回 409，App 保留镜像行并提示；PostgreSQL 事务核对与 App/Web 路由有定向测试。两个同 actor 本机浏览器上下文：旧 revision 改名得 409 `CONFLICT`，另一端回读新标题；A 删除/B 5 秒内恢复、A 回读恢复，日志在 `manual/two-client-session-{cas,undo}.log`。 | 真正两个设备实操和 b4/b11 像素证据未完；App kit Toast 的在线撤销按固定 5 秒自收到回执展示，迟到回执时可能晚于服务端期限，点击仍由服务端拒绝；A 需提供截至绝对时间的 Toast 能力。 |
| 05 90 日 | 东京日 89/90/91、活动变更、置顶/解除、他人隔离、幂等测试通过。本机 `orbit_line_e_test` 执行两轮：首轮扫描 4/删除 `r21-day92`，次轮扫描 3/删除 0；之前 `r21-day91` 与消息软删，day89/day90/pinned/他人保持 active。生产调度未启用。 | 生产任务属于单独授权。 |
| 06 会话中 | Web/App 停止与继续、可靠请求重试和单击防重入已接；Web 停止后迟到的完整响应不覆盖状态；建议卡直接发送，手工双击拦截见 1 个 POST；App 保留联系人 @ picker 和来源/草稿卡。定向测试以假的 HTTP 429 模型响应模拟额度耗尽：同一 request ID 重放，两次发送仅一次 provider HTTP 尝试（`run-02/targeted-quota-provider-429.log`）。两端新视图没有语音入口。 | 真流式与跨设备回执依 RD-33 推迟；实际配额服务耗尽链和 App 原生录屏仍待验。 |
| 07 Web pageContext | 仅允许 `/app/contacts` 的行业筛选，服务端按 actor 重算 count 并校验；开关默认关、一次发送后复位。实抓关闭时 POST 无字段，开启时含 `route=/app/contacts`、行业筛选和 `count=3`，双击只 1 POST；捕获在 `manual/page-context-capture.json`。延迟结果数请求在新建会话后返回的竞态已修：单元测试先红后绿 4/4；生产构建浏览器演练延迟摘要、新建会话后截获发送，证实不含 `pageContext`（`run-03/context-race-probe.log`，无 AI 调用）。 | 其他列表筛选未列入 allowlist；b4 #54 像素门禁未完。 |
| 08 只预填 | Web `?q`、全局搜索和 ⌘K 只预填；旧 pendingAsk 发原始 query，不把来源文字拼接为指令；App `prefillIntent` 沿原一次性消费。手工 Web 从联系人页进入直到用户提交前为 0 POST。匿名访问 `?q=提问` 得 307，经已登录 QA 进入后输入仍为「提问」且发送数 0；用户改为「提问（编辑）」后拦截到唯一 POST，原文正确、无 `pageContext`，日志 `manual/login-prefill-{chain,send-chain}.log`。App 全局搜索测试验证跳转 token，目的页定向测试验证预填、用户编辑与双击后仅一次带来源的 POST（`run-03/app-global-search-prefill-e2e.log`）。 | App 真机跨屏录屏和真实付费调用计数未验；本轮付费调用为零。 |
| 09 计划与草稿 | 两端读取本人 intake 和 v2 summary，overview/review/done/new typed href 已接；Web/App 通过会话与 draftId 打开本人 pending card，确认/失败可重试。Web 本机拦截演练可见草稿及确认回执，图 `manual/web-draft-1440.png`；App 草稿深链 9/9。 | D 线 R20a 判断待ち入口待接；contact_draft 与整条跨端链、b4 #47–50 未验。 |
| 10 删旧屏 | 真实 `/app/agent` 用新 Web 视图，App 两路由呈现新视图；旧 demo 仍落 `IOrbitShell`，旧 `/app/agent/actions?entry=` 经路由定向测试 10/10 仍解析选中 entry。App `AiScreen.tsx` 中不再可达的旧呈现区块删去 1,311 行；其 Ionicons 与旧 UI allowlist 两行随实际用量降为零，定向 ratchet/起始页 21/21。按 RD-33 保留两条 Web 旧路径与仍被使用的 hooks/controller。 | 真实 fixture 的 actions 选中态尚未浏览器验；App 控制器仍沿用 `AiScreen` 文件名，会话视图仍沿用 `AiConversationScreen`；Web demo 专用旧文件仍被引用，不按原 SC-10 全文件删除标准声称完成。 |
| 11 搜索服务 | `searchConversations(actorId,q,limit)` 只读本人 iOrbit；Unicode highlights、预算、平台 href 重建、未知 kind 过滤有定向测试。 | B 线 inbox 本人会话读取与 Web 深链未交；四格 inbox 不能标完成。 |
| 12 R30 四 chip | live 接 iOrbit 会话候选，`types` 自动含 conversations；App/Web iOrbit href 与 demo href 修正。 | inbox 候选和 Web 选中态依 B；两端四条实际导航及 W-R30-P01/A-R30-P06 未验。 |
| 13 App 像素 | b4/b11 全板预检已记录于 `preflight-checklist.md`；`app-R21.json` 登记大数据起始、历史浅深和 b11 全屏头五个 smoke 视图。RD-33 以 kit/01-system 为规格，b4 缺精确 token 的差异单列归因。签名 iPhone 16e Simulator 以日文实测起始、历史搜索和本人会话。`compare-redesign-app.mjs` 内建截图链以用户缓存为临时位置、将最终 PNG 放 ORICO；当前完整五视图 `run-03/app-pixel-final-current/` 均为有效截图、均失败，raw 依次 0.0888、0.4237、0.0895、0.1408、0.1001，未归因带 19、28、19、21、17。起始 2×2 建议和有联系人副标题后，浅/深起始较旧稳定图 0.1045/0.1098 更接近。 | 左侧 FullDrawer 变体尚未交。板上人名/事件与 QA actor 不同，b11 #41 还是不同数据量的起始态；不能用真实数据差异遮盖结构误差。其余拟登记板尚无受控原生状态，不能称 SC-13 全量通过。 |
| 14 Web 像素 | 六张 1440/1024/390 的 b4/b8 有板状态与 style-diff 由 `web-R21.json` 完整复跑，`run-03/web-pixel-final/` 六图均有效、六图均失败；raw 依次 0.0599、0.0462、0.1919、0.7382、0.2787、0.1344，未归因超阈带依次 20、15、25、30、29、25。W-R21-03 的桌面建议卡和能力卡已改为板式，composer 改为底部布局；手机会话 composer 留在屏内。预检和更早轮次证据仍在 `preflight-checklist.md` 与 `run-02/`。 | 设计左侧抽屉与当前 kit 右侧 Drawer 的方向差异占大面积；会话测试 fixture 只有纯文字，板上的实体卡/计划提示缺席；实际数据与画板样本也不同。所有不合法的数据遮盖均保留未过，A 交左侧变体后重验。 |

## 验证与门禁

### Web 逐带复核（`run-03/web-pixel-final/`）

以下编号来自每图 `summary.json` 的 `overList`，每个超阈带均列出。`[data]` 仅可解释文字数据，不可掩盖卡片、位置、顺序或抽屉方向；这些带均混有结构/几何差，故按 RD-29 保持「未归因 / FAIL」。§52 的组件例外只适用于指定的组件格，不能转借给 iOrbit 整页。`attribution-redesign-R21.json` 因而没有伪造放行条目。

| 视图 | 逐带编号与实见差异 | raw / 未归因带 / 缺块 | style-diff 配对 |
| --- | --- | --- | --- |
| W-R21-03 1440 浅 | #4–21：起始标题、建议卡、能力卡和本人历史栏的字形与几何仍混合不符；#28、#30：composer/页脚文字与位置仍不符。 | 0.0599 / 20 / 39 | 47/138 |
| W-R21-R01 1024 浅 | #3–7：会话头和两条 QA 文字与板不同；#9–12、#14–16：板上实体卡、计划提示和 follow-up chip 在纯文字 fixture 中缺席；#25–27：composer/页脚差。 | 0.0462 / 15 / 30 | 6/74 |
| W-R21-R02 390 浅 | #0–11：手机头、消息和卡片区混合差；#13–24、#26：缺少板上实体卡/计划提示，且 composer/页脚几何不同。 | 0.1919 / 25 / 16 | 2/58 |
| W-R21-R03 1024 浅 | #0–29：设计左侧窄抽屉与 kit 右侧抽屉方向/宽度形成整页结构差；其内还有 QA 内容差。 | 0.7382 / 30 / 34 | 10/124 |
| W-R21-R04 390 浅 | #0–28：设计左侧露出原页的抽屉与 kit 右侧全屏抽屉不同；其内还有 QA 内容差。 | 0.2787 / 29 / 18 | 6/104 |
| W-R21-R05 390 深 | #0–11、#13–24、#26：同 R02 的内容/结构与 composer 差，深色板仍未过。 | 0.1344 / 25 / 16 | 2/58 |

### App 逐带复核（`run-03/app-pixel-final-current/`）

五张图均由签名 iPhone 16e Simulator 真实截图；临时截图在用户缓存，最终 `simulator-raw.png`、`triptych.png` 和 `summary.json` 位于 ORICO。以下列尽全部超阈编号；每个区段都混有字形、尺寸、位置或卡片/抽屉结构差，不能仅以 QA 文字与画板样本不同记 `[data]`。因此 App attribution 也未添加不实放行。

| 视图 | 逐带编号与实见差异 | raw / 未归因带 / 缺块 |
| --- | --- | --- |
| A-R21-03 浅起始 | #2–3：标题/副标题；#5–7：问候语；#9–11、#13–14：建议卡文案与几何；#17–18：最近会话；#20–22、#24–27：能力/输入/页脚区域。QA 数据与板不同，但卡片字重和间距也不同。 | 0.0888 / 19 / 8 |
| A-R21-04 浅历史 | #1–28：设计左侧历史抽屉与 kit 右侧 FullDrawer 的方向和宽度持续不同，内容样本亦不同。 | 0.4237 / 28 / 16 |
| A-R21-13 深起始 | 与 A-R21-03 同一组 #2–3、#5–7、#9–11、#13–14、#17–18、#20–22、#24–27；深色配色未消除几何/内容差。 | 0.0895 / 19 / 7 |
| A-R21-14 深历史 | #1–20、#22：同一抽屉方向/宽度差和内容样本差。 | 0.1408 / 21 / 12 |
| A-R21-N01 b11 浅头 | #2：全屏头；#6–11：b11 的大数据问候/建议与当前 QA 起始状态不同；#13–15、#17–20、#22、#25–26：会话/输入等内容与几何差。 | 0.1001 / 17 / 13 |


- 定向：Web 会话/组织/搜索 50/50、App 解码 4/4、Web 搜索/置顶 27/27、PostgreSQL 摘要全文 1/1 与并发置顶 1/1、Web 停止/聊天 19/19、App 会话 22/22、Web 实体草稿和 retention 10/10、App 草稿 9/9、90 日服务 1/1。App 历史分页、App 全局搜索、Web 上下文等定向测试也通过；具体日志在证据目录。
- 本机 PostgreSQL 清理首轮非零、次轮 0；查询 `orbit_records` 显示被删会话与消息 `deleted`，其他本人/他人记录 `active`。不涉及生产配置。
- App 离线历史编辑：冻结 PATCH/DELETE 请求、镜像覆盖、5 秒本机删除撤销、真实 SQLite coordinator 的 actor/镜像校验与重连上传、409 `PIN_LIMIT` 可见冲突和丢弃操作均先红后绿；定向测试 21/21，加上起始页 pending/discard 渲染 7/7。该实现本轮重放为 `e987931d1`；`run-05/` 又补上 DELETE `expectedRevision` CAS、409 冲突保留镜像与在线提示，类型检查和同基底全量结果见上节。真实双设备离线时序尚未实测。
- 收口 App 全量首轮 `run-03/app-full-final.log` 为 3,135 项中通过 3,102、失败 31、跳过 2。离线写入新增的 PATCH/DELETE 原生策略登记缺失是 E 引入失败，现已修复，读取面审计整文件 21/21（`run-03/app-offline-inventory-fixed.log`）。两份网络路径夹具漏 `queuedMutations`，修正后 App 工作区与 iOrbit 起始文件串行 61/61（`run-03/app-r21-fixture-fixed.log`）。另一份离线镜像夹具每次渲染都造新数组，导致队列刷新循环和输入/点击超时；让静态镜像引用稳定后整文件 10/10（`run-03/app-local-first-stable-fixture.log`）。个人资料与邀请码两个首轮失败在串行整文件 51/51 通过（`run-03/app-adjacent-serial-final.log`）。最终全量复跑结果另列；首轮失败不抹掉。
- 修复后的 App 全量 `run-03/app-full-postfix.log`：3,135 项中通过 3,120、失败 12、取消 1、跳过 2，exit 1。全部 iOrbit 起始/历史/离线策略用例在全量中通过；剩余失败为既有加联系人相机/批量 9、旧 i18n 快照 1、邀请码提示层遮挡 1、加载时限断言 1，另有通知注册用例超时取消。邀请码整文件串行 51/51；通知注册和加载时限两文件串行 21/21（`run-03/app-adjacent-serial-final.log`、`app-extra-failures-serial.log`）。后两类与 iOrbit 无调用关联；全量仍按失败记录。App 最终 typecheck `run-03/app-typecheck-final.log` exit 0。
- 收口 Web 全量 `run-03/web-full-final.log`：7,552 项中通过 6,554、失败 7、取消 1、跳过 990，exit 1。与 r3 相同的 6 项仍在 manifest P0 候选、名片合并、设计夹具检查、加联系人两例及全站按钮 ratchet；新增个人日程列表断言失败，临时 schema CLI 超过 120 秒取消。上述失败的测试与相关源码相对本轮基底 `6ea769085` 均无 E 线改动；当前 `origin/redesign` 已前进，不能拿移动的远端指针当作本轮改动基线。它们不属于新 iOrbit 通过证据，Web 全量门禁仍失败。
- 最终编译与静态检查：Web `npm run build` exit 0（`run-03/web-build-final.log`，含 Next TypeScript）、`npm run lint` exit 0（`web-lint-final.log`）；App `npm run typecheck` exit 0（`app-typecheck-final.log`）、iOS Simulator `xcodebuild` exit 0 / `BUILD SUCCEEDED`（`app-xcodebuild-final.log`）。Web `copy:qa` 在 6,500 条文案中仍报 218 项、exit 1（`web-copy-qa-final.log`），报告条目中无 `web.iorbit`，不记为通过。构建自动改写的 `next-env.d.ts` 已从本线 HEAD 恢复；服务器、Metro 与模拟器均已停止。
- Web 全量完成后补了 SC-07 的异步竞态修复；因此上面的全量结果早于该三文件提交，不能冒充修复后的全量。新增延迟成功/失败定向测试先红后绿、最终 4/4（`run-03/page-context-race-{red,green}.log`），相关路由与上下文定向复跑通过（`page-context-route-final.log`），当前代码的 Web typecheck、lint 与生产构建均 exit 0（`web-typecheck-context-race.log`、`web-lint-post-context.log`、`web-build-context-race.log`）。在该生产构建上以 QA actor 延迟 `/api/contacts/summary`、新建会话后截获 `POST /api/ai/conversations`，请求无 `pageContext`；全程拦截发送，无付费 AI（`context-race-probe.log`）。临时 3700 服务已停止。
- Web 全量后另补一条跨仓集成测试：以 App 的真实离线请求构造与 uploader、Web 的真实会话 PATCH/DELETE handler 和本人 GET 列表运行同一内存 actor，置顶、改名、删除逐次 ACK 与回读 3/3（`run-03/app-web-offline-roundtrip-r3.log`）。App 侧真实 SQLite/coordinator 测试单独证明本机排队与作用域。集成替身没有模拟两台设备、网络断开后的真实重连时序，故 SC-03/04 的真机操作证据仍如表中待验；本条不替代上面的 Web 全量结果。
- App 全量后补的 `search.ask_iorbit` 目的页测试 1/1（`run-03/app-global-search-prefill-e2e.log`）：预填与失焦恢复期间 0 POST，用户改题双击后只有一次模拟发送，正文与来源模板正确。源头跳转 token 由既有 `global-search-screen` 用例覆盖。此新增测试未纳入前述 App 全量统计，不称真实计费验证。
- 本机 QA actor 通过 `POST /api/ai/conversations/sessions` 存四个演示会话，仅供 E 线像素和双端操作；没有 AI 提供方请求。1024/390 历史截图无 `pageerror`，且各出现四组日期分段。
- 旧首页断言已迁至新路由行为：`ink-signal-ai-home` 12/12（左滑后；另有大字号窄屏 1/1）、`ai-home-loading-terminal-states` 5/5、`ai-home-guidance-render` 10/10；App workspace 浏览器全文件复跑 47/47。本轮将 plain browser fixture 的 `global` 别名设在脚本加载前，任务整文件串行 19/19、inbox 整文件串行 2/2；邀请码撤销 sheet 的断言改为限定 sheet 按钮，定向 1/1。三个原全量失败由夹具/选择器解释，定向日志在 `run-03/app-{tasks-serial-fixed,inbox-serial-fixed2,invite-revoke-fixed}.log`。最终全量仍以收口日志为准。
- App 旧呈现代码删后，起始页、Ionicons 与旧 UI allowlist 定向复跑 21/21（`run-02/targeted-app-legacy-cleanup.log`），App typecheck 通过。按测试预加载固定的中文 locale 修正了六条旧日文断言，受影响两文件 15/15（`run-02/targeted-app-home-locale-r2.log`）；App 全量仍以最终日志为准。
- 旧 Web iOrbit 用例已对齐 live `IOrbit2026` 和 demo `IOrbitShell` 两条路线、原文待发送问题及 DELETE 的 5 秒撤销回执；guide 页面 22/22、history 23/23、chat 17/17 分别复跑通过。原测试环境的 React SSR 警告仍见日志，不记作门禁通过。
- RD-33 续工重新入 `heavy.sh e -- …` 公平队列。Web/App 最新 typecheck、Web lint、Web 生产 build、App iOS export 通过；Web build 首轮被内存事务 runner 的回调类型挡住，修复后 r2 exit 0（`run-02/web-build-r2.log`）。App 离线 API 读取面审计 21/21、硬编码文案审计 5/5、起始/历史浏览器 19/19、会话浏览器 106/106。Web 全量 r3：7,552 项中通过 6,556、失败 6、跳过 990；与 r2 相同的 6 项均在 E 未改的 manifest P0 候选、联系信息合并、add-scan 夹具/浏览器、旧全站按钮 ratchet，细目见 `run-02/web-full-tests-r3.log`。新增 R21 用例已过；全量门禁仍失败。App 全量 r4：3,122 项中通过 3,089、失败 31、跳过 2，仍以 exit 1 记门禁失败。R21 起始、历史、单次发送、迟到 DELETE 撤销和 `PIN_LIMIT` 用例通过；先前 R21 字典路径造成的硬编码审计失败已修，定向 45/45。余下失败在加联系人、任务、inbox 和较早字典快照；任务用例中的 iOrbit 断言在进入 iOrbit 前就找不到任务页按钮，不作为 iOrbit 通过或失败证据。`run-02/app-full-tests-r4.log` 保留细目。App 原生 `xcodebuild` r2 和带 Xcode 本地签名的增量 build 均 exit 0（`run-02/app-xcodebuild-{r2,signed}.log`）。签名包在独立 iPhone 16e Simulator 登录 QA actor 后显示 iOrbit 起始、历史和存储会话；AX 实测首读超时可重试，未发 AI 提供方请求。最终原生截图与像素结果见 SC-13 与 App 逐带复核。
- 对 Web r2 的六个失败源文件与测试执行 `git diff origin/redesign..HEAD -- <path>` 为零；E 未改这些源/测试，不在 E 文件边界里直接修。全站按钮 ratchet 的超额列表没有新 `iorbit-2026` 组件。此定位不把全量测试称为通过。
- Web 全站 `copy:qa` 在 6,492 条文案中仍报 218 项，均非新 `web.iorbit` 域；新 iOrbit 域单独扫描 85 条 / 0 问题（`run-02/web-copy-qa-r3.log` 与定向命令），未把全站 gate 记为通过。App iOS export、`expo prebuild --platform ios --no-install` 与 `pod install` 通过。首个 `xcodebuild` 命令把含空格的 `platform=iOS Simulator` 未加引号，Xcode 将 destination 解析为 `{platform:iOS}` 并以 70 退出，**尚未编译源码**；引号修正后的 r2 原生编译成功。Web 像素 r2 六图的原始差异率依次为 0.0577、0.0432、0.1646、0.5478、0.2784、0.1525；样式配对依次 35/138、6/74、2/58、14/124、10/104、2/58，均未达到门禁。1024 历史抽屉改 breakpoint 后单图 r3 原始差异率 0.7384、30/30 超带、style-diff 14/124 配对及 74 项差异，明确未过。
- 预检 `b4`：near 26、missing 118、疑似功能 40；`b11`：missing 20、疑似功能 4；`b8`：near 2、missing 18、疑似功能 22。手机/浏览器装饰按规则排除。未在 E 样式中造近似 token。逐条见 `preflight-checklist.md`。
- 原生截图存储限制与修复：早期一次 `simctl` 临时路径实验将 PNG 短暂写到内置盘 `/tmp/orbit-line-e-r21-shot.png`，随即移到 ORICO 的 `run-02/app-symlink-shot.png`，内置盘文件已不存在；该实验不符合本 Sprint 截图只放 ORICO 的约束。随后改用 `compare-redesign-app.mjs` 自带 `simctl io screenshot`，设置 `TMPDIR=/Users/xzhao/Library/Caches/orbit-r21-shot`（不使用 `/tmp`），比较器把保留的原始图、三联图、数值都写到 ORICO 的 `run-03/app-pixel-final-current/` 并清理临时图。五图已实际复跑，均未过；用户缓存临时目录现为空。历史搜索与存储会话的 AX 记录仍在 `run-02/app-native-{history-search,conversation}-ax.txt`。

## 交接与待定

| 条目 | 本端版本 / 结果 | 另一端影响、未完事项及验证范围 | 来源 |
| --- | --- | --- | --- |
| R21-D18 | `7b896129f` 本机 90 日任务两轮已验；生产未启用 | 授权后由运行环境负责人配置生产任务并验首跑/回滚。 | SC-05 |
| R21-R30 | `e9653180e` 本人 iOrbit 搜索 + `searchLive` 跨端 href + live conversation chip | 重跑 W-R30-P01/A-R30-P06；Web/App 各打开 iOrbit/inbox 所选会话。当前只验 iOrbit 服务与映射。 | SC-11/12 |
| R21-B → R13 | E 侧 Web href 约定 `/app/inbox?conversationId=<id>`、App `/inbox/<id>` | B 线在 R13 交 inbox 本人只读会话服务、Web 选中态与权限测试，再接真实候选。 | SC-11/12 |
| R21-A → R32 | E 页沿 R31a/b kit 编排，RD-33 指定 kit/01-system 优先；预检清单列 b4 token 差异 | A 线在 R32 定稿缺失 token、左侧 FullDrawer 变体；Toast 的 undo 需要按服务端绝对 `undoUntil` 消失，当前 kit 固定从展示起 5 秒。若交付再重跑对应像素/交互门禁。 | SC-01/04/13/14 |
| R21-D → R20b | E 侧会话草稿深链 `draftId` 已接 | D 线从 R20b `entity_draft` 判断待ち接入会话；`contact_draft` 保持联系人落点，跨端验一次。 | SC-09 |

RD-33 已决定：kit/01-system 优先，Web demo 和旧 actions 本 Sprint 保留，真流式、跨设备回执和 App 语音延到下个 Sprint。剩余跨线交付为 A 正式 token/左侧 FullDrawer、B inbox 服务及 Web 选中深链、D R20b 草稿入口。生产调度、Neon/生产迁移、部署、TestFlight 和合回 `chat-agent` 均待用户另行授权，本轮未执行。

## 自定决定与待主会话决定

- E 线把 pageContext 范围收紧为本人联系人列表的行业筛选；其他页面未有可验证的筛选摘要契约，按服务端拒绝处理。历史抽屉在 Web 1200px 以下改用 R31 kit Drawer，宽屏保持本人历史侧栏；kit 目前从右侧进入，与 b4/b8 左侧抽屉板不同。
- 待主会话协调 A 的左侧 FullDrawer、绝对截止时间 Toast 和正式 token，B 的 inbox 本人会话读取/Web 选中深链，D 的 `entity_draft` 入口；这些交付到位后重验对应 SC-04/09/11/12/13/14。生产任务与发布动作需另行授权。未收到上述交付前，不将相关 SC 记为完成。
- 离线删除的并发语义已由主会话定为版本冲突优先，并在 `27925a50f` 实现；跨设备实操证据仍待下一轮，不将 SC-04 的真机链标为已验。

SC-06 当前 Gemini provider 在 `features/orbit-ai/gemini-provider.ts` 使用 `stream: false`，Web/App 收到最终响应；App 尚无录音依赖。完整响应的停止和迟到抑制证据不能代替流式事件或按住录音。E 线 Next dev server（3700）与 Metro（8086）已停止，两端口无监听；`Orbit Line E` 模拟器已关机。未触碰 3000 端口。
