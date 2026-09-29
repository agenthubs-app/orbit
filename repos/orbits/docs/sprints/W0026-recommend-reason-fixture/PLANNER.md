# Sprint W0026 — 推荐理由的验收数据与页面复验

**Plan revision:** 2（本 Sprint 由 W0022 revision 1 的 SC-W0022-04 拆出，首版即按 revision 2 的 review 处理编制）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-07（推荐理由如实：无计划时写真实匹配的目标词，有计划时写对应阶段）、RV-02（验收发现）。W22-3 用户 2026-09-29 决定：不改分词算法，只造验收数据复验。
**单一目标:** `scripts/seed-verify-accounts.ts` 为 verify-legacy、verify-plan 各造一场「未开始、已发布、本人未报名、文字真实包含本人目标词」的验收活动，verify-plan 的计划挂一条 recommended 活动条目；3001 策略页可复验两种理由。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（W0025 合并后）。
**进入条件:**
- W0025 已合并（非代码依赖：避免策略页截图里「先联系谁」仍是来源不可用；另 W0022 的浏览器流程会重置 verify-legacy）。
- 3001 验收 server 与本机验收库可用（W0016）；不需要云端授权，不调用付费 AI。

## 已查清的事实（revision 2 按源码复核）

1. 推荐只取未报名的活动：`features/events/public-goal-recommendations.ts` 第 284–317 行 `registeredEventIds`、第 359–366 行过滤掉本人已报名（`rsvped`），之后按命中词数排序，最多 3 场（第 381 行）。现有种子活动都被本人报了名，所以理由为空。
2. 命中规则：`features/events/event-recommendation-tool.ts:133` `tokensFor(query)` 按「非 `a-z0-9`／假名／汉字」切分，长度 ≥2；第 173 行 `matchedTokensForText(text, query)` 看活动 `title + description` 是否包含该词。中文目标会被切成整段（例如 verify-legacy 的目标得到「三个月内认识」「位做跨境支付的产品负责人」「找到一个愿意试点的合作方」；verify-plan 得到「三个月内为企业软件新产品找到」「位早期投资人和」「家试点客户」）。所以活动文字必须原样包含其中一段。
3. 有计划时的理由：`app/(app)/app/agent/plan/plan-route-view-model.ts:628` `planEventReasons(snapshot)` 按计划里 `kind: "event"` 条目的 `linkedEventId` 映射阶段；`app/(app)/app/agent/iorbit-0918/iorbit-strategy.tsx` 第 109–117 行拼「对应你计划第 n 阶段：…」，第 258–265 行渲染（`data-orbit-iorbit-match-reason="plan"` 与目标词理由）。计划理由只替换出现在推荐列表里的活动，所以挂进计划的活动也必须满足事实 1、2。
4. 种子结构（`scripts/seed-verify-accounts.ts`）：
   - 第 85–160 行 `ACCOUNTS`，每个账号有 `eventIds`；第 164–171 行 `GLOBAL_VERIFY_MARKER` 与 `accountMarker(spec)` 用 actorId／email／`eventIds` 识别 verify 行，reset 靠它清理。新活动 id 必须以 `orbit-verify-` 开头并登记在对应账号的 `eventIds` 里。
   - 第 460–470 行 `VerifyEventSpec`；第 475 行 `seedEvent(runtime, event, registrant)` 一定会让 registrant 报名——本 Sprint 需要「只建活动、不报名」的写法（可给 `seedEvent` 加不报名的分支，或抽出建活动部分）。
   - 第 617 行 `seedPlanInProgress`（verify-plan 的计划，阶段 p1 第 1–4 周）；第 912 行 `seedAccount`（verify-legacy 当前直接 `return`）。
   - CLI：`--reset <账号>`、`--fingerprint`（第 1036–1100 行）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `scripts/seed-verify-accounts.ts`：上文事实 4 的各段。
- `features/events/public-goal-recommendations.ts`：第 227–260 行 `candidatesFromCatalogue`（未开始、已发布的判定），第 284–400 行（只读）。
- `features/events/event-recommendation-tool.ts`：第 133–181 行（只读）。
- `app/(app)/app/agent/iorbit-0918/iorbit-strategy.tsx` 第 100–150 行、第 250–270 行；`plan-route-view-model.ts:628`（只读）。

### 关键符号与影响等级
- `seedAccount`、`seedEvent`：脚本内部函数，只由本脚本调用（文本搜索确认；`scripts/verify-server.sh` 只调用脚本本身）。
- `tokensFor`：CRITICAL（partial，直接调用方 2 个）——**不改**。

### 前序交接要点
- W0016：verify 账号与数据只在本机验收库；`assertVerifyDatabaseTarget` 保证目标库；非 verify 行指纹前后必须一致。
- W0018：各场景依赖现有活动 `EVENT_UPCOMING_ID`（verify-plan 已报名）、`EVENT_TODAY_ID`（verify-event）和各账号目标文字。
- W0022：verify-legacy 的首页引导流程会生成计划后再 reset。

### 易错边界（都对应到 SC）
- 不改任何账号的目标文字，不改现有活动与报名。（SC-02）
- 新活动本人不报名；未开始、已发布；文字按现有算法**真实**包含目标词，不为了命中而改算法或写假理由。（SC-01）
- 只写 verify 行；`--reset` 连续两次结果一致；非 verify 行指纹不变。（SC-02）
- 活动文字注明「验收用合成活动，不是真实活动」，与现有种子一致。（SC-01）

## 范围与文件

- **修改：** `scripts/seed-verify-accounts.ts`（两场新活动、verify-plan 计划条目、verify-legacy 的 `eventIds` 与种子分支）。
- **新建：** 无。
- **排除：** 分词与推荐算法（中文切词、去掉纯数字词登记为新 Sprint 候选）、策略页 UI、现有账号目标、付费 AI、部署。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0026-01 | 种子新增两场验收活动（id 以 `orbit-verify-` 开头，主办方 verify-host，未开始、已发布，本人未报名）：一场文字原样包含 verify-legacy 目标里的一段词，一场包含 verify-plan 目标里的一段词；verify-plan 计划里新增一条 `kind: "event"`、`status: "recommended"`、`linkedEventId` 指向后者的条目（阶段 p1 或 p2） | 种子运行输出 + 数据库读回（活动行、报名为 0、计划条目） |
| SC-W0026-02 | `--reset verify-legacy`、`--reset verify-plan` 各连续两次结果一致（活动、计划条目数量与内容相同）；`--fingerprint` 前后一致；W0018 各场景用到的数据（目标文字、`EVENT_UPCOMING_ID` 报名、verify-plan 原计划条目与「约 林玫」）不变，变化逐项写进 REPORT | 两次 reset 输出对比 + 指纹 |
| SC-W0026-03 | 3001 策略页「下一步去哪」：verify-legacy 显示「匹配你的目标：『…』」，引号里的词出现在该活动文字里；verify-plan 显示「对应你计划第 n 阶段：…」；桌面 1440、手机 375，控制台 0 错误 | 截图（证据目录） |
| SC-W0026-04 | 回归：`npx tsc --noEmit -p .` 通过（脚本参与类型检查）；种子脚本未改变的账号（verify-new、verify-expired、verify-event）reset 后与改动前一致 | tsc + reset 输出 |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线和 Planner 哈希；先跑一次 `--fingerprint` 存档。
2. 改种子：只建活动不报名的写法 → 两场活动 → verify-plan 计划条目 → verify-legacy 的 `eventIds` 与分支。
3. `--reset` 两个账号各两次、`--fingerprint` 对比、数据库读回。
4. 3001 浏览器验证 → 暂存区 `detect-changes` → 提交。
5. 写 REPORT，交接。

## 最小测试与检查

- **档位：L。** 理由：只改验收种子脚本，不改运行时代码；影响边界是本机验收库的 verify 行。
- **开发定向：** 种子脚本的实际运行（reset、fingerprint、读回）；没有单测覆盖该脚本，不为它新建测试。
- **收口：** typecheck 一次；不跑全量（L 默认）。
- **浏览器：** 3001，verify-legacy、verify-plan。
- **不运行：** 付费 AI、Preview、全量测试、Codex 代码 review（L 档靠协调者抽查）。

## 失败与交接

REPORT 写：新活动 id 与文字、命中的目标词、计划条目、两次 reset 与指纹对比、截图路径；观察项：中文目标分词（整句成词、长度 ≥2 的数字成词）作为新 Sprint 候选。

## 修订记录

| review 意见（codex-plan-review.txt） | 处理 |
| --- | --- |
| P1-3（推荐理由种子与首页入口无实现依赖，应独立或证明是必要夹具） | 接受。独立成本 Sprint，L 档，只改种子与页面复验，不改算法 |
| 其余 | 不涉及本 Sprint |
