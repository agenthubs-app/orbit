/**
 * 诊断（只读）：对一场活动，用若干登录用户逐个调用 overview 的每一项读取，打印哪一项抛错（error.name + message 前 200 字）。
 *   node --import tsx scripts/diagnose-event-overview.ts <eventId> [actorId...]
 * 不给 actorId 时：取这场的主办方 + 至多 20 个报名者 + 至多 20 个有联系人的非报名用户。不输出姓名或内容。
 */
import { Pool } from "pg";

import { createJourneyLivePorts } from "../features/events/journey/live";
import { configuredJourneyLiveService } from "../features/events/journey/handlers";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

const [eventId, ...given] = process.argv.slice(2);
const msg = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : String(error).slice(0, 200));

async function main() {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config || !eventId) throw new Error("usage / DATABASE_UNCONFIGURED");
  const ports = createJourneyLivePorts();
  if (!ports) throw new Error("PORTS_UNCONFIGURED");
  const pool = new Pool({ connectionString: config.connectionString, max: 1 });
  let actors = given;
  if (!actors.length) {
    const host = await pool.query("select organizer_actor_id from event_ops_events where event_id = $1", [eventId]);
    const regs = await pool.query("select actor_id from event_ops_membership_heads where event_id = $1 and status = 'rsvped' limit 20", [eventId]);
    const others = await pool.query("select distinct user_id from orbit_records where collection_name = 'contacts' and lifecycle_state <> 'deleted' and user_id not in (select actor_id from event_ops_membership_heads where event_id = $1) limit 20", [eventId]);
    actors = [...new Set([String(host.rows[0]?.organizer_actor_id ?? ""), ...regs.rows.map((r) => String(r.actor_id)), ...others.rows.map((r) => String(r.user_id))].filter(Boolean))];
  }
  await pool.end();
  console.info(`[diag] event=${eventId} actors=${actors.length}`);
  const event = await ports.event(eventId);
  console.info(`[diag] event found=${Boolean(event)} organizerKey=${Boolean(event?.organizerKey)}`);
  if (!event) return;
  const service = await configuredJourneyLiveService();
  for (const [index, actorId] of actors.entries()) {
    const failures: string[] = [];
    const run = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch (error) { failures.push(`${name} -> ${msg(error)}`); return null; }
    };
    const roster = await run("publicAttendees", () => ports.publicAttendees(eventId));
    await run("myEvents", () => ports.myEvents(actorId));
    await run("registered", () => ports.registered(actorId, eventId));
    if (event.organizerKey) await run("organizerStats", () => ports.organizerStats(event.organizerKey!, eventId));
    const contacts = await run("contacts", () => ports.contacts(actorId));
    await run("judge", () => ports.judge(actorId, [eventId], "ja"));
    await run("planTypesFor", () => ports.planTypesFor(actorId, roster?.attendees ?? []));
    const names = [...new Set((contacts ?? []).map((c) => c.name.replace(/\s+/g, "")))];
    if (ports.publicRosterCounts) await run("publicRosterCounts", () => ports.publicRosterCounts!(actorId, eventId, names));
    if (service) await run("overview(full)", () => service.overview(actorId, eventId, "ja", "web"));
    console.info(`[diag] actor#${index} contacts=${contacts?.length ?? "ERR"} ${failures.length ? `FAIL ${JSON.stringify(failures)}` : "ok"}`);
  }
}

main().catch((error) => { console.error(`[diag] FAILED ${msg(error)}`); process.exitCode = 1; });
