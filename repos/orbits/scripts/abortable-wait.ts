export function abortableWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    timer = setTimeout(finish, Math.max(0, milliseconds));
    if (signal.aborted) finish();
    else signal.addEventListener("abort", finish, { once: true });
  });
}
