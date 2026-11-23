// 2026-11-23 活动 › 发现「点卡片右侧看简介」(docs/designs/redesign-2026-10/event-side-panel-proposal.html)。
// 只带简介栏要显示、而列表行（EventDiscoverRow）里没有的字段；栏先用列表行画，本接口补齐其余部分。
// 「看下一场」时栏换成另一场（不一定在列表里），所以活动本身的几项基本事实也一并给出（都是同一行读出来的，不另查）。
// Owner: 甲. Used by: Web 探す（EventSidePanel）.
import type { EventOverviewRegistrationStatus } from "./event-overview";

export interface EventSummaryResponse {
  eventId: string;
  title: string;
  emoji: string;
  coverUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  venue?: string | null;
  priceYen?: number | null;
  /** 活动说明的纯文字（Markdown 去掉标记），最多 400 字；没写说明 = null。 */
  description: string | null;
  /** 定员；不限 = null。 */
  capacity: number | null;
  /** 剩余名额 = 定员 − 已报名；不限 = null。 */
  remaining: number | null;
  registrationClosesAt: string | null;
  /** 主办方开了候补（满员 / 截止后仍可排队）。 */
  waitlistEnabled: boolean;
  /** 已报名人数（进行中的报名）。 */
  registrationCount: number;
  /** 我和这场的关系（与详情同一套词）。 */
  status: EventOverviewRegistrationStatus;
  ended: boolean;
  organizer: { organizerId: string | null; name: string; unnamed?: boolean; following: boolean };
  /** 名单对我公开时，最多 4 个参加者的首字（名单未公开 = 空）。 */
  attendeeInitials: readonly string[];
  /** 已结束且我报了名：会场记录里同桌 / 交换过的人；没有记录 = count 0。其他情况不给。 */
  met?: { count: number; notInContacts: number; initials: readonly string[]; hasRecord: boolean } | null;
  /** 已结束且我没参加：同一主办方最近一场还能报名的活动；没有 = null。 */
  next?: { eventId: string; title: string; startsAt: string; venue: string | null; coverUrl: string | null; emoji: string } | null;
}
