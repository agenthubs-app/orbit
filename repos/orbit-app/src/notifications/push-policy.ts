export function shouldRequestPushPermission(
  permissionStatus: string,
  optedIn: boolean,
): boolean {
  return permissionStatus !== "granted" && optedIn;
}

export function shouldRegisterPushToken(
  permissionStatus: string,
  optedIn: boolean,
): boolean {
  return permissionStatus === "granted" && optedIn;
}
