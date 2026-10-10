# Sprint R25 — 计划 v2.2：见直、达成、多目标与旧屏清理

**Plan revision:** 1。**模式:** existing-codebase / single-generator（执行人：小雨（甲））。**档位:** H。
**单一目标:** 見直し（入口弹层、C8 / C9、逐条 ✓/✕）与月配额界面、确定后的手動編集、達成 → 完了 → 次の目標（C10）、目标下拉 / 添加 / 编辑 / 作り直し、以前のプラン（v1 只读）；关闭 v1 计划的创建入口；删除旧计划屏与兼容跳转、App `contacts/matches` / `contacts/intros` 及其专用接口和契约；全产品旧计划链接换新地址。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v2.2/DESIGN.md](../plan-v2.2/DESIGN.md)（§2.8–2.11、§5 C8–C10、§5.3、§8、§12）。
**基线:** R23、R24 收口后的 `redesign` HEAD。
**进入条件:** R23 done（草稿服务、手动编辑页、流程页）、R24 done（概要与按钮占位）。`contacts/intros` 删除需要用户确认（DESIGN §10 第 3 项）；未确认前这一项跳过，其余照做。C8–C10 真实调用需要授权，没有就用 mock 收口。
**分支:** 同前；本 Sprint 改动 `iorbit-0918` 与 `features/**` 里别人的入口，开工前和乙对一次热点文件（两端 `AGENTS.md` 归属表），R21 已重写的文件不再碰。

## 已查清的事实（按 `fe896414`）

1. **兼容跳转**：`app/(app)/app/agent/plan/page.tsx` 只做 `redirect("/app/tasks?tab=plan")`（R07 复核 M5 决定 (a)），浏览器保留 `#plan-action-…`，插槽挂载后定位；`plan-slot.tsx`（`loadPlanSlot` LOW 1）、`read-current-plan.ts`（`readCurrentPlan` LOW 2）、`plan-route-view-model.ts`。
2. **旧链接**：非插槽目录里指向 `/app/agent/plan` 的位置 37 处（文本搜索，含 `iorbit-0918/*`、`agent/page.tsx`、`agent/strategy/page.tsx`、`contacts/analysis/opportunities-*`、`inbox/inbox-panel-view-model.ts`、`agent/home-facts-route-service.ts`、`orbit-product-href.ts`、`contacts/network-0918/detail-return.ts`、`_demo/demo-persona.ts`）；活动跟进 `taskHref` 的字面量类型；R07 处理记录说逐个改会动 38 个测试文件。
3. **`/app/agent/strategy`**：`?view=contacts` 联系人建议，服务端读 `resolvePlanService().getCurrent()` 给活动理由；组件 `iorbit-0918/iorbit-strategy.tsx`。
4. **旧计划专用文件**（`iorbit-0918/`）：`iorbit-plan.tsx`（`IOrbitPlan` LOW 2）、`iorbit-plan-card*.ts(x)`、`iorbit-plan-client.ts`、`iorbit-my-plan-styles.ts`、`plan-anchors.ts`、`plan-match-client.ts`、`plan-match-sheet.tsx`、`today-plan-items.ts`、`iorbit-strategy.tsx`；被 `iorbit-home.tsx`（R21）引用。
5. **App 旧屏**：`contacts/matches`（R24 已改跳转，屏幕文件仍在；入口 `ContactNeedsHomeEntry` 在人脈页 `src/screens/contacts/ContactsScreen.tsx`，R11 的文件）、`contacts/intros`（`ContactIntrosScreen`，入口在 `ContactDetailScreen.tsx:454`（R11 的文件），读 `/api/contacts/intros/summary`）；相关的 `src/view-models/{contact-needs,contact-intros-summary}.ts`、`src/data/offline-read/route-domain-inventory.ts` 里的登记。服务端 `/api/contacts/needs-matches`（`createContactNeedsGetHandler` LOW 1，文件头注明仅供 App）、`features/contact-needs/**`（`createConfiguredContactNeedsService` UNKNOWN → 文本确认只有该 handler 引用）、`/api/contacts/intros/summary` + `features/contacts/contact-intros-summary-reader.ts`（`createContactIntrosSummaryReader` LOW 3）。
6. **v1 计划**：W0012 的 `reanalysis.ts`（`REANALYSIS_MONTHLY_LIMIT = 1`，UNKNOWN → 文本确认只在 `service.ts`）、`POST /api/agent/plans/reanalyze`、到期回顾；R22 已加 v2 守卫。**v1 的创建入口**：`POST /api/agent/plans/bootstrap`（引导 `/app/start`、Web `/app/profile/onboarding` 的生成步骤在用）、`POST /api/agent/plans`（v1 生成）、`reanalyze`；R22 只在「已有 v2 生效目标」时拒绝，没有 v2 的新用户仍会生成 v1。

## 上下文包

### 必读
- DESIGN §2.8–2.11、§5（C8–C10、§5.3）、§8（R21 深链、R10）、§9 #1 #10–#14 #20 #21、§12。
- 设计稿：`b4-plan-iorbit.html` A3 見直し ①–④（含 Web）、A4 配額（①②，③ ご利用プラン **不做**：Q6 隐藏付费入口）、A5 達成 ①–③（含 Web）、A6 目標切替と編集 ①–③（含 Web）；`app.html` / `web.html` 的目标下拉。
- R23 的草稿服务（`kind: review` 复用 fix / manual-edit / confirm）、R24 的概要按钮占位。
- 旧链接清单（第 2 条）与 R07 REVIEW M5 处理记录；`screen-ownership.md` 计划行。

### 关键符号与 impact（开工时重跑）
- 删除前对每个旧文件的导出符号跑 impact；LOW 的直接删，UNKNOWN 用文本搜索确认零引用后删。
- `iorbit-home.tsx` 等 R21 文件、`ContactsScreen.tsx` / `ContactDetailScreen.tsx` 等 R11 文件：如果对方已重写，旧引用已不存在；如果没有，只把对旧计划文件 / 旧屏的 import、链接、入口按钮替换或去掉，改动前通知乙（热点文件规则）。
- `PlanService` **CRITICAL**：v1 的 `reanalyze` 不再有界面入口；接口保留（v1 只读期间不提供重新分析），REPORT 写明。
- 路由删除后的登记：两端 HOW-TO §7 的各处计数与清单同步减少。

### 易错边界（全部写进 SC）
見直し打开就扣次数（只有「送る」扣）；失败的见直扣了次数；不改没扣次数；两个目标各算 3 次（应是每人每月合计 3 次）；跨月没恢复（东京月 1 日）；见直后已得分变了、跳过的类型配点被改、有分的类型被删；见直后没重新给 1 次手动编辑；達成后分数还在涨；達成的目标仍占「同时 2 个」的名额；第 3 个目标弹付费墙；「ご利用プランを見る」出现（Q6 应隐藏）；改目标文后直接重算没给三选一；「目標だけ保存」改了配点；切换目标后首页仍显示旧目标；v1 计划被自动转成 v2；没有 v2 的新用户经引导或旧接口仍能生成 v1 计划；見直し结果 ✕ 掉一条后配点合计不是 100；删旧屏后有链接 404；删了 R21 还在用的文件；删接口前 App 旧版本仍在调用（App 未发布，可直接删，但同步副本要一起删）；兼容跳转删了但 `#plan-action-…` 旧书签没有落点（落到 Task › プラン 即可，不保证锚点）。

## 契约（本 Sprint 定稿，REPORT 交接）

`shared/contract/plan-v2.ts` 只加：`PlanReviewView`（draft + `premiseMarks[{ key, evidenceIds[], suggested? }]` + `reviewLeftThisMonth`）、`PlanAchievementView`（total、talkedPeople、events、bestMove{ text, basis[] }、skippedAreas[]）、`PlanNextGoalCandidate { goalText, goalKind, basis[] }`、`PlanGoalEditRequest { goalText?, goalKind?, mode: 'save_only' | 'save_and_rebuild', expectedRevision, idempotencyKey }`（strict）、`PlanLegacyView`（v1 只读摘要）。

| 接口 | 说明 | AI |
| --- | --- | --- |
| `POST /api/agent/plans/v2/[planId]/reviews` | 开始見直し → `plan_drafts`（kind review）+ 前提预标（当天缓存） | C8（不扣次数） |
| `POST /api/agent/plans/drafts/[id]/fix`（kind review） | 发出修正（扣月配额，失败不扣，不改也扣）；结果里每条变更带 id，供逐条 ✓/✕ | C9 |
| `POST …/drafts/[id]/changes/[changeId]/toggle`（kind review） | 逐条采用 / 不采用（默认都采用；配点类变更 ✕ 后由 `reallocate` 重新回流到 100） | — |
| `POST …/drafts/[id]/manual-edit`、`…/confirm`（kind review） | 见直后的手动编辑（1 次）与确定（原地更新 + `plan_revisions`） | — |
| `GET /api/agent/plans/v2/quota` | 本月见直剩余、手动编辑是否可用、生效目标数 / 上限 | — |
| `POST /api/agent/plans/v2/[planId]/manual-edit` | 确定后的手动编辑（开一份 review 草稿，不调 AI，不扣见直） | — |
| `POST /api/agent/plans/v2/[planId]/achieve` | 达成（`expectedRevision`） | — |
| `GET /api/agent/plans/v2/[planId]/next-goals` | 下一目标候选（每计划一次，缓存） | C10 |
| `PATCH /api/agent/plans/v2/[planId]/goal` | 编辑目标（`save_only` / `save_and_rebuild` → 返回 review 草稿） | — |
| `GET /api/agent/plans/legacy` | v1 计划只读摘要（当前与已归档） | — |
| `POST /api/agent/plans/bootstrap`、`POST /api/agent/plans`、`POST /api/agent/plans/reanalyze`（改） | 一律 409 `PLAN_V1_RETIRED`，响应带 v2 入口地址（Task › プラン 的目標入力） | — |

## 范围与文件

- **新建（服务端）**：`features/plans/v2/{review-service,achievement-service,goal-edit,legacy-reader}.ts`；`features/plans/v2/ai/{review-marks,review-fix,next-goals}.ts`（ai / mock）；上表路由 + handlers。
- **新建（Web）**：`app/(app)/app/plans/[planId]/review/page.tsx`、`app/(app)/app/plans/[planId]/done/page.tsx`、`app/(app)/app/plans/legacy/[planId]/page.tsx`（与 App 同路径）；`orbit-2026/plan/` 下見直し入口弹层（b4 A4 ①：3 格配额条、重置日、这次参考的数据、「iOrbit で見直す」）、見直し页（前提卡预标、右栏配额、差分卡逐条 ✓/✕）、用完弹窗、達成确认 / 完成页 / 次の目標、目标下拉（Popover）与编辑 Modal（三个出口）、以前のプラン卡。
- **新建（App）**：`app/plans/[planId]/review.tsx`、`app/plans/[planId]/done.tsx`、`app/plans/legacy/[planId].tsx`；`src/screens/plan/` 下对应组件（目标「▾」BottomSheet、作り直し动作表）。
- **修改**：概要按钮接上（R24 占位）；Web `plan-slot.tsx` 的 v1 分支 → 以前のプラン 卡，然后插槽只剩新代码；App `PlanSlot` 同；首页契约 `current` 跟随 `last_opened_at`（R22 已有，切换时调用 `open`）；全产品旧链接 → 新深链（`shared/compute/plan-href.ts`）：第 2 条列出的位置、`features/**` 服务端 href、活动跟进 `taskHref` 的字面量类型（`contract:` 提交，App 同步）；旧引导（R28 重写前的 `/app/start`、`/app/profile/onboarding`）里「生成计划」一步改跳 v2 入口；README「合回前总验收」对应两项打勾；`screen-ownership.md` 计划行改为「已处理」。
- **删除**：Web `app/(app)/app/agent/plan/**`（页面、`plan-slot.tsx` 的旧部分、`read-current-plan.ts`、`plan-route-view-model.ts`）、`app/(app)/app/agent/strategy/**`、第 4 条列出的 `iorbit-0918` 计划专用文件；App `app/contacts/matches.tsx`、`src/screens/contacts/{ContactNeedsMatchesScreen,ContactNeedsMatchesContent,ContactNeedsHomeEntry}.tsx` 与 `src/view-models/contact-needs.ts`（`ContactsScreen.tsx` 里的入口若 R11 尚未重写，一并去掉）、`app/contacts/intros.tsx`、`ContactIntrosScreen.tsx`、`src/view-models/contact-intros-summary.ts`、`src/data/offline-read/route-domain-inventory.ts` 的对应登记（**`contacts/intros` 一组待用户确认**）及 `ContactDetailScreen` 的入口按钮（若 R11 尚未重写）；服务端 `app/api/contacts/needs-matches/**`、`features/contact-needs/**`、`shared/contract/contact-needs.ts`、`app/api/contacts/intros/summary/**`、`features/contacts/contact-intros-summary-reader.ts`、`shared/contract/contact-intros-summary.ts`（契约删除在 `BREAKING.md` 登记、App 同步删除副本）；相应测试改写或删除（每个删掉的断言在 REPORT 列出理由）；两端写死文字 / Ionicons / 旧写法允许清单里这些文件的条目移除（只减不增）。
- **测试**：
  - `review.test.ts`：打开不扣、发送扣、失败不扣、不改也扣、两个目标合计 3 次、东京月初恢复、并发两次发送只扣到上限（`review:<YYYY-MM>:<n>` 唯一键）、已得分不变、跳过类型配点不能改、有分类型不能删、逐条 ✕ 后合计仍 100、确定时按当时的已得分重新校验、`base_revision` 过期 409、见直后手动编辑重新可用、预标每天最多一次 AI；
  - `v1-retired.test.ts`：没有 v2 的新用户调 `bootstrap` / `POST /api/agent/plans` / `reanalyze` 都得到 409 `PLAN_V1_RETIRED` 与 v2 入口；旧引导的生成步骤跳到 v2 入口；
  - `achievement.test.ts`：达成后分数不再变、不占生效名额、完成页数字、次の目標候選（mock）与失败只剩「自分で決める」；
  - `goal-edit.test.ts`：只改背景直接保存；改目标文给三选一；`save_only` 不动配点；`save_and_rebuild` 打开 review 草稿、发送才扣；
  - `multi-goal.test.ts`：两个生效目标切换、第 3 个被拒绝且无付费入口、切换后 `summary.current` 跟随；
  - `legacy.test.ts`：v1 只读摘要、首次确定 v2 后 v1 归档但仍可读；
  - `no-legacy-plan-links.test.ts`：两端源码里不再出现 `/app/agent/plan`、`/app/agent/strategy`、`/contacts/matches`、`/contacts/intros`、`/api/contacts/needs-matches`、`/api/contacts/intros/summary`（测试 fixture 与 BREAKING 记录除外）；
  - 两端渲染测试与端到端（见直全流程、用完状态、达成到下一目标、切换目标）。
- **不做**：订阅与付费档（Q6）；「ご利用プラン」比较页（b4 A4 ③）；iOrbit 里「プランを見直したい」的意图识别（R21 用深链即可）。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R25-01 見直し | 概要 → 入口弹层（配额条、重置日、参考数据）→ 見直し：前提卡预标（豆沙 + 依据）→ 改一行 + 补一句 → 发送 → 差分 +「変わらない点」，逐条 ✓/✕ → 再发一次 → 手动编辑 1 次 → 确定 → 回概要 Toast；配额 3→2→1；第 3 次不改也扣；已得分不变 | `review` 测试 + 截图（b4 A3、A4 ①） |
| SC-R25-02 用完 | 用完后输入栏灰、说明可用的事、主按钮「わかりました」、无付费入口；下月恢复 | 测试 + 截图（b4 A4 ①②） |
| SC-R25-03 達成 | 确认框 → 完成页（三数字、いちばん効いたこと、跳过领域）→ 次の目標候選（2 + 自分で決める）→ 选中进入生成流程；达成后不占名额、分数定格 | `achievement` + 端到端 + 截图（b4 A5） |
| SC-R25-04 多目标与编辑 | 下拉切换（分数、聊过人数、打勾）、添加（满 2 个时说明）、编辑三出口；首页跟随切换 | `multi-goal`、`goal-edit` + 截图（b4 A6） |
| SC-R25-05 以前のプラン | v1 用户看到只读卡 +「新しいプランを作る」；确定 v2 后 v1 在下拉底部「以前のプラン」可读 | `legacy` 测试 + 截图 |
| SC-R25-06 旧屏与旧接口已删 | 删除清单里的文件全部不存在；两端 typecheck / 全量通过；归属表计划相关行（Web `/app/agent/plan`、`/app/agent/strategy`，App `contacts/matches`、`contacts/intros`）改为已处理 | 文件清单 + `screen-ownership.md` diff |
| SC-R25-07 旧链接为零 | `no-legacy-plan-links` 通过；本机 dev server 逐个点开第 2 条列出的入口，都直接落到新页面（无 307 兼容跳转） | 测试 + 点击记录 |
| SC-R25-08 AI 规矩 | C8–C10 mock 先行；授权后各 ≤5 次真实调用，REPORT 附记录 | 测试 + REPORT |
| SC-R25-09 v1 创建入口已关 | 没有 v2 的新用户经旧引导、`bootstrap`、`POST /api/agent/plans`、`reanalyze` 都无法生成 v1 计划，而是被带到 v2 的目標入力 | `v1-retired` 测试 + 本机点击记录 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01–05 | 截图对照页：b4 A3–A6 ↔ 实现，浅色 / 深色；Web 1440 / 1024 / 390，App 模拟器 | `~/orbit-sprint-evidence/redesign/R25/run-01/compare.html` |
| 06 | 三份允许清单里被删文件的条目已移除，计数只减不增；Web 路由审计计数与清单重新生成 | 门禁测试输出 + 审计 diff |
| 06 | 删除前每个导出符号的 impact 结果（LOW / UNKNOWN + 文本确认）列在 REPORT | REPORT |
| 全部 | 三语、`copy:qa` 0；两端全量零新增失败；`tsc`、`typecheck:app`、`lint`；`detect-changes` 写进 REPORT | 全量清单 |

## 执行顺序

1. 基线、impact；和乙核对热点文件与 R21 进度。
2. 服务端：配额 → 见直（预标 / 发送 / 确定）→ 达成 → 目标编辑 → v1 只读。
3. 两端界面：概要按钮接线 → 見直し → 配额状态 → 達成 → 目标下拉 / 编辑 → 以前のプラン。
4. 链接替换（先换生成器与 href，再删路由）。
5. 删除旧屏、旧接口、旧测试；允许清单与审计计数更新。
6. 端到端、截图对照页；若已授权，C8–C10 本机真实调用。
7. 全量、REPORT；README 登记表、合回前清单、归属表同步。

## 失败与交接

- R21 尚未重写、`iorbit-home.tsx` 仍引用旧计划文件：只替换 import 与链接，删除旧文件；REPORT 列出动过的 R21 文件与通知记录。
- 用户未确认删除 `contacts/intros`：保留该屏与接口，归属表该行写「待用户确认」，REPORT 列为已知例外；其余照常收口。
- 删接口发现还有未登记的调用方：停下来改调用方或保留接口，REPORT 写明，不强删。
- REPORT 交接：给 R21 的深链与「プランを見直したい」入口地址；给合回前总验收的勾选项；C8–C10 授权状态与调用记录。
