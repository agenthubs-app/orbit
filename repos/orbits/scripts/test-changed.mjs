#!/usr/bin/env node
/**
 * 部署前检查：只跑这次改动波及的测试 + 固定冒烟组（2026-11-27，全量太慢）。
 *
 *   node scripts/test-changed.mjs                 # 与 origin/chat-agent 比
 *   node scripts/test-changed.mjs <base-ref>      # 与指定提交比（如线上部署的提交）
 *   node scripts/test-changed.mjs --list [base]   # 只列出要跑的文件
 *   --dirty                                        # 连同工作区未提交的改动
 *   --no-typecheck                                 # 跳过开头的 tsconfig.build 类型检查
 *
 * 选法：改动的测试文件本身；引用了改动源文件（按路径去扩展名、去 index 匹配 import / readFileSync 字符串）的测试；
 * 再加 SMOKE（鉴权、注册登录、报名审核、可见性、写入幂等、计费账本、通知——这些每次部署都跑）。
 * 改了 package.json / tsconfig / scripts/run-node-tests.mjs / 测试桩等基础设施时退回全量。
 * 选出的文件交给 scripts/run-node-tests.mjs（同样的付费 AI 边界与 CSS 桩）。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const base = args.find((arg) => !arg.startsWith("--")) ?? "origin/chat-agent";

/** 每次部署都跑：行为底线（不随改动范围裁剪）。 */
export const SMOKE = [
  // 鉴权与会话、注册/登录/重置密码
  "tests/capabilities/auth-concurrent-registration.test.ts",
  "tests/capabilities/auth-rate-limit.test.ts",
  "tests/capabilities/auth-user-service.test.ts",
  "tests/capabilities/password-reset.test.ts",
  "tests/capabilities/password-change.test.ts",
  "tests/capabilities/session-revocation-read.test.ts",
  "tests/pages/session-revocation-auth-integration.test.ts",
  "tests/api/register-and-verification-routes.test.ts",
  // 报名与审核、可见性与隐私
  "tests/services/event-registration-eligibility.test.ts",
  "tests/api/event-operations-registered-access.test.ts",
  "tests/services/active-registration.test.ts",
  "tests/services/external-assessment-privacy.test.ts",
  "tests/services/notification-discovery-privacy.test.ts",
  // 写入幂等、同步、AI 账本
  "tests/services/appointment-client-idempotency.test.ts",
  "tests/services/sync-write-gate-postgres.test.ts",
  "tests/services/sync-owner-guard-postgres.test.ts",
  "tests/services/agent-ledger-decision.test.ts",
  "tests/services/event-ai-ledgered-runner-quota.test.ts",
  // 对外通知、样式 token
  "tests/host/host-notices-postgres.test.ts",
  "tests/services/migrated-user-notice.test.ts",
  "tests/ui/orbit-2026-css-tokens.test.ts",
];

/** 改到这些就跑全量。 */
const INFRA = [/^package(-lock)?\.json$/, /^tsconfig[^/]*\.json$/, /^scripts\/(run-node-tests|test-css-stub|test-paid-ai-boundary|assert-local-test-databases)\.mjs$/, /^next\.config\./];

function git(...argv) {
  return execFileSync("git", argv, { cwd: root, encoding: "utf8" }).trim();
}

function changedFiles() {
  const prefix = git("rev-parse", "--show-prefix");
  const lines = git("diff", "--name-only", `${base}...HEAD`, "--", ".").split("\n").filter(Boolean);
  // 部署从干净副本取，默认只看已提交的差异；--dirty 时连同工作区未提交的改动。
  const dirty = args.includes("--dirty") ? git("diff", "--name-only", "HEAD", "--", ".").split("\n").filter(Boolean) : [];
  return [...new Set([...lines, ...dirty])].map((file) => (prefix && file.startsWith(prefix) ? file.slice(prefix.length) : file));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.test\.tsx?$/.test(name)) out.push(path.relative(root, full));
  }
  return out;
}

function expandGlob(pattern) {
  const [dir, file] = [path.dirname(pattern), path.basename(pattern)];
  const re = new RegExp(`^${file.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  const abs = path.join(root, dir);
  return existsSync(abs) ? readdirSync(abs).filter((name) => re.test(name)).map((name) => path.join(dir, name)) : [];
}

function stem(file) {
  return file.replace(/\.(tsx?|mjs|js|css)$/, "").replace(/\/index$/, "");
}

const changed = changedFiles();
const tests = walk(path.join(root, "tests"));
let selected;
let reason;
if (changed.some((file) => INFRA.some((re) => re.test(file)))) {
  selected = null;
  reason = "infrastructure changed → full run";
} else {
  const set = new Set();
  const sources = changed.filter((file) => !file.startsWith("tests/") && /\.(tsx?|mjs|css)$/.test(file)).map(stem);
  for (const file of changed) if (file.startsWith("tests/") && /\.test\.tsx?$/.test(file) && existsSync(path.join(root, file))) set.add(file);
  if (sources.length) {
    for (const test of tests) {
      const text = readFileSync(path.join(root, test), "utf8");
      if (sources.some((src) => text.includes(`${src}"`) || text.includes(`${src}.ts`) || text.includes(`${src}.tsx`) || text.includes(`${src}.css`) || text.includes(`${src}'`))) set.add(test);
    }
  }
  for (const pattern of SMOKE) for (const file of expandGlob(pattern)) set.add(file);
  // 审计档里只有手机布局扫描与日常改动相关：改到用户可见页面（orbit-2026 / 全局样式）时带上它（约 6 分钟）。
  if (changed.some((file) => /^app\/\(app\)\/app\/orbit-2026\//.test(file) || /^app\/globals\.css$/.test(file))) set.add("tests/ui/phone-layout-sweep.test.tsx");
  selected = [...set].sort();
  reason = `${changed.length} changed file(s) since ${base} → ${selected.length} test file(s) (incl. smoke)`;
}

console.log(`[test-changed] ${reason}`);
if (listOnly) {
  for (const file of selected ?? ["(all)"]) console.log(file);
  process.exit(0);
}
// 先做生产构建同款类型检查（部署时 next build 也会做；这里提前、更快地报出来）。--no-typecheck 跳过。
if (!args.includes("--no-typecheck")) {
  console.log("[test-changed] tsc --noEmit -p tsconfig.build.json");
  const tsc = spawnSync(process.execPath, ["--max-old-space-size=8192", path.join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--incremental", "false", "-p", "tsconfig.build.json"], { cwd: root, stdio: "inherit" });
  if (tsc.status !== 0) process.exit(tsc.status ?? 1);
}
const run = spawnSync(process.execPath, [path.join(root, "scripts/run-node-tests.mjs"), ...(selected ?? [])], { cwd: root, stdio: "inherit" });
process.exit(run.status ?? 1);
