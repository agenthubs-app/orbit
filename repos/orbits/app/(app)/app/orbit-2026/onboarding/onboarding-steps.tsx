"use client";

/** 三步引导的画面部件（onboarding-3step-proposal W / T / M）：只画与回调，状态在 onboarding-flow。 */
import { useId, useState, type ChangeEvent, type DragEvent, type ReactNode, type RefObject } from "react";

import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../../../shared/contract/industries";
import type { SeniorityLevelCode } from "../../../../../shared/contract/profile";
import { PROFILE_ONBOARDING_GOALS } from "../../../../../shared/compute/profile-onboarding-goal";
import { INDUSTRY_CATALOG, industryLabel, listSecondaryIndustries, secondaryIndustryLabel } from "../../../../../shared/domain/industries";
import { SENIORITY_LEVELS, SENIORITY_LEVEL_LABELS } from "../../../../../shared/compute/seniority-group";
import { Icon, MacTile, WhyBody, WhyButton } from "../ui";
import type { AvatarTone } from "../ui/Basics";
import { ONBOARDING_COPY, ONBOARDING_SCREEN_LABELS } from "../copy/onboarding";
import {
  OFFER_LIMIT,
  OFFER_OPTIONS,
  SEEK_LIMIT,
  SEEK_OPTIONS,
  TOPIC_LIMIT,
  TOPIC_OPTIONS,
  addCustomValue,
  optionMatches,
  toggleValue,
  type BasicField,
  type Copy,
  type FieldOrigin,
  type OnboardingMissing,
} from "./onboarding-model";
import styles from "./OnboardingFlow.module.css";

export type T = (copy: Copy) => string;
export type Lang = "zh" | "en" | "ja";
export type IntroStatus = "idle" | "generating" | "ready" | "error";
export type IntroTone = "native" | "en";

export interface BasicDraft {
  birthDate: string;
  company: string;
  email: string;
  homeMarket: string;
  name: string;
  phone: string;
  lineId?: string;
  wechatId?: string;
  primaryIndustryId: IndustryIdCode | "";
  secondaryIndustryId: SecondaryIndustryIdCode | "";
  seniorityLevel: SeniorityLevelCode | "";
  title: string;
}

/** 缺项 → 滚到并聚焦的元素。 */
export const MISSING_TARGETS: Record<OnboardingMissing, string> = {
  birthDate: "onb-birth",
  contact: "onb-lineId",
  goal: "onb-goal-first",
  headlineOver: "onb-intro",
  industry: "onb-industry",
  industryDetail: "onb-industry-detail",
  introEmpty: "onb-intro",
  introGenerating: "onb-intro",
  introOver: "onb-intro",
  name: "onb-name",
};

export const MISSING_LABELS: Record<OnboardingMissing, Copy> = {
  birthDate: { ja: "生年月日", zh: "生日", en: "Birthday" },
  contact: { ja: "連絡先", zh: "联系方式", en: "Contact method" },
  goal: { ja: "目標", zh: "目标", en: "Goal" },
  headlineOver: { ja: "自己紹介", zh: "自我介绍", en: "Introduction" },
  industry: { ja: "業界", zh: "行业", en: "Industry" },
  industryDetail: { ja: "業界の詳細", zh: "细分行业", en: "Industry detail" },
  introEmpty: { ja: "自己紹介", zh: "自我介绍", en: "Introduction" },
  introGenerating: { ja: "自己紹介", zh: "自我介绍", en: "Introduction" },
  introOver: { ja: "自己紹介", zh: "自我介绍", en: "Introduction" },
  name: { ja: "氏名", zh: "姓名", en: "Name" },
};

/** 「次へ」左侧（手机在上方）的一句汇总：还差几项、分别是什么；生成中与超字数直接说原因。 */
export function missingSummary(missing: readonly OnboardingMissing[], t: T, language: Lang): string {
  if (missing.includes("introGenerating")) return t({ ja: "自己紹介文をつくっています。できあがるまでお待ちください", zh: "自我介绍还在生成，请稍等", en: "Your introduction is still being drafted" });
  if (missing.includes("introOver")) return t({ ja: "自己紹介を文字数の上限に収めてください", zh: "自我介绍超过字数上限", en: "Your introduction is over the length limit" });
  const names = missing.map(key => t(MISSING_LABELS[key])).join(language === "en" ? ", " : "、");
  return t({ ja: `あと ${missing.length} 項目：${names}`, zh: `还差 ${missing.length} 项：${names}`, en: `${missing.length} left: ${names}` });
}

/** 每页顶部固定提示。 */
export function OnceNote({ t, withScan }: { t: T; withScan: boolean }) {
  return (
    <div className={styles.once}>
      <span className={styles.onceTile} aria-hidden>🪪</span>
      <div>
        {t({ ja: "このプロフィールは", zh: "这份资料", en: "Fill in this profile " })}
        <b>{t({ ja: "一度入力すれば、今後参加するすべてのイベントで使われます", zh: "只填一次，之后参加的每场活动都会用它", en: "once, and every event you join afterwards uses it" })}</b>
        {t({ ja: "。", zh: "。", en: "." })}
        {withScan ? t({ ja: "名刺を読み取ると、ほとんどの項目が自動で入ります。", zh: "扫一下自己的名片，大部分内容会自动填好。", en: " Scan your own card and most of it fills itself in." }) : null}
      </div>
    </div>
  );
}

function Field({ children, className = "", error, help, id, label, origin, phoneLabel, t }: {
  children: ReactNode;
  className?: string;
  error?: string;
  help?: string;
  id: string;
  label: Copy;
  origin?: FieldOrigin;
  phoneLabel?: Copy;
  t: T;
}) {
  return (
    <div className={`${styles.field} ${className} ${error ? styles.err : ""}`}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {phoneLabel ? <><span className={styles.wideOnly}>{t(label)}</span><span className={styles.phoneOnly}>{t(phoneLabel)}</span></> : t(label)}
        {origin === "card" ? <span className={styles.chipLav}>{t({ ja: "名刺から", zh: "来自名片", en: "From card" })}</span> : null}
        {origin === "ai" ? <span className={styles.chipBlue}>{t({ ja: "AI 推定", zh: "AI 推断", en: "AI guess" })}</span> : null}
      </label>
      {children}
      {error ? <span className={styles.msg} id={`${id}-msg`}>{error}</span> : help ? <span className={`${styles.msg} ${styles.phoneOnly}`}>{help}</span> : null}
    </div>
  );
}

function SelectHint({ phone, wide }: { phone: string; wide: string }) {
  return <span className={styles.hint} aria-hidden><span className={styles.wideOnly}>{wide}</span><span className={styles.phoneOnly}>{phone}</span></span>;
}

const invalid = (id: string, error?: string) => (error ? { "aria-describedby": `${id}-msg`, "aria-invalid": true as const } : {});

export function ProfileStep({
  basic, cameraRef, cardScanAvailable, disabled, fileRef, language, missing, onCardDrop, onCardFile, onQr, onUserEdit, origins, scan, scanning, t, todayIso,
}: {
  basic: BasicDraft;
  cameraRef: RefObject<HTMLInputElement | null>;
  cardScanAvailable: boolean;
  disabled: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  language: Lang;
  missing: readonly OnboardingMissing[];
  onCardDrop: (file: File | undefined) => void;
  onCardFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onQr: () => void;
  onUserEdit: (patch: Partial<BasicDraft>) => void;
  origins: Partial<Record<BasicField, FieldOrigin>>;
  scan: { ai: number; card: number } | null;
  scanning: boolean;
  t: T;
  todayIso: string;
}) {
  const [over, setOver] = useState(false);
  const text = (key: "name" | "company" | "title" | "email" | "phone" | "lineId" | "wechatId" | "homeMarket" | "birthDate") => (event: ChangeEvent<HTMLInputElement>) => onUserEdit({ [key]: event.target.value });
  const drag = {
    onDragLeave: () => setOver(false),
    onDragOver: (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); if (!disabled && !scanning) setOver(true); },
    onDrop: (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setOver(false); if (!disabled && !scanning) onCardDrop(event.dataTransfer.files?.[0]); },
  };
  const busy = disabled || scanning;
  const pick = () => fileRef.current?.click();
  const reading = t(ONBOARDING_COPY.flow061);
  const counts = scan ? scan.ai
    ? t({ ja: `名刺から ${scan.card} 項目、AI の推定で ${scan.ai} 項目`, zh: `名片读到 ${scan.card} 项，AI 推断 ${scan.ai} 项`, en: `${scan.card} from your card, ${scan.ai} AI guesses` })
    : t({ ja: `名刺から ${scan.card} 項目`, zh: `名片读到 ${scan.card} 项`, en: `${scan.card} from your card` }) : "";
  const errors = {
    birthDate: missing.includes("birthDate") ? t(ONBOARDING_COPY.flow074) : undefined,
    industry: missing.includes("industry") ? t({ ja: "業界を選んでください", zh: "请选择行业", en: "Choose an industry" }) : undefined,
    industryDetail: missing.includes("industryDetail") ? t({ ja: "業界の詳細を選んでください", zh: "请选择细分行业", en: "Choose the industry detail" }) : undefined,
    name: missing.includes("name") ? t({ ja: "氏名を入力してください", zh: "请填写姓名", en: "Enter your name" }) : undefined,
  };
  const detailHint = basic.primaryIndustryId ? t({ ja: "選択してください", zh: "请选择", en: "Select" }) : t({ ja: "先に業界を選択", zh: "先选行业", en: "Choose an industry first" });
  const anotherImage = t({ ja: "別の画像にする", zh: "换一张图片", en: "Use another image" });
  return (
    <div data-screen-label={ONBOARDING_SCREEN_LABELS.basics}>
      <h2 className={`${styles.title} ${styles.basicsTitle}`}>{t({ ja: "まずは、あなたのことを", zh: "先从你开始", en: "Let's start with you" })}</h2>
      {cardScanAvailable ? <>
        {scan && !scanning ? <div className={`${styles.scan} ${styles.scanDone}`} data-onboarding-scanned="" {...drag}>
          <span className={styles.tile} aria-hidden>📇</span>
          <div className={styles.grow}>
            <b>{t({ ja: `${counts}を入力しました`, zh: counts, en: counts })}</b>
            <div className={styles.lbl}>{t({ ja: "内容を確認して、違うところだけ直してください", zh: "核对一下，只改不对的地方", en: "Check it and fix only what's wrong" })}</div>
          </div>
          <button className={`btn ${styles.sm} ${styles.onTile}`} disabled={busy} onClick={pick} type="button">{anotherImage}</button>
        </div> : <div className={`${styles.scan} ${over ? styles.over : ""}`} data-onboarding-scan="" {...drag}>
          <span className={styles.scanEmoji} aria-hidden>📇</span>
          <div className={styles.grow}>
            <b>{scanning ? reading : t({ ja: "名刺の画像をここにドロップ", zh: "把名片图片拖到这里", en: "Drop your card image here" })}</b>
            <div className={styles.lbl}>{t({ ja: "JPG・PNG・HEIC · 画像は保存されません", zh: "JPG、PNG、HEIC · 图片不会保存", en: "JPG, PNG, HEIC · the image isn't kept" })}</div>
          </div>
          <button className={`btn ${styles.sm}`} disabled={busy} onClick={onQr} type="button"><Icon name="phone" size={16} />{t({ ja: "スマホで撮る（QR）", zh: "用手机拍（二维码）", en: "Use your phone (QR)" })}</button>
          <button className={`btn ${styles.primary}`} disabled={busy} onClick={pick} type="button">{t({ ja: "ファイルを選ぶ", zh: "选择文件", en: "Choose file" })}</button>
        </div>}
        {scan && !scanning ? <div className={styles.scanPhoneDone}>
          <span className={styles.tile} aria-hidden>📇</span>
          <div className={styles.grow}><b>{counts}</b><div className={styles.lbl}>{t({ ja: "違うところだけ直してください", zh: "只改不对的地方", en: "Fix only what's wrong" })}</div></div>
          <button className={`btn ${styles.sm} ${styles.onTile}`} disabled={busy} onClick={pick} type="button">{t({ ja: "別の画像", zh: "换一张", en: "Another" })}</button>
        </div> : <div className={styles.scanPhone}>
          <span aria-hidden>📇</span>
          <b>{scanning ? reading : t({ ja: "自分の名刺の画像で自動入力", zh: "用自己的名片图片自动填写", en: "Fill in from your own card" })}</b>
          <button className={`btn ${styles.primary}`} disabled={busy} onClick={pick} type="button"><Icon name="image" size={16} />{t({ ja: "写真を選ぶ", zh: "选择照片", en: "Choose photo" })}</button>
          <button className={`btn ${styles.sm} ${styles.ghost}`} disabled={busy} onClick={() => cameraRef.current?.click()} type="button">{t({ ja: "カメラで撮る", zh: "用相机拍", en: "Take a photo" })}</button>
        </div>}
        <input accept="image/*,.heic,.heif" className={styles.srOnly} onChange={onCardFile} ref={fileRef} tabIndex={-1} type="file" aria-hidden />
        <input accept="image/*" capture="environment" className={styles.srOnly} onChange={onCardFile} ref={cameraRef} tabIndex={-1} type="file" aria-hidden />
      </> : null}
      <div className={styles.grid2}>
        <Field className={styles.fName} error={errors.name} id="onb-name" label={{ ja: "氏名", zh: "姓名", en: "Name" }} origin={origins.name} t={t}>
          <input className={styles.input} disabled={disabled} id="onb-name" maxLength={60} onChange={text("name")} value={basic.name} {...invalid("onb-name", errors.name)}
            placeholder={errors.name ? "" : t({ ja: "例）佐藤 健一", zh: "例如：张伟", en: "e.g. Kenichi Sato" })} />
        </Field>
        <Field className={styles.fCompany} id="onb-company" label={origins.company ? { ja: "会社", zh: "公司", en: "Company" } : { ja: "会社（任意）", zh: "公司（选填）", en: "Company (optional)" }} origin={origins.company} t={t}>
          <input className={styles.input} disabled={disabled} id="onb-company" maxLength={80} onChange={text("company")} placeholder={t({ ja: "例）株式会社ミナトリンク", zh: "例如：港联科技", en: "e.g. Minatolink Inc." })} value={basic.company} />
        </Field>
        <Field className={styles.fTitle} id="onb-title" label={origins.title ? { ja: "役職", zh: "职位", en: "Title" } : { ja: "役職（任意）", zh: "职位（选填）", en: "Title (optional)" }} origin={origins.title} t={t}>
          <input className={styles.input} disabled={disabled} id="onb-title" maxLength={80} onChange={text("title")} placeholder={t({ ja: "例）代表取締役", zh: "例如：总经理", en: "e.g. CEO" })} value={basic.title} />
        </Field>
        <Field className={styles.fBirth} error={errors.birthDate} help={t({ ja: "相手に公開されません。", zh: "不会公开给对方。", en: "Not shown to others." })} id="onb-birth" label={{ ja: "生年月日（任意）", zh: "生日（选填）", en: "Birthday (optional)" }} t={t}>
          <span className={styles.wrap}><input className={`${styles.input} ${styles.date} ${basic.birthDate ? "" : styles.empty}`} disabled={disabled} id="onb-birth" max={todayIso} onChange={text("birthDate")} type="date" value={basic.birthDate} {...invalid("onb-birth", errors.birthDate)} />{basic.birthDate ? null : <span className={styles.hint} aria-hidden>{t({ ja: "年 / 月 / 日", zh: "年 / 月 / 日", en: "YYYY / MM / DD" })}</span>}<Icon name="calendar" size={16} /></span>
        </Field>
        <Field className={`${styles.fIndustry} ${styles.half}`} error={errors.industry} id="onb-industry" label={{ ja: "業界", zh: "行业", en: "Industry" }} origin={origins.primaryIndustryId} t={t}>
          <span className={styles.wrap}><select className={`${styles.input} ${basic.primaryIndustryId ? "" : styles.empty}`} disabled={disabled} id="onb-industry" value={basic.primaryIndustryId} {...invalid("onb-industry", errors.industry)}
            onChange={event => onUserEdit({ primaryIndustryId: event.target.value as IndustryIdCode | "", secondaryIndustryId: "" })}>
            <option value="">{t({ ja: "選択してください", zh: "请选择", en: "Select" })}</option>
            {INDUSTRY_CATALOG.map(item => <option key={item.id} value={item.id}>{industryLabel(item.id, language)}</option>)}
          </select>{basic.primaryIndustryId ? null : <SelectHint wide={t({ ja: "選択してください", zh: "请选择", en: "Select" })} phone={t({ ja: "選択", zh: "请选择", en: "Select" })} />}<Icon name="down" size={16} /></span>
        </Field>
        <Field className={`${styles.fDetail} ${styles.half}`} error={errors.industryDetail} id="onb-industry-detail" label={{ ja: "業界の詳細", zh: "细分行业", en: "Industry detail" }} origin={origins.secondaryIndustryId} phoneLabel={{ ja: "詳細", zh: "细分", en: "Detail" }} t={t}>
          <span className={styles.wrap}><select className={`${styles.input} ${basic.secondaryIndustryId ? "" : styles.empty}`} disabled={disabled || !basic.primaryIndustryId} id="onb-industry-detail" value={basic.secondaryIndustryId} {...invalid("onb-industry-detail", errors.industryDetail)}
            onChange={event => onUserEdit({ secondaryIndustryId: event.target.value as SecondaryIndustryIdCode | "" })}>
            <option value="">{detailHint}</option>
            {(basic.primaryIndustryId ? listSecondaryIndustries(basic.primaryIndustryId) : []).map(item => <option key={item.id} value={item.id}>{secondaryIndustryLabel(item.id, language)}</option>)}
          </select>{basic.secondaryIndustryId ? null : <SelectHint wide={detailHint} phone={basic.primaryIndustryId ? t({ ja: "選択", zh: "请选择", en: "Select" }) : "—"} />}<Icon name="down" size={16} /></span>
        </Field>
        <Field className={styles.fSeniority} id="onb-seniority" label={origins.seniorityLevel ? { ja: "役職層", zh: "职级", en: "Level" } : { ja: "役職層（任意）", zh: "职级（选填）", en: "Level (optional)" }} origin={origins.seniorityLevel} t={t}>
          <span className={styles.wrap}><select className={`${styles.input} ${basic.seniorityLevel ? "" : styles.empty}`} disabled={disabled} id="onb-seniority" value={basic.seniorityLevel}
            onChange={event => onUserEdit({ seniorityLevel: event.target.value as SeniorityLevelCode | "" })}>
            <option value="">{t({ ja: "選択してください", zh: "请选择", en: "Select" })}</option>
            {SENIORITY_LEVELS.map(level => <option key={level} value={level}>{SENIORITY_LEVEL_LABELS[level][language]}</option>)}
          </select>{basic.seniorityLevel ? null : <SelectHint wide={t({ ja: "選択してください", zh: "请选择", en: "Select" })} phone={t({ ja: "選択", zh: "请选择", en: "Select" })} />}<Icon name="down" size={16} /></span>
        </Field>
        <Field className={styles.fPlace} id="onb-place" label={origins.homeMarket ? { ja: "所在地", zh: "所在地", en: "Location" } : { ja: "所在地（任意）", zh: "所在地（选填）", en: "Location (optional)" }} origin={origins.homeMarket} t={t}>
          <input className={styles.input} disabled={disabled} id="onb-place" maxLength={80} onChange={text("homeMarket")} placeholder={t({ ja: "例）東京", zh: "例如：东京", en: "e.g. Tokyo" })} value={basic.homeMarket} />
        </Field>
      </div>
      <fieldset className={styles.contactMethods} aria-describedby="onb-contact-hint">
        <legend className={styles.fieldLabel}>{t({
          ja: "ここでつながった相手は、どうやってあなたに連絡できますか？",
          zh: "你在此添加的朋友如何联系到你？",
          en: "How can the people you connect with here reach you?",
        })}</legend>
        <p id="onb-contact-hint" className={styles.lbl}>{t({
          ja: "1 つ以上必須。LINE または WeChat がおすすめです。交換した相手と、申し込んだイベントの主催者が確認できます。",
          zh: "至少填一种，推荐 LINE 或微信。完成交换的人脉和你报名活动的主办方可查看。",
          en: "Enter at least one. LINE or WeChat makes it easier to stay in touch. Mutual contacts and organizers of events you apply to can view these details.",
        })}</p>
        <div className={styles.grid2}>
          <Field id="onb-lineId" label={{ ja: "LINE", zh: "LINE", en: "LINE" }} origin={origins.lineId} t={t}>
            <input className={styles.input} disabled={disabled} id="onb-lineId" maxLength={80} onChange={text("lineId")} value={basic.lineId ?? ""} />
          </Field>
          <Field id="onb-wechatId" label={{ ja: "WeChat", zh: "微信", en: "WeChat" }} origin={origins.wechatId} t={t}>
            <input className={styles.input} disabled={disabled} id="onb-wechatId" maxLength={80} onChange={text("wechatId")} value={basic.wechatId ?? ""} />
          </Field>
          <Field id="onb-email" label={{ ja: "メール", zh: "邮箱", en: "Email" }} origin={origins.email} t={t}>
            <input className={styles.input} disabled={disabled} id="onb-email" inputMode="email" maxLength={120} onChange={text("email")} type="email" value={basic.email} />
          </Field>
          <Field id="onb-phone" label={{ ja: "電話", zh: "电话", en: "Phone" }} origin={origins.phone} t={t}>
            <input className={styles.input} disabled={disabled} id="onb-phone" inputMode="tel" maxLength={40} onChange={text("phone")} type="tel" value={basic.phone} />
          </Field>
        </div>
        {missing.includes("contact") ? <div className={styles.errLine} role="alert">{t({
          ja: "連絡先を 1 つ以上入力し、メールや電話番号の形式を確認してください。",
          zh: "请至少填写一种联系方式，并检查邮箱或电话号码的格式。",
          en: "Enter at least one contact method and check any email address or phone number.",
        })}</div> : null}
      </fieldset>
    </div>
  );
}

// The six goal tiles (emoji tile + who it is about).
const GOAL_TILES: Record<string, { emoji: string; tone: AvatarTone; sub: Copy }> = {
  funding: { emoji: "💰", tone: "pink", sub: { ja: "投資家・金融機関", zh: "投资人、金融机构", en: "Investors · lenders" } },
  customers: { emoji: "🏭", tone: "blue", sub: { ja: "決裁者・購買担当", zh: "决策者、采购负责人", en: "Decision makers · buyers" } },
  hiring: { emoji: "🧑‍💼", tone: "teal", sub: { ja: "候補者・紹介者", zh: "候选人、推荐人", en: "Candidates · referrers" } },
  partners: { emoji: "🤝", tone: "apricot", sub: { ja: "協業・販路", zh: "合作、渠道", en: "Alliances · channels" } },
  awareness: { emoji: "📣", tone: "lav", sub: { ja: "登壇・メディア", zh: "演讲、媒体", en: "Talks · media" } },
  research: { emoji: "📚", tone: "blue", sub: { ja: "業界の知見", zh: "行业见解", en: "Industry insight" } },
};

export function GoalsStep({ error, goals, setGoals, setGoalText, t, text }: {
  error: boolean;
  goals: string[];
  setGoals: (value: string[]) => void;
  setGoalText: (value: string) => void;
  t: T;
  text: string;
}) {
  return (
    <div data-screen-label={ONBOARDING_SCREEN_LABELS.goals}>
      <h2 className={styles.title}>{t({ ja: "いちばん達成したいことは？", zh: "你最想达成什么？", en: "What do you most want to achieve?" })}</h2>
      <p className={styles.sub}>{t({ ja: "2個まで。選んだ順に優先します。", zh: "最多 2 个，按选择顺序排优先级。", en: "Pick up to 2, in order of priority." })}</p>
      <div aria-describedby={error ? "onb-goals-msg" : undefined} aria-label={t({ ja: "目標", zh: "目标", en: "Goals" })} className={`${styles.goals} ${error ? styles.goalsErr : ""}`} role="group">{PROFILE_ONBOARDING_GOALS.map((option, index) => {
        const selected = goals.find((value) => value === option.zh || value === option.en || value === option.ja);
        const tile = GOAL_TILES[option.id]!;
        return <button aria-pressed={Boolean(selected)} className={`btn ${styles.goal} ${selected ? styles.on : ""}`} data-goal={option.id} disabled={!selected && goals.length >= 2} id={index === 0 ? "onb-goal-first" : undefined} key={option.id}
          onClick={() => setGoals(selected ? goals.filter((value) => value !== selected) : [...goals, t(option)])} type="button">
          {selected ? <span className={styles.ord}>{goals.indexOf(selected) + 1}</span> : null}
          <MacTile emoji={tile.emoji} tone={tile.tone} size="sm" />{t(option)}<small>{t(tile.sub)}</small>
        </button>;
      })}</div>
      {error ? <div className={styles.errLine} id="onb-goals-msg">{t({ ja: "目標を 1 つ以上選んでください", zh: "请至少选 1 个目标", en: "Choose at least one goal" })}</div> : null}
      <div className={`${styles.field} ${styles.goalField}`}>
        <label className={styles.fieldLabel} htmlFor="onb-goal-line">{t({ ja: "ひとことで（任意）", zh: "一句话说明（选填）", en: "In one line (optional)" })}</label>
        <input className={styles.input} data-goal-line="" id="onb-goal-line" maxLength={80} onChange={(event) => setGoalText(event.target.value)} value={text}
          placeholder={t({ ja: "例）シリーズAで3億円を調達", zh: "例如：A 轮融资 3 亿日元", en: "e.g. Raise ¥300M in a Series A" })} />
        <span className={`${styles.msg} ${styles.goalMsg}`}>{t({ ja: "金額などの数字が入ると、話すべき人が具体的になります", zh: "写上金额等数字，该聊的人会更具体", en: "Numbers make it clearer who you should talk to" })}</span>
      </div>
    </div>
  );
}

/** kit .togs: selected first, then the remaining options up to the board's count, the AI's dashed candidates, ＋ 追加 (an inline field with the full list). */
function TagGroup({ ai = [], aiPicked, emoji, tone, title, limit, onChange, options, shown, t, values }: {
  ai?: readonly string[];
  aiPicked: boolean;
  emoji: string;
  tone: AvatarTone;
  title: Copy;
  limit: number;
  onChange: (update: (current: string[]) => string[]) => void;
  options: readonly Copy[];
  shown: number;
  t: T;
  values: readonly string[];
}) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");
  const id = useId();
  const full = values.length >= limit;
  const candidates = ai.filter(label => !values.includes(label));
  const rest = options.filter(option => !values.some(value => optionMatches(option, value)) && !candidates.some(label => optionMatches(option, label))).slice(0, Math.max(0, shown - values.length));
  const add = () => {
    const option = options.find(item => optionMatches(item, custom.trim()));
    onChange(current => addCustomValue(current, option ? t(option) : custom, limit));
    setCustom("");
    setAdding(false);
  };
  return (
    <div className={styles.group} data-tag-group={title.en}>
      <div className={styles.groupHead}><MacTile emoji={emoji} tone={tone} size="sm" />{t(title)}{aiPicked ? <span className={styles.chipBlue}>{t({ ja: "AI 推定", zh: "AI 推断", en: "AI guess" })}</span> : null}</div>
      <div className={styles.togs}>
        {values.map(value => <button aria-pressed className={`btn ${styles.tog} ${styles.on}`} key={value} onClick={() => onChange(current => current.filter(item => item !== value))} type="button"><Icon name="check" size={16} />{value}</button>)}
        {rest.map(option => <button aria-pressed={false} className={`btn ${styles.tog}`} disabled={full} key={option.en} onClick={() => onChange(current => toggleValue(current, t(option), limit))} type="button">{t(option)}</button>)}
        {candidates.map(label => <button aria-pressed={false} className={`btn ${styles.tog} ${styles.ai}`} data-ai-candidate="" disabled={full} key={label} onClick={() => onChange(current => toggleValue(current, label, limit))} type="button"><Icon name="sparkle" size={16} />{label}</button>)}
        {adding ? <span className={`${styles.tog} ${styles.adding}`}>
          <input aria-label={t(title)} autoFocus list={`${id}-options`} maxLength={24} onBlur={() => { if (!custom.trim()) setAdding(false); }} onChange={event => setCustom(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(); } if (event.key === "Escape") setAdding(false); }} value={custom} />
          <datalist id={`${id}-options`}>{options.filter(option => !values.some(value => optionMatches(option, value))).map(option => <option key={option.en} value={t(option)} />)}</datalist>
        </span> : <button className={`btn ${styles.tog} ${styles.add}`} disabled={full} onClick={() => setAdding(true)} type="button"><Icon name="plus" size={16} />{t({ ja: "追加", zh: "添加", en: "Add" })}</button>}
      </div>
    </div>
  );
}

export interface GroupsProps {
  goals: number;
  offer: string[];
  offerFromAi: boolean;
  seek: string[];
  seekAi: readonly string[];
  setOffer: (update: (current: string[]) => string[]) => void;
  setSeek: (update: (current: string[]) => string[]) => void;
  setTopics: (update: (current: string[]) => string[]) => void;
  t: T;
  topics: string[];
  topicsFromAi: boolean;
}

/** 强项、需求、话题：桌面在右栏卡里，1280 以下接在目标下面。 */
export function StrengthGroups({ goals, offer, offerFromAi, seek, seekAi, setOffer, setSeek, setTopics, t, topics, topicsFromAi }: GroupsProps) {
  const free = t({ ja: "増やす・外すは自由です。", zh: "可以随意增减。", en: "Add or remove as you like." });
  const lead = !(offerFromAi || topicsFromAi) ? t({ ja: "当てはまるものを選んでください。", zh: "选出符合你的。", en: "Pick what fits you. " })
    : goals ? t({ ja: "名刺と目標から候補を選んであります。", zh: "已按名片和目标选好候选。", en: "Picked from your card and goals. " })
      : t({ ja: "名刺の内容から候補を選んであります。", zh: "已按名片内容选好候选。", en: "Picked from your card. " });
  return <>
    <div className={styles.groupsTitle}>{t({ ja: "あなたの「強み」と「求めていること」", zh: "你的「优势」与「需求」", en: "Your strengths and what you're looking for" })}</div>
    <div className={styles.groupsSub}>{lead}{free}</div>
    <TagGroup aiPicked={offerFromAi} emoji="🎁" tone="teal" title={{ ja: "提供できること", zh: "能提供的", en: "What you offer" }} limit={OFFER_LIMIT} options={OFFER_OPTIONS} shown={5} onChange={setOffer} t={t} values={offer} />
    <TagGroup ai={seekAi} aiPicked={false} emoji="🔎" tone="pink" title={{ ja: "求めていること", zh: "正在寻找的", en: "What you're looking for" }} limit={SEEK_LIMIT} options={SEEK_OPTIONS} shown={3} onChange={setSeek} t={t} values={seek} />
    <TagGroup aiPicked={topicsFromAi} emoji="☕" tone="apricot" title={{ ja: "話せる話題", zh: "能聊的话题", en: "Topics you enjoy" }} limit={TOPIC_LIMIT} options={TOPIC_OPTIONS} shown={6} onChange={setTopics} t={t} values={topics} />
  </>;
}

export function IntroStep({
  bio, bioCount, editing, errorCode, goals, missing, offer, onEdit, onRegenerate, onTone, regenerationsLeft, setBio, status, t, tone, topics,
}: {
  bio: string;
  bioCount: { count: number; limit: number; over: boolean };
  editing: boolean;
  errorCode: "INTRO_LIMIT_REACHED" | "SAMPLE_READ_ONLY" | null;
  goals: number;
  missing: readonly OnboardingMissing[];
  offer: number;
  onEdit: () => void;
  onRegenerate: () => void;
  onTone: (tone: IntroTone) => void;
  regenerationsLeft: number;
  setBio: (value: string) => void;
  status: IntroStatus;
  t: T;
  tone: IntroTone;
  topics: number;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const id = useId();
  const generating = status === "generating";
  const problem = missing.length > 0 && !generating;
  const problemText = missing.includes("introEmpty") ? t({ ja: "自己紹介文を入力してください", zh: "请填写自我介绍", en: "Write your introduction" })
    : missing.includes("introOver") ? t({ ja: `${bioCount.limit}文字以内にしてください`, zh: `请控制在 ${bioCount.limit} 字以内`, en: `Keep it within ${bioCount.limit} characters` })
      : missing.includes("headlineOver") ? t({ ja: "自己紹介文をつくり直してください", zh: "请重新生成自我介绍", en: "Draft the introduction again" }) : "";
  const editable = editing || status === "error" || (!generating && !bio.trim() && status !== "idle");
  const editButton = (label: string, className: string) => status === "error" ? null
    : <button aria-pressed={editing} className={`btn ${className}`} disabled={generating} onClick={onEdit} type="button"><Icon name="pen" size={16} />{editing ? t({ ja: "編集を終える", zh: "完成编辑", en: "Done editing" }) : label}</button>;
  return (
    <div data-screen-label={ONBOARDING_SCREEN_LABELS.intro}>
      <div className={styles.headRow}>
        <div>
          <h2 className={styles.title}>{generating ? t({ ja: "自己紹介文をつくっています…", zh: "正在写自我介绍…", en: "Drafting your introduction…" }) : t({ ja: "自己紹介文をつくりました", zh: "已为你写好自我介绍", en: "We drafted your introduction" })}</h2>
          <p className={styles.sub}>{t({ ja: "イベントのプロフィールや、メール下書きの冒頭に使います。", zh: "用于活动资料和邮件草稿的开头。", en: "Used on your event profile and at the top of email drafts." })}</p>
        </div>
        <div className={styles.seg} role="radiogroup" aria-label={t({ ja: "文体", zh: "语气", en: "Style" })}>
          {([["native", t({ ja: "ビジネス", zh: "商务", en: "Business" })], ["en", "English"]] as const).map(([key, label]) =>
            <button aria-checked={tone === key} className={`btn ${tone === key ? styles.on : ""}`} disabled={generating || (tone !== key && status === "error")} key={key} onClick={() => onTone(key)} role="radio" type="button">{label}</button>)}
        </div>
      </div>
      {status === "error" ? <div className={styles.notice} role="alert">
        {errorCode === "INTRO_LIMIT_REACHED"
          ? t({ zh: "介绍草稿的 3 次生成额度已用完。请直接在下面写几句。", en: "All three introduction drafts have been used. Write a few lines below instead.", ja: "自己紹介の生成は3回までです。下に直接入力してください。" })
          : errorCode === "SAMPLE_READ_ONLY"
            ? t({ zh: "示例中不能生成介绍，可以直接在下面写几句。", en: "Drafts can't be generated in the sample. Write a few lines below instead.", ja: "サンプルでは自己紹介を生成できません。下に直接入力してください。" })
            : t({ zh: "这次没有生成成功。可以点「重试」再生成一次，或直接在下面写几句。", en: "That didn't work. Tap Retry, or write a few lines below.", ja: "生成できませんでした。「再試行」を押すか、下に直接入力してください。" })}
      </div> : null}
      <div className={`${styles.introBox} ${problem ? styles.introErr : ""}`} aria-busy={generating || undefined}>
        {generating ? <div className={styles.bones} aria-hidden><i style={{ width: "92%" }} /><i style={{ width: "86%" }} /><i style={{ width: "64%" }} /></div>
          : editable ? <textarea aria-label={t(ONBOARDING_COPY.flow102)} className={styles.introEdit} id="onb-intro" onChange={event => setBio(event.target.value)} rows={5} value={bio} {...invalid("onb-intro", problem ? problemText : undefined)} />
            : <p className={styles.introText} id="onb-intro" tabIndex={-1} {...(problem ? { "aria-describedby": "onb-intro-msg" } : {})}>{bio}</p>}
        {generating ? null : <div className={styles.introMeta}>
          <span className={`${styles.lbl} ${bioCount.over ? styles.over : ""}`}>{bioCount.over
            ? t({ ja: `${bioCount.count} / ${bioCount.limit}文字`, zh: `${bioCount.count} / ${bioCount.limit} 字`, en: `${bioCount.count} / ${bioCount.limit} characters` })
            : t({ ja: `${bioCount.count}文字`, zh: `${bioCount.count} 字`, en: `${bioCount.count} characters` })}</span>
          <span className={styles.whyEnd}><WhyButton open={whyOpen} onToggle={() => setWhyOpen(open => !open)} controls={`${id}-why`} /></span>
          <span className={styles.phoneOnly}>{editButton(t({ ja: "編集", zh: "编辑", en: "Edit" }), styles.sm!)}</span>
        </div>}
        <WhyBody id={`${id}-why`} open={whyOpen && !generating} onSurface>{t({
          ja: `使った情報：基本情報 · 目標${goals}つ · 提供できること${offer}つ · 話題${topics}つ。生年月日と連絡先は使っていません。`,
          zh: `用到的信息：基本信息 · 目标 ${goals} 个 · 能提供的 ${offer} 项 · 话题 ${topics} 个。没有用到生日和联系方式。`,
          en: `Based on: your basics · ${goals} goals · ${offer} offers · ${topics} topics. Your birthday and contact details are not used.`,
        })}</WhyBody>
      </div>
      {problem ? <span className={`${styles.msg} ${styles.errMsg}`} id="onb-intro-msg">{problemText}</span> : null}
      <div className={styles.introActions}>
        {status === "error" && errorCode ? null : <button className={`btn ${styles.btn}`} disabled={generating || (status !== "error" && regenerationsLeft <= 0)} onClick={onRegenerate} type="button">
          <Icon name="refresh" size={16} />{status === "error" ? t({ zh: "重试", en: "Retry", ja: "再試行" }) : t({ ja: "別の案をつくる", zh: "换一版", en: "Try another" })}
          {status === "error" ? null : <span className={styles.left}>{t({ ja: `残り ${regenerationsLeft}回`, zh: `还剩 ${regenerationsLeft} 次`, en: `${regenerationsLeft} left` })}</span>}
        </button>}
        <span className={styles.wideOnly}>{editButton(t({ ja: "直接編集", zh: "直接编辑", en: "Edit" }), styles.btn!)}</span>
        <span className={`${styles.lbl} ${styles.pushEnd}`}>{t({ ja: "自動で公開・送信されることはありません", zh: "不会自动公开或发送", en: "Nothing is published or sent automatically" })}</span>
      </div>
    </div>
  );
}

function GhostRow({ children }: { children: ReactNode }) {
  return <div className={styles.ghostRow}><i aria-hidden />{children}</div>;
}

export function ProfileAside({ basic, initial, language, t }: { basic: BasicDraft; initial: string; language: Lang; t: T }) {
  const name = basic.name.trim();
  const line = [basic.company.trim(), basic.title.trim()].filter(Boolean).join(" · ");
  const industry = basic.primaryIndustryId
    ? [industryLabel(basic.primaryIndustryId, language), basic.secondaryIndustryId ? secondaryIndustryLabel(basic.secondaryIndustryId, language) : ""].filter(Boolean).join(" › ")
    : "";
  return <>
    <div className={styles.asideLabel}>{t({ ja: "相手から見えるあなた", zh: "对方看到的你", en: "How others see you" })}</div>
    <div className={styles.asideCard}>
      <div className={styles.person}>
        <span className={styles.avatar} aria-hidden>{initial}</span>
        <div>{name || line ? <><div className={styles.personName}>{name}</div>{line ? <div className={styles.sub}>{line}</div> : null}</>
          : <GhostRow>{t({ ja: "氏名 · 会社 · 役職", zh: "姓名 · 公司 · 职位", en: "Name · Company · Title" })}</GhostRow>}</div>
      </div>
      {industry || basic.homeMarket.trim() ? <div className={styles.chips}>{industry ? <span className={styles.chipBlue}>{industry}</span> : null}{basic.homeMarket.trim() ? <span className={styles.chipPlain}>{basic.homeMarket.trim()}</span> : null}</div> : null}
      <div className={styles.ghosts}>
        <GhostRow>{t({ ja: "提供できること · 求めていること", zh: "能提供的 · 正在寻找的", en: "What you offer · What you seek" })}</GhostRow>
        <GhostRow>{t({ ja: "自己紹介（ステップ3で作成）", zh: "自我介绍（第 3 步生成）", en: "Introduction (made in step 3)" })}</GhostRow>
      </div>
    </div>
    <div className={`${styles.asideCard} ${styles.flat}`}>
      <div className={styles.row}><MacTile emoji="🔒" tone="lav" size="sm" /><div className={styles.sub}>{t({ ja: "生年月日と連絡先は相手に公開されません。", zh: "生日和联系方式不会公开给对方。", en: "Your birthday and contact details stay private." })}</div></div>
    </div>
  </>;
}

export function IntroAside({ bio, t }: { bio: string; t: T }) {
  const text = bio.trim();
  const opening = text.split(/(?<=[。．.!?！？])/u)[0]?.trim() ?? "";
  return <>
    <div className={styles.asideLabel}>{t({ ja: "使われる場所", zh: "用在哪里", en: "Where it's used" })}</div>
    <div className={styles.asideCard}>
      <div className={styles.row}><MacTile emoji="🎟️" tone="blue" size="sm" /><b className={styles.small}>{t({ ja: "イベントのプロフィール", zh: "活动资料", en: "Event profile" })}</b></div>
      <div className={`${styles.sub} ${styles.clamp}`}>{text || "—"}</div>
    </div>
    <div className={styles.asideCard}>
      <div className={styles.row}><MacTile emoji="✉️" tone="pink" size="sm" /><b className={styles.small}>{t({ ja: "メール下書きの冒頭", zh: "邮件草稿开头", en: "Email draft opening" })}</b></div>
      <div className={`${styles.sub} ${styles.useText}`}>{opening ? t({ ja: `「突然のご連絡失礼いたします。${opening}…」`, zh: `「冒昧打扰。${opening}…」`, en: `“Sorry to reach out out of the blue. ${opening}…”` }) : "—"}</div>
      <div className={`${styles.lbl} ${styles.useText}`}>{t({ ja: "メール・メッセージは下書きまで。送信はあなたが行います。", zh: "邮件和消息只到草稿，由你来发送。", en: "Emails and messages stop at drafts; you send them." })}</div>
    </div>
  </>;
}
