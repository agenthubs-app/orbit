/**
 * W0055（W55-1）源码门禁：网页端不再使用关键词版人脉需求匹配。
 *
 * `/api/contacts/needs-matches` 与 `features/contact-needs` 原样保留给手机 App（`ContactNeedsMatchesScreen`）；
 * 通知发现（服务端后台）仍复用 `criteriaForNeed`。除这些允许的位置外：
 *   - 任何文件都不得 import `features/contact-needs`；
 *   - `app/` 下除接口本身外，任何字符串字面量都不得出现 `needs-matches`（注释不算：用 TypeScript 语法树只看真实代码）。
 * Web 的人脉需求匹配已改用计划匹配器（RN-08）。
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import ts from "typescript";

const root = process.cwd();
const ROUTE_DIR = path.join("app", "api", "contacts", "needs-matches");
const MODULE_DIR = path.join("features", "contact-needs");
/** 允许 import contact-needs 的服务端位置（与 PLANNER 事实 1 一致）。 */
const IMPORT_ALLOWLIST = new Set([path.join("features", "notifications", "discovery", "qualification-policy.ts")]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(root, dir))) {
    const relative = path.join(dir, entry);
    const stat = statSync(path.join(root, relative));
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      out.push(...sourceFiles(relative));
    } else if (/\.(ts|tsx|mts|cts|js|jsx|mjs)$/.test(entry)) {
      out.push(relative);
    }
  }
  return out;
}

function within(file: string, dir: string): boolean {
  return file === dir || file.startsWith(`${dir}${path.sep}`);
}

/** 真实代码里的 import／export from／动态 import 目标与字符串字面量（不含注释）。 */
function codeFacts(file: string): { modules: string[]; strings: string[] } {
  const text = readFileSync(path.join(root, file), "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const modules: string[] = [];
  const strings: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      modules.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      modules.push(node.arguments[0].text);
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) strings.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { modules, strings };
}

test("no web code outside the retained route imports features/contact-needs", () => {
  const offenders: string[] = [];
  for (const dir of ["app", "features", "shared", "scripts"]) {
    for (const file of sourceFiles(dir)) {
      if (within(file, ROUTE_DIR) || within(file, MODULE_DIR) || IMPORT_ALLOWLIST.has(file)) continue;
      const { modules } = codeFacts(file);
      // 相对路径按所在目录解析：只拦真正落进 features/contact-needs 的 import（shared 里同名的契约类型文件不算）。
      const hits = modules.filter((specifier) => specifier.startsWith(".")
        ? within(path.normalize(path.join(path.dirname(file), specifier)), MODULE_DIR)
        : /(^|\/)features\/contact-needs(\/|$)/.test(specifier));
      if (hits.length) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test("no web page or client code requests /api/contacts/needs-matches", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles("app")) {
    if (within(file, ROUTE_DIR)) continue;
    if (codeFacts(file).strings.some((value) => value.includes("needs-matches"))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("the route and module stay in place for the App, marked web-retired", () => {
  const handler = readFileSync(path.join(root, ROUTE_DIR, "handler.ts"), "utf8");
  const design = readFileSync(path.join(root, MODULE_DIR, "DESIGN.md"), "utf8");
  assert.match(handler, /export function createContactNeedsGetHandler/);
  assert.match(handler, /仅供 App/);
  assert.match(design, /仅供 App/);
  assert.match(readFileSync(path.join(root, ROUTE_DIR, "route.ts"), "utf8"), /GET/);
});
