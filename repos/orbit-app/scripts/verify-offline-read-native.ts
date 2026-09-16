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
  return [
    /(?:^|\s)-D\s*SQLITE_HAS_CODEC(?:=1)?(?=\s|["']|$)/u,
    /(?:^|\s)-D\s*SQLCIPHER_CRYPTO_CC(?=\s|["']|$)/u,
    /(?:^|\s)-D\s*SQLITE_EXTRA_INIT=sqlcipher_extra_init(?=\s|["']|$)/u,
    /(?:^|\s)-D\s*SQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown(?=\s|["']|$)/u,
  ].every(pattern => pattern.test(source));
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
