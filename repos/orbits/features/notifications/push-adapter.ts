export interface OrbitPushMessage {
  token: string;
  title: string;
  body: string;
  data: Readonly<Record<string, string>>;
}

export interface OrbitPushAdapter {
  send: (message: OrbitPushMessage) => Promise<{ receiptId: string }>;
}

export function createConfiguredExpoPushAdapter(
  env: NodeJS.ProcessEnv = process.env,
): OrbitPushAdapter | null {
  const endpoint = env.ORBIT_EXPO_PUSH_ENDPOINT?.trim();
  const accessToken = env.ORBIT_EXPO_PUSH_ACCESS_TOKEN?.trim();
  if (!endpoint || !accessToken) return null;

  return {
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
}

export function shouldSendPreEventNudge(input: {
  now: string;
  startsAt: string;
  viewedAt?: string;
  costlyMiss: boolean;
  pushEnabled: boolean;
  quietHours?: { startHour: number; endHour: number };
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
  const quiet = input.quietHours ?? { startHour: 22, endHour: 8 };
  const hour = new Date(input.now).getHours();
  const inQuietHours =
    quiet.startHour > quiet.endHour
      ? hour >= quiet.startHour || hour < quiet.endHour
      : hour >= quiet.startHour && hour < quiet.endHour;
  return !inQuietHours;
}
