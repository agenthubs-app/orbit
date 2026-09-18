# Sprint 0083 — 执行报告

## 结果

**completed。** 四项 SC 均有证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。唯一 run-01。
批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256 `db35473f…`（登记表）。

## 先用人话说

"资料更新建议"页里的建议值、理由、来源标签、汇总和下一步全部改成按账号语言输出（中／日／英三语字典，未知语言回落中文）。
证据摘录**不翻译**——它是来源数据不是文案——改为在上面加一行"来源原文"标注。这是 PLANNER 的默认选择，因为你没回答"要不要连种子英文对话一起中文化"这个边界问题。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `907edccb3` |
| 功能提交 | `4c64423b1` feat(sprint-0083) |
| 合并 | `1f09fe288` merge(sprint-0083)（`--no-ff`），`merge-base --is-ancestor` 退出码 0 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0083-01 三语文案 | pass | `profile-signal-review-live-store.test.ts` 新增用例：zh／ja 下 3 条建议的建议值／理由／sourceLabel／summary／nextAction 全部不匹配英文长句正则；未知语言（空串、`fr`、`klingon`、缺省）回落 zh；`en` 仍是英文且 summary 含 "3 sourced profile suggestions" |
| SC-0083-02 摘录处理 | pass | 截图 `sprint0083-phoneweb-suggestions.png`：建议正文全中文，英文摘录下方带"来源原文"标注 |
| SC-0083-03 采纳值本地化 | pass | 新增用例：zh 采纳后 `profilePatch` 的值与 `nextAction` 均非英文（写进资料的不再是 `follow-up collaborators`） |
| SC-0083-04 无回归 | pass | orbits 定向 11/11、typecheck 0；App 全量 3508/3508、typecheck 0 |

## 与 PLANNER 的偏差（如实）

- **进入条件未满足仍执行**：用户未回答种子中文化的边界问题，按 PLANNER 默认（不改种子）执行。生成的 `messages`／`interactionMemories`／`evidence` 仍是英文，摘录因此仍显示英文原文。若要连种子一起中文化，需另开一轮并重跑 `db:seed:live-generated-fixtures`。
- 语言由客户端以 `?language=` 传递，未读账号语言偏好表——避免为一次文案渲染增加一次业务读（0070 账本）。
- mock 服务的英文未改（只在 dev 能力页使用）。

## 命令与退出码

| 命令 | 结果 |
| --- | --- |
| `node scripts/run-node-tests.mjs tests/capabilities/profile-signal-review-*.test.ts` | 11/11 |
| `npx tsc --noEmit`（orbits）／`npm run typecheck`（App） | 0／0 |
| `npm test`（App 全量） | 3508/3508，exit 0 |

## 下一步

种子英文数据（320 条互动记忆、58 条消息、networkPeople 的 role／location）仍是英文，等你决定是否中文化。
