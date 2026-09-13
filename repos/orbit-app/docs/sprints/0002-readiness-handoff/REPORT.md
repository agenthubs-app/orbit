# Sprint 0002 — 接口、授权与原生验收就绪清单执行总结

## 运行记录

- 目标／原需求：R-01 及 B1～B8、D 决策和 R-00～R-12 运行前置的文档盘点；把后续 Sprint 的协议、运行、决策、环境、样本和授权缺项写成可领取条件。
- 结果：completed；SC-0002-01～05 均以同一文档提交和静态事实检查通过。结果只完成就绪交接，不完成任何后续 R 项或 Sprint 0003～0019。
- run：run-01；唯一 Generator `/root/sprint_0002_generator`；2026-09-14 00:15～00:38 JST。没有 Evaluator 或第二个实现者。
- Planner revision：1；SHA256：`8efbf5aa556577c7c395fb170242c609ee1c2cb61d539d57ca8800f3fb45441a`。
- 基线 HEAD：`bc6a6c1ed8e8946668d16a6923741569577b56ef`；三个白名单文档启动时均无差异。随后协调者的框架文档提交 `1a0c708...` 不改产品源码。
- 被验收的文档 HEAD：`cced58bd7c30308e3e0ac21fcd7b3de6466b372a`（`docs(sprint-0002): record readiness handoff`），已本地提交，未推送；产品 `src/`、`app/`、`tests/` 仍与功能 HEAD `bc6a6c1ed...` 相同。
- 环境：App cwd 的源码、Planner、历史证据和 GitNexus 静态图；没有使用运行账号、设备或业务服务，没有读取凭证、配置值或数据库。

## 改了什么与 commit 对应

以下三个文件均在文档提交 `cced58bd7c30308e3e0ac21fcd7b3de6466b372a` 中，共 148 行增加／37 行删除。

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 纠正固定资料替换和 AI 泛称 ID POST 续聊；补 B1～B8 六类缺项及按边界恢复条件 | `docs/api-gaps.md` | `cced58bd7c30308e3e0ac21fcd7b3de6466b372a` | 01、02、03、04 |
| 保留 AI、资料、R-11 和 0001 的已完成证据；分开四个风险／故障；按 immutable Planner 列出 0003～0019 READY 输入 | `docs/verification/2026-09-13-app-connectivity.md` | `cced58bd7c30308e3e0ac21fcd7b3de6466b372a` | 01、02、03、04 |
| 用当前已跟踪 render suites 替换过时缺口，并分列 RNW、Simulator、实体 iPhone 相机／推送、Android/back 和 VoiceOver | `docs/superpowers/plans/2026-09-08-app-wide-native-qa-matrix.md` | `cced58bd7c30308e3e0ac21fcd7b3de6466b372a` | 05 |

## 验收结果

| SC | 结果 | 证据及覆盖范围 |
| --- | --- | --- |
| SC-0002-01 | pass | 连通性记录 24.1 以 P/R/D/E/S/A 六类定义关闭证据；24.4 有 0003～0019 共 17 行逐 Sprint 映射。READY 输入与执行期 SC 证据分开，现状态与登记表一致为 `blocked`、`run_count = 0`／not ready；每个 Sprint 只等待自身依赖，既有同范围批准继续有效。 |
| SC-0002-02 | pass | 24.2 复用 11.3 的同账号 Simulator 真实生成、工具读取、4→6 条消息保存／重开，以及 16～20、23 节的 R-11 已提交 App 子功能；引用 0001 REPORT 的 13 条／4 地点／上海 3 条。文本明确 Sprint 0002 未重跑，也未关闭 B3、完整 R-00/R-02/R-11/R-14。 |
| SC-0002-03 | pass | `docs/api-gaps.md` 的 Profile 章节改为 `ProfileCard` 直接消费 `profileToSummary(data)`，并把 `homeMarket` 说明为 legacy `timezone` fallback 而非 IANA 契约；AI 章节区分普通 ID POST 与 App session 使用 root POST history 后另存 snapshot。源码锚点逐行核对通过。 |
| SC-0002-04 | pass | 24.3 分别记录 Web 恢复后的自动保存风险、批次 GET 初始化／迁移副作用、报名问卷 500 和通知投递详情 vault 500。每项均列已确认事实、禁止推断、建议责任和恢复条件；没有声称真实数据丢失、过往批次失败根因或另一责任方已接单。 |
| SC-0002-05 | pass | 原生 QA 文档删除四项 stale untracked 说法并按当前仓库重列真实 screen render，不要求后续重建已有 schedule/event/profile/settings/chat 覆盖；最小矩阵独立列出六个运行层、现有证据、缺测导航和执行前置，明确 RNW 不能替代设备结果。 |

本轮重点源码事实锚点为：`repos/orbit-app/src/view-models/profile.ts:444-472`、`repos/orbit-app/src/screens/profile/ProfileScreen.tsx:483-499`、`repos/orbit-app/src/screens/ai/AiConversationScreen.tsx:254-335`；`repos/orbits/app/api/ai/conversations/route.ts:126-172` 与 `[id]/route.ts:68-80`；Web restore/persist `orbit-real-agent.tsx:2487-2570,2761-2813`；session snapshot upsert `orbit-agent-chat-session-live-record-provider.ts:456-523`；名片 V2 配置／迁移和通知 delivery/push service 的锚点完整列在 24.3。静态检查确认 24 节的 15 个源码引用文件存在且行号未越界；图未列出流程不解释为零风险。

## 最小验证与失败记录

| 命令／场景 | 版本／时间 | 结果 | 对应 SC／证据 |
| --- | --- | --- | --- |
| `git diff --check` | 提交前，三个白名单文档及共享工作树 | exit 0 | 01～05；无 whitespace 错误 |
| Node 相对链接／heading anchor／源码范围检查 | 提交前，三个白名单文档 | exit 0；14 个相对链接、其中 3 个 heading anchors、24 节 15 个源码引用均通过 | 01～05；本轮命令记录 |
| `git ls-files --error-unmatch` 检查 QA 文档引用的当前 render suites | 提交前 | exit 0；16 个引用 suite 均已跟踪 | 05；本轮命令记录 |
| 0003～0019 表行检查并逐一对照各 `PLANNER.md` 进入条件 | 提交前 | 17/17 行；0009 和 0013 的范围纠正，READY 与 SC 不再循环 | 01；24.4 |
| staged `gitnexus_detect_changes` | `cced58bd7` 提交前，由协调者在刷新后的索引执行 | LOW；仅 3 个文档、16 个 Section symbols、0 affected flows，白名单精确 | 01～05；协调者提交记录 |
| `git diff --exit-code cced58bd7 -- <三个白名单文档>` | 提交后 00:37 JST | exit 0；工作树三文件与被验收提交完全一致 | 01～05；本轮命令记录 |

第一次自制 heading-anchor 检查器把 heredoc 后的路径错误放在 shell 命令位置，路径被当作命令并得到 `permission denied`；它没有修改文件或执行产品代码。纠正参数位置后只重跑该静态检查并通过。另一次并行 GitNexus context 查询曾遇到临时 `LadybugDB not initialized`；在协调者完成刷新后串行源码核对成功，最终 staged detect 也通过。两项失败均保留在忽略的 checkpoint，不伪装成首次即通过。

Planner 指定 D 档，因此没有运行产品测试、typecheck、HTTP、浏览器、Simulator、原生设备、业务写入、服务启停、迁移、推送、OCR 或付费 AI。它们不是本 Sprint 的验证方式，未运行不填成通过。

## 交接

- 已验证成果：三个文档以提交 `cced58bd7...` 固化；B1～B8 不再被笼统称为缺 endpoint，过时 Profile/AI 描述已纠正，四类风险／故障已分开，设备矩阵只列真实缺测。
- 仍欠功能：Sprint 0003～0019 均保持 `blocked`、`run_count = 0`，没有启动、没有实际 REPORT、没有完成其任何实现期 SC。解除阻断按 24.4 的依赖图逐项进行，不要求先关闭所有 B/D 项；例如 0003 只等待 0002 REPORT、B1/D2 及自己的账号／环境／授权。
- 未提交改动与文件所有权：三个 Generator 文档无残余差异；本报告新建后由协调者提交。`docs/sprints/README.md` 的状态更新由协调者持有；既有设计图片、prototype、`.gitnexus` 等不属于本 Sprint，未触碰或纳入提交。ignored checkpoint 位于 `build/harness-state/evidence/sprint-0002/run-01/checkpoint.md`。
- 活进程：Generator 未启动产品、浏览器、Simulator 或测试进程；GitNexus refresh 已由协调者结束，没有本 run 需交接的句柄。
- App／API 版本与另一端影响：产品 App 功能仍为 `bc6a6c1ed...`，当前文档 HEAD 为 `cced58bd7...`；API/Web 未修改、未部署。本文只建议责任和恢复条件，不声称 Web/API/配置负责人已接单；根 Bridge 未由 Generator 修改。
- 费用：本 Sprint 0 次新增 AI/OCR 请求、0 新增预留；原累计硬上限 `$5` 和已记录 `$0.012780`／5 次供应商请求不重置。已有同范围批准可复用，新增动作仍按 24.4 逐项确认。
- 风险／回退：若文档事实被后续契约或版本替代，应在新证据中显式更新对应行；需要撤销提交时由协调者授权后对 `cced58bd7...` 定向 revert。本 run 未 merge、push、部署或执行破坏性回退。
- 下一步：协调者提交本报告并把 0002 登记为 completed；之后只在某一 Sprint 自身 Planner 的前序、协议、决策、环境、样本和动作授权齐全时，将该 Sprint 从 blocked/run_count 0 恢复为 ready。问卷 500、Web 会话恢复风险和通知 vault 500 继续作为三个独立问题处理。
