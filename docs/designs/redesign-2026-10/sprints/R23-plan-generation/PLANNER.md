# Sprint R23 — 计划 v2.2：生成流程与 AI

**Plan revision:** 1。**模式:** existing-codebase / single-generator（执行人：小雨（甲））。**档位:** H。
**单一目标:** 目标入力空态（两端）、生成流程（背景 → ≤5 问 → 前提 → 初版 → AI 修正 ≤3 → 手動編集 1 → 確定，两端）、intake / draft 接口与 AI 调用 C1–C7（mock 先行）、业界现状库第一批条目与独立审核。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v2.2/DESIGN.md](../plan-v2.2/DESIGN.md)（§2.1–2.4、§5、§6、§7）。
**基线:** R22 收口后的 `redesign` HEAD。
**进入条件:** R22 done（迁移在本机、`PlanV2Service.createPlanFromDraft`、`shared/compute/plan-templates` / `plan-allocation`、契约正式版）。真实 AI 调用需要用户对 C1–C7 的授权（DESIGN §10 第 1 项）；**没有授权就全程 mock 收口**，授权后补做本机验证并追加到 REPORT。「每人每月最多新建 10 个目标」等用户拍板（DESIGN §10 第 4 项）；未拍板前按推荐值 10 实现（一个常量，可改）。
**分支:** 同 R22。

## 已查清的事实（按 `fe896414`）

1. **现有生成管线**：`features/plans/ai-generator.ts`（`plan-ai-2026-10-v1`，两阶段：骨架 + 前 2 阶段细化 + 快照，`purpose: plan`、`max_calls: 4`，id 用短期别名、解析层丢弃编造的别名、超时 90s）；`generator.ts` 的 `runPlanGeneration` 是唯一结算者；开关 `ORBIT_PLAN_GENERATOR`（默认 mock）。`createAiPlanGenerator` LOW 7。
2. **输入裁剪**：`input-selector.ts`（联系人 ≤200）、`input-source.ts`；快照判定 `decideSnapshotRefresh`（HIGH 13，只调用）。
3. **调用工具**：`deepseekJsonChat`（HIGH 7，只新增调用点）、`features/ai-quota/gate.ts`（`reserve` / `beginCall` / `endCall`）、R22 新增的 `countMonthly`。
4. **入口现状**：Web Task › プラン 插槽 `app/(app)/app/agent/plan/plan-slot.tsx`（`loadPlanSlot`，LOW 1）：有 v1 计划 → `IOrbitPlan`，没有 → 「目標を決める」空态去 `/app/start` 或 `/app/agent`；App `src/screens/task/TaskScreen.tsx` 的 `PlanSlot`（「即将上线」Toast）。
5. **组件**：App `src/components/ui/**`（Button、ListRow、BottomSheet、Toast、States、Icon、AI 类组件），Web `orbit-2026/ui`（Modal、Drawer、Popover、Table、EmptyState…）；iOrbit 新界面归 R21（乙），本 Sprint 不依赖它。
6. **手动建联系人**：`/api/contact-drafts/manual`（「人脈にも登録する」用）。

## 上下文包

### 必读
- DESIGN §2.1–2.4、§3.2（`plan_intakes`、`plan_drafts`、`plan_flow_commands`）、§5（C1–C7 全部列）、§6、§7、§9 #3 #4 #6 #9 #17 #19。
- 设计稿：`b10-plan-example.html` ①–⑥ 全部画板与「8 · 规范板」；`app.html` / `web.html` 的「Task · プラン（目標入力）」；`b4-plan-iorbit.html` B4「実行後のフィードバック」（确认卡、失败卡样式）。
- 代码：`features/plans/{ai-generator,generator,input-selector,input-source}.ts`、`features/ai/deepseek-json-chat.ts`、`features/ai-quota/gate.ts`、R22 的 `features/plans/v2/**`、`shared/compute/plan-*`。
- HOW-TO §1–§8（组件、壳、文案、路由登记、截图）。

### 关键符号与 impact（开工时重跑）
- `loadPlanSlot` LOW、App `TASK_SLOTS` UNKNOWN（文本确认只在 `TaskScreen.tsx`）：只替换「没有计划」分支，有 v1 计划的分支不动（R25 处理）。
- `createAiPlanGenerator` LOW：不改；v2 新建 `createAiPlanV2Generator`。
- `deepseekJsonChat` HIGH：只新增调用点。
- 新路由的登记位置（HOW-TO §7）：Web `ORBIT_PRIVATE_APP_PREFIXES`、审计清单、产品清单、`shell-routes.ts`；App 4 处 + `parentForPath`。

### 易错边界（全部写进 SC）
用户每改一项就调一次 AI（只有 C1–C7 各自的触发点可以调）；碰到日 / 月上限时显示失败卡而不是「上限」说明（DESIGN §5.3）；「空き」被做成 AI 调用；AI 选了题库外的题、编了字典外的短名、引用了库外或过期条目、配点不是 5 的倍数或合计不是 100、相对模板改了超过 2 处或超过 ±5；AI 输出里带了别人的联系人 id；同一请求重放又调一次 AI（重复计费）；失败的调用被计次；第 3 次「不改」没计次；修正次数用完仍能提交；改前提后初版重做却扣了修正次数；手动编辑后合计不是 100、余数没给最后 1 人；确定时半成品进了 `plans`；确定后 v1 计划没被归档、或同时出现第 3 个生效目标；手写成员被建成联系人（没勾「人脈にも登録する」时）；示例人物类型卡被写库；mock 在生产模式出现；C2 月上限用尽时报错而不是提示。

## 契约（本 Sprint 定稿，REPORT 交接）

`shared/contract/plan-v2.ts` 只加不改（新增类型）：`PlanIntakeView`（status、goal、goalKind、background 三块的下书值 / 确认值、空き、ladder、questions、answers、premise、`aiSteps` 状态、`limits`）、`PlanDraftView`（content、originContent、aiFixLeft、manualEditAvailable、turns[{ input, changes[], unchanged[], noChangeReason? }]、revision）、请求体（strict）。

| 接口 | 说明 | AI |
| --- | --- | --- |
| `POST /api/agent/plans/goal-kind` | `{ text }` → 推测的类型（每人每东京日 ≤20 次，超出或失败用关键词规则） | C1（缓存：同文不重调） |
| `POST /api/agent/plans/intakes` | `{ goalText, goalKind, source, idempotencyKey }` → intake + 发起背景下书；返回 `href` | C2 |
| `GET /api/agent/plans/intakes`、`GET …/[id]` | 未完成的流程列表（R21 可选用）/ 单个 | — |
| `PATCH …/intakes/[id]` | 逐块确认（`block: 'me' \| 'team' \| 'purpose'`，`expectedUpdatedAt`） | — |
| `POST …/intakes/[id]/members` | 从人脈加成员（推定能力）/ 自己写（不调 AI；`alsoAddToNetwork` 才建联系人） | C3（仅人脈から） |
| `POST …/intakes/[id]/ladder` | 改「やりたいこと」后重算阶梯（每 intake ≤3） | C4 |
| `POST …/intakes/[id]/questions` | 选题（缓存键 = 类型 + 背景规范化摘要，按人） | C5 |
| `POST …/intakes/[id]/answers` | 一次提交回答 → 前提 | — |
| `PATCH …/intakes/[id]/premise` | 改前提的某一行（之后初版需重做，不计修正次数） | — |
| `POST …/intakes/[id]/draft` | 生成初版 → `plan_drafts`（kind initial）；人物类型带 `introRoutes`（从输入联系人里挑，DESIGN §2.6） | C6 |
| `POST /api/agent/plans/drafts/[id]/fix` | AI 修正（≤3，不改也计） | C7 |
| `POST …/drafts/[id]/manual-edit` | 手动编辑（一次提交全部变更；`plan-allocation` 回流；1 次；带 `expectedRevision`） | — |
| `POST …/drafts/[id]/reset` | 「元に戻す」恢复到 AI 方案（只在手动编辑页） | — |
| `POST …/drafts/[id]/confirm` | 确定 → `createPlanFromDraft`（R22）→ 返回 `planId` 与 Task › プラン 地址；生成时没用过手动编辑的，确定后保留 1 次（`manual_edit_available`） | — |

全部要登录、带 `idempotencyKey`（回执 `plan_flow_commands`）；mock 模式返回演示世界的流程数据（b10 佐藤 健一的例子改写成演示世界人物，不出现真实人名）。

**给 R28 的入口**：`POST /api/agent/plans/intakes` 带 `source: 'onboarding'` → `{ intakeId, href }`；引导页拿到 `href` 跳过去即可。

## 业界现状库（D-06）

- `features/plans/landscape/{entries,store,types}.ts`（DESIGN §6 的字段）；`store.ts` 唯一读函数 `publishedEntriesFor({ goalKind, industries, now })`：只返回 `published` 且 `updatedOn` 在 12 个月内的条目，最多 12 条。
- 第一批：6 类目标各约 4 条，共约 24 条；**每条有可查证的公开出处**（官方统计、上市公司公开资料、行业协会报告、主流媒体），三语标题与要点；没有可靠出处的不收录。设计稿里的示例条目不照抄。
- 独立审核（Q7）：交 **Codex** 只读核对事实、出处可访问、日期、三语一致；Codex 不可用时起一个全新上下文的 AI 复核会话（不看本会话的推理）代替，REPORT 写明原因。结论写 `features/plans/landscape/REVIEW.md`；执行人逐条处理并在 REVIEW 末尾追加处理记录；只有审核通过的条目改 `published`。
- 测试：`landscape-entries.test.ts`（字段完整、id 唯一、checksum 与内容一致、过期条目不返回、`retired` 不返回、每类目标至少 3 条 published——REPORT「已知例外」里列出的类别除外，测试从同一份例外常量读取）。

## 范围与文件

- **新建（服务端）**：`features/plans/v2/{intake-service,draft-service,flow-commands}.ts`；`features/plans/v2/ai/{goal-kind,background,members,ladder,questions,first-draft,fix}.ts`（每个一对 `ai` / `mock` 实现 + zod 输出 schema + 业务校验）；`features/plans/v2/ai/prompts/*.ts`（提示词版本常量 `plan-v2-…-2026-11-v1`；系统方针 v4、6 类模板）；`features/plans/v2/validate-content.ts`（DESIGN §5.2 C6 校验列）；`features/plans/landscape/**`；上表路由 + handlers。
- **新建（Web）**：`app/(app)/app/plans/flow/[intakeId]/page.tsx`、`app/(app)/app/plans/drafts/[draftId]/edit/page.tsx`（与 App 同路径，`route-parity` 不需要例外）；`app/(app)/app/orbit-2026/plan/`（目标入力、流程页、背景三块、团队表、成员添加 Modal、阶梯、5 问网格、前提卡、方案卡、差分卡、修正栏、手动编辑表、右栏「わかったこと / 方案の下書き」，CSS Modules）；文案 `orbit-2026/copy/plan.ts`。
- **新建（App）**：`app/plans/flow/[intakeId].tsx`、`app/plans/drafts/[draftId]/edit.tsx`；`src/screens/plan/**`（同上各块，BottomSheet 版成员添加）；字典域 `src/i18n/{ja,zh,en}/plan.ts`（HOW-TO §6 的登记）。
- **修改**：Web `agent/plan/plan-slot.tsx` 的「没有计划」分支 → 新目標入力（有 v1 计划的分支不动）；App `TaskScreen.tsx` 的 `PlanSlot` → 新目標入力（没有计划时）与「已确定」最小卡（有 v2 计划时，R24 替换）；`features/ai-quota/constants.ts` 的 `AI_QUOTA_MAX_CALLS` 补 C1–C7 的值；路由登记（HOW-TO §7 两端全部）；题库、必要な力的三语文字已由 R22 放在 `shared/compute/plan-template-copy.ts`，本 Sprint 只引用。
- **测试**：
  - 每个 AI 步骤：mock 确定性、zod 拒绝非法输出、业务校验拒绝（题库外题、字典外短名、库外 / 过期引用、配点不合规、±5 超限、外来别名、紹介ルート带无据人数）、修复重试 1 次后失败降级、失败 `released` 不计次、同键重放不再调用（断言 0 次 HTTP）、日上限与月上限用尽时显示「上限」说明（轻量调用静默改用规则）、计划生成流程不占 10 次总熔断；
  - `intake-flow.test.ts`：三块必须按顺序确认、未确认不能选题、改「やりたいこと」才重算阶梯、空き由规则计算（断言 0 次 AI）、手写成员不建联系人（除非勾选）；
  - `draft-flow.test.ts`：修正 3 次后第 4 次 409、第 3 次「不改」也计次、改前提重做初版不扣修正次数、手动编辑合计 100 与余数规则、只能 1 次、`reset` 恢复、确定后写入 `plans` 且归档 v1、第 3 个生效目标被拒绝（409 `PLAN_GOAL_LIMIT`）；
  - 两端渲染测试：目標入力（chip 推测与修改、示例卡不发请求）、背景三块顺序、团队表付け外し与空き、5 问一次提交、前提行编辑、方案卡依据展开、差分卡、修正栏计数与禁用、手动编辑合计条；
  - 端到端（mock）：Web Playwright 与 App 渲染测试各一条「空态 → 确定」主路径；
  - `landscape-entries.test.ts`；路由登记相关的审计计数测试按 HOW-TO §7 更新。
- **不做**：プラン概要的完整版、人物タイプ詳細、计分界面（R24）；見直し、達成、多目标切换界面（R25）；删除任何旧屏；生产迁移；改 iOrbit 的会话存储（R21）。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R23-01 目標入力 | 两端没有计划的用户打开 Task › プラン：一句话输入、6 类 chip（停顿后推测默认值，可改）、流程预告、示例卡（不写库）；点「iOrbit と具体化する」进入流程页 | 两端渲染测试 + 截图 |
| SC-R23-02 背景确认 | 下书骨架 +「読んでいるもの」；わたし / チーム / 目的 按顺序确认；团队表付け外し后空き即时变（无 AI）；人脈から加成员能力被推定、自分で書く不调 AI 不建联系人；阶梯原文在第 2 级、建议级可改；三块确认后才出现「質問へ」 | `intake-flow` + 渲染测试 + 截图（App 逐块、Web 一屏 + 右栏） |
| SC-R23-03 5 问与前提 | ≤5 问、每题标题库编号、「?」选题理由、一次提交、空题标「推測」；前提每行标出处、可改；同类同背景再来一次得到同题同序 | 测试 + 截图 |
| SC-R23-04 初版 | 方案卡五部分齐全，配点合计 100、短名来自字典、引用可展开且都是已发布条目；文中 ①② 与引用对应；没有引用的结论不带数字 | C6 校验测试 + 截图（App 收起 / Web 展开） |
| SC-R23-05 修正与手动编辑 | 修正差分 + 变わらない点；计数 3→2→1→0，第 3 次不改也扣，用完禁用；手动编辑改名 / 排序 / 增删 Step、人数 / 配点 / 移除类型，合计始终 100，余数给最后 1 人，只 1 次，可「元に戻す」 | `draft-flow` + 渲染测试 + 截图 |
| SC-R23-06 确定 | 确定后 `plans` 多一份 v2 生效计划（含人物类型条目、イベント枠），v1 被归档，Task › プラン 显示「已确定」卡；重复点确定只建一份；第 3 个目标被拒绝并提示 | 服务测试 + 端到端 |
| SC-R23-07 AI 规矩 | C1–C7 每项：mock 确定性、输出校验、失败降级、幂等重放 0 次 HTTP、失败不计次、日 / 月上限的提示（不是失败卡）；授权后每项真实调用 ≤5 次，REPORT 附 operationId 与成本子账 | 各 AI 测试 + REPORT 调用记录表 |
| SC-R23-08 业界现状库 | 每类 ≥3 条 published，每条有可访问的公开出处与日期，三语齐全；独立审核 REVIEW 与处理记录齐全；过期 / retired 不被引用 | `landscape-entries` 测试 + `landscape/REVIEW.md` |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 02–05 | 截图对照页：b10 ①–⑥ 每个画板 ↔ 实现，浅色 / 深色；Web 1440 / 1024 / 390（1024 / 390 没有专门画板的按断点规则，DESIGN §7），App 模拟器 | `~/orbit-sprint-evidence/redesign/R23/run-01/compare.html` |
| 07 | 「每改一项就调 AI」不存在：渲染测试里记录 fetch，确认只有设计允许的触发点发出 AI 请求 | 测试断言 |
| 全部 | 界面文字三语、`copy:qa` 0、写死文字门禁零新增；新代码不用 Ionicons；Web 新样式只在 `[data-orbit-2026]` 且无十六进制颜色 | 门禁测试输出 |
| 全部 | 两端全量对照基线零新增失败；`tsc`、`typecheck:app`、`lint`；`detect-changes` 写进 REPORT | 全量清单 |

## 执行顺序

1. 基线、impact；读设计稿把 b10 ①–⑥ 每个画板列成清单（截图对照页的骨架）。
2. 服务端：intake / draft 服务与回执（mock AI 先行，测试 RED → GREEN）。
3. 校验器与 6 个 AI 步骤的 mock + 真实实现（真实实现只写不跑，等授权）。
4. 业界现状库撰写 → 交 Codex（或独立 AI 会话）审核 → 处理意见 → 发布。
5. Web 界面（目標入力 → 流程页 → 手动编辑），再 App 界面。
6. 端到端（mock）、截图对照页。
7. 若已授权：本机真实调用验证（每项 ≤5 次，记录 operationId、token、成本）。
8. 全量、REPORT。

## 失败与交接

- 设计稿与 DESIGN 冲突：以设计稿定稿为准，改 DESIGN 并在 REPORT 写明；涉及次数、计分口径的停下来问。
- 真实 AI 在本机验证时输出质量不够（例如短名选错、引用对不上）：只改提示词版本号重试，仍不行就记进 REPORT「已知例外」，**不放宽校验器**。
- 某类目标找不到 3 条有可靠出处的条目：该类先少于 3 条发布，初版对这类目标多用「一般論」，REPORT 写明，不编。
- REPORT 交接：给 R24 的「已确定」卡位置（R24 替换）；给 R25 的草稿服务（kind `review` 复用 fix / manual-edit / confirm）；给 R28 的入口；给 R21 的未完成流程列表接口；C1–C7 的授权状态与真实调用记录。
