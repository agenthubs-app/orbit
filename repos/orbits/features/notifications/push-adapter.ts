export interface OrbitPushMessage {
  token: string;
  title: string;
  body: string;
  data: Readonly<Record<string, string>>;
}

export type OrbitPushReceipt =
  | { status: "pending" }
  | { status: "ok" }
  | { status: "error"; error?: string };

export interface OrbitPushAdapter {
  /**
   * A successful send is a provider ticket, not proof that the device received
   * the notification. Adapters may set verified only when they have already
   * validated a provider receipt.
   */
  send: (message: OrbitPushMessage) => Promise<{
    receiptId: string;
    verified?: boolean;
  }>;
  getReceipt?: (receiptId: string) => Promise<OrbitPushReceipt>;
}

export function createConfiguredExpoPushAdapter(
  env: NodeJS.ProcessEnv = process.env,
): OrbitPushAdapter | null {
  const endpoint = env.ORBIT_EXPO_PUSH_ENDPOINT?.trim();
  const accessToken = env.ORBIT_EXPO_PUSH_ACCESS_TOKEN?.trim();
  if (!endpoint || !accessToken) return null;
  const receiptEndpoint = env.ORBIT_EXPO_PUSH_RECEIPT_ENDPOINT?.trim();

  const adapter: OrbitPushAdapter = {
    async send(message) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to: message.token,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: "default",
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        data?: { id?: unknown; status?: unknown };
      };
      if (
        !response.ok ||
        result.data?.status !== "ok" ||
        typeof result.data.id !== "string"
      ) {
        throw new Error(`Expo push adapter returned HTTP ${response.status}.`);
      }
      return { receiptId: result.data.id };
    },
  };
  if (receiptEndpoint) {
    adapter.getReceipt = async (receiptId) => {
      const response = await fetch(receiptEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ids: [receiptId] }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        data?: Record<string, { status?: unknown; message?: unknown; details?: { error?: unknown } }>;
      };
      const receipt = result.data?.[receiptId];
      if (!response.ok || !receipt || typeof receipt.status !== "string") {
        throw new Error(`Expo receipt adapter returned HTTP ${response.status}.`);
      }
      if (receipt.status === "ok") return { status: "ok" };
      if (receipt.status === "pending") return { status: "pending" };
      const error = receipt.details?.error ?? receipt.message;
      return {
        status: "error",
        error: typeof error === "string" ? error : "Expo receipt reported an error.",
      };
    };
  }
  return adapter;
}

export function shouldSendPreEventNudge(input: {
  now: string;
  startsAt: string;
  viewedAt?: string;
  costlyMiss: boolean;
  pushEnabled: boolean;
  quietHours?:
    | { start: string; end: string }
    | { startHour: number; endHour: number };
  timeZone?: string;
}): boolean {
  if (!input.pushEnabled || !input.costlyMiss || input.viewedAt) return false;
  const nowMs = Date.parse(input.now);
  const startsAtMs = Date.parse(input.startsAt);
  const remaining = startsAtMs - nowMs;
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(startsAtMs) ||
    remaining <= 0 ||
    remaining > 2 * 60 * 60_000
  ) {
    return false;
  }
  const configuredQuiet = input.quietHours ?? {
    start: "22:00",
    end: "08:00",
  };
  const quiet =
    "start" in configuredQuiet
      ? configuredQuiet
      : {
          start: `${String(configuredQuiet.startHour).padStart(2, "0")}:00`,
          end: `${String(configuredQuiet.endHour).padStart(2, "0")}:00`,
        };
  const timeZone = input.timeZone ?? "UTC";
  const parseMinutes = (value: string): number | null => {
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const startMinute = parseMinutes(quiet.start);
  const endMinute = parseMinutes(quiet.end);
  if (startMinute === null || endMinute === null) return false;
  let zonedParts: Intl.DateTimeFormatPart[];
  try {
    zonedParts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      timeZone,
    }).formatToParts(new Date(nowMs));
  } catch {
    return false;
  }
  const hour = Number(
    zonedParts.find((part) => part.type === "hour")?.value,
  );
  const minute = Number(
    zonedParts.find((part) => part.type === "minute")?.value,
  );
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  const localMinute = hour * 60 + minute;
  const inQuietHours =
    startMinute === endMinute
      ? false
      : startMinute > endMinute
        ? localMinute >= startMinute || localMinute < endMinute
        : localMinute >= startMinute && localMinute < endMinute;
  return !inQuietHours;
}
