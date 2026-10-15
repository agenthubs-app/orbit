// R27 (DESIGN §10 A2, light version) — follow an organizer so its events show in 「あなたのコミュニティ」.
// Owner: 甲 (R27). Used by: events (探す search 「フォロー中」, community row).

/** `POST /api/organizers/[id]/follow` (follow) and `DELETE` (unfollow); both idempotent. */
export interface OrganizerFollowResult {
  organizerId: string;
  following: boolean;
  followedAt?: string | null;
}
