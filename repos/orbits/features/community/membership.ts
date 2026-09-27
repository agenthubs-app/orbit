/**
 * 社群加入记录（RW-06）：`orbit_records` collection `communityMembership`、recordId `current`，
 * payload 只有 `joinedAt`。写法沿用 `features/agent/preferences.ts` 的单记录模式：
 * workspaceId 按 actor 分片（`<workspace>:community-actor:<actorId>`），同时写 userId 作为第二道隔离，
 * 因此每个人只有一条记录，也读不到别人的记录。
 *
 * 幂等：第一次加入用 `insertRecordIfAbsent` 原子插入；已存在（含并发下别的请求先插入）时
 * 返回已有记录，`joinedAt` 永远是第一次加入的时间。
 */
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import {
  COMMUNITY_MEMBERSHIP_COLLECTION,
  COMMUNITY_MEMBERSHIP_RECORD_ID,
  type CommunityMembership,
  type CommunityMembershipService,
} from "./contract";

export interface CommunityMembershipPayload extends Record<string, unknown> {
  joinedAt: string;
}

export function communityMembershipWorkspaceId(workspaceId: string, actorId: string): string {
  return `${workspaceId}:community-actor:${actorId}`;
}

const NOT_JOINED: CommunityMembership = { joined: false, joinedAt: null };

function membershipFrom(record: LiveRecord<CommunityMembershipPayload> | null): CommunityMembership {
  const joinedAt = record?.payload.joinedAt;
  return typeof joinedAt === "string" && joinedAt ? { joined: true, joinedAt } : NOT_JOINED;
}

export function createStorageCommunityMembershipService(input: {
  actorId: string;
  now?: () => string;
  store: LiveRecordStoreLike<CommunityMembershipPayload>;
  /** 部署级 workspace（未按 actor 分片）。 */
  workspaceId: string;
}): CommunityMembershipService {
  const actorId = input.actorId.trim();
  if (!actorId) throw new Error("Community membership requires an actor.");
  const now = input.now ?? (() => new Date().toISOString());
  const key = {
    collectionName: COMMUNITY_MEMBERSHIP_COLLECTION,
    recordId: COMMUNITY_MEMBERSHIP_RECORD_ID,
    workspaceId: communityMembershipWorkspaceId(input.workspaceId, actorId),
  };

  async function read(): Promise<CommunityMembership> {
    return membershipFrom(await input.store.getRecord({ ...key, userId: actorId }));
  }

  return {
    get: read,
    async join() {
      const existing = await read();
      if (existing.joined) return existing;

      const joinedAt = now();
      const record: LiveRecord<CommunityMembershipPayload> = {
        ...key,
        createdAt: joinedAt,
        evidenceIds: [],
        lifecycleState: "active",
        payload: { joinedAt },
        searchText: "iorbit community membership",
        sourceId: "community-membership",
        sourceLabel: "iOrbit community self-reported join",
        sourceType: "manual",
        updatedAt: joinedAt,
        userId: actorId,
      };

      if (!input.store.insertRecordIfAbsent) {
        return membershipFrom(await input.store.upsertRecord(record));
      }
      const inserted = await input.store.insertRecordIfAbsent(record);
      if (inserted) return membershipFrom(inserted);
      // 并发下另一个请求先插入：以它的 joinedAt 为准。
      const winner = await read();
      if (winner.joined) return winner;
      throw new Error("Community membership record exists but cannot be read.");
    },
  };
}
