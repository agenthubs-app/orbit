import { eventDetailToSummary } from "./events";
import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator, type OrbitTranslator } from "../i18n/messages";

export interface ScheduleEventPreviewAction {
  href: "/events" | "/schedule";
  label: string;
}

export interface ScheduleEventPreviewEventView {
  id: string;
  nextAction: string;
  sourceContext: string;
  statusLabel: string;
  timing: string;
  title: string;
  venue: string;
}

export interface ScheduleEventPreviewView {
  actions: ScheduleEventPreviewAction[];
  description: string;
  event?: ScheduleEventPreviewEventView;
  guardrail: string;
  title: string;
}

function recoveryActions(t: OrbitTranslator): ScheduleEventPreviewAction[] {
  return [
    { href: "/schedule", label: t("schedulePreview.back") },
    { href: "/events", label: t("schedulePreview.events") }
  ];
}

function failureView(t: OrbitTranslator): ScheduleEventPreviewView {
  return {
    actions: recoveryActions(t),
    description: t("schedulePreview.failureDescription"),
    guardrail: t("schedulePreview.failureGuardrail"),
    title: t("schedulePreview.failureTitle")
  };
}

function evidenceCountLabel(count: number, t: OrbitTranslator): string {
  return t("schedulePreview.evidenceCount", { count });
}

function hasChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function previewStatusLabel(value: string, t: OrbitTranslator): string {
  const labels: Record<string, string> = {
    cancelled: t("schedulePreview.statusCancelled"),
    completed: t("schedulePreview.statusCompleted"),
    confirmed: t("schedulePreview.statusConfirmed"),
    imported: t("schedulePreview.statusImported"),
    live: t("schedulePreview.statusLive"),
    upcoming: t("schedulePreview.statusUpcoming")
  };

  return labels[value.trim().toLowerCase()] ?? value;
}

function previewSourceLabel(value: string, t: OrbitTranslator): string {
  if (!value || /\b(?:event-core|postgres|mock|fixture|generated)\b/iu.test(value)) {
    return t("schedulePreview.sourceEvent");
  }

  return value;
}

function previewNextAction(value: string, t: OrbitTranslator): string {
  return hasChinese(value)
    ? value
    : t("schedulePreview.nextAction");
}

export function scheduleEventPreviewToView(
  data: unknown,
  timeZone = "Asia/Tokyo",
  language: OrbitLanguage = "zh"
): ScheduleEventPreviewView {
  const t = createTranslator(language);
  if (!data) {
    return failureView(t);
  }

  const event = eventDetailToSummary(data, timeZone);

  if (!event.id || event.id === "event") {
    return failureView(t);
  }

  return {
    actions: recoveryActions(t),
    description: event.description || t("schedulePreview.description"),
    event: {
      id: event.id,
      nextAction: previewNextAction(event.nextAction, t),
      sourceContext: t("schedulePreview.sourceContext", { source: previewSourceLabel(event.sourceLabel, t), evidence: evidenceCountLabel(event.evidenceExcerpts.length, t) }),
      statusLabel: previewStatusLabel(event.status, t),
      timing: t("schedulePreview.timing", { time: t.literal(event.startsAt) }),
      title: event.title,
      venue: t("schedulePreview.venue", { venue: t.literal(event.location) || t("schedulePreview.venuePending") })
    },
    guardrail: t("schedulePreview.guardrail"),
    title: t("schedulePreview.title")
  };
}
