# Sprint R19 — iOS 主屏／锁屏小组件执行报告

**状态：部分完成；SC-R19-04／06～11 的真实共享容器与 WidgetKit 实屏仍待正式签名。** D 线已实现快照投影、账号清空、Expo 再生成的 WidgetKit extension 和六种 family，原生宿主与 extension 均编译成功。主会话代定 §R19-10 后，默认构建不注入 extension／App Group；默认宿主在 D 模拟器可启动，但本机临时签名的 Keychain 错误使登录回读未完成。§R19-11 的 SwiftUI 局部渲染已进行三轮、12 项均未过像素门禁；它不是 WidgetKit 实屏。§R19-12 的第二次 App 全量按失败名与主会话基线比对，新增 0。下文保留初轮诊断，复核结果以「主会话代定收口」节为准。

## 版本、边界与自定决定

- 开工 `git pull --rebase origin redesign` 后基线为 `005230b8b`；本线源码提交 `f6497dea1`（v1 快照、投影、Q5 画板）、`36f6e8281`（CNG 插件、桥接、生命周期、六种 WidgetKit family）、`bef3a06cb`（显式登记七个读取面、隔离原生测试边界）和 `b1673fa01`（默认关闭、原生缺失 no-op、视觉修正），均带要求的 Codex trailer。收口前再次 `git pull --rebase origin redesign` 时已是最新。未 push、未部署，未连接 Neon／生产。仅在 D 线生成被忽略的 `repos/orbit-app/ios/` 和外部 `_evidence-d/R19/run-01/` 证据；既有未跟踪 `HANDOFF-CLAUDE-2026-10-19.md` 保留原样。
- 按已批准 §R19-8，`widgets.html` 中尺寸秘書在浅／深 #0/#3 都由原来的 **期限＋Gmail 邮件摘要＋推荐** 改为 **期限＋推荐**，件数 3→2，并更新空态／库描述。理由是 Q5 已排除首页 Gmail 正文。其他邮件草稿功能未改。重新 `--list` 固定 #0～#5；六板预检见 `preflight.{log,md,json}`。
- 本线决定只让主 App 的既有七个 R10 GET 投影出 v1 JSON；WidgetKit 不请求 API、不会持有 Cookie／token，D-01 的 s/m 布局不变。快照以规范化 baseURL＋actor ID 的 SHA-256 为 scope，最多 30 分钟并在本地日界失效。动态人员、秘書来源和活动目标先经既有 actor／href 解析再写；失败源只降对应卡，均不假称零。
- 按 §R19-9 只在 `AuthSessionProvider` 原认证流增加清空钩子：服务器切换、接受新账号、登出、会话拒绝和离线期限退出；根壳另有兜底观察器。没有修改 C 的身份、版本或写入判定。清空失败会记录 `WIDGET_SNAPSHOT_CLEAR_FAILED`，不阻断原认证动作；因此实际 entitlement 缺失时不得声称隐私链通过。

## SC 对照

| SC | 结果 | 操作、证据与未过点 |
| --- | --- | --- |
| 01 开工与事实 | 已核对 | `005230b8b` 上只有 Orbit target、`ios/` 被忽略、原安装包无 App Group；无跟踪 EAS profile／Team 签名。Q5 改稿后 `compare-redesign --list` 六板 #0～#5 不变。`preflight.log` 六板自洽疑点 0、疑似无功能 0，但 token 近似 19、缺 token 70、暗板主题串色 2，未改 A 线 token。 |
| 02 纯快照契约 | 纯模型通过 | 先红后绿的快照／投影／来源／运行时定向测试覆盖 29:59／30:00、本地日界、来源更早到期、坏 JSON／版本、未来时间、跨 actor／baseURL、部分来源失败和排除 Gmail；示例无凭据 JSON 为 `sample-snapshot-v1.json`。真 extension 的同样解析链因 04 未实测。 |
| 03 原生生成 | 双模式构建通过 | `ORBIT_ENABLE_WIDGETS=1` 的 CNG prebuild 生成 Orbit＋OrbitWidgets 两 target、一个 embed；双 target 含 `group.app.agenthubs.orbit`，extension build #3、宿主 build #5 exit 0。默认关闭模式重新 `prebuild --clean` 后只有 Orbit target、无 group，128 pods 与宿主 workspace build 均 exit 0，包内无 `PlugIns`；源文件留在 plugin／module，`ios/` 未提交。启用模式的临时签名包仍被 launchd 拒绝。 |
| 04 App Group 生命周期 | **未过** | 带 group 的宿主 `simctl launch` 被 `SBMainWorkspace` 拒绝，`runningboardd` 报 `spawn failed, error=163: Security policy issue`。移除宿主 group 后同一二进制可启动，但 `simctl get_app_container … groups` 为空、原生桥明确报告 `App Group container unavailable`。无 A 写→extension 读、登出／切号／重启真实回读；纯队列测试证明过期写不会重激活旧 scope，不能替代真链。 |
| 05 首页同源 | **部分** | 读取代码仅调用 R10 首页现有 todo/page、schedule-items、contacts summary/page、secretary preview、plans/v2/summary、events/mine；`local-source-projection.json` 用本地 `orbit_line_d` 两个已认证合成 actor 回读：联系人 0／78 与投影一致；计划、活动、秘書为空，今日因 todo 来源含 `not_implemented`／`unavailable` 如实降级。没有 App Home↔共享快照↔Widget 三列真实值，也无有分数／活动的同 actor 实数链。extension 源码没有网络 client。 |
| 06 小尺寸今日／人脈 | **未过实屏** | SwiftUI 已有各自 systemSmall 内容、更新时刻与白名单目标；纯 fixture 验 4 件只保留前三条、最近人最多三位。设计板所示 5 件与实屏未验。无法从模拟器画廊放置，#0/#3 未取 WidgetKit 实屏和点按回执。 |
| 07 中尺寸秘書 | **未过实屏** | Q5 画板已改；投影只保留 R13 的 `event_deadline`／`event_prep`／`event_pick`，拒绝 sample、跨 actor、未知来源，最多两条，不含 Gmail。systemMedium 源码点击受信箱「秘書」；#0/#3 实屏、真实通知数／点击和 API 请求计数仍缺。 |
| 08 大尺寸计划 | **未过实屏** | systemLarge 消费既有 summary，总分不封顶，进度环上限仅锁屏图形；定向 fixture 覆盖 128 分、负 todayDelta，本地合成 actor 的空计划投影为空态。#1/#4、0／46 分真实同源和点击 Task › プラン未过。 |
| 09 锁屏 | **未过实屏** | accessoryCircular／accessoryRectangular 源码用计划分数和最早 registered 活动；活动标题／地点加 `.privacySensitive()`，无活动降级。#2/#5 锁定／解锁、通知外壳、隐私遮盖和目标点击未实测。 |
| 10 深链门禁 | **部分** | Swift `safeURL` 构造限 `/home`、`/task`、`/contacts`、`/inbox`、`/events`；R18b `RootVersionBoundary` 仍挂根壳。D 模拟器从未登录态打开 `orbit:///task?seg=todo` 实际到登录页，截图 `unauthed-task-link.png`。没有真实 widget 点击、已登录冷／热各类或强制更新／维护状态验收；这些不能据根布局代码推定通过。 |
| 11 视觉／可用性 | **未过** | 六张画板预检完成；主会话代定 §R19-11 的 SwiftUI ImageRenderer 六 family × 浅深 12 图和三轮 compare-redesign 均有证据，最终仍 12/12 FAIL。真实 WidgetKit 画廊为空且 extension XPC 进程退出，没有可放置小组件截图；局部 PNG 不替代实屏。Dynamic Type／VoiceOver 与无画板状态仍未实测。 |
| 12 全量／交接 | 本线新增失败 0；报告已更新 | §R19-12 第二次 App 全量 3,303 tests／3,288 pass／13 fail／2 skip；对主会话基线 14 个失败名，本线新增 0、已有 1 项转绿。初轮 44 fail 的新 fixture／审计问题已修复。App 类型检查和 iOS Swift typecheck exit 0；Web 产品源码未改，不触发 Web 全量。真实共享链相关 SC 仍待正式签名。 |

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
- App 定向：快照 3/3、投影 2/2、来源 1/1、运行时 6/6、认证 race 23/23、根壳 1/1，初轮 **36/36**。初轮全量发现新 fixture／审计失败后，对受影响四个文件和 widget 来源重跑 **60/60**，`npm run typecheck` 再次 exit 0，日志 `app-targeted-final.log`、`app-typecheck-final.log`。无 group 的宿主能加载本轮 JS，但本地签名造成 Keychain／通知读取警告；无正式登录 widget 运行链。
- App 初轮全量 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`：`app-full.log` 为 **3,300 tests／3,254 pass／44 fail／2 skip／exit 1**。主会话 `_evidence-main/r10fix-app-full.log` 是 3,288／3,272／14／2；初轮按失败名新增 **31** 名：通知注册 fixture 15、离线冷启动 fixture 13、根壳性能 fixture 2、读取面审计 1。完整名字在 `app-baseline-failures.txt`、`app-current-failures.txt`。新 native-runtime 导入穿过三个旧测试的假原生边界；新增 GET 有六个未登记，且 To-do 的动态 URL 起初不能被审计识别。`bef3a06cb` 给三个 fixture 加原生存储 mock，把 To-do 请求显式化并登记七个 R19 GET；随后受影响定向 60/60、类型检查 exit 0。初轮的一次全量上限已遵守；主会话随后另行授权 §R19-12 再跑一次，其最终结果见下节。
- Web：只修改设计 HTML，未改 `repos/orbits` 产品源码；未运行 Web 全量。Next 3510 和 Metro 8085 均为本线临时服务，已停止；D 模拟器已关机。3000／3400／3500 未触碰。

## 主会话代定收口：§R19-10～12

### §R19-10 默认关闭与登录回读

- `b1673fa01` 让 `ORBIT_ENABLE_WIDGETS=1` 才注册 `with-orbit-widgetkit`；缺省及 `0` 均关闭，Expo `extra.widgetkitEnabled` 同步反映该值。`widget-native-config.test.ts` 断言三个配置。JS 原生模块不存在或 `containerAvailable()` 为 false 时，activate／write／clear 返回 no-op，单次 JS 运行只记一次 `WIDGET_NATIVE_UNAVAILABLE`，不抛错干扰认证；运行时测试覆盖缺桥、缺容器、日志抛错和既有切号竞态。
- D 模拟器上的**默认关闭**实验：`prebuild-default-off.log` 显示 clean prebuild exit 0；生成 PBX 仅 Orbit 一个 target、无 OrbitWidgets／App Group，`pod-install-default-off.log` 为 128 pods；`host-build-default-off.log` 为 `BUILD SUCCEEDED`，`Orbit.app` 无 `PlugIns`。无 group 的临时签名包安装、启动成功，Metro 能加载 JS；模拟器截图 `app-default-login-form.png`。本地合成账号提交得到 `POST /api/auth/mobile/credentials 200`，随后 `GET /api/auth/session`／`GET /api/account/me` 也为 200。其后系统 `ERR_NOTIFICATIONS_KEYCHAIN_ACCESS` 与 `ERR_KEY_CHAIN` 导致自动退出到登录页，**已登录 Home／快照回读未完成**。更换本地临时签名未解决，不能据 API 200 宣称登录全链通过；没有修改认证逻辑。`WIDGET_NATIVE_UNAVAILABLE` 在每次 JS 重载只出现一次，其他 Keychain 警告另计。
- 启用仍待 Apple Developer Portal App Group、Team 和相应 provisioning／签名；不在默认构建上暗中启用，也未触碰正式账号或环境。

### §R19-11 ImageRenderer 与 XPC 限时复核

- 12:47～12:52 UTC 的 `xpc-recheck.md` 复读两份 `ExcUserFault_OrbitWidgets`：两次都是 `EXC_GUARD`／`LIBXPC XPC_EXIT_REASON_FAULT` reason 9，线程栈在 `_XPC_MISUSE_FAULT` → `xpc_connection_copy_bundle_id` → BoardServices peer setup，没有 Orbit Swift 或 `containerURL` 帧；去掉 group 的 extension 也同签名。证据**不支持**“容器缺失直接崩溃”的归因，确切原因仍未知。生产 `SnapshotReader.load` 已在 `containerURL == nil` 时返回 `.empty`，没有根据不足的崩溃补丁。正式签名后的运行时仍需重验。
- 12:45～13:09 UTC 内以生产 `OrbitWidgetView`、合成 v1 快照渲染六 family × 浅深 12 PNG；macOS harness 只替换不支持的 accessory family 枚举并模拟系统内边距／背景，PNG 为 170²、364×170、364×382、72²、160×72。`render-fixture-v2.json` 经生产 `readWidgetSnapshot` 验证，有 7 个计划 segment、总分 46，不含凭据。`render-crops-suite.json`（第 1 轮）、`render-crops-suite-round2.json`、`render-crops-suite-round3.json` 与三轮各自 `render-compare-roundN/summary.json`、triptych 留在证据目录。三轮均运行 `compare-redesign`；第 3 轮最终 **12/12 FAIL**，没有第 4 轮。后两轮修正深色文字，补计划图例／人物类型行；第 3 轮同时将合成 segment 对齐画板示例。局部渲染中人物 Link 出现禁用图形、锁屏背景与 iOS 外壳不同，故这些像素不能外推为 iOS 实屏。

| 局部画面（widgets.html 板号） | 第 3 轮 raw | 超阈带 | 缺块 | 门禁 |
| --- | ---: | ---: | ---: | --- |
| 今日 浅（#0） | 0.2031 | 5 | 1 | FAIL |
| 人脈 浅（#0） | 0.2734 | 6 | 1 | FAIL |
| 秘書 浅（#0） | 0.1388 | 5 | 1 | FAIL |
| 计划 浅（#1） | 0.1244 | 11 | 10 | FAIL |
| 分数锁屏 浅（#2） | 0.8900 | 3 | 0 | FAIL |
| 活动锁屏 浅（#2） | 0.5840 | 3 | 2 | FAIL |
| 今日 深（#3） | 0.7943 | 6 | 1 | FAIL |
| 人脈 深（#3） | 0.4050 | 6 | 1 | FAIL |
| 秘書 深（#3） | 0.4533 | 6 | 1 | FAIL |
| 计划 深（#4） | 0.4681 | 13 | 9 | FAIL |
| 分数锁屏 深（#5） | 0.9051 | 3 | 1 | FAIL |
| 活动锁屏 深（#5） | 0.9838 | 3 | 1 | FAIL |

上述是**裁去系统主屏／锁屏外壳的 fixture 局部比较**；上文六屏正式 WidgetKit 实屏栏仍为「未测」，SC-06～11 不能因 fixture 存在而通过。Swift harness 编译／运行 exit 0，生产 extension 源 `widget-ios-typecheck-final.log` iOS simulator typecheck exit 0。

### §R19-12 App 全量与本线结论

主会话另行授权后，用 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` 和 `heavy.sh d` **再跑一次** App 全量：`app-full-default-off-final.log` 为 3,303 tests／3,288 pass／13 fail／2 skip／exit 1。`app-final-failure-comparison.{json,md}` 以**失败用例名**对照 `_evidence-main/r10fix-app-full.log`：基线 14、当前 13、**新增 0**、已转绿 1（`a stale native scroll event during restore cannot erase the Home position`）；其余 13 均是基线旧失败。§R19-12 的本线新增失败门禁满足，不能写成“全量通过”。默认关闭的 App 类型检查 exit 0，Web 产品源码未改所以未跑 Web 全量。

收尾仅删除本轮外部证据目录下自建的 `DerivedData`（68 MB）和 `HostDerivedData`（5.1 GB），保留日志、fixture、PNG 与三轮差异图；两目录已核实不存在。Next 3510／Metro 8085 均无监听进程，D 模拟器 `3E4102CA-9714-4F37-AB7B-570D1E97E3EB` 为 Shutdown；3000／3400／3500 未触碰。既有未跟踪 `HANDOFF-CLAUDE-2026-10-19.md` 未修改。

## 复核修复：主会话代定 §R19-13～14

- **S1 清空失败。** 原生 `clear()` 现在先删除 `active-scope-v1`，再删除 `active-snapshot-v1.json` 与授权 scope；任一步失败就写独立的 `revoked-v1` 墓碑，墓碑写失败时以原位 truncate 把既有快照清空。扩展读到墓碑或缺少 active 指针立即返回空态；原生 `activate`／`write` 也拒绝墓碑状态。成功重试清空才删除墓碑。JS 清空失败保留 `WIDGET_SNAPSHOT_CLEAR_FAILED` 诊断且返回 `false`，认证仍继续；根壳在下次 App 启动的未就绪态再次调用清空，激活路径在写新账号前也先清空。mock 原生首轮失败、重建 runtime 后重试的测试通过；Swift 读侧用有效快照、墓碑、缺指针三态单测通过。真实 App Group 与签名仍缺，不能用单测代替登出实屏回读。若容器同时拒绝墓碑写入与快照截断，原生会抛错并记录诊断，这个操作系统级写入故障仍需现场处理。
- **M1 默认自动链接。** `ORBIT_ENABLE_WIDGETS` 非 `1` 时配置插件把生成的 Podfile 改为 `use_expo_modules!(exclude: ['orbit-widget-snapshot'])`；显式 `1` 时保留原生链接。`run-02/prebuild-default-off.log` exit 0，生成 Podfile 第 28 行含 exclude；`pod-install-default-off.log` exit 0，为 **124 个 Podfile 依赖／127 个 Pod**，`Podfile.lock` 和 Expo autolinking JSON 均无 OrbitWidgetSnapshot。此前 §R19-10 默认构建是 125／128，差额恰为桥接 Pod。`005230b8b` 的 App `package.json`／锁文件与当前无 diff，旧树没有此模块；该提交没有跟踪 `ios/Podfile.lock`，故不能给出旧锁文件逐行比对。默认模块集在现有依赖下与旧树一致；JS 缺桥 no-op 的测试继续通过。证据在 `_evidence-d/R19/run-02/`。
- **M2/M3。** 秘書投影透传现有 preview `hasMore`，快照字段向后兼容，Swift 件数显示 `N+件`；定向测试 `hasMore=true` 通过。锁屏分数字体加 `.privacySensitive()`；Swift 读侧单测及原生 store 源片段 typecheck exit 0。正式锁屏隐私外观仍未实测。
- **m1 来源有效期。** 这七个现有 R10 GET 的整体响应契约没有给可复用的 `expiresAt`／TTL；秘書通知单条有效期不能代表整个投影的有效期。因此 SC02 的「来源更早到期」仅指 `buildWidgetSnapshot` 纯 helper 输入的测试，生产读取器目前没有传 `sourceExpiresAt`。线上快照仍按生成时起最多 30 分钟、本地日界失效；不能声称它已按来源提前过期。
- **验证。** `node --test --import tsx` 三个定向文件 **13/13**，`sh tests/run-widget-reader-tombstone.sh` PASS，App `npm run typecheck` exit 0，`git diff --check` exit 0；Web 产品源码本节未改。后续 R28 收口会再跑两端类型检查及获授权的一次 App 全量，以最终结果为准。

## 交接与停止边界

| 更新目标 | 本端版本 | 另一端影响 | 未完成事项 | 验证范围 |
| --- | --- | --- | --- | --- |
| `README` RD-31／RD-32、`HANDOFF` R19-01 | `f6497dea1`、`36f6e8281`、`bef3a06cb`、`b1673fa01` | R19 消费 R10 七个读源／D-01 revision；计划分数仍来自 plans/v2/summary；不新增 Web API；默认关闭 WidgetKit。 | App Group 真链、带有效分数／registered 活动的同 actor 回读、六板 WidgetKit 实屏与 12 项局部像素差。 | 本地纯契约、两个合成 actor 只读投影、双模式生成／编译、SwiftUI fixture 三轮；最终 App 全量对基线新增失败 0。 |
| `bridge/status.md`／`bridge/handoffs.md` | 同上 | R18b 根门禁继续由既有根壳裁决，C `AuthSessionProvider` 只加清空钩子；账号写和版本规则不变。 | C 线复核新清空调用；有效签名后重验登录／登出／切号、冷／热深链及强制更新／维护。 | 认证 race 23/23、未登录 task 深链到登录页；默认无 group 包可启动，临时签名 Keychain 错误使登录回读未完成；没有真实 widget 点击。 |
| `DEFERRED-A`／`screen-ownership` | 同上 | R19 WidgetKit 目标仅为 iOS；Live Activity／灵动岛仍属后期，R14 通知与系统外壳不算本线 widget。 | 真机、正式 App Group 注册／开发者签名、provisioning、TestFlight、EAS 生产构建及任何发布待用户授权。 | 本机临时签名与模拟器构建、ImageRenderer 局部图不能外推为正式发布效果。 |

**待主会话决定：** 12 项局部像素差的产品取舍、A 线 token 近似／缺失／暗板串色与主屏配置及各降级态画板由主会话／A 线决定；本线不替 A 修改。C 线复核认证清空钩子与临时签名 Keychain 失败的登录边界。正式 App Group ID／Team 与设备验收只能在用户明确授权后推进；R10 未闭合的来源业务仍按其 REPORT 保留，不能转写为 R19 通过。

**DEFERRED「待用户授权」：** Apple Developer Portal 的正式 App Group 注册与签名／provisioning、真机、TestFlight、EAS 生产构建、生产配置和部署。本机有效 entitlement 缺失阻塞真实共享链及其依赖；已授权的纯模型、默认／启用两种 CNG 生成与编译、同源局部读、三轮 fixture 视觉账和 App 全量按名比对已做到可复核。未进行 push。
