# Sprint R19 — iOS 主屏小组件与锁屏 WidgetKit

**Plan revision:** 0（2026-10-20，待主会话审阅）。**模式：** existing-codebase / single-generator。**档位：** H。**执行：** D 线 /Volumes/ORICO/Dev/worktrees/orbit/redesign-d（line-d），R10 后。事实基线为 origin/redesign@2151f7839；实施前重新核对远端与签名环境。**本轮只提交 GOAL / PLANNER，不写产品代码、不构建或发布。**

**单一目标：** App 将 R10 已有首页数据写入账号隔离的 App Group 快照，WidgetKit extension 只读该快照，在 iOS 主屏／锁屏显示设计稿已有尺寸，并让点击经 R18b 根级门禁进入正确页面。验收按 §8；本文件是待审执行契约，不是完成报告。

## 0. 给 Codex 的执行说明

1. **工作树与提交。** 仅在 D 线 worktree；开工先看未提交文件，git pull --rebase origin redesign，记录 HEAD、App／Web 测试基线、Xcode 与模拟器状态。按路径小步提交并在提交信息结尾加 Co-Authored-By: Codex <noreply@openai.com>；不 push。主会话独立复核后集成。本草案获主会话审阅前不进入实现。
2. **先读与优先级。** 读本目录 GOAL、R10 PLANNER / REPORT、HANDOFF R19-01、IMPLEMENTATION-PLAN §1.10 / D-24 / Q9、R18b REPORT 的版本门禁交接、README 的 RD-16 / RD-24 / RD-31 / RD-32、HOW-TO §0–§10、两端 AGENTS 与 bridge/status.md / bridge/handoffs.md。新冲突按「数据自洽 → 已定规则 → 较新画板 → 惯例」处理；需要产品决定的写 REPORT「待主会话决定」，继续独立项。用户明确禁止 GitNexus，本 Sprint 不运行。
3. **本地基线。** 沿 D 线 Web 3510、Metro 8085、隔离库 orbit_line_d、Orbit Line D 模拟器；本 Sprint 无新服务端 API，只有需要同 actor 来源比对时才启动 Web。设计稿可用 file: design-base 跑 compare-redesign.mjs --list；如工具需要 HTTP，用本会话独占 3350 以上端口与 uv 环境。绝不碰 3000 / 3500 / 3400，也不连接 Neon / 生产。
4. **先查原生能力。** 以被跟踪的 app.config.ts、plugins/、modules/ 为再生成来源；ios/ 是被忽略的本机 prebuild 产物，不能只手改它。先用 xcodebuild -list、生成前后 PBX target/entitlement 差异、codesign -d 与 FileManager.containerURL 的实际结果确认模拟器能力，不能从“编译通过”推断共享容器可读。[Expo config plugin 文档](https://docs.expo.dev/config-plugins/introduction/)说明 prebuild 配置应由插件重建。
5. **开发与测试。** 先写快照投影／解析／隔离／过期／深链的失败测试，再做最小实现；插件必须重复 prebuild 两次仍只有一个 extension target。App 类型检查、定向／全量、原生模拟器编译与实屏证据分开记录。orbits 如需跑测试，设置 LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8。本轮文档阶段不跑产品测试。
6. **证据、像素与停止。** 用 compare-redesign --list 的 §7 序号固定画板，先预检数据、功能、token、自洽和系统外壳，再做浅深截图。每张最多三轮；记录 raw、超阈带、结构缺块及归因，未过不记完成。没有画板的状态附真实截图写「设计稿无」。App Group entitlement 在模拟器不可用时按 §10 替代验证，真实 App→extension 共享链保持未过，继续不依赖该链的工作。最终 REPORT 列逐条 SC、测试、画板、授权、Bridge 四栏与未完原因。
7. **外部边界。** 本线只做本机模拟器构建、WidgetKit Preview 和模拟器桌面验证；真机、Apple Developer Portal 正式 App Group 注册／签名、TestFlight、EAS 生产构建、生产配置和部署一律 DEFERRED「待用户授权」。不把本机 ad hoc 签名或 Preview 当成发布证据。完成后停掉自己启动的 Metro、dev server 和模拟器。

## 1. 本线归属的文件 / 不许碰的文件

RD-31 / RD-32 的较新 D 线分工为 Task → 首页 → 小组件；IMPLEMENTATION-PLAN:53 的旧「线 B：App 原生能力」是旧分工。R19 执行时 D 线在以下新增和窄接线范围内工作；跨 C 线会话核心先取得交接，缺交接只阻塞清空链。

| 作用 | 候选路径与编辑边界 |
| --- | --- |
| WidgetKit 生成源 | repos/orbit-app/app.config.ts 只注册 R19 插件；新建 repos/orbit-app/plugins/with-orbit-widgetkit.js 与 plugins/widgetkit/**（SwiftUI extension 模板、Info/entitlements）。插件生成 target、embed、Bundle ID 与双 target entitlement；反复 prebuild 不重复插入。生成后的 ios/ 只用于本机验证，不提交。 |
| App 写入桥与快照 | 新建 repos/orbit-app/modules/orbit-widget-snapshot/** 原生桥、repos/orbit-app/src/widgets/** 投影／快照解析／写入协调、对应测试与三语词条。原生桥只处理 App Group 文件与 WidgetCenter timeline reload；不包含 API 凭据或业务规则。 |
| R10 读模型窄接线 | repos/orbit-app/src/screens/home/** 只调用现有首页数据源／布局回执并投影快照；必要时把可复用读模型提取到该目录的小模块，不改服务端 plans/events/todo/guide 的计算、写接口或契约。 |
| 账号与深链 | repos/orbit-app/app/_layout.tsx 的 D 壳可挂签入状态观察器；src/screens/home/home-target.ts 及新 src/widgets/widget-links.ts 仅白名单映射。登出前清空若必须改 src/api/AuthSessionProvider.tsx，向 C 线请求单点接线或释放；不能由每个登出按钮各写一遍。 |
| 门禁与门禁清单 | 新建本目录 REPORT / preflight、repos/orbits/scripts/visual/views/app-R19.json 与归因文件；不改 compare 工具。 |

**不许碰：** A 线 kit、token、图标生成源和视觉工具；B 线联系人／秘書生产者及受信箱；C 线 R18b 版本判定策略和账号写规则（除获交接的清空钩子）；甲线计划／活动服务；E 线 iOrbit；R10 的 D-01 服务端持久化规则。不得把 WidgetKit 状态写进 D-01 的 s/m 数组，也不得增加 WidgetKit 直接请求 API 的凭据或权限。README、HANDOFF、DEFERRED-A、screen-ownership 等共享台账给主会话四栏草案，不覆盖其他线未提交版本。

## 2. 主会话代定（数据自洽 → 已定规则 → 新画板 → 惯例）

| 编号 | 定案与理由 | 验证 / 转出 |
| --- | --- | --- |
| 主会话代定 §R19-1 数据单源 | extension 只读 App 写出的 R10 首页读模型／D-01 布局响应的投影；App 可重用 R10 已调用的 todo/page、联系人汇总、秘書预览、计划 summary 和活动选择结果，但 WidgetKit 不复制计划计分、活动 registered 筛选、To-do/guide 聚合规则，也不直接带 Cookie/token 请求 API。HANDOFF R19-01 的“同一接口 plans/v2/summary”指 App 侧与首页同源。 | SC-02 / 05；同 actor Home↔小组件值相等，extension 网络调用与凭据均为 0。 |
| 主会话代定 §R19-2 共享与隔离 | App Group 本机候选 ID 为 group.app.agenthubs.orbit；正式标识与注册待授权。共享快照 v1 含 scopeHash（规范化 API base + actor ID 的摘要）、generatedAt、expiresAt、lastUpdatedAt、来源状态和仅展示所需字段，不存原始 actor、Cookie、token 或完整响应。App 原子替换文件，再请求 timeline reload；extension 校验版本、active scope、时间和字段后读。登出／切号先清空 active 指针与旧快照，确认后才允许新账号写入；会话失效也清空。 | SC-02 / 04 / 11；A→登出→B、换 baseURL、损坏文件、写一半、进程重启实测。 |
| 主会话代定 §R19-3 过期与状态 | 快照最长 30 分钟，跨账号本地日界或更早的来源有效期时提前过期；每种有内容的 widget 都显示“上次更新”。过期不继续把旧数字／人员／活动称为当前，改为“打开 Orbit 更新”加上次更新时间；无快照与不可用均明确降级。WidgetKit 刷新时间由系统调度，App 前台恢复及 R10 读源更新时主动重写／请求刷新，不能保证准点后台更新。 | SC-02 / 05 / 11；固定时钟测 29:59 / 30:00、日界、离线和失败。 |
| 主会话代定 §R19-4 尺寸与布局 | 只做 widgets.html 已渲染的主屏小（今日、人脈）、中（秘書）、大（プラン スコア）及锁屏圆形分数／矩形活动，浅深各一组。D-01 的 s/m 是 App/Web 首页卡尺寸，不新增大尺寸服务端字段；iOS 摆放归系统，WidgetKit 类型按既有 R10 key 与读模型选内容。无画板的配置 UI、新尺寸或复杂点击态不以现有板冒充。 | SC-03 / 06～09 / 11；§7 六板与「设计稿无」清单。 |
| 主会话代定 §R19-5 Q5 冲突 | widgets.html:210-211,234 的中尺寸秘書仍画 Gmail 邮件摘要；R10 REPORT 与已定 Q5 已从首页 App/Web 画板删该行。按数据自洽和已定规则，R19 只显示 R13 合法期限／会前准备／推荐，不读 Gmail 正文；本轮不改设计源。执行前请主会话按 Q5 更新 widgets.html 的中尺寸画板并重新 --list／预检；更新前含该行的 #0/#3 不能记像素通过。 | SC-07 / 11；向主会话交明确改稿请求，不把邮件行归因成数据差异。 |
| 主会话代定 §R19-6 点击与版本门禁 | 每种 widget 生成白名单 orbit 深链：今日→/task?seg=todo，人脈→/contacts 或经已授权 ID 到 /contacts/:id，秘書→/inbox?filter=secretary，计划→/task?seg=plan，活动→R10 返回的安全 App href。冷启动和热启动都经过 app/_layout.tsx 的 R18b RootVersionGate；强制更新／维护时不呈目标内容，未登录进既有认证流程。无可验证目标退回相应一级页。 | SC-10；强制更新、维护、离线、未登录和恶意/未知 URL 测试。 |
| 主会话代定 §R19-7 原生／发布边界 | 本期 WidgetKit，不含 IMPLEMENTATION-PLAN D-24 所并列的 Live Activity／灵动岛（Q9 放后期）及远程推送更新。只在模拟器试 App Group；真机和正式 App Group 配置／签名、TestFlight、EAS 生产构建待用户授权。锁屏内容按隐私敏感处理，人员与秘書详情不得在未解锁时无条件明文展示。 | SC-01 / 09 / 12；DEFERRED 明列授权，锁屏隐私回归。 |

## 3. 交接条目与依赖映射

| 来源 | 本 Sprint 落点 | SC |
| --- | --- | --- |
| HANDOFF R19-01 | 计划分数与首页的 plans/v2/summary 同源，经 App 的 R10 投影写快照；不让 extension 直调接口。 | 02、05、08 |
| IMPLEMENTATION-PLAN §1.10 / D-24 | 新 WidgetKit extension、App Group、主 App 写／extension 只读；Live Activity 按 Q9 后期。 | 03、04、06～09、12 |
| R10 REPORT「给 R19」 | 用已验证的首页读模型／D-01；R10 未闭合的卡片业务、SC-15 像素不能转写为 R19 已验。 | 01、05、11、12 |
| R18b 全局门禁 | 现有根壳已在 app/_layout.tsx 挂 RootVersionGate；每条 widget 冷／热深链均需通过它。 | 10 |
| Q5 与 widgets.html | 中尺寸原邮件摘要与定案冲突，改稿后才比 #0/#3；其余画板可先做。 | 07、11 |

## 4. 已查清的事实（行号对应 2151f7839；本机产物另标）

1. **Expo / prebuild：** repos/orbit-app/package.json:5,7,10,20-21,34-37 以 expo-router/entry、expo start / expo run:ios、Expo 57 为入口；app.config.ts:14-29 注册 config plugins，plugins/with-ios-build-settings.js:3,8-29 使用 Expo mods。repos/orbit-app/.gitignore:6 忽略 ios/；git ls-files repos/orbit-app/ios 为空。本机确有 ios/Orbit.xcodeproj 与 Podfile，但它是未跟踪的生成产物，不是可提交原生来源。[Expo CNG 说明](https://docs.expo.dev/workflow/customizing/)支持用插件再生成 native project。
2. **当前 target / bundle：** app.config.ts:30-32 固定 iOS bundleIdentifier app.agenthubs.orbit；本机 ios/Orbit.xcodeproj/project.pbxproj:137-160 只有 Orbit 一个 PBXNativeTarget，xcodebuild -list 只列 Orbit target/scheme。extension 尚不存在。本机 project.pbxproj:358,379,395,411 使用 Orbit.entitlements 与同一 Bundle ID。
3. **签名实测：** 本机 Debug iphonesimulator 的 xcodebuild -showBuildSettings 得 CODE_SIGNING_ALLOWED=YES、CODE_SIGN_IDENTITY=-；D 线模拟器已安装 Orbit.app 经 codesign -dv 显示 Signature=adhoc、TeamIdentifier=not set，bundle 为 app.agenthubs.orbit。它是已签名的本地模拟器产物，**不是** Apple 开发者签名；codesign -d --entitlements - 仅见空字典。此结论只限该已安装产物，不能推断新 WidgetKit target 的 entitlement 能否在模拟器生效。
4. **App Group / 本地存储：** 本机 ios/Orbit/Orbit.entitlements:4-7 只有 aps-environment=development；app.config.ts:14-41 与现有插件无 App Group 配置，精确搜索无 application-groups / suiteName 的 R19 实现。R10 的 src/screens/home/home-layout-storage.ts:1,23-28,47-52 用 AsyncStorage，按 actor+baseURL 存 D-01 草稿；它不是 App Group 共享容器。Apple 的 [App Groups entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.application-groups)要求两个进程声明同一 group；[containerURL](https://developer.apple.com/documentation/foundation/filemanager/containerurl%28forsecurityapplicationgroupidentifier%3A%29) 在 iOS 对无效 ID 可返回 nil，必须实测。
5. **EAS：** app.config.ts:45-49 仅从 EXPO_PUBLIC_EAS_PROJECT_ID 注入可选 easProjectId；仓库没有被跟踪的 repos/orbit-app/eas.json，也没有本 Sprint 可用的 build profile。不能把环境变量占位当成 EAS 生产构建配置；R19 不创建生产 profile。
6. **首页来源：** src/screens/home/HomeWidgetsScreen.tsx:50-58 按 actor+baseURL 挂 HomeWorkspace 并读取 D-01；HomeWidgetCards.tsx:60-83 用 todo/page 与 schedule 读今日，:91-99 读 plan summary，:102-109 选 registered 活动，:113-131 读联系人 summary/page 与秘書预览。R10 REPORT:131 明确 R19 只消费这套读模型，且部分卡业务验收未闭合。
7. **账号与门禁：** app/_layout.tsx:125-150 的 RootVersionBoundary 按 pathname、actor、auth ready、baseURL 设 scopeKey；src/components/RootVersionGate.tsx:18-29 在判定前隐藏目标并显示检查态。src/api/AuthSessionProvider.tsx:647-709 是登出主链，:802-805 也有会话清理；R19 必须在这些状态变化中清共享快照，不能只监听首页卸载。现有首页目标白名单 src/screens/home/home-target.ts:4-18，可复用。
8. **需求与画板：** IMPLEMENTATION-PLAN.md:245,569-572 要 WidgetKit + App Group；:740 的 Q9 将 Live Activity 放下一期。HANDOFF-TO-FEATURE-SPRINTS.md:166-170 只有 R19-01 计划分数；R10 REPORT.md:131 给同源约束。widgets.html:127-128,205-237 有小／中／大、锁屏圆／矩形及浅深；:210-211,234 的 Gmail 示例与 Q5 冲突。b12-missing-states.html:7819-7844 虽有 widget1/2/3 函数，当前未加入渲染画板，不能算补画完成。

## 5. 快照契约与数据链

- **唯一写者：** App 已认证且 R10 来源成功时取得 actorId、规范化 baseURL、D-01 revision 和各卡原有读结果，经 src/widgets 的纯投影形成 v1 最小展示模型。today 只选 R10 todo/page 的前 3 条与真实件数；network 取 R11a 总数／月新增／授权的最近人；secretary 只取 R13 合法 sourceKind 与可用目标；plan 取现有 score total、segments、todayChance；lock event 只取 R10 选出的下一场 registered。一个来源失败只降该 widget，不把 null 或失败写成零。App 写入可在首页读成功、前台恢复和相关本端写回后触发，不增加后台轮询或新付费 AI。
- **共享格式：** v1 顶层 schemaVersion、scopeHash、layoutRevision、generatedAt、expiresAt、lastUpdatedAt、timeZone、各 widget 的 kind/status/display/target。保留最多画板可见的文本与 ID；不存完整联系人记录、Gmail、会话、Cookie、bearer token 或写请求。时间用绝对 ISO 值，extension 用本地化格式画“上次更新”。无效枚举、缺字段、未来时间、过期、不同 active scope 一律不渲染旧业务值。
- **存储与隔离：** 主 App 与 extension 声明同一 App Group；使用 FileManager.containerURL 返回的目录，不拼系统路径。App 写 temp→原子替换 active-snapshot-v1 文件，并单独维护 active scope；写完请求 WidgetCenter.reloadTimelines。先清 active scope 再清文件可让写入中／切号时 fail closed。登出前 hook await 清理；root 观察器补会话失效或 baseURL 切换。A→B 的中间帧只能是无数据态，不得显示 A 的人员／秘書内容。
- **WidgetKit 只读：** TimelineProvider 从共享文件读、按 schema/时间/scope 验证，生成当前 entry 与过期 entry；不包含网络 client、不接受写按钮。系统刷新并不保证时点，超时即显示过期态与 lastUpdatedAt。锁屏标题和涉及个人关系的文字应用隐私遮盖；Apple 的 [WidgetKit 隐私说明](https://developer.apple.com/documentation/WidgetKit/Creating-a-Widget-Extension)支持 privacySensitive 视图。
- **布局关系：** D-01 app/web 数组不变。iOS 系统决定 widget 放在哪和使用哪种 family；R19 从既有 key/读结果选择内容，不新增服务端 widgetLayout 或把 iOS 大尺寸塞进 D-01 s/m。测试覆盖 D-01 卡被移除、仅布局离线草稿、账号冲突 409 时仍以被确认的读数据生成 snapshot，不用未提交布局覆盖业务事实。

## 6. 原生生成、深链与降级

- **生成：** config plugin 在 prebuild 产物里加 app.agenthubs.orbit.widgets extension、SwiftUI WidgetBundle、Embed App Extensions、双 target App Group entitlement。本地两次 prebuild 比较 PBX target/文件/entitlement，无重复；生成后跑 xcodebuild -list 与模拟器构建。正式 group ID、Team 和 provisioning profile 的注册／发布不在此轮。Expo 的 [app extension 说明](https://docs.expo.dev/build-reference/app-extensions/)也将 CNG target 交给 config plugin。
- **深链：** WidgetKit 只构造 §2 白名单内部 orbit URL，不从快照透传外部 URL。目标先到 App 根导航，再由 R18b 版本／维护门禁和现有认证、route access 决定是否展示。事件 href 必须过 homeAppTargetHref 的白名单；人员 ID 编码后仅在本 actor 的授权列表存在时可用。点击行与空白区域的目标分别按画板；无法安全定位时退到一级页。
- **本机签名失败替代：** 先尝试只对 D 线模拟器产物设置本地 entitlements，并以 codesign -d 双 target、containerURL 非 nil、App 写→extension 读来判定真实共享成功。若该 entitlement 在无 Apple 开发者签名时不可用，只在模拟器运行纯序列化／过期／actor 隔离测试、SwiftUI Preview 的 fixture 与 extension 本地 debug 只读 fixture 路径；fixture 不入生产 target，也不声称 App Group 端到端通过。REPORT 单列真实链未过及正式签名风险，留待用户授权后复验。

## 7. 画板清单、预检与像素门禁

以 node repos/orbits/scripts/visual/compare-redesign.mjs --list --design widgets.html --design-base file:///Volumes/ORICO/Dev/worktrees/orbit/redesign-d/docs/designs/redesign-2026-10/ 于 2151f7839 实跑；实施前重新 --list 固定。widgets.html:28-30 的 170×170 / 364×170 / 364×382 是设计内尺寸，不当作 iOS family API 的像素常量。

| 屏幕 ID | 画板序号与内容 | 操作／限制 |
| --- | --- | --- |
| A-R19-01 / 01D | widgets.html #0 / #3，390×844 浅／深 | 主屏两个小：今日／人脈；一个中：秘書。秘書 Gmail 行按 Q5 改稿前不算通过。 |
| A-R19-02 / 02D | widgets.html #1 / #4，390×844 浅／深 | 主屏大：プラン スコア、细分构成条、今日机会。 |
| A-R19-03 / 03D | widgets.html #2 / #5，390×844 浅／深 | 锁屏圆形计划分数＋矩形下一场活动；通知属于 OS／R14，不由 R19 生产。 |

app.html 的 --list 只有 #5 是首页“ウィジェットを追加”组件库，b11-nav-v3.html #23 是该库、#31 是 push 锁屏示例，均非本 Sprint 的 WidgetKit 画板；b12 的 widget 函数未渲染，--list 无 R19 画板。主屏配置界面、空／少量、加载、过期、离线、账号切换、锁屏遮盖、预览图库尺寸变体均标「设计稿无」，留截图并向主会话给补画请求，不借 #0–#5 充数。

先用 board-preflight 对六板记录 token、数字自洽、动作目标、真实／样例来源和系统外壳；再取 WidgetKit Preview 与模拟器主屏／锁屏真实截图。系统壁纸、时钟、Dock、安装应用图标属 OS 外壳，门禁比较 widget 本体区域与结构；整屏截图用于确认放置、浅深和点击。每板最多三轮，记 raw、每条超阈带、缺块和正当归因；仅数据文字可按规则归因，Q5 缺行或权限失败不能用 data 归因掩盖。

## 8. 验收契约（SC；必须有操作链和证据）

| SC | 操作链／必须观察到 | 证据 |
| --- | --- | --- |
| SC-R19-01 开工与事实 | 拉取最新 origin，确认只一 App target、ios/ 被忽略、签名／entitlement/EAS 状态；锁定六板、预检五项，记录 R10 已验证与未闭合来源。 | SHA、xcodebuild/codesign、--list、预检、越线清单。 |
| SC-R19-02 快照纯契约 | 同一 R10 fixture 产同值；合法状态、部分失败、空态、坏 JSON、未知版本、actor/baseURL 不同、未来时间、29:59/30:00、日界均按 §5 解析或 fail closed。 | 先红后绿的模型／解析测试与示例 JSON（无凭据）。 |
| SC-R19-03 原生生成 | prebuild 两次只加一个 WidgetKit target，宿主＋extension Bundle ID / embedding / entitlements 对齐；本机模拟器编译，源文件留在插件／模块而非只留 ios/。 | 两次 PBX diff、xcodebuild -list/build 日志、codesign 双 target。 |
| SC-R19-04 App Group 生命周期 | A 登录写→extension 读 A；登出立即清空；B 登录未取到数据前只显示无数据，随后读 B；换 baseURL、会话过期、进程重启、原子写中断均不露 A。 | 同一 D 模拟器共享文件读回、timeline、登出／切号截图和隔离测试；无 entitlement 时标未过。 |
| SC-R19-05 首页同源 | 今日件数/前三条、人脈总数/月新增/最近人、秘書合法来源、计划分数/构成、最早 registered 活动与 R10 App 首页同 actor 回执一致；extension 发 API 请求 0。单源失败只降对应 widget。 | R10 Home↔快照↔Widget 三列读数、网络探针、失败与恢复。 |
| SC-R19-06 小组件小尺寸 | 今日与人脈各一块；今日 5 件仅画前 3，人脈最近人只画板上允许字段；点击整体/人脈行到安全目标。 | #0/#3 Preview＋模拟器主屏截图、点按回执。 |
| SC-R19-07 中尺寸秘書 | 只显示已定 Q5 / R13 合法条目和真实件数；未知来源跳过、无 Gmail 正文／AI 请求；点击进入受信箱「秘書」。 | #0/#3 在主会话 Q5 改稿后的实屏、请求计数 0。 |
| SC-R19-08 大尺寸计划 | 分数可 >100、细分构成条与 R10 summary 同值、负 todayDelta 不拼错、无 current 时为空态；点击进 Task › プラン。 | #1/#4 实屏、0/46/>100/负数 fixture 与同源回执。 |
| SC-R19-09 锁屏 | 圆形分数与矩形下一场 registered 活动按已有值显示；超 100 圆环满而数字继续；锁屏隐私遮盖、无活动降级。 | #2/#5 实屏、锁定／解锁截图、目标检查。 |
| SC-R19-10 深链门禁 | 冷／热启动逐类点击；强制更新／维护时先显示 R18b 门禁而非目标；未登录／恶意目标不越权，版本恢复后正常到页。 | D 模拟器操作记录、根布局／路由测试。 |
| SC-R19-11 视觉与可用性 | 六板浅深本体逐带对照；文字截断、Dynamic Type、VoiceOver 名称、无画板各态真实截图；Q5 未改稿的板不得伪称通过。 | 画板 raw／带／缺块／归因表、三轮上限和未过清单。 |
| SC-R19-12 全量与交接 | App 全量对开工基线零新增失败、tsc 0；原生模拟器构建与桌面回读；REPORT 逐 SC、R19-01、D-24、R10、R18b 回应，写 Bridge 四栏及 DEFERRED 授权。 | 命令退出码与失败名比较、REPORT / REVIEW；不推送。 |

## 9. 执行顺序

1. SC-01 查最新 R10/R18b、签名能力和六画板；向主会话交 Q5 的 widgets.html 精确改稿请求，先做不受冲突影响的板。锁定候选 App Group ID 和模拟器是否可拿有效 entitlement；不要因此停掉纯模型和 SwiftUI Preview 工作。
2. SC-02 定 v1 最小快照和安全解析，先写失败测试；SC-03 做 config plugin 与桥接，反复 prebuild 后本地构建；SC-04 验 App→group→extension、清空与重启。如果 entitlement 拒绝，按 §6 做替代验证并保留真实链未过。
3. SC-05 只重用 R10 App 首页读源，逐块建立同 actor 三列回读；SC-06～09 做已有小／中／大／锁屏。秘书板等 Q5 改稿，其他尺寸继续。SC-10 逐深链过 R18b 门禁，账号错误仍不渲染旧快照。
4. SC-11 先预检再模拟器实屏、逐带归因，最多三轮；SC-12 全量与交接报告。提交只含本线精确路径；主会话独立复核并决定集成，本线不 push。

## 10. 失败、停止条件与授权

- **依赖逐项阻塞：** Q5 画板未改只阻塞含邮件行的 #0/#3 像素；App Group entitlement 不可用只阻塞真实共享链，不阻塞序列化、Preview、深链模型；C 线若尚未交登出前钩子，SC-04 的无泄漏验收不能记完成，继续其他独立 SC。缺画板状态写「设计稿无」，缺真实签名不写“通过”。
- **本机 fallback 的风险：** Preview 的 fixture、extension debug 私有路径或纯测试不能证明两个进程的 App Group entitlement、真实清空时序和 WidgetCenter 刷新。正式签名后必须重跑 SC-03/04/11；若未获授权，REPORT 将其保留为 DEFERRED，不以 ad hoc 本机结果替代。
- **失败要显式：** 无效 snapshot、actor 不匹配、过期、source unavailable、不能打开安全深链，都降为明确状态；不能显示上一账号数据、假 0、设计示例或 Gmail 行。单图三轮到顶后转视觉后续，不通过扩大轮数制造完成；全量只跑了定向就不得称全量绿。只要有独立已授权事项就继续。
- **待用户授权：** 真机、Apple Developer Portal 注册正式 App Group 与开发者签名／provisioning、TestFlight、EAS 生产构建、任何生产配置或部署。仅在主会话向用户取得对应授权后执行；本 Sprint 本机阶段不进行。
- **交接：** REPORT 给主会话 README / HANDOFF / DEFERRED-A / screen-ownership 的四栏更新原文：本端 SHA、另一端影响（R10 来源与 R18b 门禁）、未完成项（Q5、C 钩子、正式签名）、验证范围（本地 actor／模拟器／Preview）。路由或类型检查通过不代表 App Group 或业务同源已验。
