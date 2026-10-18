# R11a 人脈 一覧 + 連絡先詳細 + 数据层 — REPORT（2026-10-18）

范围：PLANNER rev 2（「主会话代定」1–13）+ GOAL。B 线 worktree `redesign-b`（`line-b`），Web :3300（`.next-line-b`）、Metro :8083、本机库 `orbit_line_b`、模拟器 `Orbit Line B`（iPhone 16e，iOS 26.4）。没连 Neon、没部署、没推送；**付费 AI 真调 0 次**（value-lines / insight 在本机只读已有结果）；没用 GitNexus。

**结论**：结构、数据层、契约、逻辑、两端界面与测试已交（SC-01～11、14）。R31a / R31b 组件库在本 Sprint 收尾时才合入 `origin/redesign`（R31b `d5f27962c`…`3193238b5`），像素收口（SC-12 / 13）未跑，登记交接表 R11-16 / DEFERRED-A §1；前置是人脈设计 fixture（见 §4）。

## 1. 提交（`line-b`，已 rebase 到 `origin/redesign` `3193238b5`，未推送）

| 块 | 提交 |
| --- | --- |
| 要フォロー 共用规则（R20a 已引用） | `8476eb8ad`（已在 `origin/redesign`） |
| 契约：数据层 / 软删 / 跟进 id / 编辑与以前の値 / 删 pipeline（每个都同提交 `sync:contract`） | `794c40759`、`d4693f08b`、`3d57b552b`、`f8cae85c6`、`4e020e3f3` |
| App 人脈一覧 / 連絡先詳細 + 編集 + 删除 / 删旧屏 | `61c37954b`、`54e9dc1a5`、`134716a1c` |
| Web 人脈页 + `ContactDrawer` + 编辑 / 删除 / 招待 sheet | `22bcd04d7` |
| 运行时验证后的修正 | `fbb329ca1`（抽屉不再对普通联系人读招待连接，去掉 404）、`d45c777d8`（英文「1日1問」空格、编辑页标签） |
| R31a `AppScreen inset="kit"` | `97b0f4d3e` |
| 人脈分析入口（RD-33 补充） | `9b36af069` |
| 文档：预检、画面清单、D-10 / HANDOFF / DEFERRED-A / screen-ownership / 决定表 §B-2 | `41ea40ec7` |
| 全量跑出的问题 | `e62ed21ab`（软删 / 恢复补 sync 提交顺序锁）、`b26750474`（删旧屏测试与 pipeline 残留） |
| 本 REPORT | 本文件所在提交 |

## 2. 成功标准

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-R11a-01 开工与边界 | ✅ worktree / 端口 / 库 / 模拟器（自建 `Orbit Line B` 085A9512…，没用用户的 9BF990F2 和 Redesign Shots）；两端基线全量；R25 REPORT:132–136 已读，通知见 §7；`board-preflight` 两端跑完，五项结论在 `preflight-checklist.md` | `_evidence-b/R11a/run-01/baseline-*`；`preflight-checklist.md` |
| SC-R11a-02 来源统一 | ✅ `shared/compute/contact-source-chip.ts`：6 值（含 event、汎用 CSV → manual、vCard → phone、LinkedIn、名片 / QR → meishi、招待 = self 读时合并）；导入写顶层 `importFormat`；无 `format` 的旧记录照旧推断；`contactMetKind` 4 类；1日1問（completion）与列表用同一函数 | `tests/domain/contact-source-chip.test.ts`、completion / import 服务测试 |
| SC-R11a-03 浓度含计划 | ✅ 卡片 `density` 不含计划；`mergeContactDensity` 两端读时合并（Web SQL 带 `goalRelatedContactIds`，App 用本机缓存的计划 id）；计划「尚未实现」或读不到时退回卡片值 | `contact-density` 单测、PG 测试、App 渲染测试 |
| SC-R11a-04 契约与同步兼容 | ✅ 只加不改（`contract-snapshot` 一致；删 `contact-pipeline-page` 记 `BREAKING.md` 10 行）；旧 `contactCardSchema` 解析新卡片成功；未知 `sourceChip` / `metKind` 落兜底；同步镜像 `ContactSyncPayload.card` 带新字段；旧镜像行（无新字段）App 用 `withLegacyNetworkFields` 现算 | `tests/contracts/redesign-schema-parity.check.mts`、App `contacts-r11a-contract.test.ts`、渲染测试「legacy row」 |
| SC-R11a-05 列表接口 | ✅ PG：`goalRelated`（新参数 $18 起，不占 `$17`）/ `needsFollowUp`（tasks + lifecycle，已完成 / 已删除不算）/ `industry` / `region` / `met` / `status` / `density` 单独与组合、cursor 稳定；`densityCounts` 之和 = total；`addedThisMonth` 按 Asia/Tokyo；`total` / `addedThisMonth` 不随页签与筛选变；`tabCounts`；`goal-related-ids` 上限 500 + `truncated`；summary 一条 SQL 聚合，读预算闸门加 tasks / plans | `tests/services/contact-network-list-postgres.test.ts`、`tests/api/contact-network-routes.test.ts`；量见 §5 |
| SC-R11a-06 App 人脈一覧 | ✅ 顶栏「🔍 · 人脈 / N人 · 今月 +M · ＋」；三页签；絞り込み四组 + 濃さ；本机搜索；🔍 → `/search?q=`；`/contacts?industry=` 预选；「＋」弹 `AddContactSheet`；飞行模式列表 / 页签 / 搜索可用；返回恢复页签、筛选、搜索（滚动由 `AppScreen` 记）；不足 10 人「人脈分析 · あと N人」 | `orbit-app/tests/network-screen.test.tsx`（15）；模拟器截图 `_evidence-b/R11a/run-01/app/*.png`（真实数据 78 人、要フォロー 66，浅深） |
| SC-R11a-07 Web 人脈一覧 | ✅ `ShellPage` + 右栏 `TodayQuestionCard`；三页签、筛选、搜索、翻页；🔍 派发 `orbit:open-palette`，390 无 🔍；`?industry=` 预选；「＋」打开加人弹窗压在列表上；390 深色开发模式水合警告 0 | `tests/ui/network-screen.test.tsx`（8）；`_evidence-b/R11a/run-01/web/runtime.log` + 截图 |
| SC-R11a-08 連絡先詳細 两端 | ✅ 头卡、なぜこの人か（value-lines，失败整块隐藏）、次の一手、力になれること / 求めていること、往来；面談の日程提案挂 R20a `MeetingProposalSheet` / `MeetingProposalModal`（只引用）；Web `ContactDrawer` 导出并有独立渲染测试；付费 AI 0 次 | 两端渲染测试；Web 抽屉截图、App 详情截图 |
| SC-R11a-09 三类特别情况 | ✅ 招待连接：本人入力、共有する項目 sheet（含「統合する / 別の人」）、`pausedFields`、つながりを解除（Web 480 Modal）；fit `candidate` 虚线确认卡 ✓ / ✕ 调候补决定接口后消失；`fieldHistory` 以前の値（含 offering / seeking） | 两端渲染测试、`contact-detail-field-history.test.ts` |
| SC-R11a-10 编辑与删除 | ✅ 两端编辑（业界 / 职位层级 picker、段階、标签）→ `PATCH …/fields` + `PATCH …/:id`；删除确认 → `DELETE` 软删 → 列表消失 + Toast「元に戻す」→ 恢复；30 天内有效、过期 NOT_FOUND；メモ不动、删除期间读取侧隐藏；App 离线删除进本机队列、联网后发送；**全量跑出软删没拿 sync 提交顺序锁（严格触发器会拒），已修 `e62ed21ab`，PG 测试改为装严格触发器**；「最近削除した項目」/ 到期清除 → DEFERRED R11-17 | `contact-delete-postgres.test.ts`、`contact-fields-route.test.ts`、App 渲染测试（在线 / 离线删除、编辑） |
| SC-R11a-11 删除 pipeline | ✅ 两端路由、屏、接口、读模型、契约、链接删除（文本搜索：只剩 `BREAKING.md` 与一份旧 LIVE_IMPLEMENTATION 说明）；R11b 名下文件里删的入口见 §7；screen-ownership 两行已标；审计计数：`tests/audits` 已改，`docs/audits/full-product-functional-audit` 重新生成被别线缺的运行样本挡住（见 §8） | 路由测试、`page-offline-inventory`、`app-wide-route-coverage` |
| SC-R11a-12 像素 | ⏸ 未跑：组件库收尾时才合入；清单 `web-R11a.json` / `app-R11a.json` 已提交；前置见 §4 | 交接表 R11-16 |
| SC-R11a-13「待 R11」重比 | ⏸ 接线都已做（「＋」弹层、`?industry=`、🔍）；重比随 R11-16 | DEFERRED-A §2 两行 |
| SC-R11a-14 全量与复核 | ✅ 两端全量对照基线零新增失败（§3）；orbits `typecheck` / `typecheck:app` / `lint` 0，`copy:qa` 人脈域 0 条（全仓 218 条都在别的域）；App `tsc` 0；越线检查：只改了本线文件 + 代定 3 允许的 R11b 链接；独立复核待主会话安排 | `_evidence-b/R11a/run-01/final2-*.log` |

## 3. 测试对照

| | 基线（开工，`8476eb8ad`） | 收口（rebase 到 R31b 之前的 `8beaa629e`，即现在的 `b26750474`） | 新增失败 |
| --- | --- | --- | --- |
| orbits 全量（`LANG=en_US.UTF-8`，heavy.sh） | 7475 / 6484 过 / 6 败 / 985 跳 | 7516 / 6521 过 / 6 败 / 989 跳 | 0（6 条同名：e2e 4 张名片、manifest、merging、dev route fixtures、R12 m9、手入力） |
| App 全量（heavy.sh） | 3323 / 3296 / 10 败 | 3190 / 3178 / 10 败 | 0（9 条 `add-contact-screens` 在**干净的 `origin/redesign`** 上同样失败——`git archive` 出的副本实测 11 败，来自上游，不是本线；1 条 `i18n-domain-split` 是基线：R30 加的 `eventsJourney` / `search` 域没进 `ADDED_SINCE_SPLIT`） |
| 本机 PG（联系人 6 文件，库 `orbit_cutover_test_20260917` 同基线） | 39 / 30 / 9 败 | 43 / 34 / 8 败 | 0（8 条都在基线名单，ICU / Node 25 运行时差异；本 Sprint 新增 4 条全过） |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 | 0 | — |
| App `tsc --noEmit` | 0 | 0 | — |

rebase 到 R31b（只动 Web 组件与计划 / 活动 / 主办调用点，没碰本线文件）之后复跑了 orbits `typecheck` 与 `tests/ui/network-screen.test.tsx`（8 过）。App 总数变少：删了旧 `ContactsScreen` / `ContactDetailScreen` / pipeline 的测试（含全量才暴露的 `ink-signal-contacts` 39 条，测的是被删的旧屏深度 / 关系搜索界面，现由 R30 全局搜索承担）。

## 4. 门禁状态（RD-16 / RD-29）

- 未跑。R31b 合入时间是本 Sprint 最后一次 rebase（2026-10-18 下午），R31a 第二批也是同日。
- 已备：`scripts/visual/views/web-R11a.json`（W-R11-01～13）、`app-R11a.json`（A-R11-01～13）；`preflight-checklist.md` 五项结论。
- **前置（交接表 R11-16）**：人脈页没有设计 fixture。门禁要的空 / 5 人 / 286 人三态、招待连接的人、确认卡、以前の値，需要 `ORBIT_REDESIGN_MOCK=network`（`shared/mock/demo-world/network.ts` 补卡片 / summary / 详情，R26 / R27 的写法），App 要同样喂本机镜像。真实库（qa 账号 78 人）只能当运行时验证，不能比画板。
- 已知要在收口时处理：编辑页字段标签样式（`d45c777d8` 先与 `TextField` 对齐）、Web 1440 抽屉打开时浓度卡「名刺レベル」折行。

## 5. 读取量（SC-05）

| 接口 | PG 测试（本机） | dev :3300 实测（qa，78 人，read_receipt，含鉴权查询） |
| --- | --- | --- |
| `GET /api/contacts/page`（30 张） | 1 条语句，8 273 B（14 人） | 10 条 / 12 行 / 约 30 KB |
| `GET /api/contacts/summary` | 1 条语句，559 B | 7–10 条 / 约 10 KB |
| `GET /api/contacts/goal-related-ids` | — | 6–9 条 / 75 行 / 约 12.5 KB（含 66 个跟进 id） |

## 6. 运行时验证

- **Web**（:3300，qa@orbit.test）：列表真实数据「78人 · 今月 +0」、浓度 78 / 0 / 0、出どころ 名刺 47 / イベント 2 / 手入力 29、目標に関係 0 / 要フォロー 66（页签 30 行）；抽屉显示头卡 / なぜ / 往来；修掉抽屉对普通联系人的 404；390 深色无 🔍、水合警告 0。`_evidence-b/R11a/run-01/web/`（脚本 `r11a-web-check.mjs` 也在那里）。
- **App**（模拟器 `Orbit Line B`，Metro :8083 → :3300）：登录后人脈页与 Web 计数一致；详情、编辑、⋯ 菜单；浅 / 深；`inset="kit"` 改后复拍。`_evidence-b/R11a/run-01/app/`。注：别线的 `Orbit-Line-C-R18a` 构建签名坏（无钥匙串权限，登录后立刻被登出），改装 `derived/orbit-redesign` 的构建。
- 本机搜索词进 `/api/contacts/page?query=` 返回 503「当前环境暂不支持此搜索」：Node 25 ICU 与库不一致的既有保护（`CONTACT_SEARCH_RUNTIME_UNSUPPORTED`，`bc3e1fc28` 起），不是本 Sprint 的改动；App 是本机搜索不受影响。

## 7. 交接

- **给 R10（首页人脈组件）**：Web 点人直接用 `orbit-2026/network/ContactDrawer.tsx` 的 `ContactDrawer`（`contactId`、`onClose`、`initial?`、`onChanged?({ kind: saved | deleted | unlinked })`、`goalLabel?`、`inviteLinked?`）；App 跳 `/contacts/[id]`。人数 / 今月 +N / 浓度 / 来源读 `/api/contacts/summary`，口径用 `contact-density.ts`（`mergeContactDensity`）与 `contact-source-chip.ts`。已写进交接表 R10-10。
- **给 R11b**：常量 `NETWORK_ANALYSIS_UNLOCK_CONTACTS = 10` 两端各有一份（Web `orbit-2026/network/network-model.ts` 带 `TODO(R11b)`，`page-lock.ts` 推上来后改 import；App `src/screens/network/NetworkScreen.tsx`，App 不能 import 服务端文件，保持相等）。入口路由不变（`/contacts/dashboard`、`/app/contacts/dashboard`）。`analysis-threshold*.ts` 没动。**R11b 名下文件里删掉的 pipeline 入口**（代定 3）：`network-0918/network-shell.tsx`（pipeline 页签）、`network-overview.tsx`、`network-analysis-structure.tsx`、`network-opportunities.tsx`（各自的 pipeline 链接），分析 view-model 的 `open_pipeline` 改到 `/app/contacts`；`network-0918/network-pipeline.tsx` 整个删除。
- **R11-14（R25 改过乙的文件）**：已读 R25 REPORT:132–136。R25 动过的 `network-opportunities.tsx` / `network-detail-modal.tsx` / `network-insight-copy.ts` 归 R11b，本 Sprint 只删了 pipeline 链接；App `ContactsScreen` / `ContactDetailScreen` 已被新屏取代删除。本条即补的通知。
- **`sourceChip` 加 `event` 的最低 App 版本影响**（代定 5）：旧 App 的 schema 已是 `tolerantEnum`，收到 `event` 显示为「手入力」，不报错。

## 8. 给别的线 / 甲 / 主会话的请求

- **A 线**：App `Chip` 前置图标位（来源 chip 的 `calendar` 图标现在手写）；`SearchField` 尾部插槽（人脈搜索行的絞り込み钮现在放在外面）；整页编辑容器（App 連絡先の編集现在用 `AppScreen` + 自己的保存钮）。
- **甲**：`src/screens/add/CompletionQuestionCard.tsx:35` 的来源标签表没有 `event`（落到手入力）。
- **主会话**：`npm run audit:full-product` 重新生成被别线缺的运行样本挡住（`/app/events/[id]/after`、`…/edit` 等），本线只改了 `tests/audits` 的计数，`docs/audits/full-product-functional-audit` 没提交，等样本齐了统一重生成。
- **D 线**：无。`relationship-lifecycle-facts-reader.ts` / `lifecycle-task-pages.ts` 本线没改。

## 9. 文档更新（代定 7，已提交 `41ea40ec7`，hash 本提交刷新）

- IMPLEMENTATION-PLAN D-10：写明实际落点（`ContactCardDTO` + `ContactSyncPayload.card`、参数与 summary 字段、`goal-related-ids`）。`IMPLEMENTATION-PLAN.html` 是评审快照，没改。
- 交接表 §R11：R11-01～15 逐条标处理结果；新增 R10-10、R11-16（像素）、R11-17（最近削除した項目）。
- DEFERRED-A：§1 加 R11-16；§2 两行「待 R11」改为接线 done；§3 加 R11-17、R11a「设计稿无」。
- screen-ownership：App / Web pipeline 两行标已处理。
- 决定表：§51 后追加 **§B-2 段階**（知り合い = `active`、関係構築 = `nurture`，推進中 / 協業中 不显示，段階 facet 去掉要フォロー，`stage` 参数删掉）——主会话代定 12，不是用户原话。

## 10. 待主会话决定

1. **像素收口怎么排**：本线接着做（先补 `ORBIT_REDESIGN_MOCK=network` fixture，再跑两份清单与「待 R11」重比），还是另开一轮。
2. **系统标签显示**：编辑页标签行显示了 `source:external-import` 这类导入写的内部标签（`plain-ui-wording` 不许露内部词）。建议列表 / 编辑都隐藏 `source:` 前缀的标签；动的是数据口径，先问。
3. **段階 §B-2** 是代定，画板上「推進中 / 協業中」仍在；要不要请用户确认或改画板。
4. **Web 1440 少量态的人脈分析入口**：照 web.html 只留つながり卡上的「人脈分析 ›」（分析页自己锁定），只有 390 显示「10人から使えます · あと N人」卡；如果要 1440 也显示卡，需要画板。
5. **App 删除后的 Toast**：「元に戻す」挂在列表页（详情返回后才显示）；设计稿没有画详情页删除后的落点，按 PLANNER 写法实现。

## 11. 清理

dev :3300、Metro :8083、画板服务 :3321 已停；模拟器 `Orbit Line B` 已关机（保留给像素收口）；临时脚本已移出仓库；证据都在 ORICO `_evidence-b/R11a/`（`~/orbit-sprint-evidence/redesign/R11a` 是软链）。
