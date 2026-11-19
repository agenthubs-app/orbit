# 判断题门槛的校准记录 v3

由 `npm run agent-eval:calibrate` 写出（scripts/agent-eval/calibrate-judgment.ts），最近一次：2026-11-17T17:31:05.528Z。模型 `gemini-decision-1`，真实调用 74 次，输入 18826 token。样本：[judgment-samples-v3.yaml](judgment-samples-v3.yaml)；本次只校准 `interaction.happened`、`followup.owner`，其余格子沿用当时的配置（[v1](judgment-thresholds-v1.md)、[v2](judgment-thresholds-v2.md) 记录的值）；原始返回在 `~/orbit-sprint-evidence/agent-design/sprint-AG10/run-01/calibration/`。

门槛的定法（PLANNER 执行顺序 5）：只看 dev 样本，取“非保守答案零误判”的最低置信度——比最高的一个误判还高的正确非保守答案里，置信度最低的那个；dev 样本不足 20 条，或者没有这样的答案，这一格不启用。val 只用来核对。门槛向下取到千分位。

`match.level` 是评级题，按等级读：置信度取“至少部分匹配”的概率（证据不足以外两级之和），过门槛才算部分匹配，“至少匹配”的概率也过门槛才算匹配（ask.ts `scoreDecision`）；它的门槛不低于 0.5。误判指标注为证据不足的候选被算成至少部分匹配。

| 题目 | 语言 | dev 样本 | 门槛 | dev 上采纳（非保守且过门槛） | dev 误判 | val 样本 | val 上采纳 |
|---|---|---|---|---|---|---|---|
| `interaction.happened` | zh | 24 | 0.836 | 11/24 | 0 | 6 | 2/6，误判 0 |
| `interaction.happened` | ja | 24 | 0.631 | 7/24 | 0 | 4 | 2/4，误判 0 |
| `interaction.happened` | en | 22 | 0.891 | 10/22 | 0 | 3 | 0/3，误判 0 |
| `followup.owner` | zh | 23 | 0.871 | 22/23 | 0 | 3 | 3/3，误判 1 |
| `followup.owner` | ja | 21 | 0.846 | 21/21 | 0 | 3 | 3/3，误判 0 |
| `followup.owner` | en | 21 | 0.752 | 20/21 | 0 | 3 | 3/3，误判 1 |
| `match.level` | zh | — | 0.675 | 沿用（本次未重跑） | — | — | — |
| `match.level` | ja | — | 0.932 | 沿用（本次未重跑） | — | — | — |
| `match.level` | en | — | 0.542 | 沿用（本次未重跑） | — | — | — |
| `intent.explicitWrite` | zh | — | 0.951 | 沿用（本次未重跑） | — | — | — |
| `intent.explicitWrite` | ja | — | 0.933 | 沿用（本次未重跑） | — | — | — |
| `intent.explicitWrite` | en | — | 0.883 | 沿用（本次未重跑） | — | — | — |
| `duplicate.same` | zh | — | 0.833 | 沿用（本次未重跑） | — | — | — |
| `duplicate.same` | ja | — | 0.873 | 沿用（本次未重跑） | — | — | — |
| `duplicate.same` | en | — | 0.822 | 沿用（本次未重跑） | — | — | — |
| `outbound.extra` | zh | — | 0.901 | 沿用（本次未重跑） | — | — | — |
| `outbound.extra` | ja | — | 0.870 | 沿用（本次未重跑） | — | — | — |
| `outbound.extra` | en | — | 0.966 | 沿用（本次未重跑） | — | — | — |

未校准、不启用（按“判断不可用”处理）：`quote.sentence`、`evidence.sameEntity`、`evidence.sameTime`、`evidence.sameBasis`、`evidence.supports`；证据核对的四题与 `quote.sentence` 还没有样本。`outbound.extra` 的标注口径：no = 只含查所问公开信息需要的内容；误判 = 答“否”（可发）而标注是 yes。`interaction.happened`：误判 = 答“是”而标注是 no（只被提到、打算、别人之间、转述）。`followup.owner`：保守结果 doubtful 不是选项，每个答案都算采纳；误判 = 答案与标注不同。
