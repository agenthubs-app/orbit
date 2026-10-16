/**
 * R17 主办方资料（一个 actor 可以有多份，A13）与公开主办方页（host/DESIGN.md §2.11）。Owner: 甲 (R17).
 * - slug：新建时由名称转写（取 ASCII 部分，不够就 `o-<随机>`），冲突加序号；之后不改。
 * - 公开页只列这份资料下 published 的活动：未结束的进「これからのイベント」，已结束的进「過去のイベント」；草稿与中止不列。
 * - 開催回数 = 已结束场次；累計参加者 = 这些场次的受付人数合计；过去行「参加 N名」= 受付人数；フォロワー = 关注数。
 * - 关注沿用 R27 的主办方 key（`organizerKeyFor(owner)`）：同一个人的几份资料共用关注（按资料关注列为后续）。
 */
import { randomBytes, randomUUID } from "node:crypto";

import type { OrganizerProfile, OrganizerProfileInput, OrganizerPublicPast, OrganizerPublicResponse, OrganizerPublicUpcoming } from "../../../../shared/contract/organizer-profile";
import type { EventOperationsPostgresClient } from "../../event-operations/storage/postgres-client";
import { organizerKeyFor } from "../../journey/live-mapping";
import { HostError } from "../service";
import type { HostEventPayload } from "./lifecycle";

type Row = Record<string, unknown>;
const iso = (value: unknown) => new Date(value instanceof Date ? value : String(value)).toISOString();

export function profileSlugBase(name: string): string {
  const ascii = name.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 40).replace(/-+$/gu, "");
  return ascii.length >= 3 ? ascii : `o-${randomBytes(4).toString("hex")}`;
}

function profileFromRow(row: Row): OrganizerProfile {
  return {
    bio: (row.bio as string | null) ?? null,
    displayName: String(row.display_name),
    emoji: (row.emoji as string | null) ?? null,
    eventCount: Number(row.event_count ?? 0),
    profileId: String(row.profile_id),
    slug: String(row.slug),
    updatedAt: iso(row.updated_at),
    visibility: row.visibility === "link_only" ? "link_only" : "public",
  };
}

const PROFILE_SELECT = `select p.*, (select count(*) from event_ops_events e where e.workspace_id = p.workspace_id and e.organizer_profile_id = p.profile_id and e.lifecycle_state_v2 in ('published', 'archived')) as event_count from organizer_profiles p`;

export function createHostProfiles(deps: { client: EventOperationsPostgresClient; workspaceId: string; now?: () => Date }) {
  const { client, workspaceId } = deps;
  const now = deps.now ?? (() => new Date());
  return {
    async list(ownerActorId: string): Promise<OrganizerProfile[]> {
      const result = await client.query<Row>(`${PROFILE_SELECT} where p.workspace_id = $1 and p.owner_actor_id = $2 order by p.created_at`, [workspaceId, ownerActorId]);
      return result.rows.map(profileFromRow);
    },

    async create(ownerActorId: string, input: OrganizerProfileInput): Promise<OrganizerProfile> {
      const base = input.slug ?? profileSlugBase(input.displayName);
      for (let n = 1; n < 50; n += 1) {
        const slug = n === 1 ? base : `${base}-${n}`;
        const result = await client.query<Row>(
          `insert into organizer_profiles (workspace_id, profile_id, owner_actor_id, slug, display_name, emoji, bio, visibility)
           values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (workspace_id, slug) do nothing returning *, 0 as event_count`,
          [workspaceId, `prof_${randomUUID().replaceAll("-", "").slice(0, 20)}`, ownerActorId, slug, input.displayName.trim(), input.emoji ?? null, input.bio ?? null, input.visibility ?? "public"],
        );
        if (result.rows[0]) return profileFromRow(result.rows[0]);
        if (input.slug) throw new HostError("VALIDATION", "SLUG_TAKEN");
      }
      throw new HostError("INVALID_STATE", "SLUG_EXHAUSTED");
    },

    async update(ownerActorId: string, profileId: string, input: OrganizerProfileInput): Promise<OrganizerProfile> {
      const result = await client.query<Row>(
        `update organizer_profiles set display_name = $4, emoji = coalesce($5, emoji), bio = $6, visibility = coalesce($7, visibility), updated_at = $8
          where workspace_id = $1 and profile_id = $2 and owner_actor_id = $3 returning profile_id`,
        [workspaceId, profileId, ownerActorId, input.displayName.trim(), input.emoji ?? null, input.bio ?? null, input.visibility ?? null, now().toISOString()],
      );
      if (!result.rows[0]) throw new HostError("NOT_FOUND");
      const reread = await client.query<Row>(`${PROFILE_SELECT} where p.workspace_id = $1 and p.profile_id = $2`, [workspaceId, profileId]);
      return profileFromRow(reread.rows[0]!);
    },

    async ownerOf(profileId: string): Promise<string | null> {
      const result = await client.query<{ owner_actor_id: string }>(`select owner_actor_id from organizer_profiles where workspace_id = $1 and profile_id = $2`, [workspaceId, profileId]);
      return result.rows[0]?.owner_actor_id ?? null;
    },

    async publicPage(slug: string, viewerActorId: string | null): Promise<OrganizerPublicResponse | null> {
      const found = await client.query<Row>(`${PROFILE_SELECT} where p.workspace_id = $1 and p.slug = $2`, [workspaceId, slug]);
      const row = found.rows[0];
      if (!row) return null;
      const profile = profileFromRow(row);
      const owner = String(row.owner_actor_id);
      const at = now();
      const events = await client.query<Row>(
        `select e.event_id, e.title, e.starts_at, e.ends_at, e.venue, coalesce(e.source_payload, '{}'::jsonb) as source_payload,
                (select count(*) from event_ops_checkins c where c.workspace_id = e.workspace_id and c.event_id = e.event_id) as attended,
                (select count(*) from event_ops_admission_application_heads a where a.workspace_id = e.workspace_id and a.event_id = e.event_id and a.status = 'admitted') as admitted,
                (select v.registration_opens_at from event_ops_admission_policy_heads h join event_ops_admission_policy_versions v using (workspace_id, event_id, policy_version) where h.workspace_id = e.workspace_id and h.event_id = e.event_id) as opens_at,
                (select a.alias_value from event_aliases a where a.workspace_id = e.workspace_id and a.event_id = e.event_id and a.alias_type = 'public_slug' order by a.created_at limit 1) as public_slug
           from event_ops_events e
          where e.workspace_id = $1 and e.organizer_profile_id = $2 and e.lifecycle_state_v2 in ('published', 'archived')
          order by e.starts_at desc`,
        [workspaceId, profile.profileId],
      );
      const upcoming: OrganizerPublicUpcoming[] = [];
      const past: OrganizerPublicPast[] = [];
      for (const event of events.rows) {
        const payload = ((event.source_payload as { host?: Partial<HostEventPayload> }).host ?? {}) as Partial<HostEventPayload>;
        const ended = Date.parse(iso(event.ends_at)) <= at.getTime();
        if (ended) {
          past.push({ attended: Number(event.attended), emoji: payload.emoji ?? null, eventId: String(event.event_id), startsAt: iso(event.starts_at), title: String(event.title ?? "") });
        } else {
          const capacity = payload.capacity ?? null;
          upcoming.push({
            emoji: payload.emoji ?? null,
            eventId: String(event.event_id),
            feeAmountYen: payload.feeAmountYen ?? null,
            feeKind: payload.feeKind ?? "free",
            href: event.public_slug ? `/e/${String(event.public_slug)}` : `/app/events/${encodeURIComponent(String(event.event_id))}`,
            registrationOpen: event.opens_at ? Date.parse(iso(event.opens_at)) <= at.getTime() : false,
            remainingSeats: capacity === null ? null : Math.max(0, capacity - Number(event.admitted)),
            startsAt: iso(event.starts_at),
            title: String(event.title ?? ""),
            venue: (event.venue as string | null) ?? null,
          });
        }
      }
      upcoming.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      const organizerKey = organizerKeyFor(owner);
      const followers = await client.query<{ n: number }>(`select count(*)::int as n from orbit_records where workspace_id = $1 and collection_name = 'organizerFollows' and lifecycle_state <> 'deleted' and payload ->> 'organizerId' = $2`, [workspaceId, organizerKey]);
      const following = viewerActorId
        ? (await client.query(`select 1 from orbit_records where workspace_id = $1 and collection_name = 'organizerFollows' and user_id = $2 and lifecycle_state <> 'deleted' and payload ->> 'organizerId' = $3 limit 1`, [workspaceId, viewerActorId, organizerKey])).rows.length > 0
        : null;
      return {
        following,
        organizerKey,
        past: past.slice(0, 6),
        pastTotal: past.length,
        profile,
        stats: { attendeesTotal: past.reduce((sum, item) => sum + item.attended, 0), eventsHeld: past.length, followers: Number(followers.rows[0]?.n ?? 0) },
        upcoming,
      };
    },

    /** 旧链接 `/app/o/<eventId|publicCode>` → 所属资料 slug。 */
    async slugForEventAlias(alias: string): Promise<string | null> {
      const result = await client.query<{ slug: string }>(
        `select p.slug from event_aliases a join event_ops_events e on e.workspace_id = a.workspace_id and e.event_id = a.event_id
           join organizer_profiles p on p.workspace_id = e.workspace_id and p.profile_id = e.organizer_profile_id
          where a.workspace_id = $1 and a.normalized_alias = $2 limit 1`,
        [workspaceId, alias.trim().toLocaleLowerCase("en-US")],
      );
      return result.rows[0]?.slug ?? null;
    },

    /** 申込页短链 `/e/<slug>` → eventId（只认已公开的）。 */
    async eventIdForSlug(slug: string): Promise<string | null> {
      const result = await client.query<{ event_id: string }>(`select a.event_id from event_aliases a join event_ops_events e using (workspace_id, event_id) where a.workspace_id = $1 and a.normalized_alias = $2 and a.alias_type = 'public_slug' and e.lifecycle_state_v2 = 'published'`, [workspaceId, slug.trim().toLocaleLowerCase("en-US")]);
      return result.rows[0]?.event_id ?? null;
    },
  };
}

export type HostProfiles = ReturnType<typeof createHostProfiles>;
