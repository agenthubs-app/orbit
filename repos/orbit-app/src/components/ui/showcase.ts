// RD-15: component and icon showcases are visible in development builds and in
// TestFlight builds (built with EXPO_PUBLIC_ORBIT_SHOWCASE=1), never in the App
// Store build.
export function showcaseEnabled(dev: boolean = __DEV__, flag: string | undefined = process.env.EXPO_PUBLIC_ORBIT_SHOWCASE): boolean {
  return dev || flag === "1";
}
