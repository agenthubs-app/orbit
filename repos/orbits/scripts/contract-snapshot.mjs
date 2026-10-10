// R08 (SC-R08-05): shared/contract is append-only. This records the shape of every
// exported type — its properties as the TypeScript checker resolves them (so
// `extends`, intersections and inline object literals are flattened), whether each
// is optional, its type, enum values, type parameters, index signatures — plus the
// names `index.ts` re-exports, in shared/contract/.snapshot.json, and reports what a
// change broke:
//   - a removed type, property or re-export (a rename is a removal);
//   - an optional property made required, or a required one added to an existing
//     type (also when it arrives through a new `extends`);
//   - an enum that lost a value;
//   - a property type that is not a widening of the old one. Adding union members
//     is a widening, except `null`, `unknown` and `any` (and `undefined` on a
//     required property): a client that already shipped would read a value it
//     cannot handle (R08 review M3 / M4);
//   - changed type parameters.
// A break is let through only when BREAKING.md has a complete table row naming its
// id (date, id in backticks, change, reason, both owners' agreement, App follow-up).
// A file whose header carries the JSDoc tag `@draft` (plan-v2 until R22) is not
// recorded or checked.
//
//   node scripts/contract-snapshot.mjs          check (exit 1 on a break or a stale snapshot)
//   node scripts/contract-snapshot.mjs --write  record the current shape after a check passes

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const norm = (text) => text.replace(/\s+/gu, " ").trim();
const MAX_DEPTH = 4;

function topLevelParts(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if ("{([<".includes(char)) depth += 1;
    if ("})]>".includes(char)) depth -= 1;
    if (char === "|" && depth === 0) { parts.push(current.trim()); current = ""; } else current += char;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

/** A file is a draft when its header comment carries the JSDoc tag `@draft` at the start of a line. */
export function isDraftContract(text) {
  const first = text.search(/^(export|import|interface|type|declare)\b/mu);
  const header = first === -1 ? text : text.slice(0, first);
  return /^\s*(?:\/\*\*|\*|\/\/)\s*@draft\b/mu.test(header);
}

export function readContractFiles(dir) {
  return Object.fromEntries(readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => [name, readFileSync(join(dir, name), "utf8")])
    .filter(([, text]) => !isDraftContract(text)));
}

function isAnonymousObject(type) {
  return Boolean(type.flags & ts.TypeFlags.Object) && Boolean(type.symbol) && Boolean(type.symbol.flags & (ts.SymbolFlags.TypeLiteral | ts.SymbolFlags.ObjectLiteral));
}

function describeType(checker, type, depth) {
  const text = norm(checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType));
  if (depth < MAX_DEPTH) {
    if (isAnonymousObject(type)) return { kind: "object", members: describeMembers(checker, type, depth + 1) };
    if (checker.isArrayType?.(type) || checker.isTupleType?.(type)) {
      const element = checker.getTypeArguments(type)[0];
      if (element && isAnonymousObject(element)) return { kind: "array", readonly: text.startsWith("readonly"), element: { kind: "object", members: describeMembers(checker, element, depth + 1) } };
    }
  }
  return { kind: "text", type: text };
}

function describeMembers(checker, type, depth) {
  const members = {};
  for (const prop of checker.getPropertiesOfType(type)) {
    const declaration = prop.valueDeclaration ?? prop.declarations?.[0];
    const optional = Boolean(prop.flags & ts.SymbolFlags.Optional);
    let declared = declaration && declaration.type ? checker.getTypeFromTypeNode(declaration.type) : checker.getTypeOfSymbol(prop);
    // `x?: T | undefined` (exactOptionalPropertyTypes) is the same contract as `x?: T`.
    if (optional && declared.flags & ts.TypeFlags.Union) {
      const defined = declared.types.filter((part) => !(part.flags & ts.TypeFlags.Undefined));
      if (defined.length === 1) declared = defined[0];
    }
    members[prop.name] = { optional, ...describeType(checker, declared, depth) };
  }
  for (const info of checker.getIndexInfosOfType(type)) {
    members[`[${checker.typeToString(info.keyType)}]`] = { optional: false, kind: "text", type: norm(checker.typeToString(info.type)) };
  }
  for (const signature of checker.getSignaturesOfType(type, ts.SignatureKind.Call)) {
    members["(call)"] = { optional: false, kind: "text", type: norm(checker.signatureToString(signature)) };
  }
  return members;
}

function enumValues(type) {
  if (type.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral)) return [type.flags & ts.TypeFlags.StringLiteral ? `'${type.value}'` : String(type.value)];
  if (!(type.flags & ts.TypeFlags.Union) || !type.types.every((part) => part.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral))) return null;
  return type.types.map((part) => (part.flags & ts.TypeFlags.StringLiteral ? `'${part.value}'` : part.flags & ts.TypeFlags.NumberLiteral ? String(part.value) : part.intrinsicName)).sort();
}

export function extractContractShape(files) {
  const dir = mkdtempSync(join(tmpdir(), "contract-shape-"));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    const names = Object.keys(files).sort((a, b) => a.localeCompare(b));
    const program = ts.createProgram(names.map((name) => join(dir, name)), {
      strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [],
    });
    const checker = program.getTypeChecker();
    const types = {};
    for (const name of names) {
      const source = program.getSourceFile(join(dir, name));
      for (const statement of source.statements) {
        if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          const id = `${name}::(exports)`;
          const values = statement.exportClause.elements.map((element) => element.name.text);
          types[id] = { kind: "enum", values: [...new Set([...(types[id]?.values ?? []), ...values])].sort() };
          continue;
        }
        const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
        if (!exported || !(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))) continue;
        const id = `${name}::${statement.name.text}`;
        const symbol = checker.getSymbolAtLocation(statement.name);
        const type = checker.getDeclaredTypeOfSymbol(symbol);
        const typeParams = (statement.typeParameters ?? []).map((param) => norm(param.getText(source)));
        const values = enumValues(type);
        let shape;
        if (values) shape = { kind: "enum", values };
        else if (type.flags & ts.TypeFlags.Object || type.flags & ts.TypeFlags.Intersection) shape = { kind: "object", members: describeMembers(checker, type, 0) };
        else shape = { kind: "alias", type: norm(checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType)) };
        types[id] = typeParams.length ? { ...shape, typeParams } : shape;
      }
    }
    return { version: 2, types };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const UNSAFE_ADDITIONS = new Set(["null", "unknown", "any"]);

/** Adding union members is a widening — but not null / unknown / any, nor undefined on a required property. */
function isWidening(before, after, optional) {
  if (before === after) return true;
  const old = new Set(topLevelParts(before));
  const next = topLevelParts(after);
  if (!old.size || [...old].some((part) => !next.includes(part))) return false;
  return next.filter((part) => !old.has(part)).every((part) => !UNSAFE_ADDITIONS.has(part) && !(part === "undefined" && !optional));
}

function compareMembers(id, before, after, breaks) {
  for (const [name, field] of Object.entries(before)) {
    const next = after[name];
    const fieldId = `${id}.${name}`;
    if (!next) { breaks.push({ id: fieldId, kind: "removed-field", detail: `${fieldId} was removed or renamed` }); continue; }
    if (field.optional && !next.optional) breaks.push({ id: fieldId, kind: "made-required", detail: `${fieldId} became required` });
    compareValue(fieldId, field, next, breaks, next.optional);
  }
  for (const [name, field] of Object.entries(after)) {
    if (!(name in before) && !field.optional) breaks.push({ id: `${id}.${name}`, kind: "added-required", detail: `${id}.${name} was added as required` });
  }
}

function compareValue(id, before, after, breaks, optional) {
  if (before.kind === "object" && after.kind === "object") return compareMembers(id, before.members, after.members, breaks);
  if (before.kind === "array" && after.kind === "array") {
    if (!before.readonly && after.readonly) breaks.push({ id, kind: "changed-type", detail: `${id} became readonly` });
    return compareMembers(`${id}[]`, before.element.members, after.element.members, breaks);
  }
  const text = (value) => (value.kind === "text" ? value.type : value.kind);
  if (before.kind !== after.kind || !isWidening(text(before), text(after), optional)) breaks.push({ id, kind: "changed-type", detail: `${id}: ${text(before)} → ${text(after)}` });
}

export function compareContractShapes(before, after) {
  const breaks = [];
  for (const [id, old] of Object.entries(before.types)) {
    const now = after.types[id];
    if (!now) { breaks.push({ id, kind: "removed-type", detail: `${id} was removed or renamed` }); continue; }
    if (JSON.stringify(old.typeParams ?? []) !== JSON.stringify(now.typeParams ?? [])) breaks.push({ id: `${id}<>`, kind: "changed-type-params", detail: `${id} type parameters changed` });
    if (old.kind !== now.kind) { breaks.push({ id, kind: "changed-kind", detail: `${id} changed from ${old.kind} to ${now.kind}` }); continue; }
    if (old.kind === "enum") {
      for (const value of old.values) if (!now.values.includes(value)) breaks.push({ id: `${id}=${value}`, kind: "removed-value", detail: `${id} lost ${value}` });
    } else if (old.kind === "alias") {
      if (!isWidening(old.type, now.type, false)) breaks.push({ id, kind: "changed-type", detail: `${id}: ${old.type} → ${now.type}` });
    } else {
      compareMembers(id, old.members, now.members, breaks);
    }
  }
  return breaks;
}

/**
 * Ids that BREAKING.md lets through: only complete table rows — a YYYY-MM-DD date,
 * the id in backticks, and non-empty change, reason, agreement and App columns.
 */
export function allowedBreaks(markdown) {
  const ids = new Set();
  for (const line of markdown.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/gu, "").split("|").map((cell) => cell.trim());
    if (cells.length < 6 || !/^\d{4}-\d{2}-\d{2}$/u.test(cells[0]) || cells.slice(2, 6).some((cell) => !cell)) continue;
    for (const match of cells[1].matchAll(/`([^`]+::[^`]+)`/gu)) ids.add(match[1]);
  }
  return ids;
}

export function checkContractDir(dir) {
  const snapshotPath = join(dir, ".snapshot.json");
  const breakingPath = join(dir, "BREAKING.md");
  const current = extractContractShape(readContractFiles(dir));
  const recorded = existsSync(snapshotPath) ? JSON.parse(readFileSync(snapshotPath, "utf8")) : { version: 2, types: {} };
  const allowed = allowedBreaks(existsSync(breakingPath) ? readFileSync(breakingPath, "utf8") : "");
  const breaks = compareContractShapes(recorded, current).filter((item) => !allowed.has(item.id));
  const stale = JSON.stringify(recorded) !== JSON.stringify(current);
  return { breaks, stale, current, snapshotPath };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const dir = join(process.cwd(), "shared", "contract");
  const { breaks, stale, current, snapshotPath } = checkContractDir(dir);
  for (const item of breaks) console.error(`破坏性变更：${item.detail}（id: ${item.id}）`);
  if (breaks.length > 0) {
    console.error("契约只加不改。确需破坏时在 shared/contract/BREAKING.md 按表格登记一行（日期、id、改动、原因、甲乙同意、App 跟进），再 --write。");
    process.exit(1);
  }
  if (process.argv.includes("--write")) {
    writeFileSync(snapshotPath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`已记录 ${Object.keys(current.types).length} 个契约类型 → ${snapshotPath}`);
  } else if (stale) {
    console.error("契约有新增但快照未更新：node scripts/contract-snapshot.mjs --write");
    process.exit(1);
  } else console.log("契约快照一致。");
}
