export type AccountPermissionStatus = "granted" | "denied" | "undetermined";
export async function actOnPermission(status: AccountPermissionStatus, adapter: { request: () => Promise<unknown>; openSettings: () => Promise<unknown> }): Promise<void> {
  if (status === "undetermined") await adapter.request();
  else await adapter.openSettings();
}
