"use client";

// R11b 下钻名单（Web; b5 #40 / #41 右栏 1440, b5 #37 的 段階の内訳 + 三种排序 on the full page < 1280）。
// Reads GET /api/network/analysis/people: the same rule the card counted with, so 「105人」 here equals the legend row.
// A person opens R11a's ContactDrawer; 「N人を人脈一覧で開く」 only where the 人脈 list can show the same people (§6).
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { networkAnalysisPeopleSchema } from "../../../../../shared/api-schema/network-analysis-view";
import type { NetworkAnalysisDimension, NetworkAnalysisPeopleDTO, NetworkAnalysisPeopleSort, NetworkAnalysisPersonRow } from "../../../../../shared/contract/network-analysis-view";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Avatar, Icon, RetryCard, Segmented, Skeleton } from "../ui";
import { SORT_KEY, analysisListHref, bucketLabel, networkListHref, useAnalysisT, type AnalysisT } from "./analysis-labels";
import styles from "./network-analysis.module.css";

export interface DrillSelection { dimension: NetworkAnalysisDimension; bucketId: string }

type State = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; data: NetworkAnalysisPeopleDTO; loadingMore: boolean };

async function readPeople(selection: DrillSelection, sort: NetworkAnalysisPeopleSort | null, cursor: string | null, limit: number, signal?: AbortSignal): Promise<NetworkAnalysisPeopleDTO> {
  const params = new URLSearchParams({ dimension: selection.dimension, bucket: selection.bucketId, limit: String(limit) });
  if (sort) params.set("sort", sort);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/network/analysis/people?${params}`, { signal, cache: "no-store" });
  const body = await response.json().catch(() => null) as { success?: boolean; data?: unknown } | null;
  if (!response.ok || !body?.success) throw new Error("NETWORK_ANALYSIS_PEOPLE_FAILED");
  return networkAnalysisPeopleSchema.parse(body.data) as NetworkAnalysisPeopleDTO;
}

/** The 1440 rail shows the first five (b5 #40), then the list button / the full page; the full page pages by 30. */
export const RAIL_LIMIT = 5;
const PAGE_LIMIT = 30;

export function usePeople(selection: DrillSelection | null, limit: number = PAGE_LIMIT) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [sort, setSort] = useState<NetworkAnalysisPeopleSort | null>(null);
  const key = selection ? `${selection.dimension}:${selection.bucketId}` : "";
  const keyRef = useRef(key);
  useEffect(() => { if (keyRef.current !== key) { keyRef.current = key; setSort(null); } }, [key]);
  const load = useCallback(() => {
    if (!selection) return () => undefined;
    const controller = new AbortController();
    setState({ kind: "loading" });
    readPeople(selection, sort, null, limit, controller.signal).then((data) => setState({ kind: "ready", data, loadingMore: false })).catch((error: unknown) => {
      if ((error as { name?: string })?.name !== "AbortError") setState({ kind: "failed" });
    });
    return () => controller.abort();
  }, [key, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => load(), [load]);
  const more = useCallback(() => {
    if (!selection || state.kind !== "ready" || !state.data.nextCursor || state.loadingMore) return;
    const current = state.data;
    setState({ kind: "ready", data: current, loadingMore: true });
    readPeople(selection, current.sort, current.nextCursor, limit).then((next) => setState({ kind: "ready", data: { ...next, items: [...current.items, ...next.items] }, loadingMore: false }))
      .catch(() => setState({ kind: "ready", data: current, loadingMore: false }));
  }, [selection, state]);
  return { state, sort, setSort, reload: load, more };
}

function stageChip(person: NetworkAnalysisPersonRow, t: AnalysisT) {
  if (person.needsFollowUp) return <span className={`${styles.chip} ${styles.chipPink}`}>{t("followUp")}</span>;
  return person.stage === "nurture"
    ? <span className={`${styles.chip} ${styles.chipBlue}`}>{t("stageNurture")}</span>
    : <span className={`${styles.chip} ${styles.chipApricot}`}>{t("stageActive")}</span>;
}

export function PersonCard({ person, onOpen }: { person: NetworkAnalysisPersonRow; onOpen: (id: string) => void }) {
  const t = useAnalysisT();
  return (
    <button type="button" className={`btn ${styles.person}`} onClick={() => onOpen(person.id)} data-analysis-person={person.id}>
      <div className={styles.row}>
        <Avatar name={person.name} size="sm" />
        <div className={styles.grow}>
          <b className={styles.personName}>{person.name}</b>
          <div className={`${styles.lbl} ${styles.ellipsis}`}>{[person.organization, person.role].filter(Boolean).join(" · ")}</div>
        </div>
        {stageChip(person, t)}
      </div>
      {person.nextActionPreview ? <div className={`${styles.lbl} ${styles.note}`}>{person.nextActionPreview}</div> : null}
    </button>
  );
}

/**
 * The list body. `compact` = the 1440 rail (b5 #40: heading, two orders, cards, the list button); otherwise the full page
 * (b5 #37 adapted to Web: 段階の内訳 on top, every available order).
 */
export function DrillList({ selection, compact, onOpenPerson, onTotal }: { selection: DrillSelection; compact: boolean; onOpenPerson: (id: string) => void; onTotal?: (total: number) => void }) {
  const t = useAnalysisT();
  const { language } = useOrbitLanguage();
  const { state, setSort, reload, more } = usePeople(selection, compact ? RAIL_LIMIT : PAGE_LIMIT);
  const label = bucketLabel(selection.dimension, selection.bucketId, t, language);
  const loadedTotal = state.kind === "ready" ? state.data.total : null;
  useEffect(() => { if (loadedTotal !== null) onTotal?.(loadedTotal); }, [loadedTotal, onTotal]);
  if (state.kind === "loading") return <div className={styles.rail} data-analysis-list="loading"><Skeleton lines={4} /></div>;
  if (state.kind === "failed") return <div className={styles.rail} data-analysis-list="failed"><RetryCard title={t("loadFailed")} onRetry={reload} /></div>;
  const data = state.data;
  // The 1440 rail shows the board's two orders; 名前 stays for the full page.
  const sorts = compact ? data.sorts.filter((sort) => sort !== "name") : data.sorts;
  const listHref = networkListHref(selection.dimension, selection.bucketId);
  const total = data.stages.active + data.stages.nurture;
  return (
    <div className={styles.rail} data-analysis-list={`${selection.dimension}:${selection.bucketId}`}>
      {compact ? <h4 className={styles.railHead}><Icon name="users" size={16} />{label}<span className={styles.lbl}>{t("listCount", { n: data.total })}</span></h4> : null}
      {!compact && total > 0 ? (
        <div className={styles.card} data-analysis-stages>
          <span className={styles.lbl}>{t("stageBreakdown")}</span>
          <div className={styles.stageBar} aria-hidden>
            {data.stages.active ? <i className={styles.stageActive} style={{ flex: data.stages.active }} /> : null}
            {data.stages.nurture ? <i className={styles.stageNurture} style={{ flex: data.stages.nurture }} /> : null}
          </div>
          <div className={`${styles.stageLegend} ${styles.lbl}`}>
            <span>{t("stageCount", { label: t("stageActive"), n: data.stages.active })}</span>
            <span>{t("stageCount", { label: t("stageNurture"), n: data.stages.nurture })}</span>
          </div>
        </div>
      ) : null}
      {sorts.length > 1 ? (
        <Segmented variant="seg" label={t("sortLabel")} value={sorts.includes(data.sort) ? data.sort : sorts[0]!} onChange={(sort) => setSort(sort)}
          segments={sorts.map((sort) => ({ key: sort, label: t(SORT_KEY[sort]) }))} />
      ) : null}
      {data.items.length === 0 ? <p className={styles.lbl}>{t("listEmpty")}</p> : data.items.map((person) => <PersonCard key={person.id} person={person} onOpen={onOpenPerson} />)}
      {data.nextCursor && !compact ? <button type="button" className={`btn ${styles.btn} ${styles.btnBlock}`} disabled={state.loadingMore} onClick={more}>{t("more")}</button> : null}
      {data.nextCursor && compact && !listHref ? <Link href={analysisListHref(selection.dimension, selection.bucketId)} className={`btn ${styles.btn} ${styles.btnBlock}`}>{t("more")}</Link> : null}
      {listHref && data.total > 0 ? (
        <Link href={listHref} className={`btn ${styles.btn} ${styles.btnBlock}`} data-analysis-open-list><Icon name="users" size={16} />{t("openInNetwork", { n: data.total })}</Link>
      ) : null}
    </div>
  );
}
