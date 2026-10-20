# Sprint R19 — iOS 主屏／锁屏小组件执行报告

**状态：部分完成，SC-R19-04／06～11 未过。** D 线本地源码已实现快照投影、账号清空、Expo 再生成的 WidgetKit extension 和六种 family；原生宿主与 extension 均编译成功。本机模拟器拒绝运行带 App Group entitlement 的临时签名宿主；去掉该 entitlement 后 App 可运行，但共享容器不可用，extension 又在 WidgetKit XPC 启动时退出。因此没有 App→共享容器→extension 的真实回读，也没有可放置的小组件实屏。下列门禁按这个边界记录，不把编译、源代码或样例当成实屏验收。

## 版本、边界与自定决定

- 开工 `git pull --rebase origin redesign` 后基线为 `005230b8b`；本线源码提交 `f6497dea1`（v1 快照、投影、Q5 画板）、`36f6e8281`（CNG 插件、桥接、生命周期、六种 WidgetKit family）和 `bef3a06cb`（显式登记七个读取面、隔离原生测试边界），均带要求的 Codex trailer。未 push、未部署，未连接 Neon／生产。仅在 D 线生成被忽略的 `repos/orbit-app/ios/` 和外部 `_evidence-d/R19/run-01/` 证据；既有未跟踪 `HANDOFF-CLAUDE-2026-10-19.md` 保留原样。
- 按已批准 §R19-8，`widgets.html` 中尺寸秘書在浅／深 #0/#3 都由原来的 **期限＋Gmail 邮件摘要＋推荐** 改为 **期限＋推荐**，件数 3→2，并更新空态／库描述。理由是 Q5 已排除首页 Gmail 正文。其他邮件草稿功能未改。重新 `--list` 固定 #0～#5；六板预检见 `preflight.{log,md,json}`。
- 本线决定只让主 App 的既有七个 R10 GET 投影出 v1 JSON；WidgetKit 不请求 API、不会持有 Cookie／token，D-01 的 s/m 布局不变。快照以规范化 baseURL＋actor ID 的 SHA-256 为 scope，最多 30 分钟并在本地日界失效。动态人员、秘書来源和活动目标先经既有 actor／href 解析再写；失败源只降对应卡，均不假称零。
- 按 §R19-9 只在 `AuthSessionProvider` 原认证流增加清空钩子：服务器切换、接受新账号、登出、会话拒绝和离线期限退出；根壳另有兜底观察器。没有修改 C 的身份、版本或写入判定。清空失败会记录 `WIDGET_SNAPSHOT_CLEAR_FAILED`，不阻断原认证动作；因此实际 entitlement 缺失时不得声称隐私链通过。

## SC 对照

| SC | 结果 | 操作、证据与未过点 |
| --- | --- | --- |
| 01 开工与事实 | 已核对 | `005230b8b` 上只有 Orbit target、`ios/` 被忽略、原安装包无 App Group；无跟踪 EAS profile／Team 签名。Q5 改稿后 `compare-redesign --list` 六板 #0～#5 不变。`preflight.log` 六板自洽疑点 0、疑似无功能 0，但 token 近似 19、缺 token 70、暗板主题串色 2，未改 A 线 token。 |
| 02 纯快照契约 | 纯模型通过 | 先红后绿的快照／投影／来源／运行时定向测试覆盖 29:59／30:00、本地日界、来源更早到期、坏 JSON／版本、未来时间、跨 actor／baseURL、部分来源失败和排除 Gmail；示例无凭据 JSON 为 `sample-snapshot-v1.json`。真 extension 的同样解析链因 04 未实测。 |
| 03 原生生成 | 编译通过，运行未过 | CNG prebuild 重复执行后 PBX 只有 Orbit＋OrbitWidgets 两 target、一个 embed；双 target 的构建设置和本地签名 entitlement 都含 `group.app.agenthubs.orbit`。Pod autolink 128 pods；extension build #3、宿主 workspace build #5 均 exit 0。生成源均在跟踪的 plugin／module，`ios/` 未提交。带 App Group entitlement 的临时签名包在 D 模拟器安装成功却被 launchd 拒绝启动，见下节。 |
| 04 App Group 生命周期 | **未过** | 带 group 的宿主 `simctl launch` 被 `SBMainWorkspace` 拒绝，`runningboardd` 报 `spawn failed, error=163: Security policy issue`。移除宿主 group 后同一二进制可启动，但 `simctl get_app_container … groups` 为空、原生桥明确报告 `App Group container unavailable`。无 A 写→extension 读、登出／切号／重启真实回读；纯队列测试证明过期写不会重激活旧 scope，不能替代真链。 |
| 05 首页同源 | **部分** | 读取代码仅调用 R10 首页现有 todo/page、schedule-items、contacts summary/page、secretary preview、plans/v2/summary、events/mine；`local-source-projection.json` 用本地 `orbit_line_d` 两个已认证合成 actor 回读：联系人 0／78 与投影一致；计划、活动、秘書为空，今日因 todo 来源含 `not_implemented`／`unavailable` 如实降级。没有 App Home↔共享快照↔Widget 三列真实值，也无有分数／活动的同 actor 实数链。extension 源码没有网络 client。 |
| 06 小尺寸今日／人脈 | **未过实屏** | SwiftUI 已有各自 systemSmall 内容、更新时刻与白名单目标；纯 fixture 验 4 件只保留前三条、最近人最多三位。设计板所示 5 件与实屏未验。无法从模拟器画廊放置，#0/#3 未取 WidgetKit 实屏和点按回执。 |
| 07 中尺寸秘書 | **未过实屏** | Q5 画板已改；投影只保留 R13 的 `event_deadline`／`event_prep`／`event_pick`，拒绝 sample、跨 actor、未知来源，最多两条，不含 Gmail。systemMedium 源码点击受信箱「秘書」；#0/#3 实屏、真实通知数／点击和 API 请求计数仍缺。 |
| 08 大尺寸计划 | **未过实屏** | systemLarge 消费既有 summary，总分不封顶，进度环上限仅锁屏图形；定向 fixture 覆盖 128 分、负 todayDelta，本地合成 actor 的空计划投影为空态。#1/#4、0／46 分真实同源和点击 Task › プラン未过。 |
| 09 锁屏 | **未过实屏** | accessoryCircular／accessoryRectangular 源码用计划分数和最早 registered 活动；活动标题／地点加 `.privacySensitive()`，无活动降级。#2/#5 锁定／解锁、通知外壳、隐私遮盖和目标点击未实测。 |
| 10 深链门禁 | **部分** | Swift `safeURL` 构造限 `/home`、`/task`、`/contacts`、`/inbox`、`/events`；R18b `RootVersionBoundary` 仍挂根壳。D 模拟器从未登录态打开 `orbit:///task?seg=todo` 实际到登录页，截图 `unauthed-task-link.png`。没有真实 widget 点击、已登录冷／热各类或强制更新／维护状态验收；这些不能据根布局代码推定通过。 |
| 11 视觉／可用性 | **未过** | 六张画板预检完成，真实 WidgetKit 画廊为空且 extension XPC 进程退出；没有任何可放置的小组件截图。逐屏 raw／超阈带／缺块均为「未测」，不填 0。Dynamic Type／VoiceOver 与无画板状态也没有可用的 extension 实屏。 |
| 12 全量／交接 | **未过全量门禁** | App 唯一全量为 3,300 tests／3,254 pass／44 fail／2 skip，较主会话基线多 31 个失败名；本线随后将新 native fixture 边界和审计登记修好，最终受影响定向 60/60、类型检查 exit 0，**未按一次上限重跑全量**。原生编译 exit 0；Web 产品源码未改，不触发 Web 全量。正式签名和真机边界见 DEFERRED。 |

## 画板预检与像素账

数据：#0/#3 的今日来自 todo/page＋schedule-items，人脈来自 contacts summary/page，秘書来自合法 secretary preview；#1/#4 的计划来自 plans/v2/summary，#2/#5 的分数与下一场来自 summary 和最早 registered 的 events/mine。板上 5／286／46 等是样例，未拿它们冒充当前 actor 的真实数据。功能：WidgetKit 卡的目标按 §R19-6 白名单，iOS 桌面相机／日历／Dock、锁屏时钟／通知由系统或 R14 负责，不归 R19；六板预检无自洽／无功能警告。token：工具报告近似 19、缺 70、暗板主题串色 2，按 A 线边界保留并交主会话；iOS family 尺寸不从 HTML 的 170／364 像素硬编码。

| 屏幕 ID | 正式画板 | 轮数 | raw / 超阈带 / 缺块 | 结果与归因 |
| --- | --- | ---: | --- | --- |
| A-R19-01 | widgets.html #0 浅，小＋中 | 0 | 未测 / 未测 / 未测 | entitlement／WidgetKit 画廊阻塞，无本体截图；Q5 改稿已入源。 |
| A-R19-02 | #1 浅，大 | 0 | 未测 / 未测 / 未测 | 同上。 |
| A-R19-03 | #2 浅，锁屏 | 0 | 未测 / 未测 / 未测 | 同上；通知为外壳。 |
| A-R19-01D | #3 深，小＋中 | 0 | 未测 / 未测 / 未测 | 同上；Q5 改稿已入源。 |
| A-R19-02D | #4 深，大 | 0 | 未测 / 未测 / 未测 | 同上。 |
| A-R19-03D | #5 深，锁屏 | 0 | 未测 / 未测 / 未测 | 同上。 |

主屏配置、加载、空／少量、过期、离线、权限失败、切号和锁屏遮盖没有画板，均标「设计稿无」；本轮无法放置 widget，因而也没有这些状态的真实截图。未启动第四轮或用空白画廊与正式画板强比。`widget-gallery.png` 是画廊阻塞证据，不是 widget 截图。

## 原生运行诊断与测试

- 证据根目录：`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-d/R19/run-01/`。`prebuild-{2,3,4}.log`、`pod-install-2.log`、`widget-build-3.log`、`host-build-5.log` 记录再生成／编译；`host-entitlements.txt`／`extension-entitlements.txt` 记录两端本地签名声明。`xcrun simctl spawn … pluginkit -m -A` 可列 `app.agenthubs.orbit.widgets(0.1.0)`。
- 带 group 的包安装成功，但 `simctl launch app.agenthubs.orbit` exit 1；系统日志精确错误为 `Launchd job spawn failed`／`Security policy issue (163)`。去掉 host entitlement 后同包启动，Metro 日志有 `WIDGET_SNAPSHOT_CLEAR_FAILED … App Group container unavailable`。extension 去掉 group 后仍被 `chronod` 启动又立即失联，诊断报告 `ExcUserFault_OrbitWidgets-2026-10-20-211952.ips` 为 `EXC_GUARD`／`LIBXPC XPC_EXIT_REASON_FAULT`；系统 widget 画廊同时为空。不能断言只是签名还是系统画廊环境问题，也不能由编译结果推断 extension UI 正确。
- App 定向：快照 3/3、投影 2/2、来源 1/1、运行时 6/6、认证 race 23/23、根壳 1/1，初轮 **36/36**。唯一全量发现新 fixture／审计失败后，最终对受影响四个文件和 widget 来源重跑 **60/60**，`npm run typecheck` 再次 exit 0，日志 `app-targeted-final.log`、`app-typecheck-final.log`。无 group 的宿主能加载本轮 JS，但本地签名造成 Keychain／通知读取警告；无正式登录 widget 运行链。
- App 唯一全量 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`：`app-full.log` 为 **3,300 tests／3,254 pass／44 fail／2 skip／exit 1**。主会话 `_evidence-main/r10fix-app-full.log` 是 3,288／3,272／14／2；按失败名，旧 14 中 13 仍失败、1 项 scroll 通过，新增 **31** 名：通知注册 fixture 15、离线冷启动 fixture 13、根壳性能 fixture 2、读取面审计 1。完整名字在 `app-baseline-failures.txt`、`app-current-failures.txt`。新 native-runtime 导入穿过三个旧测试的假原生边界；新增 GET 有六个未登记，且 To-do 的动态 URL 起初不能被审计识别。`bef3a06cb` 给三个 fixture 加原生存储 mock，把 To-do 请求显式化并登记七个 R19 GET；最后受影响定向 60/60、类型检查 exit 0。**依用户一次全量上限，不做第二次 App 全量；因此 SC-12 仍未过，不能把定向绿追溯成全量新增 0。**
- Web：只修改设计 HTML，未改 `repos/orbits` 产品源码；未运行 Web 全量。Next 3510 和 Metro 8085 均为本线临时服务，已停止；D 模拟器已关机。3000／3400／3500 未触碰。

## 交接与停止边界

| 更新目标 | 本端版本 | 另一端影响 | 未完成事项 | 验证范围 |
| --- | --- | --- | --- | --- |
| `README` RD-31／RD-32、`HANDOFF` R19-01 | `f6497dea1`、`36f6e8281`、`bef3a06cb` | R19 消费 R10 七个读源／D-01 revision；计划分数仍来自 plans/v2/summary；不新增 Web API。 | AppGroup 真链、带有效分数／registered 活动的同 actor 回读、六板像素与最终全量复验。 | 本地纯契约、两个合成 actor 只读投影、原生 Debug 编译及最终定向 60/60；无共享容器运行时，全量原始结果为新增 31 名。 |
| `bridge/status.md`／`bridge/handoffs.md` | 同上 | R18b 根门禁继续由既有根壳裁决，C `AuthSessionProvider` 只加清空钩子；账号写和版本规则不变。 | C 线复核新清空调用；有效签名后重验登出／切号、冷／热深链及强制更新／维护。 | 认证 race 23/23、未登录 task 深链到登录页；没有真实 widget 点击。 |
| `DEFERRED-A`／`screen-ownership` | 同上 | R19 WidgetKit 目标仅为 iOS；Live Activity／灵动岛仍属后期，R14 通知与系统外壳不算本线 widget。 | 真机、正式 App Group 注册／开发者签名、provisioning、TestFlight、EAS 生产构建及任何发布待用户授权。 | 本机临时签名与模拟器构建，不可外推。 |

**待主会话决定：** 是否在这些未过 SC 下暂存本线代码待正式签名与 App 全量复验；本轮没有按定向结果关闭全量门禁。正式 App Group ID／Team 与设备验收只能在用户明确授权后推进。A 线需处理预检的 token 近似／缺失／暗板串色，并补主屏配置及各降级态画板；本线不替 A 修改。C 线需复核认证清空钩子；R10 未闭合的来源业务仍按其 REPORT 保留，不能转写为 R19 通过。

**DEFERRED「待用户授权」：** Apple Developer Portal 的正式 App Group 注册与签名／provisioning、真机、TestFlight、EAS 生产构建、生产配置和部署。本机有效 entitlement 缺失只阻塞真实共享链及其依赖；已授权的纯模型、CNG 生成、编译、同源局部读和失败诊断已做到可复核。未进行 push。
