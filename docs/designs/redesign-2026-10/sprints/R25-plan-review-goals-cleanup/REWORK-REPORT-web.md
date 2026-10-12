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
| W-R25-07M 达成确认 | 0.0273 / 0.0271 | 未过 | 分数和人数数据不同引起整行字形位移，没写成 `[data]` |
| W-R25-01 / 02 / 07 / 09 / 10 整屏 | 0.029～0.040 | 未过 | 只因背景是 A 组概要页；弹窗本体看各自的 M 视图 |

C 组的局部视图（01M / 02M / 07M / 09M / 10M）改成只比第一屏（viewport 960），不再依赖概要页高度。

### A 组：概要 / 人物タイプ詳細

| 画面 | raw 浅 / 深 | 卡在哪 |
|---|---|---|
| W-R24-01 1440 | 0.035 / 0.035 | 待 R26 |
| W-R24-02 1440 | 0.032 / 0.033 | 待 R26；待画板口径 |
| W-R24-02 1024 | 0.060 / 0.061 | 待壳；待 R26 |
| W-R24-02 390 | 0.079 / 0.081 | 待画板口径；横滑 Step 卡高度 |
| W-R24-04a | 0.054 / 0.052 | 数据：memo 提议 + 2 候补 |
| W-R24-04c | 0.029 / 0.027 | 待 R26；待画板口径（#17） |
| W-R24-03 | 0.056 / 0.046 | 待组件库（Modal） |
| W-R24-05 | 0.039 / 0.037 | 数据：活动分数按规则算 |
| W-R24-06 | 0.035 / 0.035 | 待画板口径（CVC 顺序，已改画板） |
| W-R24-07 | 0.026 / 0.030 | 数据：候补行、右栏活动 |
| W-R24-08 | 0.059 / 0.058 | 数据：内訳；CVC 画板已改 |
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
    - `withMockStepSuggestions`：在概要上补出 Step 完成卡。
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
  - 画板 5f497988 已改前两处；#17 那处在等主会话确认。
- **照稿去掉的功能**：候补 ✓ / ✕、話した人逐条取り消す、1024 的前提 / 手動編集按钮。三处照稿去掉。

## 5. 未完成 / 下一步

1. **通过画面上的缺块**：W-R23-10（4）、W-R23-19（3）、N17b（5）。C 组的汇总脚本不显示 ⚠ 列，要用 `summary.json` 查。按主会话规定，先用 fixture 补数据让块出现，补了仍缺就修实现。
2. **C 组超阈值带的归因核对**：C 组通过画面里超过 0.02 的带（03 b5、05 b2/b3、06a b1/b4/b5、08 b3、09M b2/b4），要确认归因文件都有对应 `[data]` 条目。C 组汇总脚本没显示归因状态。
3. **A 组重比**：design-decisions 发出 #17 口径的序号后，单独重比 W-R24-02（1440 / 1024 / 390）、04c、06、08（13 若有视图也一起）。
4. **两端全量测试**：修复后再跑一次两端全量，对照基线零新增（见 §7）。
5. **独立复核**：只起 1 个子任务，写 `REWORK-REVIEW-web.md`。要求重跑未过和有改动的画面，另抽查 ≥20%，并看 triptych。
6. **工作区收尾**：`repos/orbits/tsconfig.json` / `next-env.d.ts` 里的独立 distDir 改动不要提交，mock 服务器停掉后还原。
7. **C 组造状态的脚本收进仓库**：`setup.py` / `all.sh` / `suite.sh` 现在在会话 scratchpad，见交接表 R25-05。

## 6. 复跑命令

在 `repos/orbits` 下执行。三台 mock 服务器：A :3201、B :3202、C :3203，起法：`ORBIT_REDESIGN_MOCK=plan-v2-summary ORBIT_NEXT_DIST_DIR=.next-rework-x npx next dev --webpack --port 320x`。

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
