# Sprint 0114 — 补写主人（断网第 0 期，下半）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「断网也能用」第 8 步决定 2（来源记录按引用补写主人，共用每人复制一份）、决定 3（没有主人的演示数据补上合理主人，按引用关系或生成它的演示账号；修好种子脚本）、决定 4（检查覆盖批量脚本）；第 6 步第 0 期。
**单一目标:** 0116 要下发的联系人类别及其附属类别全部有主人；补写可重复执行；种子数据以后自带主人。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0113 合并后的 `chat-agent`（开工时追加提交号）。0113 已修通用 upsert 清空主人的问题，并建立了主人检查——本 Sprint 的补写命令必须以「已登记的处理方式」执行，不得绕过检查。
**进入条件:** 生产执行需用户确认并先备份。

## 已查明的事实（2026-09-27，开发库）

- 主人覆盖：contacts 94/93、connections 578/90、evidence 4,483/72、contact_detail_states 0 行。全库 `user_id` 为空 9,082/10,057 行，其中 7,959 行来自 `generated-relationship-fixtures`。
- 引用来源：信纸 `evidenceIds` 出现在 interactionMemories 600、connections 578、eventParticipantIntents 500、attendees 500、personRelationshipEdges 440、matchRecommendations 350、aiAnalyses 240、recommendationTests 235、networkPeople 132、contacts 94、tasks 80、orbitScheduleItems 70、agentActions 60、notifications 40、profiles 13、events 13 等；信封列 `evidence_ids` 在 45 个集合非空。被引用的来源编号 3,760 个（3,317 个是现存来源行），1,166 条来源没有被任何记录引用；**只有 2 个来源编号被 2 个以上不同的非空主人引用**。
- 种子：`shared/storage/seed-generated-fixtures.ts:295-297` 写了 `userId`，但行却为空——最可能的原因是之后的通用 upsert 不传主人时清空（0113 已修）；`scripts/seed-account-agent-pressure-fixtures.ts`、`seed-account-contact-fixtures.ts`、`seed-xiaoyu-three-month-planner.ts` 设置 `userId`；`seed-demo-workspace.ts:374-385` 显式 `set user_id = null`（针对 events）。
- AI 会话在个人子空间，主人由子空间隐含，不需补写；0109 的消息新表由成员表决定归属；活动专用表有自己的身份字段。

## 范围与文件

1. **确定附属类别**：只读调查 App 与网页联系人列表/详情实际读取的数据，列出 0116 要下发的类别（至少 contacts、connections、evidence、contact_detail_states；若联系人页还读 interactionMemories 等，一并列入并说明）。
2. **补写命令**（脚本，可重复执行，`--dry-run` / `--preview` / 执行）：
   - 联系人：按现有信纸字段（如 `accountId`）或生成账号确定主人；
   - 关系：按所属联系人的主人；
   - 来源记录：按引用它的已登记类别的主人；被多个主人引用的，每人复制一份（新编号），并把该主人的引用改指向自己那份；没有被引用、也无法判断的来源，按生成它的演示账号补写，仍无法判断的列入报告不改；
   - 联系人详情状态：按联系人主人。
   - 以 0113「已登记的处理方式」执行，并通过主人检查。
3. **种子脚本**：生成的行全部带主人；`seed-demo-workspace.ts` 对 events 置空主人的做法评估后保留或修改并说明（events 属于活动数据，不在联系人范围）。
4. **不补写的范围**：平台公共/算法中间数据（attendees、eventParticipantIntents、networkPeople、matchRecommendations、personRelationshipEdges、recommendationTests、aiAnalyses 等），在报告中逐类说明理由；agent 相关集合由 0111 处理。
- 排除：把联系人放进手机（0116）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0114-01 | 本地开发库执行后，附属类别清单中每一类主人为空的行数为 0（报告逐类前后对照）；无法判断的行单列并说明 | 执行记录 |
| SC-0114-02 | 共用来源复制后，两个主人各自的联系人详情页显示的来源内容与补写前相同 | 真库测试 + 页面对照 |
| SC-0114-03 | 命令可重复执行（第二次改动 0 行）；dry-run/preview 不改库；执行前导出受影响行 | 执行记录 |
| SC-0114-04 | 用种子脚本在空测试库重新生成数据后，附属类别清单中主人为空的行数为 0 | 测试 |
| SC-0114-05 | 主人检查未被绕过（补写走登记方式）；两端全量、typecheck 通过；棘轮不增加 | 摘要 |

## 测试

- 档位 H（批量数据修改）。开发集：补写命令的 Postgres 测试（含共用来源复制与引用改写）、种子测试、联系人服务测试；收口：orbits 全量（App 未改则复用）。

## 生产（需用户确认）

dry-run 统计 → 导出备份 → 执行 → 再 dry-run 确认 0。协调者汇总进 `PRODUCTION_ROLLOUT.md`。**0116 上线前生产必须已执行本命令。**

## 失败与交接

交接给 0116：附属类别清单与关联方式（写入 0116 的说明书）。
