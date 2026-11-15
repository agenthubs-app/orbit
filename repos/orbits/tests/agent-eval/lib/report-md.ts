import type { CostSummary } from "./costs";
import type { CaseSummary } from "./run-files";

export interface RunSummaryLike {
  runId: string;
  label: string;
  gate: string | null;
  voided: boolean;
  voidReasons: string[];
  total: number;
  hardPass: number;
  cases: CaseSummary[];
  simulatedCases: string[];
  soloExcluded: string[];
  invariantPack: string[];
  startedAt: string;
  endedAt: string;
}

export interface JudgedCase {
  caseId: string;
  verdict: "pass" | "fail" | "needs_review";
  reasons: string[];
  /** README §3.3: items judged in this gate run but counted from a later sprint, with each judgment's verdict. */
  deferred?: { id: string; gate: string; verdicts: string[] }[];
}

function cell(text: unknown): string {
  return String(text ?? "").replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

/** report.md (README §4): for people; real and simulated calls in separate columns, never summed. */
export function renderRunReport(summary: RunSummaryLike, costs: CostSummary, judged: Map<string, JudgedCase> | null): string {
  const lines: string[] = [];
  lines.push(`# 运行 ${summary.runId}`, "");
  if (costs.remainingRuns !== null && costs.remainingRuns < 1) lines.push("**余额不够再跑一次同样的运行。**", "");
  if (summary.voided) lines.push(`**本次运行作废：** ${summary.voidReasons.join("；")}`, "");
  lines.push(`- 用途：${summary.label}${summary.gate ? `（门槛 ${summary.gate}）` : ""}`);
  lines.push(`- 起止：${summary.startedAt} — ${summary.endedAt}`);
  lines.push(`- 代码判定通过：${summary.hardPass} / ${summary.total}`);
  if (judged) {
    const values = [...judged.values()];
    lines.push(`- 最终通过（代码判定＋评审）：${values.filter((item) => item.verdict === "pass").length} / ${summary.total}；需人工复核 ${values.filter((item) => item.verdict === "needs_review").length}`);
  } else lines.push("- 评审：尚未汇总（agent-eval:judge-pack 出材料，agent-eval:report 汇总）");
  if (summary.soloExcluded.length) lines.push(`- 需单独运行、未包含：${summary.soloExcluded.join("、")}`);
  lines.push(`- 费用：${costs.amountCny.total.toFixed(4)} 元（只算真实调用；价格表 ${costs.priceTable.version}，${costs.priceTable.source}）`);
  lines.push(`- DeepSeek 余额：运行前 ${costs.balance.before?.total ?? "n/a"}，运行后 ${costs.balance.after?.total ?? "n/a"}，差额 ${costs.balance.deltaCny ?? "n/a"}（${costs.balance.note}）`);
  lines.push(`- 按本次花费估算，余额还能跑同样的运行：${costs.remainingRuns ?? "n/a"} 次`, "");
  lines.push("## 调用次数（真实与模拟分栏，不合计）", "", "| 类别 | 真实 | 模拟 | 回放 |", "|---|---|---|---|");
  for (const [name, tally] of Object.entries(costs.calls)) lines.push(`| ${name} | ${tally.real} | ${tally.simulated} | ${tally.replay} |`);
  lines.push("", `主模型用量（接口原样返回的合计）：输入 ${costs.usage.model.promptTokens}（缓存命中 ${costs.usage.model.cacheHitTokens}、未命中 ${costs.usage.model.cacheMissTokens}），输出 ${costs.usage.model.completionTokens}。`, "");
  const areas = new Map<string, { total: number; hard: number; final: number }>();
  for (const item of summary.cases) {
    const area = areas.get(item.area) ?? { final: 0, hard: 0, total: 0 };
    area.total += 1;
    if (item.hardPass) area.hard += 1;
    if (judged?.get(item.id)?.verdict === "pass") area.final += 1;
    areas.set(item.area, area);
  }
  lines.push("## 逐区", "", `| 区 | 用例 | 代码判定通过 |${judged ? " 最终通过 |" : ""}`, `|---|---|---|${judged ? "---|" : ""}`);
  for (const [area, value] of [...areas.entries()].sort()) lines.push(`| ${area} | ${value.total} | ${value.hard} |${judged ? ` ${value.final} |` : ""}`);
  lines.push("", "## 逐例", "", `| 用例 | 账号 | 代码判定 | 不变量判定 过/不过 | 其余判定 过/不过 | 真实模型调用 | 模拟模型调用 | 费用（元） |${judged ? " 最终 |" : ""}`, `|---|---|---|---|---|---|---|---|${judged ? "---|" : ""}`);
  for (const item of summary.cases) {
    lines.push(`| ${item.id} | ${item.account} | ${item.hardPass ? "过" : "不过"} | ${item.invariantChecks.pass}/${item.invariantChecks.fail} | ${item.otherChecks.pass}/${item.otherChecks.fail} | ${item.calls.realModel} | ${item.calls.simulatedModel} | ${item.costCny.toFixed(4)} |${judged ? ` ${judged.get(item.id)?.verdict ?? "未评"} |` : ""}`);
  }
  lines.push("", "## 含模拟的用例（真实与模拟分两栏）", "", "| 用例 | 真实模型调用 | 模拟模型调用 | 真实判断调用 | 模拟判断调用 |", "|---|---|---|---|---|");
  for (const item of summary.cases.filter((value) => summary.simulatedCases.includes(value.id))) lines.push(`| ${item.id} | ${item.calls.realModel} | ${item.calls.simulatedModel} | ${item.calls.realJudgment} | ${item.calls.simulatedJudgment} |`);
  const cannot = summary.cases.flatMap((item) => item.cannotJudge.filter((check) => !check.check.startsWith("step:")).map((check) => ({ ...check, id: item.id })));
  lines.push("", `## 无法判定（按不通过计，${cannot.length} 项）`, "", "| 用例 | 判定 | 原因 |", "|---|---|---|");
  for (const item of cannot) lines.push(`| ${item.id} | ${item.check} | ${cell(item.detail)} |`);
  const steps = summary.cases.flatMap((item) => item.unsupportedSteps.map((step) => ({ ...step, id: item.id })));
  lines.push("", `## 步骤不受支持（按不通过计，${steps.length} 项）`, "", "| 用例 | 步骤 | 词 | 原因 |", "|---|---|---|---|");
  for (const item of steps) lines.push(`| ${item.id} | ${item.step + 1} | ${item.word} | ${cell(item.reason)} |`);
  const failed = summary.cases.flatMap((item) => item.failed.map((check) => ({ ...check, id: item.id })));
  lines.push("", `## 代码判定不通过（${failed.length} 项）`, "", "| 用例 | 判定 | 说明 |", "|---|---|---|");
  for (const item of failed) lines.push(`| ${item.id} | ${item.check} | ${cell(item.detail).slice(0, 400)} |`);
  if (judged) {
    // README §3.3: judged here, not counted in this gate's result; listed per case so the report shows them.
    const deferred = [...judged.values()].flatMap((item) => (item.deferred ?? []).map((entry) => ({ ...entry, caseId: item.caseId })));
    lines.push("", `## 已评、从后续 sprint 起计入的评审项（${deferred.length} 项）`, "", "不计入本次门槛的结论；评审照常逐条评过。", "", "| 用例 | 评审项 | 从哪个 sprint 起计入 | 各次评审的结论 |", "|---|---|---|---|");
    for (const entry of deferred) lines.push(`| ${entry.caseId} | ${entry.id} | ${entry.gate} | ${entry.verdicts.join(", ") || "无有效评审"} |`);
    const review = [...judged.values()].filter((item) => item.verdict === "needs_review");
    lines.push("", `## 人工复核清单（${review.length}）`, "");
    for (const item of review) lines.push(`- ${item.caseId}：${item.reasons.join("；")}`);
  }
  return `${lines.join("\n")}\n`;
}
