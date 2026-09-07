let pendingDeviceWrite: Promise<unknown> = Promise.resolve();
let generation = 0;
const sessionStops = new Set<() => void>();

function enqueueDeviceWrite<T>(write: () => Promise<T>): Promise<T> {
  const pending = pendingDeviceWrite.then(write);
  // A failed registration must not prevent either registry's final revocation.
  pendingDeviceWrite = pending.catch(() => undefined);
  return pending;
}

export function createPushRegistrationSession() {
  let active = true;
  const stop = () => {
    active = false;
    sessionStops.delete(stop);
  };
  sessionStops.add(stop);
  return {
    stop,
    run(register: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
      const startedAt = generation;
      const isCurrent = () => active && startedAt === generation;
      return enqueueDeviceWrite(async () => {
        if (isCurrent()) await register(isCurrent);
      });
    },
  };
}

export function revokePushDeviceRegistrations(
  revocations: readonly (() => Promise<boolean>)[],
  { endSession = false }: { endSession?: boolean } = {},
): Promise<boolean> {
  generation++;
  if (endSession) sessionStops.forEach((stop) => stop());
  // Wait for in-flight POSTs, not just preflight checks, before the final DELETEs.
  return enqueueDeviceWrite(async () => {
    const results = await Promise.allSettled(
      revocations.map((revoke) => Promise.resolve().then(revoke)),
    );
    return results.every((result) => result.status === "fulfilled" && result.value);
  });
}
