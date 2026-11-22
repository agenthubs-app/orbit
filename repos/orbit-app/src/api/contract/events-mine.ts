// R26 — 「参加予定」: the events I registered for, am waiting on, added to my plan, attended or cancelled.
// Owner: 甲 (R26). Used by: events (参加予定 tab), home (R10 「次のイベント」), manual add (R26-06), daily question (R26-07).

/**
 * `registered` / `pending_review` / `waitlisted` / `rejected` come from the registration; `planned` = added to a plan
 * (Orbit event or my own external assessment) without registering; `attended` = checked in (self or staff);
 * `cancelled` = I withdrew or the event was cancelled (membership `withdrawn` reads as cancelled).
 */
export type MyEventStatus = "registered" | "pending_review" | "waitlisted" | "planned" | "attended" | "rejected" | "cancelled";

export type MyEventsRange = "upcoming" | "past";

export interface MyEventItem {
  /** Orbit event id, or `assessment:<id>` for an external event I assessed and added to my plan. */
  eventId: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  venue?: string | null;
  emoji: string;
  /** 2026-11-20 主办方上传的活动图片（2:1）；null / 缺省 = 没有图，保持 emoji 卡片。 */
  coverUrl?: string | null;
  status: MyEventStatus;
  /** 会いたい人 N名 (plan person types expected there). */
  meetCount?: number | null;
  /** Up to four initials for the avatar stack. */
  meetInitials?: readonly string[];
  assessmentId?: string | null;
  /** Score of my assessment, when there is one. */
  score?: number | null;
  href: string;
  sample?: true;
  /**
   * agent-design AG13（只加，可选）：用户自己记的「我去过」（不是主办方签到，不改变 status）。旧版 App 读不懂就当没有。
   */
  selfAttendance?: MyEventSelfAttendance | null;
  /** AG13（只加，可选）：这是用户自己建的私人活动，只有本人能看到；status 用已有的值（planned）。 */
  privateEvent?: true;
  /**
   * AG20a（只加，可选；名字与日程的 allDay 一致）：只说了哪天、没说几点的私人活动。startsAt 仍是那天 0 点，显示时在钟点的位置写「全天」。
   * 读不懂这个字段的旧 App（build 19）会照旧显示 0:00，直到 build 20。
   */
  allDay?: boolean;
  /** AG13（只加，可选）：私人活动的详情（D4：宽屏右栏 / 手机底部弹出，不开新页面）——关联到它的笔记、待办、日程。 */
  related?: readonly MyEventRelatedRecord[];
}

export interface MyEventSelfAttendance {
  /** 本地日期 YYYY-MM-DD。 */
  attendedOn: string;
  dayParts?: readonly string[];
  selfNote?: string | null;
}

export interface MyEventRelatedRecord {
  kind: "memo" | "todo" | "schedule";
  id: string;
  label: string;
}

/** `GET /api/events/mine?range=upcoming|past&limit=` — upcoming ascending by start, past descending. */
export interface MyEventsResponse {
  range: MyEventsRange;
  items: readonly MyEventItem[];
  /** Upcoming count (the 「参加予定 N件」 badge), independent of `limit`. */
  upcomingCount: number;
  /**
   * R26 App 像素返工（只加）：the server clock the response was computed at (ISO). Clients date relative labels
   * (今夜 / 今日 / 明日, 「10月」) from it so they agree with the upcoming / past split (design fixtures pin it).
   */
  asOf?: string;
}
