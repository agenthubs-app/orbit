/**
 * 2026-11-13 one-off migration (user request): the attendees of the four 「中日创业交流会」 events
 * become Orbit users. Until now they existed in Orbit only as opaque party-app actors
 * (`party-app:account:<id>` / `party-app:profile:<id>`) with no login.
 *
 * Input (`--accounts`, built outside the repo, holds emails): one entry per email across the four
 * events, with a pre-generated user id, display name, bcrypt hash of a random initial password (the
 * plaintext never leaves the organizer's machine) and the party-app actors of that person.
 * `--data` is the same import file `import-chinichi-party-results.ts` used.
 *
 * In one transaction behind the sync commit-order lock:
 *   1. auth_users: a credentials user with `mustChangePassword: true` per email that has no Orbit
 *      login yet. Emails that already have one keep it untouched (password included) — their
 *      party-app rows move onto the existing login (user decision 2026-11-13).
 *   2. Attendee rows move from each party-app actor to its login, the same way the organizer merge
 *      did (membership / profile versions and profile heads re-owned; membership heads and check-ins
 *      deleted and re-inserted with revision + 1 because of the sync owner guard).
 *   3. The matching results imported on 2026-11-12 name attendees by actor (directory actorId,
 *      generation participants). Those rows were written by the import alone (fingerprint
 *      `import:party-app:v1`, nothing else references them — guarded), so they are deleted and the
 *      import runs again on the moved heads: same content, actor ids now the logins.
 *
 * Guards abort the whole transaction: the four events; every party-app actor reference sits in a
 * known table; import generations are referenced only by import-owned tables; a login that already
 * exists has no rows of its own in an event where its party-app actor attends.
 *
 * Output carries counts and 12-hex email digests only, never emails or names.
 *
 *   npx tsx scripts/migrate-chinichi-party-attendees.ts --accounts <file> --data <file>              # dry run
 *   npx tsx scripts/migrate-chinichi-party-attendees.ts --accounts <file> --data <file> --rollback   # write, verify, roll back
 *   npx tsx scripts/migrate-chinichi-party-attendees.ts --accounts <file> --data <file> --apply      # write
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

import { createStorageAuthAccountProvisioningProvider } from "../features/auth/storage/auth-account-provisioning-provider";
import { authUserRecordId, createStorageAuthUserProvider, type StoredAuthUser } from "../features/auth/storage/auth-user-live-record-provider";
import { createEventOperationsPostgresClient, type EventOperationsSqlExecutor } from "../features/events/event-operations/storage/postgres-client";
import { acquireSyncCommitOrderLock } from "../features/sync/commit-order-lock";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createPostgresLiveRecordStore } from "../shared/storage/postgres-live-record-store";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../shared/contract/industries";
import { validateIndustrySelection } from "../shared/domain/industries";
import { profileBioWithinLimit } from "../shared/api-schema/profile-bio";
import type { SeniorityLevelValue } from "../shared/compute/seniority-group";
import { TARGETS } from "./fix-chinichi-startup-event-details";
import { IMPORT_FINGERPRINT, importEvent, type ImportEvent } from "./import-chinichi-party-results";
import { loadLocalEnv } from "./load-local-env";

/** The person's latest non-empty party-app profile values (any event). */
export type PartyProfile = {
  email: string; name?: string; title?: string; company?: string; industry?: string; level?: string; bio?: string; intro?: string;
  offering?: string[]; seeking?: string[]; topics?: string[]; wechat_name?: string; line_id?: string; phone?: string;
};
export type MigrationAccount = { email: string; emailKey: string; displayName: string; userId: string; passwordHash: string; oldActors: string[]; party: PartyProfile };

/** party-app 職位レベル → Orbit 六档 seniority (2026-11-13: same meaning; investor / advisor / その他 have no level). */
export const PARTY_LEVEL_TO_SENIORITY: Readonly<Record<string, SeniorityLevelValue | null>> = {
  "創業者 / 代表取締役": "founder", "共同創業者": "founder", "学生起業家": "founder",
  "CEO": "c_level", "COO": "c_level", "CTO": "c_level", "取締役 / 役員": "c_level",
  "執行役員": "vp", "VP / 本部長": "vp",
  "部長 / Director": "director", "事業部長": "director",
  "マネージャー / 課長": "manager", "リーダー / シニア": "manager",
  "会社員 / 社员": "individual_contributor", "スペシャリスト / 専門職": "individual_contributor", "プロデューサー": "individual_contributor",
  "研究者 / 教授": "individual_contributor", "フリーランス": "individual_contributor", "独立コンサルタント": "individual_contributor",
  "社外取締役 / 顧問": null, "エンジェル投資家": null, "VC / キャピタリスト": null, "その他": null,
};

/** party-app 業界 → Orbit secondary industry (its parent is the part before the dot). */
export const PARTY_INDUSTRY_TO_ORBIT: Readonly<Record<string, SecondaryIndustryIdCode>> = {
  "美容 / ウェルネス": "retail_consumer.lifestyle_services",
  "VC / PE / 投資ファンド": "finance_investment.venture_capital",
  "不動産 / REIT": "real_estate_construction.real_estate_services",
  "AI / 機械学習": "technology_internet.ai_data",
  "医療 / 病院経営": "healthcare_life_sciences.medical_services",
  "マーケティング / 広告代理店": "media_creative.advertising_marketing",
  "旅行 / ホスピタリティ": "food_hospitality.hotels_tourism",
  "アート / デザイン": "media_creative.design_creative",
  "教育 / EdTech": "education_research.edtech",
  "建設 / 建築": "real_estate_construction.construction",
  "映像 / 音楽 / エンタメ": "media_creative.film_video",
  "法務 / 法律事務所": "professional_services.legal",
  "SaaS / クラウド": "technology_internet.enterprise_software",
  "小売 / 流通": "retail_consumer.physical_retail",
  "EC / D2C": "retail_consumer.ecommerce",
  "自動車 / モビリティ": "manufacturing_supply_chain.automotive",
  "飲食 / フードテック": "food_hospitality.restaurants",
  "製造業 / 素材": "manufacturing_supply_chain.materials",
  "物流 / サプライチェーン": "trade_logistics.freight",
  "IT / DXコンサルティング": "professional_services.management_consulting",
  "戦略コンサルティング": "professional_services.management_consulting",
  "NPO / 社会起業": "community_nonprofit.social_enterprises",
  "ハードウェア / 半導体": "manufacturing_supply_chain.semiconductors",
  "農業 / アグリテック": "food_hospitality.food_production",
  "銀行 / 証券": "finance_investment.banking",
  "ロボティクス / IoT": "manufacturing_supply_chain.robotics",
  "暗号資産 / Web3": "finance_investment.fintech",
  "ヘルステック / デジタルヘルス": "healthcare_life_sciences.health_management",
  "人材 / HR / 採用": "professional_services.human_resources",
  "ゲーム / VR・AR": "media_creative.games_entertainment",
  "メディア / 出版": "media_creative.publishing_content",
  "保険": "finance_investment.insurance",
  "会計 / 税務": "professional_services.tax_accounting",
  "エネルギー / 環境": "other.other",
  "複数領域にまたがる": "other.other",
  "その他": "other.other",
};

/**
 * Orbit `profiles` payload fields from a party-app profile, same meaning, Orbit's own shape:
 * title → role, company → organization, intro (one line) → headline, bio → publicProfile.bio,
 * 業界 → industry ids (+ the original label), 職位レベル → seniorityLevel, offering / seeking /
 * topics as they are, contact ids → handles. Unknown level / industry labels throw.
 */
export function orbitProfileFields(p: PartyProfile) {
  const text = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  const list = (v?: string[]) => { const out = (v ?? []).map((x) => String(x).trim()).filter(Boolean); return out.length ? out : undefined; };
  if (p.level && !(p.level in PARTY_LEVEL_TO_SENIORITY)) throw new Error(`UNMAPPED_LEVEL:${p.level}`);
  if (p.industry && !PARTY_INDUSTRY_TO_ORBIT[p.industry]) throw new Error(`UNMAPPED_INDUSTRY:${p.industry}`);
  const secondary = p.industry ? PARTY_INDUSTRY_TO_ORBIT[p.industry]! : undefined;
  const primary = secondary ? (secondary.split(".")[0] as IndustryIdCode) : undefined;
  const seniority = p.level ? PARTY_LEVEL_TO_SENIORITY[p.level] ?? undefined : undefined;
  const handles = Object.fromEntries(Object.entries({ email: text(p.email), phone: text(p.phone), wechatId: text(p.wechat_name), lineId: text(p.line_id) }).filter(([, v]) => v));
  const publicProfile = Object.fromEntries(Object.entries({
    ...bioFields(text(p.bio)), industry: text(p.industry), primaryIndustryId: primary, secondaryIndustryId: secondary, seniorityLevel: seniority,
    // Orbit saves at most 5 offering / seeking tags; keep the person's first five (their own order).
    offering: list(p.offering)?.slice(0, 5), seeking: list(p.seeking)?.slice(0, 5), topics: list(p.topics),
  }).filter(([, v]) => v !== undefined));
  if (primary && !validateIndustrySelection({ primaryIndustryId: primary, secondaryIndustryId: secondary }).valid) throw new Error(`INVALID_INDUSTRY:${secondary}`);
  return Object.fromEntries(Object.entries({
    role: text(p.title), organization: text(p.company), headline: text(p.intro),
    handles: Object.keys(handles).length ? handles : undefined,
    publicProfile: Object.keys(publicProfile).length ? publicProfile : undefined,
  }).filter(([, v]) => v !== undefined)) as { role?: string; organization?: string; headline?: string; handles?: Record<string, string>; publicProfile?: Record<string, unknown> };
}

/**
 * Orbit's 「关于我」 has a visible-length limit (80 with CJK, else 200). A longer party-app bio is cut at
 * the last sentence end inside the limit (else hard-cut with 「…」); the full text is kept in
 * publicProfile.selfIntroduction so nothing is lost.
 */
export function bioFields(bio?: string): { bio?: string; selfIntroduction?: string } {
  if (!bio) return {};
  if (profileBioWithinLimit(bio)) return { bio };
  const chars = Array.from(bio);
  let cut = "";
  for (let n = chars.length - 1; n > 0; n--) {
    const candidate = chars.slice(0, n).join("");
    if (!profileBioWithinLimit(candidate)) continue;
    const end = Math.max(...["。", "！", "？", ". ", "!", "?", "\n"].map((m) => candidate.lastIndexOf(m)));
    cut = end >= Math.floor(candidate.length / 2) ? candidate.slice(0, end + 1).trim() : `${Array.from(candidate).slice(0, -1).join("").trim()}…`;
    break;
  }
  return { bio: cut, selfIntroduction: bio };
}

/** Existing Orbit data wins: only fields the person left empty are filled (nested one level for handles / publicProfile). */
export function fillEmpty(current: Record<string, unknown>, incoming: Record<string, unknown>) {
  const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  const out: Record<string, unknown> = { ...current };
  const filled: string[] = [];
  for (const [key, value] of Object.entries(incoming)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const base = (current[key] && typeof current[key] === "object" ? current[key] : {}) as Record<string, unknown>;
      const merged = { ...base };
      for (const [k, v] of Object.entries(value)) if (empty(base[k])) { merged[k] = v; filled.push(`${key}.${k}`); }
      out[key] = merged;
    } else if (empty(current[key])) { out[key] = value; filled.push(key); }
  }
  return { payload: out, filled };
}

const EVENT_IDS = Object.keys(TARGETS);
const PARTY_ACTOR = /^party-app:(account|profile):[0-9a-f-]{36}$/u;
/** Where party-app actors may appear. `moved` are rewritten, `reimported` deleted + rebuilt, `history` kept. */
const EXPECTED_REFS: Readonly<Record<string, "moved" | "reimported" | "history">> = {
  "event_ops_membership_versions.actor_id": "moved",
  "event_ops_membership_heads.actor_id": "moved",
  "event_ops_profile_versions.actor_id": "moved",
  "event_ops_profile_heads.actor_id": "moved",
  "event_ops_checkins.actor_id": "moved",
  "event_ops_generation_participants.actor_id": "reimported",
  "event_ops_audit_log.actor_id": "history",
  // Old organizer versions from before the 2026-11-12 organizer merge.
  "event_event_versions.organizer_actor_id": "history",
};
/** Tables allowed to reference an import generation / publication (all rebuilt by the re-import). */
const IMPORT_OWNED = new Set(["event_ops_generations", "event_ops_generation_participants", "event_ops_tasks", "event_ops_publications", "event_ops_publication_heads", "event_ops_graph_nodes", "event_ops_graph_edges"]);
const ACTOR_COLUMN = /(^|_)(actor|account|user|owner|host|inviter|invitee|redeemer|subject|sender)(_[a-z]+)*_id$|^used_by$|^undone_by$|^owner_id$/u;

class Rollback extends Error {}

function readAccounts(file: string): MigrationAccount[] {
  const rows = JSON.parse(fs.readFileSync(file, "utf8")) as MigrationAccount[];
  const seenEmail = new Set<string>(), seenActor = new Set<string>(), seenId = new Set<string>();
  for (const row of rows) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(row.email) || row.email !== row.email.trim().toLowerCase()) throw new Error(`ACCOUNTS_BAD_EMAIL:${row.emailKey}`);
    if (!/^user_[a-z0-9]+_[a-f0-9]{6}$/u.test(row.userId) || !/^\$2[aby]\$12\$/u.test(row.passwordHash)) throw new Error(`ACCOUNTS_BAD_ROW:${row.emailKey}`);
    if (seenEmail.has(row.email) || seenId.has(row.userId)) throw new Error(`ACCOUNTS_DUPLICATE:${row.emailKey}`);
    seenEmail.add(row.email); seenId.add(row.userId);
    for (const actor of row.oldActors) {
      if (!PARTY_ACTOR.test(actor) || seenActor.has(actor)) throw new Error(`ACCOUNTS_BAD_ACTOR:${row.emailKey}`);
      orbitProfileFields(row.party);
      seenActor.add(actor);
    }
  }
  return rows;
}

async function partyRefs(sql: EventOperationsSqlExecutor) {
  const cols = await sql.query<{ table_name: string; column_name: string; has_event: boolean }>(
    `select c.table_name, c.column_name, exists(select 1 from information_schema.columns e where e.table_schema='public' and e.table_name=c.table_name and e.column_name='event_id') has_event
       from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
      where c.table_schema='public' and t.table_type='BASE TABLE' and c.data_type in ('text','character varying')`);
  const out: Record<string, { total: number; outsideEvents: number | null }> = {};
  for (const c of cols.rows.filter((r) => ACTOR_COLUMN.test(r.column_name))) {
    const r = await sql.query<{ total: string; outside: string | null }>(
      `select count(*)::text total, ${c.has_event ? `count(*) filter (where event_id <> all($1::text[]))::text` : "null"} outside from "${c.table_name}" where "${c.column_name}" like 'party-app:%'`,
      c.has_event ? [EVENT_IDS] : []);
    const total = Number(r.rows[0]?.total ?? 0);
    if (total) out[`${c.table_name}.${c.column_name}`] = { total, outsideEvents: r.rows[0]?.outside == null ? null : Number(r.rows[0].outside) };
  }
  return out;
}

async function importIds(sql: EventOperationsSqlExecutor, ws: string) {
  const gens = (await sql.query<{ generation_id: string; event_id: string }>(`select generation_id, event_id from event_ops_generations where workspace_id=$1 and event_id = any($2::text[])`, [ws, EVENT_IDS])).rows;
  const imported = (await sql.query<{ generation_id: string }>(`select generation_id from event_ops_generations where workspace_id=$1 and event_id = any($2::text[]) and ai_request_fingerprint=$3`, [ws, EVENT_IDS, IMPORT_FINGERPRINT])).rows.map((r) => r.generation_id);
  const pubs = (await sql.query<{ publication_id: string }>(`select publication_id from event_ops_publications where workspace_id=$1 and generation_id = any($2::text[])`, [ws, imported])).rows.map((r) => r.publication_id);
  return { gens, imported, pubs };
}

async function guards(sql: EventOperationsSqlExecutor, ws: string, accounts: readonly MigrationAccount[]) {
  const events = await sql.query<{ event_id: string; title: string }>(`select event_id, title from event_ops_events where workspace_id=$1 and event_id = any($2::text[])`, [ws, EVENT_IDS]);
  for (const id of EVENT_IDS) if (events.rows.find((r) => r.event_id === id)?.title.trim() !== TARGETS[id]!.title) throw new Error(`GUARD_EVENT:${id}`);

  const refs = await partyRefs(sql);
  for (const [key, value] of Object.entries(refs)) {
    if (!EXPECTED_REFS[key]) throw new Error(`GUARD_UNEXPECTED_REF:${key}:${value.total}`);
    if (value.outsideEvents) throw new Error(`GUARD_REF_OUTSIDE_EVENTS:${key}:${value.outsideEvents}`);
  }

  const { gens, imported, pubs } = await importIds(sql, ws);
  if (imported.length !== EVENT_IDS.length || gens.length !== imported.length) throw new Error(`GUARD_GENERATIONS:${gens.length}:${imported.length}`);
  const idCols = await sql.query<{ table_name: string; column_name: string }>(
    `select c.table_name, c.column_name from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
      where c.table_schema='public' and t.table_type='BASE TABLE' and c.column_name in ('generation_id','publication_id')`);
  const importRefs: Record<string, number> = {};
  for (const c of idCols.rows) {
    const n = Number((await sql.query<{ n: string }>(`select count(*)::text n from "${c.table_name}" where "${c.column_name}" = any($1::text[])`, [c.column_name === "generation_id" ? imported : pubs])).rows[0]?.n ?? 0);
    if (!n) continue;
    importRefs[`${c.table_name}.${c.column_name}`] = n;
    if (!IMPORT_OWNED.has(c.table_name)) throw new Error(`GUARD_IMPORT_REFERENCED:${c.table_name}.${c.column_name}:${n}`);
  }

  // Every party-app actor still attending must belong to an account row, and vice versa no row points nowhere.
  const actors = (await sql.query<{ actor_id: string; events: string[] }>(
    `select actor_id, array_agg(distinct event_id) events from event_ops_membership_heads where workspace_id=$1 and actor_id like 'party-app:%' group by actor_id`, [ws])).rows;
  const byActor = new Map(accounts.flatMap((a) => a.oldActors.map((actor) => [actor, a] as const)));
  const unknownActors = actors.filter((r) => !byActor.has(r.actor_id)).length;
  if (unknownActors) throw new Error(`GUARD_ACTOR_WITHOUT_ACCOUNT:${unknownActors}`);
  const liveActors = new Set(actors.map((r) => r.actor_id));

  const existing = new Map<string, string>();
  const users = await sql.query<{ record_id: string; id: string }>(
    `select record_id, payload->>'id' id from orbit_records where workspace_id=$1 and collection_name='auth_users' and lifecycle_state='active' and record_id = any($2::text[])`,
    [ws, accounts.map((a) => authUserRecordId(a.email))]);
  for (const row of users.rows) existing.set(row.record_id, row.id);
  const takenIds = (await sql.query<{ n: string }>(`select count(*)::text n from orbit_records where workspace_id=$1 and collection_name='auth_users' and payload->>'id' = any($2::text[])`, [ws, accounts.map((a) => a.userId)])).rows[0]?.n;
  if (takenIds !== "0") throw new Error(`GUARD_USER_ID_TAKEN:${takenIds}`);

  const plan = accounts.map((a) => ({ account: a, target: existing.get(authUserRecordId(a.email)) ?? a.userId, existing: existing.has(authUserRecordId(a.email)), actors: a.oldActors.filter((actor) => liveActors.has(actor)) }));
  const conflicts: string[] = [];
  for (const p of plan.filter((x) => x.existing)) {
    const own = await sql.query<{ event_id: string }>(`select distinct event_id from event_ops_membership_heads where workspace_id=$1 and actor_id=$2 and event_id = any($3::text[])`, [ws, p.target, EVENT_IDS]);
    const partyEvents = new Set(actors.filter((r) => p.actors.includes(r.actor_id)).flatMap((r) => r.events));
    if (own.rows.some((r) => partyEvents.has(r.event_id))) conflicts.push(p.account.emailKey);
  }
  if (conflicts.length) throw new Error(`GUARD_LOGIN_ALREADY_ATTENDS:${conflicts.join(",")}`);

  return {
    plan,
    report: {
      refs, importRefs,
      accounts: accounts.length,
      newLogins: plan.filter((p) => !p.existing).length,
      existingLogins: plan.filter((p) => p.existing).map((p) => p.account.emailKey),
      withoutRowsInOrbit: plan.filter((p) => !p.actors.length).map((p) => p.account.emailKey),
      partyActorsAttending: actors.length,
    },
  };
}

async function createLogins(sql: EventOperationsSqlExecutor, ws: string, plan: Awaited<ReturnType<typeof guards>>["plan"]) {
  const provider = createStorageAuthUserProvider({ store: createPostgresLiveRecordStore({ client: sql }), workspaceId: ws });
  const at = new Date().toISOString();
  let created = 0;
  for (const p of plan.filter((x) => !x.existing)) {
    const a = p.account;
    const user = {
      id: a.userId, email: a.email, displayName: a.displayName || a.email.split("@")[0]!, provider: "credentials", passwordHash: a.passwordHash,
      providerAccountId: null, createdAt: at, updatedAt: at, mustChangePassword: true, migratedFrom: "party-app:chinichi-2026",
    } as StoredAuthUser;
    if (!await provider.insertUserIfAbsent!(user)) throw new Error(`LOGIN_RACE:${a.emailKey}`);
    created++;
  }
  return created;
}

/** Orbit profile for every login: new ones get the party-app fields; existing ones only where empty. */
async function writeProfiles(sql: EventOperationsSqlExecutor, ws: string, plan: Awaited<ReturnType<typeof guards>>["plan"]) {
  const store = createPostgresLiveRecordStore({ client: sql });
  const provisioner = createStorageAuthAccountProvisioningProvider({ store, workspaceId: ws });
  const at = new Date().toISOString();
  const result = { created: 0, filledExisting: 0, untouchedExisting: 0, existingWithoutDefaultProfile: 0, fieldsFilled: {} as Record<string, number> };
  for (const p of plan) {
    const a = p.account;
    const fields = orbitProfileFields(a.party);
    if (!p.existing) {
      await provisioner.ensureAccountForUser({ id: a.userId, email: a.email, displayName: a.displayName || a.email.split("@")[0]!, provider: "credentials", createdAt: at, updatedAt: at });
    }
    const record = await store.getRecord({ workspaceId: ws, collectionName: "profiles", recordId: `profile:${p.target}` });
    if (!record) { if (p.existing) { result.existingWithoutDefaultProfile++; continue; } throw new Error(`PROFILE_NOT_PROVISIONED:${a.emailKey}`); }
    const incoming: Record<string, unknown> = { ...fields, ...(a.displayName ? { displayName: a.displayName } : {}) };
    const { payload, filled } = p.existing ? fillEmpty(record.payload, incoming) : { payload: { ...record.payload, ...incoming }, filled: Object.keys(incoming) };
    // A real name from the person's own registration counts as confirmed (onboarding will not ask again).
    if (!p.existing && a.displayName) payload.displayNameConfirmed = true;
    if (p.existing && record.payload.displayNameConfirmed === false && filled.includes("displayName")) payload.displayNameConfirmed = true;
    if (!filled.length) { result.untouchedExisting++; continue; }
    payload.updatedAt = at;
    await store.upsertRecord({ ...record, payload, updatedAt: at, searchText: [payload.displayName, a.email, fields.organization, fields.role].filter(Boolean).join(" ") });
    for (const f of filled) result.fieldsFilled[f] = (result.fieldsFilled[f] ?? 0) + 1;
    if (p.existing) result.filledExisting++; else result.created++;
  }
  return result;
}

async function moveActors(sql: EventOperationsSqlExecutor, ws: string, moves: ReadonlyArray<readonly [string, string]>) {
  const totals = { membershipHeads: 0, checkins: 0, membershipVersions: 0, profileVersions: 0, profileHeads: 0 };
  for (const [from, to] of moves) {
    const scope = [ws, EVENT_IDS, from] as const;
    const checkins = await sql.query<{ data: Record<string, unknown> }>(`delete from event_ops_checkins where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3 returning to_jsonb(event_ops_checkins) as data`, scope);
    const heads = await sql.query<{ data: Record<string, unknown> }>(`delete from event_ops_membership_heads where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3 returning to_jsonb(event_ops_membership_heads) as data`, scope);
    const count = async (text: string) => Number((await sql.query<{ n: string }>(`with x as (${text} returning 1) select count(*)::text n from x`, [...scope, to])).rows[0]!.n);
    totals.membershipVersions += await count(`update event_ops_membership_versions set actor_id=$4 where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3`);
    totals.profileVersions += await count(`update event_ops_profile_versions set actor_id=$4 where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3`);
    totals.profileHeads += await count(`update event_ops_profile_heads set actor_id=$4, revision=revision+1, updated_at=now() where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3`);
    const reowned = (row: Record<string, unknown>, touch: boolean) => ({ ...row, actor_id: to, revision: Number(row.revision) + 1, ...(touch ? { updated_at: new Date().toISOString() } : {}) });
    for (const row of heads.rows) await sql.query(`insert into event_ops_membership_heads select * from jsonb_populate_record(null::event_ops_membership_heads, $1::jsonb)`, [JSON.stringify(reowned(row.data, true))]);
    for (const row of checkins.rows) await sql.query(`insert into event_ops_checkins select * from jsonb_populate_record(null::event_ops_checkins, $1::jsonb)`, [JSON.stringify(reowned(row.data, false))]);
    totals.membershipHeads += heads.rows.length;
    totals.checkins += checkins.rows.length;
  }
  return totals;
}

async function deleteImport(sql: EventOperationsSqlExecutor, ws: string) {
  const { imported } = await importIds(sql, ws);
  const n = async (text: string, values: unknown[]) => Number((await sql.query<{ n: string }>(`with x as (${text} returning 1) select count(*)::text n from x`, values)).rows[0]!.n);
  return {
    publicationHeads: await n(`delete from event_ops_publication_heads where workspace_id=$1 and generation_id = any($2::text[])`, [ws, imported]),
    publications: await n(`delete from event_ops_publications where workspace_id=$1 and generation_id = any($2::text[])`, [ws, imported]),
    generations: await n(`delete from event_ops_generations where workspace_id=$1 and generation_id = any($2::text[])`, [ws, imported]),
    configurationHeads: await n(`delete from event_ops_configuration_heads where workspace_id=$1 and event_id = any($2::text[])`, [ws, EVENT_IDS]),
    configurations: await n(`delete from event_ops_configurations where workspace_id=$1 and event_id = any($2::text[])`, [ws, EVENT_IDS]),
  };
}

/** The import matches party profiles to heads by actor key; after the move the key is the login. */
export function remapImport(data: ImportEvent, moved: ReadonlyMap<string, string>): ImportEvent {
  return { ...data, actorKeys: Object.fromEntries(Object.entries(data.actorKeys).map(([pid, keys]) => [pid, keys.map((k) => moved.get(k) ?? k)])) };
}

async function main(argv: readonly string[]) {
  loadLocalEnv();
  const apply = argv.includes("--apply");
  const rollback = argv.includes("--rollback");
  if (apply && rollback) throw new Error("USAGE: --apply and --rollback are exclusive");
  const arg = (name: string) => { const i = argv.indexOf(name); if (i < 0 || !argv[i + 1]) throw new Error(`USAGE: ${name} <file>`); return argv[i + 1]!; };
  const accounts = readAccounts(arg("--accounts"));
  const data = JSON.parse(fs.readFileSync(arg("--data"), "utf8")) as Record<string, ImportEvent>;
  if (EVENT_IDS.some((id) => !data[id])) throw new Error("DATA_MISSING_EVENT");
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const ws = config.workspaceId;
  const client = createEventOperationsPostgresClient({ connectionString: config.connectionString, max: 1 });
  const out: Record<string, unknown> = { mode: apply ? "APPLY" : rollback ? "ROLLBACK" : "DRY_RUN" };
  try {
    try {
      await client.transaction(async (sql) => {
        if (!apply && !rollback) await sql.query("set transaction read only");
        else await acquireSyncCommitOrderLock(sql);
        const { plan, report } = await guards(sql, ws, accounts);
        out.before = report;
        if (!apply && !rollback) return;
        out.createdLogins = await createLogins(sql, ws, plan);
        out.profiles = await writeProfiles(sql, ws, plan);
        const moves = plan.flatMap((p) => p.actors.map((actor) => [actor, p.target] as const));
        out.deletedImport = await deleteImport(sql, ws);
        out.moved = await moveActors(sql, ws, moves);
        const movedMap = new Map(moves);
        out.reimport = [];
        for (const id of EVENT_IDS) {
          const r = await importEvent(sql, ws, id, remapImport(data[id]!, movedMap), true) as { directory: number; recs: number; droppedRecs: number; unmatchedPartyProfiles: number };
          (out.reimport as unknown[]).push({ eventId: id.slice(0, 8), directory: r.directory, recs: r.recs, droppedRecs: r.droppedRecs, unmatched: r.unmatchedPartyProfiles });
        }
        const after = await partyRefs(sql);
        for (const [key, kind] of Object.entries(EXPECTED_REFS)) if (kind !== "history" && after[key]) throw new Error(`VERIFY_LEFTOVER:${key}:${after[key]!.total}`);
        const dtoLeft = (await sql.query<{ n: string }>(`select count(*)::text n from event_ops_publications where workspace_id=$1 and event_id = any($2::text[]) and published_dto::text like '%party-app:%'`, [ws, EVENT_IDS])).rows[0]?.n;
        if (dtoLeft !== "0") throw new Error(`VERIFY_DTO_PARTY_ACTORS:${dtoLeft}`);
        const flagged = (await sql.query<{ n: string }>(`select count(*)::text n from orbit_records where workspace_id=$1 and collection_name='auth_users' and payload->>'migratedFrom'='party-app:chinichi-2026' and (payload->>'mustChangePassword')::boolean`, [ws])).rows[0]?.n;
        if (Number(flagged) !== out.createdLogins) throw new Error(`VERIFY_LOGINS:${flagged}`);
        out.afterRefs = after;
        if (rollback) throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
      out.rolledBack = true;
    }
    console.info(`chinichi-attendee-migration ${out.mode} ${JSON.stringify(out)}`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`chinichi-attendee-migration FAILED ${error instanceof Error ? error.message : "unknown"}`);
    process.exitCode = 1;
  });
}
