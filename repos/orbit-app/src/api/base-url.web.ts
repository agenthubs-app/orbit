import {
  normalizeOrbitApiBaseUrl,
  validateOrbitApiBaseUrl,
  type BrowserApiBaseUrlResult
} from "./browser-api-origin";

// Expo's static exporter evaluates Web modules without a browser. The provider
// resolves window.location after hydration; an empty value never reaches API
// consumers because the provider keeps ready=false until then.
export const DEFAULT_ORBIT_API_BASE_URL = "";
export { normalizeOrbitApiBaseUrl, validateOrbitApiBaseUrl };
export type OrbitApiBaseUrlValidation = BrowserApiBaseUrlResult;
