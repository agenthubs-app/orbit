"use client";

/**
 * UR-S 对方的联系方式（人脉详情 · 主办方报名者详情，2026-11-27 定稿）：每行「名称 + 值 + 能做的事」。
 * LINE / WeChat 只复制（不做「LINE で開く」，已定）；メール：mailto + 复制（手机只留メール，复制靠长按值）；
 * 電話：电脑复制，手机直接拨号。一个都没有时一行「連絡先は共有されていません」。生日从不出现在这里。
 */
import type { ProfileContactMethods } from "../../../../../shared/compute/profile-contact-methods";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { Icon } from "./Icon";
import { useScopeLanguage } from "./Scope";
import { useToast } from "./Toast";
import styles from "./ContactMethodRows.module.css";

type Text = Record<OrbitLanguage, string>;
const COPY = {
  title: { ja: "連絡先", zh: "联系方式", en: "Contact" },
  email: { ja: "メール", zh: "邮箱", en: "Email" },
  phone: { ja: "電話", zh: "电话", en: "Phone" },
  copy: { ja: "コピー", zh: "复制", en: "Copy" },
  mail: { ja: "メール", zh: "发邮件", en: "Email" },
  call: { ja: "電話", zh: "打电话", en: "Call" },
  none: { ja: "連絡先は共有されていません", zh: "对方没有共享联系方式", en: "No contact details shared" },
  copiedLine: { ja: "LINE ID をコピーしました", zh: "已复制 LINE ID", en: "LINE ID copied" },
  copiedWechat: { ja: "WeChat ID をコピーしました", zh: "已复制 WeChat ID", en: "WeChat ID copied" },
  copiedEmail: { ja: "メールアドレスをコピーしました", zh: "已复制邮箱", en: "Email address copied" },
  copiedPhone: { ja: "電話番号をコピーしました", zh: "已复制电话号码", en: "Phone number copied" },
  copyFailed: { ja: "コピーできませんでした", zh: "没能复制", en: "Couldn't copy" },
} satisfies Record<string, Text>;

export const CONTACT_METHODS_TITLE = COPY.title;

export function ContactMethodRows({ methods, boxed = false }: { methods: ProfileContactMethods | null | undefined; /** 报名者详情：浅灰底块（b13 .det-sec）。 */ boxed?: boolean }) {
  const language = useScopeLanguage();
  const toast = useToast();
  const t = (text: Text) => text[language] ?? text.ja;
  const copy = (value: string, done: Text) => {
    void navigator.clipboard?.writeText(value).then(() => toast.success(t(done)), () => toast.error(t(COPY.copyFailed)));
  };
  const copyButton = (value: string, done: Text, cls = "") => <button type="button" className={`btn ${styles.act} ${cls}`} onClick={() => copy(value, done)} data-contact-copy="">{t(COPY.copy)}</button>;
  const rows: { key: string; label: string; value: string; acts: JSX.Element }[] = [];
  const m = methods ?? {};
  if (m.lineId) rows.push({ key: "lineId", label: "LINE", value: m.lineId, acts: copyButton(m.lineId, COPY.copiedLine) });
  if (m.wechatId) rows.push({ key: "wechatId", label: "WeChat", value: m.wechatId, acts: copyButton(m.wechatId, COPY.copiedWechat) });
  if (m.email) rows.push({ key: "email", label: t(COPY.email), value: m.email, acts: <>
    <a className={`btn ${styles.act}`} href={`mailto:${m.email}`} data-contact-mail=""><Icon name="mail" size={16} />{t(COPY.mail)}</a>
    {copyButton(m.email, COPY.copiedEmail, styles.wideOnly)}
  </> });
  if (m.phone) rows.push({ key: "phone", label: t(COPY.phone), value: m.phone, acts: <>
    {copyButton(m.phone, COPY.copiedPhone, styles.wideOnly)}
    <a className={`btn ${styles.act} ${styles.phoneOnly}`} href={`tel:${m.phone.replace(/[^\d+]/gu, "")}`} data-contact-call=""><Icon name="phone" size={16} />{t(COPY.call)}</a>
  </> });
  return (
    <div className={boxed ? styles.box : undefined} data-contact-methods={rows.length}>
      {rows.length ? rows.map(row => (
        <div key={row.key} className={styles.row} data-contact-method={row.key}>
          <div className={styles.grow}><small>{row.label}</small><b>{row.value}</b></div>
          <div className={styles.acts}>{row.acts}</div>
        </div>
      )) : <div className={styles.none}>{t(COPY.none)}</div>}
    </div>
  );
}
