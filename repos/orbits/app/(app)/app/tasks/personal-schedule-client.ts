import { personalScheduleSchema } from "../../../../shared/api-schema/personal-schedule";
import type { PersonalScheduleContract } from "../../../../shared/contract/tasks";

export function createPersonalScheduleClient(actorId: string, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
  const pending = new Map<string, string>();
  const path = (id?: string) => `/api/schedule-items${id ? "/" + encodeURIComponent(id) : ""}`;
  function decode(raw: unknown) {
    const item = personalScheduleSchema.parse(raw) as PersonalScheduleContract;
    if (!actorId || item.accountId !== actorId || item.ownerUserId !== actorId || item.id !== item.sourceId) throw new Error("无法确认日程所属账号。");
    return item;
  }
  async function request<T>(url: string, method: string, read: (data: any) => T, body?: object) {
    const fingerprint = JSON.stringify([url, method, body]); let key = pending.get(fingerprint);
    if (body && !key) { key = `web:personal:${crypto.randomUUID()}`; pending.set(fingerprint, key); }
    const response = await fetcher(url, { method, credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}), ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: key }) } : {}) });
    if (signal?.aborted) throw new Error("当前页面已关闭。");
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true) throw new Error(response.status === 409 ? "日程已更新，草稿已保留。请刷新并核对最新内容。" : payload?.error?.message ?? "操作未完成，请重试。");
    const result = read(payload.data); pending.delete(fingerprint); return result;
  }
  function receipt(data: any, baseline: PersonalScheduleContract | null, fields: Record<string, string | null>, removed = false) {
    const item = decode(data?.scheduleItem);
    if ((baseline && (item.id !== baseline.id || Date.parse(item.updatedAt) <= Date.parse(baseline.updatedAt))) || (removed ? data?.deleted !== true || item.state !== "cancelled" : item.state === "cancelled")) throw new Error("无法确认保存结果，草稿已保留。");
    for (const [key, value] of Object.entries(fields)) {
      const actual = (item as unknown as Record<string, unknown>)[key];
      if (value === null ? actual !== undefined : key === "startsAt" || key === "endsAt" ? typeof actual !== "string" || Date.parse(actual) !== Date.parse(value) : actual !== value) throw new Error("保存回执与草稿不一致，请重试。");
    }
    return item;
  }
  return {
    get: (id: string) => request(path(id), "GET", data => { const item = decode(data?.scheduleItem); if (item.id !== id || item.state === "cancelled") throw new Error("无法确认日程。"); return item; }),
    list: () => request(path(), "GET", data => {
      if (!Array.isArray(data?.scheduleItems)) throw new Error("日程列表读取失败。");
      const ids = new Set<string>();
      return data.scheduleItems.filter((raw: any) => raw?.kind === "personal").map((raw: unknown) => { const item = decode(raw); if (ids.has(item.id)) throw new Error("日程记录重复。"); ids.add(item.id); return item; }).filter((item: PersonalScheduleContract) => item.state !== "cancelled").sort((a: PersonalScheduleContract, b: PersonalScheduleContract) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) as PersonalScheduleContract[];
    }),
    save: (baseline: PersonalScheduleContract | null, fields: Record<string, string | null>) => request(path(baseline?.id), baseline ? "PATCH" : "POST", data => receipt(data, baseline, fields), baseline ? { expectedUpdatedAt: baseline.updatedAt, patch: fields } : fields),
    remove: (baseline: PersonalScheduleContract) => request(path(baseline.id), "DELETE", data => receipt(data, baseline, {}, true), { expectedUpdatedAt: baseline.updatedAt }),
  };
}
