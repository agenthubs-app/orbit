# redesign-2026-10 Sprint 管理入口

**运行状态：ACTIVE（2026-10-09）。** 本目录管理 Orbit 2026-10 改版的全部 Sprint，统一用 `R` 编号。每个 Sprint 同时涉及后端、Web（`repos/orbits`）和 App（`repos/orbit-app`），所以不再分别放进两端的 `docs/sprints/`；两端登记表各有一行指向这里。

- 设计依据：本目录上一级的设计稿（`index.html`「待確認項決定」、`01-system.html`、`b11-nav-v3.html`、`kit/`）和 [`IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md)。**两者与本目录冲突时，以本目录「用户决定」表为准。**
- 每个 Sprint 一个目录：`GOAL.md`（易读目标）+ `PLANNER.md`（唯一契约）；执行结束写 `REPORT.md`，独立复核写 `REVIEW.md`。

## 分支

- 改版全部在 **`redesign`** 分支开发（2026-10-09 从 `chat-agent` `9d404c1c8` 建立）。**R02 起直接在 `redesign` 上提交，不再开 Sprint 分支、不开 PR**（RD-25）；R01 曾用分支 `redesign-R01-design-tokens` 经 PR #1 合入。
- **`chat-agent` 冻结**：改版期间不做新功能、不修线上问题（RD-03）。
- `redesign` 在**所有功能完成并整体验收后**一次合并回 `chat-agent`。

## 分工（RD-01）

按功能纵切，一个 Sprint 由一个人把后端、Web、App 一起做完。

| 阶段 | 甲 · 小雨 | 乙 · 产品负责人 |
| --- | --- | --- |
| 骨架 R01–R09 | **全部**（RD-04） | 验收（看截图、试用） |
| 功能 | 计划 v2.2（R22–R25）、加人与邀请（R12、R15、R16）、活动（R26、R27）、主办（R17） | iOrbit（R21）、首页（R10）、Task（R20）、收件箱 · 秘书 · 推送（R13、R14）、人脈（R11）、账户（R18）、iOS 小组件（R19） |

功能 Sprint 的文档在骨架验收后另写。两端每个现有页面由哪个功能 Sprint 重写（按屏替换、旧屏删除），见 [旧屏归属表](screen-ownership.md)；表里补出两个新功能 Sprint：R28 引导、R29 运营后台换新（负责人待定）。分工流程图：https://claude.ai/artifact/7qGcsrWQj2EeLbkdC5hXas

## 骨架登记表

| Sprint | 目标 | 依赖 | 档位 | 状态 |
| --- | --- | --- | --- | --- |
| [R01](R01-design-tokens/GOAL.md) | 设计源：一份 token 源生成两端，新值覆盖旧值，统一改用设计稿命名 | — | H | done，已复核，问题已修（M1、M2、m1、m2、m5、m6 已修；m3 留 R05、m4 留 R07；[REPORT](R01-design-tokens/REPORT.md)、[REVIEW](R01-design-tokens/REVIEW.md) 末尾「处理记录」） |
| [R02](R02-icons/GOAL.md) | 图标源 + 两端 `Icon` + 补画齐全 + Ionicons 只减不增门禁 | R01 | H | done，已复核，问题已修（M3 模拟器底栏截图已在 R04 走查补上，m4、m6 已在 R04 处理；[REPORT](R02-icons/REPORT.md)、[REVIEW](R02-icons/REVIEW.md) 末尾「处理记录」） |
| [R03](R03-copy-and-ja/GOAL.md) | 文案源 + 术语表 + 字典按功能拆分 + 回退日语 + 翻译质量工具；写死文字只减不增门禁 | R01 | H | done，已复核，问题已修（M2 Web 导航壳转 R07；[REPORT](R03-copy-and-ja/REPORT.md)、[REVIEW](R03-copy-and-ja/REVIEW.md) 末尾「处理记录」） |
| [R04](R04-app-components/GOAL.md) | App 组件库（5 类）+ 展示页 + 基础设施改用新组件；旧写法只减不增门禁 | R01、R02、R03 | H | done，已复核，问题已修（模拟器走查已做，只剩触感需真机确认；[REPORT](R04-app-components/REPORT.md)、[REVIEW](R04-app-components/REVIEW.md) 末尾「处理记录」） |
| [R05](R05-app-shell/GOAL.md) | App 导航壳：NAV-V3 底栏、Task 容器、二级页规则 | R04 | H | done，已复核，问题已修（M1–M3、m1–m5 已修，m6 底栏随转场的观感请产品负责人在模拟器确认；R01 m3 冷启动闪主题已在本 Sprint 处理；[REPORT](R05-app-shell/REPORT.md)、[REVIEW](R05-app-shell/REVIEW.md) 末尾「处理记录」） |
| [R06](R06-web-components/GOAL.md) | Web 组件库（5 类，CSS Modules，新作用域） | R01、R02、R03 | H | done，已复核，问题已修（M1–M4、m1–m6、m10 已修；m9 staging 的 `VERCEL_ENV` 需人确认；[REPORT](R06-web-components/REPORT.md)、[REVIEW](R06-web-components/REVIEW.md) 末尾「处理记录」） |
| [R07](R07-web-shell/GOAL.md) | Web 导航壳：左栏、主标题区、右栏、⌘K，全站一次切换 | R06 | H | planned |
| [R08](R08-contracts-and-mocks/GOAL.md) | 12 个契约 + 校验 + mock 接口 + 统一演示世界 + 「只加不改」检查 | R01 | H | planned |
| [R09](R09-skeleton-acceptance/GOAL.md) | 骨架验收：规则入库、开发说明、全流程走查、截图集、基线对照 | R01–R08 | H | planned |

执行顺序：R01 → R02 → R03 → R04 → R05 → R06 → R07 → R08 → R09（一人依次做；R08 只依赖 R01，可以提前）。

## 用户决定（2026-10-09）

| 编号 | 决定 | 影响 |
| --- | --- | --- |
| RD-01 | 两人按功能纵切分工（见上表）；跨人依赖先用空态或现有页面顶上，收尾时接线 | 全部 |
| RD-02 | 导航用 **NAV-V3**：App 底栏 ホーム / 人脈 / iOrbit / イベント / Task；「我的」从首页左上头像进入，收件箱从首页右上 🔔 进入（只显示红点）；Web 左栏 ホーム / 人脈 / iOrbit / イベント / Task / 受信箱，底部 主催 / 設定。替代 2026-10-04 人脉方案的导航（其内容想法放进各功能 Sprint） | R05、R07 |
| RD-03 | 在 `redesign` 分支开发；所有功能完成并整体验收后一次合并回 `chat-agent`；**改版期间 `chat-agent` 冻结** | 全部 |
| RD-04 | 骨架由小雨一人做完；时间不作为约束；验收 = 产品负责人看截图集并在模拟器 / 浏览器试用 + 独立 AI 复核（`REVIEW.md`） | R01–R09 |
| RD-05 | **新 token 值直接覆盖旧 token**；文字用加深版颜色，所有「文字 × 底色」组合 ≥4.5:1，设计原值只用于图形、装饰和 ≥18px 粗体；两端默认主题跟随系统，设置里提供 自动 / 浅色 / 深色 | R01、R07 |
| RD-06 | **一律改用设计稿的命名**（ink、surface、plum、rose、mac、coral、ok …）；App 和 Web 引用旧名字的地方一次改完，不保留旧名字或别名 | R01 |
| RD-07 | 「旧颜色 → 新颜色」对照表由执行人出好，**先给产品负责人确认再应用** | R01 |
| RD-08 | `shared/design`、`shared/copy` 加进 App 同步白名单（`AGENTS.md` 相应修改） | R01、R03 |
| RD-09 | 字体按界面语言切换：日文 Hiragino Sans / Noto Sans JP，中文 PingFang SC / Noto Sans SC，英文系统字体；去掉 Noto Serif SC | R01 |
| RD-10 | ~~图标在骨架里一次换完：App 全部 Ionicons 换成设计稿图标；最后移除 Ionicons 依赖~~ → **修订（2026-10-09）**：骨架建图标源、两端 `Icon` 和展示页，导航壳换新图标；设计稿没有的按同样风格一次补画齐，出「Ionicons → 新图标」对照表给功能 Sprint 用。旧屏的 Ionicons 原样保留，门禁保证新代码不用、旧用法只减不增；最后一个旧屏删除时移除依赖（RD-24） | R02 |
| RD-11 | 语言：App 跟随设备、Web 跟随浏览器语言，不是中 / 日 / 英时回退**日语**；已手动选过语言的用户保持不变 | R03 |
| RD-12 | 两端文案文件全部按功能拆开；~~两端旧页面里写死的文字在骨架里全部抽出并补齐日语~~ → **修订（2026-10-09）**：骨架只处理标准用词源、导航壳和保留组件的文案；旧屏写死的文字原样保留，门禁保证新代码零容忍、旧用法只减不增，由功能 Sprint 整屏重写时按术语表处理（RD-24）；三语标准用词由产品负责人在 R03 报告里审 | R03 |
| RD-13 | 翻译不能「直接翻一遍」：先调研成熟产品和风格指南定术语表，再按「翻译 → 自动检查 → 独立审校 → 放回界面截图 → 修改」循环到达标，每轮数字写进报告（细则见 R03） | R03 |
| RD-14 | 组件库做前 5 类通用组件（基础、反馈、AI、控件、状态），业务专用组件由各功能 Sprint 做；~~App 里 `Alert.alert`、自用 `Modal`、自写分段控件全部换成新组件；App 旧公用组件全部换成新组件并删除~~ → **修订（2026-10-09）**：只有会保留的基础设施（访问 / 离线 / 错误边界、登录会话）改用新组件；旧屏里的旧写法和旧公用组件原样保留，门禁保证只减不增，使用点归零时删除旧组件（RD-24）；加原生依赖 gesture-handler、reanimated、expo-blur、expo-haptics；锁定 `react-native` 版本 | R04 |
| RD-15 | 组件展示页：App 在开发包和 TestFlight 可见、正式版隐藏；Web 在本地和预览 / staging 可见、正式环境隐藏 | R04、R06 |
| RD-16 | 组件验收用展示页 + 与设计稿画板并排的截图（浅色、深色、窄屏、大字号）；**不做逐像素门禁**；所有动画遵守「减少动效」（只保留淡入） | R04、R06 |
| RD-17 | 设计稿矛盾：「完成」一律用绿色（`ok`）；Web 抽屉内容多的 520、内容少的 380；Web iOrbit 历史栏 260；深色模式 Toast 仍是深色胶囊（比背景亮一档的面色 + 浅色字） | R04、R06、R07 |
| RD-18 | Web 新组件样式用 **CSS Modules**，放在新作用域 `[data-orbit-2026]`，不嵌在旧 `[data-orbit-real-page]` 里；新组件 CSS 禁止十六进制颜色 | R06 |
| RD-19 | Web 所有已登录页面在骨架里**一次**切换到新左栏，删除旧顶栏和悬浮球 | R07 |
| RD-20 | 各 tab 先放现有页面（已换新配色、图标、组件），只有全新入口放占位页；App Task 四段：日历 = 现有日程页，To-do = 现有「待办」页并在顶部加添加框，计划 = 「目標を決める」空态，笔记 = 现有笔记页；四段位置冻结 | R05、R07 |
| RD-21 | App 首页右上「編集」按钮显示，点了提示「即将上线」，R10 再接 | R05 |
| RD-22 | 契约：结构清楚的都做完（类型 + 校验 + mock 接口），计划 v2.2 只定顶层；正式环境返回「尚未实现」，界面隐藏入口或用默认值；加「只加不改」自动检查；假数据用一套统一的演示世界 | R08 |
| RD-23 | 骨架文档放在本目录，统一 `R` 编号 | 全部 |
| RD-24 | **骨架不改旧屏**（2026-10-09，承接 R01 修订 3）：骨架只做源文件（token、图标、文案、契约）、新组件、导航壳和会保留的基础设施。旧屏原样挂进新壳，它们的写死颜色、Ionicons、写死文字、旧组件都由 [旧屏归属表](screen-ownership.md) 里的功能 Sprint 整屏重写时一起换掉。理由：`redesign` 要所有功能做完才合回（RD-03），旧屏不会以骨架状态到用户手里，在骨架里修它们会在功能 Sprint 里被整屏删掉。三份允许清单（Ionicons、写死文字、旧写法）只减不增；**合回 `chat-agent` 前总验收**：归属表每行已处理、三份清单为空、Ionicons 依赖已移除、旧公用组件已删除 | R02、R03、R04、R09、全部功能 Sprint |
| RD-25 | R02 起所有 Sprint 直接在 `redesign` 分支提交，不开 Sprint 分支和 PR；每个 Sprint 收口提交后由独立 AI 复核写 `REVIEW.md`，问题在 `redesign` 上直接修 | 全部 |

## 骨架通用规则（每个 Sprint 都适用，PLANNER 不再重复）

1. **基线**：`redesign` 起点 `9d404c1c8`。App `npm test` 4062 条，1 条已知失败（`tests/route-parity.test.ts` 的 `/start`，用户已决定 App 以后做引导页）；orbits `npm test` 必须带 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`（W0034 排序运行时只认 en-US），6811 条、0 失败。两端 `tsc` 通过。每个 Sprint 开工时重跑并记录基线，收口时逐条对照，**零新增失败**。
2. **档位 H**：每个 Sprint 都动共享代码。TDD（先 RED），真实渲染测试，收口跑两端全量和 typecheck；orbits 另跑 `typecheck:app`、`lint`。
3. **GitNexus**：改函数 / 组件前跑 `impact`（upstream），HIGH / CRITICAL 先在 REPORT 写明对策；`UNKNOWN` 必须用文本搜索确认；提交前跑 `detect-changes`。
4. **同步**：改了 `repos/orbits/shared/**` 的同步目录，必须在 App 跑 `npm run sync:contract`，并在同一提交里带上副本；**不得直接改 App 里的副本**。
5. **证据**：截图、日志放 `~/orbit-sprint-evidence/redesign/R0x/run-01/`；每个 Sprint 的 REPORT 附一个截图对照页（设计稿画板 ↔ 实现，浅色 / 深色）。
6. **不碰生产**：不连 Neon、不部署；数据库只用本地 `orbit_test` 等测试库；骨架阶段**没有产品内的付费 AI 调用**（R03 的翻译和审校由开发用 AI 会话完成，不走产品的 AI 接口）。
7. **界面用词**：所有用户看得到的文字用普通人能懂的说法，不出现「来源」「证据」「关系设置」这类内部用语。
8. **复核**：每个 Sprint 结束由独立 AI 复核（跑全量、运行时抽查、对照 SC），写 `REVIEW.md`；复核发现的问题直接在 `redesign` 上修（RD-25）；产品负责人看截图集并试用。
9. **范围**：骨架不改旧屏，旧用法只减不增（RD-24）。
