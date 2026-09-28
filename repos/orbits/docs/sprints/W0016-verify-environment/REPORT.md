# Sprint W0016 — 执行总结

对应 [GOAL.md](GOAL.md)。（Generator 子代理无法写报告文件，正文由其交回、协调者落盘。）

## 结果

- 已验证能做到：
  - 在同一目录起第二个验收 server（端口 3001，构建目录 `.next-verify`），示例开关打开、连本机开发库；3000 端口的 server 照旧用 `.next`、示例开关关闭。同一个 verify-new 会话 cookie 请求两个端口的 `/app/agent`，3001 出现示例横条，3000 没有（SC-01）。
  - 一条命令造出 5 个测试账号及各自场景（外加 1 个主办方辅助账号）。连续执行两次结果一致；非 verify-* 行执行前后指纹完全一致；连接串 host、库名、workspace 任一不符时拒绝执行；单账号重置后回到初始状态（SC-02）。
  - 5 个账号登录 3001 后首屏符合用途：verify-new 看到示例横条；verify-legacy 看不到、引导页停在第 3 步；verify-plan 第 2 周、1 条「已延后 1 周」、已关联的人脉需求、1 个已报名活动；verify-expired 显示「计划到期回顾」；verify-event 今天有已报名活动、「确认 3 张新名片」，确认页问「这张名片是在「验收用：金融科技创业者之夜」认识的吗？」（SC-03）。
  - 名片合照裁成 13 张单张图片，放在仓库外（SC-04）。
- 仍未实现或未验证：
  - 合照里只有 13 张不同的名片（`random_meishi.heic` 是同一批 13 张的随意摆放），不是 PLANNER 写的「约 17 张」。
  - 浏览器首次访问 `localhost:3001` 时，面板里已经有另一个测试账号 `onboarding-1790423522@orbit.test` 的登录会话，页面因此给它写了一条引导记录 `guideState`（`{"grandfathered": false}`）。这是整个 Sprint 唯一被改动的非 verify-* 行，种子脚本本身不涉及。它改变了之后指纹的基线（`aecccc55…` → `cc3bd684…`），已核实排除这一行后指纹仍是 `aecccc55…`。是否删除待用户决定，见「交接」。

## 运行记录

- 结果：completed（合并 SHA 见 README 运行记录）
- Generator：Claude Opus 5.5 / 2026-09-28；Planner revision 3，SHA256 `4afdeaabed55dc6092e09e163fac31a12828828ca450ebc98dac74f8d6528a0d`（开工时核对一致）
- 分支 `sprint/W0016-verify-environment`；功能 SHA `d02be606`；根 `.claude/launch.json` 的 `orbits-verify` 配置由协调者随报告提交
- 档位 L；没有跑全量。另跑了 `next.config.js` 的直接消费者 `tests/api/cors-config.test.ts`：2/2 通过；`npx tsc --noEmit -p .` 退出码 0
- 付费 AI 调用 0 次，token 0；3001 server 日志里没有 deepseek 调用；未 push

## 验收结果

| SC | 结果 | 证据（`~/orbit-sprint-evidence/web/sprint-W0016/run-01/`） |
| --- | --- | --- |
| SC-W0016-01 | pass | `logs/03-sc01-two-ports.txt`：同一 cookie 请求两个端口，3001 有 `data-orbit-guide-demo="on"` 和横条，3000 没有；`.next` 和 `.next-verify` 并存；`git check-ignore` 命中 `.gitignore:3`，`git status` 里没有 `.next-verify` |
| SC-W0016-02 | pass | `logs/00`（初次执行前没有任何 verify-* 行）；`logs/01-refusals.txt`（host / 库名 / workspace 三种不符都以退出码 1 拒绝）；`logs/02-seed-run1.json`、`02-seed-run2.json`（两次执行的指纹都是 `aecccc55…`，账号状态逐项相同）；`logs/05`–`10`（重置 verify-new / plan / event / legacy：`guideState` 从 `{grandfathered:true}` 回到 null，状态等于初次执行的结果，指纹前后一致） |
| SC-W0016-03 | pass | `logs/04-sc03-page-checks.md`（每个账号的页面文本节选）；`screens/*.png`（桌面 1440 与手机 375 共 14 张）；控制台错误 0 条 |
| SC-W0016-04 | pass | `cards/card-01.jpg`–`card-13.jpg`，已校正方向；清单见 `logs/11-sc04-cards.txt` |

## Codex 代码 review

L 档，按 RULES §1.1 不做代码 review；协调者合并后跑 typecheck 与直接消费者测试。

## 假设与额外阅读

- 额外读过的文件：`features/guide/{guide-state,service-factory,start-steps}.ts`、`app/(app)/app/_demo/demo-guide-view.ts`、`app/(app)/app/agent/page.tsx`、`app/api/_shared/authenticated-actor.ts`、`auth.ts`、`features/auth/{session-revocation,storage/*}.ts`、`features/profile/onboarding.ts`、`app/(app)/app/profile/profile-onboarding-*.ts`、`features/events/{core/service,core/storage/postgres-repository,registration/runtime,registration/storage/event-operations-window-provider,event-operations/seed}.ts`、`features/events/event-operations/storage/{postgres-repository,canonical-registration-repository}.ts`、`features/plans/{contract,week,event-attribution*}.ts`、`features/acquisition/business-card-ingest-v2/{contract,derivative-store,image-write-journal}.ts`、`app/(app)/app/agent/iorbit-0918/use-pending-cards.ts`、`app/(app)/app/contacts/card-batch-0918/card-batch-store.ts`、`shared/mock/account-contact-fixtures.ts`。`nextConfig` 的 GitNexus impact 为 UNKNOWN，文本搜索补查：直接消费者只有 `tests/api/cors-config.test.ts` 和 `tests/smoke.test.tsx`。
- PLANNER 文件表之外新增或修改：
  - `scripts/lib/verify-database-target.ts`：三重断言的共用模块（放进种子脚本会让 cookie 脚本 import 时执行种子）。
  - `tsconfig.json`：Next 启动 `.next-verify` 时会自动往 `include` 加两行；提交后每次启动验收 server 工作树保持干净。两个构建目录并存时 typecheck 通过。
- 活动需要主办方，另加辅助账号 `verify-host@orbit.test`（`user_verify_host`）。
- 联系人复用 `shared/mock/account-contact-fixtures.ts`。canonical 活动行（`event_ops_events`／`event_event_versions`／`event_aliases`）和名片批次（`bc_ingest_*`）用 SQL 直接写，不改产品代码；配置和报名走仓储 API（`saveConfiguration`、`saveRegistration`、`activateCanonicalRegistrations`）；计划走 `resolvePlanService`（`createVersion`、`markEventRegistration`、`linkNeedContact`、`updateItem`）。
- 名片批次的 3 张卡片是合成数据（虚构人名／公司，邮箱用 `.example` 域名），占位图存到 `.orbit-batch-uploads/ingest-v2/`（已 gitignore）。真实名片照片留给 W0018 上传。
- 「已延后行动」采用 W0009 口径：`suggestedWeek` = 1 的行动在第 2 周显示「已延后 1 周」。
- verify-plan、verify-expired、verify-event 创建时间早于 SINCE 且 ≥3 位联系人，首次判定即老用户，不进示例。
- 重置做法：在所有 public 表里删除 JSON 文本含本账号标记的行（`user_verify_*`、`verify-*@orbit.test`、该账号独占的 `orbit-verify-event-*`），外键顺序靠 savepoint 分轮处理，再按场景重建。指纹标记为 `(user_verify_|verify-[a-z]+@orbit\.test|orbit-verify-)`。

## 交接（给 W0018）

命令都在 `repos/orbits` 下执行：

- 启动验收 server：`preview_start {name: "orbits-verify"}`（根 `.claude/launch.json`），或 `bash repos/orbits/scripts/verify-server.sh`。端口 3001，构建目录 `.next-verify`；注入 `ORBIT_GUIDE_DEMO=on`、`ORBIT_GUIDE_DEMO_SINCE=2026-09-01`、live 模式、`ORBIT_EXPECTED_DATABASE_HOST=localhost`、`ORBIT_EXPECTED_WORKSPACE_ID`，其余读 `.env.local`，AUTH_SECRET 与 3000 相同。启动前先做本机库断言。
- 造全部账号（可重复）：`node --import tsx scripts/seed-verify-accounts.ts`
- 单账号重置：`node --import tsx scripts/seed-verify-accounts.ts --reset <verify-new|verify-legacy|verify-plan|verify-expired|verify-event>`
- 只读查看：`--summary`（各账号状态）、`--fingerprint`（非 verify-* 行指纹）。
- 取 cookie：`node --import tsx scripts/verify-session-cookie.ts <账号>`（加 `--header` 输出 `authjs.session-token=…`），只输出到 stdout。
- 浏览器里换账号：用 `http://127.0.0.1:3001`，**不要用 localhost**（localhost 上可能有 3000 写的 httpOnly 会话，cookie 不分端口）。换账号前先 `GET /api/auth/csrf` 取 token、`POST /api/auth/signout`，再用 `document.cookie` 写入新 cookie。

| 账号 | 用途与初始状态 |
| --- | --- |
| verify-new@orbit.test | 全新用户：创建于 2026-09-20（晚于 SINCE），0 联系人、无目标、无计划 → 示例与引导 |
| verify-legacy@orbit.test | 老用户：创建于 2026-06-01，4 位联系人，有目标，无计划 → 不进示例；`/app/start` 停在第 3 步 |
| verify-plan@orbit.test | 3 个月计划，开始日 = 今天 − 8 天（第 2 周）；1 条「已延后 1 周」；人脉需求已关联 林玫（附「约 林玫」行动）；已报名 `orbit-verify-event-upcoming`（今天 + 10 天 19:00 JST） |
| verify-expired@orbit.test | 一年期计划，开始日 = 今天 − 380 天（第 55 周 > 52 周），3/6 件行动已完成 → 到期回顾 |
| verify-event@orbit.test | 已报名 `orbit-verify-event-today`（今天 18:00–24:00 JST）；计划含这场活动（已报名）和金融科技、AI 数据两条人脉需求；今天创建的待确认批次 `bcb2:orbit-verify-event-batch`（3 张，行业已填：金融科技 / AI 数据 / 机器人）。确认页 `/app/contacts/new?job=bcb2%3Aorbit-verify-event-batch`；今日要事里的「确认 N 张新名片」需先 `localStorage['orbit.cardBatches.active.v1'] = '["bcb2:orbit-verify-event-batch"]'` |
| verify-host@orbit.test | 辅助账号：两场合成活动的主办方 |

- 「今天」按执行种子时的东京日期算。跨过东京午夜后先 `--reset verify-event` 再验活动归属；verify-plan 的周次同理。
- 真实名片单张图：`~/orbit-sprint-evidence/web/sprint-W0016/run-01/cards/card-01…13.jpg`。
- 待用户决定：浏览器检查时误写的引导记录（账号 `onboarding-1790423522@orbit.test`，`guideState`，2026-09-28 23:18 JST 创建，内容 `{"version":2,"grandfathered":false}`）删除恢复原状，还是保留。删除后该账号下次在示例开关打开时重新判定。
- 回退：`git revert d02be606`；数据用各账号 `--reset`，或按上面的标记删除全部 verify-* 行。

## 协调者合并验证（追加）

- 合并 `93cf669f` 后：`npx tsc --noEmit -p .` 通过；`tests/api/cors-config.test.ts` 2/2。
- 已知现象（交 W0018）：3001 验收 server 启动时 Next 会把 `next-env.d.ts` 改成引用 `.next-verify/dev/types/routes.d.ts`，工作树出现一处修改；**不要提交它**，收尾时 `git checkout -- next-env.d.ts`。另外 `.next-verify` 重建后 `tsconfig.tsbuildinfo` 可能过期导致 typecheck 报 TS6053 找不到文件，删掉 `tsconfig.tsbuildinfo`（已 gitignore）再跑即可。

