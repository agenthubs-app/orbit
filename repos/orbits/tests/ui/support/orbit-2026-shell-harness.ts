import type { Browser, Page } from "playwright";

import { bundle, errorsOf, open } from "./orbit-2026-harness";

// R07: the shell rendered for real with stand-ins for Next's router, NextAuth and
// the inbox data module. `window.shellFixture` holds { path, lang, unread, calls }.
export const SHELL_STUBS: Record<string, string> = {
  "^next/navigation$": `
    const f = () => window.shellFixture;
    const record = (entry) => f().calls.push(entry);
    export const usePathname = () => f().path;
    export const useRouter = () => ({ push: (href) => record({ push: href }), replace: (href) => record({ replace: href }), back() {}, refresh() {} });
    export const useSearchParams = () => new URLSearchParams(location.search);
    export const redirect = (href) => record({ redirect: href });
  `,
  "^next/link$": `
    import React from "react";
    export default React.forwardRef(function Link({ href, prefetch, replace, scroll, ...rest }, ref) {
      return <a ref={ref} href={typeof href === "string" ? href : String(href)} {...rest} />;
    });
  `,
  "^next-auth/react$": `
    import React from "react";
    export const useSession = () => ({ status: "authenticated", data: { user: { name: "Hana Yamada", email: "hana@orbit.test" } } });
    export const signOut = (options) => window.shellFixture.calls.push({ signOut: options?.callbackUrl });
    export const SessionProvider = ({ children }) => children;
  `,
  "relationship-inbox-panel$": `
    export const RELATIONSHIP_INBOX_COMPOSE_EVENT = "orbit:relationship-inbox-compose";
    export const RELATIONSHIP_INBOX_OPEN_EVENT = "orbit:relationship-inbox-open";
    export const INBOX_PAGE_COMPOSE_EVENT = "orbit:inbox-page-compose";
    export const stashInboxComposeSeed = (seed) => window.shellFixture.calls.push({ seed });
    export async function readInboxUnreadCounts(language) {
      window.shellFixture.calls.push({ inboxRead: language });
      return window.shellFixture.unread ? { threads: 2, alerts: 0 } : { threads: 0, alerts: 0 };
    }
  `,
  "orbit-language-context$": `
    export function useOrbitLanguage() {
      const language = window.shellFixture.lang;
      return { language, preserveHref: (h) => h, setLanguage: (next) => window.shellFixture.calls.push({ language: next }), t: (copy) => copy[language] ?? copy.en };
    }
  `,
};

export async function shellBundle(page: string): Promise<{ js: string; css: string }> {
  return bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { Orbit2026Shell } from "./app/(app)/app/orbit-2026/shell/Orbit2026Shell";
    import { ShellPage } from "./app/(app)/app/orbit-2026/shell/slots";
    import { OrbitAskProvider } from "./app/(app)/app/orbit-global-ask/orbit-ask-context";
    ${page}
    const f = window.shellFixture;
    createRoot(document.getElementById("root")).render(
      <OrbitAskProvider><Orbit2026Shell language={f.lang} signedIn={f.signedIn}><TestPage /></Orbit2026Shell></OrbitAskProvider>
    );
  `, SHELL_STUBS);
}

export const LEGACY_PAGE = `
  function TestPage() {
    const f = window.shellFixture;
    return <>
      {f.demo ? <ShellPage title="人脈" demoPill={<button type="button" data-demo-pill>Demo</button>} /> : null}
      {f.rail ? <ShellPage title="ホーム" rightRail /> : null}
      <main data-orbit-real-page="legacy" style={{ minHeight: 1600 }}><button type="button">legacy button</button><p data-last>last line of the page</p>
        {/* A legacy page's own fixed bottom control (like the event page's ask button) lifted by the shell's inset. */}
        <button type="button" data-fixed-dock style={{ position: "fixed", right: 14, bottom: "calc(14px + env(safe-area-inset-bottom) + var(--orbit-shell-bottom-inset, 0px))", width: 54, height: 54 }}>dock</button>
      </main>
    </>;
  }
`;

export async function openShell(browser: Browser, code: { js: string; css: string }, fixture: { path: string; lang?: string; signedIn?: boolean; unread?: boolean; demo?: boolean; rail?: boolean }, options: { width?: number; dark?: boolean } = {}): Promise<Page> {
  const page = await open(browser, code, { ...options, html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ lang: "ja", signedIn: true, unread: false, calls: [], ...fixture })}</script>`.replace("<script>", "<script>") });
  return page;
}

export { errorsOf };
