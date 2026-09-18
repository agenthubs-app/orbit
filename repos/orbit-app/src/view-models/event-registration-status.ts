import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator } from "../i18n/messages";

export const EVENT_REGISTRATION_BLOCKING_REASONS = ["configuration_required", "migration_in_progress", "invalid_window", "temporarily_unavailable"] as const;
export type EventRegistrationBlockingReasonView = (typeof EVENT_REGISTRATION_BLOCKING_REASONS)[number];

export function eventRegistrationStatusCopy(reason: unknown, language: OrbitLanguage): string {
  const t = createTranslator(language);
  if (reason === "configuration_required") return t("registration.reasonConfiguration");
  if (reason === "migration_in_progress") return t("registration.reasonMigration");
  if (reason === "invalid_window") return t("registration.reasonInvalidWindow");
  return t("registration.reasonTemporary");
}
