/** Sprint 0033 automated preparation only; production service and Simulator remain pending.
 * Run with Node 22 from this Web checkout. Inputs (environment only):
 * ORBIT_SYNC_ACCEPTANCE_DATABASE_URL: literal 127.0.0.1, explicit port/user,
 * database orbit_sync_acceptance_<suffix>, empty and already marked by its owner:
 * COMMENT ON DATABASE <name> IS 'orbit:sprint-0033:disposable'.
 * ORBIT_SYNC_ACCEPTANCE_APP_ROOT: absolute App directory at the same Git HEAD.
 * No .env loading, provider calls, credential files, service lifecycle or Simulator control.
 * Child diagnostics stay in bounded memory and are discarded, including on failure.
 */
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { access, readdir, stat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_FILES = Object.freeze([
  'tests/services/sync-migrations.test.ts',
  'tests/services/incremental-sync.test.ts',
  'tests/api/sync-route.test.ts',
  'tests/api/notes-routes.test.ts',
  'tests/services/notes-service.test.ts',
  'tests/services/task-mutations-postgres.test.ts',
  'tests/api/tasks-routes.test.ts',
  'tests/api/personal-schedule-routes.test.ts',
]);
export const APP_FILES = Object.freeze(['tests/incremental-sync-coordinator.test.ts', 'tests/sync-freshness.test.ts']);
const hash = value => createHash('sha256').update(value).digest('hex');
const failure = () => ({ passed: 0, failed: 1, skipped: 0, pass: false });

// Empty databases may contain only bootstrap objects in these system namespaces,
// the public namespace itself, and the standard plpgsql extension/language.
// Normal user-assigned OIDs start at 16384, including objects placed in pg_catalog.
const namespacedCatalogs = [
  ['pg_class', 'relnamespace'], ['pg_proc', 'pronamespace'], ['pg_type', 'typnamespace'],
  ['pg_operator', 'oprnamespace'], ['pg_opclass', 'opcnamespace'], ['pg_opfamily', 'opfnamespace'],
  ['pg_collation', 'collnamespace'], ['pg_conversion', 'connamespace'],
  ['pg_ts_config', 'cfgnamespace'], ['pg_ts_dict', 'dictnamespace'],
  ['pg_ts_parser', 'prsnamespace'], ['pg_ts_template', 'tmplnamespace'],
  ['pg_statistic_ext', 'stxnamespace'],
];
const userObjectCounts = [
  "select count(*) as count from pg_namespace where nspname not in ('public', 'pg_catalog', 'information_schema', 'pg_toast')",
  ...namespacedCatalogs.map(([catalog, namespace]) => `select count(*) from ${catalog} o join pg_namespace n on n.oid = o.${namespace} where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') or o.oid >= 16384`),
  "select count(*) from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql' or n.nspname <> 'pg_catalog'",
  "select count(*) from pg_language where lanname not in ('internal', 'c', 'sql', 'plpgsql')",
  ...['pg_cast', 'pg_transform'].map(catalog => `select count(*) from ${catalog} where oid >= 16384`),
  ...['pg_foreign_server', 'pg_foreign_data_wrapper', 'pg_user_mapping', 'pg_event_trigger',
    'pg_largeobject_metadata', 'pg_publication', 'pg_subscription', 'pg_default_acl'].map(catalog => `select count(*) from ${catalog}`),
].join(' union all ');

export function databaseTarget(value) {
  if (typeof value !== 'string' || value.length > 2048 || !/^postgresql:\/\/[a-zA-Z0-9_-]+(?::[^@\s/?#]*)?@127\.0\.0\.1:[1-9][0-9]{0,4}\/orbit_sync_acceptance_[a-z0-9_]{1,40}$/.test(value)) throw new Error('UNSAFE_DATABASE');
  const parsed = new URL(value);
  const port = Number(parsed.port);
  if (port < 1 || port > 65535) throw new Error('UNSAFE_DATABASE');
  return { host: '127.0.0.1', port, database: parsed.pathname.slice(1), user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), ssl: false, connectionTimeoutMillis: 2000, query_timeout: 5000, statement_timeout: 4000 };
}

export async function probeDatabase(client, target) {
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`select current_database() as database,
      current_user, (select pg_get_userbyid(datdba) from pg_database where datname = current_database()) as owner,
      host(inet_server_addr()) as host, inet_server_port() as port,
      shobj_description((select oid from pg_database where datname = current_database()), 'pg_database') as marker,
      (select sum(count)::integer from (${userObjectCounts}) counts) as objects`);
    const row = result.rows[0];
    if (row?.database !== target.database || row.host !== target.host || row.port !== target.port || row.marker !== 'orbit:sprint-0033:disposable' || row.objects !== 0 || typeof row.owner !== 'string' || row.current_user !== row.owner) throw new Error('UNSAFE_DATABASE');
  } finally { await client.query('ROLLBACK'); }
}

export function childEnvironment(source, databaseUrl) {
  const env = { PATH: source.PATH ?? '/usr/bin:/bin', LANG: 'en_US.UTF-8', NODE_ENV: 'test', PGPASSFILE: '/dev/null' };
  if (databaseUrl) {
    env.ORBIT_SYNC_TEST_DATABASE_URL = databaseUrl;
    env.ORBIT_TASKS_TEST_DATABASE_URL = databaseUrl;
  }
  return env;
}

export function assertParentEnvironment(source) {
  if (Object.keys(source).some(key => key.startsWith('PG') && !(key === 'PGPASSFILE' && source[key] === '/dev/null') || key === 'NODE_OPTIONS')) throw new Error('AMBIENT_CONNECTION_CONFIG');
}

export async function assertCheckout(root, files) {
  if (!isAbsolute(root)) throw new Error('INVALID_CHECKOUT');
  if ((await readdir(root)).some(name => name === '.env' || name.startsWith('.env.') && !name.endsWith('.example') && !name.endsWith('.sample'))) throw new Error('ENV_FILE_PRESENT');
  for (const file of files) if (!(await stat(join(root, file))).isFile()) throw new Error('MISSING_TEST');
}

export async function assertSourceTree(webRoot, appRoot) {
  const git = (cwd, args) => {
    const result = spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd, env: childEnvironment(process.env), encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
    if (result.status !== 0 || result.error) throw new Error('INVALID_SOURCE_TREE');
    return result.stdout.trim();
  };
  const web = await realpath(webRoot); const app = await realpath(appRoot);
  const webTop = await realpath(git(web, ['rev-parse', '--show-toplevel']));
  const appTop = await realpath(git(app, ['rev-parse', '--show-toplevel']));
  const webHead = git(web, ['rev-parse', 'HEAD']); const appHead = git(app, ['rev-parse', 'HEAD']);
  if (webTop !== appTop || web !== join(webTop, 'repos/orbits') || app !== join(webTop, 'repos/orbit-app') || !/^[a-f0-9]{40}$/.test(webHead) || webHead !== appHead) throw new Error('MISMATCHED_SOURCE_TREE');
  if (git(webTop, ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none', '--', 'repos/orbits', 'repos/orbit-app']) !== '') throw new Error('DIRTY_SOURCE_TREE');
  return hash(webHead);
}

export function summarizeTests(output, status) {
  const names = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
  const counts = {};
  for (const name of names) {
    const matches = [...output.matchAll(new RegExp(`^# ${name} ([0-9]+)$`, 'gm'))];
    if (matches.length !== 1 || !Number.isSafeInteger(Number(matches[0][1]))) return failure();
    counts[name] = Number(matches[0][1]);
  }
  return { passed: counts.pass, failed: counts.fail + counts.cancelled, skipped: counts.skipped + counts.todo,
    pass: status === 0 && counts.tests > 0 && counts.pass === counts.tests && counts.fail === 0 && counts.cancelled === 0 && counts.skipped === 0 && counts.todo === 0 };
}

export function runBounded(executable, args, { cwd, env, timeoutMs = 120000, maxBytes = 4 * 1024 * 1024 }) {
  return new Promise(done => {
    let output = ''; let bytes = 0; let aborted = false;
    const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const stop = () => { aborted = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } };
    const timer = setTimeout(stop, timeoutMs);
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > maxBytes) stop(); else output += chunk.toString(); });
    child.stderr.on('data', chunk => { bytes += chunk.length; if (bytes > maxBytes) stop(); });
    child.on('error', () => { aborted = true; });
    child.on('close', status => { clearTimeout(timer); const result = aborted ? failure() : summarizeTests(output, status); output = ''; done(result); });
  });
}

export async function executeAcceptance(deps) {
  const evidence = { version: 1, preflightPassed: false, suitesPassed: 0, testsPassed: 0, testsFailed: 0, testsSkipped: 0, cleanupPassed: false, simulatorPending: true, servicePending: true, pass: false };
  let started = false;
  try {
    const identities = await deps.prepare();
    if (!/^[a-f0-9]{64}$/.test(identities.databaseHash) || !/^[a-f0-9]{64}$/.test(identities.sourceHash)) throw new Error('INVALID_IDENTITIES');
    evidence.databaseHash = identities.databaseHash; evidence.sourceHash = identities.sourceHash;
    await deps.probe(); evidence.preflightPassed = true; started = true;
    for (const name of ['web', 'app']) {
      const result = await deps.run(name);
      evidence.testsPassed += result.passed; evidence.testsFailed += result.failed; evidence.testsSkipped += result.skipped;
      if (!result.pass || result.failed || result.skipped || result.passed < 1) break;
      evidence.suitesPassed++;
    }
  } catch { evidence.testsFailed++; }
  finally {
    let clean = true;
    if (started) try { await deps.probe(); } catch { clean = false; }
    try { await deps.close(); } catch { clean = false; }
    evidence.cleanupPassed = clean;
  }
  evidence.pass = evidence.preflightPassed && evidence.suitesPassed === 2 && evidence.testsFailed === 0 && evidence.testsSkipped === 0 && evidence.cleanupPassed;
  return evidence;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let client; let target; let env; let appRoot; let sourceHash;
  const evidence = await executeAcceptance({
    async prepare() {
      if (process.argv.length !== 2 || Number(process.versions.node.split('.')[0]) !== 22) throw new Error('INVALID_RUNTIME');
      assertParentEnvironment(process.env);
      const value = process.env.ORBIT_SYNC_ACCEPTANCE_DATABASE_URL;
      target = databaseTarget(value);
      appRoot = process.env.ORBIT_SYNC_ACCEPTANCE_APP_ROOT;
      if (!appRoot || !isAbsolute(appRoot)) throw new Error('INVALID_APP_ROOT');
      env = childEnvironment(process.env, value);
      await assertCheckout(root, [...WEB_FILES, 'tests/fixtures/note-mutation-worker.ts']);
      await assertCheckout(appRoot, [...APP_FILES, 'tests/helpers/register-render-hooks.mjs']);
      await access(join(root, 'node_modules/tsx/package.json'));
      await access(join(appRoot, 'node_modules/tsx/package.json'));
      sourceHash = await assertSourceTree(root, appRoot);
      const { Client } = await import('pg');
      client = new Client({ ...target, password: () => target.password });
      client.on('error', () => {});
      await client.connect();
      return { databaseHash: hash(`${target.host}:${target.port}/${target.database}`), sourceHash };
    },
    probe: async () => {
      if (await assertSourceTree(root, appRoot) !== sourceHash) throw new Error('SOURCE_TREE_CHANGED');
      await probeDatabase(client, target);
    },
    run: name => runBounded(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', '--import', 'tsx', ...(name === 'app' ? ['--import', './tests/helpers/register-render-hooks.mjs'] : []), ...(name === 'web' ? WEB_FILES : APP_FILES)], { cwd: name === 'web' ? root : appRoot, env: name === 'web' ? env : childEnvironment(process.env) }),
    close: async () => { if (client) await client.end(); if (env) { delete env.ORBIT_SYNC_TEST_DATABASE_URL; delete env.ORBIT_TASKS_TEST_DATABASE_URL; } if (target) target.password = ''; },
  });
  console.log(JSON.stringify(evidence));
  if (!evidence.pass) process.exitCode = 1;
}
if (process.argv[1] && await realpath(process.argv[1]).catch(() => '') === fileURLToPath(import.meta.url)) await main();
