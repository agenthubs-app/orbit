import type { LocalSyncDatabase, LocalSyncSqlValue } from "./local-sync-database";

const VAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OUTBOX_COLUMNS = [
  "mutation_id", "workspace_id", "domain_id", "kind", "record_id", "operation", "state", "request_json",
  "depends_on", "patch_json", "base_revision", "created_at", "retry_count", "next_retry_at", "last_error_code",
  "attempt_count", "first_attempt_at", "server_snapshot_json",
] as const;
const ALIAS_COLUMNS = ["workspace_id", "domain_id", "local_id", "canonical_id", "created_at", "expires_at"] as const;

type JsonRow = Record<string, string | number | null>;
interface VaultSnapshot {
  version: 1;
  outbox: JsonRow[];
  aliases: JsonRow[];
}
export interface VaultResult {
  status: "archived" | "empty" | "restored" | "expired";
  mutationCount: number;
  aliasCount: number;
}

export async function archivePendingWrites(input: {
  source: LocalSyncDatabase;
  vault: LocalSyncDatabase;
  identityDigest: string;
  now: string;
  hash: (value: string) => Promise<string>;
}): Promise<VaultResult> {
  validateIdentityDigest(input.identityDigest);
  const createdAt = parseTimestamp(input.now);
  const outbox = await input.source.all<JsonRow>(`SELECT ${OUTBOX_COLUMNS.join(",")} FROM sync_outbox ORDER BY workspace_id, domain_id, created_at, mutation_id`);
  const aliases = await input.source.all<JsonRow>(`SELECT ${ALIAS_COLUMNS.join(",")} FROM sync_aliases ORDER BY workspace_id, domain_id, local_id`);
  if (outbox.length === 0 && aliases.length === 0) return { status: "empty", mutationCount: 0, aliasCount: 0 };
  const snapshot: VaultSnapshot = { version: 1, outbox, aliases };
  const payload = JSON.stringify(snapshot);
  const fingerprint = await input.hash(payload);
  const expiresAt = new Date(createdAt + VAULT_TTL_MS).toISOString();
  await input.vault.execute(`CREATE TABLE IF NOT EXISTS pending_write_vault (
    id INTEGER PRIMARY KEY CHECK (id = 1), identity_digest TEXT NOT NULL, created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, fingerprint TEXT NOT NULL, payload_json TEXT NOT NULL
  )`);
  await input.vault.transaction(async () => {
    await input.vault.run("DELETE FROM pending_write_vault WHERE id = 1");
    await input.vault.run(`INSERT INTO pending_write_vault(id, identity_digest, created_at, expires_at, fingerprint, payload_json)
      VALUES(1, ?, ?, ?, ?, ?)`, [input.identityDigest, input.now, expiresAt, fingerprint, payload]);
    const saved = await input.vault.get<{ identity_digest: string; fingerprint: string; payload_json: string }>(
      "SELECT identity_digest, fingerprint, payload_json FROM pending_write_vault WHERE id = 1",
    );
    if (!saved || saved.identity_digest !== input.identityDigest || saved.fingerprint !== fingerprint ||
      await input.hash(saved.payload_json) !== fingerprint || saved.payload_json !== payload) {
      throw new Error("PENDING_VAULT_READBACK_MISMATCH");
    }
  });
  return { status: "archived", mutationCount: outbox.length, aliasCount: aliases.length };
}

export async function restorePendingWrites(input: {
  source: LocalSyncDatabase;
  vault: LocalSyncDatabase;
  identityDigest: string;
  now: string;
  hash: (value: string) => Promise<string>;
}): Promise<VaultResult> {
  validateIdentityDigest(input.identityDigest);
  parseTimestamp(input.now);
  await input.vault.execute(`CREATE TABLE IF NOT EXISTS pending_write_vault (
    id INTEGER PRIMARY KEY CHECK (id = 1), identity_digest TEXT NOT NULL, created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, fingerprint TEXT NOT NULL, payload_json TEXT NOT NULL
  )`);
  const row = await input.vault.get<{ identity_digest: string; expires_at: string; fingerprint: string; payload_json: string }>(
    "SELECT identity_digest, expires_at, fingerprint, payload_json FROM pending_write_vault WHERE id = 1",
  );
  if (!row || row.identity_digest !== input.identityDigest) return { status: "empty", mutationCount: 0, aliasCount: 0 };
  if (parseTimestamp(row.expires_at) <= parseTimestamp(input.now)) {
    await input.vault.run("DELETE FROM pending_write_vault WHERE id = 1");
    return { status: "expired", mutationCount: 0, aliasCount: 0 };
  }
  if (await input.hash(row.payload_json) !== row.fingerprint) throw new Error("PENDING_VAULT_FINGERPRINT_MISMATCH");
  const snapshot = parseSnapshot(row.payload_json);
  await input.source.transaction(async () => {
    for (const item of snapshot.outbox) {
      const values = OUTBOX_COLUMNS.map(column => item[column] ?? null) as LocalSyncSqlValue[];
      await input.source.run(`INSERT OR IGNORE INTO sync_outbox(${OUTBOX_COLUMNS.join(",")}) VALUES(${OUTBOX_COLUMNS.map(() => "?").join(",")})`, values);
    }
    for (const item of snapshot.aliases) {
      const values = ALIAS_COLUMNS.map(column => item[column] ?? null) as LocalSyncSqlValue[];
      await input.source.run(`INSERT OR IGNORE INTO sync_aliases(${ALIAS_COLUMNS.join(",")}) VALUES(${ALIAS_COLUMNS.map(() => "?").join(",")})`, values);
    }
    const mutationIds = snapshot.outbox.map(item => String(item.mutation_id));
    for (const mutationId of mutationIds) {
      const existing = await input.source.get("SELECT mutation_id FROM sync_outbox WHERE mutation_id = ?", [mutationId]);
      if (!existing) throw new Error("PENDING_VAULT_MUTATION_RESTORE_FAILED");
    }
  });
  // Keep the independently encrypted copy until the source transaction and row checks have succeeded.
  await input.vault.run("DELETE FROM pending_write_vault WHERE id = 1");
  return { status: "restored", mutationCount: snapshot.outbox.length, aliasCount: snapshot.aliases.length };
}

export async function isPendingWritesVaultExpired(input: {
  vault: LocalSyncDatabase;
  identityDigest: string;
  now: string;
}): Promise<boolean> {
  validateIdentityDigest(input.identityDigest);
  parseTimestamp(input.now);
  const row = await input.vault.get<{ identity_digest: string; expires_at: string }>(
    "SELECT identity_digest, expires_at FROM pending_write_vault WHERE id = 1",
  );
  return Boolean(row && row.identity_digest === input.identityDigest && parseTimestamp(row.expires_at) <= parseTimestamp(input.now));
}

export async function countPendingWritesInVault(input: {
  vault: LocalSyncDatabase;
  identityDigest: string;
  now: string;
  hash: (value: string) => Promise<string>;
}): Promise<number> {
  validateIdentityDigest(input.identityDigest);
  const now = parseTimestamp(input.now);
  const row = await input.vault.get<{ identity_digest: string; expires_at: string; fingerprint: string; payload_json: string }>(
    "SELECT identity_digest, expires_at, fingerprint, payload_json FROM pending_write_vault WHERE id = 1",
  );
  if (!row || row.identity_digest !== input.identityDigest || parseTimestamp(row.expires_at) <= now) return 0;
  if (await input.hash(row.payload_json) !== row.fingerprint) throw new Error("PENDING_VAULT_FINGERPRINT_MISMATCH");
  return parseSnapshot(row.payload_json).outbox.length;
}

function validateIdentityDigest(value: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new TypeError("identityDigest is invalid");
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError("timestamp is invalid");
  return parsed;
}

function parseSnapshot(value: string): VaultSnapshot {
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; } catch { throw new Error("PENDING_VAULT_PAYLOAD_INVALID"); }
  if (typeof parsed !== "object" || parsed === null || (parsed as { version?: unknown }).version !== 1 ||
    !Array.isArray((parsed as { outbox?: unknown }).outbox) || !Array.isArray((parsed as { aliases?: unknown }).aliases)) {
    throw new Error("PENDING_VAULT_PAYLOAD_INVALID");
  }
  const snapshot = parsed as VaultSnapshot;
  if (snapshot.outbox.some(item => typeof item !== "object" || item === null || typeof item.mutation_id !== "string") ||
    snapshot.aliases.some(item => typeof item !== "object" || item === null || typeof item.local_id !== "string")) {
    throw new Error("PENDING_VAULT_PAYLOAD_INVALID");
  }
  return snapshot;
}
