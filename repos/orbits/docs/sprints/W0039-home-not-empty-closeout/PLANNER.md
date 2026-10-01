# Sprint W0039 — 大目标 3「首页不再空」收口

**Plan revision:** 3（2026-10-01 按 [REVIEW-2026-10-01](../REVIEW-2026-10-01.md) 修订：示例期调用矩阵、验收活动必须落在当前东京月，见文末修订记录；revision 2 写入 D38 决定）。**模式:** existing-codebase / single-generator（验收型，默认无源码改动）。运行状态只在登记表。
**原需求:** RH-05（大目标全部合并后一次全量对照；3001 走「新用户三步引导 → 首页非空」与「老用户有计划无人脉」两条路径，1440 与 375 各截图）。D37。
**单一目标:** 用全量对照、两条真实路径截图和 GitNexus 变更对比，证明 RH-01～RH-04 合起来在真实页面成立且没有引入回归。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 大目标 3 开工 SHA `08fe51db`（W0035 开工前的 `chat-agent` HEAD）；对照目标为 W0038 合并后的 `chat-agent` HEAD（开工时记录）。
**进入条件:**
- W0035、W0036、W0037、W0038 在登记表均为 completed，且各自合并 SHA 已记录。
- 各 REPORT 的接口以 REPORT 为准（尤其 W0036 的活动池接线——`IOrbitHome` 内部 `eventPool`／`eventPoolReady` 与示例期 `demoEventCandidates` prop，不是活动池 prop——、补人脉「7 天内不再提示」与「今天先不做」的存储键、W0037 的社群卡选择器、W0038 的月历点选择器）——Generator 开工时从这四份 REPORT 摘出选择器与存储键，这是本 Sprint 唯一允许读的前序 REPORT。
- W39-1 用户已于 2026-10-01 决定（D38），见下表「已定决定」。
- **验收活动落在当前东京月（review P2-05；月历没有翻月能力，W0038 已排除翻月）。**开工时记东京今天 D 与当月最后一天 E。`verify-plan` 的已报名活动在 D+10、推荐活动在 D+24（事实 2）：
  - D+24 ≤ E：直接用 seed。
  - D+24 > E 且 D < E：`--reset verify-plan` 之后重建专用 fixture——只把这两场「验收用：」活动的开始／结束时间移到 (D, E] 内的东京日期（报名关系、标题与描述里的目标词不变），读回以首页与 `--summary` 为准；用仓库外的一次性脚本或本机库语句，放进证据目录、不提交；前后 `--fingerprint` 证明非 verify 数据不变；收口时再 `--reset verify-plan` 恢复。若必须改仓库源码（如给 seed 加日期锚点）才能做到，本 Sprint 不改，SC-03 记「受阻」，由协调者另开 Sprint。
  - D = E（东京月末最后一天）：不开工，顺延到条件成立（下月 1 日起）。
  - 不得用「翻月查看」代替。
- 本机 `localhost:5432` 测试库可用（`node scripts/assert-local-test-databases.mjs`）；3001 验收 server 可启动；不需要云端授权，不调用付费 AI（3001 计划生成走 mock：`ORBIT_PLAN_GENERATOR` 未设置，缺省 `mock`，`features/plans/generator-service-factory.ts:6–32`）。

## 已查清的事实（2026-10-01 按 `08fe51db` 复核）

1. **验收 server。** `.claude/launch.json` 的 `orbits-verify` 运行 `repos/orbits/scripts/verify-server.sh`：端口 3001、独立构建目录 `.next-verify`、`ORBIT_GUIDE_DEMO=on`、`ORBIT_GUIDE_DEMO_SINCE=2026-09-01`、钉在本机库 `orbit_newui_events_20260922` 与 `workspace:orbit-small-staging-20260917`；启动前 `seed-verify-accounts.ts --assert-only` 断言本机库。启动后 `next-env.d.ts` 会被改，不提交。
2. **账号（`scripts/seed-verify-accounts.ts:93–167`、场景 `964–1030`）。**
   - `verify-new`：0 位联系人、无目标、创建于 2026-09-20（晚于 SINCE → 不是 D2 老用户），无计划 → 进首页是**示例模式**。
   - `verify-plan`：5 位联系人（<10）、有目标、创建于 2026-03-01（D2 老用户），3 个月计划处于第 2 周、含 1 条已延后行动和已关联的人脉需求；报名了「验收用：企业软件创业者交流会」（今天 +10 天），另有 1 场未报名、文字含目标词的「验收用：企业软件早期路演会」（今天 +24 天，W0026）。正好覆盖「有计划、联系人 <10、月历有已报名与推荐两类」。
   - 日期相对 seed 运行当天（`seed-verify-accounts.ts` 第 987、999 行 `tokyoDateOffset(runtime.now, 10／24)`，`runtime.now` 固定为 `new Date()`，第 1150 行，没有日期参数）。首页月历只显示当月（`iorbitCalendarCells(todayYear, todayMonth)`，唯一按钮是周／月折叠，`iorbit-home.tsx:1234` 一带），**没有翻月**：日期不满足时按进入条件重建专用 fixture。
   - 登录态：`node --import tsx scripts/verify-session-cookie.ts <账号>`；恢复：`node --import tsx scripts/seed-verify-accounts.ts --reset <账号>`；只读状态：`--summary`。
3. **新用户三步怎么走不花钱。** 第 1 步用「先这样，继续」跳过（写 `step1Skipped`，不扫名片、不调识别 AI）；第 2 步填目标；第 3 步「开始分析」走 mock 计划生成。做完 0 位联系人 → 补人脉提示条件（<10）成立。
4. **全量对照的先例。** W0032／W0034：`git archive` 导出两个 SHA 到仓库外临时目录对称运行，排除 `tests/pages/event-registration-readback.test.tsx`（基线就挂起），不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，不 source `.env`，跑完删除副本；W0034 实测基线 5828 项／48 失败。跨多个 Sprint 的对照不能用 RULES §5.2 的 `git stash` 法，按此先例做。
5. **GitNexus。** 索引当前在 `08fe51d`；收口前要在合并后 HEAD 上 `node .gitnexus/run.cjs analyze --index-only` 刷新，再 `node .gitnexus/run.cjs detect-changes --scope compare --base-ref 08fe51db --repo .`（在 `/Users/li/work/orbit` 运行）。

## 已定决定（用户 2026-10-01：D38，全按推荐）

| 编号 | 决定 |
| --- | --- |
| W39-1 | 收口**分两个时刻截图**（新用户做完 3 步后今日要事必有计划行动，小模组此时只是一行，同一时刻看不到社群置顶）：①刚做完引导：今日要事非空、含计划行动，活动收成一行（东京本周池内 N=0 时整行不显示，如实记录）；②同一账号把计划行动点「今天先不做」（不补位，W36-3）、补人脉点「7 天内不再提示」后，今日要事为空，活动小模组展开、社群卡第一、两场活动带理由。另在示例首页（引导开始前）截一次固定展开的活动小模组（W37-1）。不新造账号、不改 seed 脚本（日期不满足时的专用 fixture 见进入条件） |

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- 本目录 GOAL.md、`../REQUIREMENTS.md` 的 RH-01～RH-05（产品契约，验收口径以它为准）。
- W0035～W0038 的 REPORT：**只摘**选择器、存储键、prop 名、已知遗留，不复核实现。
- `scripts/verify-server.sh`、`scripts/seed-verify-accounts.ts:93–167、964–1030`、`scripts/verify-session-cookie.ts:1–30`。
- `scripts/run-node-tests.mjs`（`npm test` 的入口，确认排除参数写法）。

### 关键符号与影响等级
- 本 Sprint 默认不改源码，不需要 pre-edit impact。若触发「小问题内修」，对被改符号先跑 upstream impact；CRITICAL／HIGH（`IOrbitHome` 为 CRITICAL）不在本 Sprint 内修，改为另开 Sprint。

### 前序交接要点
- W0035：引导 3 步；首页第 4 步提醒已删；`?step=4` 忽略；存量 `currentStep = 4` 兼容。
- W0036：今日要事吸收计划行动（≤2、拖期优先、带「本周计划 · 第 N 阶段」来源；「最多 3 条」只约束新加项）与补人脉（<10 人，无计划时不提阶段）；「今天先不做」按东京日期存浏览器本地、不补位；共享推荐活动池（`features/agent/home-event-pool.ts`，`IOrbitHome` 内部 `eventPool`／`eventPoolReady`，示例期 `demoEventCandidates`；位置以 W0036 REPORT 为准）；示例期不加计划行动。
- W0037：活动小模组（社群置顶 + 2 场；有要事时缩成一行「本周还有 N 场」，东京周一至周日、N=0 不显示；不显示费用行）；已报名栏只放报名；示例首页小模组固定展开，活动与社群是真实数据，可真实点「我已加入」。
- W0038：月历实心（日程／已报名）与空心（推荐，当月 ≤5 场）点、图例；圆点不可点，点日期选中、点时间线条目跳转；示例期画真实推荐；空日程行显示下一场活动（已报名最早，否则池内最早）。
- W0021：首页 `plans/current` 每次冷启动最多 1 次。W0004／W0036／W0037：示例期服务端调用矩阵——既有示例判定复合 home 读取 1 次（`page.tsx:151–167`，不注入示例壳）、W0036 新增目录 1 次与报名 1 次、W0037 再新增社群 1 次，其余 0 次；客户端对真实接口 0 请求（「我已加入」的 PUT 除外，W37-1）。

### 易错边界（都对应到 SC）
- **全量对照看新增失败，不看全绿**；两份副本同条件对称运行，不 source `.env`。（SC-01）
- **不花钱、不碰真实数据**：第 1 步跳过而不扫名片；计划用 mock；只操作 `verify-*` 账号，结束后 `--reset verify-new`、`--reset verify-plan`，并用 `--fingerprint` 前后对比确认非 verify 数据不变。（SC-02、SC-03、SC-05）
- **浏览器本地状态要清**：「今天先不做」「7 天内不再提示」写在浏览器本地，验完清掉对应键，不影响后续 Sprint 的浏览器验证。（SC-02）
- **网络口径**：首页冷启动 `plans/current` ≤1 次；示例首页按上面的调用矩阵核对（服务端操作级调用数与底层语句数以 W0036、W0037 REPORT 为准，本 Sprint 只核浏览器侧：客户端对真实接口除「我已加入」外 0 请求）。（SC-02）
- **日期**：验收活动必须落在当前东京月；不满足时按进入条件重建 fixture 或顺延，不翻月。（SC-03）
- **无源码改动**：默认 diff 只有本目录 REPORT.md；内修只限文案／样式级、两轮以内、非 HIGH／CRITICAL 符号，并登记；超出即停，记 blocked／failed 并建议新 Sprint。（SC-05）

## 范围与文件

- **读取：** 上下文包所列；不做全库再盘点。
- **修改：** 无源码。新建 `docs/sprints/W0039-home-not-empty-closeout/REPORT.md`。
- **证据：** `~/orbit-sprint-evidence/web/sprint-W0039/run-01/`（全量清单、截图、控制台与网络记录、`detect-changes` 输出、seed 指纹）。
- **排除：** 3000（开关关闭）回归（W0035 已验）、Preview／生产、付费 AI、性能测量、新增测试。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0039-01 | 全量对照：`08fe51db` 与合并后 HEAD 两份 `git archive` 副本对称跑 `npm test`（排除 `event-registration-readback`、不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`、不 source `.env`），`comm -13` 新增失败为 0；变绿与跳过数变化逐条说明；合并后 HEAD 上 `npx tsc --noEmit -p .` 通过 | `full-base.txt`、`full-head.txt`、`fail-base.txt`、`fail-head.txt`、`fail-new.txt`、`typecheck.txt` |
| SC-W0039-02 | 新用户路径（`verify-new`，3001）：①示例首页的活动小模组显示真实活动与社群，其余为示例数据；②引导页是 3 步，跳过第 1 步、填目标、mock 生成计划；③回首页今日要事非空，含 ≤2 条带「本周计划 · 第 N 阶段」来源的计划行动和补人脉提示，头条按首条要事拼接，活动小模组缩成一行「本周还有 N 场适合你的活动 →」（N=0 时整行不显示，如实记录）；④把计划行动「今天先不做」、补人脉「7 天内不再提示」后，今日要事为空，活动小模组展开为社群卡第一 + 2 场活动（日期星期、标题、地点、真实推荐理由；没有费用行）；首页冷启动 `plans/current` ≤1 次；示例期按调用矩阵（服务端：既有复合 home 1 次、目录 1、报名 1、社群 1，以 W0036／W0037 REPORT 的计数为准；浏览器：除「我已加入」PUT 外对真实接口 0 请求）；①～④ 在 1440 与 375 各截图，控制台 0 错误 | 截图、控制台与网络记录（按 W39-1 的分时刻口径）、清理浏览器本地键的记录 |
| SC-W0039-03 | 老用户路径（`verify-plan`，3001）：今日要事有补人脉提示（5 位 <10），文案引用计划当前阶段，按钮打开名片上传区（只打开、不上传）；有计划行动且拖期的那条排在前面并标「已顺延 N 周」；月历上已报名活动为实心靛蓝点、推荐活动为空心浅色圈、下方有图例，点空心圈所在日期选中后，点时间线里的推荐条目进活动详情；底部「已报名活动」只有报名、没有社群行和「看看推荐」；首页没有引导第 4 步提醒；1440 与 375 各截图，控制台 0 错误 | 截图、控制台记录；REPORT 写开工东京日期 D、月末 E、两场活动的日期，以及是否重建了专用 fixture（脚本放证据目录、指纹前后对比） |
| SC-W0039-04 | GitNexus：在合并后 HEAD 刷新索引，`detect-changes --scope compare --base-ref 08fe51db` 结果不是 `partial`／`truncated`；受影响符号与执行流逐项落在 W0035～W0038 REPORT 声明的范围内，范围外的项逐条解释或登记为后续 | `detect-changes.txt`、对照表（符号 → 所属 Sprint／解释） |
| SC-W0039-05 | 收口纪律：本 Sprint diff 只有 REPORT.md（或登记过的小问题内修）；`verify-new`、`verify-plan` 已 `--reset`，`--fingerprint` 前后一致（非 verify 数据不变）；未提交的用户文件未被暂存；发现的问题按「小问题内修／大问题另开」处置并在 REPORT 列出 | `git diff --stat`、`fingerprint-before.txt`／`fingerprint-after.txt`、`summary-after.txt`、问题清单 |

## 一次 Generator 的执行顺序

1. 复核进入条件（四个前序 completed；W39-1 已由 D38 决定；东京日期条件），记录合并后 HEAD、Planner 哈希、`git status`、seed `--fingerprint`。D = E 时停下顺延。
2. 先启动全量对照（两份副本依次跑，耗时长，可与第 3 步并行，但不与 3001 争用同一测试库写入时段）。
3. `preview_start {name:"orbits-verify"}`；`--reset verify-new`、`--reset verify-plan`；若 D+24 > E，按进入条件重建 `verify-plan` 的专用 fixture 并在首页确认两场活动都在当月月历上；按 SC-02、SC-03 走两条路径，桌面与手机各一次；清理浏览器本地键。
4. 刷新 GitNexus 索引，跑 `detect-changes` compare，写对照表。
5. 恢复账号、复核指纹；写 REPORT（结果、SHA、SC 表、问题清单、证据路径）并只提交 REPORT；交接给协调者合并、登记 completed。

## 最小测试与检查

- **档位：I（集成收口）。** RULES §1.1「一个大目标全部合并后再跑一次全量」与 §5.1 I 档。
- **全量：** 一次，按 SC-01 的对称副本法；这是本 Sprint 唯一的产品测试运行。
- **浏览器：** 3001 两条路径 × 1440／375。
- **不运行：** 定向集（已在各 Sprint 跑过且代码未再变）、PG 差分、Preview、付费 AI、Codex 代码 review（无源码改动）。若触发内修，补跑被改文件所在测试与 typecheck。

## 失败与交接

进入条件缺项则不启动。全量出现新增失败：先确认是否偶发（只重跑该文件两次）；稳定复现则定位到所属 Sprint，按大小处置——小问题内修并登记，否则本 Sprint 记 failed、建议新 Sprint，不在这里改 H 档符号。路径验证不过同理。REPORT 写 W39-1 的执行结果（D38：分两个时刻截图）、全量数字、两条路径截图路径、`detect-changes` 对照、账号恢复与指纹结果。

## 修订记录

| review 意见（[REVIEW-2026-10-01](../REVIEW-2026-10-01.md)） | 处理 |
| --- | --- |
| P2-01（示例期读取计数与源码不符） | 接受。前序交接、易错边界、SC-02 改为调用矩阵：既有示例判定复合 home 1 次（不注入示例壳）、W0036 目录 1 次与报名 1 次、W0037 社群 1 次；操作级与语句数以两份 REPORT 为准，本 Sprint 只核浏览器侧 |
| P2-05（月末建议了不存在的翻月） | 接受。删「翻月查看」；进入条件按东京日期分三档：D+24 ≤ 月末直接用 seed，否则重建只动两场 verify 活动的专用 fixture（仓库外脚本、指纹对比、收口 `--reset`），月末最后一天顺延；必须改源码才能造时记「受阻」另开 Sprint。调整：没有选「改 seed 加日期参数」，因为本 Sprint 不改源码 |
| P1-01～P1-04、P2-02～P2-04、P3-01 | 不涉及本 Sprint |
