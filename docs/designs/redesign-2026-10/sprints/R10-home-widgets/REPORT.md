# Sprint R10 — 首页组件执行报告

**执行线：** D／`line-d`。**范围：** App `/home`、Web `/app/home`、D-01 布局、真实三步进度和本端首页接线。**结论：** 功能已落地并完成定向验证；SC-15 的像素门禁仍未通过。以下 SC 只按实际证据记账。

## 版本与边界

- 开工按用户修正先 `git pull --rebase origin redesign`；R20b `063c3c65d`、R18c `aada50950` 已在远端。D 线使用 Web `3510` / `.next-line-d`、Metro `8085`、隔离本地库 `orbit_line_d` 和 Orbit Line D 模拟器；未碰 `3000`、`3500`、Neon 或生产，也未 push。
- 源码里程碑（已 rebase 的 SHA）：`e843f5b18` D-01 actor/CAS；`08596eae5` 共用真实 guide 纯投影；`17689f6f9` 首页只读 guide API；`e63eccef9` Web 首开几何标记；`da774c9c8` Web 首页；`96617497c` App 首页；`1f2cf4bb3` App 空态、可访问操作与文案；`b8758e23d` Web 空态与 Next guide route；`ea2035ea5` App 可选择组件库；`d0a6c6292` 画板清单；`d34d6c0f3` 首页暗色 token；`01170099c` App 首页 copy QA；`5419aac67` 仅新增字段的契约快照；`81402a6de` Web copy/Button 门禁；`b71a56740` App 离线读取清单和旧词条恢复；`c4c6a62cb` App 长按菜单与指定尺寸；`cee16e30b` App 壳滚动恢复竞态。所有本线提交的 trailer 为用户指定的 `Co-Authored-By: Codex <noreply@openai.com>`。
- R11a 的 `ContactDrawer`、联系人 `sort=added&limit=4`（`a81954101`）、R13 秘書来源契约（`306f32224`）、R16 问题卡、R31a/b 组件可用。未改 B/C/E/A 线文件。`app/dashboard` 旧屏还有引用，因此保留；旧首页 view-model 仍被 agent/events 使用，也保留。E 线的 `AgentDock` 文件未释放，定位项留交接。
- 画板预检和 `--list` 锁定保存在 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-d/R10/run-01/` 的 `boards-*.txt`、`preflight-{app,web,b11,b12}.{json,md,log}`。其中结构自洽疑点 0；App #0/1 分别有 7/9 个无 token 值，Web #0/1 分别 2/4 个；系统手机外框从业务门禁排除。画板的 Gmail 行与 Q5 冲突，按 RD-33 不取邮件正文或开新 scope，需设计源修订后重比。

## SC 对照

| SC | 结果与可复核证据 |
| --- | --- |
| 01 开工与归属 | **部分**。远端、依赖、画板和预检已确认；用户要求全量仅在收口跑一次，故采用 R20b 最终日志作开工可比基线，未声称开工时另跑全量。 |
| 02 D-01 live | **通过定向**。本地 PG actor 隔离、A/B、CAS、幂等、同 ID 异体和 409 snapshot 测试；mock 仍 sample，live 无演示。`sync:contract` 生成 App 副本。证据 `d01-verified.log`、跨端 revision 回读。 |
| 03 编辑全链 | **部分**。Web browser 验证首开五卡边界不跳变、排序/尺寸/移除撤销/库加回和保存；App 原生长按菜单（編集/小中/移除）、方向按钮与水平拖动重排、尺寸切换、移除后即时撤销、库按类/搜索、选择尺寸并加回均已操作。`native-edit-chain.json` revision 7 和 `native-drag-verified.json` revision 8 证实 App 数组保存而 Web 数组不变；`native-menu-chain.json` 记录菜单指定尺寸 revision 10、移除/撤销 revision 13→14；随后 App 原生将四块库卡全部加回，revision 17 与重开实屏保持九块且 Web 仍为五块。缺完整原生逐步录像及键盘/VoiceOver 全链。两端限制唯一 key、上限 10、库不展示 deadline。 |
| 04 Web 首页 | **部分**。五卡/空态/右栏/链接已接；实测 1024 抽屉宽 380、Esc 归焦，390 搜索隐藏并留实屏；空态引导联系人、Task 计划、活动、受信箱入口逐一点入正确路由。少/多数据态与 1024 对板仍 FAIL。 |
| 05 App 首页 | **部分**。新路由使用 `AppScreen inset="kit"` 和 UiText；原生登录后看到日期、问候、铃铛、编辑及五卡；Task 返回后首页首卡和本地布局刷新。铃铛点入受信箱、再点「ホーム」返回首页已实测，但隔离账号受信箱显示读取失败。补测发现 Home 滚动到底后经 Task 返回偶发归零：壳在 `scrollTo` 后立即清掉待恢复标记，iOS 初始负值/零值滚动事件可覆盖记忆。修复后原生 Home→Task→Home 的编辑和メモ纵坐标均保持不变（`native-home-scroll-return.json`、`app-home-scroll-return-no-board.png`），针对性竞态测试先红后 5/5 绿；完整多路由/VoiceOver 链仍未证。旧 dashboard 62/62 回归。 |
| 06 今日やること | **待上游与联验**。首页读同 actor 的 `todo/page`、`schedule-items`，问题卡复用 R16；R20a 最终 REPORT 的 Task 原生/scroll、像素和全量仍有未闭合项，首页↔Task 完成/回答后的同源回读未满足 SC 前置，不能记完成。 |
| 07 プラン スコア | **部分**。`current=null` 显示目标入口；两端选择直接 summary，event 段文案为イベント枠。Web 用浏览器响应 fixture 留 `+10 / 0 / −10` 三态实屏，负数不拼 `+−`；见 `web-plan-event-fixtures.json`。这不是同 actor 真实计划，也没有撤销加点后刷新或 App 三态截图。N13 是 Task 参考板，未算首页门禁。 |
| 08 次のイベント | **部分**。两端从 upcoming 选最早未来 `registered` 并使用返回 href、`meetCount=null` 不画人数；Web 浏览器混合 `planned / waitlisted / registered` 响应 fixture 实屏选中最早 `registered`，标题与准备入口均取返回 href，未画虚构人数；见 `web-plan-event-fixtures.json`。尚缺真实同账号两端点击链。 |
| 09 人脈 | **部分**。B 线已提供稳定 `sort=added`；隔离账号 live summary 初始 `total=78`、page 前四=4。Web 手输新增合成联系人后 `78→79`、本月 `0→1`、`sort=added&limit=4` 第一条为新增项，首页显示 79/新联系人并打开 R11a `ContactDrawer`；另一账号仍为 0，撤销后回 78。独立抽屉操作在 600 高视口关闭后 scrollY `75→75`。见 `web-home-contact-live.json`、`web-home-contact-undo.json`、`web-contact-drawer-scroll.json`；App 同步/返回和 0/5/286 全态仍待补。 |
| 10 秘書から | **部分**。只接受期限/会前准备/活动推荐三种合法来源，未知整条跳过；本地 live 源为空时为空态，不把样例写入库。Web 注入 sample 浏览器响应后留三来源同时显示的实屏，三个目标 href 正确、各有「サンプル」，邮件和未知来源不显示；见 `web-secretary-three-sample.json`。这不是通知生产/未读/受信箱的真实端到端回读；未调用 Gmail 或付费 AI。 |
| 11 组件库四块 | **部分**。Web 用浏览器拦截的临时 D-01 布局 fixture 逐项加判断待ち、今週、イベント推薦、メモ，观察每次挂载后的本域 GET；推荐和笔记在未挂载时无请求。类别筛选只剩事件推荐、搜索只剩メモ；保存重开九块不重复，移除判断待ち→撤销→再次移除保存→加回保存，revision 1→3；见 `web-home-library.json` 与实屏，**此链不算 live 跨端布局回读**。App 原生从库逐项加四块，服务端 revision 17 记录九块、Web 数组不变，重开九块可见；事件分类只剩事件推荐、输入 `Xyz` 后为空（`app-native-library-filter.png`）。仍缺 App 四块逐项请求计数和每块移除再加的完整操作；b11 #23 三轮像素 FAIL。 |
| 12 三步与铃铛 | **部分**。共用纯投影独立提交 `08596eae5`，读联系人/目标/计划和 guideState v2 完成闩锁，不受示例开关影响；只读 API 来源失败 503，不猜 0/3。App/Web 空态实屏为 0/3；逐步到 3/3、老用户联验未全数完成。铃铛到受信箱再返回首页已实测，但隔离账号的受信箱读取失败。 |
| 13 右栏与每天一问 | **部分**。Web 建议最多三条、去重且 count=可见数，1024 壳按钮接数；R16 问题卡挂在今日卡里。E 线会话摘要和 `AgentDock` 定位未在 D 所有权内完成，问题卡回答后跨端核对未做。 |
| 14 离线/409/单源失败 | **部分**。App 缓存按 actor+baseURL 隔离，断网草稿保留 mutationId，恢复 PUT；纯测试证明 409 采用完整服务器版且不重写。真实同 actor Web/App CAS 链验证 revision 1→4、旧 revision 409、两数组独立；原生停止本端 Next→离线编辑→重启 App 草稿仍在→恢复 Next 后 revision 6 上传并解除离线标记，见 `native-offline-layout.json`。补以原生实屏：revision 17 后断开本端 Next，把メモ小→中，离线重启显示「以前の情報 · 接続後に保存します」且中尺寸保留；恢复 Next 后 revision 18 上传、提示消失，再改回小并保存 revision 19，Web 数组始终不变，见 `native-app-supplement.json`。Web 计划 summary 注入 503 的实屏显示该卡重试、其余四卡保留；App 单源失败实屏仍待核验。 |
| 15 旧屏/像素/不退步 | **未过**。Web/App 首页、1024 壳、编辑、库和深色已比，均有未归因超阈与缺块；其他画面与 ≥20% 抽查仍需交接。组件库已交付，不能写「等组件库」。逐屏结果见下。 |
| 16 全量与交接 | **部分**。Web 全量 7,934 中 10 fail、App 全量 3,285 中 24 fail；逐名新增分别 5、11，已作定向修复并保留全量红日志。跨端布局回读已完成，功能同源仍不等于全业务对齐。 |

## R10-01～10 交接逐项

| 条目 | 本端结果／剩余 |
| --- | --- |
| R10-01 | Web HomePlaceholder 已替换为五卡、空态与编辑；像素仍红。 |
| R10-02 | 首页真实建议和 ShellRailButton count 已接；最近会话只在 E 线摘要可用时出现，当前无源不伪造。1024 抽屉宽 380、Esc 归焦实测通过，视觉仍红。 |
| R10-03 | 两端编辑链与库已实现，旧「近日公開」不再作为编辑回应；App 原生 long press 菜单、方向按钮、实际水平拖动、换尺寸、移除/即时撤销、分类/搜索和四块加回/复开已验，键盘/VoiceOver 和完整逐步录像待补。 |
| R10-04 | App 日期/问候/白铃铛/编辑按钮已换；#0 可见。 |
| R10-05 | E 线持有 AgentDock 来源，D 未改；请求 E 线释放单点定位并给会话摘要接口。 |
| R10-06 | home-layout live actor CAS、默认五卡、App 本地草稿可用；同账号跨端回读与原生断线重开后恢复上传已验证。 |
| R10-07 | `current=null` 空态已做，event segment 名称按定案；负数纯测试已做。 |
| R10-08 | `−10` 字符口径两端纯测试通过；Web 浏览器响应 fixture 的首页负数实屏已留、标「设计稿无」，App 真实计划负数与撤销刷新仍待补。 |
| R10-09 | R16 每天一问卡接在今日卡里；回答/跳过后跨端刷新仍待验。 |
| R10-10 | R11a summary、`sort=added` 前四与 Web ContactDrawer/App 详情按导出接口消费；Web 同账号新增一人后总数/本月/最近首位/抽屉及另一账号隔离已实测，新增项随后撤销；App 换号与详情返回链仍待补。 |

## 像素门禁与状态

画面清单为 `repos/orbits/scripts/visual/views/{web,app}-R10.json`；归因文件 `attribution-redesign-R10.json` 当前没有通过人工确认的带，不以空归因伪称 PASS。原始截图、triptych、`result.json`、日志在上述 `_evidence-d/R10/run-01`。所有下表画面仍为 **FAIL**：

| 画面与状态 | 原始 raw；最后超阈带／缺块 | 证据与限制 |
| --- | --- | --- |
| Web #0 空态 | 三轮 `0.0300→0.0277→0.0329`；`4/20` | `web-empty-valid-round{1,2,3}`，三轮上限。 |
| App #0 空态 | 两轮 `0.1303→0.1303`；`8/14` | `app-empty-round{1,2}`，第三轮没有可信的新增修正；原生日期为 10/20，画板为 10/7。 |
| Web #2 填充态／#3 编辑 | #2 `0.0541→0.0545`，`6/35`；#3 `0.0563`，`7/42` | `web-populated-round{1,2}`、`web-edit-round1`；本地 actor 有 78 人，但无画板中的计划/活动事实，仍有布局差异。 |
| Web #21 深色 | `0.3213→0.0503`；`7/34` | `web-populated-dark-round{1,2}`；修复未定义 surface/text CSS token 后改善，仍 FAIL；浅色 raw 持平。 |
| b11 #25 Web 编辑库 | `0.0665`；`7/43` | `web-edit-b11-round1`；编辑右栏和小/中添加按钮可用，但本地 actor 缺板中计划、活动和三种秘书数据，结构缺块未归因，FAIL。 |
| App #4 编辑／#5 库 | `0.1309`，`9/20`；`0.3375`，`8/18` | `app-edit-round1`、`app-library-round1`；空 actor 对填充画板，结构仍不合。 |
| App #33 深色填充态 | `0.1184`；`9/12` | `app-populated-dark-round1`；深色真实实屏有五卡，但隔离 actor 是空态，画板要求计划、活动和人脈数据；仍 FAIL。 |
| b11 #20 App 长按菜单 | 三轮 `0.7616→0.1722→0.2037`；`9/23` | `app-longpress-b11-round{1,2,3}`，三轮上限。首轮只有编辑态；后两轮真实长按浮出预览与編集/小中/移除菜单，菜单操作经原生回读；数据与背景结构仍不合，FAIL。 |
| b11 #21/#22 App 拖动／撤销 | #21 `0.1423`、`9/20`；#22 `0.1377`、`9/18` | `app-drag-b11-round1`、`app-remove-b11-round1`；真机手势中途截图和移除后 Toast 截图，撤销即刻恢复，仍 FAIL。 |
| b11 #23 App 库 | 三轮 `0.2359→0.1447→0.1402`；`8/23` | `app-library-b11-round{1,2,3}`，三轮上限；库已可搜索/分类/选尺寸，但右栏与画板元素仍缺。 |
| b11 #24 App 选尺寸 | `0.2601`；`9/19` | `app-library-size-b11-round1`；原生库中小中可选，空 actor 对填充画板，仍 FAIL。 |
| b11 #48 App 深色拖动 | `0.1253`；`9/16` | `app-drag-dark-b11-round1`；深色真实手势中途截图，填充数据缺失，仍 FAIL。 |
| b12 1024 Web 壳 | light W06 `0.0192`、W07 `0.0647`；dark W06 `0.0191`、W07 `0.1517` | `web-1024-shell-valid/summary.json`；前一次使用错误 design base 的 `web-1024-shell` 为执行错误，不计门禁。1024 抽屉和 390 搜索行为单独实测。 |

Web 日期/右栏、App 日期/系统设备尺寸、画板 Gmail 行是已知差异，其中结构/尺寸差异仍未归因通过。填充态真实数据不足不抵消实际超阈和缺块。

无独立画板的 Web 390、App 非 #33 深色空/少/编辑、单源失败/离线/409、首页负分与 R13 live 空态均标「设计稿无」，只可留真实截图，不能计像素分母。N13-A/W 仅供负数字形参考，不属于首页整屏通过。

**清单中未取得可比结果的画面：** W-R10-02（`web.html` #1 少量）；A-R10-02/03/03S（`app.html` #1/#2/#3 少量、多量、滚动）。这些画面均为**未跑门禁**，不是通过或归因后的失败。少量/多量要求的同 actor 计划、活动和三种秘书提醒在隔离库中不存在。其余清单画面均已至少跑一轮但仍 FAIL；上表中的填充态运行也不能用不匹配的空 actor 获得 `[data]` 通过。重比需先补真实或明确标为 mock 的一致 fixture，再执行对应操作链；仍须逐带归因和通过画面 ≥20% 抽查。

**设计稿无的状态：** Web 390 已留 `web-390-no-board.png`（五卡可见、搜索隐藏）；Web 单来源失败已留 `web-one-source-failure-no-board.png`，计划 summary 503 时仅计划卡显示错误与重试，其余四卡仍在，探针回执见 `web-home-supplement.json`。空态引导联系人、Task 计划、活动、受信箱的逐个导航回执见 `web-home-links.json`；第一次链接探针误选今日卡的计划引导链接，修正为精确 href 后四项通过。Web 四块库加回态留 `web-library-four-blocks-no-board.png`，但该图的布局为浏览器拦截的临时 fixture，不算 live 画板通过。Web 计划 `+10 / 0 / −10` 三张与混合状态活动一张实屏见 `web-plan-delta-{plus10,zero,minus10}-no-board.png`、`web-event-mixed-status-no-board.png`；三来源秘书 sample 实屏见 `web-secretary-three-sample-no-board.png`，均用浏览器响应 fixture，不是持久业务数据。Web 联系人真实新增 79 与抽屉实屏见 `web-contact-plus-one-live-no-board.png`、`web-contact-drawer-live-no-board.png`；新增项已撤销。App 原生四块库重开态见 `app-library-four-reopened.png`；离线重开与恢复实屏见 `app-offline-reopened.png`、`app-offline-memo-medium.png`、`app-online-recovered.png`，操作/回读见 `native-app-supplement.json`。409、App 单源失败及其他无板深色态仍没有合格实屏图。无板状态不进入像素分母。

## 通用口径 G01～G26 逐项

| 口径 | 本次处理和状态 |
| --- | --- |
| G01 | 两端新首页标题与旧周条已替换；App #0、Web #0 实屏可见，**部分**（其余数据态未比）。 |
| G02 | 首页次要字使用 kit 的弱化 ink/surface token；深色 W-R10-03D 已复比但未过，**部分**。 |
| G03 | 编辑移除为中性减号和撤销；长按菜单的「ホームから外す」用 coral-text，**本页适用项已处理**。 |
| G04 | App 使用 A 线按钮与 UiText；长按菜单小中圆钮有 9pt hitSlop，原生点按可用，40 可见/44 触控的逐项量测仍未完成，**部分**。 |
| G05 | `--list`、预检、真实截图与逐屏比较已做；有板画面仍红，**未过**。 |
| G06 | Web/App 的定向快测、暗色和 1024 比对已做；没有通过画面可供 ≥20% 抽查，**未过**。 |
| G07 | 使用较新 `b11`/`b12` 板；旧 b6 抽屉与 A-R05-12 过渡板不计分，**已按范围处理**。 |
| G08 | 隔离账号和本地库是真实回读；缺数据时没有将样例写入 live，**已按范围处理**。 |
| G09 | 预检与像素只看产品内业务界面；手机系统画框排除，**已按范围处理**。 |
| G10 | Web 首页挂现有 `ShellPage` 插槽；1024 抽屉行为实测，视觉仍红，**部分**。 |
| G11 | 首页沿用 `phoneFold` 右栏；1024 宽 380、Esc 与焦点回归实测，**部分**。 |
| G12 | 390 实测搜索不可见，`web-home-shell-check.log` 与 `web-390-no-board.png`，**通过交互并留实屏**。 |
| G13 | 首页 CSS 修正 dark surface/text token；bottom inset/层级尚无全态画板通过，**部分**。 |
| G14 | kiosk/公开页不属于本 Sprint；首页仍是已登录路由，未改公开入口，**范围外核对**。 |
| G15 | 新 App `/home` 使用 `AppScreen inset="kit"`；原生浅/深实屏，**通过结构、像素未过**。 |
| G16 | 一级底栏沿用 App 壳；Home 滚动→Task→Home 的原生坐标恢复 0pt 偏差，壳竞态测试 5/5；其他二级转场与 VoiceOver 返回链仍缺完整实测，**部分**。 |
| G17 | 新 App 首页文本用 UiText，原生空态已看；字形像素仍红，**部分**。 |
| G18 | 未实现/单源失败由各卡降级，D-01 503 fallback 分支有定向测试；Web 计划来源单独 503 实屏证实该卡重试而其余四卡保留，App 实屏未取得，**部分**。 |
| G19 | D-01 响应宽进、PUT 严出，schema parity 与 `sync:contract` 定向通过，**通过契约**。 |
| G20 | 旧 dashboard 和 view-model 尚有调用，因此未删文件或放宽 allowlist；旧屏不退步仅定向回归，**部分**。 |
| G21 | Web 新首页使用 Orbit2026Scope/CSS Module；暗色 token 已修，像素未过，**部分**。 |
| G22 | 沿用壳语言 cookie；三语首页新文案已入词典，逐语言视觉未验，**部分**。 |
| G23 | R31a 新组件已作为依赖消费；本页没有私造基础组件，像素仍红，**部分**。 |
| G23b | R31b 组件已作为依赖消费；不以组件交付替代本页重比，**部分**。 |
| G24 | App 日文新文本经 UiText；粗体字形尚未逐板归因，**部分**。 |
| G25 | 文字结论以未过门禁为准、单画面不超三轮、按路径提交；**执行约束已遵守**。 |
| G26 | 首页 token 优先，修复未定义 dark token；预检的非 token 值未全逐像素归因，**部分**。 |

## 测试与可比基线

- R20b 最终可比日志：`/Users/xzhao/orbit-sprint-evidence/redesign/R20b/run-02/web-full-final.log` 为 Web **7,862 / 6,788 pass / 33 fail / 1,041 skip**；同目录 `app-full-final.log` 为 App **3,272 / 3,256 pass / 14 fail / 2 skip**。其后的远端 R18c 与 R10 用例会改变总数，因此最终以失败**逐名集合**比较，数量只作辅助。用户要求全量只在收口跑一次。
- Web 收口全量 `web-full-final.log`：**7,934 / 6,830 pass / 10 fail / 1,094 skip**，exit 1。逐名比较见 `web-failure-comparison.json`：较 R20b 旧集合少 28 名、新增 5 名。新增分别是合约快照未录 `webCustomizedAt`、HomeCards 直写日文引发 3 个扫描断言、13 个新原生 button 触发 ratchet；已改为快照仅新增字段、三语词典和系统 Button。全量日志保留修复前的红项；修复后只跑对应定向测试，不将全量记绿。其余 5 个失败名与基线同名。
- App 收口全量 `app-full-final.log`：**3,285 / 3,259 pass / 24 fail / 2 skip**，exit 1。逐名比较见 `app-failure-comparison.json`：较 R20b 旧集合少 1 名、新增 11 名。其中 4 个旧 Home 断言与 6 个日程断言因修改 R03 受保护词条的中英文间距失败，已恢复旧词条；另 1 个离线读取清单漏登 R10 实际请求，已登记 21 个请求并把布局 PUT 改为可审计的 `client.put`。修复后明确指定文件的 App 定向 193 tests / 192 pass / 1 fail，唯一失败 `the original split key set retains its current approved copy snapshot` 也在 R20b 同名基线里；上述 11 个新增失败名定向均转绿。第一次尝试定向的 `npm test -- <files>` 会展开 App 固定全量 glob，发现后约 30 秒中断并清理其进程，不计为一次完成的全量。
- 定向：D-01 PG、guide 开关/闩锁/不可用、Web 首开几何/编辑、App 布局模型/同步与旧仪表板通过。修复后 Web 契约/文案/Button/CSS/编辑 20/20；App 指定 7 个测试文件 193/192 pass/1 个 R20b 同名旧失败，原生读取清单及 11 个新增失败名均转绿。Web `typecheck:app`、App `tsc --noEmit`、Web `lint` exit 0；命令和日志见末节。
- App 长按菜单是完整测试之后的本线补交：指定尺寸的 TDD `home-widget-model.test.ts` 先以 `s !== m` 失败，再 4/4 通过；菜单编辑/指定尺寸/移除与撤销在本机原生运行，revision 9→14 的服务端回读证实 Web 数组未动。补交后 `npx tsc --noEmit` exit 0，首页 copy QA 94 entries / 4 个同名 R03 旧问题 / 新菜单词条 0 问题（`app-home-copy-after-menu.json`，exit 1）。没有二次完整 App 全量，故最终提交版仍缺完整全量复核。
- Web 组件库补证 `web-home-library.json`：D-01 响应用浏览器临时 fixture 拦截，四块挂载各触发对应真实本地 API GET，未挂载时推荐/笔记请求数为 0；保存、重开、移除、撤销、加回链在该 fixture 内 revision 0→3 且无重复，App 数组保持五块。此测试没有改写隔离账号的真实 D-01 记录，也不能代替 App 四块或两端同 actor 业务联验。
- Web 计划/活动补证 `web-plan-event-fixtures.json`：注入只读响应后 `todayDelta` 的 `+10 / 0 / −10` 字形及 event segment 均从页面读回；活动混合状态过滤 planned/waitlisted、选中最早 registered，标题/准备 href 相同，`meetCount=null` 无人数。响应只在浏览器内，不能替代计划真实撤销或跨端活动同源。
- Web 秘书补证 `web-secretary-three-sample.json`：从登录的本地账号取得 actor ID，浏览器只读响应注入带 sample 标记的三类通知和两条应跳过来源；页面保留三条合法通知的顺序、目标 href 与样例标记，邮件/未知条目未出现。测试没有写入通知，也没有证明未读和受信箱目标同源。
- Web 人脈 live 补证 `web-home-contact-live.json`：隔离库中的 78 人合成账号经手输 API 加一人，总数 79、本月 +1、最近四人首位即新项，首页同步显示并打开 R11a 抽屉；另一合成账号总数保持 0。`web-home-contact-undo.json` 证实手输撤销 200、总数回 78。另用 600 高视口打开/关闭抽屉，`web-contact-drawer-scroll.json` 为 scrollY 75→75。未调用外部联系人系统或写生产数据。
- App 原生四块与离线补证 `native-app-supplement.json`：从既有 revision 14 逐项加 pending/week/eventPick/memo，重开时 revision 17 的 App 数组九块且 Web 五块不变。停本端 Next 后把メモ小改中，重开保留中尺寸和待连接保存提示；恢复本端 Next 后 revision 18 为中，提示消失；再用 App 改回小并保存 revision 19，Web 数组始终五块。`app-library-four-reopened.png`、`app-offline-reopened.png`、`app-offline-memo-medium.png` 和 `app-online-recovered.png` 是真实模拟器截图。没有因此重跑被用户限制为一次的全量 App suite。
- App Home 返回滚动补证：原生复现过从メモ附近切 Task 再回 Home 后跳到顶部。`AppScreen` 的 `scrollTo` 请求先于 iOS 初始滚动事件，旧代码立刻清除待恢复位置导致事件覆盖记忆；新增浏览器壳回归按该顺序先 0≠900 失败，修复后 5/5 通过。App `npx tsc --noEmit` exit 0；本机模拟器 `native-home-scroll-return.json` 显示「編集」−766.33→−766.33、「メモ」563.00→563.00，实屏 `app-home-scroll-return-no-board.png`。这是完整 App suite 之后的修复，按一次全量上限未重跑。
- Web copy QA 最终读数为 3,998 entries、29 个既有全局问题、首页新增问题 0，exit 1；App 首页单域过去未纳入全域清单，此次补齐组件类型和新组件文案后 91 entries、4 issues（均为 R03 已批准旧词条），exit 1，且已列入全域清单。全域 `copy-global-final.json` 为 7,598 entries、249 issues，其中首页 4 个旧词条、R10 新词条 0，exit 1。通过定向不代表全量绿。

## 自定决定、待主会话决定与跨线输入

- 新冲突按「数据自洽→已定规则→新画板→惯例」处理：无计划/活动/联系人时显示来源说明和真实入口；三步进度放在「今日やること」卡内以对应空态画板；Web 初次进入编辑不改变 5/4/3/5/7 几何，实际修改后才启用编辑网格；App 首开五卡宽度改为中/小/小/中/中；Next guide handler 从 `route.ts` 移到同目录 `handler.ts` 以符合生成的 route 类型。均有定向验证。
- **待主会话决定：** Gmail 行按 Q5 要求从业务实现排除，请更新 App/Web 首页设计源后重比；Web 右栏 E 线最近会话与 AgentDock 定位由 E 线给出读取摘要/释放最小源文件的时间；R20a 的 Task 原生/scroll/像素与全量红项何时作为 SC-06 联验前置关闭。若需生产 homeLayouts 迁移、Neon、部署或真机分发，须另走用户授权，本 Sprint 未做。
- **给 R28：** 直接 import `shared/compute/guide-real-progress.ts` 的真实纯投影；它独立于示例开关，完成闩锁与老用户规则已在本地测试。引导页本体与 3/3 导航仍属 R28。
- **给 R19：** 消费两端已建立的首页读模型/布局响应；WidgetKit 不复刻计划、活动、todo 或 guide 规则。卡片部分业务验收未闭合时不要把其当已验证 source。
- **给 E：** `AgentDock` 原文件仍由 E 线消费，请按主区宽度居中并给安全的最近会话摘要；D 线不复制会话记录。

### Bridge 四栏交接草案

| 本端版本 | 另一端影响 | 未完成事项 | 验证范围 |
| --- | --- | --- | --- |
| D-01 `e843f5b18`、schema/默认几何 `e63eccef9`、Web `da774c9c8` + `b8758e23d` + `d34d6c0f3` + `81402a6de`、App `96617497c` + `1f2cf4bb3` + `ea2035ea5` + `01170099c` + `b71a56740` + `c4c6a62cb` + `cee16e30b`。 | 同 actor `GET/PUT /api/home/layout` 返回 revision、App/Web 两数组、hint 和 Web 首次实际编辑标记；App 同步 schema 与本地草稿按 actor+baseURL 隔离。Web 编辑不会覆盖 App 数组，反向亦同；409 返回整版快照。`AppScreen` 滚动恢复在初始事件后才确认目标位置，其他 tab 页共用该壳。 | Task 今日同源后续、E 线会话/AgentDock、Q5 改稿像素及部分跨端卡片回读。 | 本地隔离 PG：App 改 App 顺序→Web GET revision 1、Web 保持；Web 改 Web 顺序→revision 2，两数组保留；连续 CAS 中旧版 409，revision 4 恢复两端默认。App 原生离线编辑/重开/恢复服务后 revision 6 上传；随后原生重排、尺寸、移除撤销、库过滤与加回，revision 7→8；长按菜单指定尺寸 revision 10，移除/撤销 revision 13→14，Web 数组不变。原生四块逐项加回 revision 17、重开九块；本端 Next 断开后的メモ小→中离线重开、恢复上传 revision 18、再改回小 revision 19，Web 数组始终五块。Home→Task→Home 原生滚动纵坐标 0pt 偏差、壳竞态定向 5/5。Web 人脈新增合成联系人 78→79、最近首位与抽屉打开、另一账号仍 0，撤销后回 78；计划/活动/秘书为浏览器响应 fixture。Web 浏览器、App 原生浅/深、定向 PG/模型测试；首页新增词条 copy QA 0，新纳入的旧词条 4 条未过。无生产/Neon/发布验证。 |

README、HANDOFF、DEFERRED-A、决定表和 screen-ownership 的汇总条目由主会话协调；D 线未覆盖共享台账或其他线未提交改动。

### 给主会话的共享台账更新原文

| 目标台账 | 本端版本 | 另一端影响 | 未完成事项 | 验证范围 |
| --- | --- | --- | --- | --- |
| `README.md` Sprint R10 行 | D 线以上 17 个源码提交；REPORT 为本报告及其后续提交。 | Web/App 首页与同 actor D-01 布局已接入；App 壳滚动竞态修复。 | SC-15 像素红、SC-06 Task 同源前置、E 线 `AgentDock`，SC-03/07～14 尚有逐态操作证据。 | 本地隔离 DB、Web 浏览器和 App 原生；Home→Task→Home 滚动实测；生产未验。状态建议写「部分交付／待联验」，不要写完成。 |
| `HANDOFF-TO-FEATURE-SPRINTS.md` R10 行 | `08596eae5` guide、`e843f5b18` D-01、两端首页提交见版本段。 | R28 导入真实三步纯投影；R19 只消费已验证的首页读模型；E 线补会话摘要和单点定位。 | Q5 的 Gmail 行需改稿；R20a Task 前置仍开放。 | guide 纯测试与 D-01 PG/CAS、跨端 revision 1→6 回读；业务卡链路未全通过。 |
| `DEFERRED-A.md` R10 行 | 同上。 | 不产生生产变更。 | 产品/设计：Q5 板、E 定位和 Task 联验；发布：生产迁移、Neon、部署和真机分发待用户另行授权。 | 本地-only 证据与红门禁；见下方分项草案。 |
| `maintenance/2026-10-12-decisions.md` R10 记录 | 空态把三步放入今日卡，首开五卡几何固定到实际编辑，Web 只在实际改动后进编辑网格。 | 两端同 actor 仍各自保留布局数组；`webCustomizedAt` 仅实际改动后写。 | 以上决定不改变 Q5，Gmail 行仍需设计源决策。 | Web 首开前/中/后定向测试、原生空态及 CAS 回读。 |
| `screen-ownership.md` 首页行 | D 线持有 `/home`、`/app/home`、D-01、首页壳槽；保留仍有调用的旧 dashboard/view-model。 | R13 秘书契约、R16 每天一问、B 线联系人导出、A 线组件均按既有归属消费。 | E 线持有的 `AgentDock` 原文件与会话摘要不由 D 改；像素重比仍由 D/主会话接续。 | 本线修改路径见 git 提交；未动 B/C/E/A 线文件。 |

### DEFERRED 分项草案

| 分类 | 具体后续动作 | 解锁条件／对应 SC |
| --- | --- | --- |
| 待主会话决定 | 按 Q5 修订 App/Web 首页画板中的 Gmail 行及相关数据状态，再重跑预检与有板像素。 | 设计源更新；SC-10/15。 |
| 待跨线交接 | E 线给安全的最近会话摘要与 `AgentDock` 居中定位的可编辑点；D 线随后做 1440/1024 复比。 | E 线交付；SC-13/15。 |
| 待跨线联验 | R20a 关闭 Task 原生/scroll、像素和全量红项后，建立同 actor 的 todo/page、schedule-items、每天一问完成/回读 fixture。 | R20a 最终证据与可运行数据；SC-06/13。 |
| 待本线补证 | 建少/多数据 actor、三种秘书真实通知来源、真实计划三态及活动混合状态的可复现同账号 fixture；逐项补 App 四块请求计数/各卡移除再加与屏幕清单中未跑画面。Web 四块临时布局、计划/活动/秘书浏览器响应 fixture 已补；App 四块原生 live 加回与离线截图已补，不冒充其他业务数据态。 | 隔离库和一致 fixture；SC-03/04/05/07～15。当前数据不足不能抵销已发现的布局差异。 |
| 待用户授权 | 若后续需要生产 `homeLayouts` 数据迁移、Neon、部署、环境变量或真机分发，再单独申请对应动作。 | 本 Sprint 只验证隔离本地库；本次无生产写入。 |

## 最终门禁与提交

- **收口命令：** Web 在 `repos/orbits` 以 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` 经 `heavy.sh d` 跑一次完整 `npm test`（`web-full-final.log`，exit 1）、随后 `npm run typecheck`（`web-typecheck-all-final.log`，exit 0）、`npm run typecheck:app`（`web-typecheck-final.log`，exit 0）、`npm run lint`（`web-lint-final.log`，exit 0）及 copy QA（`web-copy-final.json`，exit 1）。App 在 `repos/orbit-app` 同 locale 经 `heavy.sh d` 跑一次完整测试（`app-full-final.log`，exit 1）、`npx tsc --noEmit`（`app-tsc-final.log`，exit 0）及 copy QA（`app-home-copy-final.json`，exit 1）。全域文案 QA `copy-global-final.json` exit 1。`heavy.sh` 的具体命令和输出均在本地证据目录；没有向全量测试传全局 DB URL。修复全量新失败后的定向日志与逐名比较见测试节，没有重跑第二次完整全量。
- **结论：** SC-02 的本地 live 合约已定向通过；Web/App 类型检查和 Web lint 为 0；两端完整测试仍红，原全量日志各有 5/11 个新失败名，定向修复后逐名的新失败均通过，但完整全量没有二次确认。copy QA 全域仍红，新增首页文案问题为 0。所有已比画面仍有未归因超阈带和缺块，SC-15 **FAIL**；不能视作发布或业务验收完成。
- **清理：** 本端启动的 Next `3510`、Metro `8085`、画板静态服务 `3357` 和 Orbit Line D 模拟器已停止；Next 生成的 `next-env.d.ts`、`tsconfig.json` 仅按这两个路径恢复。`3000/3500` 未操作。隔离库和外部证据保留；预先存在的未跟踪 `HANDOFF-CLAUDE-2026-10-19.md` 未改。
- **停点：** 剩余的同 actor 业务验收需要 R20a Task 稳定交付、E 线摘要/定位、Q5 改稿和可复现的少/多数据 fixture；已有画面仍需视觉修正/逐带归因。SC-03～16 的开放项以上表为准。Web 390、四个空态入口和单来源失败已独立补证，不能替代少/多数据态、App 单源失败或像素通过。报告提交只交付本地审阅证据，不将开放项关闭，也不触发 push、生产或部署。
