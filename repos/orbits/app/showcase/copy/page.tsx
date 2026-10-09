import { cookies, headers } from "next/headers";

import { resolveRequestOrbitLanguage } from "../../(app)/app/orbit-language-core";
import { standardCopyFor } from "../../(app)/app/orbit-2026/copy/standard";
import styles from "./copy.module.css";

export const metadata = { title: "Copy · Orbit showcase", robots: { index: false } };

// R03: every standard phrase in the request language (?lang= / cookie / browser),
// for the 375 / 1440 check of the copy loop. Developer surface: group and key names
// are identifiers, not product copy.
export default async function CopyShowcasePage() {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const language = resolveRequestOrbitLanguage({
    header: requestHeaders.get("x-orbit-lang"),
    cookie: cookieStore.get("orbit-lang")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });
  const copy = standardCopyFor(language);
  return (
    <main data-orbit-2026="" lang={language} className={styles.page}>
      <h1 className={styles.title}>Copy · {language}</h1>
      <div className={styles.grid}>
        {Object.entries(copy).map(([group, entries]) => (
          <section key={group} className={styles.group}>
            <h2 className={styles.groupName}>{group}</h2>
            {Object.entries(entries).map(([key, text]) => (
              <div key={key} className={styles.row}>
                <span className={styles.key}>{key}</span>
                <span className={styles.text}>{text}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
