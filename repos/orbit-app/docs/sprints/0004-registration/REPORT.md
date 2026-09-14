# Sprint 0004 — 执行总结

## 目标实现情况

- 本轮实现报名资格、直接报名、取消、重报和准入申请，使 App 只执行服务端允许的动作。
- 已验证普通报名的重复提交、取消和重报保持同一记录身份；准入申请可在真实原生流程回答两道模型签名问题、提交待审核并撤回；详情、活动列表、首页和日历读取同一公开活动投影，明确的 0 人显示为 `0 人已报名`。
- SC-0004-01～05 均通过。真实 QA 数据已清理，默认活动已恢复到运行前版本；没有把匿名请求、mock 成功或旧缓存当作真实验收。

## 运行记录

- 目标／原需求：R-04，报名资格与答案回读。
- 结果：completed。
- run：run-01；Generator owner：当前主代理 `/root`；开始 2026-09-15 00:55 JST，结束 2026-09-15 02:20 JST。
- Planner revision／SHA256：revision 1；`1e4d139e552c9090eb7fda71b6438a22753a04a4b1e69f3d0b690f0ed8ea9519`。
- 基线 HEAD／承接的脏文件：`b2afc634d`；无承接产品脏文件，用户未跟踪设计素材、prototype 和 `.gitnexus` 未触碰。
- 被验收的最后功能 HEAD：`319f6f7bb`。
- 原环境／账号角色／设备（脱敏）：默认本地 workspace 的合成 QA 成员；隔离 workspace `qa:a0004:run01` 的合成账号、活动和准入策略；iPhone 17 Pro Simulator、iOS 26.4、Expo Go/Hermes；本地 PostgreSQL 与 Next 服务。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 启动 run、登记批准范围 | `docs/sprints/0004-registration/APPROVED_SCOPE_ADDENDUM.md`、登记表 | `4b9fcf92a` | 运行契约 |
| 以服务端资格快照控制报名、取消和重报；校验 actor/event/action/version 回执 | App 报名／详情／view-model/API endpoint 及测试；Web registration contract、eligibility、route handlers、admission control 及测试 | `6c3ff4cc6` | 01～03 |
| 公开活动列表与详情暴露 canonical membership 人数 | Web public catalogue、public handlers 及数据库／路由测试 | `4591428b7` | 04 |
| 接通准入问答、申请提交、待审核和撤回 | App 报名页／view-model；Web admission/eligibility 及测试 | `58c01f49a` | 01、02、03、05 |
| 修复准入详情入口、提交当前已输入的第二个签名回答，并使完全相同的申请可幂等重放 | App 详情／报名页及测试；Web admission PostgreSQL repository 及测试 | `603a59e1a` | 01、03、05 |
| 首页改读 canonical public catalogue；明确 0 人与缺失人数分开显示 | `HomeScreen.tsx`、`events.ts`、三份回归测试 | `319f6f7bb` | 04 |

实际验收发现首页仍读取私有导入集合，且公共投影的明确 0 人被当成未知值。`HomeScreen.tsx`、`events.ts`、`app-wide-events.test.ts`、`home-view-model.test.ts`、`screen-state.test.ts` 不在原文件锁中，但属于 SC-0004-04 必需的同记录跨页回读；用户对 A 线连续执行及必要跨端修复的授权覆盖该范围修正。修改前分别执行影响分析：`HomeScreen` 为 LOW；`eventParticipantCountLabel` 为 CRITICAL（34 个上游、5 条流程），已先向用户警告并以 127/127 view-model 回归及 App 全量覆盖。

## 验收结果

| SC | 结果 | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0004-01 | pass | 服务端资格矩阵、报名 route、App registration/detail；真实普通报名和真实准入原生流程 | 覆盖未开放、截止、结束、取消、满额、待审、已报名、取消后重报；写入时再次核验资格。 |
| SC-0004-02 | pass | App registration interactions/view-model；真实准入问答 | 题库版本、刷新／失败草稿和当前输入均保留；旧版或读取失败不能提交。 |
| SC-0004-03 | pass | Web 18 项 registration/deadline/operations/PostgreSQL 组；普通报名 HTTP | 重复 register/cancel/reactivate 返回稳定结果；错误版本更新为 409；App 丢弃错 actor/event/action/version 或迟到回执。 |
| SC-0004-04 | pass | 真实 HTTP list/detail 计数 1→0→1；原生详情、首页、日历；公开目录 PostgreSQL 测试 | 同一活动的报名状态和人数来自 canonical membership；明确 0 人不再显示“待确认”。 |
| SC-0004-05 | pass | 隔离 PostgreSQL 准入申请 v1/v2 回读及 matching snapshot 测试 | 两个模型签名回答按同 actor/event 保存；撤回版本保留相同回答；matching snapshot 与源回答一致。 |

## 最小验证与未运行项

| 命令／场景 | 版本／时间 | 退出码／结果 | 对应 SC／证据路径 |
| --- | --- | --- | --- |
| App registration interactions + view-model + EventDetail | 收口版本 | 30/30、14/14、191/191 | 01～05 |
| participant count view-model 直接／间接回归 | `319f6f7bb` 前 | 127/127 | 04 |
| Web registration/deadline/canonical/matching PostgreSQL 组 | 收口版本 | 18/18 | 01、03～05 |
| Web public route/service 相关组 | 收口版本 | 34/34；真实 PostgreSQL frozen/canonical 5/5 | 04 |
| App 全量首次 | `603a59e1a` 后 | 2641/2642；唯一失败是旧 integration fixture 未包含新增 `intent` | 03；保留最初失败 |
| 修正 fixture 后命名用例 | `319f6f7bb` 前 | 1/1 | 03 |
| App 最终全量 `npm test` | `319f6f7bb` | 2642/2642，0 fail/skip/todo | 01～05 |
| App `npm run typecheck` | 2026-09-15 02:20 JST | exit 0 | 全部 |
| Web `npm run typecheck` | 2026-09-15 02:20 JST | exit 0 | 全部 |
| `git diff --check b2afc634d..319f6f7bb` | 2026-09-15 | exit 0 | 范围检查 |
| 普通报名真实 HTTP | 默认 workspace，合成 QA actor/event | register 200；重复同 ID/version；cancel/reactivate 及重复稳定；错误版本 409；list/detail 计数 1→0→1 | 01、03、04 |
| 准入真实原生 + PostgreSQL 回读 | 隔离 workspace，iPhone Simulator | 创建账号并凭证登录；2 次真实 DeepSeek 问题；application v1 pending_review、v2 withdrawn；两版均为 2 个相同签名回答 | 01～05；`build/harness-state/evidence/sprint-0004/run-01/native/` |

本轮因报名写入、资格、公开投影及原生入口属于 H 级，按 Planner 对 App 执行一次最终全量；Web 侧执行受影响服务／route／真实 PostgreSQL 组和最终类型检查，没有为无关子系统补跑全量。GitNexus 索引在提交前仍报告 stale，`detect_changes` 对暂存差异给出无变化或无关 `AGENTS.md` 结果；没有把该结果当作有效证明，另行逐提交审核实际暂存文件和最终 diff。

## 交接

- 已验证成果／仍欠功能：Sprint 0004 的五项 SC 均完成；本 Sprint 没有剩余必需功能或验证。Google OAuth 最终系统回跳属于 0003，不是本 Sprint 缺项。
- 未提交改动、文件所有权及活进程句柄：报告创建前没有 tracked 产品改动；用户未跟踪资产未触碰。默认 Next dev 服务已恢复在 `127.0.0.1:3000`（恢复时 session `31803`）；Metro 继续监听 8081（恢复时 PID `78661`）。
- App／API 实际版本、另一端影响：最终功能 HEAD `319f6f7bb`；App 报名与 Web eligibility/admission/public catalogue 契约一起验收，不能只回退其中一端。
- 数据清理：隔离 workspace 删除 2 application heads、4 application versions、1 policy head/version、1 config head/version、6 audit、1 event、6 orbit records，复核为 0；默认 workspace 删除 QA membership/profile/config、对应 versions/audit/outbox/orbit records，并把 `event_signup_03` 恢复到原 revision 3 与原时间，复核 QA active membership/config/orbit records 均为 0，公开人数为 0。
- 费用：历史累计账本为 USD 0.012780／硬上限 USD 5。本轮至少 4 次真实 DeepSeek adaptive-question 请求（隔离 HTTP actor 2 次、原生 actor 2 次）；未取得逐请求 token／金额，增量成本未知，不能写成 0。
- 已知风险／恢复或回退方式：GitNexus 索引 stale 影响自动 blast-radius 报告可信度，但产品测试、类型、真实回读和人工 diff 已独立验证。需要回退时按上表功能 commit 逐个 `git revert` 并同步两端，不覆盖工作树或用户资产。
- 下一步：A 线可释放 0004 文件锁；协调者继续处理其他 Sprint 的已验收交付。0003 的 Google OAuth 最终系统回跳仍依赖用户拥有的 provider credentials，应在 0003 报告中单独保留，不倒灌到 0004。
