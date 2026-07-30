import { resolveMobileAuthService } from "../../../../../features/auth/mobile-service-factory";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
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

  return (
    <>
      <OrbitReferenceStyles />
      {request && googleAvailable ? (
        <MobileGoogleAuth brokerRequest={request} />
      ) : (
        <main className="orbit-account-auth-page">
          <div className="orbit-account-auth-backdrop" />
          <section className="orbit-account-auth-modal" role="alert">
            <div className="orbit-account-auth-scroll">
              <div className="orbit-account-auth-head">
                <span className="eyebrow">ORBIT</span>
                <h1 className="h-title">Google 登录暂时不可用</h1>
                <p>请使用邮箱登录。</p>
              </div>
              <a
                className="btn btn-primary btn-block"
                href="/app/account/login"
              >
                返回邮箱登录
              </a>
            </div>
          </section>
        </main>
      )}
    </>
  );
}
