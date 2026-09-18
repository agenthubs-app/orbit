import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectNativePreflight } from '../scripts/verify-offline-read-native';

const flags = '-DSQLITE_HAS_CODEC=1 -DSQLCIPHER_CRYPTO_CC -DSQLITE_EXTRA_INIT=sqlcipher_extra_init -DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown';
async function fixture(t: test.TestContext, overrides: Partial<Record<'config' | 'properties' | 'pod' | 'compile', string>> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'orbit-cipher-preflight-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contents = { config: 'export default { plugins: [["expo-sqlite", { useSQLCipher: true }]] };', properties: '{"expo.sqlite.useSQLCipher":"true"}', pod: flags, compile: flags, ...overrides };
  const paths = { appConfig: join(root, 'app.config.ts'), podProperties: join(root, 'Podfile.properties.json'), podFlags: join(root, 'debug.xcconfig'), compileArgs: [join(root, 'compile.resp')] };
  await Promise.all([writeFile(paths.appConfig, contents.config), writeFile(paths.podProperties, contents.properties), writeFile(paths.podFlags, contents.pod), writeFile(paths.compileArgs[0]!, contents.compile)]);
  return paths;
}

test('static configuration and compiler agreement never proves native acceptance', async t => {
  const report = await inspectNativePreflight(await fixture(t));
  assert.equal(report.staticPreflight, 'pass');
  assert.equal(report.nativeAcceptance, 'unverified');
  assert.equal(report.exitCode, 2);
  assert.ok(report.checks.every(check => check.passed));
});

test('missing pod property detects configured intent that never reached CocoaPods', async t => {
  for (const properties of ['{}', '{"expo.sqlite.useSQLCipher":true}', '{"expo.sqlite.useSQLCipher":"false"}']) {
    const report = await inspectNativePreflight(await fixture(t, { properties }));
    assert.equal(report.staticPreflight, 'fail');
    assert.equal(report.exitCode, 1);
    assert.ok(report.checks.some(check => check.name === 'pod-properties' && !check.passed));
  }
});

test('ordinary SQLite flags or drift in any compile response fail closed', async t => {
  const paths = await fixture(t, { compile: '-DSQLITE_ENABLE_FTS5=1' });
  assert.equal((await inspectNativePreflight(paths)).staticPreflight, 'fail');
  await writeFile(paths.compileArgs[0]!, flags);
  const second = join(paths.appConfig, '..', 'second.resp');
  await writeFile(second, flags.replace('SQLITE_HAS_CODEC=1', 'SQLITE_HAS_CODEC=0'));
  assert.equal((await inspectNativePreflight({ ...paths, compileArgs: [...paths.compileArgs, second] })).staticPreflight, 'fail');
  assert.equal((await inspectNativePreflight(await fixture(t, { pod: '-DSQLITE_ENABLE_FTS5=1' }))).staticPreflight, 'fail');
});

test('quoted and unquoted Xcode response tokens preserve valid compiler definitions', async t => {
  for (const compile of [flags, flags.split(' ').map(token => `'${token}'`).join(' '), flags.split(' ').map(token => `"${token}"`).join('\n')]) {
    const report = await inspectNativePreflight(await fixture(t, { compile }));
    assert.equal(report.staticPreflight, 'pass');
    assert.equal(report.exitCode, 2);
    assert.equal(report.nativeAcceptance, 'unverified');
  }
});

test('overridden macros, comments and non-flag tokens cannot masquerade as cipher evidence', async t => {
  for (const compile of [
    `${flags} '-DSQLITE_HAS_CODEC=0'`, `${flags} -USQLITE_HAS_CODEC`,
    `// ${flags}`, `# ${flags}`, `/* ${flags} */`,
    `"description ${flags}"`, flags.replace('-DSQLITE_HAS_CODEC=1', 'prefix-DSQLITE_HAS_CODEC=1'),
    `${flags} 'unterminated`,
  ]) assert.equal((await inspectNativePreflight(await fixture(t, { compile }))).staticPreflight, 'fail', compile);
});

test('commented config, disabled iOS override and missing compiler evidence cannot pass', async t => {
  for (const config of ['// [["expo-sqlite", { useSQLCipher: true }]]\nexport default {};', 'export default {plugins:[["expo-sqlite",{useSQLCipher:true,ios:{useSQLCipher:false}}]]};']) {
    assert.equal((await inspectNativePreflight(await fixture(t, { config }))).staticPreflight, 'fail');
  }
  assert.equal((await inspectNativePreflight({ ...await fixture(t), compileArgs: [] })).staticPreflight, 'fail');
});

test('unreadable or malformed evidence is reported without leaking source contents', async t => {
  const paths = await fixture(t, { properties: 'private-secret-invalid-json' });
  const report = await inspectNativePreflight({ ...paths, podFlags: `${paths.podFlags}.missing` });
  assert.equal(report.exitCode, 1);
  assert.equal(JSON.stringify(report).includes('private-secret'), false);
  assert.ok(report.checks.some(check => check.reason === 'unreadable-evidence'));
  assert.ok(report.checks.some(check => check.reason === 'invalid-json'));
});

test('CLI returns nonzero on static pass and rejects invented runtime-proof flags', async t => {
  const paths = await fixture(t);
  const script = resolve(import.meta.dirname, '../scripts/verify-offline-read-native.ts');
  const args = ['--app-config', paths.appConfig, '--pod-properties', paths.podProperties, '--pod-flags', paths.podFlags, '--compile-args', paths.compileArgs[0]!];
  const run = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { encoding: 'utf8' });
  assert.equal(run.status, 2, run.stderr);
  assert.equal(JSON.parse(run.stdout).nativeAcceptance, 'unverified');
  const forged = spawnSync(process.execPath, ['--import', 'tsx', script, ...args, '--runtime-pass'], { encoding: 'utf8' });
  assert.equal(forged.status, 1);
});
