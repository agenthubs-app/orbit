# Sprint AG07 — 执行总结（两端的确认卡与对话界面，H）

改了哪些文件看 git diff（`864963be4..28e0ab4b0`），这里不逐文件复述。

## 结果

- 已验证能做到：
  - 网页和 iOrbit App 都按服务端冻结的同一份预览画确认卡。卡上的条目、数量、每一行的旧值和新值、徽章、按钮文字全部来自服务端；客户端不拼字段，也不格式化日期（AG07-1）。
  - 一端确认或否决后，另一端读到的是同一个结果；已否决或已过期的卡再点，会显示最新状态和一句服务端写的原因（AG07-2）。
  - 离线时 App 只显示「有1份待确认的修改 · 联网后才能确认」，卡片内容和按钮都不可用；重新联网后会自己再检查一次，然后显示卡（AG07-3）。
  - App 本机有一条还没同步的修改，而它正是卡上要改的那条记录时，App 仍算在线，卡上显示「这条待办你在手机上改过，还没同步」，确认按钮不可用，底部写「先同步你的修改」。上传完成后，服务端出第 2 版：「内容有变化，请再看一遍 · 现在是 11月26日（周四）→ 改成 11月24日（周二）」，App 不用重启（AG07-4，iOS Simulator 实拍）。
  - 回答开头有一行依据，例如「按你11月12日记的笔记回答 打开 ›」，两端都能点开那条记录；一个请求暂停后再继续，这一行仍在。
  - 界面和代码写的话里没有内部词（操作键、第 N 版、版本、证据、来源、错误码、哈希）。凡是提到按钮的句子，都用按钮上的原字（如「确认以上1项」「以上 1 件を確定」「Confirm this change」）。中文数字与汉字之间不加空格（R03）（AG07-5）。
  - 代码规则（都由测试锁定）：
    - 卡已经用掉的那句话不再报「没看懂」，也不另行回答。
    - 模型说「记下了 / 不能保存」一类话不交付。
    - 被删的句子前面那句只起引出作用的话一并删掉。
    - 选项标签不用代词，写这个代词指的人。
    - 新记录取代旧记录时，代码写出旧值和原因。
    - 部分读取时，提示和读的方向一致（读的是最早的，就说更晚的可能没看到）。
    - 回答里出现的日期必须出自本轮读到或说过的内容。
    - 「改到周五」这类说法即使对象不明，也按改期处理，追问问的是「要改的是哪一条」。
    - 「已过期」的待办按未完成读取。
    - 有记录读不了时，回答不说「只有」。
    - 问一条附上的记录时，只读这条记录。
- 仍未实现或未验证：
  - 备忘录正文（如「他今天来过电话」）作为用户原话存进笔记，卡上不显示（按获批视觉稿）。如果要改写正文，需另行决定。
  - 其余见「交接」。

## 运行记录

- **结果：** completed（AG07 run-03 通过）。
- **Generator：** Claude Opus 5.5（Claude Code 子会话）；2026-11-16 至 11-17；Plan revision 1。
- **分支：** `sprint/AG07-card-ui-both-clients`。最终功能 SHA `28e0ab4b0`；合并 SHA：见协调者复核。
- **提交（按时间）：**
  - 主体：`868b6de41`、`d4db4b0cc`。
  - run-01 的修复：`89ea60d7d`、`b50ac1b4e`（第 1 轮）、`bdf454596`。
  - 第 2 轮修复：`200a87172`、`7ab23509e`、`b0d77d780`。
  - run-02：`000d54a50`、`663fa9687`、`77b8eae7d`。
  - run-03：`28e0ab4b0`。
- **档位：** H，收口做一次 I（两端各跑一次全量）。
- **全量对照（最终 `28e0ab4b0`）：**
  - orbits：8659 条，24 条失败。与基线 24 个失败名逐条一致，没有新增失败。
  - App：3503 条，3 条失败。其中基线 2 条（`no-hardcoded-copy`、`route-parity`）；第 3 条 "wrong-value receipt…" 是负载下偶发，单独重跑通过，见交接 (g)。
  - App tsc 只剩已知的 `tests/ios-scene-lifecycle-config.test.ts:47`。
- **付费 AI 调用：**
  - 全部是 DeepSeek，由评测服务器运行，按各次运行汇总合计约 6.2 CNY：
    - run-01 门槛与复跑约 2.0；
    - 第 2 轮的两组约 1.5；
    - run-02 约 1.07（含两次中间门槛）；
    - run-03 约 1.55；
    - Simulator 实拍 10 轮以内，不到 0.1。
  - 最终一组（run-03）真实调用 399 次，模拟 3 次。
  - 评审没有调用任何 API。
- **push：** 没有 push，没有部署，没有碰正式库和远端库。

## 运行与评审

所有运行都在本地评测库（`orbit_agent_eval`，虚构账号），每次运行后都做了 judge-pack。评审结论以协调者转述为准。

| 轮次 | SHA | 门槛 / 复跑 | 硬检查 | 评审结论（协调者） |
| --- | --- | --- | --- | --- |
| run-01 | `bdf454596` | AG07 门槛 `20261117-043648-bdf4545-AG07-gate` | 43/43 | 两位评审都给 43/43。指出的问题：内部词（操作键、第 N 版）、按钮名不一致、卡已用掉的句子被报「没看懂」、卡上代词、「修改 1 项」空格 → 第 2 轮修复 |
| run-01 | `bdf454596` | AG06/05/04/03 复跑（`…-AG0x-gate-rerun-at-AG07`） | 47/43/37/39 | AG05/04/03 通过；AG06 45/47：AE-XL-003 R1（恢复后丢了依据行）、AE-SCL-006 R2（没写原因）、AE-XL-011（回答与卡矛盾、选项写 "She"）→ 第 2 轮修复 |
| 第 2 轮 | `b0d77d780` | AG07 门槛与复跑（`…-b0d77d7-…`） | 43/47/43/37/39 | AG07 门槛的 AE-SCL-006 R2 两位评审都判不通过（没写旧值）；AG06/05/03 通过，另附说明 → run-02 |
| run-02 | `77b8eae7d` | `20261117-140815-77b8eae-AG07-gate-run-02` 及四个复跑 | 43/47/43/37/39 | AG07 门槛两位评审 43/43；AG06、AG05、AG03 通过；AG04 35/37（AE-AMB-003、AE-AMB-007，都随模型变化）→ run-03 |
| run-03 | `28e0ab4b0` | `20261117-150232-28e0ab4-AG07-gate-run-03`、`…151358…-AG05…`、`…150748…-AG06…`、`…151847…-AG04…`、`…152336…-AG03…`（都带 `-run-03` 标签） | 43/47/43/37/39 | **通过：** AG07 门槛两位评审都给 43/43；AG06/05/04/03 复跑 47/43/37/39 |

中间运行没有交给评审，只留了日志：
- `7ab2350`（第 2 轮中途）；
- `000d54a`：AG07 42/43，AE-RD-008 越界读取，后由 `663fa9687` 修复；
- `663fa96`：AG07 43/43，代码写的旧值前带了模型的引语，后由 `77b8eae7d` 修复。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| AG07-1 两端同一预览、同一差异 | pass | 两端各一份卡片测试：Web `tests/pages/agent-v1-confirmation-card.test.tsx`，App `tests/agent-v1-confirmation-card.test.tsx`；`tests/agent-v1/ag07-card-display.test.ts`、`ag07-card-view.test.ts`；门槛 AE-UIX-001/002/003/005/006 的 `same_card_on`；`run-01/sim/a1…a2` |
| AG07-2 一端决定，另一端回读 | pass | 两端卡片测试的决定错误分支；门槛 AE-UIX-002/003/005；Simulator 上在 App 确认、网页回读：`run-01/sim/b1…b2`、`READBACK.md` |
| AG07-3 离线只显示份数 | pass | App `tests/agent-v1-card-offline-and-pending.test.ts`；App 测试「5xx 不算离线，读取恢复后自己回来」（`ink-signal-ai-conversation.test.ts`）；门槛 AE-UIX-004/005；`run-01/sim/c1…c2` |
| AG07-4 未同步修改时不可确认，同步后出第 2 版 | pass | 同一个 App 测试文件；门槛 AE-UIX-006；Simulator 实拍 `run-01/sim/r2-d1…r2-d5` 与 `READBACK.md` 中「Repair round 2 recapture」一节（在线、未同步、按钮不可用 → 上传 → 第 2 版，不重启） |
| AG07-5 用词、无内部词、1440/375 | pass | `npm run copy:qa -- --shared` 0 问题；`tests/agent-v1/ag07-no-internal-words.test.ts`（扫描代码写的全部回复、卡片文字和拒绝，三语）；Web 1440/375 与 App 375 截图（`run-01/web-*`、`run-01/sim/*`） |

## 假设与额外阅读

额外读了以下文件，原因都是要找某段文字或某个行为的出处：
- 旧账本的 `features/agent/ledger/presentation.ts`：确认 v1 卡的拒绝不走这里。
- `orbit-app` 的同步 outbox 与 uploader（`sync-lifecycle.ts`、`outbox-uploader.ts`、`task-outbox-upload.ts`）：弄清 App 怎样判断一条修改「还没同步」。
- `AccountAuthScreen`、`AuthSessionProvider`：Simulator 上登录不成功，排查原因。
- drafts worktree 会话的操作记录：学它怎样在 Simulator 上点击和输入。

对模糊点做的选择：
- 备忘录正文不在卡上显示，只显示标题和字段（按获批视觉稿）。正文作为用户原话存入笔记。
- 开发者用的错误（抛出的异常、对格式错误请求返回的 400）不算面向用户的拒绝，内部词扫描把它们排除在外。
- 模型给的「之前的值」只保留值本身，前后的引语去掉，统一由代码来说。
- 回答里的日期，以本轮消息、对话、今天前后几天、读到的记录（正文或记录自身的日期）为来源。笔记里只写了星期几的，笔记自身的日期不算这个星期几的来源。
- 「改期」规则只用于第一层没看懂的部分；有具名对象或上下文已经绑定的，不受影响。
- App 首条消息等协议检查有结果再发。检查失败时（断网或服务端 5xx）什么都不发，保留草稿，不退回协议 2。从笔记交给对话的消息仍走协议 2 的草稿流程。

## review 处理（仅 H 档）

代码审查由协调者另开会话完成，本报告不包含。评审意见和处理见「运行与评审」一表。

## 影响分析与改动检查

- 每次改动前都对受影响的符号做了 GitNexus impact（CLI，因为 MCP 索引版本不匹配）。
  - 报 HIGH 的有：`cardLineOf`、`runWithConfirmBoundary`、`typedConfirmationReminder`、`objectOf`、`withoutCardTalk`、`stripCardTalk`、两个 entry store 的工厂函数、`decideNextStep`。改动都是窄范围的，都有测试覆盖。
  - 报 UNKNOWN 的（新增或未入索引的符号）都用文本搜索确认了调用方。
- 每次提交前都跑了 detect-changes，结果均为 low，没有 partial 或 truncated。
  - `77b8eae7d` 只改了常量，索引里没有与改动行重叠的符号，在记录里注明了这一点。

## 证据（`~/orbit-sprint-evidence/agent-design/sprint-AG07/`）

- **视觉稿：** `visual-draft/`（获批稿的截图）。
- **run-01：** `run-01/`
  - 网页截图：`web-1440-card-final.png`、`web-375-card-final.png`、`web-1440-done-final.png`、`web-1440-progress-final.png`。
  - 稳定性对照：`stability-compare.txt`。
  - impact 和 detect 输出：`impact*.txt`、`detect*.txt`。
  - 全量日志：`full-orbits-repair2.log`、`full-app-repair2.log`。
  - 门槛输出：`gate-repair2*.out`。
- **Simulator：** `run-01/sim/`
  - 回读记录 `READBACK.md`，带日期，含 run-01 与第 2 轮重拍。
  - 截图 `a1…d5`、`r2-09`、`r2-d1…r2-d5`。
  - 代理日志 `proxy-*.log`。
  - `REPRO-503-lost-edit.md`。
- **run-02：** `run-02/`
  - `gate.out`，以及中间运行的 `gate-000d54a-interim.out`、`gate-663fa96-interim.out`。
  - `full-orbits.log`、`full-app.log`、`app-tsc.log`、`detect*.txt`。
- **run-03：** `run-03/`
  - `gate.out`、`full-orbits.log`、`full-app.log`、`app-tsc.log`、`impact.txt`、`detect.txt`。
- **评测运行：** `~/orbit-sprint-evidence/agent-eval/runs/<上表 run id>/`，每次都含 `judging.md` 与评审包。

## 交接

**给后续 sprint 的接口和约定**
- 卡预览上的字段：
  - 每个操作有 `display`（`record`、`rows[{field,label,before,after}]`、`change`、`note`）；预览带 `locale`。
  - `answer.basis {text, links[{type,id,label,contactId}]}`、`answer.cardLine`。
- 接口：
  - `POST /api/agent/ledger/[id]/recheck`：按现在的数据重新检查这张卡，出新版或说明没变。
  - `GET /api/ai/conversations/protocol`：告诉客户端服务端说哪个协议。
  - 事件带 `stage`。
- 共享函数：
  - 卡片视图规则 `shared/compute/agent-card-view.ts`（`agentCardView`、`confirmButtonLabel`），已同步到 App。
  - 提到按钮的文字一律用 `cardConfirmLabel(language, count)`。
- 回答里的结构化条目：`answer.changes[{source, older, before, reason}]`，由代码核对后写成句子。
- 读取记录：部分读取会在 `coverage[].direction` 记下读的是哪一端。
- 已加进代码的规则（新的回答规则沿用同一套写法）：
  - `stripSaveTalk` / `stripCardTalk`（含删引出句）、`withoutWrongDirection`、`withoutOnly`；
  - `unsourcedDates` / `withoutUnsourcedDates`；
  - `reschedulesTo`；
  - `statusSaidIn`（已过期 = 未完成）；
  - 问附上的记录时只读这条记录。

**留给后续 sprint 的事项**
- (a) **AE-UND-006：** 日文回答在本轮没有读取的情况下说出「山本さんとの食事は3件あります」。记录的数量必须来自一次读取，需要一条代码规则。
- (b) **AE-AMB-008：** 用户点选之后，最终回答开头仍是「是李薇？」。恢复后的回答应去掉已经回答过的追问。
- (c) **AE-XL-007** 把小林写成「林」；**AE-XL-010** 只有一个候选时仍问是哪位小陈。
- (d) **trace 里 requestId 不对：** server-preload 的查询挂在一个过期的 requestId 下（run-03 门槛有 30 多个用例出现 AE-AMB-004 的 id）。caseId 是对的，requestId 是错的，属于运行器或 trace 的归属问题。
- (e) **503 丢修改（AG07 之外）：** 「跟进」类待办在线编辑时遇到 503，修改会静默丢失。复现说明见 `run-01/sim/REPRO-503-lost-edit.md`，请协调者转交。
- (f) **App 输入框提示的空格：** 「有 1 项待办修改还没同步，AI 暂时看不到」在 AG07 之前就有，汉字和数字之间有空格，不符合 R03。
- (g) **App 偶发失败的测试：** "wrong-value receipt cannot acknowledge the date or discard its retry key" 在负载下失败过一次，单独运行 5/5 通过。

**需要用户决定或授权**
- 备忘录正文是否改写成自足的说法（目前存用户原话，卡上不显示）。
- 合并、push、部署都没有授权，等待协调者。

**回退方式**
- 本分支只有新增和替换的提交，没有迁移和数据写入。回退就是不合并，或在 `orbit-agent-claude` 上 revert 合并提交。
- App 端协议检查只看服务端返回值，服务端关闭 `ORBIT_AGENT_V1_MODE` 后自动回到协议 2。

## 协调者复核与结论

- **结论：completed（run-03）。** run-01 用满两轮修复，run-02、run-03 按用户 2026-11-16 选定的做法 A 作为例外重跑；每次失败都改成代码规则，不靠改提示词。
- **评审（都是新开的 Claude 会话，互不可见）：**
  - run-01（`b0d77d7`）：AG07 门槛两评都是 42/43，AE-SCL-006 R2 没说出旧值 12 月 1 日；AG06 复跑同一例却通过，说明随模型变化 → 改由代码写出旧值。
  - run-02（`77b8eae`）：AG07 门槛两评 43/43；AG04 复跑 35/37（AE-AMB-003 没写却说「记下了」，AE-AMB-007 改到周五却问「想做什么」），两例在 run-01 都通过 → 两条代码规则。
  - run-03（`28e0ab4`）：AG07 门槛两评 43/43；AG06 47/47、AG05 43/43、AG04 37/37、AG03 39/39，都没有 `caseIssue`。
  - 15 次运行都已用 `agent-eval:report --append-runs` 记进 RUNS.md。
- **协调者抽查：**
  - AE-SCL-006 transcript：原因那一行是代码写的。
  - AE-UND-006：确认「3件」这一轮没有读取 → 交接 (a)。
  - trace 里 AE-AMB-004 的 requestId 出现在 30 多个用例：都是 `server-preload` 事件，`caseId` 和时间都属于本用例，不是数据串用，是归属标签错 → 交接 (d)，随评测并行化一起修。
  - App 偶发失败的测试在 AG07 前就有、文件未改，单独连跑 5 次 32/32 通过 → 交接 (g)。
- **备忘录正文：** 保留用户原话，卡上不显示（按获批视觉稿）。
- **评审说明的修改：** 一位评审把用例分给自己的分身去评，之后评审说明加了一条「全部自己评，不派 agent」。
- **花费：** DeepSeek 约 6.2 元（各次运行汇总，未查余额）。
