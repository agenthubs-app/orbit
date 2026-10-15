/**
 * R27 参加者名单可见性——唯一的开关（用户 2026-10-15 确认 A）。Owner: 甲 (R27).
 * 报名资料的「参加者に表示」只给同场的参加者看：
 *  - A（默认）`registered`：只有报名确定 / 已参加的人看到名单（姓名 · 公司 · 一句话）与知り合いの名前；
 *    其他已登录的人只看到人数与知り合いの人数，未登录只看到人数。探す 搜索里「联系人参加的活动」同理。
 *  - 备选 `signed_in`：已登录就能看名单（需同时把报名时的公開範囲说明改成「参加を検討している人にも表示」）。
 * 改口径只改这里；服务端各处都经 `canSeeRoster` 判断，客户端不自己藏。
 */
export type RosterAudience = "registered" | "signed_in";
export const ROSTER_AUDIENCE: RosterAudience = "registered";

export type RosterViewer = { signedIn: boolean; registrationStatus?: string | null };

export function canSeeRoster(viewer: RosterViewer, audience: RosterAudience = ROSTER_AUDIENCE): boolean {
  if (!viewer.signedIn) return false;
  if (audience === "signed_in") return true;
  return viewer.registrationStatus === "registered" || viewer.registrationStatus === "attended";
}
