import type { ModuleMode } from "../../shared/services/module-mode";
import { resolveAuthUserService } from "./service-factory";
import { isOAuthProviderEnabled } from "./oauth-providers";
import {
  createMobileAuthService,
  type MobileAuthService,
} from "./mobile-service";
import {
  createConfiguredMobileAuthExchangeProvider,
  createMemoryMobileAuthExchangeProvider,
} from "./storage/mobile-auth-exchange-provider";

const memoryExchangeProvider = createMemoryMobileAuthExchangeProvider();

export interface ResolveMobileAuthServiceOptions {
  origin?: string;
}

function authSecret(): string | null {
  const value = (
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  )?.trim();

  return value || null;
}

export function resolveMobileAuthService(
  mode?: ModuleMode | string,
  options: ResolveMobileAuthServiceOptions = {},
): MobileAuthService {
  const live = mode?.trim().toLowerCase() === "live";

  return createMobileAuthService({
    authUsers: resolveAuthUserService(mode),
    brokerSecret: authSecret(),
    exchangeProvider: live
      ? createConfiguredMobileAuthExchangeProvider()
      : memoryExchangeProvider,
    isProviderEnabled: isOAuthProviderEnabled,
    origin:
      options.origin ??
      process.env.AUTH_URL ??
      process.env.NEXTAUTH_URL ??
      "http://localhost:3000",
  });
}
