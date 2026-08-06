import { NextResponse } from "next/server";

import { createConfiguredEventAdmissionService } from "../../../../../../features/events/admission/runtime";
import {
  registrationClusterPreview,
  type RegistrationClusterPreview,
} from "../../../../../../features/events/registration/cluster-preview";
import type { EventRegistration } from "../../../../../../features/events/registration/contract";
import { loadEventForRegistration } from "../../../../../../features/events/registration/event-loader";
import { eventRegistrationRuntimeService } from "../../../../../../features/events/registration/runtime";

interface RegistrationPreviewPayload extends RegistrationClusterPreview {
  /** True when the event requires an organizer-reviewed application; the
   *  detail page then must not promise that quick answers carry over. */
  admissionControlled: boolean;
}

const PREVIEW_CACHE_TTL_MS = 60_000;

// Anonymous cluster preview: aggregate bucket counts only, no personal data,
// so the event detail page can show "who is coming" before the login wall.
export function createEventRegistrationPreviewHandler(input?: {
  listRegistrations?: (
    eventId: string,
  ) => Promise<readonly EventRegistration[]>;
  now?: () => number;
  resolveAdmissionControlled?: (eventId: string) => Promise<boolean>;
  loadEvent?: typeof loadEventForRegistration;
}) {
  const loadEvent = input?.loadEvent ?? loadEventForRegistration;
  const listRegistrations =
    input?.listRegistrations ??
    ((eventId: string) => eventRegistrationRuntimeService.list({ eventId }));
  const resolveAdmissionControlled =
    input?.resolveAdmissionControlled ??
    (async (eventId: string) => {
      const admission = createConfiguredEventAdmissionService();
      if (!admission) return false;
      try {
        return (await admission.getPolicy(eventId)) !== null;
      } catch {
        // 读不到策略时按普通报名展示；真正的准入门禁在写路径 fail-closed。
        return false;
      }
    });
  const now = input?.now ?? Date.now;
  // 匿名端点的短期缓存（每个 handler 实例一份；生产 route 模块级只建一次）：
  // 限制全量注册记录的读取频率，也让轮询无法观察到逐人变化（配合聚合层的
  // 桶下界化）。
  const previewCache = new Map<
    string,
    { at: number; payload: RegistrationPreviewPayload }
  >();

  return async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const { id } = await context.params;
    const event = await loadEvent(id);
    if (!event) {
      return NextResponse.json(
        { error: { message: "Event not found." }, success: false },
        { status: 404 },
      );
    }
    const cached = previewCache.get(event.id);
    if (cached && now() - cached.at < PREVIEW_CACHE_TTL_MS) {
      return NextResponse.json({ data: cached.payload, success: true });
    }
    const [registrations, admissionControlled] = await Promise.all([
      listRegistrations(event.id),
      resolveAdmissionControlled(event.id),
    ]);
    const payload: RegistrationPreviewPayload = {
      ...registrationClusterPreview(registrations),
      admissionControlled,
    };
    previewCache.set(event.id, { at: now(), payload });
    return NextResponse.json({ data: payload, success: true });
  };
}
