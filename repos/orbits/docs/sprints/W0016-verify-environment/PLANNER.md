# Sprint W0016 — 验收环境与测试数据

**Plan revision:** 2（2026-09-28 按 Codex 方案 review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-01。**单一目标:** 开示例开关的验收 server（3001）+ 可重复执行的测试账号种子脚本 + 单张名片图片。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD。
**进入条件:** 大目标 1 全部 completed；`/Volumes/ORICO` 已挂载（未挂载则停下询问用户，不回落到内置盘）。

## 上下文包（从这里起步，不通读其他 REPORT）

- 必读文件：
  - 根 `CLAUDE.md` 的 Git Worktree Policy：worktree 只能建在 `/Volumes/ORICO/Dev/worktrees/orbit/<name>`。
  - `.claude/launch.json`（仓库根，不在 `repos/orbits` 内）：现有 `orbits` 配置（端口 3000）。同一目录不能起第二个 `next dev`（`.next` 冲突），所以验收 server 跑在 worktree 里。**根目录的 launch 配置由协调者添加**（`repos/orbits/AGENTS.md` 只允许 Generator 改本仓库）；Generator 在仓库内提供 `scripts/verify-server.sh` 供协调者调用。
  - `shared/storage/live-database-config.ts`：未设 `ORBIT_DATABASE_TARGET` 时按 `ORBIT_EVENT_DATABASE_URL` → `ORBIT_LIVE_DATABASE_URL` → `ORBIT_DATABASE_URL` 取库；`repos/orbits/.env.local` 里 `ORBIT_EVENT_DATABASE_URL` 指向 `localhost:5432/orbit_newui_events_20260922`。
  - `shared/config/guide-demo.ts`：`ORBIT_GUIDE_DEMO` 开关的解析；`ORBIT_GUIDE_DEMO_SINCE` 为老用户判定日期（只写日期表示东京 00:00）。
  - `features/guide/progress.ts`：引导进度与 D2 老用户口径（早于 SINCE 且首次判定 ≥3 位已确认联系人；createdAt 读不到时只看 ≥3）。
  - `scripts/seed-primary-test-account.ts` 与 `scripts/lib/primary-test-account.ts`（`ensurePrimaryTestAccount`、`PRIMARY_TEST_ACCOUNT`）：现成的测试账号建法，照着写。
  - `tests/pages/web-tasks.browser.mjs` 第 4、13 行：`encode({ secret, salt: "authjs.session-token", token: { sub, email, name } })` 生成会话 cookie（RULES 5.4：不在登录表单输密码）。
  - 计划：`features/plans/service-factory.ts` 的 `resolvePlanService`；`createVersion`（首份计划）、`markEventRegistration`、`updateItem`。
  - 活动与报名：`features/events/registration/runtime.ts`（报名按账号 id `actor.id` 写入）；已发布 canonical 活动目录 `features/events/core/public-catalogue.ts`。
  - 名片批次：`app/api/contact-drafts/business-card/batches/v2/`；批次条目的 `createdAt` 决定活动归属窗口（W0015：报名活动开始日当天或次日，东京时间）。
- 前序交接要点：
  - 计划、匹配相关迁移已在本机库执行过（W0007／W0010 报告）；执行前用 `scripts/assert-local-test-databases.mjs` 确认连的是本机库。
  - 示例数据全在前端 `app/(app)/app/_demo/`，不需要造。
- 易错边界：
  - **只写本机开发库**：脚本开头同时断言 host 为 localhost／127.0.0.1、数据库名精确等于 `orbit_newui_events_20260922`、workspace 精确等于本机开发 workspace，任一不符即退出。
  - **不碰用户自己的账号**：测试账号用固定前缀（`verify-*@orbit.test`），脚本只增改这些账号的数据；重复执行幂等（只清理本前缀账号的数据再造）。执行前后对「非 `verify-*` 行」做指纹（按表计数 + 内容哈希），必须完全一致。
  - 每个账号提供单独的「重置到初始状态」命令，供 W0018 在桌面与手机之间复位（写操作会改变场景）。
  - worktree 的环境变量**只写需要的几项**（数据库、Auth secret、workspace、`ORBIT_GUIDE_DEMO`、`ORBIT_GUIDE_DEMO_SINCE`、功能模式），不复制整份 `.env.local`；不要把 cookie、secret 写进仓库或 REPORT。
  - 名片照片是真实他人名片：裁剪结果只放 `~/orbit-sprint-evidence/web/sprint-W0016/run-01/cards/`，不进仓库；本 Sprint 不调用识别（W0018 再上传）。
  - 「今天扫描的名片」需要批次条目 `createdAt` 落在活动开始日当天：种子里直接造批次与条目（不走真实 OCR），活动开始时间设为今天东京时间。

## 范围与文件

- 新建：`scripts/seed-verify-accounts.ts`（造账号与场景数据、单账号重置，可重复执行）、`scripts/verify-session-cookie.ts`（输出指定测试账号的会话 cookie 到 stdout，不落盘）、`scripts/verify-server.sh`（在 worktree 以 3001 端口启动，只注入所需变量）。根 `.claude/launch.json` 的 `orbits-verify` 配置由协调者添加。
- 修改：无产品代码。发现必须改产品代码才能造数据时停下，记入 REPORT 交 W0018。
- 排除：逐场景验收（W0018）；Preview。

## 测试账号与场景

| 账号 | 用途 |
| --- | --- |
| verify-new | 全新用户：0 联系人、无目标、无计划，创建时间晚于 SINCE → 进示例与引导 |
| verify-legacy | 老用户：创建时间早于 SINCE，≥3 位已确认联系人、有目标、无计划 → 不进示例，只提示第 3 步 |
| verify-plan | 计划进行中：3 个月计划处于第 2 周，有 1 条已延后行动、已关联的人脉需求、1 个已报名活动 |
| verify-expired | 一年期计划已到期 → 到期回顾 |
| verify-event | 今天开始的已报名活动 + 今天创建的待确认名片批次（2–3 张，行业已填）+ 一份含该活动的计划 → 活动归属询问与需求匹配 |

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0016-01 | worktree 在 `/Volumes/ORICO/Dev/worktrees/orbit/verify`，3001 端口的 server 开着示例开关、连本机库；3000 端口的 server 不受影响 | 两个端口各请求一次首页（带 cookie）的结果对照 |
| SC-W0016-02 | 种子脚本连续执行两次结果一致，只动 `verify-*` 账号：非 `verify-*` 行执行前后指纹完全一致；连接串 host、库名或 workspace 不符时拒绝执行；单账号重置后回到初始状态 | 指纹对照；三种不符的拒绝输出；重置前后对照 |
| SC-W0016-03 | 5 个测试账号登录 3001 后首屏符合上表用途（例如 verify-new 看到示例横条，verify-legacy 看不到） | 每个账号一次页面文本检查 |
| SC-W0016-04 | 名片合照裁成单张图片（约 17 张），放在仓库外 | 文件清单 |

## 最小测试与检查

- 档位：L（只有脚本与本地配置）。
- 检查：脚本连续两次执行；typecheck；上面的页面检查。
- 不运行：全量。

## 失败与交接

REPORT 写明：验收 server 的启动方式、种子命令、取 cookie 的命令、各账号用途，供 W0018 直接使用。
