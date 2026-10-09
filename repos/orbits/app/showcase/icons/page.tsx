import { Icon } from "../../(app)/app/orbit-2026/ui/Icon";
import { designIconNames, designIconSources, designIconSpec } from "../../../shared/design/icons";
import styles from "./icons.module.css";

export const metadata = { title: "Icons · Orbit showcase", robots: { index: false } };

// R02: every icon in the source, for side-by-side checks against the design kit
// (docs/designs/redesign-2026-10/kit). Drawn icons carry ✎. Developer surface:
// names are identifiers, not product copy.
export default function IconShowcasePage() {
  return (
    <main data-orbit-2026="" className={styles.page}>
      <h1 className={styles.title}>Icons · {designIconNames.length}</h1>
      <div className={styles.row}>
        {designIconSpec.sizes.map((size) => (
          <div key={size} className={styles.sample}>
            <Icon name="calendar" size={size} />
            <span className={styles.caption}>{size}</span>
          </div>
        ))}
        <div className={`${styles.sample} ${styles.on}`}>
          <Icon name="users" size={21} />
          <span className={styles.caption}>on</span>
        </div>
        <div className={`${styles.sample} ${styles.off}`}>
          <Icon name="users" size={21} />
          <span className={styles.caption}>off</span>
        </div>
      </div>
      <div className={styles.grid}>
        {designIconNames.map((name) => (
          <div key={name} className={styles.cell}>
            <span className={styles.chip}><Icon name={name} size={24} /></span>
            <span className={styles.caption}>{designIconSources[name] === "drawn" ? `${name} ✎` : name}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
