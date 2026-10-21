// R11a（代定 9，SC-10）：删除联系人后的提示与列表隐藏。LF12：离线删除改进同步待发队列（contact-outbox-mutation /
// contact-outbox-upload，local-contacts-source 隐藏待发的人），这里只剩两件事：
//   - 详情页删除后通知人脈列表显示「削除しました · 元に戻す」，并在墓碑同步到本机之前隐藏这个人（联网删除）；
//   - 旧的 AsyncStorage 删除队列只存在于未发布的改版构建里（从未进 chat-agent / main），不迁移；它的键仍由
//     account-local-caches 在退出登录与删除账号时清掉（开发机上的残留）。
export const CONTACT_DELETE_QUEUE_PREFIX = "orbit.network.pendingDeletes.v1:";

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeContactDeleteQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const notify = () => { for (const listener of listeners) listener(); };

/** Contacts deleted on this device whose tombstone has not reached the mirror yet (hidden from the list until then). */
const hidden = new Set<string>();
export function hiddenDeletedContactIds(): ReadonlySet<string> { return hidden; }
export function unhideDeletedContact(contactId: string): void { hidden.delete(contactId); notify(); }

/** One-shot signal from the detail page to the list: show 「削除しました · 元に戻す」 there (the detail unmounts). */
let lastDeleted: { contactId: string; name: string; queued: boolean } | null = null;
export function announceContactDeleted(value: { contactId: string; name: string; queued: boolean }): void { lastDeleted = value; hidden.add(value.contactId); notify(); }
export function takeAnnouncedContactDelete(): { contactId: string; name: string; queued: boolean } | null {
  const value = lastDeleted;
  lastDeleted = null;
  return value;
}
