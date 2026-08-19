import {
  EventExperienceError,
  type EventExperienceRepository,
  type EventExperienceQuestionSetInput,
  type EventExperienceSnapshot,
  type EventExperienceVersion,
  type EventExperienceHead,
  type PublishEventExperienceInput,
  type SaveEventExperienceDraftInput,
} from "../contract";
import {
  configurationHash,
  normalizeExperienceConfiguration,
  questionSetHash,
} from "../validation";
import type {
  EventOperationsPostgresRuntime,
  EventOperationsSqlExecutor,
} from "../../event-operations/storage/postgres-client";

interface HeadRow {
  draft_version: number | string | null;
  event_id: string;
  frozen_at: Date | string | null;
  published_at: Date | string | null;
  published_version: number | string | null;
  revision: number | string;
}

interface VersionRow {
  configuration: unknown;
  configuration_hash: string;
  created_at: Date | string;
  created_by_actor_id: string;
  event_id: string;
  experience_version: number | string;
}

interface MutableHead {
  dbNow: string;
  head: EventExperienceHead;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function integer(value: unknown, field: string, minimum = 0): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      `Experience ${field} is invalid.`,
    );
  }
  return parsed;
}

function timestamp(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      `Experience ${field} is invalid.`,
    );
  }
  return parsed.toISOString();
}

function rowVersion(row: VersionRow): EventExperienceVersion {
  if (!row.configuration || typeof row.configuration !== "object") {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "Stored event experience configuration is invalid.",
    );
  }
  return {
    configuration: normalizeExperienceConfiguration(
      row.configuration as Parameters<typeof normalizeExperienceConfiguration>[0],
    ),
    createdAt: timestamp(row.created_at, "created_at")!,
    createdByActorId: row.created_by_actor_id,
    eventId: row.event_id,
    hash: row.configuration_hash,
    version: integer(row.experience_version, "version", 1),
  };
}

function rowHead(row: HeadRow): EventExperienceHead {
  return {
    draftVersion:
      row.draft_version === null
        ? null
        : integer(row.draft_version, "draft_version", 1),
    eventId: row.event_id,
    frozenAt: timestamp(row.frozen_at, "frozen_at"),
    publishedAt: timestamp(row.published_at, "published_at"),
    publishedVersion:
      row.published_version === null
        ? null
        : integer(row.published_version, "published_version", 1),
    revision: integer(row.revision, "revision"),
  };
}

function conflict(
  eventId: string,
  expectedRevision: number | null,
  revision: number,
): never {
  throw new EventExperienceError(
    "EVENT_EXPERIENCE_VERSION_CONFLICT",
    "The event experience changed. Refresh before saving again.",
    { eventId, expectedRevision, revision },
  );
}

function frozenError(
  eventId: string,
  revision: number,
  hasPublishedBaseline: boolean,
): EventExperienceError {
  return new EventExperienceError(
    "EVENT_EXPERIENCE_FROZEN",
    hasPublishedBaseline
      ? "The matching question set is frozen after the profile-edit deadline."
      : "The event experience needs a published question set before the profile-edit deadline.",
    { eventId, revision },
  );
}

export function createPostgresEventExperienceRepository(input: {
  runtime: EventOperationsPostgresRuntime;
}): EventExperienceRepository {
  const { client, workspaceId } = input.runtime;

  async function freezeAt(
    executor: EventOperationsSqlExecutor,
    eventId: string,
  ): Promise<string | null> {
    const result = await executor.query<{ profile_edit_deadline_at: Date | string | null }>(
      `
        select configuration.profile_edit_deadline_at
        from event_ops_configuration_heads configuration_head
        join event_ops_configurations configuration
          on configuration.workspace_id = configuration_head.workspace_id
         and configuration.event_id = configuration_head.event_id
         and configuration.configuration_version = configuration_head.configuration_version
        where configuration_head.workspace_id = $1 and configuration_head.event_id = $2
      `,
      [workspaceId, eventId],
    );
    return timestamp(result.rows[0]?.profile_edit_deadline_at, "profile_edit_deadline_at");
  }

  async function readSnapshot(
    executor: EventOperationsSqlExecutor,
    eventId: string,
  ): Promise<EventExperienceSnapshot | null> {
    const headResult = await executor.query<HeadRow>(
      `
        select event_id, draft_version, published_version, revision,
               published_at, frozen_at
        from event_ops_experience_heads
        where workspace_id = $1 and event_id = $2
      `,
      [workspaceId, eventId],
    );
    const rawHead = headResult.rows[0];
    if (!rawHead) return null;
    const head = rowHead(rawHead);
    const versions = [head.draftVersion, head.publishedVersion].filter(
      (version): version is number => version !== null,
    );
    if (versions.length === 0) {
      return { draft: null, head, published: null };
    }
    const versionResult = await executor.query<VersionRow>(
      `
        select event_id, experience_version, configuration,
               configuration_hash, created_by_actor_id, created_at
        from event_ops_experience_versions
        where workspace_id = $1 and event_id = $2
          and experience_version = any($3::bigint[])
      `,
      [workspaceId, eventId, [...new Set(versions)]],
    );
    const byVersion = new Map(
      versionResult.rows.map((row) => {
        const version = rowVersion(row);
        return [version.version, version] as const;
      }),
    );
    return {
      draft: head.draftVersion === null ? null : clone(byVersion.get(head.draftVersion) ?? null),
      head,
      published:
        head.publishedVersion === null
          ? null
          : clone(byVersion.get(head.publishedVersion) ?? null),
    };
  }

  async function readVersion(
    executor: EventOperationsSqlExecutor,
    eventId: string,
    version: number | null,
  ): Promise<EventExperienceVersion | null> {
    if (version === null) return null;
    const result = await executor.query<VersionRow>(
      `
        select event_id, experience_version, configuration,
               configuration_hash, created_by_actor_id, created_at
        from event_ops_experience_versions
        where workspace_id = $1 and event_id = $2 and experience_version = $3
      `,
      [workspaceId, eventId, version],
    );
    const row = result.rows[0];
    return row ? rowVersion(row) : null;
  }

  async function statementTimestamp(
    executor: EventOperationsSqlExecutor,
  ): Promise<string> {
    const result = await executor.query<{ db_now: Date | string }>(
      "select statement_timestamp() as db_now",
    );
    return timestamp(result.rows[0]?.db_now, "statement_timestamp")!;
  }

  function assertMutable(
    eventId: string,
    head: EventExperienceHead,
    dbNow: string,
    proposedQuestionSet: EventExperienceQuestionSetInput | undefined,
    published: EventExperienceVersion | null,
  ): void {
    if (!head.frozenAt || Date.parse(dbNow) < Date.parse(head.frozenAt)) return;
    const questionSetUnchanged = Boolean(
      published &&
        proposedQuestionSet &&
        questionSetHash(proposedQuestionSet) ===
          questionSetHash(published.configuration.questionSet),
    );
    if (!questionSetUnchanged) {
      throw frozenError(eventId, head.revision, Boolean(published));
    }
  }

  async function mutableHead(
    executor: EventOperationsSqlExecutor,
    eventId: string,
  ): Promise<MutableHead> {
    let result = await executor.query<HeadRow>(
      `
        select event_id, draft_version, published_version, revision,
               published_at, frozen_at
        from event_ops_experience_heads
        where workspace_id = $1 and event_id = $2
        for update
      `,
      [workspaceId, eventId],
    );
    if (result.rows.length === 0) {
      const deadline = await freezeAt(executor, eventId);
      await executor.query(
        `
          insert into event_ops_experience_heads (
            workspace_id, event_id, draft_version, published_version,
            revision, published_at, frozen_at
          ) values ($1, $2, null, null, 0, null, $3)
        `,
        [workspaceId, eventId, deadline],
      );
      result = await executor.query<HeadRow>(
        `
          select event_id, draft_version, published_version, revision,
                 published_at, frozen_at
          from event_ops_experience_heads
          where workspace_id = $1 and event_id = $2
          for update
        `,
        [workspaceId, eventId],
      );
    }
    const row = result.rows[0];
    if (!row) {
      throw new EventExperienceError(
        "EVENT_EXPERIENCE_NOT_FOUND",
        "The event experience head could not be loaded.",
        { eventId },
      );
    }
    return { dbNow: await statementTimestamp(executor), head: rowHead(row) };
  }

  return {
    async get(eventId) {
      return readSnapshot(client, eventId.trim());
    },
    async saveDraft(input: SaveEventExperienceDraftInput) {
      const eventId = input.eventId.trim();
      if (!eventId) {
        throw new EventExperienceError(
          "EVENT_EXPERIENCE_EVENT_ID_REQUIRED",
          "An event id is required.",
        );
      }
      const configuration = normalizeExperienceConfiguration(input.configuration);
      return client.transaction(async (transaction) => {
        const mutable = await mutableHead(transaction, eventId);
        const { head } = mutable;
        const published = await readVersion(
          transaction,
          eventId,
          head.publishedVersion,
        );
        assertMutable(
          eventId,
          head,
          mutable.dbNow,
          configuration.questionSet,
          published,
        );
        if (
          (input.expectedRevision === null && head.revision !== 0) ||
          (input.expectedRevision !== null && input.expectedRevision !== head.revision)
        ) {
          conflict(eventId, input.expectedRevision, head.revision);
        }
        const nextVersionResult = await transaction.query<{ next_version: string }>(
          `
            select coalesce(max(experience_version), 0) + 1 as next_version
            from event_ops_experience_versions
            where workspace_id = $1 and event_id = $2
          `,
          [workspaceId, eventId],
        );
        const version = integer(nextVersionResult.rows[0]?.next_version, "version", 1);
        await transaction.query(
          `
            insert into event_ops_experience_versions (
              workspace_id, event_id, experience_version, configuration,
              configuration_hash, created_by_actor_id, created_at
            ) values ($1, $2, $3, $4::jsonb, $5, $6, statement_timestamp())
          `,
          [
            workspaceId,
            eventId,
            version,
            JSON.stringify(configuration),
            configurationHash(configuration),
            input.actorId,
          ],
        );
        await transaction.query(
          `
            update event_ops_experience_heads
            set draft_version = $3, revision = revision + 1
            where workspace_id = $1 and event_id = $2
          `,
          [workspaceId, eventId, version],
        );
        await transaction.query(
          `
            insert into event_ops_audit_log (
              workspace_id, audit_id, event_id, actor_id, action,
              aggregate_type, aggregate_id, before_payload, after_payload,
              evidence_ids, occurred_at
            ) values (
              $1, $2, $3, $4, 'event_experience_draft_saved',
              'event_experience', $3, $5::jsonb, $6::jsonb,
              '{}', statement_timestamp()
            )
          `,
          [
            workspaceId,
            `audit:event-experience:draft:${eventId}:${version}`,
            eventId,
            input.actorId,
            JSON.stringify({ revision: head.revision }),
            JSON.stringify({
              configurationHash: configurationHash(configuration),
              experienceVersion: version,
              revision: head.revision + 1,
            }),
          ],
        );
        const snapshot = await readSnapshot(transaction, eventId);
        if (!snapshot) {
          throw new EventExperienceError(
            "EVENT_EXPERIENCE_NOT_FOUND",
            "The saved event experience could not be read.",
            { eventId },
          );
        }
        return snapshot;
      });
    },
    async publish(input: PublishEventExperienceInput) {
      const eventId = input.eventId.trim();
      return client.transaction(async (transaction) => {
        const mutable = await mutableHead(transaction, eventId);
        const { head } = mutable;
        const draft = await readVersion(transaction, eventId, head.draftVersion);
        const published = await readVersion(
          transaction,
          eventId,
          head.publishedVersion,
        );
        assertMutable(
          eventId,
          head,
          mutable.dbNow,
          draft?.configuration.questionSet,
          published,
        );
        if (input.expectedRevision !== head.revision) {
          conflict(eventId, input.expectedRevision, head.revision);
        }
        if (head.draftVersion === null) {
          throw new EventExperienceError(
            "EVENT_EXPERIENCE_PUBLISH_REQUIRED",
            "Save an experience draft before publishing.",
            { eventId, revision: head.revision },
          );
        }
        await transaction.query(
          `
            update event_ops_experience_heads
            set published_version = draft_version,
                published_at = statement_timestamp(), revision = revision + 1
            where workspace_id = $1 and event_id = $2
          `,
          [workspaceId, eventId],
        );
        await transaction.query(
          `
            insert into event_ops_audit_log (
              workspace_id, audit_id, event_id, actor_id, action,
              aggregate_type, aggregate_id, before_payload, after_payload,
              evidence_ids, occurred_at
            ) values (
              $1, $2, $3, $4, 'event_experience_published',
              'event_experience', $3, $5::jsonb, $6::jsonb,
              '{}', statement_timestamp()
            )
          `,
          [
            workspaceId,
            `audit:event-experience:publish:${eventId}:${head.draftVersion}`,
            eventId,
            input.actorId,
            JSON.stringify({
              publishedVersion: head.publishedVersion,
              revision: head.revision,
            }),
            JSON.stringify({
              publishedVersion: head.draftVersion,
              revision: head.revision + 1,
            }),
          ],
        );
        const snapshot = await readSnapshot(transaction, eventId);
        if (!snapshot) {
          throw new EventExperienceError(
            "EVENT_EXPERIENCE_NOT_FOUND",
            "The published event experience could not be read.",
            { eventId },
          );
        }
        return snapshot;
      });
    },
  } satisfies EventExperienceRepository;
}
