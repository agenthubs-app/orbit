import { personalScheduleSchema } from "../../../../shared/api-schema/personal-schedule";
import type { PersonalScheduleContract } from "../../../../shared/contract/tasks";
import { personalScheduleAssociationOptionsPageSchema } from "../../../../shared/api-schema/personal-schedule-associations";
import { personalScheduleWindow, type PersonalScheduleFields } from "./personal-schedule-editor-model";

export function createPersonalScheduleClient(actorId: string, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
  const pending = new Map<string, string>();
  const path = (id?: string) => `/api/schedule-items${id ? "/" + encodeURIComponent(id) : ""}`;
  function decode(raw: unknown) {
    const item = personalScheduleSchema.parse(raw) as PersonalScheduleContract;
    if (item.endsAt && Date.parse(item.endsAt) <= Date.parse(item.startsAt)) throw new Error("日程时间无效。");
    const identity = item.seriesId !== undefined || item.occurrenceDate !== undefined ? !!item.seriesId && !!item.occurrenceDate && item.sourceId === item.seriesId && item.id === `${item.seriesId}:occurrence:${item.occurrenceDate}` : item.id === item.sourceId;
    if (!actorId || item.accountId !== actorId || item.ownerUserId !== actorId || !identity) throw new Error("无法确认日程所属账号或实例。");
    return item;
  }
  async function request<T>(url: string, method: string, read: (data: any) => T | Promise<T>, body?: object, mutation = true, requestSignal?: AbortSignal) {
    const activeSignal = signal && requestSignal ? AbortSignal.any([signal, requestSignal]) : signal ?? requestSignal;
    const fingerprint = JSON.stringify([url, method, body]); let key = pending.get(fingerprint);
    if (body && mutation && !key) { key = `web:personal:${crypto.randomUUID()}`; pending.set(fingerprint, key); }
    if (activeSignal?.aborted) throw new Error("当前页面已关闭。");
    const response = await fetcher(url, { method, credentials: "same-origin", cache: "no-store", headers: { "x-orbit-personal-schedule-version": "3", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(activeSignal ? { signal: activeSignal } : {}), ...(body ? { body: JSON.stringify(mutation ? { ...body, idempotencyKey: key } : body) } : {}) });
    if (activeSignal?.aborted) throw new Error("当前页面已关闭。");
    const payload = await response.json().catch(() => null);
    if (activeSignal?.aborted) throw new Error("当前页面已关闭。");
    if (!response.ok || payload?.success !== true) throw new Error(response.status === 409 ? "日程已更新，草稿已保留。请刷新并核对最新内容。" : payload?.error?.message ?? "操作未完成，请重试。");
    const result = await read(payload.data); if (activeSignal?.aborted) throw new Error("当前页面已关闭。"); pending.delete(fingerprint); return result;
  }
  function receipt(data: any, baseline: PersonalScheduleContract | null, fields: PersonalScheduleFields, removed = false) {
    const item = decode(data?.scheduleItem);
    if ((baseline && (item.id !== baseline.id || Date.parse(item.updatedAt) <= Date.parse(baseline.updatedAt))) || (removed ? data?.deleted !== true || item.state !== "cancelled" : item.state === "cancelled")) throw new Error("无法确认保存结果，草稿已保留。");
    for (const [key, value] of Object.entries(fields)) {
      const actual = (item as unknown as Record<string, unknown>)[key];
      if (value === null ? actual !== undefined : Array.isArray(value) ? !Array.isArray(actual) || actual.length !== value.length || actual.some((id, index) => id !== value[index]) : typeof value === "object" ? !actual || typeof actual !== "object" || (actual as any).frequency !== value.frequency || (actual as any).until !== value.until : key === "startsAt" || key === "endsAt" ? typeof actual !== "string" || typeof value !== "string" || Date.parse(actual) !== Date.parse(value) : actual !== value) throw new Error("保存回执与草稿不一致，请重试。");
    }
    return item;
  }
  function mutationScope(baseline: PersonalScheduleContract | null, scope?: "occurrence" | "series") {
    if (baseline && (baseline.seriesId || baseline.recurrence) && !scope) throw new Error("请选择本次或整个系列的修改范围。");
    if (scope === "series" && baseline?.seriesId) throw new Error("请先读取整个系列再保存。");
    if (scope === "occurrence" && !baseline?.occurrenceDate) throw new Error("无法确认本次实例。");
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
    searchAssociations: (kind: "note" | "contact", query: string, cursor?: string, requestSignal?: AbortSignal) => request(`${kind === "note" ? "/api/schedule-items/association-options/notes" : "/api/schedule-items/association-options/contacts"}?${new URLSearchParams({ q: query, limit: "20", ...(cursor ? { cursor } : {}) })}`, "GET", data => {
      const page = personalScheduleAssociationOptionsPageSchema.parse(data);
      if (!actorId || page.actorId !== actorId || page.kind !== kind) throw new Error("无法确认关联所属账号。");
      return { items: page.options, nextCursor: page.nextCursor ?? null };
    }, undefined, false, requestSignal),
    get: (id: string) => request(path(id), "GET", data => { const item = decode(data?.scheduleItem); if (item.id !== id || item.state === "cancelled") throw new Error("无法确认日程。"); return item; }),
    list: (zone = Intl.DateTimeFormat().resolvedOptions().timeZone) => request(`${path()}?${new URLSearchParams({ scope: "personal", ...personalScheduleWindow(zone) })}`, "GET", data => {
      if (!Array.isArray(data?.scheduleItems)) throw new Error("日程列表读取失败。");
      const ids = new Set<string>();
      return data.scheduleItems.filter((raw: any) => raw?.kind === "personal").map((raw: unknown) => { const item = decode(raw); if (ids.has(item.id)) throw new Error("日程记录重复。"); ids.add(item.id); return item; }).filter((item: PersonalScheduleContract) => item.state !== "cancelled").sort((a: PersonalScheduleContract, b: PersonalScheduleContract) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) as PersonalScheduleContract[];
    }),
    save: async (baseline: PersonalScheduleContract | null, fields: PersonalScheduleFields, scope?: "occurrence" | "series") => {
      mutationScope(baseline, scope);
      if (scope === "occurrence" && (Object.hasOwn(fields, "recurrence") || Object.hasOwn(fields, "reminderMinutes"))) throw new Error("提醒和重复请修改整个系列。");
      const expected: PersonalScheduleFields = {};
      for (const key of ["title", "startsAt", "endsAt", "location", "allDay", "timeZone", "meetingMethod", "meetingUrl", "contactIds", "noteIds", "reminderMinutes", "recurrence"] as const) if (baseline) expected[key] = baseline[key] ?? null;
      Object.assign(expected, fields);
      return request(path(baseline?.id), baseline ? "PATCH" : "POST", async data => {
      const item = receipt(data, baseline, expected);
      return request(path(item.id), "GET", readback => {
        const verified = receipt(readback, null, expected);
        if (verified.id !== item.id || verified.updatedAt !== item.updatedAt) throw new Error("无法确认保存结果，草稿已保留。");
        return verified;
      });
    }, baseline ? { expectedUpdatedAt: baseline.updatedAt, patch: fields, ...(scope ? { scope } : {}) } : fields);
    },
    remove: async (baseline: PersonalScheduleContract, scope?: "occurrence" | "series") => {
      mutationScope(baseline, scope);
      return request(path(baseline.id), "DELETE", async data => {
        const removed = receipt(data, baseline, {}, true);
        const response = await fetcher(path(baseline.id), { method: "GET", credentials: "same-origin", cache: "no-store", headers: { "x-orbit-personal-schedule-version": "3" }, ...(signal ? { signal } : {}) });
        const payload = await response.json().catch(() => null);
        if (signal?.aborted) throw new Error("当前页面已关闭。");
        if (response.status !== 404 || response.ok || payload?.success !== false) throw new Error("无法确认删除结果，请重试。");
        return removed;
      }, { expectedUpdatedAt: baseline.updatedAt, ...(scope ? { scope } : {}) });
    },
  };
}
