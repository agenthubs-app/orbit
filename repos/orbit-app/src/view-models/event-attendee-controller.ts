import type { OrbitApiClient } from "../api/client";
import type { ApiResult } from "../api/types";
import { attendeeOperationsPath, exchangeCommand, readAttendeeWorkspace, readParticipantDetail, validateCheckInReceipt, validateExchangeReceipt, type AttendeeWorkspace, type ParticipantDetail, type ExchangeIntent } from "../api/event-attendee-operations";

export type AttendeeAction = "check-in" | "request" | "accept" | "decline" | "withdraw";
export interface AttendeeState { workspace: AttendeeWorkspace | null; detail: ParticipantDetail | null; loading: boolean; busy: boolean; error: string | null }
export function createAttendeeController(input: { client: OrbitApiClient; eventId: string; participantId: string | null; operationsActorId: string; isCurrent: () => boolean }) {
  let state: AttendeeState = { workspace: null, detail: null, loading: true, busy: false, error: null };
  let active = true;
  let locked = false;
  let epoch = 0;
  let request: AbortController | null = null;
  const listeners = new Set<() => void>();
  const current = () => active && input.isCurrent();
  const publish = (patch: Partial<AttendeeState>) => { if (!current()) return; state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  function data(result: ApiResult<unknown>): unknown {
    if (!result.success) throw new Error(result.error.message);
    if (result.status < 200 || result.status >= 300) throw new Error("服务未确认请求，请重新读取。");
    return result.data;
  }
  async function read(signal: AbortSignal, token: number, retainedError: string | null = null) {
    const valid = () => current() && epoch === token && !signal.aborted;
    publish({ workspace: null, detail: null, loading: true, error: retainedError });
    try {
      const response = await input.client.get<unknown>(attendeeOperationsPath(input.eventId), { signal });
      if (!valid()) return;
      const workspace = readAttendeeWorkspace(data(response), input.eventId);
      let detail: ParticipantDetail | null = null;
      if (input.participantId) {
        if (!workspace.directory.some(p => p.participantId === input.participantId)) throw new Error("该参会者不在本次活动可见目录中。");
        const response = await input.client.get<unknown>(`${attendeeOperationsPath(input.eventId)}/participants/${encodeURIComponent(input.participantId)}`, { signal });
        if (!valid()) return;
        detail = readParticipantDetail(data(response), workspace, input.participantId);
      }
      if (valid()) publish({ workspace, detail, error: retainedError });
    } catch (error) {
      if (valid()) publish({ workspace: null, detail: null, error: error instanceof Error && !("issues" in error) ? error.message : "返回的数据无法验证，请重新读取。" });
    } finally { if (valid()) publish({ loading: false }); }
  }
  return {
    activate() { active = true; },
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    dispose() { active = false; epoch++; request?.abort(); listeners.clear(); },
    async load() {
      if (!current() || locked) return;
      request?.abort(); request = new AbortController(); const token = ++epoch;
      await read(request.signal, token);
    },
    async act(action: AttendeeAction) {
      if (!current() || locked || state.loading || !state.workspace) return;
      const w = state.workspace; const d = state.detail;
      const me = w.me.participantId;
      let intent: ExchangeIntent | null = null;
      if (action === "check-in") {
        if (w.checkIn || !w.checkInAvailable) return;
      } else {
        if (!d || d.participantId === me) return;
        const r = d.contactRequest;
        if (action === "request") {
          if (Date.now() < Date.parse(w.configuration.eventStartsAt) || !(r.status === "none" || (r.status === "withdrawn" && r.direction === "outgoing"))) return;
          intent = { kind: "create", expectedRevision: r.revision, requesterParticipantId: me, targetParticipantId: d.participantId, ...(r.requestId ? { requestId: r.requestId } : {}) };
        } else {
          if (r.status !== "awaiting_target_consent" || !r.requestId || !r.revision) return;
          const common = { requestId: r.requestId, expectedRevision: r.revision };
          if (action === "withdraw" && r.direction === "outgoing") intent = { ...common, kind: "withdraw", requesterParticipantId: me, targetParticipantId: d.participantId };
          else if ((action === "accept" || action === "decline") && r.direction === "incoming") intent = { ...common, kind: "respond", accept: action === "accept", requesterParticipantId: d.participantId, targetParticipantId: me };
          else return;
        }
      }
      locked = true; request?.abort(); request = new AbortController(); const token = ++epoch; const signal = request.signal;
      publish({ busy: true, error: null });
      let failure: string | null = null;
      try {
        const command = intent ? exchangeCommand(input.eventId, intent) : { path: `${attendeeOperationsPath(input.eventId)}/check-in`, body: {} };
        const response = await input.client.post<unknown>(command.path, { body: command.body, signal });
        if (!current() || epoch !== token || signal.aborted) return;
        const receipt = data(response);
        if (intent) validateExchangeReceipt(receipt, input.eventId, intent);
        else validateCheckInReceipt(receipt, input.eventId, me, input.operationsActorId);
      } catch (error) {
        failure = error instanceof Error && !("issues" in error) ? error.message : "操作回执无法验证，请重新读取确认结果。";
      }
      // This also reconciles a lost ACK or revision conflict. Never automatically
      // resend a consent decision, and never navigate from an unverified receipt.
      if (current() && epoch === token && !signal.aborted) await read(signal, token, failure);
      locked = false;
      if (current() && epoch === token) publish({ busy: false });
    },
  };
}
