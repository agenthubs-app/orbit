# Sprint R11b — 人脈分析（構造 / 機会 / インサイト）

**Plan revision:** 2（2026-10-18；RD-33 主会话代定已定稿于 §2）。**模式:** existing-codebase / single-generator（负责：乙；executor：Claude 子任务，B 线）。
**单一目标:** 两端把旧分析屏替换成 b5 E1 的三段分析与下钻；10 人整页锁、App 接 `/api/network/snapshot`、Web 补齐画板后全宽度逐像素验收。**易读目标:** [GOAL.md](GOAL.md)。
**依赖:** R11a 联系人数据层与入口已交付，R31a / R31b 组件库合入后收像素（RD-31）。编制时本工作树 HEAD `1524d3667`、落后 `origin/redesign` 13 提交；所有 `file:line` 是此 HEAD 的只读核查，执行时先在 `line-b` 更新并按符号复核。已知失败以 README 与前序 REPORT 的最新基线为准。

## 0. 给执行者的说明

1. **目录与顺序。** 只在 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-b`（`line-b`）做 R11b；先确认 R11a 交付文件与 `origin/redesign` 的版本，读本页、GOAL、README RD-16 / RD-24～RD-33 与通用规则 10–13、HOW-TO §0–§10、HANDOFF 通用 G01–G26 与 §R11、DEFERRED-A §2、screen-ownership 人脈两行、决定表 §B-1、IMPLEMENTATION-PLAN §1.3、R11a REPORT。若 R11a 尚未合入，本 Sprint 先做无依赖的画板与分析逻辑，SC-03 从分析直链验证；依赖点记 REPORT，不改 R11a 数据层。
2. **提交与通信。** 执行时只按本线文件路径提交，提交前 `git pull --rebase origin redesign`，提交后 `git show --stat HEAD` 查越线；**不推送**，主会话复核后推送（RD-32）。本次修订会话只改 GOAL / PLANNER、绝不提交。实现者每轮摘要给主会话：完成的 SC、提交号、测试摘要、待主会话代定 / 请求 / 未过、下一步。README、HANDOFF、DEFERRED-A、决定表与 screen-ownership 的更新写成 REPORT 的「文档更新请求」，由主会话协调。
3. **本机环境。** B 线沿用 R11a 的 Web 3300 / `.next-line-b`、Metro 8083、本机库 `orbit_line_b`、`Orbit Line B` 模拟器 UDID；画板静态服务另用 3330+ 空端口，用完停止。Python 只能先有 uv 环境再 `uv run`。不连 Neon、不迁生产、不部署、不分发；真实付费 AI 只在本机验证确有需要时调用并记录次数 / token（RD-33）。
4. **基线与做法。** 先记两端全量测试、Web typecheck / typecheck:app / lint、App tsc 的基线；共享契约先 RED、响应宽进严出，改 `shared/**` 后 `npm run sync:contract` 并同提交。UI 先跑 `board-preflight`，从画板 HTML / kit 搬数值；每个画面最多 3 轮，迭代只跑当前视图，收口跑整套。新屏只用 token / Icon / UiText 与壳提供的组件；不用旧屏里的 Ionicons、写死文案和色值。
5. **决策与停止。** §2 是主会话依 RD-33 的定稿，执行者按其实施；新的冲突在 REPORT 写选项、推荐、所影响 SC，交主会话代定，继续独立项。需改其他线文件、生产动作、画板 3 轮未过、全量新失败修 2 次仍未解时，停在对应动作并登记，不把整 Sprint 停掉。结构 / 数据可先完成，R31a / R31b 未合入时像素项标「等组件库」并列重跑视图。
6. **交付。** 本目录补 `preflight-checklist.md`、`REPORT.md`，主会话起独立 `REVIEW.md`；门禁清单 `views/{web,app}-R11b.json` 与 `attribution-redesign-R11b.json`，截图日志放 `~/orbit-sprint-evidence/redesign/R11b/run-01/`。REPORT 逐项回写 §3 / §10 的 SC、真实失败、越线自查和交接，不把尚缺画板或暂缓的视图记为通过。

## 1. 本线归属的文件 / 不许碰的文件（RD-31）

**B 线 R11b 可改 / 可删（按实际引用核实后下手）**

- App：`app/contacts/dashboard.tsx` 保留路径并接新页，`app/contacts/graph.tsx` 改跳转，`app/contacts/analysis/[dimension]/[bucketId].tsx` 保留路径并接新下钻；`src/screens/contacts/{ContactsDashboardScreen,ContactStructureDetailScreen}.tsx` 与仅供它们使用的旧分析子组件、`src/view-models/contacts-analysis.ts`；新建 `src/screens/network-analysis/**`、分析专用字典域。`src/api/endpoints.ts` 只追加 snapshot 端点或删自己不再使用的旧分析端点；路由登记 / 旧用法允许清单只处理本屏。
- Web：`app/(app)/app/contacts/dashboard/**`、`app/(app)/app/contacts/analysis/**`、`contacts/network-0918/` 内 `network-analysis*`、`network-overview*`、`network-insight*`、`network-insights*`、`network-opportunities*` 及确认仅属分析的文件；新建 `orbit-2026/network-analysis/**`、`orbit-2026/copy/network-analysis.ts`。`/app/contacts/analysis/[dimension]/[bucketId]` 保留路径并接新下钻页，不留旧屏。
- 服务端 / 契约：`features/network-analysis/**` 中除下述只读依赖外的本线文件、`app/api/network/snapshot/**`、分析专用的 `features/dashboard/**` 读取投影与 `shared/compute/dashboard-distribution.ts`（后两者只做有测试的必要扩展）；新建 `features/network-analysis/page-lock.ts`（导出 `NETWORK_ANALYSIS_UNLOCK_CONTACTS = 10`）、共享分析视图的 `shared/contract/**` / `shared/api-schema/**` 与 `shared/mock/demo-world/network-analysis.ts`。分析专属 `tests/**` 与本 Sprint 门禁文件。`b12-missing-states.html` **只由主会话补画**，executor 读和比，不擅自改。
- 汇总文件只追加自己的项：`shared/contract/index.ts`、演示世界 index / fixtures、App i18n index / copy-kinds、路由登记 / 审计计数、capability registry；旧屏允许清单只减本线行。`.snapshot.json` 冲突时重新生成，不手合。

**不许碰**：`features/network-analysis/analysis-threshold.ts` 与 `analysis-threshold-reader.ts` 是只读依赖，**不得修改导出或含义**；R11a 的 App `ContactsScreen` / `ContactDetailScreen`、`useContactCardPages` / `contacts-local` 与 Web 人脈列表 / 详情 / 加人屏、`features/contacts/**`、联系人卡片与筛选契约（本 Sprint 只读）；A 线组件 / token；D 线 App `ShellTopBar` / `TabPageBar` / `app-navigation` 与 Web `orbit-2026/shell/**`；C 线账户、E 线 iOrbit；R20a Task / To-do；甲的加人和计划页。确需修改，把具体接口和路径写 REPORT「请求」给主会话，不能越线补丁。R11a 实现列表入口卡「人脈分析 · 10人から使えます · あと N人」，使用本 Sprint 导出的门槛常量；筛选 query 缺项也由 R11a 维护者 / 主会话处理。若 `app-navigation.ts:66` 父页映射需调整，写给 D 线的接口请求。

## 2. 主会话代定

| # | 代定及理由 | 验收落点 |
| --- | --- | --- |
| B-1 | **10 人即解锁**：新建 `features/network-analysis/page-lock.ts`，导出 `NETWORK_ANALYSIS_UNLOCK_CONTACTS = 10`；人数直接取 R11a summary 的 `total`，不在本线重新推导。5 人显示 `5/10`、差 5，9 人差 1，10 人全页可进。b5 文案「10人を超えると」改成「10人から」以免 10 人仍被解释为锁定。对 R11b 分析页，3 位**已确认**联系人只约束快照生成 / 重算，不能解锁 UI（用户 §B-1 #5）；原 `analysis-threshold.ts` / `analysis-threshold-reader.ts` 保持只读，R11a / R28 旧调用原样保留。 | SC-02 / 03 / 08 / 12 |
| B-2 | 10–29 人显示真实结构与可证实的机会 / 洞察，并标「参考値」；**≥30 人去「参考値」**，相关说明写「30人から」。b5 #33 / #39 的「30人を超えると安定」是说明，非第二道锁；没有足够样本的趋势卡隐藏，不把相关性说成因果。 | SC-01 / 04～07 |
| B-3 | `/app/contacts/dashboard` 作为分析入口，默认 `構造`；既有 `?tab=structure|opportunities|insight` 保留深链，旧无 tab 的“概览”不再另成第四页。Web b5 #41 的「インサイトから」并入独立インサイト页，三段内容各只出现一次。 | SC-04 / 05 / 06 / 09 |
| B-4 | Web 先在 b12 **末尾**新 g11 组补画，逐块标「主会话代定 §B-2」；以 b5 #32–#41、#67 为结构源，b12 新画板为正式门禁基准。补画矩阵见 §7；不要拿 1440 缩成 1024 / 390 当验收。将 `app.html:749` 与 b5 `:1288` 的「10 人以下」边界标注列为主会话改稿项：执行者在对应画板原地改稿并注释，主会话验收改稿版本。 | SC-01 / 10 |
| B-5 | 画板的 286、105、12、68%、9% / 21% 等仅为示例。生产只展示同一时点、同一过滤条件的真实计数与有证据的句子；行业环、名单与阶段内訳能相互对账。无真实数据的卡隐藏或展示明确的普通空态，不用假数凑画板。 | SC-03～07 |
| B-6 | Web 1440 下钻留在右栏；1024 若壳无右栏抽屉接口，向 D 线提出具体请求，相关像素项等接口交付后验收；390 用全屏名单；App push 到名单。名单排序照画板「目標に近い順 / 最終接点 / 名前」中实际可算的选项，有数据才显示；「在列表打开 N 人」按 §6 映射回 R11a，不把 AI 候选当成已确认关系。 | SC-07 / 09 / 10 |
| B-7 | 日文快照与 zh/en **在一次 AI 调用中同时生成**；接受 `SNAPSHOT_PROMPT_VERSION` 升版使未发布快照全部重算，沿用现有后台限流，并在本机记录实际调用 / token。扩展生成器、存储、schema、读取和 Web / App 语言传递：Web loader 与 API 传 `ja`，`app/api/network/snapshot/handlers.ts:45-46` 识别 `ja`。旧快照未含日文或实现未完成时，日文界面只显示确定性统计、隐藏 AI 句；不展示英语回退。`features/plans/ai-generator.ts:142-153` 依赖快照文字，纳入回归，确认计划生成的 zh/en 输入与输出仍正确。 | SC-02 / 06 / 08 / 12 |
| B-8 | 不足 10 人时即使旧快照还在，也**不发给分析页**；10 人以上若快照 `none / insufficient / unavailable / recovering / deferred`，结构的确定性数字照常、AI 文案区单独显示状态。读取失败不把旧缓存句子当新结论；手动重算的 3 人、额度与幂等规则沿用现有服务。 | SC-03 / 08 |

上述是 RD-33 主会话定稿的本 Sprint 产品口径。主会话收口时将它们记入决定表 §B-2。

## 3. 交接表逐条去向

**§R11：** R11a 的已交付范围不重复实施；本 Sprint 只接分析有关的延伸。`profile/suggestions` 已从 R11 转 R18（决定表 §B-1 #6），联系人侧更新提案下一期。

| 交接项 | R11b 去向（R11a 的具体 SC 见其 PLANNER「交接条目」） |
| --- | --- |
| R11-01 App「＋」 | R11a SC-06；本线锁定 CTA 复用入口 → SC-03。 |
| R11-02 顶栏 / 二级返回 | R11a SC-06 / 07 / 12；本线下钻返回 → SC-07 / 09。 |
| R11-03 空态小卡 | R11a SC-06 / 07；本线不改列表空态。 |
| R11-04 加人弹窗背景 | R11a SC-06 / 07 / 13；本线锁定 CTA 只深链。 |
| R11-05 联系人字段与汇总 | R11a SC-04 / 05；本线只读汇总 → SC-03 / 04。 |
| R11-06 浓度计划关联 | R11a SC-03；本线不改浓度。 |
| R11-07 来源 chip | R11a SC-02；本线“出会った場所”读同一来源 → SC-04。 |
| R11-08「以前の値」 | R11a SC-09；转职冲突下一期；本线不改详情。 |
| R11-09 招待连接展示 | R11a SC-09；本线名单只链详情 → SC-07。 |
| R11-10 人物类型确认卡 | R11a SC-09；本线机会候选不自动确认 → SC-05。 |
| R11-11 每天一问右栏 | R11a SC-07；本线右栏用于下钻名单 → SC-07。 |
| R11-12 pipeline 删除 | R11a SC-11；本线保留 dashboard / 下钻路径、graph 改跳转，只清理无引用旧分析组件 → SC-09。 |
| R11-13 390 深色水合 | R11a SC-07；本线自己的 390 深色检查 → SC-10。 |
| R11-14 R25 改乙文件 | R11a SC-01；`network-opportunities.tsx` 由本线开工核对 R25 REPORT:132–136 → SC-01 / 05。 |
| R11-15 搜索 / industry query | R11a SC-06 / 07 / 13；本线下钻回列表只调用已交查询 → SC-07。 |
| DEFERRED-A R30 / R11-15 | R11a SC-13 重比；本线只验证名单到列表的条件保持 → SC-07。 |

| 通用口径 | R11b 落点 / 转出 |
| --- | --- |
| G01 | SC-04 / 09：Web 新壳主标题，App 三段顶栏。 |
| G02 | SC-10：次要字按 `--ink-3` 例外，其余对比度。 |
| G03 | SC-08 / 10：危险 / 错误色用 coral-text；本页不新增危险动作。 |
| G04 | A 线 R31a 负责按钮可见 40 / 触控 44；本线 SC-10 只用组件并复比。 |
| G05 | SC-10：每个认可画板逐像素，带归因。 |
| G06 | SC-01 / 10 / 13：按源码搬、快慢两档、独立复核与端口隔离。 |
| G07 | SC-01 / 10：b5 现有 + b12 后补画，旧 / 作废板不进门禁。 |
| G08 | SC-01 / 10：付费或写库中途态用只读固定 fixture 截图。 |
| G09 | SC-03 / 10：示例标签与系统壳按既定例外，不把示例写进 live。 |
| G10 | SC-04 / 10：`ShellPage` 插槽在页面读好再传，右栏计数按真实值。 |
| G11 | SC-10：390 保留标题行，除非新画板明示合并。 |
| G12 | SC-09：390 不新增 🔍 / ⌘K，名单内用页内筛选。 |
| G13 | SC-10：旧全局 CSS 漏入 / 底部 inset / 弹层层级复查。 |
| G14 | 非本线：kiosk / 公开页属于 R17；SC-09 只登记已登录路由。 |
| G15 | SC-07 / 09：App 一级 `/contacts` 不改，二级下钻有父页返回。 |
| G16 | SC-09 / 10：用 `AppScreen` / `TabPageBar` 既有转场规则，不导入 `OrbitTabBar`。 |
| G17 | SC-04～07 / 10：`ShellBackground`、`ShellTopBar`、UiText、Segmented 由壳 / 组件供给。 |
| G18 | SC-02 / 08：能力缺失只隐藏依赖区；mock 从演示世界取人。 |
| G19 | SC-02：快照扩展前先做 App 宽进与 schema parity / sync；未知条目不猜。 |
| G20 | SC-09：旧分析屏的 Ionicons / 写死文字 / 旧写法清单只减不增。 |
| G21 | SC-04～06 / 10：Web `Orbit2026Scope` + ToastProvider、CSS Modules、减少动效。 |
| G22 | SC-02 / 10：Web 语言读 cookie，不拼 `?lang=` 到路由；API `lang` 是独立请求参数。 |
| G23 / G23b | A 线 R31a / R31b 负责组件差异；SC-10 等其合入后复比，不在本屏修组件。 |
| G24 | SC-10：App 新文字用 UiText / 已交付日文字形，不自设字体名。 |
| G25 | SC-01 / 10 / 13：先 `--style-diff` / 数字，3 轮上限，图片按需看，按路径提交。 |
| G26 | SC-10：已存在的字号 / 圆角 token 直接用。 |

## 4. 已查清的事实（当前 HEAD `1524d3667`；执行时按符号复核）

1. **入口与旧屏。** App `app/contacts/dashboard.tsx:1-4` 与 `graph.tsx:1-4` 都指向同一个旧 `ContactsDashboardScreen`；下钻路由 `app/contacts/analysis/[dimension]/[bucketId].tsx:1-4` 指向旧 `ContactStructureDetailScreen`。Web `app/(app)/app/contacts/dashboard/page.tsx:62-67,116-170` 默认仍显示 `NetworkOverview`，三 tab 才显示 `NetworkAnalysis`；`network-analysis.tsx:87-115` 顶栏仍是英语 / 中文旧样式。旧路由必须处理而非只换颜色。
2. **App 未接新快照。** `ContactsDashboardScreen.tsx:16-25,75-82,105-120` 读 `/api/mobile/contacts-dashboard` 与本机 dashboard 镜像；`src/api/endpoints.ts:35-56` 还没有 `/api/network/snapshot`。`route-domain-inventory.ts:646-653` 仍登记旧 dashboard 和旧结构下钻。App 有本机联系人读取可复用，但不能用旧 dashboard 的机会结果冒充新快照。`/api/mobile/contacts-dashboard` 等服务端路由仍被 `repos/orbit-app/src/view-models/dashboard-local.ts` 的首页使用，本 Sprint 不退役，列为跨线交接。
3. **现有快照。** `features/network-analysis/contract.ts:1-6,47-83` 规定快照只存 AI 叙述与依据，不存统计数，语言只有 `zh/en`；`:85-105` 定义快照生成至少 3 位已确认联系人、自动重算新联系人阈值 3 或 20%。`app/api/network/snapshot/handlers.ts:18-25,74-89,93-132` 提供 GET 与手动重算，GET 可能排队 job，手动重算不足 3 返回 409、额度用尽 429、示例模式不读写快照；`:45-46` 仅识别 `lang=en`，其他落 zh。`features/plans/ai-generator.ts:142-153` 读取快照块作为计划输入；升版后必须回归。日文契约是缺口，不可声称已有。
4. **旧 3 人 UI 门槛与新决定冲突。** `features/network-analysis/analysis-threshold.ts:1-27` 从引导 3 位已确认联系人派生 UI gate，且只替换 AI 块；`analysis-threshold-reader.ts:11-20` 计数失败返回 null。R11a 的 `contact-card-route-service.ts:6,44-45`、`contacts/[id]/page.tsx:52,203` 与 R28 的 `START_REQUIRED_CONTACTS` 依赖旧规则，这两个文件必须只读、不可改导出或含义。Web dashboard 路由 `:117-145` 在不同 tab 按旧 gate 读数据。决定表 §B-1 #5 明定 R11b **<10 整页锁、3 人只用于 AI 重算**；新建 `page-lock.ts` 读 R11a summary `total`，只在 R11b 分析页及其数据加载路径使用。
5. **结构与名单已有可复用读数。** Web `analysis/contacts-analysis-view-model.ts:50-65` 有维度、档位和机会视图；`structure-tab-loader.ts:51-84` 按标签读快照和计划高亮，低门槛时不读快照；`contacts-structure-route-service.ts:10-23,33-60` 允许 industry / region / seniority / tier 等下钻，解析后给联系人详情 href。R11b 要先核对这些读取与 R11a 的同一去重 / 删除口径，再复用；不可把一页最多 30 条联系人当全量计数（`network-analysis.tsx:65-68` 已注明）。
6. **机会 / 洞察现状。** `opportunities-route-service.ts:158-220` 分开读计划、待唤醒、快照和证据名单，读取异常各有 fallback；`insights-tab.ts:83-106,120-141` 现读联系人洞察分页、过滤和详情 href，并非 b5 E1 的“趋势对比”整页。Web `network-analysis.tsx:101-115` 已有第三 tab，但 UI 与 b5 独立インサイト板不一致。实施须区分“每人一句洞察”与“人脈总体趋势”。
7. **画板。** 本机静态服务 `:3331` 下运行 `compare-redesign.mjs --list`：b5 #32 锁定 App、#33 少量、#34 構造大量、#35 機会、#36 インサイト、#37 下钻、#38 Web 锁定、#39 Web 少量、#40 Web 構造大量、#41 Web 機会、#67 App 構造深色。`b5-me-inbox.html:1249-1318,1548-1561` 显示 5/10 环、14 人参考值、三个段、下钻右栏；b12 现末尾 #513（`--list` 核对），尚无 R11b 组。画板例数要过自洽预检（§7）。

## 5. 数据与契约

- **锁定数**：直接使用 R11a 当前账号 summary 的 `total`，App 离线用对应最后已同步的 summary 镜像并标记离线，重新上线后校正；不从旧 3 人门槛重算。`features/network-analysis/page-lock.ts` 导出 `NETWORK_ANALYSIS_UNLOCK_CONTACTS = 10` 供 R11b 页面与 R11a 入口卡共用。0–9 的所有 tab URL 只渲染锁定页；受保护下钻不因直链绕开锁，页面不调用 snapshot GET、不排入生成任务，Web 不调用 `loadContactsAnalysis`。边界 9 / 10 / 删除后 9 单测。
- **确定性数值**：行业、职位层、地域、认识途径、阶段人数与名单从 R11a 联系人数据层及已存在的强度 / 计划读模型计算；同一维度“未知”必须有明确桶或从分母一并剔除，不允许环中心 286 而分项凑不齐且无解释。机会卡的 N 人与点开的名单使用相同查询条件和时间戳；名单分页不影响总数。相同一人跨不同机会可重复，各卡自身去重。
- **快照**：App 通过 GET `/api/network/snapshot?lang=<ui>` 取 `NetworkSnapshotView` 的 `state / blocks / evidence / freshness / quota`，有必要时 POST `/recompute`；App 对未知响应字段宽进、未知 `kind` 跳该块，错误状态与读到空值分开。Web loader 与 API 同样传 `ja`，handler 识别 `ja`；一次 AI 调用同时生成 zh/en/ja，扩展存储字段 / 枚举 / schema / generator 与兼容读取，不覆盖 zh/en。升 `SNAPSHOT_PROMPT_VERSION` 后未发布快照会全部重算，使用现有后台限流并记录本机额度；旧快照无日文或日文实现未完成，只显示确定性统计并隐藏 AI 句，等待合法重算，不能悄悄翻译。手动重算沿用服务端幂等、额度、409 / 429；UI 的 10 人锁不能改变服务端的 3 人下限。
- **证据**：AI 块只显示存在且属于当前用户的 `evidence.contactIds` / `recordIds`；点姓名到 R11a 详情，缺证据时不显示无据句。因果类文案加「相関であり、因果ではありません」。无计划不画计划缺口，有计划但缺读模型时给独立空态，不能把“读取失败”当“0 人”。
- **演示 / 失败**：示例世界的人名与数据只从 `demo-world` 取并带 `sample: true`；示例模式 GET 现为 unavailable（事实 3），新页面可用纯前端固定示例但不能发真实请求 / 写库 / 调 AI。每个独立块的读取失败仅降级本块；整页锁的计数读取失败应显示可重试状态，不按 0 人误锁，也不展示缓存 AI 内容。

## 6. 下钻与清理契约

- App 从行业图例 / 细条 / 機会「名簿を見る」push 到新名单，名单顶部为维度名、人数和阶段内訳，三种排序按有数据的能力显示；点一人到 R11a 联系人详情，返回恢复名单排序与分析 tab / 滚动。Web 1440 点击后右栏换名单，1024 的抽屉若壳尚无接口则向 D 线请求，390 是页面；分析内下钻仍可用。

| R11b 下钻维度 / 名单 | R11a 列表 query | 「N 人を人脈一覧で開く」 |
| --- | --- | --- |
| 行业 / 地域 / 认识途径（`metKind`）/ 状态 / 浓度档位 / 来源 | `industry` / `region` / `met` / `status` / `tier` / `source`，逐项按 R11a 已交参数值编码 | 相应参数能精确表示同一名单时显示并带入；否则先隐藏。 |
| 职位层（seniority / role） | 无 | 隐藏；保留分析页内下钻名单。 |
| 机会类候选名单 | 无对应参数 | 隐藏；保留分析页内下钻名单。 |

不得用 `contactIds` 拼列表 query；每个显示的按钮都要核对列表总数与下钻人数一致。缺 query 能力时向 R11a / 主会话提接口请求，不由 R11b 改列表。

- `/contacts/dashboard` 与 `/contacts/analysis/[dimension]/[bucketId]` 两个 App 路径保留并换成新屏；`/contacts/graph` 跳转到 `/contacts/dashboard?tab=structure`。Web `/app/contacts/dashboard` 的旧 overview 并入结构，`/app/contacts/analysis/[dimension]/[bucketId]` 保留路径并接新名单；无死链。删除 `ContactsDashboardScreen` / `ContactStructureDetailScreen` 和仅供它们用的旧组件前用文本搜索列全部引用；`api/schema/mobile-contacts-dashboard.ts` 等旧文件须确认 R11a 不再引用才删。`/api/mobile/contacts-dashboard` 等服务端路由仍供 App 首页使用，本 Sprint 不退役，列交接。旧屏清单只减本屏，不删 R11a 仍需的小件。

## 7. 画板清单、预检与像素 SC

**当前屏幕 ID ↔ 已存在画板（`compare-redesign.mjs --list`，不是猜序号）：**

| 屏幕 ID | 画板 | 用途 |
| --- | --- | --- |
| A-R11b-01 / 02 / 03 | b5 #32 / #33 / #34 | App 锁定 5/10 / 14 人参考值 / 構造大量，390×844 浅 |
| A-R11b-04 / 05 / 06 | b5 #35 / #36 / #37 | App 機会 / インサイト / 下钻名单，390×844 浅 |
| A-R11b-03D | b5 #67 | App 構造大量深色 |
| W-R11b-01 / 02 / 03 / 04 | b5 #38 / #39 / #40 / #41 | Web 锁定 / 14 人 / 構造大量 / 機会，1440 浅 |

**主会话补画：** b12 #513 后建 g11「补画 · 2026-10-18 · R11b 人脈分析」。稳定 ID 用 `W-R11b-05`（独立インサイト 1440）、`W-R11b-01～05-1024` 与 `-390`（锁定 / 少量 / 構造 / 機会 / インサイト），并给 Web 01～05 的 1440、1024、390 各浅 / 深两框；对既有 b5 #38–#41 的 1440 浅只补深框。另给下钻 `W-R11b-06-1024` / `-390` 浅深、App 锁定 / 少量 / 機会 / インサイト / 下钻的深框。合计新框 **35**（Web 主状态 26、Web 下钻 4、App 深色 5）；1440 下钻以 b5 #40 / #41 已选右栏验收。**新画板序号暂不写死**，补画后用 `--list` 固定到 `views` 与本 PLANNER 的执行版，并检查补画没有移动旧 #0–#513。若主会话确定下钻要独立 1440 画框，另补并在 REPORT 更新矩阵，不拿旧板代替。

**画板预检（写界面前）：** 在 `repos/orbits` 运行 `board-preflight.mjs`，设计服务指向本机 3330+，对全部 b5 与新 b12 R11b 视图生成本目录 `preflight-checklist.md`。逐屏记录：①画板标签 / 类型 / 尺寸 / 浅深；②数字自洽（行业 105+83+63+35=286，少量 5+4+3+2=14，阶段 58+27+13+7=105，机会卡人数与名单示例条数“示意 / 全量”区分）；③token 缺口与近似值；④每个数字 / 文案 / 按钮的数据来源或「纯示例」；⑤`?`、切 tab、下钻、抽屉、加载 / 更新中状态怎样到达。主会话改稿项：`app.html:749` 与 b5 `:1288` 的「10 人以下」改为与 10 人即解锁一致，执行者在原文件改稿并加注释；锁定态 App / Web 的「10人を超えると」改成「10人から」，≥30 人说明改「30人から」。改稿前后各预检一次。发现源画板自相矛盾先写主会话代定，不能靠 `[data]` 把结构差异放行。

**门禁：** Web 完整页面含壳，1440 / 1024 / 390 × 浅 / 深；App 390×844 真模拟器浅 / 深。先 `--style-diff` 再 `compare-redesign` / `compare-redesign-app`；每张保留 `result.json`、`cells.json` 与必要的 triptych。整屏 raw 记录，RD-29 判定以所有超阈带只属于 `[data]` / `[raster]` / `[contrast]` 且对照图无缺块为准，颜色替换必须在已批准清单；版式差异不归因为数据。状态栏 / Home 条 / Safari 地址栏按规则 13 不实现。中途态用只在开发环境存在的 `design=` / `open-path` 开关，正式构建测试保证没有。**快照更新中、失败、无快照、无计划**目前设计稿无：各状态附真实截图和行为测试，标「设计稿无」，不进像素门禁；若后续补画，再按新 ID 验收。像素收口在 R31a / R31b 合入之后。

## 8. 范围外与测试边界

R11a 的列表、详情、编辑删除、`contacts/pipeline` 与 `profile/suggestions` 不在本 Sprint。列表中的「人脈分析 · 10人から使えます · あと N人」卡由 R11a 用本线导出的常量实现；R11a 交付前从直链验收 SC-03。R10 首页上的分析入口只要求链接可达，首页卡片内部由 R10 改；`/api/mobile/contacts-dashboard` 等 App 首页服务端路由暂留并交接；R13 / R14 收件箱、R20a To-do、R21 iOrbit 只通过已导出接口或深链接入。没有计划 / Gmail / 活动数据时不能为画板制造机会或相关性。不能用生产数据截图；本机 fixture 要覆盖锁定边界、少量、较多、无计划、无快照、额度用尽及下钻。

## 9. 验收契约（每项有操作链和证据）

| SC | 操作链与预期 | 证据 |
| --- | --- | --- |
| SC-R11b-01 开工与画板 | 更新 `line-b`、核实 R11a 基线与 R25 改过的 `network-opportunities`；起 3330+ 设计服务，`--list` 对 b5 / b12；主会话按 §7 在 b12 末尾补画并代定，执行者对 `app.html:749` 与 b5 `:1288` 的「10 人以下」在原稿改注释，核对「10人から」「30人から」，跑改稿前后 preflight，生成视图清单。 | HEAD / 基线摘要、画板编号表、原稿差异与注释、`preflight-checklist.md`、主会话补画提交号。 |
| SC-R11b-02 契约 / 日文 | App 先以新增 schema 宽进解析 GET 的 ready / none / insufficient / unavailable、未知块跳过；一次 AI 调用同时生成 zh/en/ja，升 `SNAPSHOT_PROMPT_VERSION` 后未发布快照全量重算且走后台限流；Web loader / API 传 `ja`、handler 识别 `ja`，旧快照兼容。日文缺失时只显示确定性统计并隐藏 AI 句；zh/en 旧测试不退步；`shared/**` 同步 App；模拟旧行、未知枚举和无日文行。 | schema parity / 快照与 handler 测试、App 解析测试、Web 语言请求测试、`sync:contract`、重算调用 / token 记录与迁移正向 / 重放（若有）。 |
| SC-R11b-03 10 人整页锁 | R11a 交付前以 5 人从直链进分析；交付后从列表入口卡进入，两端仅进度环 5/10 + 加人 + 预告；9→10 解锁三个 tab；删除回 9 再锁；直开 Web `?tab=insight` / App 下钻无法绕过；3 位已确认只影响重算。**<10 时 snapshot GET 为 0 次、生成任务入队为 0 个，Web `loadContactsAnalysis` 为 0 次**。读取计数失败给重试，不伪装 0。 | 服务端边界与请求 / 入队 spy 测试、Web loader spy、App 本机镜像测试、两端渲染截图、快照未泄漏断言。 |
| SC-R11b-04 構造 | 14 / 30 / 286 人进構造：14 显示「参考値」，30 与 286 不显示，说明用「30人から」；行业环中心、图例、职位层、地域、认识途径、缺口与档位每项真实可对账；点 `?` 展开依据；点图例进名单；无计划只隐藏计划缺口。 | 纯计算测试、数据对账表、两端操作录屏 / 截图。 |
| SC-R11b-05 機会 | 切機会→四类机会仅在有事实支撑时出现；大数字等于各卡下钻名单去重人数，头像属于名单，`?` 给依据；点「名簿を見る」进相同筛选，不触发写入或付费 AI；无活动 / 无计划各自降级。 | 查询 / 投影测试、无写入与调用计数、两端操作记录。 |
| SC-R11b-06 インサイト | 切独立インサイト：趋势 / 对比的分子分母来自可追溯事件和联系人，不足样本隐藏；相关性句标明非因果；快照 AI 句有可点击证据、日期与 stale 状态。Web 不在機会底部重复一组洞察，App 日语无英语回退句。 | 数据来源表、快照证据测试、两端渲染和语言截图。 |
| SC-R11b-07 下钻名单 | App 图例 / 细条 / 机会卡→push 名单→排序→点人进 R11a 详情→返回保留排序、tab、滚动；Web 1440 右栏、1024 抽屉待 D 线接口、390 全屏；N 人与名单总数一致。按 §6 映射，仅可由 R11a query 精确表示的维度显示「N 人を人脈一覧で開く」并保留条件；职位层与机会名单隐藏按钮或只在下钻页内展示，不使用 `contactIds`。 | 路由与查询测试、可显示 / 隐藏按钮矩阵、三宽度 / 模拟器操作链记录；1024 若缺壳接口附 D 线请求。 |
| SC-R11b-08 快照状态与重算 | App 联网 GET snapshot，测试 ready、queued / running、deferred、recovering、none、unavailable、离线与 409 / 429；已确认联系人不足 3 位时不得重算，但 10 人统计仍可看；示例模式 0 写 / 0 AI；重复手动请求只扣一次配额。 | handler / service 测试、App 状态渲染、幂等与配额日志（本机）。 |
| SC-R11b-09 路由与旧屏 | R11a 入口与 Web 深链到新页；App `/contacts/dashboard`、`/contacts/analysis/[dimension]/[bucketId]` 保留路径接新屏，旧 `graph` 跳转；Web 旧下钻路径接新名单。旧组件及 `api/schema/mobile-contacts-dashboard.ts` 等仅在确认 R11a 无引用后删除；`/api/mobile/contacts-dashboard` 等首页服务端路由保留并交接。全站搜索无死链；`app-navigation.ts:66` 如需调整，提 D 线请求。 | 路由测试、`rg` 引用清单、删除 / 保留清单、D 线请求（若有）与越线自查。 |
| SC-R11b-10 像素门禁 | 对 §7 每个认可的 ID 做 Web 三宽度 × 浅 / 深、App 浅 / 深；开发态开关只在开发环境；每张看文字结论、⚠ 和必要三联图；本线归因文件按 RD-26 / 29，R31 组件问题登记重比。快照更新中 / 失败 / 无快照 / 无计划设计稿无，附截图与行为证据，不计像素门禁。 | `views`、attribution、门禁总表（raw / 超阈带 / 归因 / 证据路径）及设计稿无状态截图。 |
| SC-R11b-11 边界 / 无障碍 | 锁定态、无计划、无证据、离线、未登录、读取失败、缩放字体、减少动效；图例、`?`、tab、名单可键盘 / VoiceOver 操作；Web 390 无重复系统壳。 | 两端真实渲染测试、模拟器与浏览器操作记录。 |
| SC-R11b-12 全量回归 | orbits `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`、typecheck、typecheck:app、lint、copy:qa；App `npm test`、`npx tsc --noEmit`；R11a 列表 / 详情与 R30 搜索入口的关键回归零新增失败。专测 `analysis-threshold.ts` / `analysis-threshold-reader.ts` 导出与旧 3 人含义未变、R11a `contact-card-route-service.ts` 和详情页旧行为、R28 `START_REQUIRED_CONTACTS`；`features/plans/ai-generator.ts:142-153` 读取新快照后的 zh/en 计划输入 / 输出仍正确。 | 与开工基线逐项对照的摘要、门槛与计划回归用例名、失败用例名（如有）。 |
| SC-R11b-13 REPORT 与复核 | REPORT 逐项写 SC、§3 交接结果、§2 代定实做差异、生产未做、未过 / 暂缓、画板与测试证据、按路径提交与越线自查；主会话独立复核重跑改过 / 未过和至少 20% 已过画面。 | REPORT / REVIEW、`git diff --stat origin/redesign...HEAD`、复核摘要。 |

## 10. 执行顺序

1. SC-01：更新 B 线、确认 R11a 版本和基线；主会话补画 g11，预检、固定 board-index 与 views。缺板时可先推进 SC-02 / 03 的纯逻辑，相关像素必须等板。
2. SC-02：快照契约 / App schema / 日文兼容测试先行；本机迁移与演示数据。
3. SC-03：10 人整页锁及直链守卫；SC-04～06：结构、机会、洞察的数据投影与两端新屏。
4. SC-07：名单与 R11a 详情 / 筛选联动；SC-08：快照状态与重算；SC-09：切新路由、删旧屏和审计行。
5. R31a / R31b 合入后 SC-10 像素；SC-11 边界；SC-12 全量；SC-13 REPORT 与主会话独立复核。每一步的失败只阻塞依赖它的下一步，其他已授权项继续。

## 11. 失败与交接

- **设计缺口：** b5 Web 独立インサイト、深色、1024 / 390 和 App 五个深色框目前没有；主会话按 §7 补画并记录代定，补画前这些视图状态是「设计稿无」，不得写「通过」。快照更新中 / 失败 / 无快照 / 无计划没有画板，附截图与行为测试，不计像素门禁。1024 右栏抽屉若壳无接口，提出给 D 线的具体请求，不能假定已有。如果新增板与旧 b5 冲突，以新板和 §B-1 的 10 人规则为准，REPORT 列出作废板。
- **数据缺口：** 行业 / 阶段 / 机会若无法按 R11a 数据真实算出，先列查询与可用字段，隐藏该卡并向主会话请求 R11a 只读接口；不要用示例数字或 AI 文案补齐。`ja` 旧快照缺文本或本次未完成时按 §2 B-7 降级，记录兼容覆盖率，不做无授权的生产回填。
- **跨线交接：** 给 R11a 的列表入口卡（使用 `NETWORK_ANALYSIS_UNLOCK_CONTACTS`）、筛选 query 缺项及 `api/schema/mobile-contacts-dashboard.ts` 删除前引用确认；给 D 线的 `app-navigation.ts:66` 父页映射和 1024 右栏抽屉接口（若需要）；给 R10 的首页分析入口与 5/10 文案、给 R13 / R14 的快照不应触发收件箱写入、给 R20a 的“待跟进”同口径；`/api/mobile/contacts-dashboard` 等首页服务端路由继续保留。均写 REPORT 的「交接表追加」四栏原文，由主会话更新 HANDOFF / DEFERRED-A；screen-ownership 两端分析行从 R11 改记 R11b 也由主会话更新。
- **阻塞证据：** 组件未合入、缺画板、3 轮仍未过、全量新增失败等逐项写画面 ID / 命令 / 退出码 / 受影响 SC 与可继续的独立 SC。不能把“测试没跑”“旧索引不准”“主会话未回复”报告成通过。
