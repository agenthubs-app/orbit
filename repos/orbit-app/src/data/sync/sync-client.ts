import { z } from "zod";

import type {
  SyncChange,
  SyncPage,
  SyncRecord,
} from "../../api/contract/sync";
import type { OrbitApiClient } from "../../api/client";
import type { DomainManifest, DomainPage, OfflineReadEnvelope } from "../../api/contract/universal-read";
import { domainManifestSchema, domainPageSchema, offlineReadEnvelopeSchema } from "../../api/schema/universal-read";

const NONEMPTY = z.string().refine((value) => value.trim().length > 0);
const TIMESTAMP = z.iso.datetime({ offset: true });
const CHANGE = z
  .strictObject({
    kind: z.enum(["note", "task", "personal_schedule"]),
    id: NONEMPTY,
    revision: NONEMPTY,
    operation: z.enum(["upsert", "delete"]),
    updatedAt: TIMESTAMP,
    payload: z.json().optional(),
    aiVisibility: z.enum(["available_when_synced", "excluded"]),
  })
  .superRefine((value, context) => {
    if (
      value.operation === "upsert" &&
      (value.payload === undefined || value.payload === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "upsert payload is required",
        path: ["payload"],
      });
    }
    if (value.operation === "delete" && value.payload !== undefined) {
      context.addIssue({
        code: "custom",
        message: "delete payload must be omitted",
        path: ["payload"],
      });
    }
  });
const PAGE = z.strictObject({
  workspaceId: NONEMPTY,
  changes: z.array(CHANGE),
  nextCursor: NONEMPTY,
  hasMore: z.boolean(),
  highWatermark: NONEMPTY,
  serverTime: TIMESTAMP,
});

export interface SyncClientPage extends SyncPage {
  records: readonly SyncRecord[];
}

export interface SyncLeaseInput {
  /** The base URL this lease will be replayed against (proxy-aware). */
  baseUrl: string;
  signal?: AbortSignal;
}

export interface SyncDomainPageInput {
  domainId: string;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface SyncClient {
  /** Server-issued offline read lease: grants with authorization epochs per registered domain. */
  getLease(input: SyncLeaseInput): Promise<OfflineReadEnvelope>;
  getManifest(input?: { signal?: AbortSignal }): Promise<DomainManifest>;
  /** One page of one domain; the cursor is bound to actor / workspace / domain / epoch. */
  getDomainPage(input: SyncDomainPageInput): Promise<DomainPage>;
  getPage(input: {
    actorId: string;
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<SyncClientPage>;
}

export class SyncRequestError extends Error {
  readonly code: string;
  readonly context: Readonly<Record<string, string>> | undefined;
  readonly status: number;

  constructor(input: {
    code: string;
    context: Readonly<Record<string, string>> | undefined;
    message: string;
    status: number;
  }) {
    super(input.message);
    this.name = "SyncRequestError";
    this.code = input.code;
    this.context = input.context;
    this.status = input.status;
  }
}

export class SyncResetRequiredError extends SyncRequestError {
  constructor(input: {
    context: Readonly<Record<string, string>> | undefined;
    message: string;
  }) {
    super({
      code: "CONFLICT",
      context: input.context,
      message: input.message,
      status: 409,
    });
    this.name = "SyncResetRequiredError";
  }
}

export function createSyncClient(
  client: Pick<OrbitApiClient, "get">,
): SyncClient {
  function failed(result: { status: number; error: { code: string; message: string; context?: Readonly<Record<string, string>> } }): never {
    const errorInput = { code: result.error.code, context: result.error.context, message: result.error.message, status: result.status };
    if (result.status === 409 && result.error.code === "CONFLICT" && result.error.context?.syncErrorCode === "SYNC_RESET_REQUIRED") {
      throw new SyncResetRequiredError(errorInput);
    }
    throw new SyncRequestError(errorInput);
  }
  return {
    async getLease(input) {
      assertNonempty(input.baseUrl, "baseUrl");
      const result = await client.get<unknown>(`/api/sync/lease?baseUrl=${encodeURIComponent(input.baseUrl)}`, input.signal ? { signal: input.signal } : undefined);
      if (!result.success) failed(result);
      const parsed = offlineReadEnvelopeSchema.safeParse(result.data);
      if (!parsed.success) throw new TypeError("invalid offline read lease");
      return parsed.data;
    },
    async getManifest(input = {}) {
      const result = await client.get<unknown>("/api/sync/manifest", input.signal ? { signal: input.signal } : undefined);
      if (!result.success) failed(result);
      const parsed = domainManifestSchema.safeParse(result.data);
      if (!parsed.success) throw new TypeError("invalid sync manifest");
      return parsed.data;
    },
    async getDomainPage(input) {
      assertNonempty(input.domainId, "domainId");
      const limit = input.limit ?? 100;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new TypeError("sync limit is invalid");
      const query = new URLSearchParams();
      if (input.cursor !== undefined) { assertNonempty(input.cursor, "cursor"); query.set("cursor", input.cursor); }
      query.set("limit", String(limit));
      const result = await client.get<unknown>(`/api/sync/domains/${encodeURIComponent(input.domainId)}?${query.toString()}`, input.signal ? { signal: input.signal } : undefined);
      if (!result.success) failed(result);
      const parsed = domainPageSchema.safeParse(result.data);
      if (!parsed.success) throw new TypeError("invalid sync domain page");
      if (parsed.data.domainId !== input.domainId) throw new TypeError("sync domain page mismatch");
      return parsed.data;
    },
    async getPage(input): Promise<SyncClientPage> {
      assertNonempty(input.actorId, "actorId");
      if (input.cursor !== undefined) {
        assertNonempty(input.cursor, "cursor");
      }
      const limit = input.limit ?? 100;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
        throw new TypeError("sync limit is invalid");
      }
      const query = new URLSearchParams();
      if (input.cursor !== undefined) query.set("cursor", input.cursor);
      query.set("limit", String(limit));
      const options = input.signal ? { signal: input.signal } : undefined;
      const result = await client.get<unknown>(
        `/api/sync?${query.toString()}`,
        options,
      );
      if (!result.success) {
        const errorInput = {
          code: result.error.code,
          context: result.error.context,
          message: result.error.message,
          status: result.status,
        };
        if (
          result.status === 409 &&
          result.error.code === "CONFLICT" &&
          result.error.context?.syncErrorCode === "SYNC_RESET_REQUIRED"
        ) {
          throw new SyncResetRequiredError(errorInput);
        }
        throw new SyncRequestError(errorInput);
      }
      if (
        !Number.isInteger(result.status) ||
        result.status < 200 ||
        result.status >= 300
      ) {
        throw new TypeError("invalid sync response status");
      }

      const parsed = PAGE.safeParse(result.data);
      if (!parsed.success) {
        throw new TypeError("invalid sync page");
      }
      const syncPage: SyncPage = parsed.data;
      return {
        ...syncPage,
        records: syncPage.changes.map((change) =>
          changeToRecord(input.actorId, syncPage.workspaceId, change),
        ),
      };
    },
  };
}

function changeToRecord(
  actorId: string,
  workspaceId: string,
  change: SyncChange,
): SyncRecord {
  const deleted = change.operation === "delete";
  return {
    actorId,
    workspaceId,
    kind: change.kind,
    id: change.id,
    revision: change.revision,
    updatedAt: change.updatedAt,
    deletedAt: deleted ? change.updatedAt : null,
    payload: deleted ? null : change.payload,
    syncState: "synced",
    aiVisibility: change.aiVisibility,
  };
}

function assertNonempty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} is invalid`);
  }
}
