# Sprint W0048b — 执行总结

> 报告由协调者按 Generator 原文写入（子代理写文件被拦）。

## 结果

**已验证能做到**

- **计划生成接 DeepSeek 两阶段（provider `ai`）**
  - 一次计划生成计为用户主动池的 1 次操作（`purpose: plan`，`max_calls 4`）。
  - 生成前先按 W0048a 判定快照：
    - `fresh`：复用，0 次快照 HTTP；
    - 其他情况：在同一个操作里生成快照，快照的 `planId` 指向即将保存的计划；
    - 不足 3 人：不带快照。
  - 骨架发 1 次 HTTP，之后只细化前 2 个阶段；第 3 段起以骨架形态保存。单份计划最多 4 次 HTTP，每次 HTTP 前都先记一条子账。
  - 阶段数超过 12：骨架解析后、任何阶段 HTTP 之前就失败。
- **防止编造与泄漏**
  - 模型只看到别名（C…／E…）。
  - 编造的 id 和别人的 id 在解析层丢弃：ally 整条去掉、thisWeek 只去 id、活动整条去掉，丢弃数写进日志。保存前的校验器照旧兜底。
  - 所有模型生成的可见文字都校验 id／别名泄漏（原始 id、`prefix:value`、UUID、C…／E…），违规就拒绝这次输出。
  - `figures` 的三个数字由服务端规则算出；ally 的姓名由服务端填写。
  - `targetCount` 不是 1–5 的整数时，这个阶段的输出直接失败，不做修正；缺省时不写，读取方按 1 计。
- **结算**
  - 流水线是唯一结算者，快照入口不结算。
  - 部分失败 → `failed`；全程无响应 → `released`；同键重放 → 返回原结果，0 次 HTTP。
  - 同一个键的并发请求：只有拿到所有权的那个执行并结算，另一个收到 409 `GENERATION_IN_PROGRESS`（0 次调用），客户端沿用同一个键重试即可取回结果。
- **读取路径与补细**
  - 打开计划页、GET 当前计划：AI 计划 0 次模型调用，只记「进入新阶段」。
  - `plan-phase` 维护任务在前一阶段成为当前时补细下一个骨架阶段：
    - 在事务外调用模型，每个阶段占 1 次后台池操作（`plan_refine`）；
    - 补细的条目、阶段元数据（`detailed: true`、followups、who）和幂等日志在同一事务里写入；
    - 后台池用满时 0 次调用，顺延到次日。
  - 阶段已经开始但还没补细时，页面显示骨架和「明天更新」。
- **老模板计划「AI 重新生成」**
  - 不写 `reanalysis:<月>` 键，不占月额度。
  - 以固定的 `ai-regenerate:<旧计划id>#<尝试序号>` 做 single-flight：两个不同点击键同时提交也只有一条 HTTP 链；上一次失败后再点才认领下一个序号。
  - 「约 TA」的带入规则与重新分析一致。
  - 计划页有提示行，覆盖可用、生成中、完成后新版本、用户池用满置灰（「今天次数已用完，明天可用」）几种状态。
- **用户池总熔断**：用满时 bootstrap 和 reanalyze 返回 429 `USER_DAILY_LIMIT`，0 次调用；后台池用满不影响计划生成。示例模式返回 403，不预留额度。

**仍未做**

- 生产环境仍是 mock，没有切换开关，也没有执行迁移（W48-9）。
- 计划页的用满置灰只在点击收到 429 后出现，SSR 不预读用量（为了省读取）。
- `figures` 里「与目标相关」用的是 goal-signals 规则，实测跨境支付类目标得到 0，属于规则覆盖面问题，不在本 Sprint 范围。

## 运行记录

- 结果：completed，等待协调者合并并验证合并树。
- Generator：Opus 5.5，2026-10-02。PLANNER revision 4，SHA256 `dae15e7395ce3ea4e54d71ab8b54bc2ee14a05995b888ae7e951d97f04c17043`（开工时已核对）。
- 分支 `sprint/W0048b-plan-ai-generator`，基线 `43889986`。
- 提交：功能 `d6321c99`；review 修复 `0d6f1a67`（固定最终 SHA）。chat-agent 的合并 SHA 见 README 运行记录。
- 档位：H。
- 全量对照（RULES 5.2）：
  - 基线 43889986 树（导出到 scratchpad 跑）：6429 tests / 81 fail。
  - 改后：6467 tests / 83 fail。
  - 按名称对照新增 4 项，处理如下：
    - 2 项是本 Sprint 有意的行为变更，测试已改为断言新行为，复跑通过：
      - 第 3 步：明确失败后换新键，`GENERATION_IN_PROGRESS` 保留原键；
      - W0014 计划页 props 多了 `tracking.aiProvider`。
    - sync-revision 迁移用例偶发失败，单独跑 3/3 通过，与 W0048a 记录的偶发同源。
    - 「全项目 typecheck 为 0」ratchet：错误全部来自工作树里 3000 dev server 生成的 `.next/types/validator.ts`（缺 chat 路由），属于环境问题；基线树没有 `.next`，所以它在基线里没有失败；源码 `tsc` 0 错。
  - 结论：代码导致的新增失败 = 0。
- 收口定向集（第二段）：380 pass / 0 fail / **0 skipped**（`closing-set-2.log`），覆盖：
  - 计划相关：生成器、bootstrap、重新分析、阶段补细、AI 生成器、输入裁剪、自动日志、服务、仓储；
  - Postgres：current-view、AI 并发、matching；
  - 页面：iOrbit 各屏、引导、示例；
  - W0048a：快照服务/校验/版本/维护、账本、memo 提取、新联系人三层、维护任务接线。
- `npx tsc --noEmit -p .`：源码 0 错。
- push：未做。

### 付费 AI（按 ai_usage_calls 的 operation_id 聚合）

| 操作 | 账号 | HTTP | 输入 token | 输出 token |
|---|---|---|---|---|
| bootstrap（用户池） | verify-legacy | 4（快照＋骨架＋2 段） | 3,847 | 2,699 |
| ai_regenerate（用户池，浏览器点击） | verify-expired | 4 | 4,667 | 3,087 |
| **合计** | | **2 次操作、8 次 HTTP**（上限 3 次、12 次） | **8,514** | **5,786** |

- 第二段没有新增真实调用。
- 用第 6 条的泄漏规则回查两份真实 AI 计划，229 段文字 0 误报（`leak-check-real-outputs.txt`）。
- 期间没有保存 memo，没有其他新的账本操作。

### 证据（`~/orbit-sprint-evidence/web/sprint-W0048b/run-01/`）

- impact：`impact/`、`impact/round2.txt`。
- detect-changes：`detect-changes-staged(-2).*`、`detect-changes-all(-2).txt`。两段都是 risk high，都不是 partial／truncated。
- 测试：`targeted-1/2.log`、`closing-set-2.log`、`full-baseline.txt`、`full-after.txt`、`fail-*.txt`、`new-failures.txt`。
- 读流量：`read-traffic.json`。
- 真实调用：`real-op-a-bootstrap.json`，再加交接里的账本查询。
- 浏览器截图：`screens/01–09`（1440／375）。
- review 原文：`codex-review.txt`。
- checkpoint：`checkpoint.md`。

## 验收结果

| SC | 结果 | 证据 |
|---|---|---|
| 01 基于快照、按操作计次 | pass | `tests/services/plan-ai-generator.test.ts`：快照在同一操作内；fresh 0 次；R-4／D46② 12/1/13 段；fetch 次数 = 子账条数 ≤ 4；第 5 次被拒；后台池满不影响；用户池满 429 且 0 次调用；示例模式 403；规则 figures；targetCount；json_object／thinking／超时；缺 key 时 fail closed；12 段真实保存（P2-4）；同键并发（P1） |
| 02 编造 id、失败与结算 | pass | 同一文件：解析层丢弃 + 日志；R-3 ①②③④；输出无效时计次且重放不发 HTTP；校验器兜底；七类文字泄漏（P2-6）；targetCount 从 JSON 到保存全链路（P2-5）。`tests/capabilities/plan-ai-concurrency-postgres.test.ts`：真实 PG 上两个并发 reserve 恰好一个 owner、同键 bootstrap 只走一条链、W0048a 手动重新分析返回 in_progress |
| 03 读取 0 调用与补细 | pass | `tests/capabilities/plan-current-view-postgres.test.ts`：SSR／GET 0 次调用、候选 SQL、幂等写入。`tests/services/plan-phase-refinement.test.ts`：事务外调用、后台池 1 次操作、重跑 0 次、进入该阶段时不二次补细、还早的阶段不补、后台池满时顺延和次日补上、阶段元数据与 followups 持久化并由 view-model 输出（P2-3）。页面测试：骨架阶段 +「明天更新」 |
| 04 老模板计划 AI 重新生成 | pass | `tests/services/plan-reanalysis.test.ts`：月额度不变、不写 reanalysis 键、replay、条件不满足时 INVALID_INPUT 且 0 次调用、「约 TA」规则一致、不同点击键并发 single-flight 和失败后的第 2 次尝试（P2-2）。`tests/api/agent-plans-reanalyze-route.test.ts`：400／201／200／429。`tests/pages/app-agent-iorbit-screens.test.tsx`；浏览器截图 04–09 |
| 05 真实调用、读流量与收口 | pass | 真实调用见上表；读流量见下节；生产未动；全量新增失败 0；Codex review 1×P1＋5×P2 全部采纳 |

## D39 读流量（R-14，`scripts/measure-plan-ai-read-traffic.ts`，每人 200 位联系人）

**单次读取字节**

| 路径 | 单次 |
|---|---|
| ① AI bootstrap | 140,861 B（mock 对照 62,547 B） |
| ① AI reanalysis | 167,972 B |
| ② 计划 GET | 7,043 B |
| ② 计划页 SSR | 7,054 B（读取语句本 Sprint 未改，增量 0） |
| ③ 补细候选 SQL | 26 B／天 |
| ③ 一位 actor 补一个阶段 | 65,899 B |

**月度折算（1000 人）**

- 并入 D39 用户路径的新增 = 78.31 MB（AI 与 mock 的 bootstrap 差额）+ 167.97 MB（每月 1 次 AI reanalysis，按全量计入，是上限）= **246.28 MB／月**。
- 并入 W0048a 后的三档累计：约 **4,120 ／ 4,180 ／ 4,659 MB**，三档都超 1.6 GB，需要登记 D32。
- 后台补细单列：约 **65.9 MB／月**（上限估计：每人每月 1 段）。

第二段的改动只给补细加了一条写入（更新计划的 analysis），读取不变，所以没有重测。

## review 处理（Codex：1×P1、5×P2，全部采纳）

1. **P1 同键并发互相结算**
   - 账本 `reserve` 增加 `owner`／`status`：重放不转让所有权，只有带 `takeover` 的租约持有者能接管仍在 reserved 的操作。目前带 `takeover` 的只有 memo 提取的认领胜者和快照 worker 的 job 租约持有者。
   - 计划流水线、手动重新分析：不是所有者时不执行、不结算，返回 409（`GENERATION_IN_PROGRESS`／`IN_PROGRESS`）或原结果。
   - 补全层：不是所有者的批次直接跳过。
   - W0048a 的账本、快照、memo 测试全绿；新增真实 PG 并发测试。
2. **P2 ai_regenerate 并发重复生成**：改为固定键加尝试序号的 single-flight，点击键不再进账本键。
3. **P2 补细丢 followups**：`applyPhaseRefinement` 现在接收 followups／who，并在同一事务里更新 `analysis.phases[i]`。为此仓储加了 `updatePlanAnalysis`。
4. **P2 12 段过不了保存校验**：AI 草稿接受 1–12 段，mock 维持原来按期限的约束。
5. **P2 targetCount 被修正后保存**：解析层改为严格校验，不再夹取。
6. **P2 id／别名泄漏**：复用 W0048a 的 `snapshotTextLeaksIds`，再加 C…／E… 别名规则，覆盖七类文字。

## 假设与额外阅读

**PLANNER 文件表之外新增或修改的文件**

- `tests/support/plan-ai-fixture.ts`
- `tests/capabilities/plan-ai-concurrency-postgres.test.ts`
- `features/plans/matching-repository.ts`（补细候选 SQL）
- `features/plans/repository.ts`（`updatePlanAnalysis`）
- `app/(app)/app/start/start-step-plan.tsx`（换键规则与提示）
- `iorbit-plan-client.ts`（错误带 reason）
- W0048a 侧：`features/ai-quota/{gate,ledger}.ts`、`features/network-analysis/{service,new-contact-layers}.ts`、`features/contacts/memo-extraction/job.ts`、`app/api/network/snapshot/handlers.ts`（P1 适配）
- 受影响的测试：`memo-extraction-job`、`network-new-contact-layers`、`app-start-guide`、`app-agent-guide-demo-page`

**按成熟惯例自定的可逆细节**

- 服务端给出明确失败后，客户端换新的幂等键；生成中或断线时沿用原键（Stripe 惯例）。
- 补细的账本键带东京日期：每段每天最多试 1 次。
- 快照生成失败时整份计划失败，不回退到旧快照。
- 用满后的置灰由 429 响应触发。
- 示例模式只在 AI 路径上判定。
- 同一活动跨阶段去重。
- 一年期 AI 计划的阶段统一用 quarter 粒度，模型给的周次整理成连续区间。
- 单次 HTTP 超时 90 秒。
- 补细提示词不带快照内容。
- 补细每天每批 50 人，超出的顺延，和 plan-phase 共用每日门。

**与其他文档不一致**

- GOAL.md 末尾写「一份计划最多 14 次请求」，是 revision 3 的旧口径；以 PLANNER revision 4 的 4 次为准。GOAL 未改。

**已知风险**

- 请求路径的所有者如果在执行中崩溃，操作会一直停在 reserved，当天计 1 次。它不会被别的请求接管，只会让同一个键持续返回 in-progress。客户端在收到明确失败后会换新键；同一个键在生成中则沿用原键。
- memo／快照 worker 由各自的租约接管，与 W0048a 一致。

## 交接（给 W0049～W0055）

**入口与契约**

- provider 名 `ai`，环境变量 `ORBIT_PLAN_GENERATOR=ai`。还需要 `DEEPSEEK_API_KEY` 和 live 数据库；任一缺失都 fail closed，不回退 mock。
- 生成器 id 是 `deepseek-plan-v1`（`AI_PLAN_GENERATOR_ID`）。
- `PlanAnalysisV1.snapshotId?`：指向快照；快照的 `planId` 也指回计划。
- `criteria.targetCount?`：1–5 的整数，缺省按 1 计（W0050 覆盖度用）。

**ai_regenerate**

- 入口：`POST /api/agent/plans/reanalyze`，`origin: "ai_regenerate"`。
- 条件：生效计划 `analysis.generator === "mock-template-v1"` 且 provider 是 `ai`，否则 400。
- creationKey 为 `ai-regenerate:<旧计划id>`；账本键为 `ai-regenerate:<旧计划id>#<n>`。

**补细**

- 触发时点：前一阶段成为当前时，由 `plan-phase` 维护任务补细。
- 幂等键：`plan-refine:<planId>:<i>`（plan_log）；账本键再加东京日期；走后台池，`purpose: plan_refine`。
- 补细后 `analysis.phases[i].detailed` 变为 true，并写入 followups／who。
- 第 3 段起的人脉需求要等补细后才出现在 `plan_items`。在此之前，W0050 覆盖度和 W0049 高亮只覆盖前 2 段。

**账本（W0048a 接口变更）**

- `reserve` 的返回值增加 `owner`／`status`，输入可传 `takeover`。
- 新调用方：请求路径不传 `takeover`，不是所有者时不得 beginCall／finish。

**新的错误原因**

- 409 `GENERATION_IN_PROGRESS`（计划生成）、409 `IN_PROGRESS`（手动重新分析）。

**生产切换清单（W0055 一并授权）**

- `ORBIT_PLAN_GENERATOR=ai`
- `ORBIT_NETWORK_ANALYSIS_GENERATOR=deepseek`
- W0048a 三张表的生产迁移（迁移即开启 memo 提取）

**本机库遗留**

- verify-legacy：AI 计划 v1。
- verify-expired：v2（mock next_plan）、v3（AI 重新生成）。
- 两条 user／plan 账本操作。浏览器 429 验证用的填充行已删除。

**回退**：按序 revert `0d6f1a67`、`d6321c99`。新增的接口字段都是可选的，计划表没有迁移。

**需要用户决定的事项**：无新增。D32 登记属于协调者惯例。

## 合并后修复（协调者追加，按 Generator 原文）

**合并后修复（W0048b run-01）**：合并树复跑时，`plan-ai-concurrency-postgres` 偶发失败。根因是 W0048a 账本的 `beginCall` 在同一操作被并发登记时，两边都算出 `count+1` 作为序号，撞了主键，又被误报成 MAX_CALLS。W0048b 的前 2 个阶段并行请求会触发这种并发，约一半 AI 计划会在第 2 段失败并计次（本机复现 99/200）。修复提交 `11b432c7`：`beginCall` 改为在一个事务里先 `for update` 锁住操作行，再用新语句计数、分配 `max(seq)+1` 并插入；主键冲突不再映射成 MAX_CALLS。新增真实 PG 用例：7 次并发 → 4 次成功、序号 1–4、3 次被拒；200 轮两路并发 → 0 次误拒。合并树受影响测试连跑 3 次，均为 382/382 通过、0 skip，源码 tsc 0 错。生产此前仍是 mock，没有受影响。

协调者裁决：采用「账本行锁」而非「阶段串行请求」（成熟做法：同一父记录下给子行编号先锁父行）；不上报用户。修复合并 `f4007c11`，协调者在合并树复跑 382/382、0 skip、tsc 源码 0 错。
