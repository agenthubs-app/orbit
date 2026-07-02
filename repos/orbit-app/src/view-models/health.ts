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

export function healthPayloadToSummary(data: unknown): HealthCheckSummary {
  const payload = isRecord(data) ? data : {};
  const service = stringField(payload, "service") || "Orbit API";
  const status = stringField(payload, "status").toLowerCase();

  if (status === "ok") {
    return {
      detail: `${service} responded successfully.`,
      title: "Server reachable"
    };
  }

  return {
    detail: "Health details are unavailable.",
    title: "Server responded"
  };
}
