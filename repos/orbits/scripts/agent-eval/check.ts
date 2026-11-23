/**
 * npm run agent-eval:check — validate the visible cases and fixtures (eval/README.md §3, §7).
 * The sealed set is skipped unless --sealed is given (AG00 never passes it).
 */
import { loadAreaFiles } from "../../tests/agent-eval/lib/cases";
import { checkAreaFiles, createCheckerContext, formatIssue } from "../../tests/agent-eval/lib/case-checker";
import { generateBulkWorld, verifyWorldFacts } from "../../tests/agent-eval/lib/bulk-generator";
import { loadWorld } from "../../tests/agent-eval/lib/world";

function main(): void {
  const sealed = process.argv.includes("--sealed");
  const areaFiles = loadAreaFiles({ sealed });
  const context = createCheckerContext();
  const issues = checkAreaFiles(areaFiles, context);
  const caseCount = areaFiles.reduce((sum, file) => sum + file.cases.length, 0);
  const factIssues: string[] = [];
  if (!process.argv.includes("--skip-world")) {
    for (const name of ["regular-v1", "large-v1"]) {
      const world = loadWorld(name);
      const generated = generateBulkWorld(world);
      for (const problem of verifyWorldFacts(world, generated)) factIssues.push(`${name}: ${problem}`);
    }
  }
  for (const issue of issues) console.log(`FAIL ${formatIssue(issue)}`);
  for (const issue of factIssues) console.log(`FAIL world ${issue}`);
  console.log(
    `agent-eval:check — ${areaFiles.length} area files, ${caseCount} cases${sealed ? " (sealed included)" : " (sealed skipped)"}, ` +
      `${issues.length} case issues, ${factIssues.length} world issues.`,
  );
  if (issues.length || factIssues.length) process.exitCode = 1;
}

main();
