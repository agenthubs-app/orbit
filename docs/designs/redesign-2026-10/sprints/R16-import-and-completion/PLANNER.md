# Sprint R16 — 加人：导入与「每天一问」

**Plan revision:** 2（按 `add-and-invite/REVIEW.md` 修订）。**模式:** existing-codebase / single-generator（执行人：小雨（甲））。**档位:** H。
**单一目标:** その他导入（App 連絡先经 `expo-contacts` 读取并转 vCard、App LinkedIn CSV 经 `expo-document-picker`；Web vCard / LinkedIn CSV·ZIP / 汎用 CSV / イベントから）全部走现有 `/api/contacts/import/**`，界面统一为「选人 / 列对应 → まとめて確認（R12 组件）→ 完成」；`shared/contract/contact-import.ts` 把导入的 HTTP 形状提升为共享契约；R08 契约 3「每天一问」live（规则出题、零 AI）+ 两端 `CompletionQuestionCard` 组件；删除 Web 旧导入组件。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [add-and-invite/DESIGN.md](../add-and-invite/DESIGN.md)（§2.7、§2.8、§3.3、§4.3、§7、§8 R11 / R20 / R10 行、§9 #20 #21 #24 #30、§13）。
**基线:** R15 收口后的 `redesign` HEAD（不依赖 R15 的代码；只为顺序执行）。
**进入条件:** R12 done（入口与まとめて確認组件）。
**分支:** 同 R12。

## 已查清的事实（按 `5e1c385f`）

1. **导入后端**（W0053）：`app/api/contacts/import/handlers.ts:96` → `features/contacts/import/service.ts:203`；路由 `POST/GET /api/contacts/import`、`GET/PATCH /[id]`、`GET/PATCH /[id]/rows`、`POST /[id]/commit`、`POST /[id]/cancel`、`GET/POST /events`；`kind = csv | vcard | event`，`format = linkedin | generic | vcard | event`；上传是原始请求体 + 头（`x-orbit-import-kind`、`idempotency-key`、`x-orbit-import-file-name`，`import/handlers.ts:136-149`），不是 JSON / multipart；服务端不解 ZIP；`commit` 要求合并逐条确认（否则 `MERGE_NOT_CONFIRMED`）；`commitNextChunk` 每块 ≤200 行，create 行 `saveContact`、merge 行 `mergeCardIntoContact`；查重 `dedupe.ts:59` `reviewImportRows`；表 `contact_import_batches / rows / followups`；commit 后 `runConfiguredImportLayers` → 新联系人入队计划候补（`new-contact-layers.ts:172`）。类型只在 `features/contacts/import/types.ts`（Web 独有），**没有共享契约**。
2. **Web 旧界面**：`contacts/network-0918/network-import{,-file,-event,-client,-styles}.tsx|ts`（R12 后作为 `?method=csv|contacts|event` 的临时落点），允许清单 4 行。
3. **App**：没有任何导入界面；有 `expo-document-picker`、`expo-file-system`；**没有** `expo-contacts`。
4. **契约 3**（`shared/contract/contact-completion.ts`，R08，负责人甲 R16）：`ContactCompletionQuestion`、`ContactCompletionAnswerInput`、`ContactCompletionResult`；路由 `GET /api/contacts/completion-question`、`POST …/[id]/answer`、`POST …/[id]/skip`，live 503；mock fixture `demoCompletionQuestion`。
5. **联系人字段写入**：`contact_detail_states` 只存标签、状态、备注、最近互动（`contact-live-record-provider.ts:210-227`）；公司在 `contacts` 记录的 payload，相遇活动是 payload 的 `metEventId`；R12 的 `applyContactFieldValues` 可按字段写 payload 并记历史。浓度纯函数 `shared/compute/contact-density.ts`（R12）。
6. **活动参加记录**：出题选项「同一时期参加过的活动」从现有参加记录读（R26 的数据，只读）。

## 上下文包

### 必读
- DESIGN §2.7、§2.8、§3.3、§4.3、§8、§9；共享笔记 `add-invite-design-extract.md` §3（連絡先 4 屏、LinkedIn 4 屏、A7）、§1.3（Web 右栏今日の 1問）。
- 设计稿：`b9-import-plan-v2.html` A2 ①–④、A3 ①–④、A7；`web.html` 人脈右栏「今日の 1問」；`b1-onboarding-cards.html` B3（Web 其他门）。
- 代码：`features/contacts/import/**`、`app/api/contacts/import/**`、Web `network-0918/network-import*`、R12 的まとめて確認组件（两端）、`features/redesign-contracts/*`、`shared/api-schema/contact-completion.ts`、`shared/mock/demo-world/fixtures.ts`。

### 关键符号与 impact（开工时重跑）
- `createContactImportService`、`createContactImportHandlers`：**不改行为**；如需给 App 提供一个「整理中」的进度字段，只加可选字段，REPORT 写 impact。
- `reviewImportRows`（查重）：只调用；R12 统一的 `findContactCandidate` 口径与它不同处列进 REPORT（导入保留自己的「转职不统合」规则，DESIGN §2.7）。
- `NetworkImport`（LOW 1）及 `network-import*`：删除前文本确认调用方（R12 后只剩 `/app/contacts/new?method=…` 与审计脚本）。
- `redesign-contracts` 的 `contact-completion`：加 live。
- App 原生依赖 `expo-contacts`：加依赖、`app.config.ts` 的 `infoPlist` 权限文案（`NSContactsUsageDescription`），重建开发包。
- Web 新依赖 `fflate@0.8.2`（纯 JS，浏览器里解 LinkedIn ZIP）。

### 易错边界（全部写进 SC）
通讯录全量上传（应只上传选中的人）；预选把家人 / 店铺选上或把有公司邮箱的人漏掉且没有依据；权限被拒后反复弹；vCard 转换丢了公司 / 职位 / 多个电话；LinkedIn ZIP 里找不到 CSV 时报错不清楚；列对应改了没生效；重复里公司不同的同名人被自动统合；「全部加入」时合并没确认导致 `MERGE_NOT_CONFIRMED`；完成页人数与人脈变化不一致；导入的人没进计划候补；每天一问一天出两题、东京日边界算错；答案写错地方（公司没进 `organization`、活动没进 `metEventId`）；说成「答了浓度一定上升」；「明日」被计成跳过；连续跳过 3 次后还问；选项里出现编造的活动；任一端答了另一端仍显示；他人的问题能被答；示例模式写库。

## 契约（第一天提交）

- 新 `shared/contract/contact-import.ts` + `shared/api-schema/contact-import.ts`：`ContactImportBatchView`（id、kind、format、status、counts{ total, duplicates, needsReview, ready, committed }、mapping?）、`ContactImportRowView`（行号、字段、问题列表、查重候选、决定）、上传头常量 `CONTACT_IMPORT_UPLOAD_HEADERS`（请求体是文件原文）、`ContactImportMappingInput`、`ContactImportRowDecisionInput`、`ContactImportCommitResult`——**只描述现有 HTTP 响应**（以 `features/contacts/import/types.ts` 和 handler 为准，先写 parity 测试再定稿）。响应宽进、请求严格。
- 契约 3 只加：`ContactCompletionQuestion` 可选 `contactName / contactSubtitle / sourceChip / kind`（`kind` 宽进兜底 `met_where`）；`ContactCompletionResult` 可选 `densityAfter`；`askedOn` 注释改为东京日。
- `shared/compute/work-contact-likelihood.ts`、`shared/compute/completion-question-rules.ts`、`shared/compute/vcard-build.ts`（App 端把通讯录条目转 vCard 3.0 文本的纯函数，与服务端解析器互为往返测试）。
- 快照、parity、App 同步、fixture 进 `demo-world-consistency`。

| 接口 | 说明 |
| --- | --- |
| `/api/contacts/import/**`（现有） | App 开始使用；Web 新界面使用；行为不变 |
| `GET /api/contacts/completion-question`（live） | 今天的题（东京日）或 null；没有就按规则生成（每天最多 1 题），同一天重复请求返回同一题 |
| `POST /api/contacts/completion-question/[id]/answer`（live） | 按 DESIGN §2.8 写：活动 → `metEventId`；紹介 / 前職の同僚 → 联系人备注「出会い：…」一行；公司 → `organization`（`applyContactFieldValues`，旧值进历史）；覚えていない → 只记在问题上；返回按 D-10 重算的 `densityAfter`、`next = null`（一天一题） |
| `POST /api/contacts/completion-question/[id]/skip`（live） | `skipCount + 1`；同一人连续 3 次后不再出；今天不再出题 |

## 范围与文件

- **新建（服务端）**：`features/contacts/completion/{service,repository,configured}.ts`（集合 `contactCompletionQuestions`，规则见 DESIGN §2.8）；`redesign-contracts/service-factory.ts` 加 live。
- **新建（Web）**：`app/(app)/app/contacts/new/import/page.tsx`（选门：連絡先 vCard / LinkedIn / CSV / イベントから）、`app/(app)/app/contacts/new/import/[importId]/page.tsx`（列对应 → まとめて確認 → 完成）；`orbit-2026/add/import/`；`orbit-2026/add/CompletionQuestionCard.tsx`（+ 展示页一项）；`AddContactDoors` 打开その他门。
- **新建（App）**：`app/contacts/new/import.tsx`（連絡先 / LinkedIn 选择 + 说明 + 权限）、`app/contacts/new/import/[importId].tsx`；`src/screens/add/import/**`；`src/screens/add/CompletionQuestionCard.tsx`（+ 展示页一项）；`AddContactSheet` 打开その他项。
- **依赖**：App `expo-contacts`（Expo SDK 57 对应版本），权限文案；重建模拟器开发包。
- **删除（Web）**：`network-0918/network-import.tsx`、`network-import-file.tsx`、`network-import-event.tsx`、`network-import-client.ts`、`network-import-styles.ts`（逐个确认调用方）与允许清单行、审计脚本引用；`/app/contacts/new?method=csv|contacts|event` 与 `?import=<id>` 改为 redirect 到 `/app/contacts/new/import…`（`?import=` 带到 `/import/<id>`；旧链接：R28 `start-step-cards.tsx:15`、R11 `analysis-threshold.ts:67-68`、`network-shell.tsx` 用的 `?method=csv` 继续可用，不改别人的文件）。
- **登记**：两端新路由（App 4 处，Web 审计计数）、`screen-ownership.md` Web `/app/contacts/new` 行改「已处理」。
- **不做**：Google 通讯录 OAuth（vCard 文件代替）；Eight 专用格式（按汎用 CSV 处理）；人物页的转职冲突提示（R11 详情）；把每天一问挂到 To-do / 人脈右栏 / 首页（R20 / R11 / R10）。

## 测试

- `vcard-build.test.ts`：通讯录条目（多电话、多邮箱、公司、职位、日文姓名读音）→ vCard → 服务端解析器往返一致。
- `work-contact-likelihood.test.ts`：表驱动（公司名、公司域名邮箱 vs 免费邮箱、职称关键词、「母」「〜店」「病院」排除），依据键正确。
- `contact-import-contract-parity.test.ts`：现有 handler 响应过新 schema（每种 kind / format 一份 fixture）。
- App 渲染：权限说明 / 被拒、选人页预选与筛选、实时人数、整理中、まとめて確認（复用 R12 组件，导入数据）、完成；LinkedIn 说明页 + 选文件。
- Web 渲染：四个门、上传、列对应改映射、ZIP 自动解压提示、重复里转职默认不勾、全部加入（逐条确认合并后 commit）、完成。
- `completion-question.test.ts`（内存 + Postgres）：每天最多一题、同天重放同题、东京日切换、四种回答各写到正确位置（`metEventId` / 备注行 / `organization` + 历史 / 只记问题）、`densityAfter` 按 D-10 重算（有邮箱的人答了「どこで」升到 ●●○，没邮箱的不变）、「覚えていない」算答、skip 计数与 3 次停止、「明日」不计判断待ち、选项只来自真实活动 / 公司 / 固定项、他人隔离、示例模式拦写。
- 端到端：Web Playwright「上传 LinkedIn 样例 CSV（含 2 重复、1 要確認）→ まとめて確認 → 全部加入 → 人脈 +N」；App 渲染测试「通讯录 3 人（1 家人、1 店铺、1 工作）→ 预选 1 人 → 导入」。
- 门禁同 R12。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R16-01 連絡先 | App：说明 → 权限（含被拒）→ 选人（规则预选 + 依据 + 筛选 + 实时人数）→ 整理中 → まとめて確認 → 完成；只上传选中的人；Web：vCard 上传同流程 | 渲染 + 端到端 + 截图（b9 A2 ①–④） |
| SC-R16-02 LinkedIn / CSV | App 说明 + 选 CSV；Web 拖放 CSV / ZIP → 列对应（可改）→ まとめて確認（重复：转职默认不统合；要確認按类型）→ 全部加入 | 渲染 + 端到端 + 截图（b9 A3 ①–④） |
| SC-R16-03 イベントから | Web 选活动 → 同一确认页 → 加入 | 渲染测试 |
| SC-R16-04 一致性 | 完成页数字 = 人脈变化；导入的新联系人入队计划候补；来源 chip 正确（連絡先 / LinkedIn / CSV） | 服务 + 端到端 |
| SC-R16-05 每天一问 | 契约 3 live：规则全部（每天一题、东京日、回答写到正确位置、这个人的信息多一项、浓度按 D-10 重算、覚えていない、明日、跳过 3 次停止、选项有据）；两端卡片组件在展示页可用 | `completion-question` + 渲染 + 截图（b9 A7） |
| SC-R16-06 旧导入页已删 | `network-import*` 删除、允许清单只减不增、`?method=` 与 `?import=` 旧链接 redirect、`screen-ownership.md` 加人行全部「已处理」 | 测试 + 点击验证 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01–05 | 截图对照页：b9 A2 ①–④、A3 ①–④、A7 ↔ 实现，浅色 / 深色；App 用内置模拟器（通讯录用模拟器自带联系人） | `~/orbit-sprint-evidence/redesign/R16/run-01/compare.html` |
| 全部 | 三语、`copy:qa` 0、门禁零新增；两端全量零新增失败；`tsc`、`typecheck:app`、`lint`；`detect-changes` | 全量清单 |

## 执行顺序

1. 索引、impact；契约（先写导入 parity 测试确认现有响应形状）提交。
2. 纯函数（vCard、预选、出题规则，RED 先行）→ 每天一问服务与 live。
3. Web 导入四门与确认 → 删旧组件与 redirect。
4. App 依赖与开发包重建 → 連絡先 → LinkedIn。
5. 两端 `CompletionQuestionCard` 与展示页。
6. 全量、REPORT、`detect-changes`、提交推送；独立复核 → 修复 → 模拟器走查。

## 失败与交接

- `expo-contacts` 构建失败：App 連絡先改为「从『ファイル』选 vCard」（与 Web 同一路），REPORT 写明，下次能构建再换。
- 交接给 R20 / R11 / R10：`CompletionQuestionCard` 的挂载方式与接口；给 R11：导入来源的 `sourceChip`（`phone` / `linkedin` / `manual`）与转职冲突提示的数据（导入行的旧值 / 新值）。
