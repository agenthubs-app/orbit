export function shouldHideDevSurface(nodeEnv: string | undefined) {
  return nodeEnv === "production";
}
