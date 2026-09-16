export type Trigger = "launch" | "foreground" | "network" | "manual" | "notification" | "hint" | "poll";

export type Clock = {
  now(): number;
  random(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

export interface InvalidationTransport {
  start(input: {
    signal: AbortSignal;
    onHint: (value: unknown) => void;
    onError: (code: "network" | "auth" | "invalid") => void;
  }): Promise<() => void>;
}

export type ValidatedInvalidation = {
  registryVersion: number;
  serverTime: string;
  domains: readonly {
    domainId: string;
    schemaVersion: number;
    authorizationEpoch: string;
    watermark: string;
    reason: "unchanged" | "changed" | "reset-required" | "not-authorized";
  }[];
};

export type TriggerCoordinator = {
  request(reason: Trigger, domains: readonly string[]): Promise<void>;
  hint(value: unknown): void;
  dispose(): void;
};
