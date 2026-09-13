# R-08：待办日期与截止时间编辑

> **For agentic workers:** 使用 `superpowers:executing-plans`，沿用用户选定的单代理、原目录和 `chat-agent`；本功能验证后独立 commit，不推送。

**Goal:** 在现有待办详情中编辑安排日期和截止时间，保护失败／冲突草稿，按现有版本与幂等协议保存并回读。

**Architecture:** 复用 `TaskDetailScreen` 的设置面板、统一 mutation 同步锁和请求键；增加纯日期输入转换／校验及回执归属检查。日期与标题／备注共用已接受版本，但日期保存只发送日期字段，不夹带未提交文本。账号、服务器、任务变化使旧表单和请求失效。

**Tech Stack:** 现有 React Native、TypeScript、Expo、Node tests、RNW/Playwright；无新原生依赖、日历权限或后端修改。

**Spec:** [已批准剩余计划 R-08](2026-09-13-app-remaining-functionality-and-connectivity.md)、[已批准待办视觉](2026-09-12-ink-signal-tasks.md)。本项落实已有待办日期／时间编辑要求；地点、个人日程创建、全局账号时区策略、跨端业务联验仍单列，不以本子功能关闭完整 R-08。

## 已核实边界

- 只改 `repos/orbit-app`；不改 Web、Bridge、同步副本或用户业务数据。不运行真实任务写入验收，除非已有明确授权对象。
- `PATCH /api/tasks/:id` 的 update 接受 `expectedUpdatedAt`、`idempotencyKey`、`patch.plannedDate`／`patch.dueAt`。版本冲突拒绝，取消任务不可编辑；没有 contactId 也可创建个人任务。
- route `parsePatch` 要求每个字段都是非空字符串。存储层 `task-record.ts` 进一步要求 plannedDate 为有效 YYYY-MM-DD，dueAt 为带时区的完整 ISO datetime；不能清空已有日期，不能把 date-only 写入 dueAt。API 暂无地点字段，schedule-items 只有 GET。
- 用户没有具体时间时只填写安排日期；截止日期和截止时间必须成对。输入明确标出东京时间，沿用当前已批准显示口径；R-09 的账号时区改造未完成，不声称它已解决。
- 日期修改不会重排已有 ReminderPlan。显示“修改日期不会自动调整已有提醒”，保留原提醒设置，不申请新增系统权限。
- 重读、关闭设置面板不能静默丢弃日期草稿。冲突的显式放弃操作采用现有入口，一次载入所有最新字段。日期保存不得替用户保存或清空标题／备注。
- 日期元数据行打开现有设置面板；在提醒选项之前放安排日期、截止日期、截止时间和“保存日期和时间”。沿用系统字体、现有 theme/control tokens、白底墨黑与信号蓝、44pt 触点；不新增视觉方向。

## 文件与接口

- 新建 `src/view-models/task-dates.ts`：
  - `TaskDateDraft = { plannedDate: string; dueDate: string; dueTime: string }`。
  - `TaskDatePatch = { plannedDate?: string; dueAt?: string }`。
  - `taskDateDraftFromView(view)`：保留 date-only 的安排日期；将完整 deadline 转成东京 YYYY-MM-DD／HH:mm；未设置时留空，不假造时间。
  - `buildTaskDatePatch(baseline, draft)`：返回 invalid/message、unchanged 或 ready/patch；只输出实际改变字段。未改 deadline 时保留原 offset／秒／毫秒，不因界面仅展示分钟而覆盖精度。严格拒绝无效日期、24:00、只有半组截止输入和清空已有字段；不使用 Date 的溢出归一化冒充有效日期。
  - `taskDateReceiptMatches(data, taskId, actorId, patch)`：确认完整可解码 task、账号／所有者／任务 ID、有效 updatedAt、非 cancelled 状态及对应保存字段；dueAt 比较相同瞬间，不要求服务器保留同一 offset 文本。
- 修改 `src/screens/tasks/TaskDetailScreen.tsx`：新日期草稿和保存入口；日期脏稿纳入版本保护；共享 mutation 可对日期回执执行额外接受检查，未确认时保留请求键。读取／客户端按账号、服务器、任务隔离，旧作用域请求撤销，迟到结果不触发新账号会话过期或写回。
- 新建 `tests/task-dates-view-model.test.ts`：日期转换、非法值、无具体时间、空变更、回执检查。
- 新建 `tests/task-date-interactions.test.ts`：真实路由、Screen、hooks、HTTP client、VM；只替换原生／认证和服务器来源、快照 I/O、外部 fetch。保留原 task-detail 和 ink-signal 回归；若旧 fixture 缺少新读取的 provider 字段，只补真实边界形状，不删原断言。

## 执行步骤

- [x] 读取实际 Screen、VM、PATCH handler、service、repository 和 task-record 的完整相关校验链。原定向基线 52/52、8.732 秒、exit 0，日志 `/tmp/orbit-r08-task-dates-baseline-20260913.log`。
- [x] 根索引刷新完成后，逐一 upstream impact：TaskDetailScreen、mutate、save、refresh、useStyles，以及拟改的测试 fixture／setup；新文件 helper 没节点时记 UNKNOWN。报告 HIGH／CRITICAL，编辑前阅读直接调用者和相关流程。
- [x] 先写纯 helper 红测，使用字面量预期：

  ```ts
  assert.deepEqual(taskDateDraftFromView({ plannedDate: "2026-09-15", dueAt: "2026-09-14T16:30:00Z" }), {
    plannedDate: "2026-09-15", dueDate: "2026-09-15", dueTime: "01:30"
  });
  assert.deepEqual(buildTaskDatePatch({}, { plannedDate: "2026-09-15", dueDate: "", dueTime: "" }), {
    kind: "ready", patch: { plannedDate: "2026-09-15" }
  });
  assert.deepEqual(buildTaskDatePatch({}, { plannedDate: "", dueDate: "2026-09-15", dueTime: "00:30" }), {
    kind: "ready", patch: { dueAt: "2026-09-14T15:30:00.000Z" }
  });
  ```

  另列闰日、非闰日 2 月 29 日、4 月 31 日、年份／月份／时间越界、已有日期清空、无变化不写、秒精度不变、错误归属及字段不符回执。只加能被实际退化打破的行为断言。
- [x] 编写路由红测：日期行可打开编辑；输入不触发 PATCH；保存只发送日期字段、旧版本和稳定键，使用精确编码路径。

  ```ts
  await page.getByRole("button", { name: "编辑日期和时间", exact: true }).click();
  await page.getByRole("textbox", { name: "安排日期", exact: true }).fill("2026-09-15");
  await page.getByRole("button", { name: "保存日期和时间", exact: true }).click();
  assert.deepEqual(request.body.patch, { plannedDate: "2026-09-15" });
  assert.equal(request.path, "/api/tasks/task%3Aedit");
  assert.equal(request.body.expectedUpdatedAt, "2026-09-07T00:00:00.000Z");
  ```

- [x] 运行新测试，确认缺少行为导致 RED，不把打包／导入错误当产品证据；纯模块缺失可先加最小无功能导出以得到行为失败，再实现。
- [x] 实现纯转换和最小表单接线。提交时间先严格验证 YYYY-MM-DD 与 HH:mm，再用明确 `+09:00` 转成 ISO；无具体时间不构造 dueAt。

  ```ts
  const dueAt = new Date(`${draft.dueDate}T${draft.dueTime}:00+09:00`).toISOString();
  // Only after strict calendar/time validation succeeds.
  const body = { action: "update", expectedUpdatedAt: baseline.updatedAt, patch };
  ```

- [x] 补充并先红后绿验证：失败／409／不完整回执保留日期草稿；同输入重试同键、改输入换键；新服务端版本不覆盖脏日期，显式放弃后全部载入；保存日期不改未提交标题／备注，标题保存也不吞日期草稿；挂起／同帧重复点击只写一次；取消任务禁止写；账号／服务器／任务／卸载隔离迟到响应及旧回调。
- [x] 合法回执后重新读取详情、历史与提醒，记录每条实际 GET，不把发起请求当读取成功。验证提醒计划没有自动 PATCH／POST，普通日期保存不申请通知权限。此项为真实 route/hook/client 的受控 fetch 回归；原生真实写入和持久化回读未执行。
- [x] 在 390pt、320pt 大字号及深色下渲染现有设置面板，检查字段／保存／关闭触点与纵向滚动；截图仅留本地。浏览器采用 America/Los_Angeles，输入仍按显式东京口径保存，date-only 不换日。原生仅检查既有待办的只读入口，不制造真实任务。
- [x] 运行新测试、原 52 项、类型、六项同步检查和全量 npm test；按 code-review 清单单代理自审并修复重要问题。更新子计划、api-gaps 和连通性记录，完整 R-08 未通过项仍留空。
- [x] staged `gitnexus_detect_changes` 固定绝对仓库路径，审阅实际范围后 commit：`feat(app): edit task dates with version-safe drafts`。不 push。

## 未关闭的完整范围

地点更新、个人日程创建／修改、已有日期清除、账号时区策略、日期变更与提醒联动协议、首页／待办／日历真实同记录一致性和 Web↔App 双向写回仍需对应证据。现有公开活动预览不转成个人事项，本项不新增 Apple／Google 日历写权限。

## 执行与验证记录

App 起点 `07b64fbc6bd6b0b2d7426acb42155f41a49620df`；只改 App，不改生成副本和 Web。已批准设计／单代理／原目录／逐功能 commit 沿用。`frontend-design` 约束为现有系统字体、theme/control tokens 和可滚动设置面板；`no-ai-tone` 用于短校验提示，无新视觉方向。

编辑前根索引 250.4 秒完成。`mutate` 为 MEDIUM：直接关联 save、changeStatus、deleteTask、addReminder、cancelReminder 五个调用者，0 条已索引流程；全部阅读并保留回归。Screen/save LOW；refresh 四个直接调用者、LOW；useStyles 一个 Screen 调用者、LOW；旧测试 fixture/setup LOW。新日期 helper／新回调未收录为 UNKNOWN，不称零风险。提交前普通 analyze 因 HEAD 未变返回 Already up to date；随后 `--force --skip-agents-md` 完成当前工作树索引，467.6 秒、exit 0，390651 节点／559896 边／300 流程；新 helper 和 saveDates 已可定位。绝对仓库路径的 staged detect_changes 为 11 文件、LOW、0 条列出的受影响流程；结合实际 diff 逐项审阅，没有 Web 或生成副本改动。日志 `/tmp/orbit-r08-task-dates-final-index-forced-20260913.log`。

| 验证轮次 | 结果 | 本地日志 |
| --- | --- | --- |
| 原定向基线 | 52/52，8.732 秒，exit 0 | `/tmp/orbit-r08-task-dates-baseline-20260913.log` |
| 无功能 helper 红测 | 37 项，22 失败／15 通过，0.246 秒，exit 1 | `/tmp/orbit-r08-task-dates-helper-red-20260913.log` |
| 仅基础 decoder 的回执红测 | 37 项，13 失败／24 通过，0.174 秒，exit 1 | `/tmp/orbit-r08-task-dates-receipt-red-20260913.log` |
| helper 校验完成 | 37/37，0.165 秒，exit 0 | `/tmp/orbit-r08-task-dates-helper-green-20260913.log` |
| 路由入口红测 | 22/22 预期失败，6.650 秒，exit 1 | `/tmp/orbit-r08-task-dates-route-red-20260913.log` |
| 首次集成 | 111 项，95 通过／16 失败，15.484 秒，exit 1 | `/tmp/orbit-r08-task-dates-green-20260913.log` |
| 修正原生 UUID 测试边界后 | 22/22，16.462 秒，exit 0 | `/tmp/orbit-r08-task-dates-route-green-20260913.log` |
| 旧回调有效红测 | 4 项，3 失败／1 通过，2.636 秒，exit 1 | `/tmp/orbit-r08-task-dates-callback-red-final-20260913.log` |
| 旧回调修复后定向与旧回归 | 115/115，19.819 秒，exit 0 | `/tmp/orbit-r08-task-dates-green-final-20260913.log` |
| 类型复跑 | exit 0 | `/tmp/orbit-r08-task-dates-types-final-20260913.log` |
| 契约／Schema／字典同步检查 | 6/6，1.497 秒，exit 0 | `/tmp/orbit-r08-task-dates-sync-20260913.log` |
| 首轮全量 | 2378 项，2373 通过／5 失败，191.692 秒，exit 1 | `/tmp/orbit-r08-task-dates-full-20260913.log` |
| 对齐旧工作区测试边界 | 44/44，20.618 秒，exit 0 | `/tmp/orbit-r08-task-dates-workspaces-corrected-20260913.log` |
| 第二轮全量 | 2378 项，2377 通过／1 失败，203.128 秒，exit 1 | `/tmp/orbit-r08-task-dates-full-corrected-20260913.log` |
| 原名片回归单独复跑 | 28/28，18.495 秒，exit 0 | `/tmp/orbit-r08-task-dates-card-regression-20260913.log` |
| 已接受日期的显示红测 | 1 项行为失败，2.391 秒，exit 1 | `/tmp/orbit-r08-task-dates-label-red-20260913.log` |
| 最终定向与旧回归 | 116/116，21.734 秒，exit 0 | `/tmp/orbit-r08-task-dates-green-verified-20260913.log` |
| 最终类型检查 | exit 0 | `/tmp/orbit-r08-task-dates-types-delivery-20260913.log` |
| 最终全量 | 2379/2379，177.897 秒，exit 0 | `/tmp/orbit-r08-task-dates-full-delivery-20260913.log` |

首轮 16 项失败源于 about:blank 下不存在 `crypto.randomUUID`，发生在模拟 Expo UUID 边界，不是产品日期校验；只改测试为确定性递增 ID，生产 UUID 不改。误用 `check:types` 的 missing-script 结果也未当作类型通过，改用 package 定义的 `typecheck` 完整复跑。首轮旧回调测试错误地 await 未决写入，两个测试超时；改为触发但不等待网络完成后，三项才得到实际错误 PATCH 的行为红测。旧日志保留，不混入有效红绿统计。

首轮全量五项失败均为 `app-wide-workspaces` 的登录／服务器替身缺少 signedIn/ready；编辑前 fixture upstream LOW。只补全当前登录与任务归属字段，原 44 项断言、字号、点击边界、等待阈值均保留，单文件复跑通过。日期字段的静态类型直接取自同步 TaskItemContract，未手改生成副本。

第二轮全量的单项失败位于未改动的 `ink-signal-card-review.test.ts`，点击“生成待确认候选”超过 2000ms；同一文件单独 28/28 通过。该轮同时运行索引，有负载关联但未证实根因，不称产品修复。索引完成后，未改名片代码、断言或阈值，以相同 `npm test` 完整复跑 2379/2379。所有通过轮次均 0 失败／取消／跳过；旧失败记录不覆盖。

自审按 code-review 检查单单代理执行：旧日期回调可在新输入或新 GET 后发送过期 patch，已通过同步草稿引用和最新版本检查修复；另以红测确认保存回执到达、GET 尚未完成时标题日期徽标仍用旧快照，修复为两处日期展示共同使用已接受版本。保留已有完成／恢复／删除／提醒的请求键与副作用语义；新日期保存只增加其专用 2xx/回执接受检查。迟到 401 在账号／服务器／任务／就绪变化或卸载时被 AbortSignal 隔离，不发布旧会话过期事件。没有独立代理审查声明。

RNW 截图已查看：`/tmp/orbit-task-dates-{normal,narrow-large,dark}-20260913.png`；320pt/fontScale=2 可滚动到所有输入、保存和固定关闭按钮，无水平溢出。15:30 同一 Simulator 的既有待办详情、历史、提醒 GET 均 200，日期输入及保存按钮正确呈现；不输入、不保存、不取消提醒。实际 L1–L5 范围和键盘检查见[连通性第十三节](../../verification/2026-09-13-app-connectivity.md#13-r-08待办日期与截止时间编辑)。本地实现验证完成，完整 R-08 的业务缺口仍保持开放。
