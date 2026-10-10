# Sprint R23 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（全新上下文，没有参与写作，没看执行会话的推理），2026-10-10。
**对象：** `d2f744af`（契约）、`504a9250`（服务端、AI C1–C7、校验器、业界现状库）、`54911ac0`（两端界面、路由登记、REPORT）。文中行号都按 `54911ac0`。
**依据：** PLANNER（修订 1，SC-R23-01～08 与必需证据子表）、GOAL、UI-SPEC、`plan-v2.2/DESIGN.md`（§2.1–2.4、§3.2、§5、§6、§7、§9、§10）、`sprints/README.md` 通用规则（尤其规则 10）。REPORT 只当线索：下面每条结论都来自复核人重跑测试、重读代码，或在 scratchpad 里写临时探针（内存仓储 + 本机 `orbit_test`，用完已删）。
**没有做的事：** 没连 Neon 或任何云端库，没读 `.env`，没部署，没调付费 AI，没跑两端全量测试，没重跑 GitNexus `detect-changes`。
**注意：** 复核期间工作区里有另一个会话在做 R24（已提交 `b16f3be7`，另有未提交的 `v2/service.ts`、`repository.ts`、`flow-service.ts` +7 行 `afterConfirmed` 等改动）。R23 的流程服务、AI、校验器、业界库、两端界面文件相对 `54911ac0` 没有被改动，不影响下面的结论；重跑的测试跑在当时的工作区上。

## 结论：有条件通过

已经做到、复核人独立核实过的部分：
- **整条流程能走通，两端一致。**
  - 目標入力 → 背景三块 → ≤5 問 → 前提 → 初版 → AI 修正 → 手動編集 / 確定，服务、路由、Web、App 四层都有测试，复核人重跑全部通过（81 + 17 + 24 条，见「复核人做了什么」）。
  - 契约两份副本在 `54911ac0` 逐字一致；`contract-snapshot` 一致；两端 `tsc` 0；`copy:qa` 1003 条 0 问题。
- **主路径上的幂等与计次是对的。**
  - 同键重放 `createIntake` / `fix` / `makeDraft` 不再调 AI；同键不同内容 409。
  - 修正 3 次后 409 `FIX_LIMIT`；第 3 次「不改」也计；失败不计；改前提作废初版、不扣修正次数；手动编辑只一次、合计 100、5 分一档。
  - 确定按草稿 id 幂等：三个并发确定只建一份（Postgres 测试）；v1 被归档；第 3 个生效目标被拒；没用手动编辑时 `manual_edit_available = true`。
- **他人数据隔离成立。** 复核人在 `orbit_test` 上写探针：bob 读不到 alice 的 intake / draft，对它们 `editPremise` / `makeDraft` / `fix` / `confirm` / `manualEdit` / `addMembers` 全部 404，且 0 次 AI；两人用同一个幂等键互不影响。live 的联系人读取都带 `workspace_id + user_id` 归属谓词。
- **id 不出境成立。** 探针把带 `contact:SECRET-*` id 的联系人送进 C2 / C3 / C5 / C6 / C7，所有 AI 输入里都没有联系人 id、intake id、draft id；紹介ルート的别名回来后正确映射回联系人 id。
- **账本记账正确、REPORT 的真实调用记录对得上。** 12 个 operationId、15 次有响应的 HTTP、输入 19,615 / 输出 12,278 token、约 $0.021，复核人按证据目录逐行核算一致。C6 校验器确实拦下了 3 次不合格输出，没有放宽。
- **业界现状库与审核记录一致。** 16 条里 14 条 published、2 条 draft；每类 ≥3（fundraising 3、launch 5、sales 4、hiring 4、partnership 3、career 5），与 `landscape/REVIEW.md` 处理记录逐条对得上；Codex 三轮原文在证据目录。

但有 **7 条中等**、**18 条轻微**，没有严重问题：
- **M1** 背景「もう一度」同键重放会再调一次 AI，然后报 409（探针证明）。
- **M2** 账本回答「busy」（同键操作还在跑，或同键早已成功）被当成失败降级写回，抢先覆盖真结果（探针证明）。
- **M3** C7 没有「只改允许的路径」校验；差分不显示引用、聞くこと、Step 关联类型等变化，这些变化可能被标成「今回は変更しません」（探针证明）。
- **M4** 「人脈にも登録する」在事务外建联系人：请求失败会留下孤儿联系人，同键并发会建两张（探针证明）。
- **M5** 面谈记录摘要从没送进 C2 / C3（`notes` 恒为 null），界面却写「名刺・面談メモから」；REPORT 没披露。
- **M6** live 没设 `ORBIT_PLAN_V2_AI` 时用 mock AI 给真实用户生成演示内容，没有守卫也没有测试（PLANNER 易错边界「mock 在生产模式出现」）。
- **M7** `plan_background` 月上限从 10 改成 20，超出了 DESIGN §10 第 1 项按 §5.4 授权的每用户月上限，没有先问；DESIGN 也没同步。

**通过条件：**
1. 修 M1–M4（服务端逻辑，各补一条测试；复核人的探针写法见「复核人做了什么」）。
2. M5 二选一：把面谈记录摘要接进 C2 / C3（≤5 人，别名化），或把界面文案改成「名刺から」并在 REPORT「自定决定」写明。
3. M6：live 且没配置真实 AI 时不要静默用 mock（建议返回 `AI_FAILED` / 走规则降级，或入口按开关隐藏），补测试；或者由产品负责人明确接受「生产默认 mock」，写进 REPORT 与 DESIGN。
4. M7：把「C2 成本上限 10 → 20」列进待授权清单请产品负责人确认（金额很小，但属于付费 AI 授权口径），确认后改 DESIGN §5.3 / §5.4。
5. C6 提示词 v3 的本机验证需要再授权（REPORT 已知例外已写），在那之前不能上 staging。

R24 在 mock 上的开发不受这些问题阻塞，可以继续。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 目標入力 | ✅ | 重跑两端渲染测试：800ms + ≥6 字才推测、手选 chip 不被覆盖、示例卡 0 请求、余量 0 / 已有 2 个目标时提前禁用、作りかけ继续。读 `PlanGoalEntry.tsx` / `PlanGoalInput.tsx` 属实。截图 `web/goal-*`、`app/goal-*` 在证据目录 |
| 02 背景确认 | ⚠️ | `intake-flow` 通过：一次 AI 下书三块、按顺序确认、`STALE`、勾选 0 次 AI、手写成员默认不建联系人。<br>问题：同键重放「もう一度」重复调 AI（M1）；busy 覆盖真结果（M2）；建联系人不在事务里（M4）；C2 / C3 没有面谈记录输入（M5）；App 立场默认预选「代表」（m9） |
| 03 5 問与前提 | ⚠️ | ≤5、题库内、同类同背景命中缓存（0 次 AI）、空题标推測、前提每行出处，测试通过。<br>问题：两次点击并发时 busy 的那次把规则选题写进去（M2，探针 P3）；缓存键随界面语言变化（m5） |
| 04 初版 | ⚠️（真实 C6 未通过，已披露） | mock 下五部分齐全、合计 100、短名在字典、引用都是已发布条目，测试通过。<br>校验器覆盖 DESIGN §5.2 C6 列的大部分，少两处细节（m3）；`industries` 恒为空，行业优先没生效（m4）。<br>真实 C6 本机 3 次操作都被校验器拦下（复核人看了账本与日志，属实），v3 未验证 |
| 05 修正与手动编辑 | ⚠️ | `draft-flow` 与两端渲染测试通过：计数 3→0、不改也计、失败不计、合计条、余数、只一次、元に戻す。<br>问题：C7 可以改任何路径、差分看不见（M3）；手动编辑接受 0 点的人物类型（m1） |
| 06 确定 | ✅ | `draft-flow` + `plans-v2-flow-postgres`（含三个并发确定只建一份）+ `plan-flow-routes` 通过；复核人读 `createPlanFromDraft` 确认 v1 归档、第 3 个目标拒绝、`creation_key` = 草稿 id。半成品不进 `plans` |
| 07 AI 规矩 | ⚠️ | mock 确定性、zod + 业务校验、修复 1 次、`plan_intake` 不修复、上限与 busy 0 次 HTTP，测试通过；id 不出境由探针 P7 确认。<br>问题：M1、M2、M6；失败的操作在账本里是 `failed` 而不是 `released`，仍占日 15 / 月上限（m11，DESIGN 措辞与实现不一致）；没有「id 不出境」与「他人隔离」的回归测试（m17） |
| 08 业界现状库 | ✅ | `landscape-entries` 通过；复核人逐条核对 `entries.ts` 与 `landscape/REVIEW.md`：发布状态、goalKinds 调整（L-202 去掉 partnership、L-301 只归 hiring）都对得上。没有逐条上网核对出处（这是 Codex 的职责，三轮原文在证据目录）。12 个月规则看的是 `updatedOn`（编辑部核对日），L-602 / L-603 的数据本身是 2022–2023 年的（m4 附注） |

### 必需证据子表

| SC | 子断言 | 复核结论 |
| --- | --- | --- |
| 02–05 | 截图对照页：b10 ①–⑥ × 浅色 / 深色 × Web 1440 / 1024 / 390 + App | ⚠️ `compare.html` 在，Web 72 张、App 28 张。App 是 react-native-web 渲染，不是模拟器截图（REPORT 已披露，PLANNER 要求的是模拟器）。复核人没有逐张对照设计稿 |
| 07 | 渲染测试记录 fetch，只有允许的触发点发请求 | ✅ 两端测试都有「勾选 / 切 chip / 填答案 / 改配点 0 请求」的断言。复核人另查了 Web「人脈から選ぶ」用的 `/api/search/relationships`：不调 AI |
| 全部 | 三语、`copy:qa` 0、写死文字零新增、不用 Ionicons、Web 无十六进制颜色 | ✅ 复核人重跑 `copy:qa`（1003 / 0）、App `no-hardcoded-copy` / `legacy-ui-ratchet` / `i18n-domain-split`、orbits `orbit-button-ratchet` / `web-route-transport` / `orbit-2026-*`，全部通过；grep 新文件无 Ionicons、无十六进制颜色 |
| 全部 | 两端全量零新增、`tsc`、`lint`、`detect-changes` | ⚠️ 复核人没跑全量。读证据日志：orbits 7104 条 1 失败（`orbit-button-ratchet`，复核人单独重跑已通过）；App 4226 条 16 失败（`route-parity` 的 `/start` 为已知；`offline-read-inventory` 复核人单独重跑已通过；其余交互超时，复核人抽了 `business-card-ingest-interactions` 单独重跑 150/150 通过，但证据目录里没有逐文件重跑的日志，m14）。两端 `tsc` 复核人重跑 0 |

## 问题清单

### 中等

**M1 背景「もう一度」：同键重放会再调一次 AI，然后报 409**
- **现象**：
  - `retryBackground`（`flow-service.ts:720-731`）先按当前状态算 `attempt = attempts + 1`，再调 `applyAfterAi`。
  - `applyAfterAi`（`:412-424`）**先调 AI（`:415`），进了事务才查回执**。
  - 回执指纹的 body 里含服务端算出来的 `attempt`（`:728`）。第一次「もう一度」以 fallback 结束后，同键重放时 `attempt` 变了：AI 已经调过一次（账本新键 `background:3`，计费），然后指纹对不上，抛 `IDEMPOTENCY_KEY_REUSED`（409）。
  - 探针 P1：第一次重试失败 → 同键重放，`ai.calls.background` 2 → 3，结果 409。
- **为什么是问题**：
  - DESIGN §5.1「同键重放返回已保存的结果，不再调 AI」。
  - Web 的 `planApi` 网络异常时会**用同一个键自动重发一次**（`orbit-2026/plan/plan-api.ts`）。响应丢了的那一次正好命中这个路径：多花一次 C2，界面显示失败卡。
- **建议修法**：
  - 在调 AI 之前先查回执（`addMembers`、`fix` 已经这样做），命中就直接返回。
  - 指纹只算客户端给的内容（`{ intakeId, step }`），不要把服务端推出来的 `attempt` 放进去。
  - 补一条「失败的重试被同键重放：0 次 AI、返回同一结果」的测试。

**M2 账本回答「busy」被当成失败降级写回，会抢先覆盖真结果**
- **现象**：
  - `deepseek.ts:37`：拿不到操作所有权时，同键操作正在跑返回 `busy`，同键操作**早已成功**也返回 `busy`（只有 `failed` 才返回 `failed`）。
  - 服务层把 `busy` 和失败同样处理：C2 / C3 / C4 / C5 走 `outcomeStep(..., true)` 记成 `fallback` 并写回（`:204-209`、`:788-790`、`:867`、`:891-892`）。busy 是立刻返回的，所以它的事务往往**先**提交；拿着真结果的那个请求进事务时发现 `updatedAt` 已变或状态已前进，真结果被丢掉。
  - 探针 P8：`createIntake` 在 C2 运行中被同键重发 → 最终 `aiSteps.background.state = "fallback"`，真下书被丢弃，界面会显示「下書きできませんでした · もう一度」，用户再点就再付一次 C2。
  - 探针 P3：「質問へ」两次请求（不同键）并发 → 两边看到的都是规则选题，AI 选题白付。
  - 同类的还有「早已成功」：C4 的账本键是 `ladder:<sha(wants)>`，用户把やりたいこと 改成 B 再改回 A 时，A 的键早已成功 → `busy` → 静默保留 B 的阶梯；C3 同一组联系人移除后再加同理。
- **为什么是问题**：多付钱、结果变差，用户看到的是「AI 失败」，实际 AI 成功了。DESIGN §5.1 的状态机要求「只有 none 和用户主动『もう一度』的 failed 才发起调用」。
- **建议修法**：
  - `busy` 不是失败：服务层遇到 `busy` 时不写回，重读当前状态返回（或回 409 `AI_BUSY` 让界面稍后重读）。
  - 「同键早已成功」要能拿回结果：要么服务层先查自己的回执，要么账本键带上一个每次请求唯一的成分（例如 C4 用 `ladder:<n>`，n = 本 intake 第几次重算）。
  - 补并发测试：同键重发、双击，最终都是 AI 的结果。

**M3 C7 没有「只改允许的路径」校验；差分看不见引用、聞くこと、Step 关联类型等变化**
- **现象**：
  - DESIGN §5.2 C7 的校验列第一项是「只改允许的路径」。`checkFix`（`ai/schemas.ts:163`）只是把改后的方案按 C6 规则（不含模板 ±5）再检一遍，不和当前方案比较。
  - `diffContent`（`flow-service.ts:569-597`）只比较見立て、結論、Step 名 / 目安、人物类型的配点 · 人数与 `roleSituation`、イベント。引用、`questions`、`why`、`countRule`、`introRoutes`、Step 的 `personTypeKeys` 变了都不出现在差分里。
  - 只改了这些字段时 `changes.length === 0`，服务端按「今回は変更しません」处理（`:1099`、`:1105`）：修正次数照扣，AI 的改动丢掉。和别的字段一起改时，这些变化被**静默保存**。
  - 探针 P5：AI 把引用从 L-101 / L-102 换成 L-103、改了第一个类型的聞くこと、改了 Step 2 的关联类型，差分只列出 `steps.0.doneCriteria`，新引用已经进了草稿。
- **为什么是问题**：「每轮只列差分」是用户判断要不要接受修正的唯一依据；引用（「処処有据」）换了用户却看不到。确定后这些内容就进了正式计划。
- **建议修法**：
  - 写一个「允许路径」清单（例如 diagnosis、conclusion、steps.*、personTypes.*.allocation / targetCount / roleSituation、event），清单外的变化让校验器拒绝，进修复重试；
  - 或者把 `diffContent` 扩到全部字段（引用至少显示「参考資料を差し替え」）。两者都要补测试。

**M4 「人脈にも登録する」在事务外建联系人：失败留孤儿，并发建两张**
- **现象**：
  - `addMembers` 的手写分支在进事务之前就调 `source.addContact`（`flow-service.ts:806`），之后才在事务里查重放、查状态、查人数上限（`:820-838`）。
  - 探针 P2：团队已满 12 人时提交「13 人目」并勾选「人脈にも登録する」→ 请求 409 `INVALID_INPUT`，但联系人已经建好。
  - 探针 P2b：同一个键并发两次 → 两次都建了联系人（两张一样的卡），只有一个成员进了团队。
  - 另外，状态从 `background` 变成 `questions` 的竞态下也会留下孤儿联系人。
- **为什么是问题**：PLANNER 易错边界「手写成员被建成联系人（没勾时）」的反面——勾了的应该恰好建一张。孤儿和重复联系人会进人脉、分析和候补管线，用户要手动删。
- **建议修法**：
  - 先在事务里校验（状态、人数、回执）并占位写成员；
  - 再建联系人；
  - 最后回填 `contactId`（建失败就保留 `null`，与现在「失败不挡流程」一致）。
  - 建联系人时带上一个由幂等键派生的去重键（现有手动建联系人服务支持的话）。补并发测试。

**M5 面谈记录摘要从没送进 C2 / C3，界面却写「名刺・面談メモから」**
- **现象**：
  - DESIGN §5.2：C2 的输入含「联系人别名及其名片字段与面谈记录摘要（≤5 人）」，C3 的输入含「名片字段、面谈记录摘要」。
  - `flow-context.ts:55`、`:82`、`:116` 三处都把 `notes` 写死成 `null`，C6 的 `tags` 也恒为 `[]`。
  - Web 文案 `basisNetwork`（`copy/plan.ts:88`）是「名刺・面談メモから」，App 同义。
- **为什么是问题**：能力推定只看职位、公司、标签，质量明显低于设计；界面标的依据与实际不符，违反「处处有据」的产品原则。REPORT「自定决定」没有提到这处偏离。
- **建议修法**：接上面谈记录摘要（每人取最近 N 条 memo 的摘要、截断长度、别名化），并补一条输入断言测试；或者把文案改成「名刺から」，在 REPORT「自定决定」写明原因和以后补上的计划。

**M6 live 没设 `ORBIT_PLAN_V2_AI` 时，真实用户拿到的是 mock 生成的演示内容**
- **现象**：
  - `flow-factory.ts:22`、`:25`：没设开关或没有密钥时返回 `createMockPlanFlowAi()`，**live 数据 + mock AI**。
  - mock 会把每个「共同創業者」候选都标成 cofounder 并随机勾能力；初版是固定模板句；C7 只把用户的话拼进 Step 1 的目安。
  - 界面上没有任何「示例」标记，用户确定后就成了正式计划。
  - `redesignContractMode` 在生产里返回 live，所以合回并部署后这条路径就是默认路径。
- **为什么是问题**：PLANNER 易错边界明确列了「mock 在生产模式出现」，但没有测试覆盖。REPORT 写「生产默认 mock」，与 PLANNER 冲突，也没有说明用户会看到什么。v1 生成器也是默认 mock（先例），但 v2 的 mock 输出会经过「确定」变成用户的正式计划，影响更直接。
- **建议修法**：
  - live 且 AI 未配置时：C1 / C3 / C4 / C5 走规则降级；C2 走规则下书（与失败降级相同）；C6 / C7 返回 `AI_FAILED`，或者 Task › プラン 入口按开关隐藏「iOrbit と具体化する」。
  - 补一条「live + 未配置 → 不会出现 mock 内容」的测试。
  - 如果产品负责人决定接受现状，就写进 DESIGN §5.1 和 REPORT 交接。

**M7 `plan_background` 月上限 10 → 20：改了已授权的付费 AI 口径，没有先问**
- **现象**：`ai-quota/constants.ts:84` 把 `plan_background` 从 10 改成 20（自定决定 1）。DESIGN §5.3 / §5.4 仍写 10，§5.3 还写着「每人每月最多新建 10 个目标（= C2 的月上限）」。
- **为什么是问题**：
  - DESIGN §10 第 1 项的授权是「每用户每月上限按 §5.4 执行」，C2 是 10。
  - PLANNER「失败与交接」：「涉及次数、计分口径的停下来问」。
  - 用户可见的「10 个新目标」口径没变，这个决定方向本身合理（R22 复核 m11 推荐的就是按 intake 去重）。但成本上限翻倍属于付费 AI 授权范围，应该上报，不能自定（「只上报真正要授权的事」里，付费 AI 正是要上报的一类）。
- **建议修法**：列进待授权清单，请产品负责人确认（影响约每用户每月多 $0.03–0.06）。确认后同步 DESIGN §5.3 / §5.4；没确认前改回 10，并在「新目标」计数之外接受「もう一度」可能先撞到 C2 月上限的情况。

### 轻微

- **m1 0 点的人物类型能被确定。** 手动编辑请求 `allocation` 允许 0（`api-schema/plan-v2.ts` 的 manual-edit schema），`validateAllocations` 也只要求 ≥0；C7 同理。探针 P4：一个类型配 0 点后成功确定。建议人物类型 ≥5，要去掉就走「移除类型」。
- **m2 失败的 C6 / C7 不留回执。** 同键网络重发（Web `planApi` 自动重发一次）会用 `#n+1` 的新账本键再调一次 AI。建议失败也写一条回执（`outcome: noop`、带原因），同键重放直接返回同一个错误；用户点「もう一度」本来就用新键，不受影响。
- **m3 C6 校验器少两处细节。**
  - 「文中 ①② 对应引用」只检查编号不超过引用条数，没检查每条引用都在文中出现。
  - `HEADCOUNT` 只认阿拉伯数字，「三人」「五名」漏掉（`validate-content.ts:13`）。
- **m4 行业从没参与。** `makeDraft` / `fix` 里 `industries` 写死为 `[]`（`flow-service.ts:983`、`:1064`），`publishedEntriesFor` 的「行业优先」和 `planShortNameCandidates` 的行业候选都没生效。附注：12 个月规则看 `updatedOn`（编辑部核对日），L-602（2022 年调查）、L-603（2012–2021 年度数据）这样的老数据不会被过滤。条目里已经写明年份，可以接受，但 DESIGN §6 的「时效」本意值得再确认。
- **m5 C5 的输入与缓存键。** 输入只有背景摘要、空き、题库，没有 DESIGN 写的资料、面谈记录摘要。缓存键里的「空き」用界面语言的标签拼成，同一背景换语言会变成另一个键，也就可能选出不同的题。建议摘要用能力 id。
- **m6 `retryBackground` 会覆盖用户已加的成员。** 三块都没确认时，加了成员再点「もう一度」，团队被 AI 下书整块替换。
- **m7 响应 schema 有几处不够宽进（规则 10）。**
  - `aiFixUsed: count.max(3)`：以后服务端调高上限，旧 App 整页解析失败。
  - 单个 intake 的 `status` 是严格枚举（列表项会跳过，单页整页报错，注释已说明）。
  - `team.mode` 兜底 `"team"`、`source` 兜底 `"task"` 是在猜具体值。
- **m8 `listIntakes` 在同一个 pg client 上 `Promise.all` 三个查询**（`flow-service.ts:667`）。复核人的 Postgres 探针触发了 pg 的「client already executing a query」弃用警告，pg@9 会直接报错。改成顺序执行。
- **m9 App 的立场默认预选「代表・オーナー」**（`PlanBackground.tsx:63`）。AI 没给出立场（规则降级）时用户可能没看就确认了。DESIGN 规则下书是「立场空」，Web 要求必选。两端应该一致：都不预选。
- **m10 读失败时落到了空态。**
  - Web `loadPlanSlot` 读 v2 概要失败时 `catch` 返回 null，落到 v1 或目標入力（`plan-slot.tsx` 的 `readActiveV2Plan`），已有 v2 计划的人会看到「新建目标」。应该显示「読めません」。
  - App 只有 v1 计划的人直接看到目標入力，确定后 v1 被归档但事先没有提示（R25 范围，记一笔）。
- **m11 「失败不计次」只对用户可见次数成立。** 账本 `finish` 在有响应的失败时记 `failed`（不是 `released`），仍占计划流程日 15 次和各用途月上限。真实 C6 的 3 次失败都占了 `plan_draft` 月额度。DESIGN §5.1「失败的操作 released，不计次」与实现不一致，改 DESIGN 措辞即可（按成本口径计是合理的）。
- **m12 C1 和 C3 / C4 / C5 共用 `plan_intake` 月 60。** C1 每日 20 次，打字多的人三天就能把 60 用完，之后整月的成员推定、阶梯、选题都静默走规则。建议 C1 单独一个用途，或者不计入 60。
- **m13 没有「放弃」入口。** 未完成的 intake 一直占「本月新目标」名额，「作りかけ」卡永远显示最新那一个，状态 `abandoned` 从没被写入。
- **m14 REPORT 证据小出入。**
  - 账本里 `plan_draft` 有 6 次 `beginCall`：第 3 次操作的修复调用以 `PROVIDER_REQUEST_FAILED` 结束（看起来是本机 ≤5 次的护栏挡下的）。REPORT 只写「5 次 HTTP」，没提这一次。
  - Postgres「基线 136 → 收口 112」比的是两组不同的文件。
  - App 14 条交互超时「逐个重跑全部通过」没有留日志。
- **m15 Web 流程页读草稿失败时没有重试入口。** 状态是 `drafted` 但 `GET drafts/[id]` 失败时，`draft = null`，页面只剩收起的前提卡（`PlanFlowScreen.tsx` 的 `load`），只能刷新。
- **m16 改前提会丢掉已经做过的 AI 修正，界面不提示。** 草稿被作废，新初版又有 3 次修正（探针 P6）。这符合 DESIGN「每份草稿 3 次」的字面，但用户在修正后改前提，会丢掉修正历史。建议改前提时确认一句「この案と修正履歴は破棄されます」。
- **m17 缺两类回归测试。** 「AI 输入里没有内部 id」和「他人的 intake / draft 404、0 次 AI」两条，复核人用探针确认现在成立，但没有测试守住。建议把探针 P7 和 Postgres 隔离探针收进测试。
- **m18 DESIGN 没同步自定决定。**
  - §5.3 的 `plan_background` 10（见 M7）；
  - §9 #17「C1 每 intake 最多 5 次」与 §5.2「每人每日 20 次」自相矛盾，实现按后者；
  - 自定决定 2（选题后不能改背景）没写进 DESIGN §2.2。

## 对 REPORT「自定决定」的评价

| # | 事项 | 评价 |
| --- | --- | --- |
| 1 | 每月新目标按 intake 计；`plan_background` 改 20 | 前半同意（R22 复核 m11 推荐的就是这个）；后半是付费 AI 授权口径，应当上报（M7） |
| 2 | 选题后背景锁定 | 同意，理由成立（缓存键依赖背景）。DESIGN §2.2 写的是「✎ 可回改」，需要补一句「选题前」（m18） |
| 3 | 手動編集「このプランで始める」= 保存并确定 | 同意，与设计稿一致；中途 `PLAN_GOAL_LIMIT` 时草稿已标手动编辑过，之后可以用「確定」完成，可以接受 |
| 4 | Step 允许 `event` | 同意；改 R22 校验只放宽一处，有测试 |
| 5 | 先建计划、另一个事务标草稿 / intake | 同意；`creationKey` 幂等保证重试收敛，Postgres 并发测试证实 |
| 6 | 「共同創業者」按职位 / 标签判断 | 可以接受；但 C2 输入里没有面谈记录（M5） |
| 7 | 选题缓存放回执表、按人 | 同意；缓存键随语言变（m5） |
| 8 | C1 每日 20、同文缓存 | 同意；与月 60 的配合有风险（m12） |
| 9 | 失败后用 `#n` 新键 | 同意；但成功后同键会被账本当 busy，没覆盖到（M2） |
| 10 | 业界库 Codex 三轮、L-302 / L-402 不发布 | 同意，复核人核对处理记录与条目一致 |
| 11 | 已確定卡不放「プランを見る」 | 同意（不上线死链） |
| 12 | mock 下 Task › プラン 显示已確定卡 | 同意（与首页示例一致）；但生产 live 也会默认 mock AI（M6） |
| 13 | 提示词 v1→v3，校验器没放宽 | 同意，符合 PLANNER；v3 需再授权验证（REPORT 已列） |
| 14 | Web 修正栏在主栏底部固定 | 同意 |
| 15 | App 用上下移按钮排序 | 同意，UI-SPEC 允许 |
| 16 | 人脈候选的「空き：X」本地按关键词近似 | 可以接受，不为提示多调 AI；Web 用自然搜索接口、App 用联系人列表，两端候选来源不同，记一笔 |
| 17 | App 夹具录自 orbits mock | 同意 |
| 18 | `onSubmit` 改名 `submitAnswers` 绕过扫描器误报 | 同意，行为不变 |

另外 REPORT 没有列、但属于自定决定的：C2 / C3 不读面谈记录（M5）；生产默认 mock AI 对真实用户可见（M6）。

## 复核人做了什么

### 重跑

| 命令 | 结果 |
| --- | --- |
| orbits：`node scripts/run-node-tests.mjs tests/plans/*.test.ts tests/api/plan-flow-routes.test.ts tests/ui/plan-flow-*.test.ts*` | 81 / 81 通过 |
| orbits（`ORBIT_EVENT_DATABASE_URL=postgres://localhost/orbit_test`）：`tests/capabilities/plans-v2-*.test.ts` | 17 / 17 通过 |
| App：`node --test … tests/plan-model.test.ts tests/plan-screens.test.tsx` | 24 / 24 通过 |
| orbits：`orbit-button-ratchet`、`web-route-transport`、`orbit-2026-*` | 51 / 51 通过 |
| App：`offline-read-inventory`、`route-parity`、`app-wide-route-coverage`、`mobile-route-access`、`no-hardcoded-copy`、`legacy-ui-ratchet`、`i18n-domain-split`、`task-container` | 75 条，1 失败：`route-parity` 的 `/start`（已知，与 R23 无关；`/plans/**` 已对上） |
| App：`business-card-ingest-interactions`（REPORT 说的超时文件之一）单独跑 | 150 / 150 通过 |
| 两端 `npx tsc --noEmit -p tsconfig.json` | 0 / 0 |
| orbits：`npm run copy:qa`；`node scripts/contract-snapshot.mjs` | 1003 条 0 问题；契约快照一致 |

### 探针（scratchpad 临时测试，直接调服务；Postgres 那条跑在 `orbit_test` 的随机 schema；全部已删除）

| 探针 | 结果 |
| --- | --- |
| P1：C2 首次失败 → 「もう一度」（键 K）再失败 → 同键 K 重放 | AI 调用 2 → **3**，结果 **409 `IDEMPOTENCY_KEY_REUSED`**（M1） |
| P2：团队已 12 人，再手写一人并勾「人脈にも登録する」 | 请求 409 `INVALID_INPUT`，**联系人已建 1 张**（M4） |
| P2b：同一键并发两次手写 + 勾选 | **建了 2 张联系人**，两次都返回成功（M4） |
| P3：「質問へ」两次并发（第二次账本回 busy） | 两边都是规则选题（`fallback`），AI 结果被丢（M2） |
| P4：手动编辑把一个类型改成 0 点 | 成功确定（m1） |
| P5：C7 换了引用、改了聞くこと、改了 Step 2 关联类型，同时改了 Step 1 目安 | 差分只有 `steps.0.doneCriteria`；引用已变成 L-103（M3） |
| P6：用完 3 次修正后改前提 → 重做初版 | 新草稿 `aiFixUsed = 0`（m16） |
| P7：带 `contact:SECRET-*` 的联系人走 C2 / C3 / C5 / C6 / C7 | 所有 AI 输入都不含联系人 id、intake id、draft id；紹介ルート回映射正确（通过） |
| P8：`createIntake` 在 C2 运行中被同键重发（第二次账本回 busy） | 最终 `background.state = "fallback"`，真下书被丢，AI 调了 2 次（M2） |
| Postgres 隔离：bob 对 alice 的 intake / draft 读、改、确定、加成员；两人同一幂等键 | 全部 404、bob 0 次 C6 / C7；同键互不影响；`listIntakes` 只列自己的（通过）。顺带看到 m8 的 pg 弃用警告 |

### 读过的文件

- 服务端：`features/plans/v2/{flow-service,flow-handlers,flow-context,flow-factory,validate-content,repository(flow 部分),service(createPlanFromDraft)}.ts`、`v2/ai/{deepseek,mock,prompts,rules,schemas}.ts`、`landscape/{entries,store,REVIEW.md}`、`ai-quota/{constants,ledger(finish)}.ts`、`shared/api-schema/plan-v2.ts`（R23 段）。
- 界面：Web `orbit-2026/plan/{PlanFlowScreen,BackgroundBlocks,PlanGoalEntry,PlanConfirmedCard,PlanParts,plan-api,plan-model}`、`agent/plan/plan-slot.tsx`、`plan.module.css`；App `screens/plan/{PlanFlowScreen,PlanBackground,PlanSegment,PlanGoalInput,PlanAddMemberSheet,plan-api,plan-failure}`。
- 证据目录：`real-ai-*.json`、`real-ai-ledger-summary.txt`、`final-*.log`、`compare.html`（只看了结构与张数）、`codex-landscape-review*.md`（只确认存在与结论段）。

## 处理记录（执行会话，2026-10-10）

| 编号 | 处理 | 位置 |
| --- | --- | --- |
| M1 | 已修：AI 步骤先查回执再调 AI（`applyAfterAi`、`retryBackground`、`recomputeLadder`）；回执指纹只算客户端给的内容，不含服务端推出的 `attempt`；补测「失败的もう一度同键重放 0 次 AI」 | `flow-service.ts`、`flow-review-fixes.test.ts` |
| M2 | 已修：`busy` 不再当失败写回——C2 读当前状态返回（仍是 drafting）、C5 回 `AI_BUSY`（409）、C3 / C4 不写回；C3 / C4 / C5 的账本键带本 intake 的第几次（同一组人 / 同一句やりたいこと 再来不会撞上早已成功的旧键）；两端界面遇到 `AI_BUSY` 显示「処理中です」并 2 秒后重读；补测 | `flow-service.ts`、两端 `plan-*`、`flow-review-fixes.test.ts` |
| M3 | 已修：C7 校验加「只改允许的部分」（引用、聞くこと、判定、見分け方、人物像、開口一番、紹介ルート、短名、行业、枠组成不能改，违反 → 修复重试 → 失败）；差分补上 Step 关联类型、Step 理由、类型理由、参考資料；补测 | `validate-content.ts`、`ai/schemas.ts`、`ai/deepseek.ts`、`flow-service.ts` |
| M4 | 已修：手写成员先在事务里占位（校验状态、人数、回执），再建联系人，最后回填 `contactId`；补测（同键并发只建一张、被拒的成员不建联系人） | `flow-service.ts` |
| M5 | 已修：联系人带上 memo 提取写回的「できること / 探していること / 話した話題」摘要（≤300 字，不送 memo 原文）给 C2 / C3 | `flow-context.ts` |
| M6 | 已修：live 下没打开开关或没有密钥 / 账本时用「不可用」实现（规则降级、初版与修正为失败卡），不再用 mock；DESIGN §5.1 写明「上线时同时打开开关属于部署授权」；补测 | `ai/disabled.ts`、`flow-factory.ts`、DESIGN |
| M7 | 已改回 10；「是否放到 20 给もう一度留余量」列入 R23 REPORT 待授权清单 | `ai-quota/constants.ts`、REPORT |
| m1 | 已修：人物类型至少 5 点（C6 / C7 校验与手动编辑都拦） | `validate-content.ts`、`flow-service.ts` |
| m2 | 已修：失败的 C6 / C7 也留回执，同键重放返回同一个错误、0 次 AI；补测 | `flow-service.ts` |
| m3 | 已修：每条引用都要在見立て / 結論里出现；人数判定认汉字数字 | `validate-content.ts` |
| m4 | 未修（记入 REPORT 已知例外）：行业候选与行业优先引用要等目标里有行业信息（目前背景不问行业）；L-602 / L-603 已在条目里写明数据年份 | REPORT |
| m5 | 已修：选题缓存键用能力 id，与界面语言无关；C5 输入不加面谈记录（背景摘要已含团队能力），记入 REPORT | `flow-service.ts` |
| m6 | 已修：「もう一度」保留用户自己加的成员 | `flow-service.ts` |
| m7 | 部分：`aiFixUsed` 去掉上限；单个 intake 的 `status` 严格枚举保持（读不懂就整页报错重读，注释已说明）；`team.mode` / `source` 的兜底保留（只影响显示） | `api-schema/plan-v2.ts` |
| m8 | 已修：`listIntakes` 顺序查询 | `flow-service.ts` |
| m9 | 已修：App 立场不预选，未选时确认按钮禁用 | App `PlanBackground.tsx` |
| m10 | 已修：Web 读 v2 概要失败显示错误卡 + 重试（「尚未実装」仍按 HOW-TO §4 不显示错误） | Web `plan-slot.tsx`、`PlanSlotError.tsx` |
| m11 | 已改 DESIGN §5.1 措辞（按成本口径计） | DESIGN |
| m12 | 未改（记入 REPORT 待授权清单）：C1 是否从 `plan_intake` 月 60 里拆出 | REPORT |
| m13 | 未修：「放弃」入口与 `abandoned` 交给 R25（目标列表 / 下拉）；R25 PLANNER 已记 | R25 |
| m14 | REPORT 已更正：C6 第 3 次操作的修复调用被本机护栏挡下（账本 1 条 `no_response` 子账，没有真实 HTTP）；Postgres 两组文件不同已写明 | REPORT |
| m15 | 已修：Web 读草稿失败给重试 | Web `PlanFlowScreen.tsx` |
| m16 | 已修：有 AI 修正记录时改前提先确认「この案と修正履歴は破棄されます」（两端） | 两端 |
| m17 | 已补测：AI 输入不含联系人 / intake / 草稿 id；他人数据 404 已由 R23 路由与 Postgres 测试覆盖 | `flow-review-fixes.test.ts` |
| m18 | 已同步 DESIGN：§9 #17 C1 口径、§2.2 选题前才可回改；`plan_background` 仍是 10 | DESIGN |
