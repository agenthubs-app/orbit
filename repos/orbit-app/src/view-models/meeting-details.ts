import type { MeetingDetailsContract, MeetingDetailsMedium } from "../api/contract/appointments";
import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator, type OrbitTranslator } from "../i18n/messages";

function localeTag(language: OrbitLanguage): string {
  return language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US";
}

function dateTimeLabel(value: string, timeZone: string, language: OrbitLanguage): string {
  const parts = new Intl.DateTimeFormat(localeTag(language), {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  if (language === "zh" || language === "ja") return `${part("year")}年${part("month")}月${part("day")}日 ${part("hour")}:${part("minute")}`;
  return `${part("month")}/${part("day")}/${part("year")} ${part("hour")}:${part("minute")}`;
}

function mediumLabel(medium: MeetingDetailsMedium, t: OrbitTranslator): string {
  if (medium.kind === "in_person") return t("meetingDetails.inPersonWithLocation", { location: t.literal(medium.location) });
  if (medium.kind === "video") return medium.provider === "google_meet" ? "Google Meet" : t("meetingDetails.video");
  return t("meetingDetails.phone");
}

export function meetingDetailsToView(value: MeetingDetailsContract, language: OrbitLanguage) {
  const t = createTranslator(language);
  const confirmed = value.confirmed;
  const statusLabels = {
    awaiting_response: t("meetingDetails.statusAwaiting"),
    cancelled: t("meetingDetails.statusCancelled"),
    completed: t("meetingDetails.statusCompleted"),
    confirmed: t("meetingDetails.statusConfirmed"),
    draft: t("meetingDetails.statusDraft"),
    negotiating: t("meetingDetails.statusNegotiating"),
    reschedule_pending: t("meetingDetails.statusReschedule"),
  } as const;
  const latestProposal = [...value.proposals].reverse().find((proposal) => proposal.note.trim());
  return {
    contactHref: value.contactId ? `/contacts/${encodeURIComponent(value.contactId)}` : null,
    eventHref: value.eventId ? `/events/${encodeURIComponent(value.eventId)}` : null,
    mediumLabel: confirmed ? mediumLabel(confirmed.medium, t) : t("meetingDetails.pendingTime"),
    proposalNote: latestProposal?.note.trim() ?? "",
    statusLabel: statusLabels[value.status],
    title: value.title,
    timeLabel: confirmed
      ? t("meetingDetails.timeSummary", {
          date: t.literal(dateTimeLabel(confirmed.startsAtUtc, confirmed.timezone, language)),
          duration: confirmed.durationMinutes,
          timeZone: t.literal(confirmed.timezone),
        })
      : t("meetingDetails.pendingTime"),
    updatedLabel: value.detailsUpdatedAt && value.detailsUpdatedBy
      ? t(value.detailsUpdatedBy === "you" ? "meetingDetails.updatedByYou" : "meetingDetails.updatedByOther", {
          date: t.literal(dateTimeLabel(value.detailsUpdatedAt, confirmed?.timezone ?? "UTC", language)),
        })
      : "",
  };
}
