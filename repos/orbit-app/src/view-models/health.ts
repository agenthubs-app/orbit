export interface HealthCheckSummary {
  detail: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : "";
}

export function healthPayloadToSummary(data: unknown, t: OrbitTranslator = createTranslator("zh")): HealthCheckSummary {
  const payload = isRecord(data) ? data : {};
  const status = stringField(payload, "status").toLowerCase();

  if (status === "ok") {
    return {
      detail: t("settings.healthReadyDetail"),
      title: t("settings.healthReadyTitle")
    };
  }

  return {
    detail: t("settings.healthRespondedDetail"),
    title: t("settings.healthRespondedTitle")
  };
}
import { createTranslator, type OrbitTranslator } from "../i18n/messages";
