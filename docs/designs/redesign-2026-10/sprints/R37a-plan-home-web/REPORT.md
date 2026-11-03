# Sprint R37a — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。v3 计划确定后，服务端生成「先做的事」与准备卡；Web 计划主页按设计稿 v16「计划主页 · 执行」页重做。

- 三种目标 × 1440 / 390 浅色过像素门禁，超阈值带全部是 `[data]`。
- 契约改了两次，都只加不改，App 需要同步：
  - `5b79fb7e2`（第一条）
  - `4522e1444`（补 `seats`）

### 已验证能做到

**契约（SC-01）**
- `5b79fb7e2`：
  - `PlanV2Detail.home?: PlanHomeView | null`；
  - `PlanHomeView { state: pending | ready | failed, lead, actions[] }`；
  - `PlanHomeAction { actionKey, kind, contactId | eventId, title, reason (PlanMarkedText), stepNumber, typeKey, done, avatar, meta, prep }`；
  - `PlanPrepCardView { rows, usedFacts（快照：id / text / date / memoId）, usedAnswers, hook, draft (PlanPrepDraft), gaps, generatedAt, staleSince, fallback }`；
  - 开场白引用用新类型 `PlanPrepRef = fact | answer | card`，没有改 `PlanRef`；
  - 请求体 `PlanHomeDoneRequest`、`PlanHomeRegenerateRequest`、`ContactManualFactRequest / Result`。
- `4522e1444`：`PlanHomeView.seats?: PlanHomeSeat[]`，即每类已在人脉里的人，以及「去哪里认识」。
- 两次提交的 zod 都是严格的，一致性检查（redesign-schema-parity）已扩展覆盖。
- 契约快照只有新增：两次删除行都是 0；`contract-append-only` 通过。

**生成与对账（SC-02）**，代码在 `features/plans/prep/*`，提交 `6d92e5d2e`：
- 候选（`candidates.ts`）由规则列出：
  - 人：按阶段顺序走人物类型，每类取 ≤2 位——先取已关联但没聊过的，再取推荐度最高的待确认候补；
  - 活动：推荐分最高的 ≤2 场；
  - 合计 ≤8 个，给 AI 的只有编号和职位 / 公司 / 活动行，不带名字。
- AI 分两步：
  - `pick`：回编号、标题、理由、加粗、`lead`；
  - `card`：切入点，加上按句给出的开场白，每处画线都带出处。
- 初次生成：
  - 挑选 1 次，每件 1 次，合计 ≤ `PLAN_PREP_INITIAL_CARDS_LIMIT`（4）；
  - 全部 `trigger: "plan"`，只记账、不占日限。
- 对账（`reconcile.ts`）：
  - 编号越界、重复、标题 / 理由超限的那件丢掉；
  - 引用不存在的 factId / 回答 / 字段，或画线片段和出处原文对不上 → 删整句；
  - 对得上的判定：规范化后，最长公共子串 ≥ 片段的 60%，这样允许「他 → 您」这类人称改写；
  - 超过 160 字 → 从句尾丢整句；
  - 整段删空，或切入点不合格 → 通用模板「说清你是谁 + 很小的请求」，`fallback: true`，三语。
- 行与 `gaps`：
  - 没有上次联系 → 不出这一行，`gaps` 加 `interaction`；
  - 没有事实 → 不出备注行，`gaps` 加 `memo`；
  - 共同点（`common-ground.ts`）按规则算：来自 × 事实或公司里的地名 → 共同语言 → 同行业，算不出就是 null。
- 防重复生成：生成前先写 `state: pending`，2 分钟内别的请求不重复生成；账本幂等键 `prep:<planId>:pick:<候选签名>` / `prep:<planId>:card:<actionKey>:0`。
- v2 计划不生成，也没有 `home` 键。
- 存放与触发：
  - 存在 `plans.analysis.home`；
  - 确定成功后，以及读概要时 `home` 还是 pending / failed / 空，都用 `after()` 补生成；
  - 不在请求作用域里时（测试、脚本）静默跳过。

**置旧、重新生成、勾选、手动事实、交接项（SC-03）**
- `markStale(contactId)`：只置位引用这个联系人的卡，已置的保留最早时刻；无关联系人 → 0。
- 重新生成：
  - `trigger: "manual"`，计入计划流程每日 15 次；
  - 成功后 `staleSince` 清空；
  - 同一个幂等键重放，不再调 AI；
  - 额度用完 → 409 `LIMIT`，卡不变。
- 勾选：持久化，幂等。
- `POST /api/contacts/[id]/facts`：
  - 只接受本人的联系人，别人的 → 404；
  - 超过 80 字 → 400；
  - 写 `field: manual`，并把该联系人的卡置旧。
- `noteOnPersisted`：
  - 补传 `memoDate = note.createdAt`；
  - 抽取完后调 `markPlanPrepStale`。
  - `runConfiguredMemoExtraction` 本身没有改：它的 impact 是 CRITICAL，改调用处就够了。
- `manualEdit`：v3 草稿写入前，按 `steps[].personTypeKeys` 重算 `personTypes[].stepKey`（R36b 交接项）；v2 草稿不加这个键。

**画面（SC-04）**，提交 `33e07f1d7`
- 分流：`PlanOverview` 遇到 v3 计划且有 `home` → `PlanHomeV3`，否则仍是 R24 的概要。
- `PlanHomeV3` 的内容：
  - 面包屑「iOrbit · マイプラン」，加「✦ AI に調整してもらう」，点它打开見直し入口；
  - 头部：左边目标结果 + 结论；右边「ステージ N / 総数」、阶段名、进度条，最后才是「人脈にいる x / y 人 · s / 100 点」；
  - 路线，每段下有「完了の目安：…」；
  - 「まずはこの N 件から」：阶段名、`lead`、勾选清单。每件有：
    - 标题，非阶段 1 的加「ステージ N · 先にやってもよい」；
    - 理由，加粗部分带杏色底；
    - 「連絡の準備 ▾ / このイベントの準備 ▾」和「切り口 …」；
    - 右侧头像与一行说明。
  - 准备卡展开（同一时间只开一张）：
    - 行表：没有记录的不画，事实行带「あなたのメモ 月/日」，点了去联系人页；
    - 「なぜこう切り出すか」；
    - 开场白，画线部分 + 复制；
    - 「情報が更新されました · 作り直す」；
    - 「補足できること」：「+ そのとき話したことを一言書く」打开补事实弹窗，「+ 連絡を記録する」去联系人页。
  - 「知り合いたい人」空位表：图例、进度、类型行（emoji / 名 + 阶段 / 空位 / 分量）。展开后有：
    - 「どんな人か」；
    - 已在人脉里的人；没有人时是「どこで知り合えるか」，没有活动就显示「近いイベントにも…」；
    - 「会ったら聞いてみること」三问。
  - イベント行。
  - 「なぜこの順番か · N 個の情報源 …」折叠，展开后是初稿页的依据区，业界现状库的标题按条目查。
  - 准备中：显示「準備しています…」，每 3 秒重读一次，最多 10 次。
  - 一件都没有：显示「去认识」提示。
- 目标切换、見直し、手动编辑、达成、前提等入口，以及待确认卡，都放在页身之下，照旧可用（见「待用户过目」①）。
- 抽出了 `DraftV3Parts.tsx`（`Route` / `Evidence` / `MarkedText`，类名不变），初稿页改用它。R36a 门禁复跑六张 PASS，raw 和 R36a 报告逐张相同。

**像素门禁（SC-05）**：见下方门禁总表。

**守门**：
- fixture 不进生产：既有用例覆盖 `e.ts`，另加「v16 主页三份经概要读取过 schema、引用都对得上、已在人脉里的人数照原型」用例；
- `npx tsc --noEmit -p .` 0 错；
- 以下检查都通过：`orbit-2026-css-tokens`、`orbit-2026-scope`、`no-hardcoded-copy`、`design-tokens-generated`（钉值已更新）、`orbit-contrast-tokens`、`copy-qa-check`。

### 仍未实现或未验证

- 真实 DeepSeek 调用：0 次，只接了线（`createDeepseekPlanPrepAi`，提示词版本 `plan-prep-2026-11-v1`）。归 R38，需要授权。
- 候选来源有时差：候补匹配作业在确定之后才跑，所以确定那一刻可能没有候选 → 显示「去认识」。之后读概要发现候选签名变了且上次是空的，会补生成一次（仍算初次额度，合计 ≤4 次）。真实时序要在 R38 用真账号确认。
- live 联系人卡的「关联活动」取 `payload.source.eventTitle`，没有就显示「関連イベントなし」。这个字段实际有没有值，R38 用真数据看。
- 1024 与深色：设计稿没有，只截图留档（D-8）。

## 运行记录

- 结果：completed。本地代码收口；无部署、无生产迁移、无 push。
- Generator：Claude Opus 5.5（side session），2026-11-03；Planner revision 1，PLANNER.md SHA256 前 16 位 `595abb6bd6f5fe6d`。
- 提交（按顺序）：
  1. `269ae9bf7` 文档
  2. `5b79fb7e2` 契约
  3. `6d92e5d2e` 服务端
  4. `4522e1444` 契约补 seats
  5. `33e07f1d7` 画面 + fixture + 门禁
  6. REPORT 提交见 git log
- 分支：直接在 `chat-agent` 按路径提交，基线 `2095d6dd7`；`repos/orbit-app/**` 未动；未 push。
- 付费 AI 调用：0 次。所有测试走 mock / 假账本。
- 服务：设计稿 `designs`（:3320），计划 mock 服务器 `orbits-plan-mock`（:3201）。fixture 用 `switch.mjs --name v16-home-all` 切换，**门禁跑完已留在 `v16-home-all`**（R36a 的门禁要先切回 `v16-all`）。

### impact

开工时索引落后（R36a 起的文件多数不在索引里），所以 ambiguous / UNKNOWN 的都按 PLANNER 规则做了文本确认：

| 符号 | 结果 | 处理 |
| --- | --- | --- |
| `buildDetail` | LOW | 只加可选 `home` 键 |
| `noteOnPersisted` | LOW | 只在调用处补 `memoDate` 与置旧 |
| `runConfiguredMemoExtraction` | **CRITICAL**（7 个流程：Tasks / Sync / Plan…） | **没有改它**，只改调用处 |
| `DraftV3` | MEDIUM | 抽部件后 DOM 不变；R36a 门禁复跑 raw 相同，`plan-flow-screens` 27 项通过 |
| `confirmDraft` / `manualEdit` / `overview` / `PlanOverview` | ambiguous → UNKNOWN | 文本确认见下 |

文本确认：
- `confirm` 路由只在非回放时多调一次 `schedulePlanHome`；
- `manualEdit` 只对 v3 草稿重算 `stepKey`；
- `overviewInput` 多读已关联的联系人；
- `PlanOverview` 的调用方只有 `plan-slot.tsx`。

### detect-changes（证据都在 `~/orbit-sprint-evidence/web/sprint-R37a/run-01/`）

- 契约提交前 `--scope staged`：5 文件 4 符号，risk low，0 processes。
- 服务端提交前：22 文件 24 符号，risk low，0 processes（`detect-changes-staged-server.txt`）。
- 画面提交前：23 文件 19 符号，risk low，0 processes（`detect-changes-staged-ui.txt`）。
- 以上都不是 partial / truncated。
- 收口时（未提交的只有 REPORT / DEFERRED 文档）：
  - `--scope all`：1 文件 3 符号，risk low，0 processes（`detect-changes-all.txt`）；
  - `--scope compare --base-ref 2095d6dd7`：51 文件 51 符号，risk low，0 processes（`detect-changes-compare.txt`）；
  - 两者都不是 partial / truncated。

### 全量测试对照

基线 = `2095d6dd7` 的 `repos/orbits` 导出到 scratchpad 后跑（node_modules 用符号链接）。两边都带 `ORBIT_EVENT_DATABASE_URL`（`.env.local` 里的本地回环库），顺序执行。

| | 总数 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- |
| 基线 | 8136 | 7492 | 67 | 577 |
| HEAD（`33e07f1d7` + 未提交的 REPORT / DEFERRED 文档） | 8171 | 7573 | 27 | 571 |

失败清单去掉用时后用 `comm -13` 对比：结果只有 1 条——`notification-discovery-worker-postgres` 的「saved cloud facts drain in bounded batches…」（期望 0 实为 25，是库里残留的行数）。

- 它所在的代码和测试自基线以来没有变化，单独重跑 3/3 通过（`rerun-notification-worker.txt`）；
- 原因：前两次 HEAD 全量因为外壳提前返回而和后台进程重叠了约 3 分钟，两边同时写回环库，留下了残留数据。那两份日志（`npm-test-head.txt` / `npm-test-head-2.txt`）作废。

所以**新增失败按 0 计**。HEAD 的其余 27 条都在基线清单里。

日志：`npm-test-baseline.txt`、`npm-test-head-3.txt`、`baseline-failures.txt`、`head-failures.txt`、`new-failures.txt`。

### 门禁总表（SC-05）

命令：

```
node scripts/visual/compare-redesign.mjs --suite scripts/visual/views/web-R37a.json --crop --style-diff --out ~/orbit-sprint-evidence/web/sprint-R37a/run-01/gate-03
```

- 设计侧：`plan-draft-v5-proposal.html?goal=…&page=home&device=web|m&bar=0`，整页模式，截 `.page` 并延到 `.app` 底。
- 实现侧：`/app/tasks?tab=plan&plan=plan_v16_*`，只截 `[data-plan-home-v3]`。

| 画面 | 宽 | 主题 | raw | 超阈值带 | 已归因 | 未归因 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W-R37a-fund | 1440 | 浅 | 0.1627 | 16 | 16 | 0 | PASS |
| W-R37a-fund | 390 | 浅 | 0.2088 | 21 | 21 | 0 | PASS |
| W-R37a-sales | 1440 | 浅 | 0.1297 | 15 | 15 | 0 | PASS |
| W-R37a-sales | 390 | 浅 | 0.2040 | 19 | 19 | 0 | PASS |
| W-R37a-hire | 1440 | 浅 | 0.1433 | 15 | 15 | 0 | PASS |
| W-R37a-hire | 390 | 浅 | 0.2359 | 18 | 18 | 0 | PASS |

**为什么 raw 偏高**：实现用日文 fixture，设计稿是中文示例，日文折行更多，下方内容一路下移。

**style-diff 对照（fund 1440，`gate-01`）**：
- 非位置差只有 3 类：
  - `border-radius: 50%` 对 `999px`，二者等价；
  - 字体：原型 PingFang SC，产品用 token 字体，同 R36a；
  - glyph 盒高，也是字体造成的。
- 头部 / 勾选框 / 类型行 / 空位 / 分量的盒子尺寸一致。

**其他说明**：
- 缺块警告：fund 1440 / 390 的三联图已人工看过，都是整体下移造成的，没有缺失的块。
- 归因文件：`attribution-redesign-R37a.json`。每带都列出了两侧各是哪些文字，由 styles.json 按带取样生成。
- 留档（不进门禁）：深色 1440 三张在 `archive-dark/`，1024 浅色三张在 `archive-1024/`（实现侧见各自的 `app.png`）。
- R36a 门禁复跑：`r36a-regate/` 六张 PASS，raw 与 R36a 报告相同。

## 验收结果

| SC | 结论 | 证据 | commit |
| --- | --- | --- | --- |
| SC-R37a-01 | pass | `tests/contracts/*`（parity 扩展、append-only）；快照只增 | `5b79fb7e2`、`4522e1444` |
| SC-R37a-02 | pass | `tests/plans/prep-reconcile.test.ts`：7 项，覆盖画线容忍改写人称、缺 factId / 画线不在出处则删句、整段删空→模板、160 字截断、挑选对账、三语模板、共同点规则 | `6d92e5d2e` |
| | | `tests/plans/prep-service.test.ts`：7 项，覆盖初次 ≤4 次且全是 `plan`、行与 gaps、越界编号、无候选不调 AI、并发只生成一次、v2 无 home | |
| | | `tests/api/plan-home-routes.test.ts`：DeepSeek 账本 `plan` / `manual` | |
| SC-R37a-03 | pass | `prep-service`：置旧只动相关卡、重生成用 `manual` 并清 `staleSince`、同键回放、LIMIT 卡不变、勾选持久化 | `6d92e5d2e` |
| | | `plan-home-routes`：勾选严格 body / 404；重生成 409 LIMIT；补事实只限本人、超 80 字 400、写 manual 并置旧；确定 / 读概要会调度，回放不会 | |
| | | `draft-flow`：`stepKey` 重算 | |
| | | `notes-routes`：`memoDate` | |
| SC-R37a-04 | pass | `tests/ui/plan-home-v3.test.tsx`：5 项，覆盖三份 fixture 渲染、v2 退回、准备卡行 / 画线 / 复制 / gaps / 重新生成、勾选与失败回滚、补事实请求、空位展开、依据展开、准备中 / 去认识 | `33e07f1d7` |
| | | `plan-flow-screens`：端到端用例改成断言 v3 主页 | |
| SC-R37a-05 | pass | 门禁总表；`plan-design-fixtures`（e.ts 不进生产，过 schema）；tsc / css-tokens / scope / 三语 | `33e07f1d7` |

## 自定决定（都对标了成熟产品，登记待过目）

- **存放位置**：放 `plans.analysis.home`，没放 DESIGN §2.5 写的 `plan_items.meta.prep`。
  - 原因：一件事对应的是联系人或活动，不是人物类型条目；放在一处，读的时候不用联表，fixture 也能直接种。
  - 对标：Linear / Notion 把 AI 摘要挂在父实体上。
  - 卡片形状和 DESIGN 一致。
  - 代价：見直し确定后会重写 analysis，这时 `home` 跟着重生成（计划已经变了，重新给也合理）。
- **生成时机**：用 `after()` 在后台生成，界面先放占位再轮询（对标 Notion AI / GitHub Copilot 摘要）。
- **调用次数**：挑选 1 次 + 每件 1 次，所以初次最多 3 件卡。
- **画线判定**：允许改写人称，标准是最长公共子串 ≥60%。
  - 后果：原型里像「今年 5 月」这种对日期的改写，真实对账时会被删掉。
  - fixture 只是设计数据，保留了原型写法，没有按对账要求改。
- **「已在人脉里」的口径**：关联到这一类的联系人 + 这一类计过分的人。
  - 分数仍按 v2.2「聊过才计分」，所以头部的人数和分数是两个口径，例如「人脈にいる 4 / 13 人 · 26 / 100 点」。
  - 原型是按「人在人脉里就计分」画的；我们没有改计分规则，因为那是产品规则。
- **「人脉里已有 N 位」（初稿页）**：不做。
  - 原因：草稿阶段还没跑候补匹配，算出来的数字和确定后主页的数字会不一致。
  - 对标：LinkedIn 只在确认过的关系上显示人数。
  - 主页的空位表已经给了同样的信息。已登记暂缓项。
- **新 token**：`font.size.task-title 15.5`（清单标题）、`line-height.relaxed 1.65`（「为什么这样开口」）。
- **头像底色**：人按所属类型的轮转色，活动用粉色。原型 sales / hire 有些地方是手写的颜色，这里按规则来，与 R36a 一致。
- **准备卡的英文文案**：切入点名称上限 12 字、理由上限 60 字是按中日文定的，英文模板缩短到上限以内。

## 待用户过目（不阻塞）

1. **页身之下的入口行**：目标切换、見直し、手动编辑、达成、前提、待确认卡，原型主页都没画。
   - 现在放在页身之下，样式沿用 R24。
   - 原型只有「✦ 让 AI 调整」这一个入口，所以「达成」「手动编辑」等不能拿掉。
   - 要不要另外设计位置，请用户定。
2. 「已在人脉里」与分数口径不同（见上）。如果要像原型那样「在人脉里就计分」，就是改 v2.2 的计分规则，属于产品取舍。

## 交接

**给 R37b（App 主页）**
- 契约：先 `npm run sync:contract`，相关提交是 `5b79fb7e2`、`4522e1444`。
- 可复用的纯函数在 `app/(app)/app/orbit-2026/plan/home-v3-model.ts`：
  - `homeHeader`：阶段 / 人数 / 分数 / 进度；
  - `currentStepIndex`、`seatOf`、`typeToneOf`；
  - `prepLines`：行顺序，事实一行一条；
  - `draftMarked`：画线；
  - `monthDay`、`withDone`、`mergeHome`：回应里没有 `seats`，沿用上一次的。
- 接口：
  - `POST /api/agent/plans/v2/[planId]/home/actions/[actionKey]/done { done, idempotencyKey }`，`actionKey` 要 URL 编码（形如 `c:<contactId>` / `e:<eventId>`）；
  - `…/regenerate { idempotencyKey }`，409 `context.reason = LIMIT`；
  - `POST /api/contacts/[id]/facts { text ≤80, idempotencyKey }`。
  - 回应都是 `PlanHomeView`，`seats` 只在读概要时给。
- 准备中（`state: pending`）：界面每 3 秒重读概要、最多 10 次；服务端读概要时会补生成。
- fixture：`v16-home-all / -fund / -sales / -hire`，计划 id `plan_v16_*`。
- 门禁口径：原型 `?page=home&device=m&bar=0`。默认态是准备卡、空位行、依据区都收起。
- 新 token：`task-title 15.5`、`relaxed 1.65`，两端要对齐。

**给 R38（收口）**
- 真调用要验两个操作，每种目标各 1 次：`pick` 和 `card`，用途都是 `plan_prep`，提示词 `plan-prep-2026-11-v1`；同时核对账本 trigger（初次 `plan`、重生成 `manual`）。
- 用真账号确认三件事：
  - 候补匹配作业晚于确定时，补生成能不能触发；
  - `payload.source.eventTitle` 有没有值；
  - 共同点对真实 `homeMarket` 的取值格式能否命中。
- 门禁清单 `scripts/visual/views/web-R37a.json`，归因 `scripts/visual/attribution-redesign-R37a.json`，先切 `v16-home-all`。
- 暂缓项：「人脉里已有 N 位」（初稿页）不做；页身之下入口行的位置待定。
