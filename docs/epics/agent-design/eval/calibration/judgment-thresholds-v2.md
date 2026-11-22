# 判断题门槛的校准记录 v2

由 `npm run agent-eval:calibrate` 写出（scripts/agent-eval/calibrate-judgment.ts），最近一次：2026-11-17T12:21:09.361Z。模型 `gemini-decision-1`，真实调用 105 次，输入 20389 token。样本：[judgment-samples-v2.yaml](judgment-samples-v2.yaml)；本次只校准 `outbound.extra`，其余格子沿用 [v1 记录](judgment-thresholds-v1.md) 的值；原始返回在 `~/orbit-sprint-evidence/agent-design/sprint-AG09/run-01/calibration/`。

门槛的定法（PLANNER 执行顺序 5）：只看 dev 样本，取“非保守答案零误判”的最低置信度——比最高的一个误判还高的正确非保守答案里，置信度最低的那个；dev 样本不足 20 条，或者没有这样的答案，这一格不启用。val 只用来核对。门槛向下取到千分位。

`match.level` 是评级题，按等级读：置信度取“至少部分匹配”的概率（证据不足以外两级之和），过门槛才算部分匹配，“至少匹配”的概率也过门槛才算匹配（ask.ts `scoreDecision`）；它的门槛不低于 0.5。误判指标注为证据不足的候选被算成至少部分匹配。

| 题目 | 语言 | dev 样本 | 门槛 | dev 上采纳（非保守且过门槛） | dev 误判 | val 样本 | val 上采纳 |
|---|---|---|---|---|---|---|---|
| `outbound.extra` | zh | 31 | 0.901 | 20/31 | 0 | 4 | 0/4，误判 0 |
| `outbound.extra` | ja | 31 | 0.870 | 20/31 | 0 | 4 | 2/4，误判 0 |
| `outbound.extra` | en | 31 | 0.966 | 20/31 | 0 | 4 | 2/4，误判 0 |
| `match.level` | zh | — | 0.675 | 沿用 v1（本次未重跑） | — | — | — |
| `match.level` | ja | — | 0.932 | 沿用 v1（本次未重跑） | — | — | — |
| `match.level` | en | — | 0.542 | 沿用 v1（本次未重跑） | — | — | — |
| `intent.explicitWrite` | zh | — | 0.951 | 沿用 v1（本次未重跑） | — | — | — |
| `intent.explicitWrite` | ja | — | 0.933 | 沿用 v1（本次未重跑） | — | — | — |
| `intent.explicitWrite` | en | — | 0.883 | 沿用 v1（本次未重跑） | — | — | — |
| `duplicate.same` | zh | — | 0.833 | 沿用 v1（本次未重跑） | — | — | — |
| `duplicate.same` | ja | — | 0.873 | 沿用 v1（本次未重跑） | — | — | — |
| `duplicate.same` | en | — | 0.822 | 沿用 v1（本次未重跑） | — | — | — |

未校准、不启用（本 sprint 不发这些题，按“判断不可用”处理）：`quote.sentence`、`evidence.sameEntity`、`evidence.sameTime`、`evidence.sameBasis`、`evidence.supports`、`interaction.happened`、`followup.owner`。其中 `interaction.happened`、`followup.owner` 由 AG10 校准；证据核对的四题与 `quote.sentence` 还没有样本。`outbound.extra` 的标注口径：no = 只含查所问公开信息需要的内容；误判 = 答“否”（可发）而标注是 yes。
