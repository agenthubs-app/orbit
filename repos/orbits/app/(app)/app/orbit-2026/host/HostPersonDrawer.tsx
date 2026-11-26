"use client";

/**
 * 参加者詳細（2026-11-13 用户要求：承認済み的人可以点开看报名信息；生成并公开推荐和分组后，这里也显示）。
 * 组件库 Drawer（md 520，与共同運営者同档）。从上到下：头部（名字 / 公司 · 职位 / 状态 · 受付 · 参加歴）→
 * 申込時の回答（主办方问题逐条）→ プロフィール（报名资料或活动档案，只列填了的项）→ 话题 / 能提供 / 在找 →
 * マッチング結果（各轮的桌、主题、同桌、为什么；おすすめの相手先显示 5 位，可展开）。
 * 只请求这一个人（GET /people/[actorId]），服务端也只读他的那部分。
 */
import { useEffect, useMemo, useState } from "react";

import type { HostAdmissionDecision, HostPersonResponse } from "../../../../../shared/contract/host-console";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { localizeLibraryAnswerText, localizeLibraryPrompt } from "../../../../../shared/domain/host-question-library";
import { Avatar, BottomSheet, Drawer, Icon } from "../ui";
import { ScoreRing } from "./HostPeople";
import { hostApi } from "./host-api";
import { hostDateShort, hostTime, hostTranslator, type HostT } from "./host-model";
import type { HostCopyKey } from "../copy/host";
import s from "./host.module.css";
import pd from "./person.module.css";

const RECS_FIRST = 5;

export function HostPersonView({ data, t, language, phone = false, onClose }: { data: HostPersonResponse; t: HostT; language?: OrbitLanguage; /** < 768 底部抽屉（b13 HM-P6）：头部自带名字与 ✕，问答放灰卡。 */ phone?: boolean; onClose?: () => void }) {
  const [allRecs, setAllRecs] = useState(false);
  const meta = [
    data.checkedInAt ? t("pdCheckedIn", { time: hostTime(data.checkedInAt) }) : null,
    data.receptionNumber ? t("pdReception", { n: data.receptionNumber }) : null,
    data.attendCount === 0 ? t("pFirstTime") : t("pTimes", { n: data.attendCount }),
    data.source === "member" ? t("pdNoForm") : data.submittedAt ? t("pdApplied", { date: hostDateShort(data.submittedAt, t) }) : null,
  ].filter(Boolean);
  const recs = data.matching?.recommendations ?? [];
  const shownRecs = allRecs ? recs : recs.slice(0, RECS_FIRST);
  const chips = ([["pdTopics", data.topics], ["pdOffers", data.offers], ["pdNeeds", data.needs]] as const).filter(([, items]) => items.length > 0);
  return (
    <div className={`${pd.body} ${phone ? pd.phone : ""}`} data-host-person={data.actorId}>
      {phone ? (
        <div className={pd.pHead}>
          <Avatar name={data.name} size="lg" />
          <div className={s.grow}>
            <b className={pd.pName}>{data.name}</b>
            {data.org || data.role ? <div className={s.lbl}>{[data.org, data.role].filter(Boolean).join(" · ")}</div> : null}
            <div className={pd.pChips}>
              <span className={`${pd.status} ${pd[`st_${data.status}`] ?? ""}`}>{t(`pdStatus_${data.status}` as HostCopyKey)}</span>
              {meta.map((item) => <span key={item} className={pd.status}>{item}</span>)}
            </div>
          </div>
          <button type="button" className={`btn ${pd.pClose}`} aria-label={t("close")} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
      ) : null}
      <div className={`${s.row} ${pd.head} ${phone ? pd.hidden : ""}`}>
        <Avatar name={data.name} size="lg" />
        <div className={s.minw0}>
          {/* 名字是抽屉标题，这里不再重复。 */}
          {data.org || data.role ? <div className={pd.orgLine}>{[data.org, data.role].filter(Boolean).join(" · ")}</div> : null}
          <div className={pd.meta}>
            <span className={`${pd.status} ${pd[`st_${data.status}`] ?? ""}`}>{t(`pdStatus_${data.status}` as HostCopyKey)}</span>
            {meta.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </div>

      {data.profileScore != null ? (
        <div className={pd.cmp} data-host-person-score={data.profileScore}>
          <ScoreRing value={data.profileScore / 100} size={44} stroke={5} color={data.profileScore < 50 ? "var(--coral)" : "var(--plum-500)"} label={t("pProfileScore", { n: data.profileScore })}>
            <b className={`${pd.cmpN} ${data.profileScore < 50 ? pd.inc : ""}`}>{data.profileScore}</b>
          </ScoreRing>
          <div className={s.minw0}>
            <b className={pd.cmpT}>{t("pdScore", { n: data.profileScore })}</b>
            <div className={s.lbl}>{data.missing?.length ? t("pdMissing", { items: data.missing.map((item) => t(`cov_${item}` as HostCopyKey)).join(t("listSep")) }) : t("pdComplete")}</div>
          </div>
        </div>
      ) : null}

      {data.hostAnswers.length ? (
        <section className={pd.section}>
          <h3 className={pd.h}>{t("pdHostAnswers")}</h3>
          <dl className={pd.qa}>{data.hostAnswers.map((item, index) => <div key={index}><dt>{language ? localizeLibraryPrompt(item.label, language) : item.label}</dt><dd>{language ? localizeLibraryAnswerText(item.value, language) : item.value}</dd></div>)}</dl>
        </section>
      ) : null}

      {data.intro ? (
        <section className={pd.section} data-host-person-intro="">
          <h3 className={pd.h}>{t("pdIntro")}</h3>
          <div className={pd.intro}>{data.intro}</div>
        </section>
      ) : null}

      {data.profile.length || chips.length ? (
        <section className={pd.section}>
          <h3 className={pd.h}>{t("pdProfile")}</h3>
          {data.profile.length ? <dl className={pd.qa}>{data.profile.map((item) => <div key={item.label}><dt>{t(`pf_${item.label}` as HostCopyKey)}</dt><dd>{item.value}</dd></div>)}</dl> : null}
          {chips.map(([label, items]) => (
            <div key={label} className={pd.chipsRow}>
              <div className={pd.dt}>{t(label)}</div>
              <div className={pd.chips}>{items.map((item) => <span key={item} className={pd.chip}>{item}</span>)}</div>
            </div>
          ))}
        </section>
      ) : null}

      {data.matching ? (
        <section className={pd.section} data-host-person-matching={data.matching.published ? "published" : "none"}>
          <h3 className={pd.h}>{t("pdMatching")}</h3>
          {!data.matching.published ? <div className={pd.note}>{t("pdNotPublished")}</div>
            : data.matching.tables.length === 0 && recs.length === 0 ? <div className={pd.note}>{t("pdNotSeated")}</div> : null}
          {data.matching.tables.map((table) => (
            <div key={table.round} className={pd.table}>
              <div className={`${s.row} ${pd.tableHead}`}>
                <span className={pd.tno}>{table.table}</span>
                <div className={s.minw0}>
                  <div className={s.lbl}>{t("pdRoundTable", { n: table.round, t: table.table })}</div>
                  {table.theme ? <b className={pd.theme}>{table.theme}</b> : null}
                </div>
              </div>
              {table.why ? <p className={pd.why}>{table.why}</p> : null}
              {table.mates.length ? (
                <div className={pd.mates}>
                  <span className={pd.dt}>{t("pdMates")}</span>
                  {table.mates.map((mate) => <span key={mate.participantId} className={pd.chip}>{mate.name}{mate.org ? <small>{mate.org}</small> : null}</span>)}
                </div>
              ) : null}
            </div>
          ))}
          {recs.length ? (
            <div className={pd.recs}>
              <div className={pd.dt}>{t("pdRecs")}</div>
              <ol>
                {shownRecs.map((rec) => (
                  <li key={rec.participantId} className={pd.rec}>
                    <span className={pd.rank}>{rec.rank}</span>
                    <div className={s.minw0}>
                      <b>{rec.name}</b>{rec.org || rec.role ? <span className={s.lbl}> · {[rec.org, rec.role].filter(Boolean).join(" · ")}</span> : null}
                      {rec.reason ? <div className={pd.reason}>{rec.reason}</div> : null}
                    </div>
                  </li>
                ))}
              </ol>
              {recs.length > RECS_FIRST && !allRecs ? <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => setAllRecs(true)}>{t("pdShowAll", { n: recs.length })}</button> : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {phone && (data.status === "pending" || data.status === "waitlisted") ? <div className={`${s.lbl} ${pd.decideNote}`}>{t("pdDecideNote")}</div> : null}
    </div>
  );
}

export function HostPersonDrawer({ eventId, actorId, name, language, phone = false, busy = false, onClose, onDecide }: {
  eventId: string; actorId: string; name: string; language: OrbitLanguage; phone?: boolean; busy?: boolean; onClose: () => void;
  /** 審査待ち / キャンセル待ち の人：底部で 承認 / 待ち / 見送り（b13 HM-P6，电脑版同步）。見送り の確認は呼び出し側。 */
  onDecide?: (decision: HostAdmissionDecision) => void;
}) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const [data, setData] = useState<HostPersonResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    void hostApi.person(eventId, actorId).then((res) => { if (!alive) return; if (res.ok) setData(res.data); else setFailed(true); });
    return () => { alive = false; };
  }, [eventId, actorId]);
  const acts = onDecide && data && (data.status === "pending" || data.status === "waitlisted") ? (
    <div className={pd.decideActs}>
      <button type="button" className={`btn ${s.btn} ${pd.ctext}`} disabled={busy} onClick={() => onDecide("reject")}>{t("pReject")}</button>
      {data.status !== "waitlisted" ? <button type="button" className={`btn ${s.btn}`} disabled={busy} onClick={() => onDecide("waitlist")}>{t("pWait")}</button> : null}
      <button type="button" className={`btn ${s.btn} ${s.primary} ${pd.approve}`} disabled={busy} onClick={() => onDecide("approve")}><Icon name="check" size={16} />{t("pApprove")}</button>
    </div>
  ) : null;
  const content = data ? <HostPersonView data={data} t={t} language={language} phone={phone} onClose={onClose} />
    : failed ? <div className={s.empty}>{t("loadError")}</div>
      : <div className={pd.loading} aria-busy="true"><i /><i /><i /></div>;
  if (phone) {
    return (
      <BottomSheet open onClose={onClose} label={data?.name ?? name} className={pd.psheet}>
        <div className={pd.psBody}>{content}</div>
        {acts ? <div className={pd.psFoot} data-host-person-decide="">{acts}</div> : null}
      </BottomSheet>
    );
  }
  return (
    <Drawer open onClose={onClose} title={data?.name ?? name} size="md"
      footer={acts ? (
        <div className={pd.decide} data-host-person-decide="">
          <div className={`${s.lbl} ${pd.decideNote}`}>{t("pdDecideNote")}</div>
          {acts}
        </div>
      ) : undefined}>
      {content}
    </Drawer>
  );
}
