# 交接表：骨架与返工留给各功能 Sprint 的事项和临时规定

**建立：2026-10-12。** 骨架（R01–R09）、导航壳像素返工（R05 / R07）、加人（R12 / R15 / R16）、计划 v2.2（R22–R25）和 2026-10-11 像素盘点、2026-10-12 拍板过程中，有很多事明确写了「留给后面的功能 Sprint」，也定了一些临时做法。它们原本散在几十份 REPORT / REVIEW 里，这里集中成一张表，按接手的功能 Sprint 分节。

## 怎么用

1. **开工前**：先读本表里自己 Sprint 那一节和「通用口径」一节，把其中每一条写进自己 PLANNER 的验收契约（SC），并写明依据编号。HOW-TO 第 0 步已把这一条列为必做。
2. **收口时**：REPORT 里逐条写本节各条的处理结果（做了 / 拍板后改了 / 仍保留并说明）。
3. **有新的交接事项**：一律追加到本文件对应的 Sprint 节（没有对应 Sprint 的写进「未定归属」），写清四栏和依据；不要只写在自己的 REPORT 里。
4. 和 README「用户决定」表、[`2026-10-12-decisions.md`](maintenance/2026-10-12-decisions.md) 冲突时，以那两份为准，并回来改本表。

每条四栏：**是什么 · 现在的临时做法 · 接手时必须做到 · 依据**。依据里的缩写：

| 缩写 | 文件 |
| --- | --- |
| DEC | [`maintenance/2026-10-12-decisions.md`](maintenance/2026-10-12-decisions.md)（用户 2026-10-12 拍板：D01–D61、X01–X13、Q1–Q5） |
| PA | [`maintenance/2026-10-11-pixel-audit.md`](maintenance/2026-10-11-pixel-audit.md)（像素盘点；画面编号 W-Rxx / A-Rxx） |
| b12 | [`../b12-missing-states.html`](../b12-missing-states.html)（补画 147 块，已认可，是门禁基准） |
| R07-RW | [`R07-web-shell/REWORK-REPORT.md`](R07-web-shell/REWORK-REPORT.md) / [`REWORK-REVIEW.md`](R07-web-shell/REWORK-REVIEW.md) |
| 归属表 | [`screen-ownership.md`](screen-ownership.md) |
| README | [`README.md`](README.md)（RD-xx = 用户决定；「合回前」= 合回 `chat-agent` 前总验收清单） |

其余写文件相对路径，如 `R12-add-cards-and-manual/REPORT.md:64`。

---

## 通用口径（所有功能 Sprint 都适用）

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| G01 | **旧一级页不出新主标题区 / 三段顶栏**（D09 与 R05 同口径） | 人脈、イベント、マイページ、iOrbit、首页等旧一级页原样挂在新壳里：Web 没有主标题区和右栏、深色下仍是浅色、日文界面夹英文；App 旧屏仍是旧顶栏 | 各自 Sprint 整屏重写时才换：Web 用 `ShellPage` 填标题、页签、右栏并支持深色；App 用新顶栏三段式（🔍 · 居中标题 + 日期 · ＋）。在此之前**不要**给旧屏单独补标题区 | DEC §3 D09；R07-RW REWORK-REPORT:107；`R05-app-shell/REPORT.md`:56；README RD-24 |
| G02 | **浅灰 `--ink-3` 例外**（RD-05） | Web 壳与 App 壳的次要文字照设计稿用 `--ink-3`：左栏 / 底栏未选中项、标题区日期、右栏「こんなことを聞けます」与输入框占位、抽屉「Esc で閉じる」、头像菜单邮箱与「言語 / 外観」、390 胶囊标签；示例药丸照设计稿杏色 | 各功能 Sprint 里**同类**次要说明文字（日期副标题、占位、快捷键提示等）同样照设计稿用 `--ink-3`；其余文字仍要 ≥4.5:1（用加深版 `--ink-3-text` 等） | README RD-05（用户决定 2026-10-12，R07 复核 M1；App 沿用）；R07-RW REWORK-REVIEW:90–93 |
| G03 | **危险色** | 实现用深红 `coralText` | 危险按钮底色、危险文字、确认框图标一律用 `--coral-text`（设计稿已同步改） | DEC D02 D08、§6 |
| G04 | **App 按钮高度** | md 按钮高 44（R04 偏离） | 照设计稿：看得见的高 40，用看不见的触控扩展补到 44（R04 组件返工时改；功能 Sprint 用组件即可） | DEC D01（2026-10-12 定）；`R04-app-components/REPORT.md`:59 |
| G05 | **逐像素还原** | — | 每个画面和画板一模一样，只许数据文字不同；设计稿有的不许改、不许省，偏离先请用户拍板；整屏 raw ≤0.02、`--grid` 超阈值带只能是 `[data]`；Web 1440 / 1024 / 390 × 浅 / 深截完整页面（含壳），App 模拟器真实画面浅 / 深；交 `attribution-redesign-<Sprint>.json`；不过门禁不得标 done | README RD-16 修订、通用规则 11 |
| G06 | **门禁提速与做法（摘要）** | — | 照源码搬（kit / 画板 HTML → CSS Modules / token），不对着截图画；快慢两档（迭代 `--only` / `--changed`，收口跑全量）；复核只重跑未过和改过的画面 + 抽查 ≥20% 已过画面，每张看 triptych；子会话不弹 AskUserQuestion，拍板事项 SendMessage 给主会话、先跳过；最多同时 2 个会话（一重一轻）、每个会话同时最多 1 个子任务、独立复核在其他子任务结束后再起（用户 2026-10-12 决定），各用自己的端口 / distDir / 测试库。**细节以 [HOW-TO 第 8 节](HOW-TO-START-A-FEATURE-SPRINT.md#8-截图对照页与像素门禁) 为准** | README 通用规则 12 |
| G07 | **画板基准** | — | b12 147 块即定稿，`--board "<编号>"` 定位（`N19` / `N31` 用 `--board-index` 或带空格）；备选版 W-R07-07b-B、W-R12-01-B 不用；设计稿互相冲突时以更新的为准，旧画板标「作废」；「作废」与「下一期」画板不进门禁（D22 D28 D29 D34 D41 D55、b6「ホーム · 1024 抽屉展开」；b6「ホーム · 1024」部分作废）；「保留现在」27 条的画板已改，注释以「2026-10-12 用户定稿 Dxx」开头，按新画板验收 | DEC §4–§7、Q2 Q3 Q5 |
| G08 | **没截到的画面** | 会写库或调付费 AI 的状态没截 | 用只读演示服务器 + 固定示例结果补截，不写库、不调付费 AI | DEC Q4 |
| G09 | **示例数据不算偏离** | — | 类型示例短名、opener 示例句、mock 的「サンプル」标签、iOS 状态栏不算差异 | DEC §7；PA L31 |
| G10 | **Web 壳插槽用法** | 插槽：`title` / `subtitle` / `left` / `right` / `demoPill` / `rightRail` / `phoneFold` | 插槽只加不改；插槽内容在壳里渲染、拿不到页面 context，值在页面读好再传；作用域外取文案用 `pickCopy` / `standardCopyFor`；`rightRail` 传 `true` 用默认右栏，<1280 自动变按钮 + 380 抽屉，计数用 `ShellRailButton` 的 `count` | HOW-TO 第 2 节；`R07-web-shell/REPORT.md`:97；R07-RW REWORK-REPORT:19,131 |
| G11 | **`phoneFold`** | 只有首页和 Task 声明了（<768 时收起标题行） | 其他页面在 390 下保留标题行和左右插槽（返回钮、主按钮、次の一手）；新屏把标题并进页面正文时才显式传 `phoneFold` | R07-RW REWORK-REPORT:25,163；REWORK-REVIEW:81 |
| G12 | **390 没有 🔍 / ⌘K** | 照稿去掉 | 手机 Web 搜人走人脈页搜索框，提问走底栏 iOrbit；不要在页面里另加搜索钮 | R07-RW REWORK-REPORT:100（拍板 2026-10-12） |
| G13 | **旧页面全局样式会漏进壳** | 旧全局 `.btn` 会改壳里按钮；壳用双类选择器写回 kit 值 | 新的壳级或弹层控件要在旧页面（如 Task 页）上复查；窄屏新写的底部固定控件 `bottom` 加 `var(--orbit-shell-bottom-inset, 0px)`；旧页面开对话框时壳降到 `--z-raised`，不逐个改旧页 `z-index` | R07-RW REWORK-REPORT:32,166；`R07-web-shell/REPORT.md`:100；`R09-skeleton-acceptance/REPORT.md`:90 |
| G14 | **kiosk / 公开页** | kiosk（签到）不挂壳、不注册 ⌘K（R17 起入场审核并入运营台「参加者」页签，旧 `operations/admission` 跳转，已出排除名单）；公开页保留 `OrbitTopNav` / `PublicTopNav` | 新路由沿用 `shellAppliesTo` + `allowsOrbitAsk` 排除规则；已登录页一律不挂旧导航 | `R07-web-shell/REVIEW.md`:202；`R07-web-shell/REPORT.md`:56,102 |
| G15 | **App 壳规则** | 一级页固定 `/home` `/contacts` `/events` `/task`，用 `AppScreen`，不自画底栏；Task 四段在 `TASK_SLOTS` | 打开一级页走 `openMainTab()`；新二级页在 `parentForPath` 写返回目标；只改自己那一段 `TASK_SLOTS` 和 `add()` 自己那一支；旧路由跳转表保留，重写旧屏时改成新地址 | `R05-app-shell/REPORT.md`:58–93；`R05-app-shell/REVIEW.md`:182 |
| G16 | **App 底栏转场** | 已做（R05 返工）：被盖住的一级页自己画底栏（`TabPageBar`），随原生转场被二级页盖住、返回转场结束后交回根部底栏 | 新一级页用 `AppScreen`（自动带）或在页面根视图最后放 `<TabPageBar tab=…/>`；二级页按此验收；页面代码不要直接 import `OrbitTabBar` | DEC D07；`R05-app-shell/REWORK-REPORT.md` §9 |
| G17 | **App 页面背景与顶栏** | 壳已提供：`ShellBackground`（雾面）、`ShellTopBar`（三段顶栏）、`AppScreen` 二级页顶栏、Task `.tseg`；旧一级页正文仍是旧屏 | 新屏一律用这些组件（不自画背景 / 顶栏）；分段控件用 `Segmented variant="tseg"`（高 32.75，kit 值）；壳内文字的 iOS 基线微调用 `cjkLift` | PA X06 X12 X13；R05 返工 |
| G18 | **「尚未实现」与演示世界** | live 返回 503 `NOT_IMPLEMENTED` | 界面不报错：有默认值用默认、没有就隐藏那一块（`whenNotImplemented`）；fixture 只从演示世界取人和事、带 `sample: true`；做 live 实现时在 `capability-registry` 登记；契约只加不改，破坏性改动先登记 `BREAKING.md` | HOW-TO 第 3–4、9 节；`R08-contracts-and-mocks/REPORT.md`:58–99 |
| G19 | **契约响应宽进** | App 有几处 strict 读取（`src/api/inbox-notifications.ts`、`NotificationDeliverySettings.tsx`） | 给契约加枚举值 / 字段前，先把对应 App 读取改宽进，或抬高 `minSupportedAppVersion` | README 通用规则 10；`R08-contracts-and-mocks/REPORT.md`:80,95 |
| G20 | **旧屏三份允许清单** | Ionicons、写死文字、旧写法只减不增 | 重写一个旧屏就把它从清单删掉；旧组件（如 `NeedsNetworkState`，14 个旧屏在用）使用点归零时删文件；合回前清单为空 | README RD-24、合回前 |
| G21 | **Web 新页面作用域** | — | 外层 `<Orbit2026Scope>` + `ToastProvider`，与旧页面是兄弟不嵌套；CSS 只用 `var(--…)`；弹层用现成组件或 `useLayer`；减少动效两处都写 | `R06-web-components/REPORT.md`:76–81 |
| G22 | **语言** | Web 以 cookie `orbit-lang` 为准 | 链接不拼 `?lang=`；字体按 RD-09 修订（系统字体优先） | `R07-web-shell/REVIEW.md`:207；README RD-09 |
| G24 | **App 日文粗体字形**（用户 2026-10-12 选 (b)） | 已做（R05 返工）：`UiText` 在 iOS 日文界面把假名 / 汉字 / 全角符号设成 Hiragino Sans 显式字重，英文数字仍是 SF；token `font.face.ja`（`font.family.ja` 是 Web 的 CSS 字体栈，已与 kit `--font` 逐字一致）；符号按设计稿：SF 有的（✓ → … × · — ① ●）走 SF，SF 没有的（※ ― ‥ ─ ⑩–⑳ ◆◇◉◎◯ ☀ ☎ ♪）也走 Hiragino（iOS 字体字符表核过） | 新文字一律用 `UiText`（旧屏的 RN `Text` 仍走系统回退，重写时换掉）；不要自己写字体名。iOS 自带 W3–W8 全部可用；字重按门禁实测的 Chrome 落档映射 400 W3 / 500 W4 / 600 W5 / 700 W6 / 800 W7 / 900 W8 | DEC §9-9；README RD-09；`R05-app-shell/REWORK-REPORT.md` §10 |
| G23 | **组件库遗留（乙负责组件库时处理；2026-10-13 定为乙的第一个 Sprint「组件库像素轮」，连同 R24-05、U02，见 [COLLEAGUE-START](COLLEAGUE-START.md)）** | 调用方各自绕开 | `Toast` 点按先关再回调；`BottomSheet` / `ActionSheet` 页面失焦自动关；确认 sheet 支持不可拖关；Web Modal 加 380 档（D42）；`Kbd` 字色、`MacTile` 小号 emoji、非壳抽屉深色细边等逐件对齐 kit（Q1 组件逐件比）；**R27 补件（主会话 2026-10-15）**：组件库轮必须新增 UnderlineTabs（kit `.utabs`）、可配置 TabBar（含会場玻璃底栏 `.tabbar.livebar` 变体）、全屏搜索页容器，替换后删 `tests/fixtures/legacy-ui-deferred.json` 的 3 行 | `R12-add-cards-and-manual/REVIEW.md`:150；`R15-invite-codes/REVIEW.md`:78,148,153；DEC D42 Q1；R07-RW REWORK-REPORT:113,174 → R31a / R31b（2026-10-18）  **R31a 2026-10-18：组件已修：Toast 点按先关再回调 / 去 ✕ / usePageBottomBar（`7457b4cc0`）；BottomSheet / ActionSheet 失焦自动关（输入时不关）、dismissOnBackdrop / draggable（`7457b4cc0`）；新增 UnderlineTabs / TabBar / FullScreenSearch 并替换 3 处，legacy-ui-deferred.json 清空（`ef8ecc9d1`）；App 部分 done。Web 部分归 R31b** |
| G23b | **组件库像素轮（乙）补充**（2026-10-13，R12 Web 返工发现） | `MacTile` emoji 20 / 16、圆角 14；Chip apricot 字色用 `-text`；`FilterOption` 上下内边距 6；`Kbd` 字色 `ink-3-text`；add-invite-ui 给 Modal 加了 `header`、给 Button 加了 `trailing`（只加不改），并给 Button / IconButton / FilterOption / Checkbox 加双类写回旧页面全局 `.btn`（G13） | 对齐 kit：MacTile emoji 21 / 17、圆角 13；Chip apricot 字色 kit 用 `-ink`（与实现 `-text` 的差异要定）；FilterOption 上下 7；Kbd 字色 kit 为 `ink-3`（实现 `ink-3-text`，按 RD-05 例外定）；其余组件同类的全局 `.btn` 漏入问题尚未处理 | DEC §17；R12 Web 返工 → R31a / R31b（2026-10-18）  **R31a 2026-10-18：App：MacTile 已是 21 / 17 / r13、FilterOption 7 / 12（`7457b4cc0`）done；Web 部分归 R31b** |
| G25 | **省额度做法（用户 2026-10-12 决定）** | — | 门禁先看文字结论（Web 先跑 `--style-diff` 逐元素样式 / 位置比对，像素门禁只做最后确认；App 看数字结论），图片只在数字说不清时看裁剪块；设计稿用 `--extract-board` 只抽单个画板；HANDOFF / 决定表只读相关段落；测试只看摘要；同一画面最多改 3 轮，不过就列「未过」报主会话；每个会话只做几个画面，上下文变长就写交接、推送、开新对话；只用 `git commit -- <自己的文件>` 按路径提交，不把文件长时间留在暂存区。**细节以 HOW-TO 第 8 节为准** | README 通用规则 12 |
| G26 | **字号 / 圆角 token 补齐**（计划页返工发现，R05 补） | 已做：`--fs-micro` 9.5、`--fs-tiny` 10.5（非导航处的 10.5）、`--fs-emph` 15、`--fs-title-xs` 18、`--fs-section` 19、`--fs-display-md` 44、`--fs-display-xl` 64、`--fs-emoji-md` 21、`--fs-emoji-lg` 28、`--fs-number-lg` 32、`--fs-display-lg` 56、`--fs-display-sm` 48；`--r-hair` 2、`--r-bar` 3、`--r-seg` 5、`--r-chip` 8、`--r-input-sm` 9、`--r-emo` 13、`--r-dot` 4、`--r-check` 7、`--r-tick` 1（App 同名在 `designFont.size` / `designRadius` 副本里） | 设计稿出现这些值时直接用 token，不再写死或开局部变量；计划页 `FlowKit.module.css` 的 `--fs-flow-*` / `--r-flow-*` 换成正式 token（R22–R25 返工会话） | 共享笔记 R23-25-web-plan-missing-tokens.md；`R05-app-shell/REWORK-REPORT.md` §11 |

---

## R10 首页

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R10-01 | Web 首页正文（W-R07-01 / 03） | `HomePlaceholder`「ホームを準備しています」 | 照 web.html「ホーム」×3、「ホーム · 編集モード」、b11「ホーム 編集 · Web」整屏重写并过门禁 | PA D12；R07-RW REWORK-REPORT:11,41 |
| R10-02 | **1024 抽屉中段、右栏「次の一手」建议与计数** | 右栏只有「新用户空状态」画板内容；`ShellRailButton` 的 `count` 没人传值；1024 标题区靠 `[data]` 归因过门禁 | 接上建议数据（3 张建议卡、「✨ … ホームから」、🕘 最近の会話），用 `count` 传计数；1024 按钮位置和抽屉头照 b12 N07 / N07b（b6 对应画板已作废），W-R07-03D 抽屉中段过门禁 | README R07 行；R07-RW REWORK-REPORT:12,49,86,111,164；DEC §7（Q2） |
| R10-03 | App / Web 首页「編集」 | 只弹 Toast「近日公開」（RD-21、D05 保留临时） | 照 app.html「ホーム · 編集モード」、b11 B ①–⑤ 做编辑模式（含「ドラッグで組み替え」提示条），做完删掉 Toast；b12 A-R05-12 画的是临时状态，做完后不再用 | DEC D05；PA D05；`R05-app-shell/REPORT.md`:17,105 |
| R10-04 | App 首页内容与顶栏（A-R05-01） | 旧屏（周条、快捷四键），顶栏是搜索框 + 方形铃铛 | 日期大标题 + 问候副标题 + 白圆铃铛（红点）+ 白胶囊「編集」；旧用词（如「つながりを検索」）随重写换掉 | PA L608–618；`R09-skeleton-acceptance/walkthrough.md`:31 |
| R10-05 | Web `AgentDock` 居中 | 1440 下按视口居中，没算左栏 | 按主区居中 | README 合回前；`R07-web-shell/REVIEW.md`:110 |
| R10-06 | 契约 `home-layout` | mock 演示世界，live 503 | 做 live；尚未实现时用 `DEFAULT_HOME_LAYOUT` | `R08-contracts-and-mocks/REPORT.md`:13,87 |
| R10-07 | 首页「プラン スコア」 | `GET /api/agent/plans/v2/summary` 已 live | `current` 为 null 显示「目標を決める」空态；`segments` 里 `key=event` 是イベント枠 | `R22-plan-data-and-score/REPORT.md`:92 |
| R10-08 | 「今日 +N」为负数 | 实现自加状态 | 照 b12 N13-A / N13-W | PA N13；DEC §4 |
| R10-09 | 每天一问卡片挂首页 | 接口 live，`CompletionQuestionCard` 随 R16 界面做（未做） | 拿到组件后挂首页 | `R16-import-and-completion/REPORT.md`:41 |
| R10-10 | 首页人脈组件点开联系人（R11a 交出） | — | Web 直接用 `orbit-2026/network/ContactDrawer.tsx` 的 `ContactDrawer`（props：`contactId`、`onClose`、可选 `initial` 已读详情、`onChanged({ kind: saved / deleted / unlinked })`、`goalLabel`、`inviteLinked`），不要另写详情；App 跳 `/contacts/[id]`。人数 / 今月 +N / 浓度 / 来源读 `/api/contacts/summary`（`addedThisMonth` 按 Asia/Tokyo 月界，`densityCounts` 已含计划合并），浓度与来源口径用 `shared/compute/contact-density.ts`（`mergeContactDensity`）、`contact-source-chip.ts`，不要各自推断 | `R11a-network-list-detail/REPORT.md` 交接节 |

## R11 人脈

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R11-01 | **done（R11a，2026-10-18，`61c37954b`）**：App「人脈を追加」入口 | 整页 `contacts/new`；`AddContactSheet` 只在展示页 | 人脈页「＋」弹底部弹层 `AddContactSheet` / `AddContactDoors` | DEC D19；`R12-add-cards-and-manual/REPORT.md`:114 |
| R11-02 | **结构 done、像素待 R11-16（R11a，2026-10-18，`61c37954b` / `22bcd04d7` / `97b0f4d3e`）**：App 人脈顶栏（A-R05-02）与 Web 人脈 / 連絡先詳細 | 旧屏 | 「🔍 · 人脈 +『286人 · 今月 +24』· ＋（白圆）」，去掉扫描钮；Web 整屏照 web.html 重写（含深色）；A-R05-10 二级页过门禁（返回恢复分段与滚动） | PA L620–629、L146、D09 |
| R11-03 | **done（R11a，2026-10-18）**：App 空态按改稿后的 app.html 板写「名前だけで保存」；人脈空态小卡文案 | 设计稿已改 | App 用「氏名だけで登録可」（App 不做粘贴签名） | DEC §7（D28） |
| R11-04 | **done（R11a，2026-10-18，App `61c37954b`、Web `22bcd04d7`；W-R12-01～04 重比见 R11-16）**：加人弹窗 / 手入力抽屉的背景页 | 背景是加人入口页 | 压在人脈列表页上（W-R12-01～04） | PA L323/340/350 |
| R11-05 | **done（R11a，2026-10-18，`794c40759` / `3d57b552b`）**：字段在 `ContactCardDTO` 与 `ContactSyncPayload.card`，计划关系走 `GET /api/contacts/goal-related-ids`；契约 2 字段 `density` / `sourceChip` / `densityCounts` / `addedThisMonth` | `/api/contacts/page` 没有 mock，只有 fixture `filterDemoContacts` | 接入真实字段；`goalRelated` 筛选 live 调 `planGoalRelatedContactIds` | `R08-contracts-and-mocks/REPORT.md`:14,57；`R22-plan-data-and-score/REPORT.md`:93 |
| R11-06 | **done（R11a，2026-10-18，`794c40759`）**：`mergeContactDensity` 读时合并计划；`contact-density.ts` | R12 先写；每天一问的浓度暂不计「计划已关联」 | R11 接管并补「计划已关联」 | `R12-add-cards-and-manual/REPORT.md`:114；`R16-import-and-completion/REVIEW.md`:131 |
| R11-07 | **done（R11a，2026-10-18，`794c40759`）**：`shared/compute/contact-source-chip.ts`，导入写顶层 `importFormat`；来源标签 `sourceChip` 统一 | 每天一问用临时推断，带 LinkedIn URL 列的汎用 CSV 会被误标 | 统一来源标签（放 `shared/compute`，或导入时把 `format` 记进 `source`） | `R16-import-and-completion/REVIEW.md`:94,132 |
| R11-08 | **「以前の値」done（R11a，2026-10-18，`f8cae85c6`）；转职冲突提示 → 下一期（PLANNER「不做」）**：联系人详情显示 `fieldHistory`「以前の値」、转职冲突提示 | 写进 payload，没界面读 | 详情页显示 | `R12-add-cards-and-manual/REPORT.md`:114；`R16-import-and-completion/PLANNER.md`:59 |
| R11-09 | **done（R11a，2026-10-18，App `54e9dc1a5`、Web `22bcd04d7`）**：招待连接在联系人上的展示 | `InviteShareSheet` / `InviteUnlinkSheet` 只在展示页 | `inviteLinkedContactIds` → `sourceChip='self'`；两个 sheet（含「統合する / 別の人」）挂到联系人详情；显示 `publicProfile.offering / seeking`、同步暂停字段 `pausedFields` | `R15-invite-codes/REPORT.md`:82；`R15-invite-codes/REVIEW.md`:145 |
| R11-10 | **done（R11a，2026-10-18）**：人物类型虚线确认卡 | 接口 `contacts/[id]/fit` 和候补决定已就绪 | 画确认卡，✓/✕ 调候补决定接口 | `plan-v2.2/DESIGN.md`:398 |
| R11-11 | **done（R11a，2026-10-18，`22bcd04d7`）**：每天一问卡片挂人脈右栏 | 同 R10-09 | 挂上 | `R16-import-and-completion/PLANNER.md`:59 |
| R11-12 | **done（R11a，2026-10-18，`134716a1c` / `4e020e3f3`）**：删除 `contacts/pipeline`（两端） | 旧页仍在 | 删除 | 归属表 |
| R11-13 | **done（R11a，2026-10-18）**：390 深色开发模式实测水合警告 0（证据 `_evidence-b/R11a/run-01/web/runtime.log`）；`/app/contacts` 390 深色开发模式水合警告 | 旧页不稳定复现 | 重写时消除 | README 合回前（R09 走查 W3） |
| R11-14 | **done（R11a，2026-10-18）**：已读并在 R11a REPORT 补通知；R25 改过乙的文件（`network-opportunities.tsx`、App `ContactsScreen` / `ContactDetailScreen` 等） | 用 REPORT 代替通知 | 开工时读 `R25-plan-review-goals-cleanup/REPORT.md`:132–136 | 同左 |
| R11-15 | **接线 done（R11a，2026-10-18）；W-R30-P03 / A-R30-P08 重跑见 R11-16**：人脈 🔍 与业界筛选参数（R30 交出） | Task 🔍 已接全局搜索（App `/search`、Web ⌘K）；人脈页 🔍 仍是旧行为；搜索空结果「近い条件なら」跳 App `/contacts?industry=<id>` / Web `/app/contacts?industry=<id>`（主 / 副业界 id），人脈页还不读这个参数 | 人脈页 🔍 → App `/search`（可带 `?q=` 把已输入的词带过去）/ Web 打开 ⌘K（派发 `orbit:open-palette`）；人脈列表读 `industry` 预选业界筛选；重跑 W-R30-P03 / A-R30-P08 并点「近い条件なら」确认落地 | `search/DESIGN.md` §2.2 / §4.4；`R30-global-search/REPORT.md` |
| R11-16 | R11a 像素收口（SC-R11a-12 / 13） | 结构、数据、逻辑、两端界面已交；R31a / R31b 在 R11a 收尾时（2026-10-18）才合入，`web-R11a.json` / `app-R11a.json` 画面清单与预检已提交，门禁未跑；要先补人脈设计 fixture（`ORBIT_REDESIGN_MOCK=network`：空 / 5 人 / 286 人三态 + 详情 / 招待 / 确认卡，App 需同样的本机镜像 fixture） | 组件库合入后跑两份清单与 `app-R05.json` A-R05-02 / A-R05-10、W-R12-01～04、W-R15-14、R16「待 R11」画面、W-R30-P03 / A-R30-P08；交 `attribution-redesign-R11a.json` | `R11a-network-list-detail/REPORT.md` |
| R11-17 | 「最近削除した項目」页与到期清除 | 只有软删 + 30 天内恢复（`DELETE /api/contacts/[id]`、`POST …/restore`），过期后数据仍在库里 | 设计稿无 / 下一期：画板 + 列表页 + 到期清除任务 | R11a PLANNER 代定 9；DEFERRED-A |

## R13 / R14 收件箱 · 秘書 · 推送

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R13-01 | Web 受信箱（W-R07-11） | `/app/inbox` 是旧抽屉 `RelationshipInboxPanel inline`，英文空态；起草种子经 `InboxEventBridge` 送入 | 照 b11 C：标题区左「メッセージ・n / 通知・n」分段、中「受信箱 / 未読 n件」、右 ⚙；左列表卡 + 右详情卡 | PA D13；`R07-web-shell/REPORT.md`:21 |
| R13-02 | App マイページ里的「受信箱」行 | R05 有意保留 | 受信箱正式入口（首页 🔔）做完后去掉，和 R18 协调 | PA L689；`R05-app-shell/REPORT.md`:61 |
| R13-03 | `InboxSourceKind` 4 个新值（`event_deadline` / `event_prep` / `event_pick` / `mail_summary`） | 没有生产者 | R13 生产；启用前按 G19 先改 App 宽进读取 | `R08-contracts-and-mocks/REPORT.md`:18,80,95 |
| R13-04 | 推送深链落点 | 只用 `simctl openurl` 模拟；生成方只发 `/tasks/:id` | 按新地址 `/task?seg=` 发、只用合法 `seg`；真机走「点提醒 → 停在 To-do」；不再生成旧地址（名片批次通知已改为 `scan/<id>`） | `R05-app-shell/REVIEW.md`:133,184；`R12-add-cards-and-manual/REPORT.md`:108,112 |
| R14-01 | 推送落地白名单 `notification-model.ts` | 没改，点开落到收件箱 | 加 `/contacts/*`、`/contacts/new/scan/*` | `R12-add-cards-and-manual/REPORT.md`:113；`R15-invite-codes/REPORT.md`:83 |
| R14-02 | 邀请成功的推送 | 只通知邀请人 | 双方都推送（与 R15 一起做）；「邀请被接受」用现有 `contact` / `source`，不加枚举值 | DEC D32；`R15-invite-codes/REPORT.md`:83 |
| R14-03 | 契约 7 `quietStart` / `dailyCap` 等 | 只有 fixture；App `NotificationDeliverySettings.tsx` strict 读取 | 启用前按 G19 处理 | `R08-contracts-and-mocks/REPORT.md`:19,95 |
| R13-05 | App `chat`、`chat/[id]` | 归属表「并入（待核对）」 | 写文档时核对并入还是删除 | 归属表 |

## R17 主催

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R17-01 | b6 主办画板已更新 | — | 危险文字（`.ctx .del`、NFC「つながりを取り消す」）用 `--coral-text`；Step 完成卡用字典文案 | DEC §7（D02 D08 D50） |
| R17-02 | 公开主办方页 `o/[slug]` | 保留旧公开顶栏 | 照 b1 A1 / A2 公开页样式 | PA D14；DEC §3 |
| R17-04 | **App 主办入口**（R17 设计 2026-10-16） | App 里没有任何进 `events/center` 的入口 | R18 重做マイページ时按 b5 放「主催したイベント · N件 · 運営中」行，用 R17 交付的 `HostEventsRow` 组件与 `GET /api/events/center?summary=1`；同时删旧マイページ页签栏的临时「主催」链接（R18-01） | `host/DESIGN.md` §2.12 |
| R17-05 | **主办画面缺画板**（R17 设计 2026-10-16） | — | 已补画（决定表 §38，b12 #396–#475，1fd7313fa / cd29d233a），用户过目认可后按 PLANNER P34–P73 进 R17 门禁（b12 末尾），认可后进 R17 门禁；之前对应画面暂缓 | `host/DESIGN.md` §8、§10 |
| R17-06 | **done（2026-10-17，`3d612635b`）**：**A11 改了 R27 主催卡**（R17 实施 2026-10-16，776e8534） | 第二格标签改为申込回答 Q1 第一选项的文字（「スタートアップの経営者・CFO 41%」），平均参加改为受付人数均值；决定表 §39 已改 b2 #17 / #18 / #19 / #47 与 b12 #326 / #350 / #374 / #376 / #378 / #380 / #386 / #388 / #390 / #394（+1 深色） | 清设计稿缓存后重跑 R27 门禁里用到这些画板的视图（W-R27-17 / 18 / 19 / 20-1024 / 20-390 / 18u / 19u / P41 / 34 / 35、A-R27-14 / 15 / 15u / 16u 等） | 决定表 §39；R17 REPORT |
| R17-07 | **编组 3 轮**（R17 实施） | 现有 event-ops 引擎固定两轮；条件「ラウンド数」只开放 1–2，3 由服务端拒绝（ROUND_COUNT_UNSUPPORTED） | 引擎支持第 3 轮（或用规则从第 1 轮轮换生成并能发布）后放开 | `features/events/host/storage/matching.ts` |
| R17-08 | **done（2026-10-17，`1fcb0a18b`，决定表 §49）**：**按主办方资料关注**（R17 实施，A13） | 关注沿用 R27 的 actor 级 key（`organizerKeyFor`）：同一人几份资料共用关注与フォロワー数 | 产品要「按资料关注」时：关注 key 改为资料 id，R27 探す「あなたのコミュニティ」同步改读法 | `features/events/host/storage/profiles.ts` |
| R17-09 | **受付名单的よみ（かな）**（R17 实施） | live 下名单没有かな来源（kana = null），平假名搜索只在 mock 生效；姓名 / 公司汉字搜索可用 | 资料或报名加「よみ」字段后接上 | `features/events/host/live.ts` kiosk |
| R17-10 | **申込推移的节点标注**（R17 实施） | 契约加了可选 `HostReportAll.trendMarks`（告知メール / 登壇者発表），mock 有值；live 没有来源，缺省时不画标注 | 有「告知メール发送」「登壇者発表」等事件记录后在 live 报告里填 | `features/events/host/live.ts` report |
| R17-11 | **done（2026-10-17，`1fcb0a18b`，决定表 §49）**：**名簿の取り込み照合**（R17 实施，b12 #476） | 导入 CSV 后三类计数（申込済み / 登録済み / 未登録）没有接口，全部显示「照合待ち」；招待链接没有 `?inv=` 参数 | 补照合接口（按邮箱匹配账号与报名）与招待参数 | Web `orbit-2026/host/` 导入组件 |
| R17-12 | **レポート自分の視点「追加する」**（R17 实施） | 没有进度日志写入接口，现链到 `/app/plan`；「下書きを作成」链到联系人页（无 contactId 时按名字搜） | 计划侧提供「从活动追加进度」接口后接上 | Web report 组件 |
| R17-13 | **done（2026-10-17，`d87755d3e`）**：**kiosk 定員超え确认的数字**（R17 实施，b12 #434） | `/kiosk` 不返回承認済み / 定員，确认框正文不写「150 / 150」 | kiosk 读模型加这两个数 | `features/events/host/live.ts` kiosk |
| R17-14 | **已做（73c986b05）**：Web 壳ログアウト / App signOut 清整个本机受付库；启动清过期、失权清这场。原记录： **登出时清 kiosk 本机名单**（R17 实施） | 现为 `/kiosk` 返回无权限时清；没接全局登出事件 | 壳提供登出钩子后接上（两端） | kiosk 页 |
| R17-15 | **公开主催页「通報する」**（R17 实施） | 没有反馈表单，现为弹层 + 复制页面 URL | R29 运营后台 / 反馈表单就绪后接上 | Web `/o/[slug]` |
| R17-16 | **done（2026-10-17，`cb02fda4f`）**：**App `/e/[slug]` 取活动 id**（R17 实施） | 没有 slug → 活动 id 的接口；App 请求 Web `/e/<slug>` 跟随重定向、从最终地址取 id（离线读取扫描用别名绕开，代码有注释） | 补 `GET /api/events/by-slug/[slug]`（只认已公开）后 App 改调它 | `repos/orbit-app/src/screens/host/EventShortLink.tsx` |
| R17-17 | **组件库 G23 两处**（R17 实施） | Web P26 共同運営者抽屉：Drawer 没有 540 宽、内边距 20≠22；App P05：Segmented 高 38≠30。两画面标「待组件库」未过门禁 | 组件库补尺寸后重跑 W-R17-P26、A-R17-P05 | `views/web-R17.json`、`views/app-R17.json`  **R31a 2026-10-18：App 部分 done：A-R17-P05 浅深在 16e 重比通过（R31a 重比，归因见 attribution-redesign-R17-app.json）；Web P26 归 R31b** |
| R17-18 | **done（2026-10-17，`571c0d6f6`）**：**编组发布与参加者通知不在同一事务**（R17 独立复核） | 发布成功后另开事务写「テーブル編成を公開しました」outbox；这一步失败时重试会因已发布被拒，通知补不上（幂等键已有，重复写安全） | 发布接口对「已发布且同一 generation」直接补写通知（或 publishGeneration 增加同事务钩子） | `features/events/host/live.ts` publishMatching |
| R17-03 | 主催入口 | Web 临时入口在マイページ页签栏（见 R18-01）；头像菜单不放主催 | 与 R18 协调正式入口 | DEC D18 |

## R18 账户

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R18-01 | **Web マイページ「主催」入口** | R07 返工时在旧マイページ页签栏**临时**加「主催」链接到 `/app/events/center`（不高亮），为手机 Web 能进主催页 | 按设计稿重做マイページ时做正式入口；头像菜单按 b12 W-R07-07b 只留 マイページ / 言語 / 外観 / ログアウト，設定和主催从マイページ进 | DEC D18（2026-10-12 更正）；README 合回前；R07-RW REWORK-REVIEW:171 |
| R18-02 | App マイページ（A-R05-11） | 不用 `AppScreen`，只加 `ShellBackBar` 和「受信箱」次入口 | 「← 白圆 · マイページ +『プロフィール 60%』· ⚙ 白圆」整屏重写 | PA L684–692；`R05-app-shell/REPORT.md`:18,61 |
| R18-03 | App 启动「正在确认登录状态…」显示了底栏（R09 走查 A2） | 外观问题 | 启动 / 认证态不显示底栏 | README 合回前 |
| R18-04 | 公开页（落地页、登录页背景） | 旧顶栏 | **已定（2026-10-12）**：照 b1 A1 / A2 设计稿重画（不再是「只换 token」），过像素门禁；归属表已改 | PA D14；DEC §9-2；归属表 |
| R18-05 | ご利用プラン | 不做 | 本期不做付费；b4 两块画板作废；見直し用完不出「ご利用プランを見る」 | DEC D55 D56 |
| R18-06 | 契约 11（导出、退会、`/api/app/version`） | mock / 503 | 做 live；首次正式发布时启用 `minSupportedAppVersion` 启动检查 | `R08-contracts-and-mocks/REPORT.md`:23,61；README 合回前 |
| R18-07 | 注册回跳与マイページ「招待コード」入口 | `profileContinuationPath` 已追加 `next=/i/<码>` 直接回去 | 知悉；マイページ「招待コード」链到 `contacts/new/invite`；注册走旧英文弹窗、不跟深色的问题随 D31 / D14 一起改 | `R15-invite-codes/REPORT.md`:81；`R15-invite-codes/REVIEW.md`:115 |
| R18-08 | 头像菜单「参加するイベント」 | 按 D18 推荐版去掉了，现在没入口 | 在マイページ或イベント里给出入口（与 R26 协调） | `R07-web-shell/REVIEW.md`:162；R07-RW REWORK-REPORT:26 |
| R18-09 | 有未同步修改时注销用动作表 | R04 做法 | 产品负责人事后确认 | README 合回前 |

## R19 iOS 小组件

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R19-01 | 小组件读计划分数 | — | 和首页同一接口 `plans/v2/summary` | `plan-v2.2/DESIGN.md`:397 |

## R20 Task

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R20-01 | **App Task 左上 🔍** | 临时接人脉搜索（跳 `/contacts/list`）：App 还没有全局搜索；Web 的 🔍 打开 ⌘K | **已定（2026-10-12）**：正式全局搜索归新开的 **R30 搜索**（甲）；R20 重写 Task 时保留这个 🔍，R30 做完后改接全局搜索 | `repos/orbit-app/src/screens/task/TaskScreen.tsx`:103–107 |
| R20-02 | **Web メモ标题区「＋ メモを追加」** | メモ段是「まもなく」空态，标题区缺按钮，W-R07-TmemoH 不过门禁 | 做出 Web メモ（左列表 + 右详情），补按钮并过门禁；不改页签、键盘和 `?tab=` | README R07 行；R07-RW REWORK-REPORT:12,67,110 |
| R20-03 | 四段内容（A-R05-04/05/07、W-R07-08/09/10） | App：calendar = `ScheduleScreen`、todo = `TaskQuickAdd` + `TasksScreen`、memo = `NotesScreen`；Web：カレンダー是旧个人日程、To-do 是旧英文页 | 照 app.html / web.html 与 b11 E 整屏重写：To-do 顶部直接是「判断待ち」；メモ段不要页内大标题；右上主按钮「＋ 予定 / To-do / メモを追加」 | PA D03 D10 D11；`R05-app-shell/REPORT.md`:12,89 |
| R20-04 | Task 默认段 | 记住上次那一段 | 保留（01-system ⑳ 已补规则） | DEC D04 |
| R20-05 | Task「＋」聚焦、键盘弹出时底栏隐藏、断网保存 Toast | 实现自加 | 照 b12 A-R05-13 / 13b（N04） | PA N04 |
| R20-06 | Task 右栏「次の一手 · Taskから」 | 没有内容 | 由 R20 / R10 填 | R07-RW REWORK-REPORT:114 |
| R20-07 | App メモ「＋」断网禁用 | 读 `serverReachability` | 换段内容时保留这条规则；`/notes?contactId=` 保留为独立二级页 | `R05-app-shell/REVIEW.md`:140,187；`R05-app-shell/REPORT.md`:60 |
| R20-08 | App 手入力「メモ」 | 存成联系人备注 | 进 Task › メモ（可 @人），メモ模块做完后接上 | DEC D27 |
| R20-09 | 人物タイプ詳細「やること」、契约 10 `planLink` | `planLink` 只在契约里 | 落库；类型详情显示挂在类型下的 To-do；「プランに追加」写 `planLink` | DEC D52；`R22-plan-data-and-score/REPORT.md`:48,94 |
| R20-10 | 面谈メモ判定 C11 | live 下没有触发点 | memo「プランの話せた に使う」保存时带 `usedForPlan` | `R24-plan-overview-and-types/REPORT.md`:104,116 |
| R20-11 | 待确认草稿页 `contacts/new/drafts` | 过渡落点；App「破棄」只在本机隐藏 | 判断待ち接上后删掉此页，并定服务端丢弃做法 | `R12-add-cards-and-manual/REPORT.md`:73,115 |
| R20-12 | 判断待ち列出计划待确认项、每天一问卡片 | `GET /api/agent/plans/v2/pending` 已有；卡片组件未做 | 按需接入；卡片挂判断待ち | `plan-v2.2/DESIGN.md`:399；`R16-import-and-completion/PLANNER.md`:59 |
| R20-13 | 契约 5（笔记 `noteKind`，`NoteMentionContract` 提及活动仍要求 `contactId`）、契约 10 `tasks.deferralCount` | 只有 fixture | 接入真实字段；活动提及按 `BREAKING.md` 改或另加 `NoteEventMentionContract` | `R08-contracts-and-mocks/REPORT.md`:17,22,93 |
| R20-14 | 删除 `TodayScreen` | 无路由渲染，文件还在 | 删除 | `R05-app-shell/REPORT.md`:57,106 |
| R20-15 | 未截画面 A-R05-06（To-do 空态）、A-R05-08（横滑） | — | 无待办账号补截；横滑不截静态图 | PA L142/144 |
| R20-16 | `/app/tasks` 未登录跳登录时 `next` 丢掉 `new=1` 和 `plan` | 沿用旧写法 | 保留这两个参数 | `R25-plan-review-goals-cleanup/REPORT.md`:217 |
| R20-17 | 旧页面控制台噪音（示例 id 404、`/app/agent/actions` 重复 key） | 登记给本 Sprint | 重写时清掉 | `R09-skeleton-acceptance/walkthrough.md`:44 |

## R21 iOrbit

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R21-01 | App iOrbit 全屏（A-R05-09） | 旧 AI 页「‹ ホーム」+ 历史钮、两行输入框 | 照 b11 F ②③：≡ / ✕ 白圆、纯文字标题、左缘右滑退出、单行胶囊输入栏 | DEC D06；PA L673–682；`R05-app-shell/REPORT.md`:64 |
| R21-02 | Web iOrbit（W-R07-12） | 旧仪表盘，中英混排，深色仍浅 | 起始页：≡ / 两行标题 / ＋ 新しい会話、2×2 建议卡、720 宽输入框；全日文；深色 | PA D09 L312–320 |
| R21-03 | iOrbit 输入区隐私说明 | D16 删了 ⌘K 下的说明行，隐私边界由回答侧保证 | 重写输入区时保持隐私边界 | DEC D16；R07-RW REWORK-REPORT:28 |
| R21-04 | 计划生成流程挂进 iOrbit 页 | 生成流程是独立「プランを作る」页 | 与 R23 返工配合：iOrbit 页头、左栏高亮 iOrbit | PA X05 |
| R21-05 | v1 计划残留：`home-plan-events-actions.ts`、`resolveHomePlanEventCandidates`、`iorbitPlanWeeks`、`iorbitStrategyView`、v1 `/api/agent/plans/candidates`、v1 续订服务 | 保留 | 重写时清掉或改接 v2 | `R25-plan-review-goals-cleanup/REPORT.md`:138–142 |
| R21-06 | 计划深链与会话列表 | 接口已就绪 | 接 `planReviewHref` / `planDoneHref` / `planNewGoalHref`；`GET /api/agent/plans/intakes` 列进会話リスト；「本周推进」改接 v2 | `R25-plan-review-goals-cleanup/REPORT.md`:63,219–222 |
| R21-07 | 右栏示例问题 | 点一下直接发给 iOrbit（会产生付费调用） | 保持（对标 ChatGPT / Gemini） | R07-RW REWORK-REPORT:115 |
| R21-08 | App iOrbit 旧屏标题最大字号换行 | 已知例外 | 重写时修 | `R09-skeleton-acceptance/walkthrough.md`:32 |
| R21-09 | 会話搜索接口（R30 搜索的「会話」组） | R30 live 不画「会話」chip：`features/search/global/live.ts` 的 `conversations = null`，响应 `types` 不含 `conversations`（DESIGN §10 A1） | 交付 `searchConversations(actorId, q, limit)` → `GlobalSearchConversationHit[]`（`id`、`kind: "iorbit" \| "inbox"`、`title`、`subtitle`「日期 · 来源」、`highlights` 码点区间（可直接用 `shared/compute/search-highlight.ts` 的 `highlightsFor`）、`href`；只读本人数据）；接到 `live.ts` 的 `conversations` 后 `types` 自动出现第四个 chip；补 live 四 chip 回归，重跑 W-R30-P01 / A-R30-P06 | `search/DESIGN.md` §3.2；`shared/contract/global-search.ts` |
| R21-10 | ⌘K「iOrbit に聞く」/ ⌘↵ / 「紹介ルートを聞く」只预填 | Web：`useOrbitAsk().prefill` → `stashAgentPrefill({ origin: null })` → 工作台 `takeAgentPrefill()` 填进输入区，用户自己发送（`origin: null` 的预填按普通提问发出）；App：`registerAiTemplatePrefill`（entryPointId `ai.new_chat`，template `search.ask_iorbit`）→ `/ai/new?prefillIntent=` | 重写输入区时保持「只预填、不发送」和这两条交接通道 | `search/DESIGN.md` §1 / §4.5；R30 复核 M1 |

## R26 / R27 活动

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R26-01 | App イベント顶栏和分段（A-R05-03） | 旧屏 | 「🔍 · イベント +『10月 · 参加予定 3件』· 📅」+「評価 / 参加予定 / 探す」三段胶囊 | PA L631–639 |
| R26-02 | 活动报名码叫法 | 实现已叫「参加コード」 | 保留；界面上还叫「招待コード」的地方改掉 | DEC D33；`R12-add-cards-and-manual/REPORT.md`:116 |
| R26-03 | 计划里「会える活動」 | live 下为空（`PLAN_LIVE_EVENT_FACTS_READY=false`） | 补参加者构成、费用、移动时间、交流形式事实后打开（有界读取：未来 60 天、≤20 场）；概要、类型详情、内訳都显示 | DEC D53；`R25-plan-review-goals-cleanup/REPORT.md`:223–226 |
| R26-04 | 工作人员代签没接 v2 计分 | — | 签到时调 `recordEventAttendanceForPlans` | `R24-plan-overview-and-types/REPORT.md`:100 |
| R26-05 | 活动用的计划接口 | `addEventToPlan`、`planRemainingTargets`、`event_assessment` 已就绪；契约 8 权重 45 / 15 / 20 / 10 / 10 | 复用，不另起形状；契约 8 / 9 做 live | `R22-plan-data-and-score/REPORT.md`:97；`R08-contracts-and-mocks/REPORT.md`:20–21 |
| R26-06 | 手入力「出会った場所」活动候选 | 用过去 30 天内已开始的活动 | 有「我参加过 / 将参加」接口后替换 | `R12-add-cards-and-manual/REPORT.md`:67 |
| R26-07 | 每天一问的活动选项来源 | 用联系人 `metEventId` + 最早录入时间 | **已定（2026-10-12）**：R26 完成后改用参加记录 + 活动开始时间 | `R16-import-and-completion/REPORT.md`:32–36 |
| R26-08 | 未登录活动列表 / 详情公开顶栏 | 旧顶栏 | 照 b1 公开页 | PA D14 |
| R26-09 | `/app/events` 1440 水合警告、`/live` 403 控制台噪音 | 旧页 | 重写时消除 | README 合回前（R09 走查 W3、W5） |
| R26-10 | 「探す」页签内容（SC-R26-14） | **done（R27，2026-10-15）**：两端「探す」已换新（Web DiscoverTab、App DiscoverPage）；App `EventsScreen` 已删（`b220b6420` 之后一提交），Web `events-list` 随 R27 旧屏清理删除 | — | R26 REPORT SC-14 |
| R26-11 | App R26 像素（app-R26.json 11 张） | **done（2026-10-15，`de9f32ac5`）**：通过 20 浅深、20d、21 / 22 / 23 / 24 浅深（11 张；24 由 `493b27ca0` 契约只加 `adoptedGuessFields` 解决）；**待组件库** 13 / 14 / 15 / 30 / 30e 浅深（`Segmented` 38 vs kit `.seg` 30，G23；临时补丁下 10 张全部通过） | G23 修 `Segmented` 后重跑 13 / 14 / 15 / 30 / 30e（`R26-app-agate.sh`，mock 端口以实际为准） | R26 REPORT「App 像素返工」  **R31a 2026-10-18：done：A-R26-13 / 14 / 15 / 30 / 30e 浅深 10 张在 iPhone 16e（Orbit Line A 16e）重比全部通过（Segmented `7457b4cc0`）** |
| R26-12 | **done（2026-10-17，`bc51f78a2`）**：「参加予定」卡分数（复核 M4） | 显示评估当时的分 | 按当前计划现算（需把计划类型接进「我的活动」读取） | R26 REPORT |
| R26-13 | Web R26 余项 | 1024 的 10 / 11（b12 #332 / #334 与 b8 #0 截断口径不一）、全部 390、P04 / P06 / P08 未过 | 先统一画板口径再对齐 | R26 REPORT「收尾」 |
| R27-01 | App `Segmented` 高 38 vs kit `.seg` 30 | A-R27-06 / 07 / 08 / 16 / 26 / 29 / 31 / 33 / 34 待组件库；seg 临时补丁下各带 dy ≤4 | G23 修后重跑这些视图（`scratchpad` 的 appgate 做法见 R27 REPORT；`views/app-R27.json`） | R27 REPORT §3；DEFERRED-A §1  **R31a 2026-10-18：Segmented 已对齐（`7457b4cc0`）；A-R27-16u 深通过；06 / 07 / 08 / 29 / 31 / 33 / 34 分段区不再超阈，剩余为页面自身差异（chip 位置、轮播卡高度、搜索框 placeholder 色 [contrast] 等）→ 交还 R27（见 R31a REPORT 交还清单）；A-R27-26 另卡 expo-brightness** |
| R27-02 | App `FilterOption` / `Toggle`、`Toast`（带 ✕、不知道会场自带底栏） | A-R27-09 筛选弹层、A-R27-35 交換 toast 待组件库 | 组件库对齐后重跑 09 / 35 | DEFERRED-A §1  **R31a 2026-10-18：FilterOption / Toggle / Toast 已对齐（`7457b4cc0`），会場页 usePageBottomBar；A-R27-09 / 35 重比仍有页面自身差异 → 交还 R27（见 R31a REPORT）** |
| R27-03 | 受付「画面を明るくしました」与 メモ的设备端语音转文字 | 本轮没加原生模块：受付卡只写受付番号，🎙 聚焦输入框（系统键盘听写） | 懒加载 expo-brightness 与语音识别模块 + 权限文案 + 重建 dev client，再重跑 A-R27-26 / 33 | DEFERRED-A §3 |
| R27-04 | `legacy-ui-ratchet` 三处手写件（DiscoverPage 全屏搜索 `<Modal>`、詳細 `.utabs`、会場 livebar） | 主会话 10-15 定：记入 `tests/fixtures/legacy-ui-deferred.json`（带注释，条数须等于实际） | 组件库补 UnderlineTabs / 可配置 TabBar / 全屏搜索页后替换并删白名单行 | R27 REPORT §6  **R31a 2026-10-18：done（`ef8ecc9d1`）：DiscoverPage → FullScreenSearch overlay、詳細 → UnderlineTabs、会場 → TabBar variant="live"，legacy-ui-deferred.json 清空** |
| R27-05 | App 新详情 / 会う準備 / 会場 / 会後是 online-only | 旧屏的离线副本随旧屏删除 | 产品定是否给新屏补离线副本（0115 / 0131 的做法） | R27 REPORT §6 |

## R28 引导

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R28-01 | 示例计划拦截写操作 | 只显示「サンプル」标签 | 照 01-system c-sample 和 b1「药丸 + 写操作拦截」；写入被拒照 b12 N12 / N12b | DEC D51；PA N12；`R25-plan-review-goals-cleanup/REPORT.md`:227 |
| R28-02 | 示例期 Task › プラン 示例横条 | 删掉了 | 恢复（与 R28-01 一起） | DEC D60 |
| R28-03 | 引导「生成计划」一步 | 旧 `/app/start` 第 3 步客户端跳到 v2 目標入力 | 用 `POST /api/agent/plans/intakes`（`source:"onboarding"`）拿 `href` | `R23-plan-generation/REPORT.md`:78 |
| R28-04 | Web 引导 / 开始指南的旧 `card-batch-ui`；App `start.tsx` 跳 `/profile/onboarding` | 允许清单里保留 | 重写时去掉旧组件、删清单行；App `/start` 按用户决定做引导页，`route-parity` 归零 | `R12-add-cards-and-manual/REPORT.md`:75,117；README 合回前 |

## R29 运营后台换新

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R29-01 | 后台页面（`admin`、`platform`、`read-cost`、`login-admin`） | 旧样式，无设计稿 | 只换新 token 和新组件，不重画；负责人写文档时由用户指定；不适用逐像素门禁，但适用 G02 / G03 / G20 | 归属表「已决定 #2」 |

## R12 / R15 / R16 加人与邀请的界面返工

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R12-01 | 加人全部画面逐像素返工 | 界面保留、未过门禁（返工排第 5 位） | 交 `attribution-redesign-R12.json`；Web 入口照 b12 W-R12-01 弹窗（不用 -B）；补画画板 W-R12-05、11、12a～c、N08、N08b、N09～N12b 照做 | DEC D20、§4；PA §5 |
| R12-02 | Web 手入力抽屉（W-R12-02～04） | 贴边抽屉，多出役職 / メール / 電話 | 浮起圆角卡；字段只留 名前 / 会社 / 出会った場所 / メモ + 署名粘贴；⌘↵ 在保存钮里；W-R12-04 出现重複候補卡 | DEC X11 X11f；PA L322–351 |
| R12-03 | 名刺（相机、读不出、上传格式、表裏） | 保留现在 | 相机无实时提示 / 自动拍（下一期）；读不出两种原因；格式「JPG · PNG · HEIC」不收 PDF；表裏手动「前の名刺の裏にする」——设计稿都已改，按新画板验收 | DEC D22–D25 |
| R12-04 | 名刺完成页「プランに関係しそうな人」 | 只给「プランで見る」链接 | 列出人，要新接口（按这批名片查计划候补）；Web 照 b12 W-R12-11 | DEC D26 |
| R12-05 | 粘贴签名、b7 全字段版 | — | App 不做、Web 保留；b9 App 两块与 b7 8 块作废 | DEC D28 D29 |
| R12-06 | 招待、連絡先、LinkedIn 入口 | 隐藏；Web「その他」进旧导入页 | R15 / R16 上线时打开，5 个门都显示 | DEC §3 D21 |
| R12-07 | 未截 W-R12-07～10 | 会调付费 OCR | 固定识别结果补截 | DEC Q4 |
| R15-01 | 发出方 / 接收方逐像素返工 | 40 张比对 0 通过 | 按 `R15-invite-codes/REVIEW.md`:96–121 列的结构偏离逐条改；码 8 位不带姓名（示例 `7QKM-H4TR`）；受邀注册按新画板；双方推送 | DEC D30–D32；`R15-invite-codes/REVIEW.md`:96–121 |
| R15-02 | **已定（2026-10-12）** P1 / P2 | 按实现先做（P1 现在是重新发码） | P1 照稿做：补「修改当前招待码的分享内容」接口，码不变，由加人会话实现；P2 App 接收页去掉「アプリは不要」、Web 保留（用户认可的例外，b11「④ 受け取った側 · 登録」画板已改）；DESIGN §10 #7 兑换只记「可能同一人」仍按 add-and-invite DESIGN | DEC §9-3、§9-4；`R15-invite-codes/REPORT.md`:70–77 |
| R15-03 | App「コピー」 | 弹系统分享面板 | 用 `expo-clipboard` 直接复制（R24 同） | DEC D44 |
| R15-04 | 门禁没跑成的画面（期限切れ / 满员、注册后资料页、App 说明页、App 日语） | 本机没数据 | 造数据补跑 | `R15-invite-codes/REVIEW.md`:123 |
| R16-01 | 两端导入界面 | **已做（2026-10-14）**：Web `/app/contacts/new/import`（选门 / vCard / LinkedIn / CSV / イベントから → 列の対応 → まとめて確認 → 完成），App `contacts/new/import`（連絡先 / LinkedIn）；旧 `network-import*` 已删，`?method=` / `?import=` 重定向 | Web `Chip` apricot 字色（G23b）与 App `Segmented` 高度（G23）在组件库轮修，修完补跑 W-R16-08 浅、A-R16-02 | `R16-import-and-completion/REPORT.md` 界面部分  **R31a 2026-10-18：R31a：A-R16-02 分段区已对齐，余带为页面自身（列表尾部行偏移、头像色 [data]）→ 交还 R16（见 R31a REPORT）** |
| R16-02 | 每天一问题型 | 两种 | 本期两种；b9「字段冲突 · 転職」下一期，不进门禁 | DEC D34 |
| R16-03 | **已定（2026-10-12）** | 现做法见左 | LinkedIn 导入的人用 `connectedOn` 作加入时间；当天导入后当天可以出题（维持现状）；活动选项来源见 R26-07 | DEC §9-5、§9-6；`R16-import-and-completion/REPORT.md`:32–36 |

## R22–R25 计划 v2.2 的界面返工与遗留

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R23-01 | 生成流程改 iOrbit 对话式（W-R23-04～13、A-R23-04～11） | 表单页单列块 | 照 PA X05 与共性问题改；目的阶梯 4 级、≤5 問预选；背景可回改（改了重新出题先确认）；右栏「わかったこと / このあと」与 AI 修正 | DEC D37 D38 X02 X05；PA L408–457 |
| R23-02 | 手動編集 | App 上下移动按钮；Web 合计条在底部 | App 长按拖动；Web 页头 + 右栏「変更点 / 合計 100」；有得分的类型不能删、每次見直し后再给 1 次（保留） | DEC D36 D39 D40；PA L460–467 |
| R23-03 | 题库选项与能力名 | Sprint 自写文字 | 保留（设计稿已按实现改），产品负责人过目三语文字 | DEC D35；`R22-plan-data-and-score/REPORT.md`:98 |
| R23-04 | 390 プラン空状态、目標入力 | 沿用桌面 / 有返回链接 | 按 b10 ①（b8 第二张作废）；目標入力照 PA L364–384 | DEC D41；PA |
| R23-05 | b12 补画（W/A-R23-02a～c、N17a/b、N19、W-R23-16a～g、N14、N20 等）；STALE 统一灰色降级条 +「最新を読み込む」 | — | 照做 | DEC §4；b12 复核 M2 |
| R24-01 | 概要（W-R24-01/02、A-R24-01～04） | 无右栏、三列 | 用壳 `rightRail`；底部满宽イベント卡；按钮「目標を達成した」；App 今日のチャンス卡加「面談を提案」、「全文」可折叠 | DEC D47 D54 X08 X09 |
| R24-02 | 人物タイプ詳細、記録弹层 | Web 弹层 420；无语气 chip | Web 380（D42）；依頼文「丁寧に / 短く」两套固定模板（D43）；opener 共用一句（D48 保留）；面談を提案默认时段可调、只出草稿（D45 D46） | DEC D42 D43 D45 D46 D48 |
| R24-03 | 前提を見る、Step 完成卡 | 只读；模板文案 | 保留；照 b12 W-R24-03 / A-R24-05；完成卡「「{Step 名}」は完了しましたか？」 | DEC D49 D50 |
| R25-01 | 目標を編集 | 可编辑目标文，两个出口 | 只改说明直接保存（契约加「背景説明」字段）；其余照 PA L572–588 | DEC D59；`R25-plan-review-goals-cleanup/REPORT.md`:215 |
| R25-02 | 目标切换、完了页、見直し页 | sheet；简版完了页 | App 改 popover；Web 完了页大达成卡 +「次の目標」候选（若要新 AI 调用先拍板）；見直し右栏、AI 修正卡标本月次数 | DEC D58 X07 X10 |
| R25-03 | 以前のプラン两端用词不同（Web「見るだけ / 進行中」、App「閲覧のみ / 未完了」） | 两端不同 | **已定（2026-10-12）**：两端统一，以设计稿画板上的用词为准；由计划页会话实现 | DEC §9-8；b12 复核 L6 |
| R25-04 | 旧计划链接换新、删兼容跳转 | **已完成**（2026-10-11，`tests/audits/no-legacy-plan-links.test.ts` 锁住） | 不要再生成旧地址；新链接一律用 `shared/compute/plan-href.ts` | README 合回前；`R25-plan-review-goals-cleanup/REPORT.md`:144–163 |
| R24-04 | **照设计稿去掉三个现有功能**（2026-10-12 定） | 实现里有：候补每行的 ✓ / ✕、「話した人」逐条取り消す、1024 宽度下的「前提を見る / 手動で編集」 | 三项都去掉，照设计稿；由计划页会话实现 | DEC §9-10 |
| R22-04 | **成员関わり方 / 追加能力**（今后功能，2026-10-13 定） | 不存在：メンバー追加的「できること」预览里不画「＋ その他」与「関わり方：業務委託 · 変更は ✎」（b12 W-R23-06 已去掉） | 将来要做时需改数据模型与契约；做了之后画板加回这两处 | DEC §16-1 |
| R22-05 | **自由回答を各問に振り分け**（今后功能，2026-10-14 定） | App ≤5 問画板去掉底部输入栏（「まとめて書いても OK です」+ 发送）：没有接口，回答按题提交；「確定した前提」画板同样去掉底部「前提について補足する」输入栏（§27-1），前提只能逐行改 | 将来做「一段自由文字自动拆到各题」需要付费 AI 与新接口；做了之后画板加回输入栏 | DEC §24 |
| R22-01 | 未截画面（A-R23-03/06/07/12～19 等） | 本机 App 初版生成失败；达成不能撤回 | 先查清本机 live「初版をつくれませんでした」原因，再用只读 mock（:3002）补截 | PA §4.2；DEC Q4 |
| R22-02 | **待授权（生产）** | 只在本机 | 迁移 `plans-v2-model`、`ai-usage-plan-v2-purposes` 必须先迁移再部署；`ORBIT_PLAN_V2_AI=ai` 开关；staging / 生产付费 AI C1–C12；月上限（`plan_background` 10→20、`plan_review` 3→6、C1 是否拆用途）待用户拍板 | `R22-plan-data-and-score/REPORT.md`:99–103；`R23-plan-generation/REPORT.md`:118–121；`R25-plan-review-goals-cleanup/REPORT.md`:197 |
| R22-03 | 遗留小项 | 未做 | 生成流程「放弃」入口与 `abandoned` 状态；只剩已达成目标的人进不了完了页；候补被记录又撤销后不回候补表；v2 类型 `status` 口径；`review_used` 按月查、`exists` 预查 | `R23-plan-generation/REVIEW.md`:265；`R25-plan-review-goals-cleanup/REPORT.md`:216；`R24-plan-overview-and-types/REPORT.md`:83；`R22-plan-data-and-score/REPORT.md`:107–108 |
| R23-06 | **计划页像素返工（2026-10-12）未过的生成流程画面** | W-R23-11～15、17、18 未过：引用只能取真实库、题库文字（D35）、方案名由数据推出，长度不同整体下移；17 / 18 画板是改到一半的状态；W-R23-06 mock 候补来自 `mock-flow-context` 写死的演示联系人（最多 20 人，画板 3 人且已勾选一人） | 结构已逐块对齐；要过线需让 mock 候补读 fixture 联系人（服务端 mock 文件，先 impact），或由用户确认这几张按数据差异放行 | `R25-plan-review-goals-cleanup/REWORK-REPORT-web.md` |
| R24-05 | **待组件库**（计划页返工发现，R04 / R06 组件库轮做） | 调用方用现有 Modal / Drawer | Web Modal 加 380 宽一档、标题左侧可放图标块、可不带 ✕（W-R24-03 / 09b / 11）；Drawer 的 ✕ 白色圆底、标题下副标题（W-R24-12）；Chip 字色 kit 用 `-ink`，实现用 `-text` | REWORK-REPORT-web → R31a / R31b（2026-10-18） |
| R24-05b | 组件库轮做完后重比（Web 计划页像素门禁） | 未过，待组件库 | 重跑 `web-plan-A.json` 的 W-R24-03 / 09b / 11 / 12 与 `web-plan-B.json` 的 W-R23-06（弹窗整体约 3px 位移），过了把 REWORK-REPORT-web §2 改成通过 | REWORK-REPORT-web §10 第 4 轮 |
| R24-06 | **done（R26 收尾，2026-10-15）**：推荐活动行、今日のチャンス、Step ↔ 活动、「最近の加点」含スキップ、最终接点相对时间、依頼文两种语气由服务端给、「いつ」传 at、見分け方 / 人物像键值行全部完成 | — | 概要推荐活动列表；Step ↔ 活动；「最近の加点」含スキップ；今日のチャンス依据与按钮文案；最终接点相对时间；依頼文两种语气由服务端给；记录弹窗「いつ」传 at（服务端已支持，界面待接）；見分け方分类与人物像键值行 | DEC D53；REWORK-REPORT-web |
| R24-06b | R26 做完后重比（Web 计划页像素门禁） | 2026-10-15 重比：01 / 02（1440 / 1024 / 390）/ 04a / 04c 通过（`[data]` 归因见 attribution-redesign-R23-25.json）；05–08 未过（候补行接点说明 / 根拠多行 / 推薦度属数据来源，契约无接点来源字段）；C 组整屏背景页不同，暂缓 | 重跑 `web-plan-A.json` 的 W-R24-01、02（1440 / 1024 / 390）、04a、04c、05、06、07、08，以及背景是概要页的 C 组 W-R25-01 / 02 / 07 / 09 / 10 整屏 | REWORK-REPORT-web §10 第 4 轮 |
| R24-07 | **待壳**：Task 1024 标题区多出「目標を追加」 | TaskContainer 自加的按钮（b8 只有「次の一手」） | 去掉；另一会话在改 `orbit-2026/task/TaskContainer.tsx` | REWORK-REPORT-web |
| R24-08 | **待画板口径**（2026-10-12 已转用户） | 实现取类型卡口径 / 服务端排序 / 短名 | b8 類型名长短（確認待ち「VC」vs 話すべき人「VC パートナー」）；CVC 页活动顺序（画板 79 / 68 / 82，服务端按分数降序）；#17 Step 3 chip「3 / 3人」vs 类型卡「2 / 3人」。定后 design-decisions 改画板，计划页会话单独重比 W-R24-02 / 04c / 06 | REWORK-REPORT-web |
| R25-05 | **done（2026-10-17，`2dcd114dc`：脚本收进 `scripts/visual/plan-rework/`）**：**像素门禁的设计稿示例 fixture** | `features/plans/v2/design-fixtures`（只在非生产、mock 下由 `route.dev.ts` 切换）；B 组门禁前跑 `seed-local-chats.mjs`（只写本机库 qa 账号）；C 组造見直し状态的脚本还在会话 scratchpad | fixture 只能补数据、不能改画面结构；C 组的状态脚本（setup.py / all.sh）收进 `scripts/visual/` 再供复跑 | REWORK-REPORT-web |
| R24-09 | **App 计划概要画板的弁護士卡已变**（916b9f6b：共享数据里弁護士 会える活動 0 → 2；Web 端已在 2026-10-13 重比） | App 计划页门禁还用旧图 | App 计划页那一轮清缓存、重新截图后再比概要画面 | 916b9f6b；`R25-plan-review-goals-cleanup/REWORK-REPORT-web.md` §10 |
| R24-05c | 组件库轮做完后重比（App 计划页像素门禁） | 未比，待组件库 | 重跑 `app-plan-A.json` 的 A-R24-05 / 12 / 13 / 16 与 `app-plan-C.json` 的 A-R25-01 / 08 / 11 / 12（Sheet / Dialog / Popover，均需手点到状态后 `shot.py`） | REWORK-REPORT-app §4-10  **R31a 2026-10-18：Popover 已新建（`a37d0f551`）；A-R25-11 目標切替是 .gmenu 弹出菜单、行结构不同 → 改页面结构，交还计划页（RD-33）；其余 A-R24-05 / 12 / 13 / 16、A-R25-01 / 08 / 12 需中途状态开关，R31a 未重比（见 REPORT）** |
| R24-06c | R26 做完后重比（App 计划页像素门禁） | App 概要推荐活动行、イベント前缀、Step 5 后半句、新计划无 Step chip 已接（R26 收尾）；重比未跑，随 App R26 像素返工一起跑（模拟器 iPhone 16e (r26)、`open-path` 开关） | 重跑 `app-plan-A.json` 的 A-R24-01 / 04（概要推荐活动行）与 A-R24-06a / 06c（確認待ち，概要页内区块，2026-10-14 第 3 轮收口时一并暂缓）；同时把 R24-09 的弁護士卡新图一起清缓存重比 | REWORK-REPORT-app §2 A 组 |
| R24-10 | App 排版全局口径 | **已定并落实（2026-10-14）**：§19（折行 / 字形 1–3px 记 `[raster]`、标点挤压 UiText 做一次（2c514420 / 4eff02e49 / 0c4c2f722 补「·」）、输入栏去「＋ / 🎤」）、§20（App 按「全部带已归因」判通过，脚本已改）、§24（≤5 問去底部输入栏） | 剩下的是各画面自身的差，见 REWORK-REPORT-app §8 | REWORK-REPORT-app §8 |
| R24-11 | **App 计划页像素返工收口后的重比清单**（2026-10-14 第 3 轮，规则 11；2026-10-15 UiText 行距修正后重比） | done（必须项完成）：通过 13 / 38（10-15 新过 A-R23-02b / A-R24-09 / A-R25-16 / A-R23-02c）；未过 5 + 行距已修但仍有别的差 7 | **行距已修**（`repos/orbit-app/modules/orbit-text-leading`：混排行基线统一到 Chrome strut，A/B 无变差）。**仍需重比**：A-R24-07（上方头卡累计下移 3–4、头像色 / 接点 [data] 待逐条归因）、A-R24-12b（toast，需真做一次スキップ）、A-R23-08（手点态未重截；§9.2-2 折行）、N17a（需手点确认两块）、A-R23-11 / 12 / 15 / 16（回答气泡 / 方案名长短 [data] 引起的整块下移，逐条归因）；**未过**：A-R23-01、A-R23-17（§27-2 静止态，需改名）、A-R25-05 需能输入日文（fixture 预填：需从 Task 深链把设计稿状态参数穿过 TaskScreen）；~~A-R25-10 次の目標 要改成独立页；A-R25-15 会いたい人头像要契约给名字~~ **2026-10-15 已做并通过（浅深 4 张，`de9f32ac5`）** | `R25-plan-review-goals-cleanup/REWORK-REPORT-app.md` §9.2–9.3、`maintenance/2026-10-14-uitext-leading.md` §3 |
| R12-11 | **done（2026-10-17，A-R12-04 浅深重跑通过，见 DEFERRED-A）**：b11 #4 一处文字口径（App 加人像素门禁，待画板） | 04 深 PASS；04 浅只剩 1 条带：画板重複行「今回：高橋 美咲（青葉ベンチャーズ）」与既存同社仍写社名，实现照 b9 #4（「今回：Sho Watanabe」同社不重复写） | b11 #4 该行改为「今回：高橋 美咲」后重跑 `app-add-R12.json` 的 A-R12-04 浅；fixture `design-failed` 已照画板（17件 · 2 / 1 / 13，sheet 自动打开）。N10 / N10d / 18 已通过 | R12 REWORK-REPORT-app §10 |
| R12-12 | 待 R20 / 待组件库的加人画面 | 未过，暂缓 | A-R12-16（メモ @人 token，R20）；A-R12-N09（ConfirmDialog 无图标位，组件库 G23）；做完后重跑 `app-add-R12.json` 对应 id | R12 REWORK-REPORT-app §10  **R31a 2026-10-18：R31a：ConfirmDialog 图标位 / .dic.emo 已加（`7457b4cc0`），N12 调用点已用 🧪 + ghost；A-R12-N09 需点「破棄」到状态，未重比（见 REPORT）** |
| R12-13 | 加人手入力 / 草稿的演示数据 fixture | 未做：会社候补、重複候补、活动 chip、草稿、样本账号都读真实库 | 补 add-scan 同类的只读 fixture 后重跑 A-R12-17 / 18（数据部分）/ N08b / N12；A-R12-b9-04 由 A-R16-04 覆盖，不再单独比 | R12 REWORK-REPORT-app §10 |

---

## 未定归属（需要用户指定 Sprint）

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| U01 | **全局搜索与 ⌘K 面板本体**（W-R07-05 / 06：分组结果、类型 chip、「近い条件なら」） | Web 用旧面板（已去隐私说明行）；App 没有全局搜索，Task 🔍 临时接人脉搜索（R20-01） | **已定（2026-10-12）→ 移交 R30 搜索（甲）**，见下方「R30 搜索」一节 | DEC §9-1；README 功能登记表 R30 |
| U02 | 组件库逐件对照（Q1） | 展示页没整屏画板 | 按 01-system 规格格 ↔ 展示页同名小节逐件比；工具待扩展 | DEC Q1 → R31a / R31b（2026-10-18）  **R31a 2026-10-18：App 逐件对照工具与展示页小节已接（`1d306d07b` / `c71733b9c`），逐件结果见 R31a REPORT 门禁总表** |
| U03 | Expo SDK 57 补丁升级（`expo-font` 缺失、Hermes 内存回归、RN 0.86.0 锁定） | 暂不升级 | 单独做一次升级并重建开发包 | `R04-app-components/REPORT.md`:58,117 |
| U04 | 长期保留的兼容层（App `batch2` / `batch` / `import` 旧链接翻译、`[...legacy]`；Web `?job=`、`?method=scan`；`/app/invitations/…` 转手输码页） | 有意保留，没写删除时间 | 合回前决定去留 | `R12-add-cards-and-manual/REPORT.md`:30；`R15-invite-codes/REVIEW.md`:152 |
| U05 | v1 计划服务端（`bootstrap` / `reanalyze` / `POST /api/agent/plans` 永久 409，`PlanService`） | 保留 | 定下线时间 | `R25-plan-review-goals-cleanup/REPORT.md`:58,120 |
| U06 | 连库后暴露的 8 条既有失败（通知发现 worker 3、活动访问 2、联系人详情 / party live / 名片 schema 各 1） | 基线同样失败 | 另开任务修 | `R25-plan-review-goals-cleanup/REPORT.md`:228 |
| U07 | 字典里不再使用的键（每语言 84 个） | 保留 | 统一做一次字典整理 | `R25-plan-review-goals-cleanup/REPORT.md`:62 |

## R30 搜索（新，甲 · 小雨；2026-10-12 用户定）

| # | 是什么 | 现在的临时做法 | 接手时必须做到 | 依据 |
| --- | --- | --- | --- | --- |
| R30-01 | 两端全局搜索：Web ⌘K 面板本体（W-R07-05 / 06：无框搜索行 + 类型 chip すべて / 人 / イベント / 会話、结果分组 + 状态 chip + 命中高亮、无结果「近い条件なら」「ほかの方法」、底部「Tab 種類を切替 / 意味検索 ON」）+ App 全局搜索 | **已完成（2026-10-17，`6536ba98c` 实施 + 复核修正提交，见 [REPORT](R30-global-search/REPORT.md)）**：`GET /api/search/global` 一套服务两端同用；Web ⌘K 新面板（旧人脈面板已删）；App `/search`，Task 左上 🔍 已改接（R20-01）；Web 1440 浅深 8 张、App 浅深 8 张过门禁 | 依赖活动和会话的搜索接口（活动搜索 `event-search` 在 R27，见 [events/DESIGN.md](events/DESIGN.md) §4.2；会话 R21）；一套搜索服务两端同用；做完后 App Task 左上 🔍 改接全局搜索（R20-01）；过像素门禁 | DEC §9-1；PA L256–274；README R07 行 |
| R30-02 | Web 1024 面板门禁（A3） | 比对工具两侧只能用同一个 `--region`，画板只有 1440 宽，1024 下面板位置不同，比不了；面板固定 680 宽、无断点规则 | 工具支持设计侧 / 实现侧分别给区域后，在 `views/web-R30.json` 加 P01b–P04b（面板 x 172）重比 | R30 REPORT |
| R30-03 | b12 #495（App 意味検索深色，补画）横幅缺 `.banner` 底色与内边距 | **已完成（2026-10-17，R30 收口提交）**：照 b5 #55 补进 `.g9`（决定表 §46），A-R30-P07d 通过 | — | R30 REPORT |
| R30-04 | 検索中（b12 #498 / #499）、单类型「人」さらに表示（b12 #488 / #489） | 実装已有（App 300ms 后骨架；Web 单类型同结构）；PLANNER 定不进门禁（B8 可选、A5） | 需要时加放慢回答的 dev 开关再截 | PLANNER「不进门禁」 |
| R30-05 | 意味検索 | **lite 已打开（2026-10-17，决定表 §50）**：静态同义词表，live `semantic.available=true`，不调 AI | 用户在 Vercel 设好 OpenAI key 后：按 DESIGN §5.2 接 embedding（provider、`search-embeddings` 迁移、账本用途 `search_semantic`），lite 留作无 key 退路；补 #58 / #55 live 回归 | DESIGN §5.1b / §5.2；决定表 §50 |
| R30-06 | 设定里的「意味検索」开关界面（R18） | 两端已读本机偏好 `orbit.search.semantic`（"off" → 送 `semantic=0`、底部 OFF、说明行隐藏）；没有设定页画板，开关界面未做 | R18 设定页加开关（写同一个键：Web localStorage / App AsyncStorage），先补画板 | DESIGN §2.1；决定表 §50 |

## R31b Web 组件库像素轮（乙，2026-10-18）

**通知甲（RD-30）**：以下改动落在甲名下的页面，只换组件 / 改调用参数，不改页面布局；页面自身的剩余差异写在 R31b REPORT「交还」。
- 计划：`PlanOverview` 前提を見る 弹窗改用 Modal `icon`（📌 teal）+ `subtitle` + `titleSize={18}`；`PlanTypeDialogs` 記録 弹窗 `size={380}` + `subtitle`，スキップ確認 `icon`（🧠 apricot）+ `closable={false}`，介绍 / 面談を提案 抽屉 `titleSize={18}`；`BackgroundBlocks` メンバーを追加 的手写分段换成 `Segmented variant="seg" wide`。
- 活动：`EventsScreen` 参加コード 弹窗 `size={380}`、副标题改为正文第一行（b12 #320 标题行下 4px）；活动页签手写分段 → `Segmented variant="seg"`；`EventDetail` 手写 `.utabs` → `UnderlineTabs`；`VenuePage` 会場页签 → `Segmented variant="seg"`（新文案键 `venueTabs` 作 tablist 名）。
- 主办：`HostCohosts` 改用组件 Drawer 的标题 + 副标题 + 白色圆底 ✕（520、内边距 22；`HostCohostsView` 加 `head={false}`，b6 #20 画板按 RD-27 改 520）；`HostConsole` 手写 `.htabs` → `UnderlineTabs variant="host"`；`HostCenter` / `HostPeople` / `HostMatching` / `HostSetup` 手写分段 → `Segmented variant="seg"`（`HostCenter` 新文案键 `fLabel` 作 tablist 名）。
- ConfirmDialog 全站改 Web 版式（01-system ②：图标块在标题左、无 ✕、Esc 提示）：主办 HostMatching / HostSetup / HostConsole、加人 InviteCodeModal 的确认框随之变化。
- 未换（交还）：`HostConsole` レポート「すべて / 自分の視点」是链接分段（Segmented 没有 href）；`SearchPanel` 类型 chip 是带 `aria-controls` 的 tablist（CategoryTabs 是 radiogroup，换了语义会变）。

**交接条目处理结果（Web 部分，2026-10-18，详见 R31b REPORT）**
- G23（Web）：Modal 380 档 / 图标块 / 无 ✕ ✅；Kbd 字色保留 `ink-3-text` 走 `[contrast]` ✅；MacTile 小号 emoji ✅；非壳抽屉深色细边保留（PLANNER 契约 §2）。UnderlineTabs ✅（Web）。
- G23b（Web）：MacTile 21 / 17、圆角 13 ✅；Chip 杏色字保留 `-text` 走 `[contrast]` ✅；FilterOption 上下 7 ✅；Modal `header` / Button `trailing` 保留；**其余组件的全局 `.btn` 漏入已统一处理**（双类写回 + `tests/ui/orbit-2026-legacy-btn.test.ts` + 每格 `?env=legacy` 像素对照）✅。
- R24-05：组件参数全部就位 ✅；R24-05b 重比见 DEFERRED-A §1（组件部分 done，页面剩余交还）。
- R17-17（Web）：Drawer 520 / 22 / 白圆 ✕ / 副标题 ✅、b6 #20 改 520（RD-27）✅；W-R17-P26 仍未过（见 DEFERRED-A §3）。
- R16-01（Web）：W-R16-08 浅深通过 ✅。
- U02（Web）：逐件对照清单 `views/web-R31b-components.json`（30 条 × 浅深，新页面与 `?env=legacy` 各一）✅；Web 不适用 / 没有组件的规格格见 R31b `preflight-checklist.md`。

## 合回前与真机（不归某个功能 Sprint，列在 README 合回前清单）

staging `VERCEL_ENV` / 展示页开关；真机触感、真推送、Dynamic Type、相机权限被拒态、BottomSheet 叠 ActionSheet；本地与 staging 配 `ORBIT_SYNC_CURSOR_SECRET`；R15 生产迁移与 `ORBIT_INVITE_RATE_SECRET` / `ORBIT_PUBLIC_ORIGIN` / 通用链接；R16 `expo-contacts` 与通讯录权限文案的 TestFlight；`OrbitTopNav` 登录后分支清理；App 底栏转场（D07 已定照 iOS 惯例）。详见 [README「合回前总验收」](README.md#合回-chat-agent-前总验收r09-写入全部打勾才合回rd-03--rd-24) 和各 REPORT。

## 维护规则

- 新的交接事项、临时规定一律追加到本文件对应节，写四栏和依据；不确定归属的写进「未定归属」。
- 某条做完后，在该行「现在的临时做法」写「已完成（日期、提交）」，不删行；整节做完后在节标题后注明。
- 功能 Sprint 开工时必须读本节并写进 PLANNER 的 SC；收口 REPORT 逐条写处理结果（HOW-TO 第 0、10 步）。
