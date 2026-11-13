import type { EventOverviewRegistrationStatus } from "../contract/event-overview";
import type { HostEventContact, HostEventContactInput } from "../contract/host-events";

// 主催者の連絡先（2026-11-14 用户）：存 / 读 / 判断谁能看，服务端与界面共用。

const ID_MAX = 60;
const NOTE_MAX = 200;

const clean = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? [...text].slice(0, max).join("") : null;
};

/** 写入或读出的连絡先 → 规范形（去首尾空白、截断；三项全空 = null）。读坏数据也不抛错。 */
export function normalizeHostContact(raw: HostEventContactInput | Readonly<Record<string, unknown>> | null | undefined): HostEventContact | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const contact: HostEventContact = { lineId: clean(source.lineId, ID_MAX), note: clean(source.note, NOTE_MAX), wechatId: clean(source.wechatId, ID_MAX) };
  return contact.wechatId || contact.lineId || contact.note ? contact : null;
}

/** 至少有一个能加的 ID（只有说明、没有 ID 时不弹窗）。 */
export function hostContactHasId(contact: HostEventContact | null | undefined): contact is HostEventContact {
  return Boolean(contact && (contact.wechatId || contact.lineId));
}

/** 能看到主办方连絡先的报名状态：審査中 / 確定 / キャンセル待ち / 受付済み。 */
export const HOST_CONTACT_STATUSES: readonly EventOverviewRegistrationStatus[] = ["registered", "pending_review", "waitlisted", "attended"];

export function canSeeHostContact(status: EventOverviewRegistrationStatus | null | undefined): boolean {
  return Boolean(status && HOST_CONTACT_STATUSES.includes(status));
}
