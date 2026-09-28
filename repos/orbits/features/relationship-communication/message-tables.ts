import { SYNC_WRITE_LOCK_KEY_SQL, SYNC_WRITE_LOCK_SETTING } from "../sync/commit-order-lock";
import { SYNC_RELATIONSHIP_OWNER_GUARD_SQL } from "../sync/owner-guard";

/**
 * Sprint 0109 (message plan M2): relationship messaging moves out of the
 * universal orbit_records table into three dedicated tables.
 *
 *   relationship_conversations         one row per conversation; the former
 *                                      binding is merged in (status,
 *                                      qualification version, revocation)
 *   relationship_conversation_members  one row per participant; the former
 *                                      read marker is merged in (read_seq,
 *                                      unread_count), and the inbox index
 *                                      (account, last_message_at) lives here
 *   relationship_messages              (conversation, seq) primary key; the
 *                                      message id stays the digest of
 *                                      (conversation, sender, request id) and
 *                                      is unique, which is the send dedupe
 *
 * Invitations and reply drafts stay in orbit_records. Revoked conversations
 * keep every row (status 'revoked', members 'left'); messages are never deleted.
 *
 * sync_revision (for 0119, messages on the device): the three tables draw from
 * the same sequence as orbit_records and keep the same commit-order guarantee
 * as sprint 0108. Every insert/update must hold the transaction-scoped
 * commit-order advisory lock; the trigger refuses an unlocked write with
 * SYNC_WRITE_LOCK_REQUIRED (55P03), exactly like the strict orbit_records
 * trigger. The lock key is the orbit_records one, so revisions across all sync
 * tables become visible in the order they were taken.
 *
 * Sprint 0119: two sync indexes and the owner/identity guard
 * (SYNC_RELATIONSHIP_OWNER_GUARD_SQL): the message sync domains derive their
 * owner from the member row, so no row may move or come back from 'left'.
 *
 * Idempotent: every statement is "if not exists" / "or replace".
 */
export const RELATIONSHIP_MESSAGE_TABLES = {
  conversations: "relationship_conversations",
  members: "relationship_conversation_members",
  messages: "relationship_messages",
} as const;

export const RELATIONSHIP_MESSAGE_SCHEMA_SQL = `
create sequence if not exists orbit_records_sync_revision_seq;

create table if not exists relationship_conversations (
  workspace_id text not null,
  conversation_id text collate "C" not null,
  inviter_account_id text not null,
  invitee_account_id text not null,
  inviter_contact_id text not null,
  status text not null check (status in ('active', 'revoked')),
  qualification_version text not null,
  revoked_at timestamptz,
  revoked_by_account_id text,
  last_message_seq bigint not null default 0 check (last_message_seq >= 0),
  last_message_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  sync_revision bigint not null,
  primary key (workspace_id, conversation_id),
  unique (workspace_id, inviter_account_id, inviter_contact_id),
  check (inviter_account_id <> invitee_account_id)
);

create table if not exists relationship_conversation_members (
  workspace_id text not null,
  conversation_id text collate "C" not null,
  account_id text not null,
  display_name text not null,
  read_seq bigint not null default 0 check (read_seq >= 0),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz not null,
  state text not null default 'active' check (state in ('active', 'left')),
  updated_at timestamptz not null,
  sync_revision bigint not null,
  primary key (workspace_id, conversation_id, account_id),
  foreign key (workspace_id, conversation_id) references relationship_conversations (workspace_id, conversation_id)
);

-- "My conversations, newest first, 20 at a time" walks only the caller's rows.
create index if not exists relationship_members_inbox_idx
  on relationship_conversation_members (workspace_id, account_id, last_message_at desc, conversation_id)
  where state = 'active';

create table if not exists relationship_messages (
  workspace_id text not null,
  conversation_id text collate "C" not null,
  seq bigint not null check (seq > 0),
  message_id text collate "C" not null,
  sender_account_id text not null,
  sender_display_name text not null,
  body text not null check (char_length(body) between 1 and 10000),
  sent_at timestamptz not null,
  qualification_version text not null,
  request_id text not null,
  sync_revision bigint not null,
  primary key (workspace_id, conversation_id, seq),
  unique (workspace_id, message_id),
  foreign key (workspace_id, conversation_id) references relationship_conversations (workspace_id, conversation_id)
);

-- Cross-conversation keysets by send time (notification materialization and
-- discovery scan) stay inside the caller's conversations.
create index if not exists relationship_messages_sent_idx
  on relationship_messages (workspace_id, conversation_id, sent_at, message_id);

-- Sprint 0119 (0109 report 9.6): the message sync domains read an account's
-- member rows by revision and each conversation's messages by revision.
create index if not exists relationship_members_sync_idx
  on relationship_conversation_members (workspace_id, account_id, sync_revision);
create index if not exists relationship_messages_sync_idx
  on relationship_messages (workspace_id, conversation_id, sync_revision);

create unique index if not exists relationship_conversations_sync_revision_uidx on relationship_conversations (sync_revision);
create unique index if not exists relationship_members_sync_revision_uidx on relationship_conversation_members (sync_revision);
create unique index if not exists relationship_messages_sync_revision_uidx on relationship_messages (sync_revision);

create or replace function relationship_messaging_assign_sync_revision()
returns trigger
language plpgsql
as $$
begin
  if current_setting('${SYNC_WRITE_LOCK_SETTING}', true)
    is distinct from (${SYNC_WRITE_LOCK_KEY_SQL})::text then
    raise exception 'SYNC_WRITE_LOCK_REQUIRED'
      using errcode = '55P03';
  end if;
  new.sync_revision := nextval('orbit_records_sync_revision_seq'::regclass);
  return new;
end;
$$;

create or replace trigger relationship_conversations_sync_revision_trigger
  before insert or update on relationship_conversations
  for each row execute function relationship_messaging_assign_sync_revision();
create or replace trigger relationship_members_sync_revision_trigger
  before insert or update on relationship_conversation_members
  for each row execute function relationship_messaging_assign_sync_revision();
create or replace trigger relationship_messages_sync_revision_trigger
  before insert or update on relationship_messages
  for each row execute function relationship_messaging_assign_sync_revision();
${SYNC_RELATIONSHIP_OWNER_GUARD_SQL}`;

export interface RelationshipMessageMigrationClient {
  query: (text: string) => Promise<unknown>;
}

export async function runRelationshipMessageMigrations(client: RelationshipMessageMigrationClient): Promise<void> {
  await client.query(RELATIONSHIP_MESSAGE_SCHEMA_SQL);
}
