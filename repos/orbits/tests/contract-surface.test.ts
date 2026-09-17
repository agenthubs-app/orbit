import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

// shared/contract 是网页版和 iOS App 共用的响应形状。
// iOS App 会把这个目录原样拷贝进自己的仓库，所以这里的文件必须自包含：
// 带上任何外部 import，拷过去就编译不了。

const contractDir = join(process.cwd(), "shared", "contract");

test("portrait public contract exports every portrait DTO as type-only", () => {
  const parse = (name: string) => ts.createSourceFile(name, readFileSync(join(contractDir, name), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const expected = parse("event-registration-portrait.ts").statements.filter(statement => (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)).map(statement => (statement as ts.InterfaceDeclaration | ts.TypeAliasDeclaration).name.text).sort();
  const exports = parse("index.ts").statements.filter(ts.isExportDeclaration).filter(statement => statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "./event-registration-portrait");
  assert.ok(exports.every(statement => statement.isTypeOnly), "Portrait DTO exports must not introduce runtime code.");
  const actual = exports.flatMap(statement => statement.exportClause && ts.isNamedExports(statement.exportClause) ? statement.exportClause.elements.map(element => element.name.text) : []).sort();
  assert.deepEqual(actual, expected);
});

function contractFiles(): string[] {
  return readdirSync(contractDir).filter((name) => name.endsWith(".ts"));
}

test("契约目录只允许引用自己内部的文件", () => {
  const offenders: string[] = [];

  contractFiles().forEach((name) => {
    const source = readFileSync(join(contractDir, name), "utf8");
    const importPaths = [...source.matchAll(/from\s+"([^"]+)"/gu)].map(
      (match) => match[1],
    );

    importPaths.forEach((importPath) => {
      if (!importPath.startsWith("./")) {
        offenders.push(`${name} -> ${importPath}`);
      }
    });
  });

  assert.deepEqual(
    offenders,
    [],
    "契约文件只能 import 同目录下的其他契约文件，见 shared/contract/README.md",
  );
});

test("契约目录只声明类型，不含运行时代码", () => {
  const offenders: string[] = [];

  contractFiles().forEach((name) => {
    const source = readFileSync(join(contractDir, name), "utf8");

    // export const / function / class 都会在拷贝到客户端后变成运行时依赖。
    if (/^export\s+(const|let|var|function|class|enum)\s/mu.test(source)) {
      offenders.push(name);
    }

    // 值 import 会被打包进客户端；类型 import 不会。
    if (/^import\s+(?!type)/mu.test(source)) {
      offenders.push(`${name} (值 import)`);
    }
  });

  assert.deepEqual(
    offenders,
    [],
    "枚举的常量数组留在 features 或 shared/domain，契约里只放类型声明",
  );
});

test("契约出口覆盖每一个契约文件", () => {
  const indexSource = readFileSync(join(contractDir, "index.ts"), "utf8");
  const missing = contractFiles()
    .filter((name) => name !== "index.ts")
    .map((name) => name.replace(/\.ts$/u, ""))
    .filter((moduleName) => !indexSource.includes(`"./${moduleName}"`));

  assert.deepEqual(
    missing,
    [],
    "新增契约文件后要在 shared/contract/index.ts 补一行 export",
  );
});
