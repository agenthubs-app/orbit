import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface NativePreflightInput {
  appConfig: string;
  podProperties: string;
  podFlags: string;
  compileArgs: readonly string[];
}
interface Check { name: string; passed: boolean; reason: string }

function configIntent(source: string): boolean {
  const file = ts.createSourceFile('app.config.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let enabled = false;
  function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
    const match = object.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(file).replace(/["']/gu, '') === name);
    return match && ts.isPropertyAssignment(match) ? match.initializer : undefined;
  }
  function visit(node: ts.Node): void {
    if (ts.isArrayLiteralExpression(node) && node.elements.length === 2) {
      const [name, options] = node.elements;
      if (name && ts.isStringLiteral(name) && name.text === 'expo-sqlite' && options && ts.isObjectLiteralExpression(options)) {
        const ios = property(options, 'ios');
        const setting = ios && ts.isObjectLiteralExpression(ios) ? property(ios, 'useSQLCipher') ?? property(options, 'useSQLCipher') : property(options, 'useSQLCipher');
        enabled = setting?.kind === ts.SyntaxKind.TrueKeyword;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return enabled;
}

function cipherFlags(source: string): boolean {
  const tokens: string[] = [];
  let token = '';
  let quote: string | null = null;
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    if (character === '\\' && quote !== "'") {
      const next = source[++index];
      if (next === undefined) return false;
      if (next !== '\n') token += next;
    } else if (quote) {
      if (character === quote) quote = null;
      else token += character;
    } else if (character === "'" || character === '"') quote = character;
    else if (!token && (character === '#' || source.slice(index, index + 2) === '//')) {
      while (index < source.length && source[index] !== '\n') index++;
    } else if (!token && source.slice(index, index + 2) === '/*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) return false;
      index = end + 1;
    } else if (/\s/u.test(character)) {
      if (token) tokens.push(token);
      token = '';
    } else token += character;
  }
  if (quote) return false;
  if (token) tokens.push(token);
  const definitions = new Map<string, string>();
  for (let index = 0; index < tokens.length; index++) {
    let flag = tokens[index]!;
    if (flag === '-D' || flag === '-U') flag += tokens[++index] ?? '';
    const definition = /^-D([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/u.exec(flag);
    const removal = /^-U([A-Za-z_][A-Za-z0-9_]*)$/u.exec(flag);
    if (definition) definitions.set(definition[1]!, definition[2] ?? '1');
    else if (removal) definitions.delete(removal[1]!);
  }
  return definitions.get('SQLITE_HAS_CODEC') === '1'
    && definitions.get('SQLCIPHER_CRYPTO_CC') === '1'
    && definitions.get('SQLITE_EXTRA_INIT') === 'sqlcipher_extra_init'
    && definitions.get('SQLITE_EXTRA_SHUTDOWN') === 'sqlcipher_extra_shutdown';
}

/** Reads static evidence only; never executes config, builds, opens a database or accepts runtime proof. */
export async function inspectNativePreflight(input: NativePreflightInput) {
  async function check(name: string, path: string, validate: (source: string) => boolean): Promise<Check> {
    let source: string;
    try { source = await readFile(path, 'utf8'); }
    catch { return { name, passed: false, reason: 'unreadable-evidence' }; }
    try {
      const passed = validate(source);
      return { name, passed, reason: passed ? 'static-evidence-present' : 'missing-or-disabled-cipher-setting' };
    } catch { return { name, passed: false, reason: 'invalid-json' }; }
  }
  const checks = await Promise.all([
    check('app-config-literal-intent', input.appConfig, configIntent),
    check('pod-properties', input.podProperties, source => JSON.parse(source)?.['expo.sqlite.useSQLCipher'] === 'true'),
    check('pod-flags', input.podFlags, cipherFlags),
    ...input.compileArgs.map((path, index) => check(`compile-args-${index + 1}`, path, cipherFlags)),
  ]);
  if (!input.compileArgs.length) checks.push({ name: 'compile-args', passed: false, reason: 'missing-compiler-evidence' });
  const passed = checks.every(check => check.passed);
  return {
    mode: 'static-preflight' as const,
    staticPreflight: passed ? 'pass' as const : 'fail' as const,
    nativeAcceptance: 'unverified' as const,
    unverified: ['actual-cipher-version', 'encrypted-cold-start', 'wrong-key-rejection', 'at-rest-database-and-wal', 'lease-lock-and-actor-switch', 'scope-migration'],
    checks,
    // Static agreement is never a native success exit. No runtime executor is implemented here.
    exitCode: passed ? 2 : 1,
  };
}

async function main(args: string[]): Promise<void> {
  const paths: Record<string, string[]> = {};
  const allowed = ['--app-config', '--pod-properties', '--pod-flags', '--compile-args'];
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]!;
    const value = args[index + 1];
    if (!allowed.includes(name) || !value || value.startsWith('--') || (name !== '--compile-args' && paths[name])) throw new Error('INVALID_PREFLIGHT_ARGUMENTS');
    (paths[name] ??= []).push(value);
  }
  if (!allowed.every(name => paths[name]?.length)) throw new Error('INVALID_PREFLIGHT_ARGUMENTS');
  const report = await inspectNativePreflight({ appConfig: paths['--app-config']![0]!, podProperties: paths['--pod-properties']![0]!, podFlags: paths['--pod-flags']![0]!, compileArgs: paths['--compile-args']! });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main(process.argv.slice(2)).catch(() => {
    console.log(JSON.stringify({ mode: 'static-preflight', staticPreflight: 'fail', nativeAcceptance: 'unverified', reason: 'INVALID_PREFLIGHT_ARGUMENTS' }));
    process.exitCode = 1;
  });
}
