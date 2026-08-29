import type { PushProvider, PushProviderResult } from "./push-provider";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ExpoPushProviderOptions {
  accessToken?: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
  sleep?: (milliseconds: number) => Promise<void>;
}

const DEFAULT_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const RETRY_DELAYS = [500, 1_500] as const;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(value: unknown): string {
  return String(value || "EXPO_PUSH_REJECTED")
    .replace(/([a-z])([A-Z])/gu, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toUpperCase();
}

function ticketResult(payload: unknown): PushProviderResult {
  if (!isRecord(payload)) return { ok: false, code: "EXPO_PUSH_INVALID_RESPONSE" };
  const rawTicket = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  if (!isRecord(rawTicket)) return { ok: false, code: "EXPO_PUSH_MISSING_TICKET" };
  if (rawTicket.status === "ok" && typeof rawTicket.id === "string" && rawTicket.id) {
    return { ok: true, providerMessageId: rawTicket.id };
  }
  const details = isRecord(rawTicket.details) ? rawTicket.details : {};
  const code = errorCode(details.error ?? rawTicket.message);
  return {
    code,
    ok: false,
    ...(code === "DEVICE_NOT_REGISTERED" ? { tokenInvalid: true } : {}),
  };
}

export function createExpoPushProvider({
  accessToken,
  endpoint = DEFAULT_ENDPOINT,
  fetchImpl = fetch,
  sleep = delay,
}: ExpoPushProviderOptions = {}): PushProvider {
  return {
    async send(input) {
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
        try {
          const response = await fetchImpl(endpoint, {
            body: JSON.stringify({
              body: input.body,
              data: input.data,
              sound: "default",
              title: input.title,
              to: input.token,
            }),
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              ...(accessToken?.trim() ? { Authorization: `Bearer ${accessToken.trim()}` } : {}),
            },
            method: "POST",
            signal: AbortSignal.timeout(10_000),
          });
          if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS.length) {
            await sleep(RETRY_DELAYS[attempt]);
            continue;
          }
          if (!response.ok) return { ok: false, code: `EXPO_PUSH_HTTP_${response.status}` };
          return ticketResult(await response.json());
        } catch {
          if (attempt < RETRY_DELAYS.length) {
            await sleep(RETRY_DELAYS[attempt]);
            continue;
          }
          return { ok: false, code: "EXPO_PUSH_NETWORK_ERROR" };
        }
      }
      return { ok: false, code: "EXPO_PUSH_RETRY_EXHAUSTED" };
    },
  };
}
