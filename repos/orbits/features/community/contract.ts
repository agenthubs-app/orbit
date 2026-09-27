/**
 * 社群加入记录的对外形状（`GET/PUT /api/community/membership` 的 data）。
 * W0006 引导第 4 步复用同一份记录：`joined` 即「第 4 步视为完成」。
 */
export interface CommunityMembership {
  joined: boolean;
  /** 第一次点「我已加入」的时间；重复加入不改写。未加入为 null。 */
  joinedAt: string | null;
}

export interface CommunityMembershipService {
  get: () => Promise<CommunityMembership>;
  /** 幂等：已加入时原样返回第一次的记录。 */
  join: () => Promise<CommunityMembership>;
}

export const COMMUNITY_MEMBERSHIP_COLLECTION = "communityMembership";
export const COMMUNITY_MEMBERSHIP_RECORD_ID = "current";
