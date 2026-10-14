"use client";

import Link from "next/link";
import { Fragment, useRef, useState, type DragEvent, type ReactNode } from "react";

import type { ContactImportMappableField } from "../../../../../../shared/contract/contact-import";
import { addDoorsCopy, addReviewCopy } from "../../copy/add";
import { addImportCopy as c } from "../../copy/add-import";
import type { OrbitCopyEntry } from "../../copy/types";
import { Button, Card, Icon, IconButton, MacTile, avatarTone, initials } from "../../ui";
import { DensityDots, type Translate } from "../add-parts";
import addStyles from "../add.module.css";
import type { ImportSource } from "./import-model";
import styles from "./import.module.css";
import { pressProps } from "../press";

export type ImportMethod = "linkedin" | "contacts" | "csv" | "event";

export const IMPORT_HREF = "/app/contacts/new/import";

export const importMethodHref = (method: ImportMethod) => `${IMPORT_HREF}?method=${method}`;

/** W-R16-10: the four doors (all ●○○ — imported people come in with just who they are). */
export const IMPORT_DOORS: readonly { method: ImportMethod; emoji: string; tone: "blue" | "teal" | "lav" | "apricot"; title: OrbitCopyEntry; body: OrbitCopyEntry }[] = [
  { method: "contacts", emoji: "📱", tone: "blue", title: addDoorsCopy.otherContacts, body: addDoorsCopy.otherContactsBody },
  { method: "linkedin", emoji: "🔗", tone: "teal", title: addDoorsCopy.otherLinkedIn, body: addDoorsCopy.otherLinkedInBody },
  { method: "csv", emoji: "📄", tone: "lav", title: addDoorsCopy.otherCsv, body: addDoorsCopy.otherCsvBody },
  { method: "event", emoji: "🎟️", tone: "apricot", title: addDoorsCopy.otherEvent, body: addDoorsCopy.otherEventBody },
];

export function ImportDoorsView({ t, href }: { t: Translate; href: (path: string) => string }) {
  const flow: [string, OrbitCopyEntry][] = [["📂", c.flowPick], ["🔁", c.flowMap], ["✅", c.flowReview], ["👥", c.flowAdd]];
  return (
    <div className={`${addStyles.wgrid} ${addStyles.fade}`} data-import-doors="">
      {IMPORT_DOORS.map((door) => (
        <Link key={door.method} href={href(importMethodHref(door.method))} className={`${styles.span3} ${styles.door}`} data-import-door={door.method}>
          <Card className={styles.card}>
            <div className={styles.doorTop}><MacTile emoji={door.emoji} tone={door.tone} /><DensityDots level={1} t={t} /></div>
            <b className={styles.doorTitle}>{t(door.title)}</b>
            <div className={`${styles.lbl} ${styles.doorBody}`}>{t(door.body)}</div>
          </Card>
        </Link>
      ))}
      <Card className={styles.span12}>
        <div className={styles.cardH}><h3>{t(c.flowTitle)}</h3><span className={styles.lbl}>{t(c.flowNote)}</span></div>
        <div className={styles.flow}>
          {flow.map(([emoji, label], index) => (
            <Fragment key={emoji}>
              {index ? <span className={styles.flowArrow} aria-hidden><Icon name="right" size={16} /></span> : null}
              <span className={styles.flowChip}>{emoji} {t(label)}</span>
            </Fragment>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** The right rail of every import page: what this source brings and ●○○ 身元だけ. */
export function ImportRail({ t, emoji, tone, title, body, levelNote }: { t: Translate; emoji: string; tone: "blue" | "teal" | "lav" | "apricot"; title: string; body: string; levelNote?: string }) {
  return (
    <div className={addStyles.railStack} data-import-rail="">
      <h2 className={addStyles.railH}><MacTile emoji={emoji} size="sm" tone={tone} />{title}</h2>
      <div className={`${addStyles.railCard} ${addStyles.railBody}`}>{body}</div>
      <div className={addStyles.railCard}>
        <div className={addStyles.footNote}>{t(addReviewCopy.railDensity)}</div>
        <div className={`${addStyles.railLevel} ${styles.dotsLg}`}><DensityDots level={1} t={t} /><b>{t(addDoorsCopy.density1)}</b></div>
        <div className={`${addStyles.footNote} ${addStyles.railLevelNote}`}>{levelNote ?? t(c.railLevelNote)}</div>
      </div>
    </div>
  );
}

export const RAIL: Record<ImportSource | "doors", { emoji: string; tone: "blue" | "teal" | "lav" | "apricot"; title: OrbitCopyEntry; body: OrbitCopyEntry; levelNote?: OrbitCopyEntry }> = {
  doors: { emoji: "🧭", tone: "lav", title: c.doorsRailTitle, body: c.doorsRailBody },
  linkedin: { emoji: "🔗", tone: "teal", title: c.linkedinRailTitle, body: c.linkedinRailBody },
  vcard: { emoji: "📱", tone: "blue", title: c.vcardRailTitle, body: c.vcardRailBody },
  csv: { emoji: "📄", tone: "lav", title: c.csvRailTitle, body: c.csvRailBody },
  event: { emoji: "🎟️", tone: "apricot", title: c.eventRailTitle, body: c.eventRailBody, levelNote: c.eventRailLevelNote },
};

export function railFor(source: ImportSource | "doors", t: Translate) {
  const rail = RAIL[source];
  return <ImportRail t={t} emoji={rail.emoji} tone={rail.tone} title={t(rail.title)} body={t(rail.body)} levelNote={rail.levelNote ? t(rail.levelNote) : undefined} />;
}

type UploadMethod = Exclude<ImportMethod, "event">;

const UPLOAD: Record<UploadMethod, {
  stepsNote: OrbitCopyEntry;
  steps: [OrbitCopyEntry, OrbitCopyEntry | null, "settings" | "check" | null, OrbitCopyEntry | null][];
  emoji: string;
  drop: OrbitCopyEntry;
  hint: OrbitCopyEntry;
  icon: string;
  accept: string;
}> = {
  linkedin: {
    stepsNote: c.linkedinStepsNote,
    steps: [[c.linkedinStep1, c.linkedinStep1Ill, "settings", null], [c.linkedinStep2, c.linkedinStep2Ill, "check", null], [c.linkedinStep3, null, null, c.linkedinStep3Note]],
    emoji: "🗂️", drop: c.linkedinDrop, hint: c.linkedinDropHint, icon: "CSV", accept: ".csv,.zip,text/csv,application/zip",
  },
  contacts: {
    stepsNote: c.vcardStepsNote,
    steps: [[c.vcardStep1, c.vcardStep1Ill, "settings", null], [c.vcardStep2, c.vcardStep2Ill, "check", null], [c.vcardStep3, null, null, c.vcardStep3Note]],
    emoji: "📇", drop: c.vcardDrop, hint: c.vcardDropHint, icon: "VCF", accept: ".vcf,.vcard,text/vcard",
  },
  csv: {
    stepsNote: c.csvStepsNote,
    steps: [[c.csvStep1, c.csvStep1Ill, "settings", null], [c.csvStep2, c.csvStep2Ill, "check", null], [c.csvStep3, null, null, c.csvStep3Note]],
    emoji: "📄", drop: c.csvDrop, hint: c.csvDropHint, icon: "CSV", accept: ".csv,text/csv",
  },
};

export const LINKEDIN_EXPORT_URL = "https://www.linkedin.com/mypreferences/d/download-my-data";

export interface UploadedFileView {
  name: string;
  /** Rows (CSV) or people (vCard) the server read. */
  count: number;
  size: string;
}

/** b9 A3 ② (LinkedIn) / W-R16-11a (連絡先 vCard) / CSV: 書き出しの手順 on the left, the drop + file on the right. */
export function ImportUploadView({ t, method, file, reading, error, onFiles, onRemove, onCancel, onNext, onOpenLinkedIn }: {
  t: Translate;
  method: UploadMethod;
  file: UploadedFileView | null;
  reading: boolean;
  error: string;
  onFiles: (files: FileList | File[]) => void;
  onRemove: () => void;
  onCancel: () => void;
  onNext: () => void;
  onOpenLinkedIn?: () => void;
}) {
  const config = UPLOAD[method];
  const input = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const drop = {
    onDragOver: (event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragging(false); onFiles(event.dataTransfer.files); },
  };
  return (
    <div className={`${addStyles.wgrid} ${addStyles.fade}`} data-import-upload={method}>
      <Card className={`${styles.span5} ${styles.card}`} data-import-steps="">
        <div className={styles.cardH}><h3>{t(c.stepsTitle)}</h3><span className={styles.lbl}>{t(config.stepsNote)}</span></div>
        {config.steps.map(([title, ill, icon, note], index) => (
          <div key={title.ja} className={styles.gstep}>
            <span className={styles.gstepN}>{index + 1}</span>
            <div>
              <b>{t(title)}</b>
              {ill ? (
                <div className={styles.ill}>
                  <div className={styles.mi}>
                    {icon === "check" ? <span className={styles.miBox} aria-hidden><Icon name="check" size={16} /></span> : <Icon name="settings" size={16} />}
                    {t(ill)}
                  </div>
                </div>
              ) : null}
              {note ? <div className={styles.lbl}>{t(note)}</div> : null}
            </div>
          </div>
        ))}
        {method === "linkedin" ? <Button icon="out" className={styles.stepsButton} label={t(c.linkedinOpen)} onClick={onOpenLinkedIn} data-import-linkedin-open="" /> : null}
      </Card>
      <Card className={`${styles.span7} ${styles.card}`} {...drop}>
        <div className={styles.cardH}><h3>{t(c.fileTitle)}</h3></div>
        <div role="button" className={`${styles.drop} ${dragging ? styles.dropOn : ""}`} {...pressProps(() => input.current?.click())} data-import-drop="">
          <div className={styles.dropEmoji} aria-hidden>{config.emoji}</div>
          <b className={styles.dropTitle}>{t(config.drop)}</b>
          <div className={styles.lbl}>{t(config.hint)}</div>
        </div>
        <input ref={input} className={addStyles.srOnly} type="file" accept={config.accept} tabIndex={-1} aria-hidden onChange={(event) => { if (event.target.files) onFiles(event.target.files); event.target.value = ""; }} data-import-input="" />
        {reading ? <p className={styles.lbl} role="status">{t(c.fileReading)}</p> : null}
        {file ? (
          <div className={styles.file} data-import-file={file.name}>
            <span className={styles.fileIcon} aria-hidden>{config.icon}</span>
            <div className={styles.fileMeta}><b>{file.name}</b><div className={styles.lbl}>{t(method === "contacts" ? c.fileMetaPeople : c.fileMetaRows, { n: file.count.toLocaleString(), size: file.size })}</div></div>
            <span className={styles.fileOk}><Icon name="check" size={16} />{t(c.fileOk)}</span>
            <IconButton icon="x" size={34} className={styles.fileRemove} label={t(c.fileRemove, { name: file.name })} onClick={onRemove} />
          </div>
        ) : null}
        {error ? <p className={styles.error} role="alert" data-import-error=""><Icon name="alert" size={16} />{error}</p> : null}
        <div className={`${styles.acts} ${styles.push}`}>
          <Button label={t(c.cancel)} onClick={onCancel} />
          <Button variant="primary" label={t(method === "contacts" ? c.toReview : c.toMapping)} disabled={!file || reading} onClick={onNext} data-import-next="" />
        </div>
      </Card>
    </div>
  );
}

export const FIELD_COPY: Record<ContactImportMappableField, OrbitCopyEntry> = {
  name: c.fieldName, firstName: c.fieldFirstName, lastName: c.fieldLastName, organization: c.fieldOrganization, role: c.fieldRole,
  email: c.fieldEmail, phone: c.fieldPhone, location: c.fieldLocation, country: c.fieldCountry, linkedinUrl: c.fieldLinkedinUrl,
  connectedOn: c.fieldConnectedOn, notes: c.fieldNotes,
};
export const FIELD_ORDER: readonly ContactImportMappableField[] = ["name", "lastName", "firstName", "organization", "role", "email", "phone", "location", "country", "linkedinUrl", "connectedOn", "notes"];

export interface MappingRowView {
  index: number;
  header: string;
  field: ContactImportMappableField | null;
  example: string;
  /** ほぼ空 (only a few rows have it) — the example then says how many. */
  sparse: boolean;
}

export interface PersonPreview {
  key: string;
  name: string;
  sub: string;
}

function SourceChip({ t, source }: { t: Translate; source: ImportSource }) {
  // LinkedIn / CSV are brand / format names, the same in every language.
  const label = source === "linkedin" ? "LinkedIn" : source === "csv" ? "CSV" : t(source === "vcard" ? c.sourceVcard : c.sourceEvent);
  // b12 W-R16-11b draws the CSV chip with an empty 12px icon slot (kit has no file icon); LinkedIn = link, イベント = calendar.
  return <span className={styles.src}>{source === "linkedin" ? <Icon name="link" size={16} /> : source === "event" ? <Icon name="calendar" size={16} /> : <svg aria-hidden viewBox="0 0 24 24" />}{label}</span>;
}

function PersonAvatar({ name }: { name: string }) {
  return <span className={`${styles.av} ${styles[`av_${avatarTone(name)}`]}`} aria-hidden>{initials(name)}</span>;
}

/** b9 A3 ③ / W-R16-11b: CSV の列 → Orbit の項目 (each chip opens a select), 取り込み後のイメージ, まとめて確認へ. */
export function ImportMappingView({ t, source, rows, preview, exceptions, busy, onChange, onBack, onNext }: {
  t: Translate;
  source: ImportSource;
  rows: readonly MappingRowView[];
  preview: readonly PersonPreview[];
  exceptions: number;
  busy: boolean;
  onChange: (column: number, field: ContactImportMappableField | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className={`${addStyles.wgrid} ${addStyles.fade}`} data-import-mapping="">
      <Card className={`${styles.span8} ${styles.card}`}>
        <div className={styles.cardH}><h3>{t(c.mapCardTitle)}</h3><span className={styles.lbl}>{t(c.mapCardNote)}</span></div>
        <table className={styles.map}>
          <thead><tr><th>{t(c.colCsv)}</th><th aria-hidden /><th>{t(c.colOrbit)}</th><th>{t(c.colExample)}</th><th aria-hidden /></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.index} data-import-column={row.index} data-import-field={row.field ?? "unused"}>
                <td><b>{row.header}</b></td>
                <td className={styles.mapArrow} aria-hidden><Icon name="right" size={16} /></td>
                <td>
                  <label className={styles.mapField}>
                    <select className={styles.mapSelect} aria-label={t(c.fieldFor, { column: row.header })} value={row.field ?? ""} disabled={busy} onChange={(event) => onChange(row.index, (event.target.value || null) as ContactImportMappableField | null)}>
                      <option value="">{t(c.unused)}</option>
                      {FIELD_ORDER.map((field) => <option key={field} value={field}>{t(FIELD_COPY[field])}</option>)}
                    </select>
                    <span className={`${styles.src} ${row.field && !row.sparse ? styles.srcLav : ""}`}>{row.field ? t(FIELD_COPY[row.field]) : t(c.unused)}</span>
                  </label>
                </td>
                <td className={styles.mapEx}>{row.example || "—"}</td>
                <td>{row.sparse ? <span className={`${styles.src} ${styles.srcApricot}`}>{t(c.sparse)}</span> : row.field ? <i className={styles.okDot} aria-hidden /> : <span className={styles.lbl}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className={`${styles.span4} ${styles.card}`}>
        <div className={styles.cardH}><h3>{t(c.previewTitle)}</h3></div>
        <div className={styles.list}>
          {preview.map((person) => (
            <div key={person.key} className={styles.li}>
              <PersonAvatar name={person.name} />
              <div className={styles.meta}><b>{person.name}</b><span>{person.sub}</span></div>
              <div className={styles.rend}><DensityDots level={1} t={t} /><SourceChip t={t} source={source} /></div>
            </div>
          ))}
        </div>
        <div className={`${styles.macNote} ${styles.push}`}><b>{t(c.previewLead)}</b>{t(c.previewNote)}</div>
      </Card>
      <div className={`${styles.span12} ${styles.actsEnd}`}>
        <Button label={t(c.back)} onClick={onBack} />
        <Button variant="primary" className={styles.next} loading={busy} label={t(c.toReviewExceptions, { n: exceptions })} onClick={onNext} data-import-next="" />
      </div>
    </div>
  );
}

export interface EventOptionView {
  eventId: string;
  title: string;
  /** 10月7日（火）· 渋谷 */
  meta: string;
  cards: number;
}

export interface EventPersonView {
  seq: number;
  name: string;
  sub: string;
  inNetwork: boolean;
  checked: boolean;
}

/** W-R16-11c: イベントを選ぶ on the left, the people you swapped cards with (checked) on the right. */
export function ImportEventView({ t, events, selected, people, loading, busy, onSelect, onToggle, onCancel, onNext }: {
  t: Translate;
  events: readonly EventOptionView[];
  selected: string | null;
  people: readonly EventPersonView[];
  loading: boolean;
  busy: boolean;
  onSelect: (eventId: string) => void;
  onToggle: (seq: number) => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  const event = events.find((entry) => entry.eventId === selected) ?? null;
  const inNetwork = people.filter((person) => person.inNetwork).length;
  const chosen = people.filter((person) => person.checked && !person.inNetwork).length;
  return (
    <div className={`${addStyles.wgrid} ${addStyles.fade}`} data-import-event="">
      <Card className={`${styles.span5} ${styles.card}`}>
        <div className={styles.cardH}><h3>{t(c.eventListTitle)}</h3><span className={styles.lbl}>{t(c.eventListNote)}</span></div>
        {events.length ? (
          <div className={styles.list} role="listbox" aria-label={t(c.eventListTitle)}>
            {events.map((entry) => (
              <div key={entry.eventId} role="option" aria-selected={entry.eventId === selected} className={`${styles.li} ${styles.liButton} ${entry.eventId === selected ? styles.liOn : ""}`} {...pressProps(() => onSelect(entry.eventId))} data-import-event-option={entry.eventId}>
                <MacTile emoji="🎟️" size="sm" tone="apricot" />
                <div className={styles.meta}><b>{entry.title}</b><span>{entry.meta}</span></div>
                <div className={styles.end}>{t(c.eventCards, { n: entry.cards })}</div>
              </div>
            ))}
          </div>
        ) : <p className={styles.lbl}>{t(c.eventNone)}</p>}
      </Card>
      <Card className={`${styles.span7} ${styles.card}`}>
        {event ? (
          <>
            <div className={styles.cardH}><h3>{t(c.eventPeopleTitle, { event: event.title })}</h3><span className={styles.lbl}>{t(c.eventPeopleNote, { n: people.length, m: inNetwork })}</span></div>
            {loading ? <p className={styles.lbl} role="status">{t(c.eventLoading)}</p> : (
              <div className={styles.list}>
                {people.map((person) => (
                  <div key={person.seq} className={styles.li} data-import-person={person.seq}>
                    <span role="checkbox" aria-checked={person.checked && !person.inNetwork} aria-label={t(c.eventPick, { name: person.name })} className={`${styles.cbx} ${person.checked && !person.inNetwork ? styles.cbxOn : ""}`} {...pressProps(() => onToggle(person.seq), person.inNetwork || busy)}>
                      <Icon name="check" size={16} />
                    </span>
                    <PersonAvatar name={person.name} />
                    <div className={styles.meta}><b>{person.name}</b><span>{person.sub}</span></div>
                    <div className={styles.rend}>{person.inNetwork ? <span className={styles.src}>{t(c.eventInNetwork)}</span> : <SourceChip t={t} source="event" />}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
        <div className={`${styles.acts} ${styles.push}`}>
          <Button label={t(c.cancel)} onClick={onCancel} />
          <Button variant="primary" label={t(c.eventGo, { n: chosen })} disabled={!event || loading || busy || !chosen} onClick={onNext} data-import-next="" />
        </div>
      </Card>
    </div>
  );
}

export function ImportRowsList({ t, rows, skipped, onToggle }: { t: Translate; rows: readonly { seq: number; name: string; sub: string; locked: boolean }[]; skipped: ReadonlySet<number>; onToggle: (seq: number) => void }): ReactNode {
  return (
    <div className={styles.rows} data-import-rows="">
      {rows.map((row) => {
        const out = row.locked || skipped.has(row.seq);
        return (
          <div key={row.seq} className={`${styles.rowLine} ${out ? styles.rowSkipped : ""}`} data-import-row={row.seq} data-import-row-out={out || undefined}>
            <PersonAvatar name={row.name} />
            <div className={styles.meta}><b>{row.name}</b><span>{row.sub}</span></div>
            {row.locked ? null : <Button size="sm" variant="ghost" label={t(out ? c.keepRow : c.skipRow)} onClick={() => onToggle(row.seq)} />}
          </div>
        );
      })}
    </div>
  );
}
