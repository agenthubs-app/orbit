# 判断题门槛的校准记录 v1

由 `npm run agent-eval:calibrate` 写出（scripts/agent-eval/calibrate-judgment.ts），最近一次：2026-11-17T08:44:14.170Z。模型 `gemini-decision-1`，真实调用 147 次，输入 33680 token。样本：[judgment-samples-v1.yaml](judgment-samples-v1.yaml)；原始返回在 `~/orbit-sprint-evidence/agent-design/sprint-AG08/run-01/calibration/`。

门槛的定法（PLANNER 执行顺序 5）：只看 dev 样本，取“非保守答案零误判”的最低置信度——比最高的一个误判还高的正确非保守答案里，置信度最低的那个；dev 样本不足 20 条，或者没有这样的答案，这一格不启用。val 只用来核对。门槛向下取到千分位。

`match.level` 是评级题，按等级读：置信度取“至少部分匹配”的概率（证据不足以外两级之和），过门槛才算部分匹配，“至少匹配”的概率也过门槛才算匹配（ask.ts `scoreDecision`）；它的门槛不低于 0.5。误判指标注为证据不足的候选被算成至少部分匹配。

| 题目 | 语言 | dev 样本 | 门槛 | dev 上采纳（非保守且过门槛） | dev 误判 | val 样本 | val 上采纳 |
|---|---|---|---|---|---|---|---|
| `match.level` | zh | 23 | 0.675 | 8/23 | 0 | 4 | 2/4，误判 0 |
| `match.level` | ja | 22 | 0.932 | 10/22 | 0 | 3 | 1/3，误判 0 |
| `match.level` | en | 22 | 0.542 | 11/22 | 0 | 3 | 2/3，误判 0 |
| `intent.explicitWrite` | zh | 22 | 0.951 | 9/22 | 0 | 2 | 1/2，误判 0 |
| `intent.explicitWrite` | ja | 21 | 0.933 | 9/21 | 0 | 2 | 1/2，误判 0 |
| `intent.explicitWrite` | en | 21 | 0.883 | 9/21 | 0 | 2 | 1/2，误判 0 |
| `duplicate.same` | zh | 20 | 0.833 | 12/20 | 0 | 2 | 2/2，误判 0 |
| `duplicate.same` | ja | 20 | 0.873 | 11/20 | 0 | 2 | 2/2，误判 0 |
| `duplicate.same` | en | 20 | 0.822 | 10/20 | 0 | 2 | 1/2，误判 0 |

未校准、不启用（本 sprint 不发这些题，按“判断不可用”处理）：`quote.sentence`、`evidence.sameEntity`、`evidence.sameTime`、`evidence.sameBasis`、`evidence.supports`、`interaction.happened`、`followup.owner`、`outbound.extra`。其中 `interaction.happened`、`followup.owner` 由 AG10、`outbound.extra` 由 AG09 校准；证据核对的四题与 `quote.sentence` 本 sprint 没有样本。
