// R08 (SC-R08-05): shared/contract is append-only. This records the shape of every
// exported type (fields, optional or not, field types, enum values) in
// shared/contract/.snapshot.json and reports what a change broke: a removed type or
// field (a rename is a removal), an optional field made required, a new required
// field on an existing type, an enum that lost a value, a field type that is not a
// widening of the old one. A break is let through only when BREAKING.md names its
// id in backticks (with the date, the change, the reason, both owners' agreement
// and the App side's plan). A file whose header says `@draft` (plan-v2 until R22)
// is not recorded or checked.
//
//   node scripts/contract-snapshot.mjs          check (exit 1 on a break or a stale snapshot)
//   node scripts/contract-snapshot.mjs --write  record the current shape after a check passes

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const norm = (text) => text.replace(/\s+/gu, " ").replace(/;\s*\}/gu, " }").trim();

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

function membersOf(nodes, source) {
  const members = {};
  for (const member of nodes) {
    if (!ts.isPropertySignature(member) || !member.name) continue;
    members[member.name.getText(source)] = { optional: Boolean(member.questionToken), type: norm(member.type ? member.type.getText(source) : "unknown") };
  }
  return members;
}

export function extractContractShape(files) {
  const types = {};
  for (const [file, text] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const statement of source.statements) {
      const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) continue;
      if (ts.isInterfaceDeclaration(statement)) {
        types[`${file}::${statement.name.text}`] = {
          kind: "object",
          extends: (statement.heritageClauses ?? []).flatMap((clause) => clause.types.map((type) => norm(type.getText(source)))),
          members: membersOf(statement.members, source),
        };
      } else if (ts.isTypeAliasDeclaration(statement)) {
        const id = `${file}::${statement.name.text}`;
        if (ts.isTypeLiteralNode(statement.type)) types[id] = { kind: "object", extends: [], members: membersOf(statement.type.members, source) };
        else if (ts.isLiteralTypeNode(statement.type)) types[id] = { kind: "enum", values: [norm(statement.type.getText(source))] };
        else if (ts.isUnionTypeNode(statement.type) && statement.type.types.every((part) => ts.isLiteralTypeNode(part))) types[id] = { kind: "enum", values: statement.type.types.map((part) => norm(part.getText(source))) };
        else types[id] = { kind: "alias", type: norm(statement.type.getText(source)) };
      }
    }
  }
  return { version: 1, types };
}

/** A type change that only adds union members (string → string | null) is a widening. */
function isWidening(before, after) {
  if (before === after) return true;
  const next = new Set(topLevelParts(after));
  return topLevelParts(before).every((part) => next.has(part));
}

export function compareContractShapes(before, after) {
  const breaks = [];
  for (const [id, old] of Object.entries(before.types)) {
    const now = after.types[id];
    if (!now) { breaks.push({ id, kind: "removed-type", detail: `${id} was removed or renamed` }); continue; }
    if (old.kind !== now.kind) { breaks.push({ id, kind: "changed-kind", detail: `${id} changed from ${old.kind} to ${now.kind}` }); continue; }
    if (old.kind === "enum") {
      for (const value of old.values) if (!now.values.includes(value)) breaks.push({ id: `${id}=${value}`, kind: "removed-value", detail: `${id} lost ${value}` });
    } else if (old.kind === "alias") {
      if (!isWidening(old.type, now.type)) breaks.push({ id, kind: "changed-type", detail: `${id}: ${old.type} → ${now.type}` });
    } else {
      for (const name of old.extends) if (!now.extends.includes(name)) breaks.push({ id: `${id}:extends:${name}`, kind: "removed-base", detail: `${id} no longer extends ${name}` });
      for (const [name, field] of Object.entries(old.members)) {
        const next = now.members[name];
        const fieldId = `${id}.${name}`;
        if (!next) breaks.push({ id: fieldId, kind: "removed-field", detail: `${fieldId} was removed or renamed` });
        else {
          if (field.optional && !next.optional) breaks.push({ id: fieldId, kind: "made-required", detail: `${fieldId} became required` });
          if (!isWidening(field.type, next.type)) breaks.push({ id: fieldId, kind: "changed-type", detail: `${fieldId}: ${field.type} → ${next.type}` });
        }
      }
      for (const [name, field] of Object.entries(now.members)) {
        if (!(name in old.members) && !field.optional) breaks.push({ id: `${id}.${name}`, kind: "added-required", detail: `${id}.${name} was added as required` });
      }
    }
  }
  return breaks;
}

/** Ids that BREAKING.md lets through (each written in backticks). */
export function allowedBreaks(markdown) {
  return new Set([...markdown.matchAll(/`([^`]+::[^`]+)`/gu)].map((match) => match[1]));
}

/** A draft contract says `@draft` in its header comment (before the first statement). */
export function isDraftContract(text) {
  const header = text.slice(0, text.search(/^(export|import|interface|type)\b/mu) >>> 0);
  return /@draft\b/u.test(header);
}

export function readContractFiles(dir) {
  return Object.fromEntries(readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => [name, readFileSync(join(dir, name), "utf8")])
    .filter(([, text]) => !isDraftContract(text)));
}

export function checkContractDir(dir) {
  const snapshotPath = join(dir, ".snapshot.json");
  const breakingPath = join(dir, "BREAKING.md");
  const current = extractContractShape(readContractFiles(dir));
  const recorded = existsSync(snapshotPath) ? JSON.parse(readFileSync(snapshotPath, "utf8")) : { version: 1, types: {} };
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
    console.error("契约只加不改。确需破坏时在 shared/contract/BREAKING.md 写明 id、原因和 App 的跟进，再 --write。");
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
