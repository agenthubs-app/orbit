import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import ts from "typescript";

import { en } from "../../shared/copy/en";
import { ja } from "../../shared/copy/ja";
import { zh } from "../../shared/copy/zh";

/**
 * agent-design AG07 repair 2 (AG07-5): no code-written reply, card string or refusal shows an internal word —
 * 操作/操作键, 载荷, 版本 or "第 N 版", 证据, 来源, an error code or a hash — in zh, ja or en.
 *
 * Every sentence-like string literal in the modules that write user-visible text is scanned (template literals
 * with their `${}` parts blanked), plus the `aiCard` copy group. Modules whose text only goes to the model
 * (prompts, schemas, materials, context) are left out by name below; a new user-copy module is scanned without
 * being listed.
 */
const ROOT = join(__dirname, "../..");
const SCANNED_DIRS = ["features/agent-v1", "features/agent/runtime"];
const SCANNED_FILES = ["features/agent/ledger/card-routes.ts", "shared/compute/agent-card-view.ts"];
/** Text only the model reads (instructions, read material, schemas, traces), never shown to the user as such. */
const MODEL_ONLY = [
  /\/prompt\.ts$/u, /\/schema\.ts$/u, /answer\/materials\.ts$/u, /\/context\//u, /\/understand\//u, /\/models\//u,
  /\/observability\//u, /\/views\//u, /graph\/nodes\/understand\.ts$/u, /graph\/checkpointer\.ts$/u,
  // AG08: the judgment questions' wording goes to the judgment model only.
  /judgment\/questions\.ts$/u,
  // AG17: JSON-RPC protocol errors of the MCP endpoint ("Unsupported protocol version" is the MCP spec's own wording);
  // an external client's software reads them, an Orbit user never does. The rest of mcp/ stays scanned.
  /mcp\/transport\.ts$/u,
  // AG18: the operator's reports (backfill counts, reconcile list, shadow report) are read by whoever runs the rollout
  // runbook, never by an Orbit user. The rollout words a user reads (legacy-client, legacy-words, rollback) stay scanned.
  /rollout\/(backfill|reconcile|shadow-report)\.ts$/u,
  // The record finder: the lab's word lists (matching data, never shown) and the picker / reformulate prompts (models only).
  /finder\/impl\//u, /finder\/prompts\.ts$/u,
];

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: "操作", pattern: /操作|\boperation keys?\b/iu },
  { name: "载荷", pattern: /载荷|ペイロード|\bpayload\b/iu },
  { name: "版本", pattern: /版本|バージョン|\bversions?\b/iu },
  { name: "第 N 版", pattern: /第\s*(?:\d+|X)\s*版|这一版|最新一版|新一版|第\s*(?:\d+|X)\s*版に|\brevision\b/iu },
  { name: "证据", pattern: /证据|証拠|\bevidence\b/iu },
  { name: "来源", pattern: /来源|出典|\bsources?:/iu },
  { name: "error code", pattern: /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/u },
  { name: "hash", pattern: /\b[0-9a-f]{16,}\b/u },
];

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) return files(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

/** Literals that read as a sentence to a person: any CJK, or English with at least three words. */
function sentenceLike(text: string): boolean {
  if (/^\s*(?:select|insert|update|delete|with)\b/iu.test(text)) return false; // SQL
  if (/[぀-ヿ一-鿿]/u.test(text)) return true;
  return /[a-z]+ [a-z]+ [a-z]+/u.test(text);
}

/**
 * Text for developers, never a user's reply or refusal: a thrown error (it is logged, and cards keep their own
 * words), and the 400 a route answers to a malformed request no client sends.
 */
function developerOnly(parent: ts.Node): boolean {
  if (ts.isNewExpression(parent) && /Error$/u.test(parent.expression.getText())) return true;
  if (ts.isCallExpression(parent) && parent.expression.getText() === "failureBody") {
    const [code] = parent.arguments;
    return Boolean(code && ts.isStringLiteral(code) && code.text === "VALIDATION_ERROR");
  }
  return false;
}

function literals(path: string): { line: number; text: string }[] {
  const source = ts.createSourceFile(path, readFileSync(join(ROOT, path), "utf8"), ts.ScriptTarget.Latest, true);
  const out: { line: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    let text: string | null = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateExpression(node)) text = [node.head.text, ...node.templateSpans.map((span) => `X${span.literal.text}`)].join("");
    // Keys, imports and type positions are not shown to anyone.
    const parent = node.parent;
    const notShown = parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || (ts.isPropertyAssignment(parent) && parent.name === node) || ts.isElementAccessExpression(parent) || developerOnly(parent));
    if (text !== null && !notShown && sentenceLike(text)) out.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text });
    if (!ts.isTemplateExpression(node)) ts.forEachChild(node, visit);
    else node.templateSpans.forEach((span) => ts.forEachChild(span.expression, visit));
  };
  visit(source);
  return out;
}

function hits(text: string): string[] {
  return FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
}

test("AG07-5: no code-written agent text names an internal word", () => {
  const scanned = [...SCANNED_DIRS.flatMap(files), ...SCANNED_FILES].filter((path) => !MODEL_ONLY.some((pattern) => pattern.test(path)));
  const problems = scanned.flatMap((path) => literals(path).flatMap(({ line, text }) => {
    const found = hits(text);
    return found.length ? [`${relative(ROOT, join(ROOT, path))}:${line} [${found.join(", ")}] ${text.slice(0, 120)}`] : [];
  }));
  assert.deepEqual(problems, []);
});

test("AG07-5: the aiCard copy group names no internal word in any language", () => {
  const problems = Object.entries({ en, ja, zh }).flatMap(([language, copy]) => Object.entries((copy as { aiCard: Record<string, string> }).aiCard)
    .flatMap(([key, text]) => (hits(text).length ? [`${language}.aiCard.${key}: ${text}`] : [])));
  assert.deepEqual(problems, []);
});

test("AG07-5: the scan itself catches the words it is for", () => {
  for (const text of ["正在重试这一项，沿用原来的操作键。", "卡片已经更新到第 2 版。", "Retrying with its original operation key.", "The card has been updated to version 2.", "カードは第2版に更新されています。", "拒绝（CARD_REVISION_CHANGED）", "sha 3f9a0c1d2e4b5a6978"]) {
    assert.ok(hits(text).length > 0, text);
  }
  for (const text of ["内容有变化，请再看一遍。", "点确认之前，什么都不会改。", "Nothing changes until you confirm."]) assert.deepEqual(hits(text), [], text);
});
