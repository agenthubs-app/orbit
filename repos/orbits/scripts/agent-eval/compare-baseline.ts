/**
 * agent-design AG18-5: npm run agent-eval:compare -- --run <run id or folder> --baseline <run id or folder> [--out <file without extension>]
 *
 * A run id is looked for in this line's runs folder (ORBIT_AGENT_EVAL_HOME, .env.agent-eval), then in the shared
 * ~/orbit-sprint-evidence/agent-eval/runs (where the AG00 baseline is), then in every line's runs folder. Writes
 * `compare-<baseline>.md` and `.json` into the run's folder unless --out says otherwise. Reads files only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compareRuns, comparisonMarkdown, readRunMetrics } from "../../tests/agent-eval/lib/compare-baseline";
import { evalPathsForRuns } from "../../tests/agent-eval/lib/eval-env";

function flag(argv: readonly string[], name: string): string | null {
  const at = argv.indexOf(name);
  if (at >= 0) return argv[at + 1] ?? null;
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : null;
}

export function findRunDir(idOrPath: string): string {
  if (fs.existsSync(path.join(idOrPath, "cases"))) return path.resolve(idOrPath);
  const evidence = path.join(os.homedir(), "orbit-sprint-evidence");
  const roots = [path.join(evalPathsForRuns().home, "runs"), path.join(evidence, "agent-eval", "runs")];
  const lines = path.join(evidence, "agent-eval-lines");
  if (fs.existsSync(lines)) for (const line of fs.readdirSync(lines)) roots.push(path.join(lines, line, "runs"));
  for (const root of roots) {
    const candidate = path.join(root, idOrPath);
    if (fs.existsSync(path.join(candidate, "cases"))) return candidate;
  }
  throw new Error(`No run ${idOrPath} in ${roots.join(", ")}`);
}

export function main(argv: readonly string[]): void {
  const runId = flag(argv, "--run");
  const baselineId = flag(argv, "--baseline");
  if (!runId || !baselineId) throw new Error("usage: agent-eval:compare -- --run <id> --baseline <id> [--out <file>]");
  const runDir = findRunDir(runId);
  const baselineDir = findRunDir(baselineId);
  const comparison = compareRuns(readRunMetrics(runDir), readRunMetrics(baselineDir));
  const markdown = comparisonMarkdown(comparison);
  const out = flag(argv, "--out") ?? path.join(runDir, `compare-${path.basename(baselineDir)}`);
  fs.writeFileSync(`${out}.md`, `${markdown}\n`);
  fs.writeFileSync(`${out}.json`, `${JSON.stringify({ ...comparison, baselineDir, runDir }, null, 2)}\n`);
  console.log(markdown);
  console.log(`\nwritten: ${out}.md, ${out}.json`);
}

if (process.argv[1]?.endsWith("compare-baseline.ts")) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
