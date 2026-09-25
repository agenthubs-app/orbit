import { z } from "zod";
import { createConfiguredEventOperationsPostgresRuntime, type EventOperationsSqlExecutor } from "../events/event-operations/storage/postgres-client";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";

export interface HomeAppointmentSummaryItem {
  appointmentId: string;
  contactId: string | null;
  durationMinutes: number;
  medium: "in_person" | "video" | "phone";
  startsAtUtc: string;
  status: "confirmed" | "reschedule_pending";
}

export interface HomeAppointmentSummary {
  count: number;
  items: HomeAppointmentSummaryItem[];
}

export interface HomeAppointmentSummaryReader {
  read(actorId: string, window: { from: string; to: string }): Promise<HomeAppointmentSummary>;
}

// Keep the Home adapter's strict calendar date and Date.parse instant semantics:
// offsets may reach 23:59, 24:00 is valid, and fractions truncate to milliseconds.
// PostgreSQL's direct timestamptz cast differs on each of those boundaries.
const instantPattern = "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?|24:00:00([.]0+)?)(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$";
// ECMAScript trim WhiteSpace + LineTerminator, not PostgreSQL's space-only btrim.
const trimWhitespace = "\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF";

const SUMMARY_SQL = `with scoped as materialized (
  select appointment_id,payload,
    coalesce(jsonb_typeof(payload->'appointmentId')='string'
      and jsonb_typeof(payload->'ownerActorId')='string' and jsonb_typeof(payload->'inviteeActorId')='string'
      and payload->>'appointmentId'=appointment_id
      and payload->>'ownerActorId'=owner_actor_id and payload->>'inviteeActorId'=invitee_actor_id
      and payload->>'status'=status,false) as identity_ok
  from appointment_aggregates where workspace_id=$1 and (owner_actor_id=$2 or invitee_actor_id=$2)
), relevant as materialized (
  select *,payload->'confirmed' as confirmed,payload->'confirmed'->>'startsAtUtc' as start_text
  from scoped where payload->>'status' in ('confirmed','reschedule_pending')
), checked as materialized (
  select *,coalesce(
    case when jsonb_typeof(confirmed->'startsAtUtc')='string' and start_text ~ '${instantPattern}'
      then case when substring(start_text,1,4)::int>=100
        then substring(start_text,9,2)::int<=extract(day from
          (make_date(substring(start_text,1,4)::int,substring(start_text,6,2)::int,1)+interval '1 month - 1 day'))
        else false end else false end
    and case when jsonb_typeof(confirmed->'durationMinutes')='number' then
      (confirmed->>'durationMinutes')::numeric between 1 and 9007199254740991
      and trunc((confirmed->>'durationMinutes')::numeric)=(confirmed->>'durationMinutes')::numeric
      else false end
    and confirmed->'medium'->>'kind' in ('in_person','video','phone'),false) as valid
  from relevant
), timed as materialized (
  select *,(
    make_date(substring(start_text,1,4)::int,substring(start_text,6,2)::int,substring(start_text,9,2)::int)::timestamp
    + make_interval(hours=>substring(start_text,12,2)::int,mins=>substring(start_text,15,2)::int,
      secs=>substring(start_text,18,2)::int+coalesce(('0.'||substring(start_text from '[.]([0-9]{1,3})'))::double precision,0))
    - case when right(start_text,1)='Z' then 0 else
      (case when left(right(start_text,6),1)='+' then 1 else -1 end)
      *(substring(right(start_text,6),2,2)::int*60+right(start_text,2)::int) end*interval '1 minute'
    ) at time zone 'UTC' as starts_at
  from checked where valid
), in_window as materialized (
  select *,case when jsonb_typeof(payload->'contactIdsByActor'->$2)='string'
    then payload->'contactIdsByActor'->>$2 else null end as contact_id
  from timed where starts_at >= $3::timestamptz and starts_at < $4::timestamptz
), previews as materialized (
  select * from in_window order by starts_at,appointment_id collate "C" limit 3
)
select case when exists(select 1 from scoped where not identity_ok)
  or exists(select 1 from checked where not valid)
  or exists(select 1 from in_window where octet_length(appointment_id)>2048 or btrim(appointment_id,U&'${trimWhitespace}')=''
    or octet_length(contact_id)>2048
    or extract(epoch from starts_at)*1000+(confirmed->>'durationMinutes')::numeric*60000>8640000000000000)
  then jsonb_build_object('ok',false)
  else jsonb_build_object('ok',true,'count',(select count(*) from in_window),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'appointmentId',appointment_id,'contactId',contact_id,
      'durationMinutes',confirmed->'durationMinutes','medium',confirmed->'medium'->>'kind',
      'startsAtUtc',to_char(starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'status',payload->>'status') order by starts_at,appointment_id collate "C") from previews),'[]'::jsonb))
  end as result`;

const resultSchema = z.object({
  ok: z.literal(true),
  count: z.number().int().nonnegative().safe(),
  items: z.array(z.object({
    appointmentId: z.string().min(1).max(2048),
    contactId: z.string().max(2048).nullable(),
    durationMinutes: z.number().int().positive().safe(),
    medium: z.enum(["in_person", "video", "phone"]),
    startsAtUtc: z.string().datetime(),
    status: z.enum(["confirmed", "reschedule_pending"]),
  }).strict()).max(3),
}).strict();

/** One snapshot, count plus three summaries; never return proposals, history or details. */
export function createHomeAppointmentSummaryReader(input: { client: EventOperationsSqlExecutor; workspaceId: string }): HomeAppointmentSummaryReader {
  return { async read(actorId, window) {
    if (!actorId.trim()) throw new Error("ACTOR_REQUIRED");
    const from = Date.parse(window.from), to = Date.parse(window.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error("HOME_WINDOW_INVALID");
    const response = await input.client.query<{ result: unknown }>(SUMMARY_SQL, [input.workspaceId, actorId, new Date(from).toISOString(), new Date(to).toISOString()]);
    const parsed = resultSchema.safeParse(response.rows[0]?.result);
    if (response.rows.length !== 1 || !parsed.success || parsed.data.items.length !== Math.min(3, parsed.data.count)) throw new Error("HOME_APPOINTMENT_SUMMARY_INVALID");
    return { count: parsed.data.count, items: parsed.data.items.map(item => ({ ...item, contactId: item.contactId ?? null })) };
  } };
}

export function createConfiguredHomeAppointmentSummaryReader(): HomeAppointmentSummaryReader | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) return null;
  const reader = createHomeAppointmentSummaryReader(runtime);
  return { read(actorId, window) {
    resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "appointment_aggregates" });
    return reader.read(actorId, window);
  } };
}
