'use client';
import type {OrbitLanguage} from '../../../../shared/contract/language';
import type {InboxDeliveryPreferencesDTO} from '../../../../shared/contract/notification-delivery-policy';
import {Icon, MacTile, Orbit2026Scope, ProgressBar, Toggle} from '../orbit-2026/ui';
import shellStyles from '../orbit-2026/shell/shell.module.css';
import styles from './typed-notifications-tab.module.css';

type Copy={zh:string;en:string;ja:string};
const copy={
 title:{zh:'通知状态',en:'Notification status',ja:'通知の状態'},
 push:{zh:'今日推送',en:'Pushes today',ja:'今日のプッシュ'},
 cap:{zh:'/ 上限 {n} 条',en:'/ limit {n}',ja:'/ 上限 {n}件'},
 capNote:{zh:'超过上限的只进收件箱',en:'Anything over the limit goes only to the inbox',ja:'上限を超えた分は受信箱にだけ届きます'},
 quiet:{zh:'免打扰时段',en:'Quiet hours',ja:'静かな時間帯'},
 quietOff:{zh:'已关闭',en:'Off',ja:'オフ'},
 meeting:{zh:'会面前例外',en:'except before meetings',ja:'面談前は例外'},
 week:{zh:'本周分类',en:'This week',ja:'内訳（今週）'},
 settings:{zh:'打开通知设置',en:'Open notification settings',ja:'通知の設定を開く'},
} satisfies Record<string,Copy>;
export const weekKinds=[
 {key:'reminder',tone:'plum',label:{zh:'提醒',en:'Reminders',ja:'リマインダー'}},
 {key:'suggestion',tone:'plum',label:{zh:'建议',en:'Suggestions',ja:'提案'}},
 {key:'update',tone:'rose',label:{zh:'动态',en:'Updates',ja:'更新'}},
 {key:'history',tone:'rose',label:{zh:'历史记录',en:'History',ja:'履歴'}},
] as const;
export type WeekCounts=Record<(typeof weekKinds)[number]['key'],number>;

/** b5 #6 右栏「通知の状態」: today's push quota, quiet hours, this week's breakdown, the settings link. */
export function NotificationStatusRail({language,usage,preferences,week,quietBusy,onQuietChange}:{
 language:OrbitLanguage;
 usage:{used:number;cap:number}|null;
 preferences:InboxDeliveryPreferencesDTO|null;
 week:WeekCounts|null;
 quietBusy:boolean;
 onQuietChange:(next:boolean)=>void;
}) {
 const t=(entry:Copy)=>entry[language];
 const most=week?Math.max(1,...weekKinds.map(kind=>week[kind.key])):1;
 const quietRange=preferences?.quietStart&&preferences.quietEnd?`${preferences.quietStart} – ${preferences.quietEnd}`:null;
 return <Orbit2026Scope language={language} className={styles.railScope}><div className={`${shellStyles.railBody} ${styles.rail}`}>
  <h2 className={styles.railHead}><Icon name="bell" size={16}/>{t(copy.title)}</h2>
  {usage?<section className={styles.railCard} aria-label={t(copy.push)}>
   <div className={styles.lbl}>{t(copy.push)}</div>
   <div className={styles.quota}><b>{usage.used}</b><span className={styles.lbl}>{t(copy.cap).replace('{n}',String(usage.cap))}</span></div>
   <ProgressBar value={usage.used/usage.cap} label={t(copy.push)}/>
   <div className={styles.lbl}>{t(copy.capNote)}</div>
  </section>:null}
  {preferences?<section className={styles.railCard}>
   <div className={styles.quiet}><MacTile emoji="🌙" tone="lav" size="sm"/>
    <div><b>{t(copy.quiet)}</b><div className={styles.lbl}>{preferences.quietHoursEnabled?[quietRange,preferences.meetingException?t(copy.meeting):null].filter(Boolean).join(' · '):t(copy.quietOff)}</div></div>
    <Toggle checked={preferences.quietHoursEnabled} disabled={quietBusy} label={t(copy.quiet)} onChange={onQuietChange}/>
   </div>
  </section>:null}
  {week?<section className={styles.railCard} aria-label={t(copy.week)}>
   <div className={styles.lbl}>{t(copy.week)}</div>
   {weekKinds.map(kind=><div key={kind.key} className={styles.cmp}><span>{t(kind.label)}</span><ProgressBar thin tone={kind.tone} value={week[kind.key]/most} label={t(kind.label)}/><b>{week[kind.key]}</b></div>)}
  </section>:null}
  <a className={`btn ${styles.settingsLink}`} href="/app/settings/notifications"><Icon name="settings" size={16}/>{t(copy.settings)}</a>
 </div></Orbit2026Scope>;
}
