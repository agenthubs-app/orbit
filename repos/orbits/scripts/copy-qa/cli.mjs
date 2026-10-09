// npm run copy:qa -- [--shared] [--web] [--app <domain,domain>] [--json]
// With no source flag it checks shared/copy, the Web redesign copy and the App
// domains named in APP_DOMAINS_IN_SCOPE. Exit 1 when any issue is found.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkCopy, RULES } from "./check.mjs";
import { loadAppDomains, loadSharedCopy, loadWebCopy } from "./sources.mjs";

// App dictionary domains the redesign skeleton owns (R03 D): navigation shell and
// kept infrastructure. Feature Sprints add their rewritten domains here.
export const APP_DOMAINS_IN_SCOPE = ["shell", "session"];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appRoot = path.resolve(root, "../orbit-app");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const appArg = args.includes("--app") ? args[args.indexOf("--app") + 1].split(",") : null;
const all = !flag("--shared") && !flag("--web") && !appArg;

const entries = [
  ...(all || flag("--shared") ? await loadSharedCopy(root) : []),
  ...(all || flag("--web") ? await loadWebCopy(root) : []),
  ...(all || appArg ? await loadAppDomains(appRoot, appArg ?? APP_DOMAINS_IN_SCOPE) : []),
];
const result = checkCopy(entries);
if (flag("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`copy-qa: ${result.entries} entries, ${result.total} issues`);
  for (const rule of RULES) console.log(`  ${rule.padEnd(18)} ${result.counts[rule]}`);
  for (const issue of result.issues) console.log(`- [${issue.rule}] ${issue.id}${issue.lang ? ` (${issue.lang})` : ""}: ${issue.message}${issue.text ? ` — 「${issue.text}」` : ""}`);
}
process.exitCode = result.total === 0 ? 0 : 1;
