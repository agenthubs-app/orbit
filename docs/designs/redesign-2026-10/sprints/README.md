# redesign-2026-10 Sprint 管理入口

**运行状态：ACTIVE（2026-10-09）。** 本目录管理 Orbit 2026-10 改版的全部 Sprint，统一用 `R` 编号。每个 Sprint 同时涉及后端、Web（`repos/orbits`）和 App（`repos/orbit-app`），所以不再分别放进两端的 `docs/sprints/`；两端登记表各有一行指向这里。

- 设计依据：本目录上一级的设计稿（`index.html`「待確認項決定」、`01-system.html`、`b11-nav-v3.html`、`kit/`）和 [`IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md)。**两者与本目录冲突时，以本目录「用户决定」表为准。**
- **必读（功能 Sprint）**：[交接表 HANDOFF-TO-FEATURE-SPRINTS.md](HANDOFF-TO-FEATURE-SPRINTS.md)——骨架与返工留给各功能 Sprint 的事项和临时规定（按 Sprint 分节 + 通用口径）。开工前读自己那一节并写进 PLANNER 的验收契约；新的交接事项一律追加到这份文件。
- **乙（同事）开工**：先读 [COLLEAGUE-START.md](COLLEAGUE-START.md)（2026-10-13：推荐顺序组件库像素轮 → R11 / R18 → R20 → R21 / R13 / R14 → R10 → R19；两人协作规矩；甲的排期）。
- 每个 Sprint 一个目录：`GOAL.md`（易读目标）+ `PLANNER.md`（唯一契约）；执行结束写 `REPORT.md`，独立复核写 `REVIEW.md`。

## 分支

- 改版全部在 **`redesign`** 分支开发（2026-10-09 从 `chat-agent` `9d404c1c8` 建立）。**R02 起直接在 `redesign` 上提交，不再开 Sprint 分支、不开 PR**（RD-25）；R01 曾用分支 `redesign-R01-design-tokens` 经 PR #1 合入。
- **`chat-agent` 冻结**：改版期间不做新功能、不修线上问题（RD-03）。
- `redesign` 在**所有功能完成并整体验收后**一次合并回 `chat-agent`。
- **功能 Sprint（R10 起）两人并行时**：个人分支 `redesign-R<编号>-<主题>`（全用连字符，`redesign/…` 建不了），收口时 rebase 到 `redesign`、全量通过后 `--ff-only` 合回；一个人做的 Sprint 仍可直接在 `redesign` 上提交。详见两端 `AGENTS.md`「redesign 开发规则」（R09）。

## 分工（RD-01）

按功能纵切，一个 Sprint 由一个人把后端、Web、App 一起做完。

| 阶段 | 甲 · 小雨 | 乙 · 产品负责人 |
| --- | --- | --- |
| 骨架 R01–R09 | **全部**（RD-04） | 验收（看截图、试用） |
| 功能 | 计划 v2.2（R22–R25）、加人与邀请（R12、R15、R16）、活动（R26、R27）、主办（R17）、搜索（R30，2026-10-12 新开） | iOrbit（R21）、首页（R10）、Task（R20）、收件箱 · 秘书 · 推送（R13、R14）、人脈（R11）、账户（R18）、iOS 小组件（R19） |

功能 Sprint 的文档在骨架验收后另写。两端每个现有页面由哪个功能 Sprint 重写（按屏替换、旧屏删除），见 [旧屏归属表](screen-ownership.md)；表里补出两个新功能 Sprint：R28 引导、R29 运营后台换新（负责人待定）。分工流程图：https://claude.ai/artifact/7qGcsrWQj2EeLbkdC5hXas

## 骨架登记表

| Sprint | 目标 | 依赖 | 档位 | 状态 |
| --- | --- | --- | --- | --- |
| [R01](R01-design-tokens/GOAL.md) | 设计源：一份 token 源生成两端，新值覆盖旧值，统一改用设计稿命名 | — | H | done，已复核，问题已修（M1、M2、m1、m2、m5、m6 已修；m3 留 R05、m4 留 R07；[REPORT](R01-design-tokens/REPORT.md)、[REVIEW](R01-design-tokens/REVIEW.md) 末尾「处理记录」） |
| [R02](R02-icons/GOAL.md) | 图标源 + 两端 `Icon` + 补画齐全 + Ionicons 只减不增门禁 | R01 | H | done，已复核，问题已修（M3 模拟器底栏截图已在 R04 走查补上，m4、m6 已在 R04 处理；[REPORT](R02-icons/REPORT.md)、[REVIEW](R02-icons/REVIEW.md) 末尾「处理记录」） |
| [R03](R03-copy-and-ja/GOAL.md) | 文案源 + 术语表 + 字典按功能拆分 + 回退日语 + 翻译质量工具；写死文字只减不增门禁 | R01 | H | done，已复核，问题已修（M2 Web 导航壳转 R07；[REPORT](R03-copy-and-ja/REPORT.md)、[REVIEW](R03-copy-and-ja/REVIEW.md) 末尾「处理记录」） |
| [R04](R04-app-components/GOAL.md) | App 组件库（5 类）+ 展示页 + 基础设施改用新组件；旧写法只减不增门禁 | R01、R02、R03 | H | done，已复核，问题已修（模拟器走查已做，只剩触感需真机确认；[REPORT](R04-app-components/REPORT.md)、[REVIEW](R04-app-components/REVIEW.md) 末尾「处理记录」） |
| [R05](R05-app-shell/GOAL.md) | App 导航壳：NAV-V3 底栏、Task 容器、二级页规则 | R04 | H | **done（栅格化残差按 [raster] 计）**。像素返工：壳几何 / 颜色 / 图标已逐像素对齐、复核问题已修（S1–S2、M1–M5，[REWORK-REPORT](R05-app-shell/REWORK-REPORT.md)、[REWORK-REVIEW](R05-app-shell/REWORK-REVIEW.md)）；假名字形按用户 2026-10-12 选 (b) 已做（App 日文显式 Hiragino，REWORK-REPORT §10）；局部整块 raw 大多 ≤0.02，超阈单带只剩栅格化级残差（分段 / 标签假名 0.3px、图标 1/3pt）与深色玻璃透出旧正文，按 `[raster]` 归因、算通过（用户 2026-10-12 决定，同 R07 口径） |
| [R06](R06-web-components/GOAL.md) | Web 组件库（5 类，CSS Modules，新作用域） | R01、R02、R03 | H | done，已复核，问题已修（M1–M4、m1–m6、m10 已修；m9 staging 的 `VERCEL_ENV` 需人确认；[REPORT](R06-web-components/REPORT.md)、[REVIEW](R06-web-components/REVIEW.md) 末尾「处理记录」） |
| [R07](R07-web-shell/GOAL.md) | Web 导航壳：左栏、主标题区、右栏、⌘K，全站一次切换 | R06 | H | done（像素返工已过门禁，2026-10-12：壳的局部视图三宽度 × 浅 / 深全过，超阈带只剩 `[data]`；返工已独立复核、问题已修，[REWORK-REPORT](R07-web-shell/REWORK-REPORT.md)、[REWORK-REVIEW](R07-web-shell/REWORK-REVIEW.md) 末尾「处理记录」）。留给功能 Sprint：メモ「＋ メモを追加」（R20）、1024 抽屉 / 右栏的建议内容与计数（R10）、⌘K 面板本体 W-R07-05 / 06（待开 Sprint）、マイページ主催入口正式版（R18）。第一轮：done，已复核，问题已修（M5 已按产品决定 (a) 落实；R03 M2、R01 m4 在此处理；[REPORT](R07-web-shell/REPORT.md)、[REVIEW](R07-web-shell/REVIEW.md) 末尾「处理记录」） |
| [R08](R08-contracts-and-mocks/GOAL.md) | 12 个契约 + 校验 + mock 接口 + 统一演示世界 + 「只加不改」检查 | R01 | H | done，已复核，问题已修（M3 口径产品负责人已确认并落实，见通用规则 10；[REPORT](R08-contracts-and-mocks/REPORT.md)、[REVIEW](R08-contracts-and-mocks/REVIEW.md) 末尾「处理记录」） |
| [R09](R09-skeleton-acceptance/GOAL.md) | 骨架验收：规则入库、开发说明、全流程走查、截图集、基线对照 | R01–R08 | H | done，已复核，问题已修（热点文件归属已定稿、App `AGENTS.md` 贴规则已完成（2026-10-10）；SC-06 拍板由小雨负责；[REPORT](R09-skeleton-acceptance/REPORT.md)、[REVIEW](R09-skeleton-acceptance/REVIEW.md) 末尾「处理记录」、[截图集](https://claude.ai/artifact/S8PXMfqVrY9nusMFtfdCHY)） |

执行顺序：R01 → R02 → R03 → R04 → R05 → R06 → R07 → R08 → R09（一人依次做；R08 只依赖 R01，可以提前）。

## 功能登记表

功能 Sprint（R10 起）的文档按 [HOW-TO](HOW-TO-START-A-FEATURE-SPRINT.md) 写；一组功能有整体设计时，先写 `<功能>/DESIGN.md` 并独立复核。

| Sprint | 目标 | 依赖 | 档位 | 负责 | 状态 |
| --- | --- | --- | --- | --- | --- |
| [R22](R22-plan-data-and-score/GOAL.md) | 计划 v2.2：数据、契约与分数（迁移两个本机、契约转正、计分纯函数、v2 读接口与计分命令、旧计划守卫） | R09 | H | 甲 | done，已复核，问题已修（[REPORT](R22-plan-data-and-score/REPORT.md)、[REVIEW](R22-plan-data-and-score/REVIEW.md)） |
| [R23](R23-plan-generation/GOAL.md) | 计划 v2.2：生成流程与 AI（目标入力 → 背景 → ≤5 问 → 前提 → 初版 → AI 修正 → 手動編集 → 確定；业界现状库） | R22 | H | 甲 | done，已复核，问题已修（[REPORT](R23-plan-generation/REPORT.md)、[REVIEW](R23-plan-generation/REVIEW.md)） |
| [R24](R24-plan-overview-and-types/GOAL.md) | 计划 v2.2：概要、人物类型与记录加分（含 `event-score.ts`、面谈メモ判定） | R22 | H | 甲 | done，已复核，问题已修（[REPORT](R24-plan-overview-and-types/REPORT.md)、[REVIEW](R24-plan-overview-and-types/REVIEW.md)） |
| [R25](R25-plan-review-goals-cleanup/GOAL.md) | 计划 v2.2：见直、达成、多目标与旧屏清理（删兼容跳转、旧链接换新） | R23、R24 | H | 甲 | done，已复核，问题已修（[REPORT](R25-plan-review-goals-cleanup/REPORT.md)、[REVIEW](R25-plan-review-goals-cleanup/REVIEW.md)）；**Web 像素返工第 4 轮 done（2026-10-13）**：通过 B 12 / 20、C 9 / 17、A 0 / 14。剩下的画面：**待 R26** 共 10 个（2026-10-14 R26 后重比：04c 通过，其余仍未过，见 [R26 REPORT](R26-events-assessment-and-plan/REPORT.md#计划页重比sc-r26-13)）——A 组 01、02（1440 / 1024 / 390）、04a、04c、05、06、07、08（右栏「今日のチャンス」、推荐活动、活动分数按规则算）；**待组件库**共 5 个——W-R24-03、09b、11、12（Modal / Drawer），W-R23-06（Modal 定位约 3px）；**另有不属于这两类的**：B 组 W-R23-11～15、17、18（引用只能取真实库、题库文字；画板是改到一半的状态，3 轮上限），C 组 02M 浅色差 1px、10M 字形差，C 组 01 / 02 / 07 / 09 / 10 整屏（背景是 A 组概要页，随 A 组一起过）。见 [REWORK-REPORT-web](R25-plan-review-goals-cleanup/REWORK-REPORT-web.md) §10 第 4 轮；**App 像素返工 done（必须项完成，2026-10-14 第 3 轮后按规则 11 收口）：通过 9 / 38**（下書き中、背景 1/3、背景 2/3、下書き失敗、5 問、確定済み、作りかけ、見直し、完了，浅深 18 张，§20 带全部归因）**；暂缓 待组件库 8、待R26 4、待 UiText 行距 11；未过 6（3 轮用完 3、需人工输入日文 2、需改成独立页 1；清单见 REWORK-REPORT-app §9.3）**，全部登记交接表 R24-05c / R24-06c / R24-11 重比清单；见 [REWORK-REPORT-app](R25-plan-review-goals-cleanup/REWORK-REPORT-app.md)。**2026-10-15 行距修正后重比：通过 13 / 38**（新过 A-R23-02b、A-R24-09、A-R25-16、A-R23-02c；原因实为混排行基线比纯日文行高 1.3–2pt，不是 leading，原生模块 orbit-text-leading 统一到 Chrome strut 基线，已过画面无变差），待 UiText 行距 11 → 行距已修、余 7 屏差在数据 / 手点态 / toast（1 屏未重截），未过 6 → 5，见 [maintenance/2026-10-14-uitext-leading](maintenance/2026-10-14-uitext-leading.md) |
| [R12](R12-add-cards-and-manual/GOAL.md) | 加人：「人脈を追加」入口、名刺スキャン（拍 / 传含表裏 → 读完自动进人脈 → まとめて確認 → 完成）、手入力（查重与名片同一规则 + 同名提示、逐字段合并、撤销）、待确认草稿页；删除 App 7 个旧加人屏 | R09 | H | 甲 | **done**（2026-10-14，README 规则 11 收口）：Web 界面像素返工 done（余待组件库 / 待 R11）；App 按 §20 通过 16 张（02 / 03 / 46 / b9-00 / 00 / 15 / N11 浅深、N10 浅、N10d、18 深、04 深）。暂缓（登记交接表 R12-11～13）：04 浅待画板一行文字；16 待 R20；N09 待组件库；17、N08b、N12 待演示数据 fixture；b9-04 由 A-R16-04 覆盖（[REWORK-REPORT-app](R12-add-cards-and-manual/REWORK-REPORT-app.md) §10） |
| [R15](R15-invite-codes/GOAL.md) | 加人：招待コード（迁移、发码 / 兑换 / 历史 / 同步 / 解除、公开预览限流与防枚举、发出方两端、接收方 `/i/<code>`）；删除两端旧邀请页 | R12 | H | 甲 | 界面像素返工 done（剩余画面待组件库 / 待 R11）：App 13/13 按 §20 通过；Web 接收方 09/10/13 通过，14m / 12 按 §23-1 算通过（[REWORK-REPORT](R15-invite-codes/REWORK-REPORT.md)） |
| [R16](R16-import-and-completion/GOAL.md) | 加人：導入（連絡先 / LinkedIn / CSV / イベントから → まとめて確認）与「每天一问」live（规则、零 AI）；删除 Web 旧导入页 | R12 | H | 甲 | 界面像素返工 done（剩余画面待组件库 / 待 R11）：服务端 + 两端界面已复核（[REPORT](R16-import-and-completion/REPORT.md)；Web 13/14、App 8/10，余 W-R16-08 浅 G23b、A-R16-02 G23） |
| [R26](R26-events-assessment-and-plan/GOAL.md) | 活动：评估与计划接线（契约 8 live：URL 抓取 + SSRF、海报、正文、3 项、异常态；`event_assessments` 迁移；`events/mine`；两端イベント一级页 評価 / 参加予定；活动事实 live（D53）、概要推荐活动行、今日のチャンス、会える活動、R24-06 小项；代签计分；重比计划页 12 个暂缓画面；删两端旧一级页） | R24、R25 | H | 甲 | **实施完成，像素未过**（2026-10-14；[REPORT](R26-events-assessment-and-plan/REPORT.md)）：服务端 / 契约 / 两端界面 / 代签计分 / 重算通知已推送（`019c8dfa1`～`be43e9314`）；真实 AI 本机 E1 12 次、E2 2 次约 $0.02；SC 15 / 17 ✅，SC-08（R24-06 小项 6 项未做）、SC-13（计划页重比只过 04c）、SC-14（旧列表留作「探す」至 R27）部分；**像素：Web R26 通过 0（10 / 11 / 30 只跑 1 轮），App 未跑**；待授权：生产迁移、`ORBIT_EVENT_ASSESSMENT_AI=ai` |
| [R27](R27-events-journey/GOAL.md) | 活动：从找到活动到会后（探す、コミュニティ、絞り込み、検索（给 R30）、興味なし契约 9 live；詳細（含未登录列表 / 详情）、参加登録 / 参加コード / 取消；会う準備；会場モード；会後のふりかえり；删两端旧详情 / 报名 / 会场屏） | R26 | H | 甲 | **文档完成、已复核，待实施**（2026-10-14；开工前待拍板见 DESIGN §10 A2 / A3 / A5–A7 与 B3–B5） |
| R30 | 全局搜索（两端）：Web ⌘K 面板本体（W-R07-05 / 06）+ App 全局搜索；做完后 App Task 左上 🔍 改接全局搜索（[交接表 R30](HANDOFF-TO-FEATURE-SPRINTS.md#r30-搜索新甲--小雨2026-10-12-用户定)） | R07；活动与会话的搜索接口（R27、R21） | H | 甲 | 未开始（2026-10-12 用户决定新开） |

计划 v2.2 的整体设计、AI 调用清单、需要用户拍板的事项见 [plan-v2.2/DESIGN.md](plan-v2.2/DESIGN.md)，复核见 [plan-v2.2/REVIEW.md](plan-v2.2/REVIEW.md)。加人与邀请（R12、R15、R16）见 [add-and-invite/DESIGN.md](add-and-invite/DESIGN.md)，复核见 [add-and-invite/REVIEW.md](add-and-invite/REVIEW.md)。活动（R26、R27）见 [events/DESIGN.md](events/DESIGN.md)，复核见 [events/REVIEW.md](events/REVIEW.md)。

## 用户决定（2026-10-09）

| 编号 | 决定 | 影响 |
| --- | --- | --- |
| RD-01 | 两人按功能纵切分工（见上表）；跨人依赖先用空态或现有页面顶上，收尾时接线 | 全部 |
| RD-02 | 导航用 **NAV-V3**：App 底栏 ホーム / 人脈 / iOrbit / イベント / Task；「我的」从首页左上头像进入，收件箱从首页右上 🔔 进入（只显示红点）；Web 左栏 ホーム / 人脈 / iOrbit / イベント / Task / 受信箱，底部 主催 / 設定。替代 2026-10-04 人脉方案的导航（其内容想法放进各功能 Sprint） | R05、R07 |
| RD-03 | 在 `redesign` 分支开发；所有功能完成并整体验收后一次合并回 `chat-agent`；**改版期间 `chat-agent` 冻结** | 全部 |
| RD-04 | 骨架由小雨一人做完；时间不作为约束；验收 = 产品负责人看截图集并在模拟器 / 浏览器试用 + 独立 AI 复核（`REVIEW.md`） | R01–R09 |
| RD-05 | **新 token 值直接覆盖旧 token**；文字用加深版颜色，所有「文字 × 底色」组合 ≥4.5:1，设计原值只用于图形、装饰和 ≥18px 粗体；两端默认主题跟随系统，设置里提供 自动 / 浅色 / 深色。**例外（用户决定 2026-10-12）**：Web 左栏未选中项的图标与文字照设计稿用 `--ink-3`（对标 iOS 标签栏未选中项的浅灰，靠图标与选中态区分）；**扩大（用户决定 2026-10-12，R07 复核 M1）**：Web 导航壳内的次要说明文字（标题区日期、右栏「こんなことを聞けます」与输入框占位、抽屉「Esc で閉じる」、头像菜单邮箱与「言語 / 外観」、390 胶囊标签）同样照设计稿用 `--ink-3`，示例药丸照设计稿杏色（对标 iOS / macOS 次要说明文字的浅灰）；**App 壳同样适用**（沿用用户 2026-10-12 对 Web M1 的决定，R05 返工）：底栏未选中标签、Task 顶栏日期、二级页顶栏副标题、首页顶栏问候照设计稿用 `--ink-3`，主要内容另外保证对比度 | R01、R07、R05 |
| RD-06 | **一律改用设计稿的命名**（ink、surface、plum、rose、mac、coral、ok …）；App 和 Web 引用旧名字的地方一次改完，不保留旧名字或别名 | R01 |
| RD-07 | 「旧颜色 → 新颜色」对照表由执行人出好，**先给产品负责人确认再应用** | R01 |
| RD-08 | `shared/design`、`shared/copy` 加进 App 同步白名单（`AGENTS.md` 相应修改） | R01、R03 |
| RD-09 | 字体按界面语言切换：日文 Hiragino Sans / Noto Sans JP，中文 PingFang SC / Noto Sans SC，英文系统字体；去掉 Noto Serif SC → **修订（用户决定 2026-10-12，R07 像素返工）**：日文改用设计稿 kit 的 `--font`——系统字体优先（英文、数字为 SF），假名汉字仍是 Hiragino Sans / Noto Sans JP；中文、英文不变。**App（用户 2026-10-12 选 (b)，R05 返工）**：日文界面在 iOS 上把假名汉字显式设成 Hiragino Sans 各字重（token `font.face.ja`，按设计稿渲染实测 400 / 500 / 600 / 700 / 800 → W3 / W4 / W5 / W6 / W7），英文数字仍是 SF；`--font-num` 回退照设计稿改为 Noto Sans JP；`--font-ja` 去掉 Hiragino Kaku Gothic ProN，与 kit `--font` 逐字一致（多出的 ProN 在粗体处抢走了设计稿里 SF 画的 ✓）；App 的符号按设计稿：SF 有的（✓ → … × · — ① ●）留在 SF，SF 没有、设计稿用 Hiragino 画的（※ ― ‥ ─ ⑩ ◆ ◎ ☀ ♪ 等）并入 Hiragino 段 | R01、R07、R05 |
| RD-10 | ~~图标在骨架里一次换完：App 全部 Ionicons 换成设计稿图标；最后移除 Ionicons 依赖~~ → **修订（2026-10-09）**：骨架建图标源、两端 `Icon` 和展示页，导航壳换新图标；设计稿没有的按同样风格一次补画齐，出「Ionicons → 新图标」对照表给功能 Sprint 用。旧屏的 Ionicons 原样保留，门禁保证新代码不用、旧用法只减不增；最后一个旧屏删除时移除依赖（RD-24） | R02 |
| RD-11 | 语言：App 跟随设备、Web 跟随浏览器语言，不是中 / 日 / 英时回退**日语**；已手动选过语言的用户保持不变 | R03 |
| RD-12 | 两端文案文件全部按功能拆开；~~两端旧页面里写死的文字在骨架里全部抽出并补齐日语~~ → **修订（2026-10-09）**：骨架只处理标准用词源、导航壳和保留组件的文案；旧屏写死的文字原样保留，门禁保证新代码零容忍、旧用法只减不增，由功能 Sprint 整屏重写时按术语表处理（RD-24）；三语标准用词由产品负责人在 R03 报告里审 | R03 |
| RD-13 | 翻译不能「直接翻一遍」：先调研成熟产品和风格指南定术语表，再按「翻译 → 自动检查 → 独立审校 → 放回界面截图 → 修改」循环到达标，每轮数字写进报告（细则见 R03） | R03 |
| RD-14 | 组件库做前 5 类通用组件（基础、反馈、AI、控件、状态），业务专用组件由各功能 Sprint 做；~~App 里 `Alert.alert`、自用 `Modal`、自写分段控件全部换成新组件；App 旧公用组件全部换成新组件并删除~~ → **修订（2026-10-09）**：只有会保留的基础设施（访问 / 离线 / 错误边界、登录会话）改用新组件；旧屏里的旧写法和旧公用组件原样保留，门禁保证只减不增，使用点归零时删除旧组件（RD-24）；加原生依赖 gesture-handler、reanimated、expo-blur、expo-haptics；锁定 `react-native` 版本 | R04 |
| RD-15 | 组件展示页：App 在开发包和 TestFlight 可见、正式版隐藏；Web 在本地和预览 / staging 可见、正式环境隐藏 | R04、R06 |
| RD-16 | ~~组件验收用展示页 + 与设计稿画板并排的截图（浅色、深色、窄屏、大字号）；**不做逐像素门禁**~~；所有动画遵守「减少动效」（只保留淡入） → **修订（用户决定 2026-10-11）**：**每个画面必须和设计稿画板一模一样**。①允许不同的只有一项：测试数据和设计稿示例数据的**文字内容**（人名、数字、日期等）；排版、颜色、间距、字号、字重、圆角、阴影、图标、元素有无和顺序都必须一致。②设计稿里有的东西不许自己改、也不许省略；确实做不到或不该做的，**先由用户拍板**再动。以前各 Sprint REPORT「自定决定」里偏离设计的条目**全部作废、重新上报**（清单见 [maintenance/2026-10-11-pixel-audit.md](maintenance/2026-10-11-pixel-audit.md)）。③验收靠**逐像素门禁**，不靠目测并排截图：整屏 raw 差异 ≤0.02；用 `--grid` 逐带比对，超阈值的带必须在归因文件里具名，且**只能归因为「数据文字不同」**（`[data]`）。④Web：1440 / 1024 / 390 三种宽度 × 浅色 / 深色，截**完整页面（含导航壳）**，工具 `repos/orbits/scripts/visual/compare-redesign.mjs`；App：内置 iOS 模拟器（`mcp__Claude_Code_iOS_Simulator__control` / `xcrun simctl io booted screenshot`）截**真实画面**，不用 react-native-web，浅色 / 深色都截，工具 `compare-redesign-app.mjs`（用法见 `repos/orbits/scripts/visual/README-redesign.md`）。展示页仍保留，但展示页的组件同样过像素门禁 | R04、R06、全部功能 Sprint |
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
5. **证据**：截图、日志放 `~/orbit-sprint-evidence/redesign/R0x/run-01/`；每个 Sprint 的 REPORT 附一个截图对照页（设计稿画板 ↔ 实现，浅色 / 深色）。**RD-16 修订（用户决定 2026-10-11）后另附像素门禁结果：每个画面 × 宽度 × 主题的 raw、超阈值带数、归因文件路径；不过门禁的画面不得标 done。**
6. **不碰生产**：不连 Neon、不部署；数据库只用本地 `orbit_test` 等测试库；骨架阶段**没有产品内的付费 AI 调用**（R03 的翻译和审校由开发用 AI 会话完成，不走产品的 AI 接口）。
7. **界面用词**：所有用户看得到的文字用普通人能懂的说法，不出现「来源」「证据」「关系设置」这类内部用语。
8. **复核**：每个 Sprint 结束由独立 AI 复核（跑全量、运行时抽查、对照 SC），写 `REVIEW.md`；复核发现的问题直接在 `redesign` 上修（RD-25）；产品负责人看截图集并试用。
9. **范围**：骨架不改旧屏，旧用法只减不增（RD-24）。
10. **契约演进与客户端读取**（R08 复核 M3；**产品负责人已确认（2026-10-10）**）：按成熟产品的常规做法（对标 Stripe / GitHub API）「宽进严出」。
    - **响应宽进**：解析响应的 schema 不用 `.strict()`，多余字段丢弃；响应里的枚举用 `shared/api-schema/tolerant.ts` 的 `tolerantEnum`（未知值落到写明的兜底值；缺字段仍是错误）或 `knownValues`（未知项跳过）；列表用 `readableItems` 逐条读，读不了的条目跳过、整页不失败。决定「这条是什么」的枚举（如通知的 `kind`、来源 `sourceKind`）出现未知值时，整条跳过而不是猜一个兜底（Sprint 0104 / 0122 的做法，服务端未读总数照常）。读取用和写入用要分开时拆成两个 schema（例：`inboxNotificationSchema` 读取宽进、`inboxNotificationWriteSchema` 服务端写入严格）。
    - **请求严出**：请求体 schema 保持 `.strict()`、枚举封闭；服务端写入校验同样严格。
    - **检查器**：响应字段放宽为 `| null`、`| unknown`、`| any`，或给必填字段加 `| undefined`，仍判为破坏（`scripts/contract-snapshot.mjs`）。
    - **`minSupportedAppVersion`（契约 11）在首次正式发布之后才启用**：正式发布前没有需要兼容的已装版本，契约可以直接改（走 `BREAKING.md` 登记），App 重新发布即可；正式发布后，旧版本读不了的变更必须先发一版能读的 App，或同时抬高 `minSupportedAppVersion`。
11. **逐像素还原设计稿**（RD-16 修订，**用户决定 2026-10-11：适用于以后所有 Sprint，甲乙都一样**，包括 R12–R16 及之后全部功能 Sprint）：每个画面都要过逐像素门禁（Web 1440 / 1024 / 390 × 浅 / 深，App 模拟器浅 / 深；整屏 raw ≤0.02，`--grid` 超阈值带只能归因为 `[data]`），（**用户 2026-10-14：被后续任务卡住的画面（待组件库 / 待 R26 / 待 R11 等）暂缓，登记进交接表重比清单、不再耗轮次；能解决的先对齐，必须项做完即收口标 done 并列出暂缓项，上游完成后回来重比**）（App 画面按[决定表 §20](maintenance/2026-10-12-decisions.md)：所有超阈值带都归因为 `[data]` / `[raster]` 即通过，整屏 raw 只作参考）并提交归因文件 `repos/orbits/scripts/visual/attribution-redesign-<Sprint>.json`；不允许在「自定决定」里改动或省略设计稿，偏离先请用户拍板。做法见 [HOW-TO 第 8 节](HOW-TO-START-A-FEATURE-SPRINT.md#8-截图对照页与像素门禁)。**新页面开工先跑 `board-preflight`，结果贴进 PLANNER**（`repos/orbits/scripts/visual/board-preflight.mjs`，2026-10-14：画板自洽、token 缺口 / 近似值、数据来源清单、宽度与主题；HOW-TO 第 8 节「画板预检」）。
12. **UI 对齐的默认流程**（**试行中，2026-10-12**；等 R05 和 Web 计划页两组的用时对比出来后转为定稿；HOW-TO 第 8 节同步）。以后所有 UI 对齐、像素返工和功能 Sprint 的界面部分都按这个流程做：
    - **照源码搬，不对着截图画**：Web 把画板的 DOM 结构和 CSS 数值直接照 `kit/ui.css`、`kit/kit.js` 和画板 HTML 源码搬进 CSS Modules（数值换成 token）；App 把 kit 里的数值一次性翻译成 token 和组件参数。
    - **快慢两档**（`--only` + 设计稿缓存）：迭代时只跑当前画面的门禁（`--suite views/<端>-<Sprint>.json --only <画面>`，或 `--changed` 只跑和改动相关的画面）和相关测试；收口时各跑一次全量门禁（不带 `--only`）和两端全量测试。
    - **复核**：只重跑没通过的画面和改动过的画面，另抽查至少 20% 的已通过画面；先核对文字结论和超阈值带的裁剪图；抽查画面和摘要里标 ⚠ 缺块的才看整张 triptych，不能只看 raw。
    - **不阻塞**：子会话不用 AskUserQuestion 弹窗等人回答；需要拍板的事用 SendMessage 发给主会话，那个画面先跳过，接着做别的。
    - **并行**（用户 2026-10-12 决定，降低额度消耗）：按文件归属分工，**最多同时 2 个会话**（一个重活加一个轻活，比如一个返工加一个文档或画板）；每个会话同时最多 1 个子任务，独立复核在其他子任务结束后再起；每个会话用自己的 dev server 端口、`distDir` 和测试库。
    - **短会话**：一个返工组 / 一组画面一个会话，做完写交接。
    - **省额度**（用户 2026-10-12 决定；工具新功能由 pixel-web-shell 会话补，补好前照同样原则手动做）：
      - **先看文字结论，图片按需看**：门禁输出文字结论（哪个元素 / 哪条带、偏几 px、颜色差多少）。Web 先用逐元素样式比对（`--style-diff`：设计稿画板 vs 实现的 computed style 与位置尺寸，输出文字表）定位并改完差异，像素门禁只做最后确认；App 看门禁的数字结论。数字说不清时才看图，而且只看裁剪出的那一块，不读整张截图。
      - **只读相关的**：设计稿用 `--extract-board` 抽出单个画板的源码，不读整个 bundle；HANDOFF、决定表、审计报告只读和本画面相关的段落（先 grep 定位）。
      - **测试只看摘要**：只看通过 / 失败数和失败用例名，不贴全量日志。
      - **每个画面最多 3 轮**：同一画面改 3 轮还不过，就停下，写进 REPORT「未过」清单并 SendMessage 主会话，接着做下一个。
      - **适时开新对话**：每个会话只做几个画面；上下文变长就先写交接、提交推送，再开新会话接着做（主会话同理）。
      - **只提交自己的文件**（共用工作区，2026-10-12 已两次误带别人暂存的文件）：一律用 `git commit -m … -- <自己的文件…>` 按路径提交（只提交列出的路径，别人暂存的不受影响）；不要提前 `git add` 后把文件长时间留在暂存区；提交后 `git show --stat HEAD` 核对。补画画板只加在文件末尾。
    - 工具用法（画面清单、`--only` / `--changed`、设计稿缓存、`--workers`、缺块警告）见 `repos/orbits/scripts/visual/README-redesign.md`「提速」一节。

## 合回 `chat-agent` 前总验收（R09 写入；全部打勾才合回，RD-03 / RD-24）

**旧屏与旧用法（RD-24）**
- [ ] [`screen-ownership.md`](screen-ownership.md) 每一行都已按「处理」一栏完成（重写 / 并入 / 重定向 / 删除），没有「待核对」。
- [ ] 三份允许清单为空：App `tests/fixtures/ionicons-legacy-allowlist.json`（骨架结束 71 个文件）、App `hardcoded-copy-legacy-allowlist.json`（148 个文件 / 3779 处）与 `legacy-ui-allowlist.json`（85 个文件 / 282 处）、Web `tests/fixtures/hardcoded-copy-legacy-allowlist.json`（232 个文件 / 2305 处写死 + 3669 处缺日文）。
- [ ] `@expo/vector-icons` 依赖已从 App 移除（`ionicons-ratchet` 的依赖检查改为「不存在」）。
- [ ] 旧公用组件已删除：App 旧 `OrbitTabBar` 以外的旧导航 / 旧卡片 / 旧按钮（`legacy-ui-ratchet` 的 `oldComponent` 为 0），Web `OrbitTopNav` 的登录后分支（账号菜单、语言切换，R07 复核 m7）、`orbit-reference-styles.tsx` 里写死颜色的旧样式。
- [ ] Web 旧页面的深色模式（R01 复核 m4）、日文（R03 允许清单）随重写全部到位。

**骨架留下的待办**
- [ ] [交接表](HANDOFF-TO-FEATURE-SPRINTS.md) 每一条都已处理，或在对应 Sprint 的 REPORT 写明保留理由；「未定归属」各条已由用户指定 Sprint 或明确放弃。
- [x] Web Task「プラン」段按产品决定 (a) 放现有计划界面（R07 复核 M5，2026-10-10）；`/app/agent/plan` 保留为兼容跳转。（R25 已换成计划 v2 插槽，兼容跳转已删除，2026-10-11。）
- [x] R25 重写プラン段时：把旧界面和服务端产生的计划链接（`features/**` 的 href、活动跟进的 `taskHref`）统一换成新地址，删除兼容跳转。（2026-10-11：Web 与服务端已换，`tests/audits/no-legacy-plan-links.test.ts` 锁住两端源码；`taskHref` 改动登记在 `shared/contract/BREAKING.md`。）
- [x] 契约演进口径（通用规则 10）产品负责人已确认（2026-10-10）；App 的两个 strict 读取点已改成宽进读取（R08 复核修复）。
- [ ] 首次正式发布时启用 `minSupportedAppVersion` 检查（R18 实现 App 启动检查），之后按通用规则 10 执行。
- [ ] `plan-v2.ts` 去掉 `@draft`、进入快照（R22，已完成）；`NoteMentionContract` 的活动提及已定稿（R20）；公开邀请预览有限流和防枚举（R15）。
- [ ] R08 的 7 组新接口都有 live 实现，或明确保留「尚未实现」并在界面隐藏入口；生产环境不出现示例数据。
- [ ] App `tests/route-parity.test.ts` 的 `/start`：按用户决定（App 以后做引导页）处理完毕，App 测试零失败。
- [ ] Web `AgentDock` 按主区居中（R07 复核 M3 附带，R10）。
- [ ] 计划 C10（次の目標候选，提示词 v7 加 `subtitle`）上 staging 前用真实调用验证 ≤5 次（已授权口径），确认副标题字段稳定产出、旧缓存缺字段时界面不出空行。
- [ ] 产品负责人事后确认：R04 复核 M5（注销确认改为动作表、焦点在安全项）、R05 复核 m6（底栏不随页面转场滑动）。
- [ ] R09 走查留给功能 Sprint 的两条：W3 开发模式水合警告（`/app/events`、`/app/contacts`，R26 / R11）、A2 登录确认画面已显示底栏（R18）。
- [ ] Web マイページ「主催」入口按设计稿重做（R18 账户改版）：R07 返工期间为了手机 Web 能进主催页，在旧マイページ页签栏临时加了「主催」链接（用户拍板 2026-10-12，R07 复核 M3；头像菜单按 b12 W-R07-07b 不列主催）。

**上线前的环境与真机**
- [ ] staging 的 `VERCEL_ENV` / 展示页开关核对（R06 复核 m9：`/showcase` 只在非生产可见）。
- [ ] 真机：触感反馈（R02–R04 只在模拟器验证）、真推送落地（R05）、Dynamic Type 最大字号走查。
- [ ] 活动生产迁移（R26 / R27，等授权，[events/DESIGN.md](events/DESIGN.md) §10 A4 / A5、§11）：`event-assessments-core`（`event_assessments` 表）、`ai-usage-event-purposes`（账本 CHECK 加 `event_registration_interview`、`event_post_summary`）；先只读预检、先迁移再部署。活动付费 AI E1–E4 在用户授权前保持隐藏 / 规则退路。
- [ ] 本地与 staging 都配置 `ORBIT_SYNC_CURSOR_SECRET`（R09 走查 A1：缺了它 App 的待办、人脈同步全部 503）。

**还原设计稿（RD-16 修订，用户决定 2026-10-11）**
- [ ] 两端每个画面都通过逐像素门禁（Web 三宽度 × 浅 / 深、App 浅 / 深），每个 Sprint 的归因文件 `attribution-redesign-<Sprint>.json` 已提交且超阈值带全部是 `[data]`；[2026-10-11 盘点](maintenance/2026-10-11-pixel-audit.md) 列出的不通过画面、「请用户拍板」条目和「设计稿无」画面全部处理完。

**验收**
- [ ] 两端全量对照 R09 基线零新增失败（orbits 6940 / 0、App 4172 / 仅 `/start`，之后各 Sprint 只增不减）。
- [ ] 产品负责人看完合回前的截图集并试用两端，同意合回。
