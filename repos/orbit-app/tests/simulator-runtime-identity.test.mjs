import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const implementation = await import('../scripts/verify-simulator-runtime-identity.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const hash = value => createHash('sha256').update(value).digest('hex');
const expected = {
  udid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', bundleId: 'app.agenthubs.orbit', scheme: 'orbit',
  nativeSha256: hash('native-main'), metroOrigin: 'http://127.0.0.1:8082',
  jsSha256: hash('main-js'), webOrigin: 'http://127.0.0.1:3000', webArtifactSha256: hash('main-web'),
  appSourceRoot: '/checkout/repos/orbit-app', webSourceRoot: '/checkout/repos/orbits', actorDigest: hash('qa-actor'),
};
const observed = () => ({
  device: {udid: expected.udid, state: 'Booted'},
  native: {bundleId: expected.bundleId, executableSha256: hash('native-main'), containerPath: '/sim/Orbit.app', pid: 12, processExecutableMatches: true},
  schemeBundles: ['app.agenthubs.orbit'],
  metro: {origin: expected.metroOrigin, status: 'packager-status:running', sourceRoot: expected.appSourceRoot, bodySha256: hash('main-js'), pid: 10},
  web: {origin: expected.webOrigin, sourceRoot: expected.webSourceRoot, bodySha256: hash('main-web'), artifactSha256: hash('main-web'), pid: 11, buildId: 'build-one', health: {success: true, data: {service: 'orbit-runtime', status: 'ok', mode: 'live'}}},
  runtimeReceipt: {udid: expected.udid, bundleId: expected.bundleId, nativePid: 12, observedAt: new Date().toISOString(), executableSha256: hash('native-main'), loadedJsOrigin: expected.metroOrigin, loadedJsSha256: hash('main-js'), apiOrigin: expected.webOrigin, actorDigest: expected.actorDigest},
});

test('actual matching native, served bytes and runtime receipt are required together', () => {
  assert.equal(typeof implementation.verifyRuntimeIdentity, 'function', 'runtime identity verifier is not implemented');
  const result = implementation.verifyRuntimeIdentity(expected, observed());
  assert.equal(result.status, 'evidence-consistent');
  assert.equal(result.scope, 'identity-only');
  assert.equal(result.actualAcceptancePassed, false);
  assert.equal(JSON.stringify(result).includes('qa-actor'), false);
});
test('read-only collector hashes actual native files and served bytes; no boot, login or environment reads', async () => {
  assert.equal(typeof implementation.collectRuntimeIdentity, 'function');
  const directory = await mkdtemp(join(tmpdir(), 'orbit-identity-test-'));
  try {
    const container = join(directory, 'Orbit.app');
    const {mkdir} = await import('node:fs/promises');
    await mkdir(container);
    await writeFile(join(container, 'Orbit'), 'native-main');
    await writeFile(join(directory, 'artifact.js'), 'main-web');
    await writeFile(join(directory, 'BUILD_ID'), 'build-one');
    const calls = [];
    const command = (file, args) => {
      calls.push([file, ...args]);
      if (file === 'xcrun' && args.join(' ') === 'simctl list devices --json') return JSON.stringify({devices: {ios: [{udid: expected.udid, state: 'Booted'}]}});
      if (file === 'xcrun' && args[1] === 'get_app_container') return container;
      if (file === 'xcrun' && args[1] === 'listapps') return '{}';
      if (file === 'plutil' && args.at(-1) === '-') return JSON.stringify({'app.agenthubs.orbit': {CFBundleURLTypes: [{CFBundleURLSchemes: ['orbit']}]}});
      if (file === 'plutil') return JSON.stringify({CFBundleIdentifier: expected.bundleId, CFBundleExecutable: 'Orbit'});
      if (file === 'lsof' && args.includes('txt')) return 'n' + join(container, 'Orbit');
      if (file === 'lsof' && args.includes('cwd')) return 'n' + (args.includes('10') ? expected.appSourceRoot : expected.webSourceRoot);
      if (file === 'lsof') return 'p' + (args.includes('10') ? '10' : '11');
      throw new Error('Unexpected command');
    };
    const request = async (url, options) => {
      assert.equal(options.redirect, 'error');
      assert.equal(options.credentials, 'omit');
      const pathname = new URL(url).pathname;
      return new Response(pathname === '/status' ? 'packager-status:running' : pathname === '/api/health' ? JSON.stringify(observed().web.health) : pathname.endsWith('.bundle') ? 'main-js' : 'main-web');
    };
    const result = await implementation.collectRuntimeIdentity({expected, metroPid: 10, webPid: 11, nativePid: 12, metroBundleUrl: expected.metroOrigin + '/index.bundle?platform=ios&dev=true', webArtifactUrl: expected.webOrigin + '/_next/static/build-one/artifact.js', webArtifactPath: join(directory, 'artifact.js'), buildIdPath: join(directory, 'BUILD_ID'), runtimeReceipt: observed().runtimeReceipt}, {command, request});
    assert.equal(result.native.executableSha256, hash('native-main'));
    assert.equal(result.metro.bodySha256, hash('main-js'));
    assert.equal(result.web.bodySha256, hash('main-web'));
    assert.equal(implementation.verifyRuntimeIdentity(expected, result).status, 'evidence-consistent');
    assert.equal(calls.some(call => call.some(value => ['boot', 'launch', 'terminate', 'getenv', 'defaults'].includes(value))), false);
  } finally {
    await rm(directory, {recursive: true});
  }
});
test('missing or shutdown device is blocked, never automatically booted', () => {
  assert.equal(typeof implementation.verifyRuntimeIdentity, 'function');
  for (const device of [null, {udid: expected.udid, state: 'Shutdown'}]) {
    const result = implementation.verifyRuntimeIdentity(expected, {...observed(), device});
    assert.equal(result.status, 'blocked');
    assert.ok(result.failures.some(item => item.code === 'DEVICE_NOT_BOOTED'));
  }
});
test('wrong package, scheme conflict, old Web bytes and wrong Metro source fail visibly', () => {
  assert.equal(typeof implementation.verifyRuntimeIdentity, 'function');
  for (const [patch, code] of [
    [{native: {...observed().native, bundleId: 'app.agenthubs.orbit.qa'}}, 'NATIVE_MISMATCH'],
    [{native: {...observed().native, executableSha256: hash('qa-native')}}, 'NATIVE_MISMATCH'],
    [{schemeBundles: ['app.agenthubs.orbit', 'app.agenthubs.orbit.qa']}, 'SCHEME_CONFLICT'],
    [{web: {...observed().web, bodySha256: hash('old-web')}}, 'WEB_SOURCE_MISMATCH'],
    [{metro: {...observed().metro, sourceRoot: '/other-checkout'}}, 'METRO_SOURCE_MISMATCH'],
  ]) {
    const result = implementation.verifyRuntimeIdentity(expected, {...observed(), ...patch});
    assert.equal(result.status, 'failed');
    assert.ok(result.failures.some(item => item.code === code));
  }
});
test('version and healthy service do not substitute for actual loaded JS and actor evidence', () => {
  assert.equal(typeof implementation.verifyRuntimeIdentity, 'function');
  const missing = implementation.verifyRuntimeIdentity(expected, {...observed(), runtimeReceipt: null});
  assert.equal(missing.status, 'blocked');
  const mismatch = implementation.verifyRuntimeIdentity(expected, {...observed(), runtimeReceipt: {...observed().runtimeReceipt, actorDigest: hash('other')}});
  assert.equal(mismatch.status, 'failed');
  assert.ok(mismatch.failures.some(item => item.code === 'RUNTIME_RECEIPT_MISMATCH'));
  const stale = implementation.verifyRuntimeIdentity(expected, {...observed(), runtimeReceipt: {...observed().runtimeReceipt, observedAt: '2000-01-01T00:00:00Z'}});
  assert.equal(stale.status, 'blocked');
  assert.ok(stale.failures.some(item => item.code === 'RUNTIME_RECEIPT_STALE'));
});
test('collector stops after device inventory if fixed device is absent; no HTTP or second device selection', async () => {
  assert.equal(typeof implementation.collectRuntimeIdentity, 'function');
  let calls = 0;
  const result = await implementation.collectRuntimeIdentity({expected}, {
    command: (file, args) => {calls++; assert.deepEqual([file, ...args], ['xcrun', 'simctl', 'list', 'devices', '--json']); return JSON.stringify({devices: {ios: [{udid: 'OTHER', state: 'Booted'}]}});},
    request: () => {throw new Error('must not probe another target');},
  });
  assert.equal(calls, 1);
  assert.equal(implementation.verifyRuntimeIdentity(expected, result).status, 'blocked');
});
test('CLI rejects apply and reports a safe structured failure without echoing arguments', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-simulator-runtime-identity.mjs', '--apply', 'private-secret-test-sentinel'], {encoding: 'utf8'});
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stderr.trim());
  assert.equal(output.status, 'failed');
  assert.equal(output.code, 'INVALID_ARGUMENTS');
  assert.equal(result.stderr.includes('private-secret-test-sentinel'), false);
});
