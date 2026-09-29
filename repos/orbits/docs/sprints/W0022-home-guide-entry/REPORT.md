# Sprint W0022 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 开关打开时，没有计划的老用户在 iOrbit 首页点「帮我制定推进计划 →」，进入 `/app/start?step=3`，直接显示第 3 步。引导记录停在第 4 步的人也一样。开关关闭时，这个链接仍是 `/app/agent/strategy`，「我该先联系谁 →」没有改。
  - `/app/start?step=3`、`?step=4` 只在该步能打开时生效。步骤锁着、参数非法（`abc`、`9`）或参数重复时，按原逻辑显示；加载页面时不会写引导记录。
  - 有生效计划、没加入社群、也没报名任何活动时，首页「已报名活动」栏首（社群行之上）显示一行「引导第 4 步：加入社群或报名一场活动 →」，链接到 `/app/start?step=4`。加入社群后提醒消失（3001 实测）；报名任一活动后也消失（测试覆盖）。读不到报名状态时不显示提醒。
  - 在 3001 上用 verify-legacy 走完「首页 → 第 3 步 → 生成计划（mock）→ 首页提醒 → 第 4 步」，桌面 1440、手机 375 各一次，控制台 0 错误。3000（开关关闭）首页链接和栏目与改动前一致，`/app/start?step=3` 重定向回 `/app/agent`。
- 仍未实现或未验证：
  - 「报名后提醒消失」没有在浏览器里实测，由页面测试覆盖：首页活动有报名时 0 次读取，其他地方有报名时读取结果为真。
  - 社群状态读取失败时，`readCommunityJoinedForActor` 返回 false，分不清「没加入」和「读不到」。这时仍会再读一次报名；报名也为空时会显示提醒。这个行为和 `/app/start` 第 4 步的现有口径一致，本 Sprint 没有改。

## 运行记录

- 结果：completed（等待协调者合并）
- Generator：Claude Opus 5.5，2026-09-29，run-01；Planner revision 2，PLANNER.md SHA256 `ee97a309a1abbd4d34e4ab1435db5e2b551fd547c6c3966485aec609916e339c`
- 基线 `chat-agent` `b9da923e`；分支 `sprint/W0022-home-guide-entry`；功能提交 `92b34b02`、`ec08f8f4`（hover 字色补丁）；合并 SHA：等待协调者
- 档位 H。全量对照（RULES §5.2；排除基线就挂起的 `tests/pages/event-registration-readback.test.tsx`，两次运行用同一份文件清单）：
  - 基线：5666 项，47 失败，278 跳过；
  - 本分支：5683 项，47 失败，278 跳过；
  - `comm` 对比新增失败 0，消失 0。
  - 第一次全量抓到 1 条新增失败：`tests/ui/orbit-0918-anchor-colour.test.ts` 要求提醒链接有 `:hover` 字色。已在 `ec08f8f4` 修复后重跑，上面是修复后的结果。
  - 278 个跳过来自其他专用 PG 连接变量（例如「Explicit isolated PostgreSQL URL required」），基线相同，与本 Sprint 无关。本 Sprint 定向集 125 项，0 跳过（不涉及 PG）。运行前已执行 `assert-local-test-databases`，通过；没有 source `.env`。
- typecheck：`npx tsc --noEmit -p .` 通过
- 付费 AI 调用 0 次（计划生成器只有 mock provider）；未 push，未部署，未改生产库
- REPORT 由协调者按 Generator 交回的正文落盘

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0022-01 | pass | `tests/services/guide-start.test.ts`（`parseStartStepParam`、`resolveRequestedStartView`）、`tests/pages/app-start-guide-page.test.tsx`（接参、非法与重复值、开关关零读取）、`tests/pages/app-start-guide.test.tsx`（老用户记录为 4 时 `?step=3` 显示第 3 步；锁定时不解锁；0 次 PATCH）、`tests/pages/app-agent-iorbit-home.test.tsx`（链接开／关）；RED 13 项失败后 GREEN 125/125（`red.txt`、`green.txt`）；3001 手机端先写入 `currentStep=4`，再从首页进入第 3 步，`patchOnLoad=[]`（`mobile-375-flow.json`）；新用户 `?step=3/abc/9/3&4` 都显示第 1 步，0 次 PATCH（`extra-checks.json`） |
| SC-W0022-02 | pass | 首页组件测试：提醒出现、位置、无计划／计划读不到／已完成／开关关／示例壳时不显示。`tests/pages/app-agent-guide-demo-page.test.tsx` 的读取计数：开关关 0 次，示例期 0 次，已加入社群 0 次，首页活动已报名 0 次，其余 1 次（按 canonical actor），读取失败时不显示。本机实测见下 |
| SC-W0022-03 | pass | 3001 verify-legacy 桌面 1440 与手机 375 全流程截图 `desktop-1440-{1..5}-*.png`、`mobile-375-{1..5}-*.png`，控制台 0 错误；加入社群后提醒消失 `desktop-1440-6-home-after-join.png`；3000 开关关闭 `off-3000-legacy-home.png` / `.json`；定向集、直接消费者（17 个文件中 2 项失败，stash 对照确认基线就失败）、tsc 与全量对照均见上 |

证据目录：`~/orbit-sprint-evidence/web/sprint-W0022/run-01/`。

**读取字节（W0017 口径：返回行 JSON 字节，不含协议开销；本机库只读实测，`step4-read-bytes.txt`）**

| 情形 | 语句数 | 返回行／字节 |
| --- | --- | --- |
| 显示提醒（没有任何报名，如 verify-legacy） | 2 | 0 行 / 0 B |
| 有报名，但不在首页活动里（verify-plan、verify-event） | 1 | 1 行 / 11 B |
| 开关关、示例期、已加入社群、首页活动已报名 | 0 | 0 B |

- 月估算：1000 人 × 每天 4 次 × 30 天 = 12 万次；按最坏常见情形 11 B 计，约 1.3 MB/月，不超过 30 MB。
- 长尾：只有旧投影报名、没有 canonical 记录的人，会多读一次旧投影的 event_id 和 canonical head。旧投影查询 `limit 50`，head 查询按传入的 id 返回，行数不超过 50。每人的报名通常只有几场（按 5 场估约 0.5 KB/次），这类人不多，未单独实测。

## 假设与额外阅读

- 上下文包之外读了：`features/community/service-factory.ts`（确认读取失败时返回 false）；`features/events/registration/active-registration.ts` 的 SQL（用于测量）；`app/(app)/app/start/start-step-plan.tsx`（「开始分析」按钮选择器）；`features/plans/generator-service-factory.ts`（确认只有 mock 生成器）；`app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts`（提醒样式）；`tests/ui/orbit-0918-anchor-colour.test.ts`（全量抓到的门禁）；verify 相关脚本 `scripts/verify-server.sh`、`seed-verify-accounts.ts`、`verify-session-cookie.ts`、`scripts/lib/verify-database-target.ts`、`measure-plan-read-traffic.ts`（W0017 计量口径）。
- `?step` 的规则：服务端 `parseStartStepParam` 只接受单个字符串 `^[1-4]$`；客户端 `resolveRequestedStartView` 在请求的步骤能打开时使用它，否则调用原 `resolveStartView`。`resolveStartView` 与 `canOpenStartStep` 的签名和语义都没有改。加载时只 `useState` 初值，不写 `currentStep`；用户之后点步骤时，仍按原队列写记录。
- 「有生效计划」沿用首页已有的 `plans/current?view=home` 读取结果（`planSnapshot` 非空），没有新增客户端请求。计划接口读不到时不显示提醒。
- 服务端第 4 步的判定写在 `app/(app)/app/agent/page.tsx` 的本地函数 `readGuideStep4Pending` 里。开关关闭时直接为 false；示例期页面已经提前返回，不会走到这里。
- 首页新增的两个 props（`guideEnabled`、`guideStep4Pending`）都是可选的，默认 false；示例壳不传，组件内也按 `demoActive` 再挡一次。
- 未登录时重定向的 `next` 仍是 `/app/start`，没有带上 `?step`（首页入口的人都已登录）。
- 浏览器验收：用仓库里的 Playwright 驱动 127.0.0.1:3001，cookie 由 `verify-session-cookie.ts` 生成，用完即删；脚本副本放在证据目录 `w0022-*.mjs`，不含 cookie；手机端步骤条缩成了进度线，所以写入 `currentStep=4` 这一步直接发与点击相同的 PATCH；3001 没有重启；3000 是临时启动的，用完已停；verify-legacy 每次跑之前和最后都执行了 `--reset`，最终状态：无计划，无引导记录，社群为 invite；verify-new 只读，没有写入。
- GitNexus upstream impact（`impact.txt`）：`IOrbitHome`、`resolveStartView`、`canOpenStartStep` 为 **CRITICAL**（partial），已登记，不降级；`AppAgentPage`、`AppStartPage` 为 UNKNOWN（路由入口，文本搜索只由 Next 路由与页面测试加载）；`IOrbitShell` 的已知候选最高为 CRITICAL；`StartGuide` 的已知候选最高为 LOW；暂存区 `detect-changes`：第一次提交 critical（12 个文件，54 个符号，影响 21 条流程）；第二次只改样式模板字符串，没有与已索引符号重叠。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex `codex review --base chat-agent`（全文 `codex-review.txt`）：无意见——行为与文档一致，开关关闭与示例路径保持不变，引导硬顺序不被绕过 | — | 无需修改 |

## 交接

- 接口：`features/guide/start-steps.ts` 新增 `parseStartStepParam(value: unknown): GuideStartStep | null` 和 `resolveRequestedStartView(flags, recorded, requested): StartView`；`StartGuideProps.requestedStep?: GuideStartStep | null`；`IOrbitHomeProps` 与 `IOrbitShellProps` 新增 `guideEnabled?`、`guideStep4Pending?`；提醒节点是 `a.ir-m-guide-step4[data-orbit-iorbit-guide-step4="pending"]`。
- 观察项（W22-4，未改）：对话页快捷入口（`iorbit-chat.tsx:127`）、策略页底部药丸，仍然指向旧入口。
- 回退：`git revert ec08f8f4 92b34b02`。
