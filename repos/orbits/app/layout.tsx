/**
 * 应用根 layout。
 *
 * 这里声明全局 metadata 和基础样式，所有 App Router 页面都会包在这个 layout 下。
 */
export const metadata = {
  title: "Orbit",
  description: "An event-grounded relationship operating system.",
};

const globalStyles = `
  :root {
    color-scheme: light;
    --orbit-ink: #17211b;
    --orbit-muted: #52645b;
    --orbit-field: #f3f6f4;
    --orbit-line: #d6ddd8;
    --orbit-deep: #245b4e;
    --orbit-signal: #b85a42;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: var(--orbit-field);
    color: var(--orbit-ink);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
    background: linear-gradient(90deg, var(--orbit-deep), var(--orbit-signal));
    height: 5px;
    width: min(180px, 40vw);
  }

  .orbit-entry {
    display: grid;
    gap: 16px;
  }

  .orbit-label {
    color: var(--orbit-deep);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.74rem;
    letter-spacing: 0;
    line-height: 1.3;
    margin: 0;
    text-transform: uppercase;
  }

  .orbit-title {
    font-family: Georgia, Cambria, "Times New Roman", Times, serif;
    font-size: 5.4rem;
    font-weight: 400;
    letter-spacing: 0;
    line-height: 0.9;
    margin: 0;
  }

  .orbit-copy {
    color: var(--orbit-muted);
    font-size: 1.15rem;
    line-height: 1.65;
    margin: 0;
    max-width: 760px;
  }

  .orbit-start-link {
    align-items: center;
    border: 1px solid var(--orbit-deep);
    color: var(--orbit-ink);
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
    outline: 3px solid var(--orbit-signal);
    outline-offset: 3px;
  }

  .orbit-starter {
    background: #ffffff;
    border-left: 5px solid var(--orbit-signal);
    display: grid;
    gap: 24px;
    grid-template-columns: minmax(180px, 0.35fr) minmax(0, 1fr);
    padding: 24px;
  }

  .orbit-starter-kicker {
    color: var(--orbit-signal);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.3;
    margin: 0 0 10px;
    text-transform: uppercase;
  }

  .orbit-starter h2 {
    font-family: Georgia, Cambria, "Times New Roman", Times, serif;
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
    border-top: 1px solid var(--orbit-line);
    display: grid;
    gap: 6px;
    padding-top: 14px;
  }

  .orbit-starter-list div:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .orbit-starter-list dt {
    color: var(--orbit-ink);
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.35;
  }

  .orbit-starter-list dd {
    color: var(--orbit-muted);
    font-size: 0.94rem;
    line-height: 1.5;
    margin: 0;
  }

  .orbit-record {
    border-bottom: 1px solid var(--orbit-line);
    border-top: 1px solid var(--orbit-line);
    display: grid;
    gap: 24px;
    grid-template-columns: minmax(160px, 0.32fr) minmax(0, 1fr);
    padding: 24px 0;
  }

  .orbit-record-kicker {
    color: var(--orbit-deep);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
    color: var(--orbit-ink);
    font-size: 0.94rem;
    font-weight: 700;
    line-height: 1.35;
  }

  .orbit-record-list dd {
    color: var(--orbit-muted);
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
    border-bottom: 1px solid var(--orbit-line);
    display: grid;
    gap: 10px;
    padding: 22px 24px 22px 0;
  }

  .orbit-principles span {
    color: var(--orbit-signal);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <style>{globalStyles}</style>
        {children}
      </body>
    </html>
  );
}
