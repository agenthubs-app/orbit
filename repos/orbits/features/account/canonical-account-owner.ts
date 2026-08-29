import type { LiveAccountSessionGraph } from "./storage/account-live-record-provider";

export function resolveCanonicalAccountOwnerId(input: {
  authUserId: string;
  graph: LiveAccountSessionGraph;
}): string {
  const profile =
    input.graph.profiles.find((item) => item.id === input.authUserId) ??
    input.graph.profiles.find((item) => item.accountId === input.authUserId);
  const account = profile
    ? input.graph.accounts.find((item) => item.id === profile.accountId)
    : null;

  if (!profile || !account) {
    throw new Error(`No canonical account membership exists for ${input.authUserId}.`);
  }

  return account.id;
}
