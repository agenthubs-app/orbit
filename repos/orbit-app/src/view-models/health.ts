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
  const status = stringField(payload, "status").toLowerCase();

  if (status === "ok") {
    return {
      detail: "Orbit 服务响应正常，可以继续使用。",
      title: "服务器可用"
    };
  }

  return {
    detail: "服务器已经响应，但暂时无法读取健康详情。",
    title: "服务器已响应"
  };
}
