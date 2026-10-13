# Web 计划页像素返工（R23–R25）· 返工报告

- 范围：Web 计划页全部画面——目標入力 / 生成流程 / AI 修正 / 手動編集（R23，B 组），概要 / 人物タイプ詳細（R24，A 组），見直し / 完了 / 目標の切替と編集 / 以前のプラン（R25，C 组）。
- 口径：RD-16 修订——和设计稿一模一样，只许数据文字不同；整屏 raw ≤ 0.02，超阈值带只能以 `[data]` 归因（`repos/orbits/scripts/visual/attribution-redesign-R23-25.json`）。
- 开工 2026-10-12 13:22:59；本报告写于 23:05（全量门禁 22:33–22:57）。

## 1. 结论

**未全部通过，不能标 done。**

- 通过 22 个画面（1440 浅 / 深，另有 W-R23-01 的 390）：B 组 12 个、C 组 8 个，另 C 组 02M 深色。
- A 组 0 个通过：卡在组件库、R26 服务端、壳，以及 3 处画板口径（用户已定，画板在改）。
- 通过的画面里有几张还带「⚠缺块」提示，没逐一查清，见 §5 第 1 条。

## 2. 门禁总表（收口全量，单路串行）

证据：`~/orbit-sprint-evidence/redesign/pixel-audit/run-02/plan-rework/{final-a,final-b,…}`。脚本见 §6。

### B 组：目標入力 / 生成流程 / 手動編集

| 画面 | raw 浅 / 深 | 结论 | 说明 |
|---|---|---|---|
| W-R23-01 1440（b12 #296 / #297） | 0.0006 / 0.0006 | 通过 | web.html #15 已作废（用户 10-12） |
| W-R23-01 390 | 0.0017 / 0.0017 | 通过 | |
| W-R23-02a / 02b / 02c | 0.0002 / 0.0002 / 0.003 | 通过 | 02a / 02b 浅深同值 |
| W-R23-03 | 0.0002 | 通过 | |
| W-R23-04（同视图含 05 / 08） | 0.0034 / 0.0033 | 通过 | |
| W-R23-07 | 0.0034 / 0.0031 | 通过 | |
| W-R23-09 | 0.0045 / 0.0046 | 通过 | |
| W-R23-10 | 0.0153 / 0.0162 | 通过 | 4 条带 `[data]`；⚠缺块 4 |
| W-R23-19 | 0.0106 / 0.0103 | 通过 | 2 条带 `[data]`；⚠缺块 3 |
| N17b | 0.0094 / 0.0092 | 通过 | ⚠缺块 5 |
| W-R23-06 | 0.101 / 0.091 | 未过 | mock 候补来自 `mock-flow-context` 写死的演示联系人；画板 3 人且已勾选一人 |
| W-R23-11 / 12 / 13 / 14 | 0.06～0.13 | 未过 | 引用只能取真实库、题库文字（D35）、方案名由数据推出，长度不同整体下移；3 轮上限 |
| W-R23-15 | 0.061 / 0.047 | 未过 | 同上；3 轮上限 |
| W-R23-17 / 18 | 0.067 / 0.051、0.044 / 0.036 | 未过 | 画板是改到一半的状态；「＋ タイプを追加」保留 |

### C 组：見直し / 完了 / 目標 / 以前のプラン

| 画面 | raw 浅 / 深 | 结论 | 说明 |
|---|---|---|---|
| W-R25-03 見直し页 | 0.0056 / 0.0054 | 通过 | mock 修正按 b4 示例给两条差分（只在 mock） |
| W-R25-05 | 0.0070 / 0.0071 | 通过 | |
| W-R25-06a | 0.0121 / 0.0183 | 通过 | |
| W-R25-08 完了 | 0.0051 / 0.0051 | 通过 | fixture `c-done` |
| W-R25-12 / 13 以前のプラン | 0.0010 / 0.0005、0.0015 / 0.0006 | 通过 | 12 的头像圆点色按名字算，归 `[data]`（主会话同意） |
| W-R25-01M 入口弹窗 | 0.0022 / 0.0022 | 通过 | 局部视图只比第一屏 |
| W-R25-09M 目标下拉 | 0.0085 / 0.0085 | 通过 | |
| W-R25-02M 使い切り | 0.0026 / 0.0013 | 浅色未过 | 浅色弹窗下沿 1 条带 0.023（差 1px） |
| W-R25-10M 目标编辑 | 0.0049 / 0.0047 | 未过 | 「背景（任意）」一行字形差 0.040；3 轮上限 |
| W-R25-07M 达成确认 | 0.0032 / 0.0031 | 通过 | 10-13 新 fixture b12-270-achieve（128 分）；画板弹窗「21人」与表格合计 19 人矛盾，待画板 |
| W-R25-01 / 02 / 07 / 09 / 10 整屏 | 0.029～0.040 | 未过 | 只因背景是 A 组概要页；弹窗本体看各自的 M 视图 |

C 组的局部视图（01M / 02M / 07M / 09M / 10M）改成只比第一屏（viewport 960），不再依赖概要页高度。

### A 组：概要 / 人物タイプ詳細

| 画面 | raw 浅 / 深 | 卡在哪 |
|---|---|---|
| W-R24-01 1440 | 0.035 / 0.035 | 待 R26（10-13 重比 0.0347，不变） |
| W-R24-02 1440 | 0.031 / 0.032 | 待 R26；#17 口径 A 已落实（Step 3 chip VC 2 / 3 已配对、不出卡） |
| W-R24-02 1024 | 0.021 / 0.023 | 確認待ち 1024 改回三列（问题 1）；剩类型卡「人脈の候補」口径（待拍板）；壳「目標を追加」已去掉；「次の一手」数字徽标未显示（待壳） |
| W-R24-02 390 | 0.078 / 0.081 | 横滑 Step 卡高度；画板口径已定（不出卡） |
| W-R24-04a | 0.0145 / 0.0168 | **待 R26**（10-13 第 4 轮：右栏「今日のチャンス」+ イベント卡的推荐活动，D53） |
| W-R24-04c | 0.024 / 0.023 | 待 R26；#17 口径 A：新 fixture b12-214-step-done，Step 1 卡由规则出、样式比对配对无差异 |
| W-R24-03 | 0.056 / 0.046 | 待组件库（Modal） |
| W-R24-05 | 0.039 / 0.037 | 数据：活动分数按规则算 |
| W-R24-06 | 0.035 / 0.035 | 10-13 重比不变；CVC 顺序画板已改 |
| W-R24-07 | 0.026 / 0.030 | 数据：候补行、右栏活动 |
| W-R24-08 | 0.059 / 0.058 | 数据：内訳；CVC 画板已改（10-13 重比不变） |
| W-R24-09b | 0.089 / 0.052 | 待组件库（Modal 380 宽） |
| W-R24-11 | 0.029 / 0.023 | 待组件库（Modal 左侧图块、✕） |
| W-R24-12 | 0.043 / 0.039 | 待组件库（Drawer ✕） |

归因文件里 A 组没有条目：这些带都含结构差异，不能写成 `[data]`。

## 3. 做了什么

- **搬设计稿**：各画面 DOM 和 CSS 照 `kit/ui.css`、`kit.js` 与画板源码搬进 CSS Modules，按组拆分。
  - B 组：`FlowKit.module.css`、`FlowParts.tsx`。
  - A 组：`overview.module.css`、`TypeDetail.module.css`。
  - C 组：`ReviewKit` / `ReviewScreen` / `ReviewEntry` / `DoneScreen` / `GoalDialogs` / `LegacyScreen.module.css`。
- **token 化**：写死的字号和圆角已全部换成 token，`tests/ui/orbit-2026-css-tokens` 0 报错。缺的 token 由 R05 会话补齐，分三次推送：41c96e16、4a2cd45c、a8a6d05b。正文行高照 kit 改成 1.5（dbd3f781 统一了 `--lh-body`）。
- **服务端可选字段与接口**（主会话批）：
  - 425306a9：`PlanStepProgress.parts`、`PlanPendingItem.organization/role`、`PlanEventOption.fee`。
  - 40fa3e8d：見直し `lastConfirmedAt` / `userText`；D59 `goalBackground` / `goalNote`；候选 `subtitle`（C10 提示词 v7）；以前のプラン フェーズ与会いたい人字段；`startsOn`；`member-candidates` 只读接口；D38 `background/reopen`。
- **设计稿示例 fixture**（只在非生产 + mock）：
  - 位置：`features/plans/v2/design-fixtures/`，由 `app/api/dev/plan-design-fixture/route.dev.ts` 切换。
  - 生产隔离：`next.config.js` 的 `pageExtensions` 在生产不收 `*.dev.*`。
  - 只在 mock 生效的数据：
    - mock 見直し修正：输入里含示例词才给两条差分。
    - ~~`withMockStepSuggestions`：在概要上补出 Step 完成卡。~~ 10-13 已删（#17 口径 A，完成卡一律按规则出，见 §10）。
  - 测试守护：`tests/plans/plan-design-fixtures.test.ts`、`plan-mock-design-a.test.ts`、`plan-mock-design-c.test.ts`。
- **本机测试会话**：`seed-local-chats.mjs` 给本机 qa 账号写 2 条 iOrbit 会话，供目標入力右栏「最近の会話」用。只写 localhost 库，可重复执行，不调 AI。
- **壳导航**：`shellNavKeyFor` 把 `/app/plans/flow`、`/app/plans/<id>/review` 归到 iOrbit；drafts 仍归 task（b10 #21）。
- **App**：以前のプラン用词照画板统一（見るだけ / 未着手 / 開始…），三语同步。

## 4. 用户 / 主会话的决定（本次返工期间）

- **W-R23-01**：web.html #15 作废，以 b12 为准（#296 / #297）。
- **Step 完成卡**：以 #17 为准，04c 改画。
- **样例卡说明句**：不能归 `[data]`。画板已改成合 copy:qa 的写法，与字典一致。
- **03 / 08、缺块**：可在 mock 演示数据里补，条件是只加数据、不改结构、真实路径不变。缺块不能留给复核。
- **A 组数据轮**：给一轮，不计入 3 轮上限。
- **三处画板口径**：
  - 类型名统一用短名「VC」。
  - CVC 活动按 82 / 79 / 68 排。
  - Step 3 人数以类型卡为准。
  - 画板 5f497988 已改前两处；#17 那处用户 10-12 选 A（1981a0aa 改画）：Step 3 回「VC 2 / 3人」不出卡，完成卡只在达标的 Step 1 下出。
- **照稿去掉的功能**：候补 ✓ / ✕、話した人逐条取り消す、1024 的前提 / 手動編集按钮。三处照稿去掉。

## 5. 未完成 / 下一步

1. **通过画面上的缺块**：W-R23-10（4）、W-R23-19（3）、N17b（5）。C 组的汇总脚本不显示 ⚠ 列，要用 `summary.json` 查。按主会话规定，先用 fixture 补数据让块出现，补了仍缺就修实现。
2. **C 组超阈值带的归因核对**：C 组通过画面里超过 0.02 的带（03 b5、05 b2/b3、06a b1/b4/b5、08 b3、09M b2/b4），要确认归因文件都有对应 `[data]` 条目。C 组汇总脚本没显示归因状态。
3. ~~**A 组重比**~~（10-13 已做，见 §10）：design-decisions 发出 #17 口径的序号后，单独重比 W-R24-02（1440 / 1024 / 390）、04c、06、08（13 若有视图也一起）。
4. ~~**两端全量测试**~~（10-13 已做，0 失败，见 §10）：修复后再跑一次两端全量，对照基线零新增（见 §7）。
5. **独立复核**：只起 1 个子任务，写 `REWORK-REVIEW-web.md`。要求重跑未过和有改动的画面，另抽查 ≥20%，并看 triptych。
6. **工作区收尾**：`repos/orbits/tsconfig.json` / `next-env.d.ts` 里的独立 distDir 改动不要提交，mock 服务器停掉后还原。
7. **C 组造状态的脚本收进仓库**：`setup.py` / `all.sh` / `suite.sh` 现在在会话 scratchpad，见交接表 R25-05。

## 6. 复跑命令

在 `repos/orbits` 下执行。三台 mock 服务器：A :3201（10-13 接手后实际用 :3206，`.next-gate-plan`）、B :3202、C :3203，起法：`ORBIT_REDESIGN_MOCK=plan-v2-summary ORBIT_NEXT_DIST_DIR=.next-rework-x npx next dev --webpack --port 320x`。

- 一键串行：`<scratchpad>/rework/fullgate.sh`。
- 单组：
  - A 组：`run-a.sh [fixture 正则]`。
  - B 组：`runB.sh <only> <out> <fixture>`。
  - C 组：`c/all.sh legacy r03 r05 r06 done goals modal mm mgoals medit mused edit used`。
- B 组跑之前先执行 `node features/plans/v2/design-fixtures/seed-local-chats.mjs --origin http://localhost:3202 --storage <qa-storage-B.json>`。

## 7. 测试与 GitNexus

- **相关测试**：每次提交前都在「临时索引导出的隔离目录」里验证，各提交的数字如下：

  | 提交 | 测试结果 |
  |---|---|
  | B | 104 / 104 |
  | A | 106 / 106 |
  | A 数据轮 | 90 / 90 |
  | C 补数据 | `tests/plans` + review 180 / 180 |

- **类型检查**：0 新错误。只有 `tests/scripts/redesign-pixel-lib.test.ts` 有 2 处既有错误，属于门禁工具自己的测试。
- **两端全量**（23:10，修复前）：App 3967 条 0 失败；orbits 7569 条 8 失败。计划页相关 6 条（写死的「・」、ja 纯英文「CVC」、两条控件行为证据 / manifest）已在 a8f772cf 修好，相关 6 个测试文件 218 / 218。剩 2 条不归本返工：`tests/scripts/redesign-pixel-lib.test.ts` 的 2 个类型错误（门禁工具自己的测试）与「saved cloud facts drain」。修复后全量未重跑，接手会话收口时再跑一次两端全量对照基线。
- **impact 中 HIGH / CRITICAL 的项**：
  - `service-factory`：CRITICAL，只加了 mock 分支。
  - `createMockPlanFlowAi`：CRITICAL，只新增一个由示例词触发的分支。
  - `resolvePlanV2Service`、`overridePlansV2MockSeed`：UNKNOWN，已 grep 核对。
- **detect-changes 的 critical**：报出的 `BackgroundProps`、`RecordSubmit` 是同名类型误配，`pageExtensions` 是有意改动，都已人工核对。

## 8. 共用暂存区事故（两次）

1. **40fa3e8d**：design-decisions 会话提交时，带走了本会话暂存的第二批服务端字段和两个接口，共 22 个文件。
   - 提交信息写的是并行规则文档。
   - 内容与暂存版本一致。验证结果：plans / api / capabilities / contracts 218 / 218，App 同步测试通过，两端 tsc 0。
   - 没有撤回。
2. **4a2cd45c**：R05 会话补 token 时，带走了本会话暂存的 C 组 21 个文件。
   - 逐字节核对，与隔离验证过的版本一致。
   - 本会话用 bebb1d41 补完（换 token、改概要测试两处断言）。

之后一律用 `git commit -m … -- <自己的文件>` 按路径提交，验证改用临时索引（`GIT_INDEX_FILE`），不再动共用暂存区。

## 9. 本次提交

d77115ac、95e82990、6ab3e559、9c8a999d（B）；4a2cd45c（误带）+ bebb1d41、56bdb1d3、d777d17a（C）；c9bcfdf3、928fac6b（A）；aef5690f（交接 / README / HOW-TO）；归因合并 cb791b3d；425306a9、40fa3e8d（服务端字段）。

## 10. 接手收尾（2026-10-13）

- **#17 口径 A**：Step 1 达标时规则本身就会出卡（`overview.ts` 的 `stepSuggestions`；1440 内联到 Step 里、1024 / 390 进確認待ち），所以删掉了 mock 包装 `withMockStepSuggestions` 及其透传（service-factory / design-fixtures index·base / 开发接口），新增 fixture `b12-214-step-done`（s56c、只驳回 Step 4、候补只留佐々木），W-R24-04c 改用它；`plan-mock-design-a.test.ts` 改守「按规则出卡」（04c 出 Step 1、Step 3 VC 2 / 3 不出、w17 不出、经 resolvePlanV2Service 一致）。live 路径不变。提交 e99757ad。
- **重比**（证据 `~/orbit-sprint-evidence/redesign/plan-rework-A2/`）：数字见 §2 A 组表。W-R24-13 没有门禁视图。剩余超阈都在类型卡区与 Step 2 目安换行导致的 38px 下移，原记「待 R26」，未改（3 轮上限）。
- **两端全量**：orbits 7570 条 0 失败（966 skipped）、App 3967 条 0 失败。类型检查 0 错误（74d263d9 已修 pixel-lib 测试）。
- **独立复核**：见 `REWORK-REVIEW-web.md`。
- **复核处理**（[REWORK-REVIEW-web](REWORK-REVIEW-web.md) 结论「不通过」，12 条）：
  - 已修：问题 1（1024 確認待ち被拉满一行 → `overview.module.css` 照 b8 #6 保持三列、只在 ≤767 单列，W-R24-02-1024 0.060 → 0.022 / 0.024，71beb2cd）；问题 8 补 W-R25-07M b2 / b4 的 `[data]` 归因——但门禁还要求整体 raw ≤ 0.02，07M 是 480×234 小区域，两处数字（128 / 21）就有 0.027，要靠一个「128 分 · 話した 21 人」的 fixture 才能过，未做；问题 10、11 的报告错误已改（§3、§6、§2）。
  - **待用户拍板**（口径冲突，不是实现能自己定的）：问题 2 类型卡「人脈の候補」——实现与確認待ち同源（未确认的候补），种子里大多已确认所以显示 0 / 「人脈にいない」，设计稿是 1–4 人；问题 3 会える活動最后一列「詳細」深色按钮（b4 #13）还是「内訳 ›」（b10 ⑧），两张画板冲突；问题 4 弁護士详情右栏「このタイプに会えるイベント」画板一边写 0 场一边列 2 场。
  - **未做，留给下一轮**：问题 5（390 「話すべき人」排序与 1024 / 390 类型名长短）、问题 6（04c 底部多一条イベント——先确认 b12 #214 是否截断；Step 2 chip「紹介 2件」vs「起業家 2 / 5人」）、问题 7（W-R23-06 门禁不勾选候补、mock 候补来自写死的演示联系人）、问题 9（W-R23-19、W-R25-06a 缺块先用 fixture 补；N17b 归因补「体制」行）。
  - 问题 12（偶发「找不到画板」/ 超时）单张重跑即可。

### 第 2 轮（2026-10-13，用户按推荐定了复核 2–4）

- **决定 1「人脈の候補」**= 已确认（接受后挂在类型上的 contactLinks）+ 未确认（待定候补），按人去重、驳回不算：`overview.ts` `networkMatches`，两端同一接口 `typeStats.candidates`，App 不用改。概要 fixture 加 7 位已确认的人，类型卡数字照画板 1 / 2 / 1 / 4 / 0 / 1。概要屏测试原断言「起業家 人脈にいない」是旧口径，已改。
- **决定 2「内訳 ›」**：实现本来就是 b10 ⑧ 的浅色链接，代码不改；b4 #13 已在 916b9f6b 改画，W-R24-06 重比 0.035（剩活动分数按规则算等原有差异）。
- **决定 3**：W-R24-07 的 fixture 给 Summit / CFO Night 补弁護士预计人数，弁護士「会える活動」= 右栏 2 行（0.029）。
- **W-R25-07M**：新 fixture `b12-270-achieve`（按 nextAward 规则造 base / overflow，128 分、上乗せ 38）→ 通过。
- **重比**（`~/orbit-sprint-evidence/redesign/plan-rework-R2/`）：A 组 14 张仍未过（02 1440 0.031、1024 0.021 / 0.023、390 0.079 / 0.081、04c 0.024 / 0.023、01 0.034、06 0.035、07 0.029、08 0.059）。剩余主要是类型名长短 / 排序（画板问题，见下）、活动分数按规则算、待 R26。
- **两端全量**：App 3967 条 0 失败；orbits 7572 条，1 条失败是上面那条旧口径断言，已改，单文件 27 / 27。
- **画板待改（已上报主会话）**：① W-R25-07 弹窗「21人」与表格合计 19 人矛盾；② 04a（#210）確認待ち有 CVC 候补鈴木、类型卡却写 CVC 0；③ 04c（#214）画板 960 高截断，实现多出的活动区 #17 本来就有；④ Step 2 chip「紹介 2件」没有数据来源（Step 按类型数人），建议同 Step 3 改成类型口径；⑤ 390 / 1024「話すべき人 · ステップ順」实际按配点排、类型名用长名，与「统一短名」冲突。
- **还没做**：复核 7（W-R23-06 门禁勾选候补、`mock-flow-context` 读 fixture 联系人）、复核 9（W-R23-19 / W-R25-06a 缺块先补 fixture，N17b 归因补「体制」行）。交接：side-session-notes `R23-25-web-plan-round2-handoff.md`。
- **916b9f6b 新画板重截**（`--no-cache`，单路补跑偶发「找不到画板」）：W-R24-01 0.034 / 0.035、02 1440 0.031、1024 0.021 / 0.023、390 0.079 / 0.081、03 0.054 / 0.044、04a 0.054 / 0.052、04c 0.024 / 0.023、06 0.035、07 0.029 / 0.028、11 0.029 / 0.023，与上一轮一致无退步；04b / 04d / N13-W 没有门禁视图。App 概要画板变化记交接表 R24-09。

### 第 3 轮（2026-10-13，画板 9c82c4ec / df856a20 之后清缓存重截）

- **用户定的 5 项画板口径**：07 弹窗改 19 人（fixture 不变）；04a CVC 卡改 1；04c 只比画框 960 高（`web-plan-A.json` 04c 加 `region 0,0,1440,960`）；Step 2 chip 改类型口径（实现本来就是）；「話すべき人 · ステップ順」按 Step 顺序 + 短名——1024 本来如此，390 改用 `stepOrderedCards`（0bfa1b1）。
- **重比**（`~/orbit-sprint-evidence/redesign/plan-rework-R4*`，单路、`--no-cache`）：W-R24-02 1440 0.019 / 0.021、1024 0.018 / 0.021、390 0.070 / 0.074；04c 0.020 / 0.0196；01 0.034 / 0.035；03 0.054 / 0.045；04a 0.060 / 0.058（变差，待查：画板 CVC 改 1 之后的其它变化）；06 0.035；07 0.029 / 0.028；08 0.059 / 0.058。02 1440 / 1024、04c 整体已低于 0.02，剩的超阈带都在右栏「今日のチャンス」：画板推今晚活动，实现按规则推候补（佐々木さんと話す）——待 R26（D53 概要推荐）。C 组 07M 0.0025 / 0.0023、09M 0.0086 / 0.0085 通过。
- **复核 9**：N17b 归因补「体制」行（6c7c0ad7）。复核 7 与 W-R23-19 / W-R25-06a 缺块补 fixture 仍未做；C 组 05 / 06a–c 新画板未重比（要 setup 造见直し状态）。交接见 side-session-notes `R23-25-web-plan-round2-handoff.md`。
- **测试**：orbits 全量 7572 条 0 失败（390 排序改动前）；改动后相关 28 / 28。


### 第 4 轮（2026-10-13，接手会话，画板 916b9f6b / 9c82c4ec / df856a20 之后 `--no-cache` 重截）

证据：`~/orbit-sprint-evidence/redesign/plan-rework-R5/`（A 组新画板重截）、`plan-rework-R6/`（改动后重比）。服务器 :3207（`ORBIT_REDESIGN_MOCK=plan-v2-summary`，distDir `.next-rework-r3`），单路。

- **A 组新画板重截**（第 1 轮，不改代码）：02 1440 0.0188 / 0.021、1024 0.0184 / 0.0206、390 0.070 / 0.074；01 0.034 / 0.035；03 0.054 / 0.045；04c 0.0201 / 0.0196；06 0.035；07 0.029 / 0.028；08 0.059 / 0.058——与第 3 轮完全一致，无退步。
- **W-R24-04a 变差查明**：不是画板 CVC 改 1 造成的。確認待ち的 memo 提议卡缺画板行末的「?」根拠按钮，文字列宽 216（画板 188），换行少一行，下面整页上移。补上「?」与根拠（`PlanOverview` `MemoCard`：面談メモ日期 + 聞けた問い的题目，文案 `pendingMemoBasis` / `pendingMemoBasisQuestion`，只在非手动的提议卡）→ **0.060 / 0.058 → 0.014 / 0.0138**。剩下的超阈带：右栏「今日のチャンス」（待 R26，同 02 / 04c）；画板 #210 的 wPlan 不带 イベント 得分卡（evBlock），实现概要底部总有；Step 5「新しく会う人はいません」画板后面跟着该 Step 的说明半句（画板写死）。
- **复核 7（W-R23-06）**：`createMockPlanFlowContext` 加可选的联系人读取函数，mock 服务器传 mock 仓储里本人的联系人（`flow-factory` mock 分支用 `findContactsByName("", 200)`）；不传时仍是演示世界（测试照旧）。新 fixture `b12-140-add-member`（b10-flow + 画板候补 森 美咲 / 小林 翔，高木 悠已在团队）；`web-plan-B.json` W-R23-06 加 fixture 与「勾选森」一步。「人脈から選ぶ」默认列表顶部补出已在团队的成员（「メンバー」chip，不可勾选，画板 #140）。**0.101 / 0.091 → 0.033 / 0.029**，未过，剩下的要拍板（见下）。测试 `tests/plans/mock-flow-context-fixture-contacts.test.ts`。
- **复核 9**：W-R23-19 的「この会話の記録」补「AI 修正 N回」chip（文案 `logFixes` 原来就有、没渲染；数据 = 确定时草稿的 `aiFixUsed`），fixture 给 planned intake 挂一份已确认、修正 3 回、手动编辑过的草稿 → **通过 0.0103 / 0.0101，缺块 3 → 2**。W-R25-06a 第二行 AI 预标（既存株主）：`c-review` fixture 预置当天的 C8 预标回执（直近の数字、既存株主两行，依据是面談メモ摘要）→ **0.012 / 0.018 → 0.006 / 0.0059**。
- **C 组重比**：07M 0.0025 / 0.0023、09M 0.0086 / 0.0085、05 0.0077 / 0.0078、06a 0.006 / 0.0059 通过；03 0.0065 / 0.0079 通过（c-review 改动后复查）；02M 浅色仍差 1px（0.0028，1 条带）。07 / 09 整屏 0.050 / 0.040、0.038 / 0.040 只因背景是 A 组概要页。06b / 06c、04b / 04d、N13-W 没有门禁视图。
- **待拍板（已发主会话）**：
  1. W-R23-06「できること」预览：画板有「＋ その他」与「関わり方：業務委託 · 変更は ✎」，实现从人脉选的成员没有「关わり方」选择、也不能补其它能力——要做功能，还是画板去掉？
  2. 能力名：画板「AI・データ」，两端共用文案 `shared/compute/plan-template-copy.ts` 是「AI とデータ」（改了 App 也跟着变）。
  3. W-R24-04a：画板 #210 底部没有 イベント 得分卡、Step 5 写死说明半句——按画板改实现，还是改画板？
- **仍等待**：右栏「今日のチャンス」（R26，影响 01 / 02 / 04a / 04c）；组件库 Modal / Drawer（03 / 09b / 11 / 12）。
- **测试**：orbits 全量 7575 条，0 失败，966 跳过（第 4 轮改动后）；typecheck 0 错误（不含 `.next` 残留）。GitNexus：`createMockPlanFlowContext` / `resolvePlanFlowService` impact 为 CRITICAL（流程服务被 144 条流程引用），对策是只加可选参数、不传参行为不变、live 分支不动，加测试守；`MemoCard` 是文件内函数，文本搜索确认只有一处使用；detect-changes 低风险，只动到 `resolvePlanFlowService`。

### 第 4 轮续（2026-10-13，主会话按推荐定了 3 项，画板 ee2c4919 / 决定表 §16）

- **能力名「AI・データ」**：`shared/compute/plan-template-copy.ts` 的 `ai_data` ja 改为「AI・データ」，App 跑 `sync:contract` 带上副本 `src/api/compute/plan-template-copy.ts`，App 测试夹具 `tests/fixtures/plan-flow-mock.json` 里 7 处同步（该文件是服务端回答的录制）。GitNexus `PLAN_CAPABILITY_COPY` 为 UNKNOWN，文本搜索确认只有这三处。已知会 App 计划页会话。
- **重截重比**（`~/orbit-sprint-evidence/redesign/plan-rework-R7/`，`--no-cache`）：W-R23-06 **0.0175 / 0.0157**（画板去掉「＋ その他」与関わり方后）——band 4 是数据文字（成员 headline、「デザイン / デザイナー」），band 2 弹窗整体约 3px 位移未归因，已到 3 轮上限，记未过；W-R24-04a **0.0145 / 0.0168**，剩右栏「今日のチャンス」与画板新加的イベント卡里的推荐活动列表，两者都是 D53 / R26（`EventCard` 注释：推荐活动 R26 上线后显示）→ 标**待 R26**。W-R23-04 0.0036 / 0.0035、W-R23-07 0.0025 / 0.0022 通过（能力名改后无退步，07 略好）。
- **App 测试**：3967 条，2 失败——`plan-overview-screens`「overview: every field…」可复现，但把能力名改动临时还原后照样失败，原因是 App 计划页会话正在改、尚未提交的 `src/screens/plan/PlanOverview.tsx` 等；另一条 `narrow-double` 单跑通过（负载偶发）。App `tsc` 0 错误。
- **收尾（主会话定）**：W-R23-06 band 2 是弹窗定位约 3px，归**待组件库**（HANDOFF R24-05b / G23）；04a 待 R26（R24-06b）。README 登记表 R25 行已改为第 4 轮 done 并列出剩余画面。
- **orbits 全量（改名后）**：7575 条，0 失败，966 跳过。
