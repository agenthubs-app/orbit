import { cookies, headers } from "next/headers";
import { SessionProvider } from "next-auth/react";

import { OrbitStarfieldHome } from "./(app)/app/orbit-starfield-home";
import { OrbitLanguageProvider } from "./(app)/app/orbit-language-context";
import { normalizeOrbitLanguage } from "./(app)/app/orbit-language-core";
import { OrbitReferenceStyles } from "./(app)/app/orbit-reference-styles";
import { auth } from "../auth";

// The starfield journey is Orbit's homepage: `/` and `/app` render the same page.
export default async function Page() {
  const [session, requestHeaders, cookieStore] = await Promise.all([
    auth(),
    headers(),
    cookies(),
  ]);
  const language = normalizeOrbitLanguage(
    requestHeaders.get("x-orbit-lang") ?? cookieStore.get("orbit-lang")?.value,
  );

  return (
    <>
      <OrbitReferenceStyles />
      <SessionProvider refetchOnWindowFocus={false} session={session}>
        <OrbitLanguageProvider initialLanguage={language}>
          <OrbitStarfieldHome authenticated={Boolean(session?.user?.id)} />
        </OrbitLanguageProvider>
      </SessionProvider>
    </>
  );
}
