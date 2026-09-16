import { personalScheduleSchema } from "../../../../shared/api-schema/personal-schedule";
import type { PersonalScheduleContract } from "../../../../shared/contract/tasks";

export function createPersonalScheduleClient(actorId: string, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
  const pending = new Map<string, string>();
  const path = (id?: string) => `/api/schedule-items${id ? "/" + encodeURIComponent(id) : ""}`;
  function decode(raw: unknown) {
    const item = personalScheduleSchema.parse(raw) as PersonalScheduleContract;
    if (item.endsAt && Date.parse(item.endsAt) <= Date.parse(item.startsAt)) throw new Error("日程时间无效。");
    if (!actorId || item.accountId !== actorId || item.ownerUserId !== actorId || item.id !== item.sourceId) throw new Error("无法确认日程所属账号。");
    return item;
  }
  async function request<T>(url: string, method: string, read: (data: any) => T | Promise<T>, body?: object, mutation = true) {
    const fingerprint = JSON.stringify([url, method, body]); let key = pending.get(fingerprint);
    if (body && mutation && !key) { key = `web:personal:${crypto.randomUUID()}`; pending.set(fingerprint, key); }
    const response = await fetcher(url, { method, credentials: "same-origin", cache: "no-store", headers: { "x-orbit-personal-schedule-version": "2", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(signal ? { signal } : {}), ...(body ? { body: JSON.stringify(mutation ? { ...body, idempotencyKey: key } : body) } : {}) });
    if (signal?.aborted) throw new Error("当前页面已关闭。");
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true) throw new Error(response.status === 409 ? "日程已更新，草稿已保留。请刷新并核对最新内容。" : payload?.error?.message ?? "操作未完成，请重试。");
    const result = await read(payload.data); pending.delete(fingerprint); return result;
  }
  function receipt(data: any, baseline: PersonalScheduleContract | null, fields: Record<string, string | boolean | string[] | null>, removed = false) {
    const item = decode(data?.scheduleItem);
    if ((baseline && (item.id !== baseline.id || Date.parse(item.updatedAt) <= Date.parse(baseline.updatedAt))) || (removed ? data?.deleted !== true || item.state !== "cancelled" : item.state === "cancelled")) throw new Error("无法确认保存结果，草稿已保留。");
    for (const [key, value] of Object.entries(fields)) {
      const actual = (item as unknown as Record<string, unknown>)[key];
      if (value === null ? actual !== undefined : Array.isArray(value) ? !Array.isArray(actual) || actual.length !== value.length || actual.some((id, index) => id !== value[index]) : key === "startsAt" || key === "endsAt" ? typeof actual !== "string" || typeof value !== "string" || Date.parse(actual) !== Date.parse(value) : actual !== value) throw new Error("保存回执与草稿不一致，请重试。");
    }
    return item;
  }
  return {
    noteDetail: (id: string) => request(`/api/notes/${encodeURIComponent(id)}`, "GET", data => {
      const note = data?.note;
      if (!note || note.id !== id || note.accountId !== actorId || note.ownerUserId !== actorId || typeof note.title !== "string" || !note.title.trim() || typeof note.body !== "string" || !note.body.trim() || !Number.isSafeInteger(note.version) || note.version < 1 || typeof note.createdAt !== "string" || !Number.isFinite(Date.parse(note.createdAt)) || typeof note.updatedAt !== "string" || !Number.isFinite(Date.parse(note.updatedAt))) throw new Error("关联对象不可用，请移除或重试");
      return { id, title: note.title as string, body: note.body as string };
    }),
    association: (kind: "note" | "contact", id: string) => request(`/api/${kind === "note" ? "notes" : "contacts"}/${encodeURIComponent(id)}`, "GET", data => {
      const raw = kind === "note" ? data?.note : data?.contact;
      if (!raw || raw.id !== id || (kind === "note" && (raw.accountId !== actorId || raw.ownerUserId !== actorId))) throw new Error("关联对象不可用，请移除或重试");
      const title = kind === "note" ? raw.title : raw.displayName;
      if (typeof title !== "string" || !title.trim()) throw new Error("关联对象不可用，请移除或重试");
      return { id, title };
    }),
    searchAssociations: (kind: "note" | "contact", query: string, cursor?: string) => request(kind === "note" ? `/api/notes?${new URLSearchParams({ q: query, limit: "20", ...(cursor ? { cursor } : {}) })}` : "/api/contacts/search", kind === "note" ? "GET" : "POST", data => {
      const values = kind === "note" ? data?.notes : data?.contacts;
      if (!Array.isArray(values) || values.length > 20 || (data.nextCursor !== undefined && (typeof data.nextCursor !== "string" || !data.nextCursor))) throw new Error("搜索暂时不可用，请重试。");
      const items = values.map(raw => {
        const title = kind === "note" ? raw?.title : raw?.displayName;
        if (!raw || typeof raw.id !== "string" || !raw.id.trim() || typeof title !== "string" || !title.trim() || (kind === "note" && (raw.accountId !== actorId || raw.ownerUserId !== actorId))) throw new Error("搜索暂时不可用，请重试。");
        return { id: raw.id as string, title: title as string };
      });
      if (new Set(items.map(item => item.id)).size !== items.length) throw new Error("搜索暂时不可用，请重试。");
      return { items, nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null };
    }, kind === "contact" ? { query, limit: 20, ...(cursor ? { cursor } : {}) } : undefined, false),
    get: (id: string) => request(path(id), "GET", data => { const item = decode(data?.scheduleItem); if (item.id !== id || item.state === "cancelled") throw new Error("无法确认日程。"); return item; }),
    list: () => request(`${path()}?scope=personal`, "GET", data => {
      if (!Array.isArray(data?.scheduleItems)) throw new Error("日程列表读取失败。");
      const ids = new Set<string>();
      return data.scheduleItems.filter((raw: any) => raw?.kind === "personal").map((raw: unknown) => { const item = decode(raw); if (ids.has(item.id)) throw new Error("日程记录重复。"); ids.add(item.id); return item; }).filter((item: PersonalScheduleContract) => item.state !== "cancelled").sort((a: PersonalScheduleContract, b: PersonalScheduleContract) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) as PersonalScheduleContract[];
    }),
    save: (baseline: PersonalScheduleContract | null, fields: Record<string, string | boolean | string[] | null>) => request(path(baseline?.id), baseline ? "PATCH" : "POST", async data => {
      const item = receipt(data, baseline, fields);
      return request(path(item.id), "GET", readback => {
        const verified = receipt(readback, null, fields);
        if (verified.id !== item.id || verified.updatedAt !== item.updatedAt) throw new Error("无法确认保存结果，草稿已保留。");
        return verified;
      });
    }, baseline ? { expectedUpdatedAt: baseline.updatedAt, patch: fields } : fields),
    remove: (baseline: PersonalScheduleContract) => request(path(baseline.id), "DELETE", data => receipt(data, baseline, {}, true), { expectedUpdatedAt: baseline.updatedAt }),
  };
}
