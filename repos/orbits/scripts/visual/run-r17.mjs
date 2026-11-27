#!/usr/bin/env node
/**
 * R17 主催门禁全套跑法（2026-11-28）：每张图之前先把主催 mock 复位，再切到该图的 host 变体，然后单张比对。
 *
 *   node scripts/visual/run-r17.mjs --out <dir> [--origin http://localhost:3017] [--storage <qa storageState>] [--only id1,id2]
 *
 * 为什么逐张复位：
 * - 申込設定会自动保存、参加者 / 匹配 / 受付的操作会改内存里的 mock，前面的画面会把后面的画面带脏（HM-P6 / HM-P10 / HM-M5 曾因此失败）。
 * - `host: null` 会顺带把示例时钟（DESIGN_FIXTURE_NOW）还原成真实时间，跨日后匹配的「再生成」等按时间算的状态会变。
 *   所以没有 host 变体的图也先 `null` 再 `{}`：默认变体 + 固定示例时钟 + 清空内存操作。
 * 结束时复位为 `null`（同以前的约定）。退出码：全部 PASS 为 0。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const origin = arg("origin", "http://localhost:3017");
const storage = arg("storage", path.join(os.homedir(), "orbit-sprint-evidence/redesign/.auth/qa@orbit.test.json"));
const out = arg("out");
if (!out) { console.error("--out <dir> is required"); process.exit(2); }
const only = arg("only")?.split(",").filter(Boolean);
const suite = "scripts/visual/views/web-R17.json";
const views = JSON.parse(readFileSync(path.join(root, suite), "utf8")).views.filter((view) => !only || only.includes(view.id));

const node = (args, opts = {}) => spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", ...opts });
function host(value) {
  const r = node(["features/events/design-fixtures/switch.mjs", "--origin", origin, "--storage", storage, "--host", value]);
  if (r.status !== 0) { console.error(`switch --host ${value} failed: ${r.stdout}${r.stderr}`); process.exit(2); }
}

mkdirSync(out, { recursive: true });
const log = path.join(out, "run-r17.log");
writeFileSync(log, "");
const results = [];
/** 一张图：复位 → 切变体 → 比对。页面没加载出来（ERR，没有 PASS/FAIL 结论）时整张重来一次；真正的 FAIL 不重跑。 */
function runView(view) {
  host("null");
  host(view.host ? JSON.stringify(view.host) : "{}");
  const r = node(["scripts/visual/compare-redesign.mjs", "--suite", suite, "--only", view.id, "--out", out, "--workers", "1"]);
  appendFileSync(log, `${r.stdout}${r.stderr}`);
  return `${r.stdout}`.split("\n").filter((line) => / (PASS|FAIL) raw=/.test(line));
}
for (const view of views) {
  let lines = runView(view);
  if (!lines.length) { appendFileSync(log, `\n[run-r17] ${view.id}: no result, retrying once\n`); lines = runView(view); }
  for (const line of lines) { console.log(line); results.push(line); }
  if (!lines.length) { const line = `${view.id} ERROR (no result; see ${log})`; console.log(line); results.push(line); }
}
host("null");
const failed = results.filter((line) => !/ PASS raw=/.test(line));
console.log(`\n${results.length - failed.length}/${results.length} PASS${failed.length ? `\nnot passing:\n${failed.join("\n")}` : ""}`);
process.exit(failed.length ? 1 : 0);
