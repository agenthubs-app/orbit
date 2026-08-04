export interface AppointmentActionIdempotencyRegistry {
  keyFor(actionFingerprint: string): string;
}

export function createAppointmentActionIdempotencyRegistry(
  randomUuid: () => string = () => crypto.randomUUID(),
): AppointmentActionIdempotencyRegistry {
  const keys = new Map<string, string>();
  return {
    keyFor(actionFingerprint) {
      const existing = keys.get(actionFingerprint);
      if (existing) return existing;
      const key = `appointment:${randomUuid()}`;
      if (key.length > 96 || !/^[\x21-\x7e]+$/.test(key)) throw new Error("Appointment idempotency key generator returned an invalid value.");
      keys.set(actionFingerprint, key);
      return key;
    },
  };
}
