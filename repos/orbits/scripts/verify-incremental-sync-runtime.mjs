/** Sprint 0033 automated preparation only; production service and Simulator remain pending.
 * Run with Node 22 from this Web checkout. Inputs (environment only):
 * ORBIT_SYNC_ACCEPTANCE_DATABASE_URL: literal 127.0.0.1, explicit port/user,
 * database orbit_sync_acceptance_<suffix>, empty and already marked by its owner:
 * COMMENT ON DATABASE <name> IS 'orbit:sprint-0033:disposable'.
 * ORBIT_SYNC_ACCEPTANCE_APP_ROOT: absolute App directory at the same Git HEAD.
 * No .env loading, provider calls, credential files, service lifecycle or Simulator control.
 * Child diagnostics stay in bounded memory and are discarded, including on failure.
 */
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { access, readdir, stat, realpath, mkdtemp, mkdir, chmod, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

export function databaseTarget(value) {
  if (typeof value !== 'string' || value.length > 2048 || !/^postgresql:\/\/[a-zA-Z0-9_-]+(?::[^@\s/?#]*)?@127\.0\.0\.1:[1-9][0-9]{0,4}\/orbit_sync_acceptance_[a-z0-9_]{1,40}$/.test(value)) throw new Error('UNSAFE_DATABASE');
  const parsed = new URL(value);
  const port = Number(parsed.port);
  if (port < 1 || port > 65535) throw new Error('UNSAFE_DATABASE');
  return { host: '127.0.0.1', port, database: parsed.pathname.slice(1), user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), ssl: false, connectionTimeoutMillis: 2000, query_timeout: 5000, statement_timeout: 4000 };
}

async function assertDatabaseIdentity(client, target) {
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`select current_database() as database,
      current_user, (select pg_get_userbyid(datdba) from pg_database where datname = current_database()) as owner,
      host(inet_server_addr()) as host, inet_server_port() as port,
      shobj_description((select oid from pg_database where datname = current_database()), 'pg_database') as marker,
      (select datacl is null from pg_database where datname = current_database()) as default_acl,
      (select count(*)::integer from pg_db_role_setting where setdatabase = 0 or setdatabase = (select oid from pg_database where datname = current_database())) as settings,
      (select count(*)::integer from pg_parameter_acl) as parameter_acls,
      (select count(*)::integer from pg_largeobject_metadata) as large_objects`);
    const row = result.rows[0];
    if (row?.database !== target.database || row.host !== target.host || row.port !== target.port || row.marker !== 'orbit:sprint-0033:disposable' || row.default_acl !== true || row.settings !== 0 || row.parameter_acls !== 0 || row.large_objects !== 0 || typeof row.owner !== 'string' || row.current_user !== row.owner) throw new Error('UNSAFE_DATABASE');
  } finally { await client.query('ROLLBACK'); }
}

export async function probeDatabase(client, target, compareSchemas) {
  await assertDatabaseIdentity(client, target);
  if (typeof compareSchemas !== 'function' || await compareSchemas() !== true) throw new Error('SCHEMA_NOT_EMPTY');
}

async function executable(name) {
  for (const directory of (process.env.PATH ?? '/usr/bin:/bin').split(':').filter(isAbsolute)) {
    try { const path = await realpath(join(directory, name)); await access(path, 1); if ((await stat(path)).isFile()) return path; } catch { /* Try the next fixed PATH entry. */ }
  }
  throw new Error('MISSING_EXECUTABLE');
}

function command(exe, args, options = {}) {
  const result = spawnSync(exe, args, { env: childEnvironment(process.env), encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.status !== 0 || result.error) throw new Error('COMMAND_FAILED');
  return result.stdout;
}

// Only pg_dump's random psql restriction keys are normalized. DDL and ACLs stay literal.
export function normalizeSchemaDump(dump) {
  if (!dump.includes('-- PostgreSQL database dump complete')) throw new Error('INCOMPLETE_DUMP');
  return dump.replace(/^\\(?:un)?restrict [a-zA-Z0-9]+\r?\n/gm, '');
}

export function createDatabaseProbe(client, target, operations = {}) {
  const control = `orbit_sync_acceptance_control_${randomUUID().replaceAll('-', '')}`;
  const marker = `orbit:sprint-0033:control:${randomUUID()}`;
  let created = false; let identity; let dumpExe; let baseline;
  const dump = async (database, privileges) => {
    const args = ['--schema-only', '--no-owner', ...(!privileges ? ['--no-privileges'] : []), '--no-password', '--host', target.host, '--port', String(target.port), '--username', target.user, '--dbname', database];
    const output = await (operations.dump ?? command)(dumpExe, args, { env: { ...childEnvironment(process.env), PGPASSWORD: target.password ?? '' } });
    return normalizeSchemaDump(output);
  };
  const checkControl = async () => {
    const result = await client.query('select oid, pg_get_userbyid(datdba) as owner, current_user, shobj_description(oid, \'pg_database\') as marker from pg_database where datname = $1', [control]);
    const row = result.rows[0];
    if (!identity || row?.oid !== identity || row.owner !== row.current_user || row.marker !== marker) throw new Error('CONTROL_OWNERSHIP_UNPROVEN');
  };
  return {
    async initialize() {
      await assertDatabaseIdentity(client, target);
      dumpExe = await executable('pg_dump');
      await client.query(`create database "${control}" template template0`); created = true;
      const result = await client.query('select oid from pg_database where datname = $1', [control]); identity = result.rows[0]?.oid;
      await client.query(`comment on database "${control}" is '${marker}'`);
      await checkControl();
      baseline = [await dump(control, false), await dump(control, true)];
    },
    async probe() {
      await probeDatabase(client, target, async () => {
        await checkControl();
        return !!baseline && await dump(target.database, false) === baseline[0] && await dump(target.database, true) === baseline[1];
      });
    },
    async close() {
      if (!created) return;
      await checkControl();
      await (operations.drop ?? (sql => client.query(sql)))(`drop database "${control}"`);
      created = false;
    },
  };
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

export function validateArchiveTree(listing) {
  const entries = listing.split('\0').filter(Boolean).map(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/s.exec(entry);
    if (!match) throw new Error('UNSAFE_ARCHIVE_ENTRY');
    const path = match[3]; const parts = path.split('/');
    if (!/^repos\/(orbits|orbit-app)\//.test(path) || /[\\\x00-\x1f\x7f]/.test(path) || parts.some(part => ['', '.', '..', '.git', 'node_modules'].includes(part))) throw new Error('UNSAFE_ARCHIVE_PATH');
    return { path, oid: match[2] };
  });
  if (!entries.length) throw new Error('EMPTY_ARCHIVE');
  return entries;
}

export function createSourceSnapshot(web, app, operations = {}) {
  let directory; let tree; let prepared = false; let removed = false;
  return Object.freeze({
    get directory() { return directory; },
    get webRoot() { return tree && join(tree, 'repos/orbits'); },
    get appRoot() { return tree && join(tree, 'repos/orbit-app'); },
    async prepare() {
      if (directory) throw new Error('SNAPSHOT_ALREADY_STARTED');
      const sourceHash = await assertSourceTree(web, app);
      const git = await executable('git');
      const top = await realpath(command(git, ['rev-parse', '--show-toplevel'], { cwd: web }).trim());
      const sha = command(git, ['rev-parse', 'HEAD'], { cwd: web }).trim();
      if (hash(sha) !== sourceHash) throw new Error('SOURCE_HEAD_CHANGED');
      const entries = validateArchiveTree(command(git, ['ls-tree', '-rz', sha, '--', 'repos/orbits', 'repos/orbit-app'], { cwd: top }));
      directory = await realpath(await mkdtemp(join(tmpdir(), 'orbit-sync-snapshot-'))); await chmod(directory, 0o700);
      tree = join(directory, 'tree'); await mkdir(tree, { mode: 0o700 });
      const archive = join(directory, 'source.tar');
      // No external archive input. Reject links and unsafe names from the exact Git tree before extraction.
      await (operations.archive ?? command)(git, ['archive', '--format=tar', `--output=${archive}`, sha, '--', 'repos/orbits', 'repos/orbit-app'], { cwd: top });
      await (operations.extract ?? command)('/usr/bin/tar', ['-xf', archive, '-C', tree]);
      for (const entry of entries) {
        const bytes = await readFile(join(tree, entry.path));
        if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== entry.oid) throw new Error('ARCHIVE_BLOB_MISMATCH');
      }
      await rm(archive);
      for (const [source, name] of [[web, 'orbits'], [app, 'orbit-app']]) {
        const dependency = await realpath(join(source, 'node_modules'));
        if (!(await stat(dependency)).isDirectory()) throw new Error('INVALID_DEPENDENCIES');
        await (operations.link ?? symlink)(dependency, join(tree, 'repos', name, 'node_modules'));
      }
      prepared = true;
      return { sourceHash };
    },
    async run(name, args, env, runner = runBounded) {
      if (!prepared || removed || !['web', 'app'].includes(name)) throw new Error('INVALID_SNAPSHOT_RUN');
      const cwd = join(tree, 'repos', name === 'web' ? 'orbits' : 'orbit-app');
      if (await realpath(cwd) !== cwd) throw new Error('SNAPSHOT_CWD_CHANGED');
      return { ...await runner(process.execPath, args, { cwd, env }), cwdHash: hash(cwd) };
    },
    async close() {
      if (directory && !removed) { await (operations.remove ?? rm)(directory, { recursive: true, force: true }); removed = true; }
    },
  });
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
      if (result.cwdHash !== undefined) {
        if (!/^[a-f0-9]{64}$/.test(result.cwdHash)) throw new Error('INVALID_CWD_HASH');
        evidence[`${name}CwdHash`] = result.cwdHash;
      }
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
  let client; let target; let env; let appRoot; let snapshot; let databaseProbe;
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
      snapshot = createSourceSnapshot(root, appRoot);
      const { sourceHash } = await snapshot.prepare();
      await assertCheckout(snapshot.webRoot, [...WEB_FILES, 'tests/fixtures/note-mutation-worker.ts']);
      await assertCheckout(snapshot.appRoot, [...APP_FILES, 'tests/helpers/register-render-hooks.mjs']);
      const { Client } = await import('pg');
      client = new Client({ ...target, password: () => target.password });
      client.on('error', () => {});
      await client.connect();
      databaseProbe = createDatabaseProbe(client, target);
      await databaseProbe.initialize();
      return { databaseHash: hash(`${target.host}:${target.port}/${target.database}`), sourceHash };
    },
    probe: () => databaseProbe.probe(),
    run: name => snapshot.run(name, ['--test', '--test-concurrency=1', '--test-reporter=tap', '--import', 'tsx', ...(name === 'app' ? ['--import', './tests/helpers/register-render-hooks.mjs'] : []), ...(name === 'web' ? WEB_FILES : APP_FILES)], name === 'web' ? env : childEnvironment(process.env)),
    close: async () => {
      let failed = false;
      for (const close of [() => databaseProbe?.close(), () => client?.end(), () => snapshot?.close()]) {
        try { await close(); } catch { failed = true; }
      }
      if (env) { delete env.ORBIT_SYNC_TEST_DATABASE_URL; delete env.ORBIT_TASKS_TEST_DATABASE_URL; }
      if (target) target.password = '';
      if (failed) throw new Error('CLEANUP_FAILED');
    },
  });
  console.log(JSON.stringify(evidence));
  if (!evidence.pass) process.exitCode = 1;
}
if (process.argv[1] && await realpath(process.argv[1]).catch(() => '') === fileURLToPath(import.meta.url)) await main();
