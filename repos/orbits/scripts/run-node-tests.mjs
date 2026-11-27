import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocalTestDatabases } from "./assert-local-test-databases.mjs";

try {
  assertLocalTestDatabases();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

/**
 * 测试入口（2026-11-27 瘦身提速）。
 *
 *   node scripts/run-node-tests.mjs                 全量（= npm test）：下面两组同时跑
 *   node scripts/run-node-tests.mjs --fast          fast 档（= npm run test:fast）：共享进程组 + services + capabilities
 *   node scripts/run-node-tests.mjs --audit         审计档（= npm run test:audit）：审计 / 手机布局扫描 / 整项目类型检查
 *   node scripts/run-node-tests.mjs <file|glob>...  只跑指定的（逐文件隔离，同以前）
 *
 * 共享进程组（--test-isolation=none）：每个目录在一个进程里跑完（各目录各一个进程，最多 3 个同时），省掉每个文件各起一个进程、各编译一遍的开销
 * （agent-v1 从累计 2045 秒降到 14 秒）。2026-11-27 逐目录核对过：共享与隔离两种跑法的通过 / 失败 / 跳过名单逐项一致
 * （按去重后的用例名；隔离跑时被别的测试文件 import 进来的用例会重复执行一次）。
 * api / capabilities / pages / services / ui 在共享进程下会互相污染或挂住，保持逐文件隔离；新目录默认也走隔离。
 * 要把一个目录加进 SHARED_DIRS，先用两种跑法各跑一次、对照名单一致再加。
 */
const SHARED_DIRS = [
  "agent-eval", "agent-v1", "api-schema", "architecture", "config", "contracts", "copy-qa", "dev", "domain", "e2e", "events",
  "experience", "fixtures", "host", "integration", "mock", "observability", "operations", "performance", "plans", "scheduling",
  "scripts", "search", "storage",
];
/** 不进默认全量：慢（合计约 15 分钟）且只在改到相关范围时需要；部署前检查按改动范围决定是否跑（scripts/test-changed.mjs）。 */
const AUDIT_FILES = [
  /^tests\/audits\//,
  /^tests\/ui\/phone-layout-sweep\.test\.tsx$/,
  /^tests\/ui\/orbit-typecheck-ratchet\.test\.ts$/,
];
const FAST_ISOLATED_DIRS = ["services", "capabilities"];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paidAiBoundary = path.join(root, "scripts/test-paid-ai-boundary.mjs");
const cssStub = path.join(root, "scripts/test-css-stub.mjs");
const ledgerDir = mkdtempSync(path.join(os.tmpdir(), "orbits-paid-ai-"));
const ledger = path.join(ledgerDir, "blocked.txt");

const args = process.argv.slice(2);
const mode = args.includes("--fast") ? "fast" : args.includes("--audit") ? "audit" : "full";
const targets = args.filter((arg) => !arg.startsWith("--"));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.test\.tsx?$/.test(name)) out.push(path.relative(root, full));
  }
  return out;
}

function groups() {
  if (targets.length) return [{ name: "selected", shared: false, files: targets }];
  const all = walk(path.join(root, "tests")).sort();
  const isAudit = (file) => AUDIT_FILES.some((re) => re.test(file));
  if (mode === "audit") return [{ name: "audit", shared: false, files: all.filter(isAudit) }];
  const dirOf = (file) => (file.split("/").length > 2 ? file.split("/")[1] : "");
  const shared = all.filter((file) => SHARED_DIRS.includes(dirOf(file)));
  const isolated = all.filter((file) => !isAudit(file) && !SHARED_DIRS.includes(dirOf(file)) && (mode === "full" || FAST_ISOLATED_DIRS.includes(dirOf(file))));
  // 每个共享目录各一个进程（与核对时的跑法一致；24 个目录合进一个进程会互相污染、而且更慢）。
  const sharedGroups = SHARED_DIRS.map((dir) => ({ name: dir, shared: true, files: shared.filter((file) => dirOf(file) === dir) }));
  return [{ name: "isolated", shared: false, files: isolated }, ...sharedGroups];
}

function run(group) {
  return new Promise((resolve) => {
    const argv = ["--test", ...(group.shared ? ["--test-isolation=none"] : []), "--import", "tsx", "--import", paidAiBoundary, "--import", cssStub, ...group.files];
    const started = Date.now();
    const child = spawn(process.execPath, argv, {
      cwd: root,
      // ORBIT_LEGACY_TEST_LANGUAGE: the pre-R03 Chinese default the old page tests assume
      // (app/(app)/app/orbit-language-core.ts). New tests that check Japanese clear it.
      // NODE_OPTIONS: Node 26 prints DEP0205 for tsx's `module.register()` in every child
      // process the tests spawn; tests that assert a clean stderr would fail on that
      // runtime notice alone (R09 baseline). Only that one warning is silenced.
      env: {
        ...process.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, "--disable-warning=DEP0205"].filter(Boolean).join(" "),
        ORBIT_TEST_PAID_AI_LEDGER: ledger,
        ORBIT_LEGACY_TEST_LANGUAGE: "zh",
      },
      // 只有一组时直接输出；两组同时跑时各自收集，跑完按组整段打印，免得交错。
      stdio: single ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += chunk; });
    child.stderr?.on("data", (chunk) => { output += chunk; });
    child.on("error", (error) => resolve({ group, status: 1, output: `${output}\n${error.message}`, ms: Date.now() - started }));
    child.on("close", (status) => resolve({ group, status: status ?? 1, output, ms: Date.now() - started }));
  });
}

const plan = groups().filter((group) => group.files.length);
const single = plan.length === 1;
/** 隔离组自己按 CPU 数并发；共享目录同时最多跑 SHARED_PARALLEL 个，跟隔离组一起跑。 */
const SHARED_PARALLEL = 3;
async function runAll() {
  const [first, ...rest] = plan;
  const queue = [...rest];
  const sharedResults = [];
  const lane = async () => { while (queue.length) sharedResults.push(await run(queue.shift())); };
  const [isolated] = await Promise.all([run(first), ...Array.from({ length: SHARED_PARALLEL }, lane)]);
  return [isolated, ...sharedResults];
}
const results = single ? [await run(plan[0])] : await runAll();
if (!single) {
  const count = (output, key) => Number((output.match(new RegExp(`ℹ ${key} (\\d+)`)) ?? [])[1] ?? 0);
  // 通过的组只打一行；失败的组整段打印。
  for (const result of results) {
    if (result.status === 0) continue;
    console.log(`\n━━ ${result.group.name}（${result.group.files.length} files${result.group.shared ? ", one process" : ""}）━━`);
    process.stdout.write(result.output);
  }
  console.log("");
  for (const result of results) console.log(`[${result.group.name}] ${result.status === 0 ? "ok" : "FAILED"} · ${count(result.output, "tests")} tests · ${count(result.output, "fail")} fail · ${Math.round(result.ms / 1000)}s`);
  console.log(`total tests ${results.reduce((sum, r) => sum + count(r.output, "tests"), 0)} · fail ${results.reduce((sum, r) => sum + count(r.output, "fail"), 0)}`);
}

let blocked = [];
try {
  blocked = readFileSync(ledger, "utf8").split("\n").filter(Boolean);
} catch {
  // no attempt recorded
}
rmSync(ledgerDir, { force: true, recursive: true });

if (blocked.length > 0) {
  const counts = new Map();
  for (const line of blocked) counts.set(line, (counts.get(line) ?? 0) + 1);
  console.error(`\n${blocked.length} paid AI request(s) refused by the test boundary; tests must stub the provider (see scripts/test-paid-ai-boundary.mjs):`);
  for (const [line, count] of counts) console.error(`  ${count}x ${line}`);
  process.exit(1);
}

process.exit(results.every((result) => result.status === 0) ? 0 : 1);
