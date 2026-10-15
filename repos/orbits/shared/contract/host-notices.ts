// R17 — 主催：定型通知。Owner: 甲 (R17). Used by: host（发前确认）、inbox（来源 `event_host_notice`，R13 通用渲染）。
// DESIGN §2.10：在状态变化的同一事务里写 `event_host_notice_outbox`，worker 写收件箱 + 发邮件（只发给有账号者，
// 尊重通知设置；非生产强制重定向 `ORBIT_MAIL_REDIRECT_TO`）。主办方不能写自由文本群发；不调 AI。

export type HostNoticeKind =
  | "admission_approved"
  | "admission_waitlisted"
  | "admission_rejected"
  | "admission_promoted"
  | "matching_published"
  | "event_cancelled"
  | "event_changed"
  | "event_published"
  | "profile_incomplete"
  | "cohost_invite"
  | "desktop_link";

/** 主办方能主动发（发前确认）的只有这三种；其余在状态变化时自动写。 */
export type HostSendableNoticeKind = "event_cancelled" | "event_changed" | "profile_incomplete";

export type HostNoticeChannel = "inbox" | "email";

/** `POST /api/host/events/[id]/notices/preview`。 */
export interface HostNoticePreviewInput {
  kind: HostSendableNoticeKind;
}

export interface HostNoticePreview {
  kind: HostSendableNoticeKind;
  recipients: number;
  channels: readonly HostNoticeChannel[];
  title: string;
  body: string;
  hostNote: string | null;
  /** 频控：同人同活动同类只发一次；资料未完成提醒每场 ≤2 次。剩余可发次数。 */
  remainingSends: number;
  sample?: true;
}

/** `POST /api/host/events/[id]/notices/send`（仅中止 / 变更 / 资料未完成提醒）。 */
export interface HostNoticeSendInput {
  kind: HostSendableNoticeKind;
  idempotencyKey: string;
}

export interface HostNoticeSendResult {
  kind: HostSendableNoticeKind;
  queued: number;
  /** 已经发过的人（频控）跳过的数。 */
  skipped: number;
}
