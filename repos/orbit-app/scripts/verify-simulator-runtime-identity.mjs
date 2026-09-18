#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isAbsolute, join} from 'node:path';
import {pathToFileURL} from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const pid = value => Number.isInteger(value) && value > 0;
const origin = value => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.href !== url.origin + '/') throw Error('INVALID_LOCAL_ORIGIN');
  return url.origin;
};

function validateExpected(expected) {
  if (!expected || !/^[A-Fa-f0-9-]{36}$/.test(expected.udid)
    || expected.bundleId !== 'app.agenthubs.orbit' || expected.scheme !== 'orbit'
    || ![expected.nativeSha256, expected.jsSha256, expected.webArtifactSha256, expected.actorDigest].every(sha256)
    || ![expected.appSourceRoot, expected.webSourceRoot].every(value => typeof value === 'string' && isAbsolute(value))) throw Error('INVALID_EXPECTED_IDENTITY');
  if (new URL(origin(expected.metroOrigin)).port !== '8082') throw Error('MAIN_METRO_REQUIRED');
  origin(expected.webOrigin);
}

// Receipt authenticity is a separate operator-owned acceptance step. This
// checks consistency, not whether a supplied receipt was actually observed.
export function verifyRuntimeIdentity(expected, observed) {
  validateExpected(expected);
  const failures = [];
  const fail = (code, blocked = false) => failures.push({code, blocked});
  if (!observed?.device || observed.device.udid !== expected.udid || observed.device.state !== 'Booted') fail('DEVICE_NOT_BOOTED', true);
  if (!observed?.native) fail('NATIVE_NOT_INSTALLED', true);
  else if (observed.native.bundleId !== expected.bundleId || observed.native.executableSha256 !== expected.nativeSha256
    || !pid(observed.native.pid) || !observed.native.processExecutableMatches) fail('NATIVE_MISMATCH');
  if (!Array.isArray(observed?.schemeBundles)) fail('SCHEME_INVENTORY_MISSING', true);
  else if (observed.schemeBundles.length !== 1 || observed.schemeBundles[0] !== expected.bundleId) fail('SCHEME_CONFLICT');
  const metro = observed?.metro, web = observed?.web;
  if (!metro) fail('METRO_UNAVAILABLE', true);
  else if (metro.origin !== expected.metroOrigin || metro.status !== 'packager-status:running' || !pid(metro.pid)
    || metro.sourceRoot !== expected.appSourceRoot || metro.bodySha256 !== expected.jsSha256) fail('METRO_SOURCE_MISMATCH');
  if (!web) fail('WEB_UNAVAILABLE', true);
  else if (web.origin !== expected.webOrigin || !pid(web.pid) || web.sourceRoot !== expected.webSourceRoot
    || !web.buildId || web.bodySha256 !== expected.webArtifactSha256 || web.artifactSha256 !== expected.webArtifactSha256
    || web.health?.success !== true || web.health.data?.service !== 'orbit-runtime' || web.health.data?.status !== 'ok' || web.health.data?.mode !== 'live') fail('WEB_SOURCE_MISMATCH');
  const receipt = observed?.runtimeReceipt;
  if (!receipt) fail('ACTUAL_RUNTIME_RECEIPT_REQUIRED', true);
  else {
    const age = Date.now() - Date.parse(receipt.observedAt);
    if (!Number.isFinite(age) || age < -30_000 || age > 300_000) fail('RUNTIME_RECEIPT_STALE', true);
    if (receipt.udid !== expected.udid || receipt.bundleId !== expected.bundleId || receipt.nativePid !== observed?.native?.pid
      || receipt.executableSha256 !== expected.nativeSha256 || receipt.loadedJsOrigin !== expected.metroOrigin
      || receipt.loadedJsSha256 !== expected.jsSha256 || receipt.apiOrigin !== expected.webOrigin || receipt.actorDigest !== expected.actorDigest) fail('RUNTIME_RECEIPT_MISMATCH');
  }
  return {
    status: failures.some(item => !item.blocked) ? 'failed' : failures.length ? 'blocked' : 'evidence-consistent',
    scope: 'identity-only', actualAcceptancePassed: false,
    receiptTrust: 'operator-supplied; authenticity requires separate actual observation', failures,
    manifest: {udid: expected.udid, bundleId: observed?.native?.bundleId ?? null, containerPath: observed?.native?.containerPath ?? null,
      nativeSha256: observed?.native?.executableSha256 ?? null, schemeBundles: observed?.schemeBundles ?? [],
      metro: metro ? {origin: metro.origin, pid: metro.pid, sourceRoot: metro.sourceRoot, bodySha256: metro.bodySha256} : null,
      web: web ? {origin: web.origin, pid: web.pid, sourceRoot: web.sourceRoot, buildId: web.buildId, bodySha256: web.bodySha256, artifactSha256: web.artifactSha256} : null,
      actorDigest: expected.actorDigest, collectedAt: new Date().toISOString()},
  };
}

function checkedProbeUrl(value, expectedOrigin, kind) {
  const url = new URL(value);
  if (url.origin !== expectedOrigin || url.username || url.password || url.hash) throw Error('PROBE_TARGET_NOT_ALLOWED');
  if (kind === 'web' && (!/^\/_next\/static\/[A-Za-z0-9_.\/-]+\.js$/.test(url.pathname) || url.search || url.pathname.includes('..'))) throw Error('PROBE_TARGET_NOT_ALLOWED');
  if (kind === 'metro') {
    if (!/^\/[A-Za-z0-9_.\/-]+\.bundle$/.test(url.pathname) || url.pathname.includes('..')) throw Error('PROBE_TARGET_NOT_ALLOWED');
    for (const [key, value] of url.searchParams) {
      if (!['platform', 'dev', 'hot', 'lazy', 'minify', 'transform.engine', 'transform.bytecode', 'transform.routerRoot'].includes(key)
        || !/^[A-Za-z0-9_.\/-]+$/.test(value)) throw Error('PROBE_TARGET_NOT_ALLOWED');
    }
  }
  return url.href;
}

export async function collectRuntimeIdentity(config, dependencies = {}) {
  const {expected} = config;
  validateExpected(expected);
  const command = dependencies.command ?? ((file, args, options) => execFileSync(file, args, {encoding: 'utf8', timeout: 15_000, maxBuffer: 8 * 1024 * 1024, ...options}));
  const request = dependencies.request ?? fetch;
  const devices = JSON.parse(command('xcrun', ['simctl', 'list', 'devices', '--json']));
  const device = Object.values(devices.devices ?? {}).flat().find(value => value.udid === expected.udid) ?? null;
  // A missing device blocks the entire observation; never boot or select another.
  if (device?.state !== 'Booted') return {device};
  const metroUrl = checkedProbeUrl(config.metroBundleUrl, expected.metroOrigin, 'metro');
  const webUrl = checkedProbeUrl(config.webArtifactUrl, expected.webOrigin, 'web');
  if (![config.metroPid, config.webPid, config.nativePid].every(pid)
    || ![config.webArtifactPath, config.buildIdPath].every(value => typeof value === 'string' && isAbsolute(value))) throw Error('EXACT_PROCESS_AND_ARTIFACT_REQUIRED');
  const containerPath = command('xcrun', ['simctl', 'get_app_container', expected.udid, expected.bundleId, 'app']).trim();
  if (!isAbsolute(containerPath)) throw Error('NATIVE_NOT_INSTALLED');
  const info = JSON.parse(command('plutil', ['-convert', 'json', '-o', '-', join(containerPath, 'Info.plist')]));
  if (typeof info.CFBundleExecutable !== 'string' || !/^[A-Za-z0-9_-]+$/.test(info.CFBundleExecutable)) throw Error('INVALID_NATIVE_EXECUTABLE');
  const executablePath = join(containerPath, info.CFBundleExecutable);
  const nativeFiles = command('lsof', ['-a', '-p', String(config.nativePid), '-d', 'txt', '-Fn']);
  const appsPlist = command('xcrun', ['simctl', 'listapps', expected.udid]);
  const apps = JSON.parse(command('plutil', ['-convert', 'json', '-o', '-', '-'], {input: appsPlist}));
  const schemeBundles = Object.entries(apps).filter(([, app]) => app.CFBundleURLTypes?.some(type => type.CFBundleURLSchemes?.includes(expected.scheme))).map(([id]) => id).sort();
  const processRoot = (processId, baseUrl) => {
    const listening = command('lsof', ['-nP', '-a', '-p', String(processId), '-iTCP:' + new URL(baseUrl).port, '-sTCP:LISTEN', '-Fp']);
    if (!listening.split('\n').includes('p' + processId)) throw Error('PROCESS_NOT_LISTENING');
    const cwd = command('lsof', ['-a', '-p', String(processId), '-d', 'cwd', '-Fn']).split('\n').find(line => line.startsWith('n'))?.slice(1);
    if (!cwd) throw Error('PROCESS_SOURCE_UNKNOWN');
    return cwd;
  };
  const readProbe = async url => {
    const response = await request(url, {redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15_000)});
    if (!response.ok) throw Error('PROBE_HTTP_FAILURE');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 64 * 1024 * 1024) throw Error('PROBE_TOO_LARGE');
    return bytes;
  };
  const metroSourceRoot = processRoot(config.metroPid, expected.metroOrigin), webSourceRoot = processRoot(config.webPid, expected.webOrigin);
  const buildId = (await readFile(config.buildIdPath, 'utf8')).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(buildId) || !new URL(webUrl).pathname.startsWith('/_next/static/' + buildId + '/')) throw Error('WEB_BUILD_ARTIFACT_MISMATCH');
  const [nativeBytes, artifactBytes, metroBytes, webBytes, statusBytes, healthBytes] = await Promise.all([
    readFile(executablePath), readFile(config.webArtifactPath), readProbe(metroUrl), readProbe(webUrl),
    readProbe(expected.metroOrigin + '/status'), readProbe(expected.webOrigin + '/api/health'),
  ]);
  const rawHealth = JSON.parse(healthBytes.toString('utf8'));
  return {device: {udid: device.udid, state: device.state},
    native: {bundleId: info.CFBundleIdentifier, containerPath, executableSha256: digest(nativeBytes), pid: config.nativePid, processExecutableMatches: nativeFiles.split('\n').includes('n' + executablePath)}, schemeBundles,
    metro: {origin: expected.metroOrigin, pid: config.metroPid, sourceRoot: metroSourceRoot, status: statusBytes.toString('utf8').trim(), bodySha256: digest(metroBytes)},
    web: {origin: expected.webOrigin, pid: config.webPid, sourceRoot: webSourceRoot, buildId, artifactSha256: digest(artifactBytes), bodySha256: digest(webBytes), health: {success: rawHealth.success, data: {service: rawHealth.data?.service, status: rawHealth.data?.status, mode: rawHealth.data?.mode}}},
    runtimeReceipt: config.runtimeReceipt ?? null};
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== '--config' || !isAbsolute(argv[1])) throw Error('INVALID_ARGUMENTS');
  const config = JSON.parse(await readFile(argv[1], 'utf8'));
  const result = verifyRuntimeIdentity(config.expected, await collectRuntimeIdentity(config));
  console.log(JSON.stringify(result, null, 2));
  // Even consistent evidence is not an automatically granted native SC PASS.
  return result.status === 'evidence-consistent' ? 0 : result.status === 'blocked' ? 2 : 1;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(code => {process.exitCode = code;}).catch(error => {
    const code = /^[A-Z][A-Z0-9_]+$/.test(error?.message) ? error.message : 'PREREQUISITE_UNAVAILABLE';
    console.error(JSON.stringify({status: 'failed', code, actualAcceptancePassed: false}));
    process.exitCode = 1;
  });
}
