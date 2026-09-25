import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { noteTaskCardSchema, noteTaskPageSchema } from "../../shared/api-schema/note-task-page";
import type { NoteTaskPageContract } from "../../shared/contract/note-task-page";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import { taskRecordsValidityCte } from "./task-page";
export type { NoteTaskPageContract, NoteTaskCardContract } from "../../shared/contract/note-task-page";

export interface NoteTaskPageQuery { noteId: string; limit?: number; cursor?: string | null }

const SQL = `with ${taskRecordsValidityCte(false, true)}, matching as materialized (
  select * from valid where t->'sourceNoteId'=to_jsonb($3::text) and (t->>'sourceNoteVersion')::numeric<=9007199254740991
), page as (
  select * from matching where $4::text is null or (t->>'updatedAt') collate "C"<$4 collate "C"
    or (t->>'updatedAt'=$4 and record_id collate "C">$5 collate "C")
  order by (t->>'updatedAt') collate "C" desc,record_id collate "C" limit $6
)
select jsonb_build_object('ok',not exists(select 1 from matching where octet_length(record_id)>2048),
  'total',(select count(*) from matching),'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',record_id,'titlePreview',left(t->>'title',240),'status',t->>'status','sourceNoteVersion',t->'sourceNoteVersion',
    'position',jsonb_build_object('updatedAt',t->>'updatedAt','id',record_id))
    order by (t->>'updatedAt') collate "C" desc,record_id collate "C") from page),'[]'::jsonb)) as result`;
const positionSchema = z.object({ updatedAt: z.string().max(40).refine(value => Number.isFinite(Date.parse(value))), id: z.string().min(1).max(2048) }).strict();

/** This is a list of the actor's own tasks with a note provenance filter. It
 * grants no access to the referenced note and never reads that note's body. */
export function createNoteTaskPageReader(input: { client: LiveRecordSqlClient; workspaceId: string; secret: string; now?: () => string }) {
  return { async read(actorId: string, query: NoteTaskPageQuery): Promise<NoteTaskPageContract> {
    const limit = query.limit ?? 20;
    if (!input.workspaceId.trim() || !actorId.trim() || actorId.length > 2048 || !query.noteId.trim() || query.noteId.length > 2048
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 30) throw Error("NOTE_TASK_PAGE_INPUT_INVALID");
    if (Buffer.byteLength(input.secret) < 32) throw Error("READ_CURSOR_SECRET_MISSING");
    const identity = JSON.stringify(["note-task-page:v1", input.workspaceId, actorId, query.noteId]);
    const sign = (value: string) => createHmac("sha256", input.secret).update(identity).update(value).digest();
    let after: z.infer<typeof positionSchema> | null = null;
    if (query.cursor) try {
      if (query.cursor.length > 8000) throw Error();
      const [body, signature, ...rest] = query.cursor.split(".");
      if (!body || !signature || rest.length) throw Error();
      const actual = Buffer.from(signature, "base64url"), expected = sign(body);
      if (actual.length !== expected.length || actual.toString("base64url") !== signature || !timingSafeEqual(actual, expected)) throw Error();
      after = positionSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    } catch { throw Error("NOTE_TASK_PAGE_CURSOR_INVALID"); }
    const response = await input.client.query<{ result: unknown }>(SQL, [input.workspaceId, actorId, query.noteId, after?.updatedAt ?? null, after?.id ?? null, limit + 1]);
    const result = z.object({ ok: z.literal(true), total: z.number().int().nonnegative().safe(), items: z.array(noteTaskCardSchema.extend({ position: positionSchema })).max(31) }).strict().parse(response.rows[0]?.result);
    const items = result.items.slice(0, limit), hasMore = result.items.length > limit, last = items.at(-1);
    const body = hasMore && last ? Buffer.from(JSON.stringify(last.position)).toString("base64url") : null;
    return noteTaskPageSchema.parse({ actorId, noteId: query.noteId, items: items.map(({ position: _position, ...item }) => item), total: result.total,
      hasMore, nextCursor: body ? `${body}.${sign(body).toString("base64url")}` : null, asOf: input.now?.() ?? new Date().toISOString() });
  } };
}

export function createConfiguredNoteTaskPageReader(expectedWorkspaceId?: string) {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  if (expectedWorkspaceId && expectedWorkspaceId !== configured.workspaceId) throw Error("NOTE_TASK_PAGE_STORAGE_UNAVAILABLE");
  const reader = createNoteTaskPageReader({ client: configured.client, workspaceId: configured.workspaceId,
    secret: process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "" });
  return { read(actorId: string, query: NoteTaskPageQuery) {
    resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "tasks" }); return reader.read(actorId, query);
  } };
}
