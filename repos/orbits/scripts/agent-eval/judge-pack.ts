/**
 * npm run agent-eval:judge-pack -- --run <run id> [--only-hard-pass] [--cases AE-…,AE-…] [--judges 1|2]
 *
 * Writes cases/<id>/judge-packet.md for each case, and judging.md at the run root listing the
 * packets and how many independent judgments each needs (gate runs: 2; otherwise 1, README §5).
 * Calls no API. Judges are fresh Claude sessions that write cases/<id>/judge-<N>.json.
 */
import fs from "node:fs";
import path from "node:path";

import { evalPathsForRuns } from "../../tests/agent-eval/lib/eval-env";
import { readCaseYaml, renderJudgePacket } from "../../tests/agent-eval/lib/judging";
import { JUDGE_PROMPT } from "../../tests/agent-eval/lib/paths";
import type { TraceEvent } from "../../tests/agent-eval/lib/trace-log";

function flag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

function main(argv: readonly string[]): void {
  const runId = flag(argv, "--run");
  if (!runId) throw new Error("--run <run id> is required");
  const runDir = path.join(evalPathsForRuns().runs, runId);
  const summary = JSON.parse(fs.readFileSync(path.join(runDir, "summary.json"), "utf8"));
  const judgePrompt = fs.readFileSync(JUDGE_PROMPT, "utf8");
  const only = flag(argv, "--cases")?.split(",").map((id) => id.trim());
  const judges = Number(flag(argv, "--judges") ?? (summary.gate || /gate|AE-H-006/u.test(summary.label) ? 2 : 1));
  const packed: { id: string; hardPass: boolean; packet: string }[] = [];
  const skipped: string[] = [];
  for (const item of summary.cases as { id: string; hardPass: boolean }[]) {
    if (only && !only.includes(item.id)) continue;
    if (argv.includes("--only-hard-pass") && !item.hardPass) {
      skipped.push(item.id);
      continue;
    }
    const caseDir = path.join(runDir, "cases", item.id);
    const hard = JSON.parse(fs.readFileSync(path.join(caseDir, "hard-checks.json"), "utf8"));
    const events = fs.readFileSync(path.join(caseDir, "trace.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as TraceEvent);
    const packet = renderJudgePacket({
      caseDir,
      caseYaml: fs.readFileSync(path.join(caseDir, "case.yaml"), "utf8"),
      checks: hard.checks,
      events,
      hardPass: hard.hardPass,
      judgeCount: judges,
      judgePrompt,
      transcript: fs.readFileSync(path.join(caseDir, "transcript.md"), "utf8"),
    });
    const file = path.join(caseDir, "judge-packet.md");
    fs.writeFileSync(file, packet);
    void readCaseYaml;
    packed.push({ hardPass: item.hardPass, id: item.id, packet: file });
  }
  const index = [
    `# 评审清单 ${runId}`,
    "",
    `每例需要 ${judges} 份互不相见的评审；每位评审是新开的 Claude 会话，只读 judge-packet.md（必要时读 trace.jsonl），在同一目录写 judge-<N>.json。`,
    "两份不一致时，再开一个会话写 judge-3.json，并列入人工复核清单。写完后运行：npm run agent-eval:report -- --run " + runId,
    "",
    "| 用例 | 代码判定 | 评审材料 |",
    "|---|---|---|",
    ...packed.map((item) => `| ${item.id} | ${item.hardPass ? "过" : "不过"} | ${item.packet} |`),
    "",
    skipped.length ? `代码判定未通过、本次不出评审材料（--only-hard-pass）：${skipped.join("、")}` : "",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(runDir, "judging.md"), index);
  console.log(`agent-eval:judge-pack ${runId}: ${packed.length} packet(s), ${judges} judgment(s) each${skipped.length ? `; skipped ${skipped.length} with failing hard checks` : ""} → ${path.join(runDir, "judging.md")}`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
