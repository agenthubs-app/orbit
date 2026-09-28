# Sprint W0018 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 11 个场景都从初始状态走过一遍，桌面 1440 和手机 375 各一遍。场景 1–9、11 在 3001 验收 server 上走；场景 10 在 3000（开关关闭）上走。
  - 每一步都记录了页面文字、接口请求与状态码、必要的数据库读回和控制台错误。控制台错误全部为 0。
  - 场景 1、2、3、4、6、7、8、10 通过；场景 5 修掉验收种子问题后通过；场景 9 部分通过；场景 11 按约定待周一复核。
  - 验收报告页面：`~/orbit-sprint-evidence/web/sprint-W0018/run-01/acceptance-report.html`（协调者已发布为 Artifact：https://claude.ai/artifact/JCCFpS5zxK9a74ecCwF65i）。
- `/app/agent` 读报名改为按账号 id 读，回归测试覆盖 legacy 投影和 canonical membership 两条读取路径。
- 仍未验证：
  - 推荐理由文案：现有数据下没有可显示的活动，页面上看不到。
  - 今日要事里「2 小时内开始的日程」排序：验收时是东京凌晨，没法验证。
  - 周一小结：待周一复核。
  - 三处较大问题登记为新 Sprint，见交接。

## 运行记录

- 结果：completed（合并前）
- Generator：Claude Opus 5.5，2026-09-29；Planner revision 2
- PLANNER SHA256：`331948451ed1474eb61710b5fbb46b15b2ec821dbcf8c123e2179c675192f396`
- 分支 `sprint/W0018-scenario-acceptance`，基线 `6c6916a8`
- 功能 SHA：`a20530a6`、`32943ac7`
- chat-agent 合并 SHA：等待协调者
- 档位：H
- 付费 AI：
  - 真实名片识别 6 张，18 次 provider 请求。合计 input 19,194 / output 3,055：
    - 转录：6 次，input 6,397 / output 730
    - 结构化：6 次，input 6,748 / output 1,983
    - 复核：6 次，input 6,049 / output 342
  - 没有触发方向回退。
  - 匹配 AI 1 次：deepseek-v4-flash，input 473 / output 135。
  - 计划生成是 mock，0 次。
- push：无
- REPORT 由协调者按 Generator 交回的正文落盘（子代理写 .md 被拦下）

### 全量基线对照

- 条件：
  - `ORBIT_EVENT_DATABASE_URL` 指向本机 `orbit_test`，`node scripts/assert-local-test-databases.mjs` 通过，没有 source `.env`。
  - 排除 `tests/pages/event-registration-readback.test.tsx`（基线就挂起）。
- 基线怎么跑：改动已经提交，所以对本 Sprint 改动的 3 个文件执行 `git checkout 6c6916a8 --`，并把新测试文件移走，跑完再恢复。
- 本分支：5666 项，pass 5341，fail 47，skip 278。
- 基线：5662 项，pass 5336，fail 48，skip 278。
- 新增失败：0。基线多出的 1 个失败是「PostgreSQL keeps shared appointment details idempotent and accepts only one concurrent version」，属于偶发并发用例。
- skip 都来自其他专用库变量未配置；因为 `ORBIT_EVENT_DATABASE_URL` 未配置而 skip 的为 0，PG 用例实际运行了。
- 失败清单：`logs/fail-sprint.txt`、`logs/fail-baseline.txt`

### 名片识别与 W0013 估算对照

| 口径 | 每张 input | 每张 output |
| --- | --- | --- |
| 本次 `bc_ingest_items.usage`（转录+结构化，不含复核） | 2,191 | 452 |
| 本地库历史 v1 行（31 条，无行业） | 1,136 | 305 |
| 本次含复核的每张总账 | 3,199 | 509 |

- 结构化这一步平均 input 1,125，其中包含约 500–560 token 的行业说明，与 W0013 的估算一致。
- 直接和历史 v1 行比是 +93%（input）/ +48%（output）。但历史行来自更早的流水线版本，两者不能直接相减。
- 行业识别正确率：可判定的 5 张里 4 张正确（法律、餐饮、社群运营、科技），1 张商社漏判为未分类；另 1 张名片上没写业务，留空合理。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0018-01 | pass（场景 9 部分通过，场景 11 待周一） | acceptance-report.html、logs/sc*.json，数据库读回写在报告各节 |
| SC-W0018-02 | pass | 见下方「SC-02 证据」 |
| SC-W0018-03 | pass | 新测试 `tests/pages/app-agent-registration-actor-id.test.tsx`，先 RED 4 项全失败，修复后 GREEN。`app-canonical-agent-personal-scope.test.ts` 的旧断言原来按会话 id 读，已改为账号 id |
| SC-W0018-04 | pass | 本文「运行记录」「名片识别与 W0013 估算对照」 |
| SC-W0018-05 | pass | 全量新增失败 0；`npx tsc --noEmit -p .` 通过；受影响测试 42/42 |

SC-02 证据：

- 报名 id：新增的回归测试。
- 种子活动日期：修复前计划页显示「— / 参加「…」」，修复后显示「10/9 验收用：企业软件创业者交流会」（`sc05-desktop-plan-initial.png`）。
- 指纹误报：修复前 `--reset verify-new` 报「非 verify-* 行在执行前后不一致：bc_ingest_items」；修复后，在页面上真实上传过名片再执行 `--reset verify-legacy`，不再报错。

## 假设与额外阅读

- 上下文包之外读过的文件：
  - 写回归测试需要替换 runtime 底下的存储：`features/events/registration/runtime.ts`、`app/(app)/app/canonical-event-detail-view.ts`
  - 本机名片解析：`scripts/seed-verify-accounts.ts`、`features/acquisition/business-card-ingest-v2/{worker,repository,configured}.ts`、`scripts/run-business-card-ingest-v2-worker.ts`
  - 用量计数：`features/acquisition/deepseek-business-card-ocr-provider.ts`、`features/plans/ai-matcher.ts`
  - 定位控件和判断现象：`iorbit-home.tsx`、`iorbit-plan.tsx`、`plan-match-sheet.tsx`、`use-card-batch.ts`、`iorbit-strategy.tsx`、`start/*.tsx` 的相关片段
- 本机没有常驻名片解析 worker，3001 只收上传。为了只处理 verify-* 账号，在 scratchpad 写了一个受限 worker：claim 时加条件 `actor_id like 'user_verify_%'`，不做 sweep、reap、通知和清理。用完即停，没有提交。用户新账号在 02:07 上传的一批 3 张因此仍在排队，没有被处理。
- 按请求计数：临时在 provider 和匹配器里各加一行 `console.info`，只在本机输出 token 数；计数结束后已还原，没有提交。匹配 AI 的用量取自 `plan_match_jobs.ai_usage`。
- 截图和交互用 Playwright 无头浏览器，因为需要把 png 落盘；内置浏览器只做了 3001 登录态抽查。
- 场景 10 需要 3000：验收时 3000 没在跑，按 `orbits` 配置启动，只连本机库，用完已停止。
- 场景 2 的手机端走「先这样，继续」路径（0 张名片），既验证了不足 3 张时可以跳过，也不额外消耗真实识别。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex `codex review --base chat-agent`（全文 `codex-review.txt`）：无意见——报名读取统一用写入时的账号 id，种子与指纹改动与数据模型一致 | — | 无需修改 |

## 交接

- **W0022 首页引导入口与策略页**
  - 老用户首页「帮我制定推进计划 →」仍指向 `/app/agent/strategy`，建议没有计划时改为指向引导第 3 步。
  - RW-04 要求第 4 步以提醒形式留在 iOrbit，首页没有看到这个提醒。
  - 策略页「先联系谁」显示「来源暂时不可用」。
  - 推荐理由需要一组能匹配上的活动数据，才能在页面上复验。
- **W0023 到期计划的「约 TA」周次**
  - `features/plans/service.ts` 关联联系人时，周次用的是 `min(maxWeek, planWeekAt(...))`。计划到期后，新生成的行动落在第 55 周（计划共 52 周）。
  - 这涉及写入语义，所以不在本 Sprint 修。
- **W0024 活动页报名口径**
  - `app/(app)/app/events/page.tsx` 按会话 id 读报名，和本次修的 `/app/agent` 是同一类问题。
  - 修复需要在该页多一次读取，要按流量口径评估。
- 观察项（不单开 Sprint）：
  - 目标存储时带「（3 个月内）」后缀，计划页标题字面重复。
  - 名片解析完成的瞬间，可靠的名片先显示「需要核对」，随后才被自动导入。
  - 首次进入 iOrbit 时，「解析完毕」弹层会盖住首页一次。
  - 重新分析没有确认步骤。
- 交给 W0020 在 Preview 复验：场景 1、2、4、8、10，外加场景 11（周一复核）。
- 需要告诉用户：本机要解析名片，需另起 `npm run ingest-v2:worker`。
- 回退：`git revert 32943ac7 a20530a6`；数据用 `seed-verify-accounts.ts --reset <账号>` 恢复。
