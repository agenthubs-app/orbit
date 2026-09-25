export async function communicationRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, { ...options, cache: "no-store", headers: { "content-type": "application/json", ...options.headers } });
  const envelope = await response.json();
  if (!response.ok || envelope.success !== true) throw new Error(envelope.error?.code ?? "Communication request failed");
  return envelope.data;
}

export async function readContactMessageActor(signal?: AbortSignal): Promise<string> {
  const data = await communicationRequest("/api/account/me", { signal });
  const actor = (data as { account?: { id?: unknown } })?.account?.id;
  if (typeof actor !== "string" || !actor.trim()) throw new Error("No account");
  return actor;
}
