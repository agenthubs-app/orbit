"use client";

/**
 * agent-design AG13 (approved visual draft 2026-11-18, D4/D5): a private event opened from 「我的活动」 — in the right rail on a
 * wide screen, a bottom sheet on a phone. Read only: «我去过（自己记的）», the records linked to it, and one way to change it
 * — 「在 iOrbit 里改」 opens the chat with the event in the input (every change is a confirmation card there).
 */
import type { MyEventItem } from "../../../../../shared/contract/events-mine";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { Icon, useStandardCopy } from "../ui";
import { allDayLabelOf, eventWhen } from "./events-model";
import styles from "./events.module.css";

const DAY_PART_KEYS = ["morning", "noon", "afternoon", "evening", "night"] as const;

function attendedLine(item: MyEventItem, language: OrbitLanguage, words: Record<string, string>): string {
  const self = item.selfAttendance;
  if (!self) return "";
  const day = eventWhen(self.attendedOn, language);
  const parts = (self.dayParts ?? []).filter((part): part is (typeof DAY_PART_KEYS)[number] => (DAY_PART_KEYS as readonly string[]).includes(part)).map((part) => words[part]);
  return [`${day}${parts.length ? ` ${parts.join("、")}` : ""}`, self.selfNote].filter(Boolean).join(" · ");
}

export function prefillOf(item: MyEventItem, language: OrbitLanguage, template: string, allDayLabel = ""): string {
  return template.replace("{title}", item.title).replace("{day}", eventWhen(item.startsAt, language, allDayLabelOf(item, allDayLabel)));
}

// `titled`: the drawer (phone) already shows the title in its own header, so the panel leaves it out.
export function PrivateEventPanel({ item, language, titled = false }: { item: MyEventItem; language: OrbitLanguage; titled?: boolean }) {
  const std = useStandardCopy();
  const words = std.myEvents as Record<string, string>;
  const hrefOf = (kind: string, id: string) => (kind === "memo" ? `/app/notes/${encodeURIComponent(id)}` : kind === "todo" ? `/app/task?seg=todo&task=${encodeURIComponent(id)}` : "/app/task?seg=calendar");
  return (
    <div className={styles.privatePanel} data-events-private={item.eventId}>
      <div className={styles.row} style={{ gap: 10, alignItems: "flex-start" }}>
        <span className={`${styles.emo} ${styles.t_lav}`} aria-hidden>{item.emoji}</span>
        <div className={styles.grow}>
          {titled ? null : <b className={styles.privateTitle}>{item.title}</b>}
          <div className={styles.lbl}>{[eventWhen(item.startsAt, language, allDayLabelOf(item, std.myEvents.allDay)), item.venue].filter(Boolean).join(" · ")}</div>
        </div>
        <span className={`${styles.chip} ${styles.c_lav}`}><Icon name="lock" size={12} />{words.privateChip}</span>
      </div>
      <p className={styles.sub}>{words.onlyYou}</p>
      {item.selfAttendance ? (
        <section className={styles.privateSection}>
          <h4>{words.attendedTitle}</h4>
          <div className={styles.lbl}>{attendedLine(item, language, words)}</div>
        </section>
      ) : null}
      <section className={styles.privateSection}>
        <h4>{words.relatedTitle}</h4>
        {(item.related ?? []).length ? (
          <div className={styles.list}>
            {(item.related ?? []).map((record) => (
              <a key={`${record.kind}:${record.id}`} className={styles.li} href={hrefOf(record.kind, record.id)} style={{ color: "inherit", textDecoration: "none" }}>
                <span className={styles.lbl}>{words[record.kind]}</span>
                <div className={styles.meta}><b>{record.label}</b></div>
                <Icon name="right" size={16} />
              </a>
            ))}
          </div>
        ) : <div className={styles.lbl}>{words.relatedNone}</div>}
      </section>
      <a className={`${styles.btn} ${styles.primary}`} href={`/app/agent?prefill=${encodeURIComponent(prefillOf(item, language, words.prefill, std.myEvents.allDay))}`} data-events-private-edit="">{words.editInIorbit}</a>
    </div>
  );
}
