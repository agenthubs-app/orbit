// 人脈抽屉「予定を追加」→ Task 日历新建：联系人名字走 sessionStorage 交接（不进 URL、到达页不再读联系人）。
// 读不到（新标签页、无痕模式）时新建弹窗只说「已关联 1 位联系人」，关联照样保存。
const KEY = "orbit.schedule.contact";

export function stashScheduleContact(contact: { id: string; name: string }): void {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(contact)); } catch { /* the link still carries the id */ }
}

export function readScheduleContactName(contactId: string): string | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as { id?: unknown; name?: unknown } | null;
    return value?.id === contactId && typeof value.name === "string" && value.name.trim() ? value.name.trim() : null;
  } catch { return null; }
}

export function scheduleWithContactHref(contactId: string): string {
  return `/app/tasks?${new URLSearchParams({ tab: "calendar", new: "1", contactId })}`;
}
