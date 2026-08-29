export interface PushProviderInput {
  deliveryId: string;
  token: string;
  title: string;
  body: string;
  data: Readonly<{ notificationId: string; deepLink: string }>;
}

export type PushProviderResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; code: string; tokenInvalid?: boolean };

export interface PushProvider {
  send: (input: PushProviderInput) => Promise<PushProviderResult>;
}

export function createUnconfiguredPushProvider(): PushProvider {
  return {
    async send() {
      return { ok: false, code: "PUSH_PROVIDER_UNCONFIGURED" };
    },
  };
}
