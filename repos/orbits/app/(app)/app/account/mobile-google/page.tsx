import { resolveMobileAuthService } from "../../../../../features/auth/mobile-service-factory";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import { MobileGoogleAuth } from "./mobile-google-auth";

export const dynamic = "force-dynamic";

export default async function MobileGooglePage({
  searchParams,
}: {
  searchParams?: Promise<{ request?: string | string[] }>;
}) {
  const requestValue = (await searchParams)?.request;
  const request = (
    Array.isArray(requestValue) ? requestValue[0] : requestValue
  )?.trim() ?? "";
  const mode = resolveFeatureMode();
  const googleAvailable = resolveMobileAuthService(mode)
    .enabledProviders()
    .includes("google");
  let language: OrbitLanguage = "zh";
  try {
    language = await getOrbitServerLanguage();
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("outside a request scope"))) throw error;
  }

  return <MobileGoogleAuth brokerRequest={request && googleAvailable ? request : undefined} language={language} />;
}
