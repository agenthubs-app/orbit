const guarded = new WeakSet<object>();

/**
 * A pg Pool emits "error" when an idle client's connection drops (the Neon pooler restarted, the
 * compute scaled to zero, the function instance was frozen past a TCP timeout). With no listener
 * Node treats it as an unhandled "error" event and the process dies. The pool already discards the
 * broken client; this only logs it, so the next query simply opens a fresh connection.
 */
export function guardIdlePoolErrors<TPool extends object>(pool: TPool): TPool {
  const emitter = pool as { on?: (event: "error", listener: (error: Error) => void) => unknown };
  if (typeof emitter.on !== "function" || guarded.has(pool)) return pool;
  guarded.add(pool);
  emitter.on("error", (error: Error) => {
    console.warn(JSON.stringify({ event: "postgres_idle_client_error", message: String(error?.message ?? error).slice(0, 160) }));
  });
  return pool;
}
