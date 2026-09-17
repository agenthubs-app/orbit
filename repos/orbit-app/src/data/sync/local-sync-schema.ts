export const LOCAL_SYNC_SCHEMA_VERSION = 2;

export const LOCAL_SYNC_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS legacy_api_snapshots (
    path TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    status INTEGER NOT NULL,
    synced_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_records (
    workspace_id TEXT NOT NULL,
    domain_id TEXT NOT NULL,
    authorization_epoch TEXT NOT NULL,
    kind TEXT NOT NULL,
    record_id TEXT NOT NULL,
    revision TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    payload_json TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 0),
    payload_hash TEXT,
    generation TEXT NOT NULL DEFAULT '',
    visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
    sync_state TEXT NOT NULL CHECK (sync_state IN (
      'synced', 'pending', 'conflicted', 'failed'
    )),
    ai_visibility TEXT NOT NULL CHECK (ai_visibility IN (
      'available_when_synced', 'excluded'
    )),
    PRIMARY KEY (workspace_id, domain_id, authorization_epoch, record_id),
    CHECK (deleted_at IS NULL OR payload_json IS NULL)
  )`,
  `CREATE INDEX IF NOT EXISTS sync_records_ordered
    ON sync_records (workspace_id, domain_id, authorization_epoch, updated_at DESC, record_id ASC)`,
  `CREATE TABLE IF NOT EXISTS sync_cursors (
    workspace_id TEXT NOT NULL,
    domain_id TEXT NOT NULL,
    authorization_epoch TEXT NOT NULL,
    cursor TEXT NOT NULL,
    last_successful_sync_at TEXT NOT NULL,
    bootstrap_state TEXT NOT NULL CHECK (bootstrap_state IN ('pending', 'complete')),
    completeness TEXT NOT NULL CHECK (completeness IN ('partial', 'complete')),
    generation TEXT NOT NULL,
    PRIMARY KEY (workspace_id, domain_id, authorization_epoch)
  )`,
  `CREATE TABLE IF NOT EXISTS local_read_assets (
    workspace_id TEXT NOT NULL, domain_id TEXT NOT NULL, authorization_epoch TEXT NOT NULL,
    asset_id TEXT NOT NULL, record_id TEXT NOT NULL, manifest_json TEXT NOT NULL,
    PRIMARY KEY (workspace_id, domain_id, authorization_epoch, asset_id)
  )`,
  `CREATE TABLE IF NOT EXISTS local_read_index (
    workspace_id TEXT NOT NULL, domain_id TEXT NOT NULL, authorization_epoch TEXT NOT NULL,
    record_id TEXT NOT NULL, text_value TEXT NOT NULL,
    PRIMARY KEY (workspace_id, domain_id, authorization_epoch, record_id)
  )`,
  `CREATE TABLE IF NOT EXISTS local_read_scope_state (
    workspace_id TEXT NOT NULL, domain_id TEXT NOT NULL, authorization_epoch TEXT NOT NULL,
    readable INTEGER NOT NULL CHECK (readable IN (0, 1)),
    PRIMARY KEY (workspace_id, domain_id, authorization_epoch)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_outbox (
    mutation_id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN (
      'contact',
      'note',
      'task',
      'relationship_followup',
      'personal_schedule',
      'inbox_item'
    )),
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    patch_json TEXT,
    base_revision TEXT,
    created_at TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    next_retry_at TEXT,
    last_error_code TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS sync_outbox_ordered
    ON sync_outbox (workspace_id, created_at ASC, mutation_id ASC)`,
  `CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`,
] as const;
