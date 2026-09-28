import ts from "typescript";

/**
 * Sprint 0117 (dashboard D3, design decision 3): the rule for
 * `shared/compute/`, the one directory whose runtime code the server and the
 * App share (npm run sync:contract copies it byte for byte to the App's
 * `src/api/compute/`). The server's tests (tests/architecture/shared-compute
 * .test.ts) and the App's (orbit-app/tests/compute-sync.test.ts) run this same
 * audit, so a file that breaks it fails on both sides.
 *
 * A compute file is a pure function of its arguments:
 *   - imports: only `./<file>` (another compute file), `import type` from
 *     `../contract/<file>` (types, which both sides hold), or the two synced
 *     dictionaries `../domain/industries` and `../domain/language`. No package,
 *     no server module, no dynamic import or require;
 *   - no IO, network or host: process, fetch, XMLHttpRequest, WebSocket,
 *     storage, window/document/navigator, timers, console, Buffer, crypto;
 *   - no clock or randomness: Date.now(), argument-less new Date(), Math.random,
 *     performance. The caller passes "now" in;
 *   - text and time primitives whose result depends on the runtime (the
 *     server's Node/ICU and locale, the phone's Hermes, the browser's V8):
 *     localeCompare, toLocale*, Intl, Date.parse and new Date(value) appear
 *     only in the one helper file COMPUTE_TEXT_HELPER, which pins them.
 */
export const COMPUTE_TEXT_HELPER = "compute-text.ts";
export const COMPUTE_SHARED_DICTIONARIES = ["../domain/industries", "../domain/language"] as const;

export interface ComputeSource {
  name: string;
  text: string;
}

const HOST_IDENTIFIERS = new Set([
  "process", "require", "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "localStorage", "sessionStorage", "indexedDB",
  "globalThis", "window", "document", "navigator", "console", "setTimeout", "setInterval", "setImmediate", "queueMicrotask",
  "Buffer", "__dirname", "__filename", "crypto", "performance", "Worker",
]);
const RUNTIME_TEXT_MEMBERS = new Set(["localeCompare", "toLocaleLowerCase", "toLocaleUpperCase", "toLocaleString", "toLocaleDateString", "toLocaleTimeString"]);

function specifierProblems(source: ComputeSource, names: ReadonlySet<string>, file: ts.SourceFile): string[] {
  const problems: string[] = [];
  const check = (specifier: string, typeOnly: boolean, where: string) => {
    const local = /^\.\/([a-z0-9-]+)$/.exec(specifier);
    if (local) {
      if (!names.has(`${local[1]}.ts`)) problems.push(`${source.name}: ${where} "${specifier}" is not a file of this directory`);
      return;
    }
    if (/^\.\.\/contract\/[a-z0-9-]+$/.test(specifier)) {
      if (!typeOnly) problems.push(`${source.name}: ${where} "${specifier}" must be \`import type\` (contracts are types only)`);
      return;
    }
    if ((COMPUTE_SHARED_DICTIONARIES as readonly string[]).includes(specifier)) return;
    problems.push(`${source.name}: ${where} "${specifier}" is outside the shared directory's allowed imports`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly = Boolean(clause?.isTypeOnly) || Boolean(clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
        && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((element) => element.isTypeOnly));
      check(node.moduleSpecifier.text, typeOnly, "import");
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      check(node.moduleSpecifier.text, node.isTypeOnly, "export");
    } else if (ts.isImportEqualsDeclaration(node)) {
      problems.push(`${source.name}: import = require is not allowed`);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      problems.push(`${source.name}: dynamic import() is not allowed`);
    } else if (ts.isImportTypeNode(node)) {
      problems.push(`${source.name}: inline import("…") types are not allowed`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return problems;
}

function behaviourProblems(source: ComputeSource, file: ts.SourceFile): string[] {
  const problems: string[] = [];
  const helper = source.name === COMPUTE_TEXT_HELPER;
  const flag = (node: ts.Node, message: string) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    problems.push(`${source.name}:${line + 1}: ${message}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && HOST_IDENTIFIERS.has(node.text)) {
      const parent = node.parent;
      // A property name (`x.process`, `{ console: 1 }`) is not the host global.
      const isPropertyName = (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || (ts.isPropertyAssignment(parent) && parent.name === node)
        || (ts.isPropertySignature(parent) && parent.name === node)
        || (ts.isMethodDeclaration(parent) && parent.name === node)
        || (ts.isBindingElement(parent) && parent.propertyName === node);
      if (!isPropertyName) flag(node, `host API "${node.text}" (IO, network, timers or globals) is not allowed`);
    }
    if (ts.isPropertyAccessExpression(node)) {
      const target = node.expression.getText(file);
      const member = node.name.text;
      if (target === "Date" && member === "now") flag(node, "Date.now() reads the clock; pass now in");
      if (target === "Math" && member === "random") flag(node, "Math.random() is not deterministic");
      if (!helper && target === "Date" && member === "parse") flag(node, `Date.parse depends on the runtime; use ${COMPUTE_TEXT_HELPER}`);
      if (!helper && RUNTIME_TEXT_MEMBERS.has(member)) flag(node, `${member} depends on the runtime's locale/ICU; use ${COMPUTE_TEXT_HELPER}`);
    }
    if (ts.isIdentifier(node) && node.text === "Intl" && !helper) flag(node, `Intl depends on the runtime; use ${COMPUTE_TEXT_HELPER}`);
    if (ts.isNewExpression(node) && node.expression.getText(file) === "Date") {
      if (!node.arguments || node.arguments.length === 0) flag(node, "new Date() reads the clock; pass now in");
      else if (!helper) flag(node, `new Date(value) parses by runtime rules; use ${COMPUTE_TEXT_HELPER}`);
    }
    if (ts.isCallExpression(node) && node.expression.getText(file) === "Date" ) flag(node, "Date() reads the clock");
    ts.forEachChild(node, visit);
  };
  visit(file);
  return problems;
}

/** Problems, one per line; empty means every file follows the shared-directory rule. */
export function auditSharedComputeSources(sources: readonly ComputeSource[]): string[] {
  const problems: string[] = [];
  if (sources.length === 0) problems.push("the shared compute directory is empty");
  const names = new Set(sources.map((source) => source.name));
  for (const source of sources) {
    if (!/^[a-z0-9-]+\.ts$/.test(source.name)) {
      problems.push(`${source.name}: only flat lower-case .ts files are shared`);
      continue;
    }
    const file = ts.createSourceFile(source.name, source.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    problems.push(...specifierProblems(source, names, file), ...behaviourProblems(source, file));
  }
  return problems;
}
