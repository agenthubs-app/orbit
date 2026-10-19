# R11b 人脈分析（構造 / 機会 / インサイト）— REPORT（2026-10-19）

范围：PLANNER rev 2（§2「主会话代定」B-1～B-8）+ GOAL，外加主会话 RD-33 补充代定（R11a 两项追补、R11a 复核修复、`sort=added`、add-contact-screens、b12 g11 只补 Web インサイト、无数据源的块不画）。B 线 worktree `redesign-b`（`line-b`），Web :3300（`.next-line-b`）、Metro :8083、本机库 `orbit_line_b`、模拟器 `Orbit Line B`。没连 Neon、没部署、没推送；**付费 AI 真调 0 次**（快照用 mock 生成器与 fixture；本机 live 页面只读快照并排队，没有跑 worker）；没用 GitNexus。

**结论**：契约 / 服务端 / 两端界面 / 旧屏退役 / 测试已交（SC-01～09、11、12）；Web 像素门禁 5 张通过、W-R11b-04 未过（SC-10 Web，复核修正见 §4）；两端全量对照基线零新增失败。**App 像素门禁未跑**（§4：模拟器里的开发包没连到本线 :3300，接口地址要在 App 设置里改，记交接 R11-18），App 行为复核后以 16 条真实渲染测试覆盖。待主会话独立复核（SC-13）。

## 1. 提交（`line-b`，已 rebase 到 `origin/redesign`，未推送）

| 块 | 提交 |
| --- | --- |
| R11a 追补（编辑页隐藏内部标签；`page-lock.ts` 常量并让 R11a 入口卡引用）、R11a 复核 S1 / M1 / M2 / M3 / m、A 线新组件替换、`sort=added`、add-contact-screens 测试 | 已在 origin（主会话已推） |
| 快照日文（迁移 v6 `narrative_ja`、一次生成 zh/en/ja、`lang=ja`、提示词 v4） | `ae2e4ad8b` |
| 契约：分析视图 / 下钻名单 / 快照读取 schema + 纯投影 `analysis-model` | `562408cab` |
| `GET /api/network/analysis`、`…/people`，capability `network-analysis`，mock 世界 + 仅开发用的设计稿 fixture | `000cfbd64` |
| Web 新屏（锁定 / 構造 / 機会 / インサイト + 見立て、右栏名单、整页名单） | `703fc6cd3`、`07ac24ded`、`805ba0dbe`、`f92659b84`、`bbda669a6` |
| Web 旧分析屏退役（约 6 千行，含测试与流量脚本） | `f5973bc11` |
| 文案 copy:qa | `dc710b7d4` |
| App（子任务）：字典、新屏、旧屏与测试退役 | `59de3f426`、`e007ee835`、`f56d2a9bf` |
| 画板：「10人から」「30人から」改稿；b12 g11 W-R11b-05（#514 / #515）+ b5 隐藏块原地注释 | `e06921db9`、`51649235d` |
| 预检、门禁清单、fixture 调整、归因 | `cab91e3f4`、`65188175f`、`caf457c0e` |
| 本 REPORT | 本文件所在提交 |

## 2. 成功标准

| SC | 结果 | 证据 |
| --- | --- | --- |
| 01 开工与画板 | ✅ 基线（快照目录，见 §3）；b5 #32–#41、#67 与新补 b12 #514 / #515；「10人を超えると」→「10人から」、「30人を超えると」→「30人から」原地改稿加注释，`app.html:749` 注释改为「不足 10 人锁定」；两端 `board-preflight` | `preflight-checklist.md`（+ `preflight-web.md` / `preflight-app.md`）、`views/{web,app}-R11b.json` |
| 02 契约 / 日文 | ✅ 同一次生成产出 ja（缺或不安全只丢日文句）；迁移 v6 加可空 `narrative_ja`（旧行 null = 无日文）；`lang=ja` 无日文时块为空、**不回退**；`SNAPSHOT_PROMPT_VERSION` → v4（未发布快照按现有后台限流重算）；App 宽进 schema（未知 kind 跳过、未知 state → unavailable）；`sync:contract` 同提交；计划生成读快照的 zh/en 路径未改（plans-v2 PG 套件过） | `network-snapshot-validator.test.ts`（ja 两例）、`network-snapshot-postgres.test.ts`（ja 视图 + 旧行）、迁移 / plans-v2 / r27 PG 套件 |
| 03 10 人整页锁 | ✅ 先读 R11a summary `total`；<10 只读这一个数：**0 次行读取、0 次计划读取、0 次快照 GET / 排队**；下钻直链 409 `LOCKED`；9→10 解锁、10→9 再锁；人数读不到 = 503 / 重试，不当 0 人；`analysis-threshold*.ts` 未改、3 人含义有专测 | `network-analysis-page-lock.test.ts`、`network-analysis-routes.test.ts`（spy）、两端渲染测试、门禁 W-R11b-01 |
| 04 構造 | ✅ 业界（前 3 + その他 或 4 个）/ 役職層 / 地域 / 出会った場所 都加总到 total；图例 → 同规则名单、人数一致；10–29「参考値」、30 起无；不足卡 = 计划 v2 人物类型（目标 vs 已关联），计划读不到单独提示 | `network-analysis-model.test.ts`、`network-analysis-fixtures.test.ts`（画板数字逐项是真实计数） |
| 05 機会 | ✅ 再会すべき人（计划相关且 90 天无接点）/ 止まっている関係（関係構築且 30 天无接点，平均天数）；人数 = 名单总数，头像属于名单；0 写入、0 AI。紹介を頼める人 / 今月のイベントで会える人 无数据源 → 不画（主会话代定） | 同上 + routes 测试 |
| 06 インサイト | ✅ 出会い方（最大业界、两组各 ≥5 人、比较进入関係構築的比例，? 写明相関であり因果ではない）、伸び（6 个月、本月 ≥3 人的业界、计划同业界补一句）；<30 人不出趋势卡；返信 无数据源不画；見立て = 快照句 + 可点依据人 + 日期 + 状态；Web 機会页不再重复「インサイトから」（§B-3） | 模型 / fixture 测试、门禁 W-R11b-05 / 05d |
| 07 下钻名单 | ✅ Web 1440 右栏（前 5 张 + 按钮）、<1280 壳的抽屉、<768 整页；App push；段階の内訳（知り合い / 関係構築）、排序按有数据才出现、分页不改总数；「N人を人脈一覧で開く」只给业界（R11a 列表只认 `?industry=`），其他维度与机会隐藏，不用 `contactIds` | routes 测试、两端渲染测试 |
| 08 快照状态与重算 | ✅ ready / 更新中 / 明日更新 / なし / 読めません 各一行；示例模式 0 写 0 AI；見直す 调现有 recompute（幂等键、409 / 429 提示） | App 渲染测试（429 / 409 / 失败 / 成功）、Web 运行时 |
| 09 路由与旧屏 | ✅ `/contacts/dashboard`、`/contacts/analysis/[d]/[b]` 两端保路径接新屏；App `graph` → redirect；Web 旧维度（tier）→ 分析页；旧屏 / loader / 测试删除，允许清单只减；首页 `/api/mobile/contacts-dashboard` 保留 | 提交说明里的引用清单、审计测试改写 |
| 10 像素门禁 | Web 5 张通过、W-R11b-04 未过；App ⏸ 未跑 | §4 |
| 11 边界 | ✅ 锁定 / 无计划 / 计划读不到 / 无快照 / 人数失败 / 离线（App 缓存视图 + OfflineBar）/ ja 无日文；Segmented 方向键、按钮可聚焦；390 无重复系统壳 | 两端渲染测试 |
| 12 全量 | ✅ 零新增失败 | §3 |
| 13 REPORT / 复核 | 本文件；复核待主会话 | — |

## 3. 测试对照

基线在 `cb866e48f` 的 `git archive` 副本上跑（没有 git、没有根目录 docs，所以基线多几条「找不到文件」类失败，对照只看新增）。收口在 rebase 后的工作树上跑（heavy.sh，`final2-*.log`）。

| | 基线 | 收口 | 新增失败 |
| --- | --- | --- | --- |
| orbits 全量（`LANG=en_US.UTF-8`） | 7511 / 6508 过 / 14 败 / 989 跳 | 7423 / 6432 过 / 7 败 / 984 跳 | 0（`personal-schedule-collection` 的同日基线复现见下） |
| App 全量 | 3190 / 3175 过 / 12 败 | 3185 / 3173 过 / 10 败 | 0 |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 | 0 / 0 / 0 | — |
| App `tsc --noEmit` | 0 | 0 | — |
| `copy:qa` | 全仓 218 条（别的域） | 218 条，人脈 / 人脈分析域 0 | — |
| 联系人 PG（6 文件） | 3 败（ICU / 时区既有） | 同 3 条 | 0 |

orbits 总数变少：删了旧分析屏的测试（约 90 条）。第一轮收口（rebase 前）跑出 4 条新增并已修（`bbda669a6`）：CSS 圆角没用 token、0918 链接自检下限（旧分析屏整屏删除后链接从 ≥60 降到 42）、审计里 dashboard 的路由参数（新屏不再挂 OrbitVisualFreezeRuntime）、App `plan-overview-screens` 一条（rebase 前 A 线的中间状态，rebase 后不再失败）。

**复核 m1（2026-10-19，同日期同命令）**：对原基线源码副本和当前工作树分别运行 `env LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 node --test --import tsx tests/api/personal-schedule-collection.test.ts`。基线 10 条中 9 过、1 败，失败名为 `web personal client requests the editable collection rather than the legacy aggregate`；当前 10/10 过。基线该例把 `startsAt` 固定在 2026-09-17，跨日期后被读取过滤；当前例使用当前时间加一天。证据 `_evidence-b/R11b/review-m1-{baseline,current}.log`；基线展开副本已归档为 `_evidence-b/baseline-source-trees-20261019.tar.gz`。这项同日复现支持“日期相关的旧测试失败”，不把基线失败写成当前通过，也不将旧全量日志中未重跑的项算作已验证。

## 4. 像素门禁（RD-16 / RD-29）

Web（`compare-redesign.mjs --suite views/web-R11b.json`，`ORBIT_REDESIGN_MOCK=network-analysis` + 设计稿 fixture 变体，归因 `attribution-redesign-R11b.json`）：

| 画面 | 画板 | raw | 超阈带 | 未归因 | 结果 |
| --- | --- | --- | --- | --- | --- |
| W-R11b-01 锁定 1440 浅 | b5 #38 | 0.0003 | 0 | 0 | PASS |
| W-R11b-02 少量 1440 浅 | b5 #39 | 0.0159 | 9 | 0 | PASS |
| W-R11b-03 構造 1440 浅 | b5 #40 | 0.0114 | 7 | 0 | PASS |
| W-R11b-04 機会 1440 浅 | b5 #41（复核改稿） | 0.0072 | 4 | 4（另有缺块 5） | **FAIL** |
| W-R11b-05 インサイト 1440 浅 | b12 #514 | 0.0179 | 9 | 0 | PASS |
| W-R11b-05d インサイト 1440 深 | b12 #515 | 0.0156 | 9 | 0 | PASS |

原收口表把 W-R11b-04 缺失的整块内容也标成 `[data]`，归因越界，原 PASS 已撤回。b5 #41 已原地改为只画有来源的「再会すべき人」「止まっている関係」，去掉「インサイトから」和没有每周重算机制的副标题；右栏按真实五人名单及「さらに表示」改稿。重比三轮：未设置 fixture 时 raw 0.0227 / 10 条未归因；设置 `many286` 后 raw 0.0049 / 3 条未归因、2 处缺块；右栏改稿后 raw 0.0072 / 4 条未归因、5 处缺块。差异仍集中在右栏人名、摘要及按钮附近，画板和实现尚未逐带对齐，未给缺块补 `[data]`。证据 `_evidence-b/R11b/review-m1-pixel-r{2,3}/`、对应 `.log`；原其余五张证据 `_evidence-b/R11b/run-01/gate-web-r6/`，原先的 W-R11b-04 结果仅供问题定位。

- **设计稿无（不进门禁，登记 DEFERRED）**：Web 1024 / 390 全部状态，Web 锁定 / 少量 / 構造 / 機会 的深色；App 锁定 / 少量 / 機会 / インサイト / 下钻 的深色；快照更新中 / 失败 / 无快照 / 无计划。结构照 1440 / 浅色，颜色只用 token。
- **App 门禁未跑**：`views/app-R11b.json`（A-R11b-01…06、03D）已备。模拟器 `Orbit Line B` 能开开发包（Metro :8083，系统语言改成日文），但包里的接口地址不是本线 :3300（分析页「人数を読み込めませんでした」，dev 日志没有 App 请求；地址存在 App 的本机设置里，要在设置页改），这一轮没做完，记交接 R11-18。App 侧已知与画板的差：图表条用纯色（无 kit 渐变与圆点）、ghost 行文字用 `ink3Text`、「?」用本页的小按钮（A 线 `WhyDisclosure` 会把正文放进按钮列，打乱标题行）——随门禁一起判。

## 5. 运行时验证（dev :3300，qa@orbit.test，live）

78 人：構造（テクノロジー 3 / 製造 2 / コミュニティ 1 / その他 72；役職層全部未設定；出会った場所 2 / 13 / 0 / 63）、不足卡（「調達経験のある起業家」3 人中 0 人）、機会只出「止まっている関係 15 人 · 平均 90 日」（没有 90 天以上未接触的计划相关人，所以不出再会すべき人）、インサイト「傾向として言えることは、まだありません。」+ 見立て「見立てを更新しています」（GET 排队、本机没有 worker、0 次 AI）、下钻 金融・投資 1 人与人数一致。截图与日志：`_evidence-b/R11b/run-01/web/`（`run-live.log`、`live-*.png`；fixture `run-many286.log`、`many286-*.png`）。

## 6. 实施差异 / 自定工程决定

- page-lock 规则放在 `shared/compute/network-analysis-page-lock.ts`（两端共用），`features/network-analysis/page-lock.ts` re-export（App 不能引服务端文件）。
- 分析视图由服务端一次算好（R11a 卡片读取分页 + 一条职级读取 + 计划 v2 需要），两端同一份数字；App 离线显示上次的视图。读取上限 2000 人，超出明确报错而不是算一部分。
- 业界 / 地域折叠桶 id 用 `rest`（目录已有真实业界 id `other`）。
- 迁移号 network-analysis v6（主会话已登记）。
- 设计稿 fixture 只被开发路由 `app/api/dev/network-design-fixture/route.dev.ts` 引用（生产包不收录），可复用给 R11a 像素轮（`designNetworkPeople(variant)`：empty / locked5 / few14 / many286，R11-16）。
- 引导期示例（W0005，归 R28）：分析页用演示世界的数字渲染、不开下钻、不读快照。

## 7. 交接 / 请求

- **交接表追加 R11-18**：App R11b 像素门禁（A-R11b-01…06、03D）与 R11a 像素轮一起跑；前置是模拟器开发包指向本线 dev 端口（设置页改接口地址）。
- **给 R11a / 主会话**：R11a Web / App 列表只认 `?industry=`；若要地域 / 出会った場所 / 段階 也能「N人を人脈一覧で開く」，需要列表加 `?region=` / `?met=` / `?status=` 的 URL 预选。
- **给 R10**：首页人脈 / 分析入口深链 `/contacts/dashboard`；「最近 4 人」用 `sort=added`（已交）。
- **给 R13 / R14**：快照读取不写收件箱。
- **App 可能已无用的旧代码（子任务列出，未删）**：`src/view-models/contact-structure-detail.ts`、`AnalysisPieOrbitChart`、`contactRoleCountsFromPayload`、`contactsAnalysisTemplate`、`src/api/schema/mobile-contacts-dashboard.ts`（同步副本，只剩测试用）；Web 保留给引导示例 / 旧详情用的类型文件见 `f5973bc11` 说明。

## 8. 文档更新请求（主会话协调）

- screen-ownership：两端人脈分析两行从 R11 改记 R11b（已处理）。
- DEFERRED-A：R11-18（App 门禁）；§4 的「设计稿无」清单。
- 决定表 §B-2：本 Sprint 主会话代定 B-1～B-8 + RD-33 补充（b12 只补 Web インサイト；无数据源的块不画，§15-1 先例）。
- README 登记表：R11b → done，待复核（Web 门禁过、App 门禁待重比）。

## 9. 待主会话决定

1. 画板上无数据源 / 无机制的块已按代定不画（紹介を頼める人、今月のイベントで会える人、返信、「毎週月曜に再計算」「インサイトは毎週月曜に更新されます」、App sliders 按钮）——以后有数据源时是否补回。
2. 下钻名单的段階 chip：画板有 推進中 / 協業中，实现只有 知り合い / 関係構築 / 要フォロー（R11a §B-2）。
3. 机会名单右栏底部：画板「12人を人脈一覧で開く」，实现按 §6 不给（列表没有对应参数），显示「さらに表示」→ 整页名单。
4. 整页名单 / App 列表的业界名用目录名（金融・投資…），画板示例名（投資・金融…）不同；锁定页「分析の例」用画板示例名（固定 SAMPLE）。

## 10. 清理

dev :3300（本线 PID）、画板服务 :3331 / 复核用 :3352、Metro :8083 已停；模拟器 `Orbit Line B` 已关机（系统语言改成日文，留给像素轮）；`next dev` 改写的 `tsconfig.json` / `next-env.d.ts` 已还原；复核 fixture 恢复默认，临时开发路由已移除。证据在 ORICO `_evidence-b/R11b/`（`~/orbit-sprint-evidence/redesign/R11b` 是软链）。

## 11. 主会话复核修复（2026-10-19）

- **S1** `acaad6d94`：App 缓存视图只有最新人数确认解锁后才发快照 GET；名单收到 `409 LOCKED` 立即隐藏旧名单并清除对应缓存。先红后绿；页面测试 16/16，App typecheck 0。证据 `_evidence-b/R11b/review-s1-{red2,green,full}.log`。
- **M1** `2869b7ad9`：b5 #41 原地按真实可见块改稿，移除 W-R11b-04 旧的整块 `[data]` 归因。第三轮重比仍 FAIL，详见 §4。
- **M2** `baa8e4996`：分析读取异常日志只保留事件、错误类别及安全码；含私密邮箱的异常消息不出现在日志。路由测试 4/4，Web typecheck 0。证据 `_evidence-b/R11b/review-m2-routes.log`、`review-m2-web-typecheck.log`。
- **m1**：同日同命令的基线与当前日志详见 §3；本次文档提交单独保存结论。
