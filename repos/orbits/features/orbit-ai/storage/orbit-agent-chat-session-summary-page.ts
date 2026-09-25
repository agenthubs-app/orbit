import { createHmac, timingSafeEqual } from "node:crypto";

import type { AiSessionSummaryItemContract, AiSessionSummaryPageContract } from "../../../shared/contract/ai-session-page";
import type { AiSessionOrganizationContract } from "../../../shared/contract/ai-sessions";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import { aiSessionSummaryPageSchema } from "../../../shared/api-schema/ai-session-page";

export interface OrbitAgentChatSessionSummaryQuery {
  cursor?: string | null;
  groupId?: string | null;
  limit: number;
  pinned?: boolean | null;
  q?: string;
}

export interface OrbitAgentChatSessionSummaryCandidate {
  id: string;
  title: string;
  firstUserText: string;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
  messageRevision: number;
  searchText: string;
  sessionCustomTitle: string | null;
  pinned: boolean;
  organization?: AiSessionOrganizationContract;
}

interface CursorPosition {
  pinned: boolean;
  createdAt: string;
  id: string;
}

const MAX_PAGE_SIZE = 50;

function fail(code: string): never {
  throw new Error(code);
}

function codePointSlice(value: string, max: number): string {
  return [...value].slice(0, max).join("");
}

function normalizeQuery(query: OrbitAgentChatSessionSummaryQuery): OrbitAgentChatSessionSummaryQuery {
  const q = (query.q ?? "").trim();
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > MAX_PAGE_SIZE || q.length > 240
    || query.cursor === ""
    || (query.groupId !== undefined && query.groupId !== null && query.groupId !== "ungrouped" && (query.groupId.trim().length === 0 || query.groupId.length > 160))) {
    return fail("SESSION_PAGE_INPUT_INVALID");
  }
  return { ...query, cursor: query.cursor ?? null, groupId: query.groupId ?? null, pinned: query.pinned ?? null, q };
}

function identity(input: { actorId: string; actorWorkspaceId: string; baseWorkspaceId: string; query: OrbitAgentChatSessionSummaryQuery }): string {
  const query = normalizeQuery(input.query);
  return JSON.stringify([
    "orbit-agent-session-summary:v1", input.baseWorkspaceId, input.actorWorkspaceId, input.actorId,
    query.q, query.groupId, query.pinned,
  ]);
}

function cursorCodec(secret: string, binding: string) {
  if (Buffer.byteLength(secret) < 32) fail("READ_CURSOR_SECRET_MISSING");
  const sign = (encoded: string) => createHmac("sha256", secret).update(binding).update(encoded).digest();
  return {
    open(token: string | null | undefined): CursorPosition | null {
      if (!token) return null;
      try {
        if (token.length > 8000) throw new Error();
        const [encoded, signature, ...extra] = token.split(".");
        if (!encoded || !signature || extra.length) throw new Error();
        const expected = sign(encoded);
        const actual = Buffer.from(signature, "base64url");
        if (actual.length !== expected.length || actual.toString("base64url") !== signature || !timingSafeEqual(actual, expected)) throw new Error();
        const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { pos?: unknown };
        if (typeof claims.pos !== "object" || claims.pos === null) throw new Error();
        const position = claims.pos as Partial<CursorPosition>;
        if (typeof position.pinned !== "boolean" || typeof position.createdAt !== "string" || !Number.isFinite(Date.parse(position.createdAt))
          || typeof position.id !== "string" || position.id.length < 1 || position.id.length > 160) throw new Error();
        return { pinned: position.pinned, createdAt: position.createdAt, id: position.id };
      } catch {
        return fail("SESSION_PAGE_CURSOR_INVALID");
      }
    },
    seal(position: CursorPosition): string {
      const encoded = Buffer.from(JSON.stringify({ pos: position }), "utf8").toString("base64url");
      return `${encoded}.${sign(encoded).toString("base64url")}`;
    },
  };
}

function candidateOrganization(candidate: OrbitAgentChatSessionSummaryCandidate): AiSessionOrganizationContract {
  return candidate.organization ?? {
    customTitle: candidate.sessionCustomTitle,
    groupId: null,
    pinned: candidate.pinned,
    revision: 0,
  };
}

function present(candidate: OrbitAgentChatSessionSummaryCandidate): AiSessionSummaryItemContract {
  const organization = candidateOrganization(candidate);
  const customTitle = organization.customTitle ?? candidate.sessionCustomTitle;
  return {
    id: candidate.id,
    title: codePointSlice(candidate.title, 120),
    firstUserText: codePointSlice(candidate.firstUserText, 240),
    lastMessagePreview: codePointSlice(candidate.lastMessagePreview, 240),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    messageRevision: candidate.messageRevision,
    organization,
  };
}

function matches(candidate: OrbitAgentChatSessionSummaryCandidate, query: OrbitAgentChatSessionSummaryQuery): boolean {
  const organization = candidateOrganization(candidate);
  if (query.groupId === "ungrouped" && organization.groupId !== null) return false;
  if (query.groupId && query.groupId !== "ungrouped" && organization.groupId !== query.groupId) return false;
  if (query.pinned !== null && organization.pinned !== query.pinned) return false;
  if (!query.q) return true;
  const search = `${candidate.id} ${candidate.searchText} ${organization.customTitle ?? ""}`.toLocaleLowerCase();
  return search.includes(query.q.toLocaleLowerCase());
}

function compare(left: OrbitAgentChatSessionSummaryCandidate, right: OrbitAgentChatSessionSummaryCandidate): number {
  const leftOrganization = candidateOrganization(left);
  const rightOrganization = candidateOrganization(right);
  return Number(rightOrganization.pinned) - Number(leftOrganization.pinned)
    || right.createdAt.localeCompare(left.createdAt)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export function pageOrbitAgentChatSessionSummaryCandidates(input: {
  actorId: string;
  actorWorkspaceId: string;
  baseWorkspaceId: string;
  candidates: readonly OrbitAgentChatSessionSummaryCandidate[];
  query: OrbitAgentChatSessionSummaryQuery;
  secret: string;
}): AiSessionSummaryPageContract {
  const query = normalizeQuery(input.query);
  const codec = cursorCodec(input.secret, identity({ ...input, query }));
  const after = codec.open(query.cursor);
  const filtered = input.candidates.filter((candidate) => matches(candidate, query)).sort(compare);
  const afterCandidate = after ? {
    id: after.id, title: "", firstUserText: "", lastMessagePreview: "", createdAt: after.createdAt,
    updatedAt: "", messageRevision: 0, searchText: "", sessionCustomTitle: null, pinned: after.pinned,
  } : null;
  const page = (afterCandidate ? filtered.filter((candidate) => compare(candidate, afterCandidate) > 0) : filtered)
    .slice(0, query.limit + 1);
  const items = page.slice(0, query.limit).map(present);
  const hasMore = page.length > query.limit;
  const last = items.at(-1);
  const result = {
    items,
    hasMore,
    nextCursor: hasMore && last ? codec.seal({ pinned: last.organization.pinned, createdAt: last.createdAt, id: last.id }) : null,
    storage: { configured: true, persisted: true },
  };
  return aiSessionSummaryPageSchema.parse(result) as AiSessionSummaryPageContract;
}

const SUMMARY_SQL = `with owned_sessions as materialized (
  select s.record_id,s.search_text,s.payload,s.created_at,s.updated_at
  from orbit_records s
  where s.workspace_id=$2 and s.collection_name='orbit_agent_chat_sessions'
    and s.lifecycle_state<>'deleted' and s.payload->>'id'=s.record_id
    and jsonb_typeof(s.payload->'title')='string' and s.payload->>'title'<>''
    and jsonb_typeof(s.payload->'createdAt')='string' and jsonb_typeof(s.payload->'updatedAt')='string'
), owned_organizations as materialized (
  select o.record_id,o.payload->>'sessionId' as session_id,o.payload,o.updated_at
  from orbit_records o
  where o.workspace_id=$1 and o.collection_name='orbit_agent_chat_session_organizations'
    and o.user_id=$3 and o.lifecycle_state<>'deleted'
), session_rows as materialized (
  select s.record_id, s.search_text,
    s.payload->>'title' as title,
    left(coalesce(s.payload->>'firstUserMessage',''),240) as first_user_text,
    left(coalesce(s.payload->>'lastMessagePreview',''),240) as last_message_preview,
    s.payload->>'createdAt' as created_at,
    s.payload->>'updatedAt' as updated_at,
    case when jsonb_typeof(s.payload->'messageRevision')='number'
      and (s.payload->>'messageRevision') ~ '^[0-9]{1,15}$'
      then (s.payload->>'messageRevision')::bigint else 0 end as message_revision,
    case when jsonb_typeof(s.payload->'customTitle')='string' then s.payload->>'customTitle' else null end as session_custom_title,
    o.record_id is not null as has_organization,
    case when o.record_id is not null and jsonb_typeof(o.payload->'customTitle')='string' then o.payload->>'customTitle' else null end as organization_custom_title,
    case when jsonb_typeof(o.payload->'groupId')='string' then o.payload->>'groupId' else null end as group_id,
    coalesce(case when o.record_id is not null then o.payload->'pinned'='true'::jsonb else s.payload->'pinned'='true'::jsonb end,false) as pinned,
    case when jsonb_typeof(o.payload->'revision')='number' and (o.payload->>'revision') ~ '^[0-9]{1,15}$'
      then least((o.payload->>'revision')::numeric,9007199254740991)::bigint else 0 end as organization_revision
  from owned_sessions s
  left join owned_organizations o on o.session_id=s.record_id
), filtered as (
  select *,case when has_organization then organization_custom_title else session_custom_title end as custom_title
  from session_rows
  where ($4='' or strpos(lower(record_id || ' ' || title || ' ' || coalesce(case when has_organization then organization_custom_title else session_custom_title end,'')),lower($4))>0
    or strpos(lower(coalesce(search_text,'')),lower($4))>0)
    and (not $5::boolean or ($6::text='ungrouped' and group_id is null) or ($6::text<>'ungrouped' and group_id=$6))
    and ($7::boolean is null or pinned=$7)
    and ($8::boolean is null or pinned<$8 or (pinned=$8 and created_at collate "C"<$9 collate "C")
      or (pinned=$8 and created_at=$9 and record_id collate "C">$10 collate "C"))
)
select record_id,title,first_user_text,last_message_preview,created_at,updated_at,message_revision,
  session_custom_title,custom_title,group_id,pinned,organization_revision
from filtered
order by pinned desc,created_at collate "C" desc,record_id collate "C" asc
limit $11`;

export function createOrbitAgentChatSessionSummaryPageReader(input: {
  actorId: string;
  actorWorkspaceId: string;
  baseWorkspaceId: string;
  client: LiveRecordSqlClient;
  secret: string;
}) {
  return {
    async read(queryInput: OrbitAgentChatSessionSummaryQuery): Promise<AiSessionSummaryPageContract> {
      const query = normalizeQuery(queryInput);
      const codec = cursorCodec(input.secret, identity({ ...input, query }));
      const after = codec.open(query.cursor);
      const rows = await input.client.query<Record<string, unknown>>(SUMMARY_SQL, [
        input.baseWorkspaceId, input.actorWorkspaceId, input.actorId, query.q ?? "",
        query.groupId !== null, query.groupId ?? "", query.pinned,
        after?.pinned ?? null, after?.createdAt ?? null, after?.id ?? null, query.limit + 1,
      ]);
      const items = rows.rows.slice(0, query.limit).map((row) => {
        const revision = Number(row.message_revision);
        const organizationRevision = Number(row.organization_revision);
        const groupId = typeof row.group_id === "string" ? row.group_id : null;
        const organization: AiSessionOrganizationContract = {
          customTitle: typeof row.custom_title === "string" ? row.custom_title : null,
          groupId,
          pinned: row.pinned === true,
          revision: Number.isSafeInteger(organizationRevision) && organizationRevision >= 0 ? organizationRevision : 0,
        };
        return present({
          id: String(row.record_id),
          title: typeof row.title === "string" ? row.title : "",
          firstUserText: typeof row.first_user_text === "string" ? row.first_user_text : "",
          lastMessagePreview: typeof row.last_message_preview === "string" ? row.last_message_preview : "",
          createdAt: typeof row.created_at === "string" ? row.created_at : "",
          updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
          messageRevision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
          searchText: "",
          sessionCustomTitle: typeof row.session_custom_title === "string" ? row.session_custom_title : null,
          pinned: row.pinned === true,
          organization,
        });
      });
      const hasMore = rows.rows.length > query.limit;
      const last = items.at(-1);
      return aiSessionSummaryPageSchema.parse({
        items,
        hasMore,
        nextCursor: hasMore && last ? codec.seal({ pinned: last.organization.pinned, createdAt: last.createdAt, id: last.id }) : null,
        storage: { configured: true, persisted: true },
      }) as AiSessionSummaryPageContract;
    },
  };
}
