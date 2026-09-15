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
import { access, readdir, stat, lstat, readlink, realpath, mkdtemp, mkdir, chmod, readFile, symlink, rm } from 'node:fs/promises';
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
    return { path, oid: match[2], gitMode: match[1] };
  });
  if (!entries.length) throw new Error('EMPTY_ARCHIVE');
  return entries;
}

async function verifySnapshot(state) {
  const seen = new Set();
  const visit = async relative => {
    const expected = state.manifest.get(relative);
    if (!expected) throw new Error('SNAPSHOT_EXTRA_PATH');
    const path = join(state.directory, relative); const actual = await lstat(path);
    seen.add(relative);
    if (expected.type === 'link') {
      if (!actual.isSymbolicLink() || await readlink(path) !== state.dependency || await realpath(path) !== state.dependency || !(await stat(state.dependency)).isDirectory()) throw new Error('SNAPSHOT_LINK_CHANGED');
      return; // Never enumerate or chmod dependency targets.
    }
    if ((actual.mode & 0o7777) !== expected.mode) throw new Error('SNAPSHOT_MODE_CHANGED');
    if (expected.type === 'directory') {
      if (!actual.isDirectory()) throw new Error('SNAPSHOT_TYPE_CHANGED');
      for (const name of await readdir(path)) await visit(relative ? `${relative}/${name}` : name);
    } else {
      if (!actual.isFile() || actual.nlink !== 1) throw new Error('SNAPSHOT_TYPE_CHANGED');
      const bytes = await readFile(path);
      if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== expected.oid) throw new Error('SNAPSHOT_BLOB_CHANGED');
    }
  };
  await visit('');
  if (seen.size !== state.manifest.size) throw new Error('SNAPSHOT_MISSING_PATH');
}

async function unlockOwnedDirectories(path) {
  const entry = await lstat(path);
  if (!entry.isDirectory()) return; // Includes node_modules and unexpected symlinks: do not follow them.
  await chmod(path, 0o700);
  for (const name of await readdir(path)) await unlockOwnedDirectories(join(path, name));
}

// Protects against mistakes, parallel work and persistent suite self-modification.
// This is not an OS sandbox against an active same-UID attacker unlocking and restoring bytes/modes between checks.
export function createSourceSnapshot(web, app, operations = {}) {
  let source; let active; let prepared = false; let busy = false; let invalid = false; let closed = false;
  const states = new Map();
  const dispose = async state => {
    if (!state || state.removed) return;
    if (!(await lstat(state.directory)).isDirectory() || await realpath(state.directory) !== state.directory) throw new Error('SNAPSHOT_ROOT_CHANGED');
    await unlockOwnedDirectories(state.directory);
    await (operations.remove ?? rm)(state.directory, { recursive: true, force: true });
    state.removed = true;
  };
  const build = async name => {
    const prefix = `repos/${name === 'web' ? 'orbits' : 'orbit-app'}`;
    const entries = source.entries.filter(entry => entry.path.startsWith(`${prefix}/`));
    if (!entries.length) throw new Error('EMPTY_SUITE_ARCHIVE');
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'orbit-sync-snapshot-')));
    const tree = join(directory, 'tree');
    const state = { directory, tree, root: join(tree, prefix), dependency: source.dependencies[name], removed: false, manifest: new Map([['', { type: 'directory', mode: 0o700 }]]) };
    states.set(name, state); active = state;
    await chmod(directory, 0o700); await mkdir(tree, { mode: 0o700 });
    const archive = join(directory, 'source.tar');
    // Each suite archives only its own subtree from the same exact SHA, never a sibling suite tree.
    await (operations.archive ?? command)(source.git, ['archive', '--format=tar', `--output=${archive}`, source.sha, '--', prefix], { cwd: source.top });
    await (operations.extract ?? command)('/usr/bin/tar', ['-xf', archive, '-C', tree]);
    for (const entry of entries) {
      const relative = `tree/${entry.path}`; const path = join(directory, relative);
      const actual = await lstat(path);
      if (!actual.isFile() || actual.nlink !== 1) throw new Error('ARCHIVE_TYPE_MISMATCH');
      const bytes = await readFile(path);
      if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== entry.oid) throw new Error('ARCHIVE_BLOB_MISMATCH');
      // Both allowed Git regular modes normalize to 0400; original mode stays in the manifest.
      state.manifest.set(relative, { type: 'file', mode: 0o400, oid: entry.oid, gitMode: entry.gitMode });
      for (let parent = dirname(relative); parent !== '.'; parent = dirname(parent)) state.manifest.set(parent, { type: 'directory', mode: 0o500 });
    }
    await rm(archive);
    await (operations.link ?? symlink)(state.dependency, join(state.root, 'node_modules'));
    state.manifest.set(`tree/${prefix}/node_modules`, { type: 'link' });
    const lock = operations.chmod ?? chmod;
    for (const [relative, entry] of state.manifest) if (entry.type === 'file') await lock(join(directory, relative), entry.mode);
    for (const [relative, entry] of [...state.manifest].sort((a, b) => b[0].length - a[0].length)) if (entry.type === 'directory' && relative) await lock(join(directory, relative), entry.mode);
    await verifySnapshot(state);
  };
  return Object.freeze({
    get directory() { return active?.directory; },
    get webRoot() { return states.get('web')?.root; },
    get appRoot() { return states.get('app')?.root; },
    async prepare() {
      if (source || closed) throw new Error('SNAPSHOT_ALREADY_STARTED');
      const sourceHash = await assertSourceTree(web, app);
      const git = await executable('git');
      const top = await realpath(command(git, ['rev-parse', '--show-toplevel'], { cwd: web }).trim());
      const sha = command(git, ['rev-parse', 'HEAD'], { cwd: web }).trim();
      if (hash(sha) !== sourceHash) throw new Error('SOURCE_HEAD_CHANGED');
      const entries = validateArchiveTree(command(git, ['ls-tree', '-rz', sha, '--', 'repos/orbits', 'repos/orbit-app'], { cwd: top }));
      const dependencies = {};
      for (const [original, name] of [[web, 'web'], [app, 'app']]) {
        const dependency = await realpath(join(original, 'node_modules'));
        if (!(await stat(dependency)).isDirectory()) throw new Error('INVALID_DEPENDENCIES');
        dependencies[name] = dependency;
      }
      source = { git, top, sha, entries, dependencies };
      await build('web');
      prepared = true;
      return { sourceHash };
    },
    async run(name, args, env, runner = runBounded) {
      if (!prepared || closed || busy || invalid || !['web', 'app'].includes(name)) throw new Error('INVALID_SNAPSHOT_RUN');
      busy = true;
      try {
        if (name === 'app' && !states.has('app')) { await dispose(states.get('web')); await build('app'); }
        const state = states.get(name);
        if (!state || state.removed) throw new Error('SUITE_SNAPSHOT_RETIRED');
        await verifySnapshot(state);
        let result;
        try { result = await runner(process.execPath, args, { cwd: state.root, env }); }
        finally { await verifySnapshot(state); }
        return { ...result, cwdHash: hash(state.root) };
      } catch (error) { invalid = true; throw error; }
      finally { busy = false; }
    },
    async close() {
      if (busy) throw new Error('SUITE_STILL_RUNNING');
      closed = true; let failed = false;
      for (const state of states.values()) try { await dispose(state); } catch { failed = true; }
      if (failed) throw new Error('SNAPSHOT_CLEANUP_FAILED');
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
      const { Client } = await import('pg');
      client = new Client({ ...target, password: () => target.password });
      client.on('error', () => {});
      await client.connect();
      databaseProbe = createDatabaseProbe(client, target);
      await databaseProbe.initialize();
      return { databaseHash: hash(`${target.host}:${target.port}/${target.database}`), sourceHash };
    },
    probe: () => databaseProbe.probe(),
    run: name => snapshot.run(name, ['--test', '--test-concurrency=1', '--test-reporter=tap', '--import', 'tsx', ...(name === 'app' ? ['--import', './tests/helpers/register-render-hooks.mjs'] : []), ...(name === 'web' ? WEB_FILES : APP_FILES)], name === 'web' ? env : childEnvironment(process.env), async (exe, args, options) => {
      await assertCheckout(options.cwd, name === 'web' ? [...WEB_FILES, 'tests/fixtures/note-mutation-worker.ts'] : [...APP_FILES, 'tests/helpers/register-render-hooks.mjs']);
      return runBounded(exe, args, options);
    }),
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
