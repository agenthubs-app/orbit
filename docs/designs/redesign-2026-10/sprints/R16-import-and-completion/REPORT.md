# Sprint R16 — REPORT（加人：导入与每天一问）——服务端部分

**执行人：** 小雨（甲）的执行会话，2026-10-11 ～ 12。**分支：** 直接在 `redesign` 上提交。
**依据：** [PLANNER](PLANNER.md)（rev 3）、[add-and-invite/DESIGN.md](../add-and-invite/DESIGN.md)。
**范围说明：** 2026-10-11 主会话转达用户决定：逐像素还原标准（README 规则 11）定下来之前，**新的 Web / App 界面暂停**。本 Sprint 只做了契约、纯函数、服务端与测试；导入的两端界面、`CompletionQuestionCard`、删除旧 `network-import*`、`expo-contacts` / `fflate` 依赖都**没做**，等导航壳返工和用户拍板后按逐像素标准一次写。
**没有做的事：** 没连 Neon、没部署、没有迁移、没有付费 AI。

## 做了什么

- **契约（`1b2be48a`，App 副本同提交）**：`shared/contract/contact-import.ts`——用真实 handler 逐个 kind / format 跑出的响应如实描述现有导入 HTTP 形状（批次、行、问题、统计、映射、提交结果、上传头常量），请求严格、响应宽进，parity 测试 6/6；契约 3 只加 `contactName / contactSubtitle / sourceChip / kind` 与 `densityAfter`，`askedOn` 注释改东京日；快照、parity、演示世界更新。
- **服务端（`d3a7dfc6`）**：纯函数 `work-contact-likelihood`（通讯录「像工作关系」预选）、`vcard-build`（与服务端解析器往返测试）、`completion-question-rules`；`features/contacts/completion` 每天一问 live（每人每东京日 ≤1 题、并发只出一题、同天重放、两种题型、选项只来自真实数据或固定项、回答写 `metEventId` / 备注「出会い：…」/ `organization`（`applyContactFieldValues`，旧值进历史）、`densityAfter`、跳过 3 次停止、他人隔离、示例模式拦写）；`contact-completion` capability 加 live。
- **复核修复（`141a599b`）**：见 [REVIEW 处理记录](REVIEW.md#处理记录执行人2026-10-12)。

## 测试

导入 parity 6/6、纯函数（修复后预选 45 条等）、每天一问服务（内存 + 本机 Postgres）、路由（mock 与 live 同一组断言）全部通过；修复后相关 138 条 0 失败；两端类型检查、lint、`copy:qa` 0。两端全量未在本轮重跑（工作区有另一个会话未提交的导航壳改动，会混入无关结果），界面开工时一起跑。

**2026-10-12 全量（R15 P1 + R16 connectedOn 之后，`~/orbit-sprint-evidence/redesign/R16/run-02/full-*.log`）**：orbits 7526 条，失败 11——9 条来自另一个会话未提交的计划页文件（`plan/**` 的写死文案、CSS 非 token、计划页渲染、产品面清单新 P0），2 条连库并发测试（招待码 20 并发兑换、W0048b）在高负载下超时、单独重跑通过；本轮新增失败 0。App 3967 条、0 失败（`notification-registration-races` 负载下超时取消，单独重跑 16/16）。

## GitNexus

`applyContactFieldValues` HIGH：不改，只新增调用方；导入 handler MEDIUM：行为未动；其余 LOW / UNKNOWN（grep 确认）。detect-changes 记录在证据目录（混有另一会话的未提交文件，已在日志里区分）。

## 自定决定（实现细节）

| # | 事项 | 决定 |
| --- | --- | --- |
| 1 | 当天没有可问的人 | 记一条，当天不再读人脈；之后有新导入时仍可出一题（一天最多一题） |
| 2 | 跳过次数 | 跨天累计 |
| 3 | 题目与固定选项 | 存模板键，三语按界面显示（注释写明） |
| 4 | 浓度「计划已关联」 | 暂不计入（注释写明），R11 接管 `contact-density` 时补 |
| 5 | 演示世界 | 不加导入批次 fixture（导入接口没有 mock 模式） |

## 请用户拍板（规则 11：偏离不自定）

1. **活动选项的来源**：现在用「联系人记录里的 `metEventId` + 最早录入时间」代替「我的参加记录 + 活动开始时间」（R26 的参加记录接口还没有）。推荐：等 R26 后改用参加记录。**2026-10-12 用户拍板：等 R26 后改用参加记录 + 活动开始时间（已记进 HANDOFF）。**
2. **LinkedIn 导入的人用 `connectedOn` 还是导入时间作「加入时间」**（影响 30 天与 ±14 天窗口）。推荐 `connectedOn`（有值时）。**2026-10-12 用户拍板：用 connectedOn；已实现（`7c68292f`）。**
3. **当天导入后是否当天就能出题**。现在：可以（仍一天一题）。**2026-10-12 用户拍板：维持现状。**

## 交接 / 下一步

- 界面（SC-R16-01～06 与像素 SC-P01～P11）等导航壳返工与用户拍板后再做；届时加 `expo-contacts`（App）与 `fflate`（Web），删旧 `network-import*`。
- R20 / R11 / R10：每天一问接口已 live，卡片组件随界面一起做。

---

# 界面部分（2026-10-14，R16 界面会话）

**依据：** PLANNER rev 3、决定表 §17–§23（§20 App 通过口径、§23-1 Web 例外、§23-2 补画 b12 #298–#305）。**没有做的事：** 没连 Neon、没部署、没有迁移、没有付费 AI。

## 做了什么

- **Web（`/app/contacts/new/import`）**：选门页（W-R16-10：連絡先 vCard / LinkedIn / CSV / イベントから + 「どの方法でも」流程条）；上传页（b9 A3 ② LinkedIn、W-R16-11a vCard、CSV 照同构）——拖放或点击，LinkedIn ZIP 在浏览器里用 `fflate` 取出 Connections.csv（找不到时原位红字）；批次页 `/import/[id]`：列の対応（b9 A3 ③ / W-R16-11b，表头 chip 下拉改映射、ほぼ空 < 1/5、例外数）→ まとめて確認（`?step=review`，复用 R12 `UnifiedReview`：自动统合 = 完全一致，重複 = 其余候选，同名不同公司（転職？）默认不勾、永不自动统合；要確認按问题分组，1件ずつ見る 可逐行「取り込まない」）→ 「N人を人脈に追加」：按勾选逐条下决定、每条合并都放进 `mergeConfirmations` 后 commit（不会 MERGE_NOT_CONFIRMED / UNDECIDED_ROWS）→ 完成（新しく追加 / 既存と統合 / 取り込まなかった，与 commit 结果一致；没有画板，照 W-R12-11 同 kit）；イベントから（W-R16-11c：选活动 → 建批次 → 勾选参加者，没勾的设为 skip，已在人脈的不可选）。
- **旧页删除**：`network-0918/network-import{,-file,-event,-client,-styles}`、`_add/legacy-network-import.tsx`、`tests/pages/app-network-import.*`；`?method=csv|contacts|event|linkedin` → `/app/contacts/new/import?method=…`，`?import=<id>` → `/import/<id>`（带 `?lang=`）；允许清单只减不增（legacy allowlist 删 4 行；opening 快照不动）。人脈を追加 弹窗的 その他 两门改指新页面。
- **App**：その他 门打开（`ADD_OTHER_DOORS_ENABLED`）；`contacts/new/import?kind=contacts`：b9 A2 ① 権限（只读说明、Google → 选 .vcf）→ iOS 权限（拒绝 = 回人脈を追加、不再从这里追问；已永久拒绝时按钮变「設定で許可する」）→ ② 選ぶ（`work-contact-likelihood` 预选 + ? 根拠、すべて / 選んで取り込む、会社名あり / 仕事のメール 筛选、实时人数）→ **只把选中的人**用 `vcard-build` 转 vCard 上传 → ③ 取り込み中 → `import/[id]` ④ まとめて確認（`UnifiedReviewApp`，ℹ️ 外した N件）→ 完成；`?kind=linkedin`：b9 A3 ① 3 ステップ → 「ファイル」选 CSV / ZIP（App 也用 `fflate`）。依赖 `expo-contacts ~57.0.7`（`NSContactsUsageDescription`，开发包已重建；pod install 需 `LANG=en_US.UTF-8`）。
- **今日の 1問**：两端 `CompletionQuestionCard`（纯展示）+ `TodayQuestionCard`（读当天题、回答 / スキップ后当天隐藏、503 不显示），两端组件展示页各一节。契约 3 只加可选 `densityIfAnswered`（出题时按 D-10 算好；卡片只在会升到 ●●○ 时写「答えると ●●○ に」，否则「情報が 1つ増えます」——不说「答了一定升档」）；快照、App 副本、演示世界已更新。
- **门禁演示**：Web `/import/design-*`、App `import/design-pick|organizing|review`，开关同 R12（`add-scan`，Web 另认 `add-import`），生产与正式包永远关闭；示例数据在 `features/contacts/import/design-samples.ts`、`import-design-samples.json`（数据，不是文案）。

## 像素门禁

- **Web**（`views/web-import-R16.json`，1440 × 浅 / 深，归因 `attribution-redesign-R16.json`，证据 `~/orbit-sprint-evidence/redesign/R16/run-01/r9`，设计图 `--no-cache`，画板已含 19624d5e1）：**13 / 14 PASS**，raw 全部 ≤ 0.003（W-R16-10、06、07、08 深、11a、11b、11c；11b / 11c 的头像配色带 `[data]`）。**未过 1 张**：W-R16-08 浅（「会社が違う（転職？）」Chip 字色 apricot `-text` vs kit `-ink` = 组件库 G23b，乙；raw 0.0012）。设计稿只有 1440，没有 1024 / 390 画板，未比。
- **App**（`views/app-import-R16.json`，iPhone 16e (add) 浅 / 深，§20 口径，归因 `attribution-redesign-R16-app.json`，证据 `run-01/app-r5`）：**8 / 10 PASS**（全部超阈值带 `[raster]` / `[data]`；整屏 raw 参考：①権限 0.045 / 0.046、③ 0.025、④ 0.061 / 0.065、⑤ 0.050 / 0.051）。**未过**：A-R16-02 浅 / 深——组件库 `Segmented` 高 38（kit `.seg` 30），下面整页下移 4–7px；手写 tablist 不许进新代码（legacy-ui-ratchet），归组件库 G23（乙）。`[raster]` 抽查：①浅 #14 / #18、④浅 #22、⑤浅 #20 的裁剪图已核对（同位置字形 / 抗锯齿、位置 ≤ 3px）。
- **今日の 1問**（b9 A7）：画板是 Task To-do 里的一张卡，展示页位置不同、整屏无法比；组件按 kit 搬（`.card.flat` 14、`.av.sm`、`.fopt`、`.dn.up`），未单独过门禁（挂进 To-do 时由 R20 比）。
- 轮次：Web 07 / 08 / 11b / 11c 各 3 轮，其余 1 轮；App 01 / 03 / 04 / 05 各 3 轮内，02 停在第 3 轮（组件库）。

## 画板口径（已列给主会话，设计稿会话已改画板 19624d5e1，决定表 §25；其余实现口径 §26）

1. b9 #8 / #28「選んだ 4件を統合」只勾 3 行 → 3件。2. b9 #7「🎯 VC（候補）」列对应阶段无数据。3. b12 #302 フリガナ 无对应字段（→ 使わない），使わない列的例服务端不回原文（→ —）。4. b12 kit 缺 `.btn.xl`。5. b12 #304 写 17 / 16 人只画 4 人。6. b9 #2「会社名あり」默认选中与列表矛盾、「Orbit 未登録のみ」无数据来源。7. b9 #4 既存行「· 名刺」来源契约里没有。8. b9 #3 逐条进度「142 / 238」服务端没有。

## 测试

- 新增：Web `tests/ui/add-import-model.test.ts`（分组、转职默认不勾、commit 计划逐条确认合并、列映射、ほぼ空、ZIP 取 CSV）；App `tests/add-import-model.test.ts`（画板人数自洽、只把选中的人转 vCard、LinkedIn ZIP）。改：`add-contact-model`、`add-contact-screens`（两端）、`app-contacts-new-live-route-services`、App 路由登记三处测试。
- 全量见「收口」。

## GitNexus

`resolveAddContactRoute` LOW（1 调用方）、`NetworkImport` / `LegacyNetworkImport` LOW（删除，调用方已文本确认只剩 page 与测试）、`ADD_OTHER_DOORS` UNKNOWN（文本确认：只有 `AddContactDoors` 与测试）、`AddContactSheet` LOW、`createContactCompletionService` LOW、`ContactCompletionQuestion` UNKNOWN（类型；只加可选字段，读取端宽进）、`UnifiedReviewApp` LOW、`AppScreen` UNKNOWN（`backIcon` 联合类型只加 `"down"`）。detect-changes 见收口。

## 独立复核（子代理，2026-10-14）与处理

S 3 条、M 3 条、m 5 条，处理如下：
- **S1 イベントから 把已在人脈的人再建一份**：服务端活动批次的行是 `candidate: null, decision: "merge", mergeIntoContactId`；模型新增 `mergesIntoExisting`，这些行算自动统合、提交时保持 merge 并逐条放进 `mergeConfirmations`；选人页「すでに人脈」也按它判断。已修（两端模型同一份），加回归测试。
- **S2 服务端已 skip 的行提交时被改回 create**：「取り込まない」从 `serverSkipped(rows)` 开始（Web 初值、App 以变更叠加在默认值上）；选人页重新勾上的发 create。已修 + 测试。
- **S3 vCard / 活动来源名递归**：`sourceName` 改用 `SOURCE_LABEL`。已修。
- **M4 每天一问重试不幂等**：两端按题目 + 动作固定幂等键。已修。
- **M5 「答えると ●●○ に」可能不实**：服务端只问 ●○○ 的人（`loose` 过滤），`densityIfAnswered > 1` 即真升档；按目标写 ●●○ / ●●●，没有字段不声称。已修（加 `hint3`）。
- **M6 Web 批次页加载失败都显示「找不到」**：404 才是「開けませんでした」，其余显示重试卡。已修。
- **m7 App vCard 上传失败被 loadFailed 盖掉 / 读文件无 try**：失败回到上一步并显示原因。已修。
- **m8 App 首帧勾选为空**：勾选与「取り込まない」改为默认值 + 用户变更派生。已修。
- **m9 Web 快速切换活动竞态**：只接受最后一次选择的结果。已修。
- **m10 提交失败后状态不明**：失败后重新读批次（已提交则落到完成页）。已修（两端）。
- **m11 `hardcoded-copy-opening.json` 仍有旧文件条目**：不改——这是 R03 开工时的开局快照（测试锁定哈希，只记录不删）。

## 收口（复核修复后，`~/orbit-sprint-evidence/redesign/R16/run-03/{web,app}-full2.log`）

- **Web 全量 7574：6604 过、4 失败，均非本组**——`add-scan-flow`「R12 review m9」「e2e upload 4 cards」（R12 名刺流程，等 `[data-scan-add-all]` / 区块顺序，与本次改动无关）、`product-surface-manifest` 的 P1 = `ManualContactDrawer.tsx:267` 的 `div role-button`（R12）、`plan-design-fixtures` 的 offenders = R12 `scan-design-fixture*`（本组文件已改名为 `import-design-gate` / `import-design-demo` / `design-samples`，不在名单里）。
- **App 全量 3975：3970 过、3 失败**——`RootLayout records first commit`、`native consumers` 为已知偶发（R15 记录同样），`invite-code-screens` S1 单跑 19 / 19 过。
- `tsc` 两端 0；`copy:qa` 本组 0 条；契约快照已写。
