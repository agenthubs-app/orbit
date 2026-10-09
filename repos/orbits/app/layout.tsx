/**
 * 应用根 layout。
 *
 * 这里声明全局 metadata 和基础样式，所有 App Router 页面都会包在这个 layout 下。
 */
import { orbitHtmlLang, resolveRequestOrbitLanguage, type OrbitLanguage } from "./(app)/app/orbit-language-core";
import "./(app)/app/orbit-2026/tokens.css";
import { ORBIT_THEME_INIT_SCRIPT } from "./(app)/app/orbit-theme-init";

export const metadata = {
  title: "Orbit",
  description: "An event-grounded relationship operating system.",
  icons: {
    apple: "/icon.svg",
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

const ORBIT_WEB_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;800&family=Noto+Sans+SC:wght@400;500;700;800&display=swap";

// Colours, radius, type and motion come from the generated design tokens
// (orbit-2026/tokens.css, imported above; R01).
const globalStyles = `
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: var(--font);
  }

  .orbit-page {
    display: grid;
    min-height: 100vh;
    padding: 56px 24px;
    place-items: center;
  }

  .orbit-shell {
    display: grid;
    gap: 30px;
    margin: 0 auto;
    max-width: 980px;
  }

  .orbit-rule {
    background: var(--accent-text);
    height: 5px;
    width: min(180px, 40vw);
  }

  .orbit-entry {
    display: grid;
    gap: 16px;
  }

  .orbit-label {
    color: var(--accent-text);
    font-family: var(--font-num);
    font-size: 0.74rem;
    letter-spacing: 0;
    line-height: 1.3;
    margin: 0;
    text-transform: uppercase;
  }

  .orbit-title {
    font-family: var(--font);
    font-size: 5.4rem;
    font-weight: 400;
    letter-spacing: 0;
    line-height: 0.9;
    margin: 0;
  }

  .orbit-copy {
    color: var(--ink-2);
    font-size: 1.15rem;
    line-height: 1.65;
    margin: 0;
    max-width: 760px;
  }

  .orbit-start-link {
    align-items: center;
    border: 1px solid var(--accent-text);
    color: var(--ink);
    display: inline-flex;
    font-size: 0.95rem;
    font-weight: 700;
    justify-content: center;
    line-height: 1.2;
    margin-top: 4px;
    min-height: 44px;
    padding: 12px 16px;
    text-decoration: none;
    width: fit-content;
  }

  .orbit-start-link:focus-visible {
    outline: 3px solid var(--coral-text);
    outline-offset: 3px;
  }

  .orbit-starter {
    background: #ffffff;
    border-left: 5px solid var(--coral-text);
    display: grid;
    gap: 24px;
    grid-template-columns: minmax(180px, 0.35fr) minmax(0, 1fr);
    padding: 24px;
  }

  .orbit-starter-kicker {
    color: var(--coral-text);
    font-family: var(--font-num);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.3;
    margin: 0 0 10px;
    text-transform: uppercase;
  }

  .orbit-starter h2 {
    font-family: var(--font);
    font-size: 1.85rem;
    font-weight: 400;
    letter-spacing: 0;
    line-height: 1.08;
    margin: 0;
  }

  .orbit-starter-list {
    display: grid;
    gap: 14px;
    margin: 0;
  }

  .orbit-starter-list div {
    border-top: 1px solid var(--line);
    display: grid;
    gap: 6px;
    padding-top: 14px;
  }

  .orbit-starter-list div:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .orbit-starter-list dt {
    color: var(--ink);
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.35;
  }

  .orbit-starter-list dd {
    color: var(--ink-2);
    font-size: 0.94rem;
    line-height: 1.5;
    margin: 0;
  }

  .orbit-record {
    border-bottom: 1px solid var(--line);
    border-top: 1px solid var(--line);
    display: grid;
    gap: 24px;
    grid-template-columns: minmax(160px, 0.32fr) minmax(0, 1fr);
    padding: 24px 0;
  }

  .orbit-record-kicker {
    color: var(--accent-text);
    font-family: var(--font-num);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.45;
    margin: 0;
    text-transform: uppercase;
  }

  .orbit-record-list {
    display: grid;
    gap: 18px 22px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: 0;
  }

  .orbit-record-list div {
    display: grid;
    gap: 8px;
  }

  .orbit-record-list dt {
    color: var(--ink);
    font-size: 0.94rem;
    font-weight: 700;
    line-height: 1.35;
  }

  .orbit-record-list dd {
    color: var(--ink-2);
    font-size: 0.94rem;
    line-height: 1.55;
    margin: 0;
  }

  .orbit-principles {
    display: grid;
    gap: 0;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .orbit-principles li {
    border-bottom: 1px solid var(--line);
    display: grid;
    gap: 10px;
    padding: 22px 24px 22px 0;
  }

  .orbit-principles span {
    color: var(--coral-text);
    font-family: var(--font-num);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.3;
    text-transform: uppercase;
  }

  .orbit-principles p {
    color: #25322c;
    font-size: 0.98rem;
    line-height: 1.55;
    margin: 0;
  }

  @media (max-width: 760px) {
    .orbit-page {
      padding: 32px 18px;
    }

    .orbit-principles {
      grid-template-columns: 1fr;
    }

    .orbit-record {
      grid-template-columns: 1fr;
    }

    .orbit-starter {
      grid-template-columns: 1fr;
      padding: 20px;
    }

    .orbit-start-link {
      width: 100%;
    }

    .orbit-record-list {
      grid-template-columns: 1fr;
    }

    .orbit-title {
      font-size: 3.25rem;
    }
  }
`;

export default async function RootLayout({ children }) {
  let language: OrbitLanguage;
  try {
    const { cookies, headers } = await import("next/headers");
    const requestHeaders = await headers();
    const cookieStore = await cookies();
    language = resolveRequestOrbitLanguage({
      header: requestHeaders.get("x-orbit-lang"),
      cookie: cookieStore.get("orbit-lang")?.value,
      acceptLanguage: requestHeaders.get("accept-language"),
    });
  } catch {
    language = resolveRequestOrbitLanguage({ header: null, cookie: null, acceptLanguage: null });
  }
  const htmlLang = orbitHtmlLang(language);

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ORBIT_THEME_INIT_SCRIPT }} />
        {/* R01 / RD-09: the one place web fonts load. Japanese and Chinese UI
            fall back to Noto Sans JP / SC where Hiragino / PingFang are missing;
            English uses system fonts (orbit-2026/tokens.css --font-*). */}
        <link href="https://fonts.googleapis.com" rel="preconnect" />
        <link crossOrigin="" href="https://fonts.gstatic.com" rel="preconnect" />
        <link
          href={ORBIT_WEB_FONTS_HREF}
          rel="stylesheet"
        />
      </head>
      <body>
        <style>{globalStyles}</style>
        {children}
      </body>
    </html>
  );
}
