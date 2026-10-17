#!/usr/bin/env node
/**
 * R31b：一台本机 mock 服务器跑全部 Web 门禁清单（pass-baseline-web.json 的「不退步」与重比清单）。
 * 不改 scripts/visual/**（冻结）；只是按每个清单的约定先切 fixture / 变体 / 造状态，再调 compare-redesign.mjs --suite --only。
 *
 * 服务器（一台带齐所有 mock，见 REPORT「环境」）：
 *   ORBIT_NEXT_DIST_DIR=.next-line-a2 ORBIT_REDESIGN_MOCK=add-scan,add-import,invite-codes,plan-v2-summary,host-operations,event-assessment,event-recommendation-feedback,global-search npx next dev --webpack -p 3600
 * 用法（在 repos/orbits 下）：
 *   node ../../docs/designs/redesign-2026-10/sprints/R31b-web-components-pixel/run-web-gates.mjs \
 *     --origin http://localhost:3600 --design-base http://localhost:3601/redesign-2026-10/ --storage <qa-storage.json> --out <dir> \
 *     [--suites web-R07,web-R17] [--keys <pass-baseline-web.json|逗号分隔 key>] [--workers 2]
 * 结果：<out>/<suite>/<n>/summary.json，合并到 <out>/all-summary.json（key → pass / raw / 超阈 / 未归因）。
 * plan-C 走 scripts/visual/plan-rework/c-all.sh（造状态有先后），python3 用 PATH 前面的 uv 包装（--pybin）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
const origin = args.origin ?? "http://localhost:3600";
const designBase = args["design-base"] ?? "http://localhost:3601/redesign-2026-10/";
const storage = resolve(args.storage);
const out = resolve(args.out);
const workers = args.workers ?? "2";
const root = process.cwd();
if (!existsSync(join(root, "scripts/visual/compare-redesign.mjs"))) { console.error("run from repos/orbits"); process.exit(2); }
const allSuites = ["web-R07", "web-add-R12", "web-invite-R15", "web-import-R16", "web-plan-A", "web-plan-B", "web-plan-C", "web-R17", "web-R26", "web-R27", "web-R30"];
const suites = args.suites ? args.suites.split(",") : allSuites;

// 只跑这些 key（<id>-<width>-<theme>）；不给就全跑。
let keyFilter = null;
if (args.keys) {
  keyFilter = new Set(args.keys.endsWith(".json") ? Object.keys(JSON.parse(readFileSync(args.keys, "utf8")).pass ?? {}) : args.keys.split(","));
}

const load = (suite) => JSON.parse(readFileSync(join(root, "scripts/visual/views", `${suite}.json`), "utf8"));
const keysOf = (suiteJson, view) => (view.themes ?? suiteJson.defaults?.themes ?? ["light", "dark"]).map((theme) => `${view.id}-${view.width}-${theme}`);

const sw = (kind, value) => {
  const script = kind === "plan" ? "features/plans/v2/design-fixtures/switch.mjs" : "features/events/design-fixtures/switch.mjs";
  const flag = kind === "plan" || kind === "name" ? "--name" : `--${kind}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = spawnSync("node", [script, "--origin", origin, "--storage", storage, flag, value], { cwd: root, encoding: "utf8" });
    if (r.status === 0) return true;
  }
  console.error(`switch ${kind} ${value} FAILED`);
  return false;
};

// 每张画面的前置：返回 [分组键, 执行函数]。
function prestep(suite, view) {
  const note = view.note ?? "";
  if (suite === "web-plan-A") { const f = view.fixture ?? "null"; return [`plan:${f}`, () => sw("plan", f)]; }
  if (suite === "web-plan-B") { const f = view.fixture ?? note.match(/fixture ([\w-]+)/)?.[1] ?? "b10-flow"; return [`plan:${f}`, () => sw("plan", f)]; }
  if (suite === "web-R17") { const h = JSON.stringify(view.host ?? null); return [`host:${h}`, () => sw("host", h)]; }
  if (suite === "web-R26") { const f = note.match(/fixture ([\w-]+)/)?.[1] ?? "null"; return [`name:${f}`, () => sw("name", f)]; }
  if (suite === "web-R27") { const j = JSON.stringify(view.journey ?? null); return [`journey:${j}`, () => sw("journey", j)]; }
  return ["-", () => true];
}

function runCompare(suite, only, dir) {
  mkdirSync(dir, { recursive: true });
  spawnSync("node", ["scripts/visual/compare-redesign.mjs", "--suite", `scripts/visual/views/${suite}.json`, "--only", only.join(","), "--app-origin", origin,
    "--design-base", designBase, "--storage", storage, "--out", dir, "--workers", workers], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
}

let group = 0;
// 登录一次（门禁自己会登录并写 storage）。
if (!existsSync(storage)) runCompare("web-R07", ["W-R07-01L-1440-light"], join(out, "_login"));
for (const suite of suites) {
  const json = load(suite);
  if (suite === "web-plan-C") {
    const wanted = json.views.filter((v) => !keyFilter || keysOf(json, v).some((k) => keyFilter.has(k)));
    if (!wanted.length) continue;
    const steps = { "W-R25-01": "modal", "W-R25-07": "modal", "W-R25-01M": "mm", "W-R25-07M": "mm", "W-R25-09M": "mgoals", "W-R25-10M": "medit", "W-R25-02M": "mused", "W-R25-10": "edit", "W-R25-02": "used", "W-R25-12": "legacy", "W-R25-13": "legacy", "W-R25-03": "r03", "W-R25-05": "r05", "W-R25-06a": "r06", "W-R25-08": "done", "W-R25-09": "goals" };
    // 同 scripts/visual/plan-rework/c-all.sh 的步骤（它不传 --design-base，所以这里照抄步骤、自己调 compare）。
    const env = { ...process.env, PLAN_ORIGIN: origin, PLAN_STORAGE: storage, PATH: `${args.pybin ?? ""}:${process.env.PATH}` };
    const setup = (state) => spawnSync("python3", ["scripts/visual/plan-rework/setup.py", state], { cwd: root, env, stdio: "ignore" }).status === 0;
    const cookie = () => (JSON.parse(readFileSync(storage, "utf8")).cookies ?? []).filter((c) => ["localhost", "127.0.0.1"].includes(c.domain.replace(/^\./, ""))).map((c) => `${c.name}=${c.value}`).join("; ");
    const warm = (path) => spawnSync("curl", ["-s", "-o", "/dev/null", "--max-time", "240", "-H", `cookie: ${cookie()}`, `${origin}${path}`]);
    const plan = (name) => sw("plan", name);
    const recipes = {
      modal: [() => plan("c-review") && setup("one"), ["W-R25-01"], () => plan("b12-270-achieve"), ["W-R25-07"]],
      mm: [() => plan("null"), ["W-R25-01M"], () => plan("b12-270-achieve"), ["W-R25-07M"]],
      mgoals: [() => plan("c-goals"), ["W-R25-09M"]],
      medit: [() => plan("c-edit"), ["W-R25-10M"]],
      mused: [() => plan("c-review") && setup("used"), ["W-R25-02M"]],
      edit: [() => plan("c-edit"), ["W-R25-10"]],
      used: [() => plan("c-review") && setup("used"), ["W-R25-02"]],
      legacy: [() => { const ok = plan("c-legacy"); warm("/app/plans/legacy/design-legacy-series-a"); return ok; }, ["W-R25-12", "W-R25-13"]],
      r03: [() => plan("c-review") && setup("03"), ["W-R25-03"]],
      r05: [() => plan("c-review") && setup("05"), ["W-R25-05"]],
      r06: [() => plan("c-review") && setup("06a"), ["W-R25-06a"]],
      done: [() => { const ok = plan("c-done"); warm("/app/plans/demo-plan-series-a/done"); return ok; }, ["W-R25-08"]],
      goals: [() => plan("c-goals"), ["W-R25-09"]],
    };
    warm("/app/tasks?tab=plan");
    const wantedKeys = new Set(wanted.flatMap((v) => keysOf(json, v).filter((k) => !keyFilter || keyFilter.has(k))));
    const byId = Object.fromEntries(json.views.map((v) => [v.id, v]));
    for (const step of [...new Set(wanted.map((v) => steps[v.id]).filter(Boolean))]) {
      const recipe = recipes[step];
      for (let i = 0; i < recipe.length; i += 2) {
        group++;
        const keys = recipe[i + 1].flatMap((id) => (byId[id] ? keysOf(json, byId[id]) : [])).filter((k) => wantedKeys.has(k));
        if (!recipe[i]()) { console.error(`[${suite}] ${step} 造状态失败`); continue; }
        if (keys.length) { console.error(`[${suite}] ${step} → ${keys.length} 张`); runCompare(suite, keys, join(out, suite, String(group))); }
      }
    }
    plan("null");
    continue;
  }
  if (suite === "web-plan-B") {
    spawnSync("node", ["features/plans/v2/design-fixtures/seed-local-chats.mjs", "--origin", origin, "--storage", storage], { cwd: root, stdio: "ignore" });
  }
  const groups = new Map();
  for (const view of json.views) {
    const keys = keysOf(json, view).filter((k) => !keyFilter || keyFilter.has(k));
    if (!keys.length) continue;
    const [gk, fn] = prestep(suite, view);
    if (!groups.has(gk)) groups.set(gk, { fn, keys: [] });
    groups.get(gk).keys.push(...keys);
  }
  for (const [gk, g] of groups) {
    group++;
    console.error(`[${suite}] ${gk} → ${g.keys.length} 张`);
    if (!g.fn()) continue;
    runCompare(suite, g.keys, join(out, suite, String(group)));
  }
  // 切回默认，免得影响下一组。
  if (suite === "web-R17") sw("host", "null");
  if (suite === "web-R26") sw("name", "null");
  if (suite === "web-R27") sw("journey", "null");
  if (suite.startsWith("web-plan")) sw("plan", "null");
}

// 合并。
const merged = {};
const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, entry.name); if (entry.isDirectory()) walk(p); else if (entry.name === "summary.json") for (const r of JSON.parse(readFileSync(p, "utf8"))) merged[r.view] = { pass: r.pass, raw: r.raw, over: r.overBands, unattributed: r.unattributed, missing: (r.missing ?? []).length, error: r.error, out: r.out, suite: p.slice(out.length + 1).split("/")[0] }; } };
if (existsSync(out)) walk(out);
writeFileSync(join(out, "all-summary.json"), JSON.stringify(merged, null, 1));
const values = Object.values(merged);
console.log(`合计 ${values.length} 张：通过 ${values.filter((v) => v.pass).length}、不通过 ${values.filter((v) => !v.pass).length} → ${join(out, "all-summary.json")}`);
