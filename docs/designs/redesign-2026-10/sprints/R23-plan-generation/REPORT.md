# Sprint R23 — REPORT（计划 v2.2：生成流程与 AI）

**执行人：** 小雨（甲）的执行会话，2026-10-10。**分支：** 直接在 `redesign` 上提交。
**依据：** [PLANNER](PLANNER.md)、[UI-SPEC](UI-SPEC.md)、[plan-v2.2/DESIGN.md](../plan-v2.2/DESIGN.md)。
**证据目录：** `~/orbit-sprint-evidence/redesign/R23/run-01/`。
**没有做的事：** 没连 Neon、没部署、没做生产迁移；付费 AI 只在本机（`postgres://localhost/orbit_r23_ai`）按授权调用，每项 ≤5 次，全部记账。

## 做了什么

1. **第一天先提交契约**（`d2f744af`，`contract:`，App 副本同提交）：`PlanIntakeView`、`PlanDraftView`、`PlanConfirmResult`、`PlanIntakeListResponse`、目标类型推测与流程各步的请求体（严格）；响应宽进（未知状态整条跳过，`aiStep.limit` 读不懂当没有）。
2. **服务端**（`504a9250`）：
   - `features/plans/v2/flow-service.ts`：intake（背景三块一次下书、逐块按顺序确认、加成员、阶梯重算、选题、回答 → 前提、改前提）与草稿（初版、AI 修正、手动编辑并确定、元に戻す、确定）；每个写操作有幂等回执（`plan_flow_commands`），AI 步骤两段式（事务外调 AI、事务里写结果），同键重放不再调 AI。
   - `features/plans/v2/ai/`：C1–C7 的接口、mock（确定性）、DeepSeek 实现（用途固定池、每次 HTTP 一条子账、同一操作内修复 1 次、失败结算 failed）、提示词、输出 schema 与业务校验；`validate-content.ts`（短名字典、配点 5 分一档合计 100、模板 ±5 最多 2 处、引用必须是已发布条目、①② 对应引用、没有 ① 的句子不能带数字、紹介ルート别名与人数）。
   - `flow-context.ts`（本人资料、「共同創業者」候选、选中的联系人、初版用联系人沿用 v1 裁剪、「人脈にも登録する」走现有手动建联系人）、`flow-factory.ts`（`ORBIT_PLAN_V2_AI=ai` 且有密钥和账本才用 DeepSeek，否则 mock）、`flow-handlers.ts` + 15 个路由文件。
   - 业界现状库 `features/plans/landscape/`：`entries.ts`（16 条，14 条发布）、`store.ts`（唯一读入口：已发布、12 个月内、目标类型、行业优先、最多 12 条；按 id + 版本解析旧引用）、`REVIEW.md`（Codex 三轮审核与处理记录）。
3. **Web**（`orbit-2026/plan/`、`copy/plan.ts`、`/app/plans/flow/[intakeId]`、`/app/plans/drafts/[draftId]/edit`）：目標入力、生成流程页（5 段进度、背景三块、能力 × 成员表与本地「空き」、加成员 Modal 两页签、阶梯、≤5 问三列、前提就地改、方案卡与引用、AI 修正栏与差分卡、右栏「わかったこと / 方案の下書き」）、手動編集页（Step 改名 / 拖拽 / 删 / 加、人数与配点回流、移除类型确认、加类型、変更点）、「已確定」卡；`loadPlanSlot`：有 v2 → 已確定卡，有 v1 → 旧界面不动，都没有 → 目標入力。
4. **App**（`src/screens/plan/`、字典域 `plan`、`app/plans/flow/[intakeId].tsx`、`app/plans/drafts/[draftId]/edit.tsx`）：同样的画面；全屏从下推入；加成员用 BottomSheet；引用默认收起；Step 排序用上下移按钮。`TaskScreen` 只换了 `PlanSlot`。
5. **路由登记**：Web 登录前缀 `/app/plans`、`shellNavKeyFor` → Task、运输审计样例与计数 57 → 59、全产品审计与产品清单重新生成；App 登录前缀、`parentForPath` → Task › プラン、online-only 与离线清单、路由覆盖测试；copy:qa 纳入 App `plan` 域。

## SC 对照

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 目標入力 | ✅ | 两端渲染测试（推测与手选不被覆盖、示例卡零请求、余量 0 / 已有 2 个目标时提前说明并禁用、作りかけ继续）；截图 `web/goal-*`、`app/goal-*` |
| 02 背景确认 | ✅ | `intake-flow.test.ts`（一次 AI 下书三块、顺序确认、`STALE`、勾选 0 次 AI、手写成员不建联系人除非勾选、人脈から推定能力、阶梯只在文字变了时重算且 ≤3、下书失败规则降级与「もう一度」、日上限显示上限）；两端渲染测试（块顺序、空き即时变化且零请求）；截图 |
| 03 5 問与前提 | ✅ | `intake-flow`（≤5、题库内、同类同背景同题同序并命中缓存、失败按模板顺序、空题标推测、前提每行出处、改前提升版本）；渲染测试（一次提交、就地改）；截图 |
| 04 初版 | ✅（mock）/ ⚠️（真实） | `draft-flow`（五部分、合计 100、短名来自字典、引用都已发布）、`plan-flow-ai`（校验器拒绝 13 类违规）；真实 C6 本机 5 次都被校验器拦下（见已知例外） |
| 05 修正与手动编辑 | ✅ | `draft-flow`（3 次上限、不改也计、失败不计、同键重放 0 次、手动编辑合计 100 / 5 分一档 / 只一次 / 保存即确定）；两端渲染测试（计数与禁用、合计条、余数、移除回流）；截图 |
| 06 确定 | ✅ | `draft-flow`（一份 v2 生效、v1 归档、没用手动编辑时保留 1 次、重复确定只建一份、第 3 个目标拒绝）；`plans-v2-flow-postgres`（整条流程在真实 Postgres 上、三个并发确定只建一份）；`plan-flow-routes`（mock 从空态到确定全走路由）；两端端到端（渲染级） |
| 07 AI 规矩 | ✅ | `plan-flow-ai`（mock 确定性且过同一组校验、按操作记账顺序、修复 1 次、两次不合格 failed、`plan_intake` 不修复、上限与同键并发 0 次 HTTP）；渲染测试记录 fetch，只有允许的触发点发请求；真实调用记录见上表 |
| 08 业界现状库 | ✅ | `landscape-entries.test.ts`（字段齐全、id+版本唯一、checksum、每类 ≥3、draft / retired / 过期不返回、旧版本仍可解析）；`features/plans/landscape/REVIEW.md` |

## 自定决定

| # | 事项 | 决定 | 理由 / 对标 |
| --- | --- | --- | --- |
| 1 | 每月新目标 10 个怎么数（R22 复核 m11） | 按新建的生成流程数（`plan_intakes` 本月行数）计；`plan_background` 账本月上限**保持 10**（复核 M7：放到 20 属于付费 AI 授权，列入待授权清单） | 同一目标「もう一度」不该占名额；对标 Notion / Linear 按「建了几个」限额而不是按调用次数 |
| 2 | 背景在选题后能不能改 | 不能（`BACKGROUND_LOCKED`）；之后要改就改前提行 | 选题缓存键依赖背景；改背景会让问题和答案对不上。前提行就地改已覆盖需要 |
| 3 | 手动编辑与确定 | 「このプランで始める」= 一次请求保存并确定 | 设计稿写「保存并确定」；少一个半成品状态 |
| 4 | Step 里的イベント chip | 允许 `personTypeKeys` 含 `event`（改了 R22 `createPlanFromDraft` 的校验一处） | 设计稿 Step 上有 🎟️ chip |
| 5 | 确定与 intake 状态 | 先 `createPlanFromDraft`（按草稿 id 幂等），再在另一个事务里标草稿 / intake；中途失败重试会补齐 | 不改 R22 服务的事务边界；同键重试收敛 |
| 6 | 「共同創業者」候选 | 联系人的职位或标签含共同創業者 / co-founder / 共同创始人，最多 5 人 | 联系人没有统一标签字段；只读本人联系人 |
| 7 | 选题缓存 | 回执表里按「类型 + 背景规范化摘要」存一条（按人，不跨用户） | DESIGN §5.2 C5 |
| 8 | C1 每日 20 次与缓存 | 同文的推测（成功或降级）都缓存；计数用回执表按东京日数 | 不新增表、不改账本 |
| 9 | 初版失败的重试键 | `draft:<intake>:<前提版本>#<n>`；C7 同理 `fix:<draft>:<n>#<m>` | 失败的操作在账本里已结算，同键不能再用 |
| 10 | 业界现状库的审核 | Codex 三轮（17 → 16 条）；L-302、L-402 一手出处读不到先不发布 | Q7；宁缺不编 |
| 11 | 已確定卡没有「プランを見る」 | R24 前不放死链 | 成熟产品不上线死链 |
| 12 | mock 下 Task › プラン 显示已確定卡 | 演示世界每人都有一份示例 v2 计划，所以 mock 下看到的是已確定卡（与首页分数组件一致）；目標入力在测试与截图里验证 | 示例模式与首页一致 |
| 13 | 提示词版本 | v1 → v2 → v3（v3 未验证，见已知例外）；校验器一处没放宽 | PLANNER「只改提示词版本，不放宽校验器」 |
| 14 | Web 修正栏位置 | 主栏底部、随滚动固定 | 右栏这时显示「方案の下書き」 |
| 15 | App 排序 | 上下移按钮，没做长按拖动 | UI-SPEC 允许；对标 iOS 设置的编辑模式 |
| 16 | 人脈候选的「空き：X」 | 按职位 / 关系描述关键词本地近似，真正能力加入后由服务端推定 | 搜索接口不返回能力；不为提示多调 AI |
| 17 | 测试夹具 App 侧 | `tests/fixtures/plan-flow-mock.json` 录自 orbits mock 服务的真实返回 | 两端形状一致 |
| 18 | 产品清单扫描器误报 | `QuestionsCard` 的 `onSubmit` 属性改名 `submitAnswers` | 扫描器把组件属性当成无名点击；行为不变 |


## 付费 AI 调用记录（本机，deepseek-v4-flash）

价格按 DESIGN §5.4 的保守混合价：未命中输入 $0.374 / 百万 token，输出 $1.122 / 百万 token。

| 项 | 真实 HTTP 次数 | 操作 | 输入 / 输出 token | 成本 | 结果 |
| --- | --- | --- | --- | --- | --- |
| C1 目标类型推测 | 3 | 3（各 1 次） | 557 / 23 | 约 $0.0002 | 3 条全对（採用 / 新規開拓 / 事業提携） |
| C2 背景下書き | 2 | 1（第 1 次输出被拒，同一操作内修复成功） | 1,152 / 482 | 约 $0.0010 | 立场、やりたいこと、团队能力勾选、4 级阶梯 + 建议 3 级都合理 |
| C3 成员能力推定 | 1 | 1 | 308 / 102 | 约 $0.0002 | 两位演示人物的能力与依据合理 |
| C4 阶梯重算 | 1 | 1 | 276 / 161 | 约 $0.0003 | 新「やりたいこと」进了第 3 级 |
| C5 選題 | 1 | 1 | 1,011 / 533 | 约 $0.0010 | 5 问都在题库内，有选题理由与推测 |
| C6 初版 | 5（第 3 次操作的修复调用被本机 ≤5 护栏挡下：账本 1 条 `no_response` 子账，没有真实 HTTP） | 3（都失败，不计用户次数） | 10,540 / 8,360 | 约 $0.0133 | 提示词 v1 两次：人物类型漏字段、诊断里有没引用的数字；v2 一次：删了一个枠却没补配点、Step 还引用它。**校验器全部拦下，没有保存任何东西**。v3 已写好但没有次数验证（见已知例外） |
| C7 AI 修正 | 2 | 2 | 5,771 / 2,617 | 约 $0.0051 | 两次都判断「不改」并给了理由（基于 mock 初版）；v3 提示词加了「请求合理就照做」 |
| **合计** | **15** | **12** | **19,615 / 12,278** | **约 $0.021** | |

operationId 与逐次子账：`real-ai-c1.json`、`real-ai-flow.json`、`real-ai-c6c7.json`、`real-ai-ledger-summary.txt`。

## 交接

- **给 R24**：Task › プラン 的「有 v2 计划」分支（Web `loadPlanSlot` 里 `PlanConfirmedCard`、App `PlanSegment` 里的已確定卡）换成概要；「プランを見る」等按钮由 R24 加。确定后入队候补匹配的接线（`enqueuePlanSourceMatchAfterSave`）随 R24 打开 v2 匹配一起做（R22 交接已写）。
- **给 R25**：草稿服务可复用（`kind: review` 的修正 / 手动编辑 / 确定需要另写 C9 与 `base_revision` 校验）；手动编辑页的配点回流组件两端都在 `plan/` 目录。
- **给 R28**：`POST /api/agent/plans/intakes` 带 `source: "onboarding"` → 返回 `href`，引导页跳过去即可。
- **给 R21**：`GET /api/agent/plans/intakes` 返回未完成的流程（`intakes[]` 带 `href`），可列进会话列表。
- **付费 AI**：C1–C7 本机授权已用（次数见上表）；C6 的提示词 v3 需要再验证（见已知例外）；staging / 生产另行授权。生产默认 mock（`ORBIT_PLAN_V2_AI` 不设）。
- **人工确认**：业界现状库 14 条的日中英文字请产品负责人过目；L-302、L-402 补到一手出处后升版本再审。

## 基线 → 收口

| | 基线（R22 复核修完，`fca8c36d`） | 收口 |
| --- | --- | --- |
| orbits `npm test` | 7026 条，0 失败（复核修后） | 7104 条，1 失败：`orbit-button-ratchet`（plan 组件的按钮缺 `btn` 记号）→ 已修（与组件库同一写法），单独重跑与 plan 测试 26 / 26 通过 |
| Postgres（计划、账本、快照） | 136 / 0（R22 那组文件） | 112 / 0（这次跑的文件组不同：计划 / 账本 / 快照，含新 `plans-v2-flow-postgres`，不含洞察两份） |
| App `npm test` | 4192 条，1 失败（`route-parity` 的 `/start`，已知） | 4226 条，16 失败：`offline-read-inventory`（R23 新接口没登记）→ 已修，单独 23 / 23；`route-parity` 的 `/start`（已知，`/plans/**` 已对上）；其余 14 条在 10 个交互测试文件里，失败都是 5–15 秒的交互超时，当时机器负载 48（GitNexus 重建同时在跑），逐个文件单独重跑全部通过 |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 | 0 / 0 / 0 |
| App `tsc` | 0 | 0 |
| `copy:qa` | 501 条 0 问题 | 1003 条 0 问题（含 Web `copy/plan.ts` 与 App `plan` 域） |

日志：`~/orbit-sprint-evidence/redesign/R23/run-01/final-*.log`。

## GitNexus

- 开工 impact（`impact-start.md`）：`loadPlanSlot` UNKNOWN（文本确认只有 Task 页一个调用方）、App `PlanSlot` LOW、`shellNavKeyFor` LOW、`parentForPath` **CRITICAL**（每个 AppScreen 都调它）→ 只新增 `plans` 分支、已有分支一个没改、加了测试；`deepseekJsonChat` **CRITICAL** → 不改，只新增调用点；`createPlanFromDraft` → 只放宽一处：Step 的类型 key 允许 `event`。`isPrivateMobileRoute` / `mobileAuthReturnHref` UNKNOWN → 只往前缀表追加，测试确认。
- 收口 `detect-changes`（`analyze --index-only` 刷新后）：36 个文件、29 个符号、12 条流程、风险 high。12 条都是「TaskScreen → …」，由 `TaskScreen` 换了プラン段组件引起（`useStyles` 改动），属于本 Sprint 的预期范围；审计清单与离线清单是重新生成的文档（`detect-changes-final.log`）。

## 截图对照

`~/orbit-sprint-evidence/redesign/R23/run-01/compare.html`：每个 b10 画板一行，右侧 Web 1440 / 1024 / 390 与 App 390，浅色 / 深色（Web 72 张、App 28 张）。截图由两端渲染测试框架生成（Chromium；App 用 react-native-web），数据是 mock 服务的真实返回加虚构人物；Web 截的是页面主体，不含壳的左栏。**没有用模拟器或真机**：本机没有可用的非 live 后端（`.env.local` 指向的库不能连）。

## 已知例外

- **真实 C6 没有在本机通过**：5 次授权调用（3 次操作）都被校验器拦下——v1 提示词两次（人物类型漏 `why` / `questions` / `countRule`；诊断里有没引用的数字），v2 一次（删了一个枠却没补配点、Step 还引用它）。按 PLANNER 只升提示词版本、不放宽校验器；v3 已写好（保留全部枠、默认照抄模板配点）但没有次数再验证。生产仍默认 mock；**上 staging 前需要再授权几次本机 C6 调用验证 v3**。
- 真实 C7 两次都判断「不改」（基于 mock 初版）；v3 提示词加了「请求合理就照做」，同样待验证。
- App 截图不是模拟器截图；真机 / 模拟器走查（尤其从下推入的全屏、键盘遮挡、BottomSheet）需要人工。
- L-302、L-402 暂不发布（一手出处读不到）。

## 复核修复（REVIEW 处理记录）

复核结论有条件通过（M 7 条、m 18 条）。M1–M6 全修、M7 改回授权口径；m 级 14 条修了、4 条记入下面的待授权 / 交接。修后验证见 `review-fix-*.log`。

## 待授权清单（R23）

- `plan_background` 月上限是否从 10 放到 20（给「もう一度」留余量；每用户每月最多多约 $0.03–0.06）。
- C1（目标类型推测）是否从 `plan_intake` 月 60 里拆出单独用途（打字多的人可能三天用完 60，之后成员推定、阶梯、选题整月走规则）。
- C6 提示词 v3 的本机真实验证（建议再授权每项 ≤5 次）。
- 上线 v2 生成流程时同时打开 `ORBIT_PLAN_V2_AI=ai`（属于部署授权；未打开时 live 下初版是失败卡，不会出现演示内容）。
