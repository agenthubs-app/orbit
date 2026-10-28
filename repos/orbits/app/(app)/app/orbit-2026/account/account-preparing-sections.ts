// The settings sections still shown as 「準備中」 (/app/settings/[section]). A plain module, not the client
// page: the server route calls accountPreparingSection to decide between the page and notFound().
const deferred = ["account", "notifications", "permissions", "export", "help"] as const;
export type AccountPreparingSection = (typeof deferred)[number];

export function accountPreparingSection(value: string): AccountPreparingSection | null {
  return deferred.find(section => section === value) ?? null;
}
