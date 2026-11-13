"use client";

// 申込フォームの質問集（申込設定・新規作成の両方）：右のドロワーでカテゴリ・検索から選び、選択肢を見て、まとめて追加する。
// 題庫は shared/domain/host-question-library.ts（サーバーの「質問案」と同じ表）。入れた質問は QuestionCard でそのまま編集・並べ替え。
import { useMemo, useState } from "react";

import type { HostSetupQuestion } from "../../../../../shared/contract/host-console";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import {
  HOST_QUESTION_CATEGORY_IDS, entryQuestion, hostQuestionCategoryLabel, remainingQuestionSlots, searchLibrary,
  type HostLibraryEntry, type HostQuestionCategory,
} from "../../../../../shared/domain/host-question-library";
import { CategoryTabs, Drawer, Icon, SearchField } from "../ui";
import type { HostT } from "./host-model";
import s from "./host.module.css";
import u from "./setup.module.css";

const KIND_LABEL = { free: "qkFree", multiple: "qkMultiple", single: "qkSingle" } as const;
const KIND_TONE = { free: "c_apricot", multiple: "c_blue", single: "c_lav" } as const;
/** 選択肢のプレビューは先頭 6 個 +「ほか N」。 */
const PREVIEW_OPTIONS = 6;

type Category = HostQuestionCategory | "all";

/** 選ぶ / 外す（選んだ順を保つ。`room` 問まで）。上限で選べなかったら `full: true`。 */
export function togglePick(picked: readonly string[], id: string, room: number): { picked: string[]; full: boolean } {
  if (picked.includes(id)) return { full: false, picked: picked.filter((item) => item !== id) };
  if (picked.length >= room) return { full: true, picked: [...picked] };
  return { full: false, picked: [...picked, id] };
}

/** ドロワーの中身（テストからも描画する）。 */
export function QuestionLibraryPanel({ questions, t, language, picked, query, category, onQuery, onCategory, onToggle }: {
  questions: readonly HostSetupQuestion[];
  t: HostT;
  language: OrbitLanguage;
  picked: readonly string[];
  query: string;
  category: Category;
  onQuery: (query: string) => void;
  onCategory: (category: Category) => void;
  onToggle: (id: string) => void;
}) {
  const inForm = new Set(questions.map((question) => question.id));
  const room = remainingQuestionSlots(questions);
  const matches = searchLibrary(query, "all");
  const shown = category === "all" ? matches : matches.filter((entry) => entry.category === category);
  const counts = new Map<HostQuestionCategory, number>();
  for (const entry of matches) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  const tabs = [{ count: matches.length, key: "all" as Category, label: t("qlAll") }, ...HOST_QUESTION_CATEGORY_IDS.filter((id) => counts.has(id)).map((id) => ({ count: counts.get(id), key: id as Category, label: hostQuestionCategoryLabel(id, language) }))];
  const groups = HOST_QUESTION_CATEGORY_IDS.map((id) => [id, shown.filter((entry) => entry.category === id)] as const).filter(([, list]) => list.length > 0);
  return (
    <div className={u.qlPanel} data-host-qlib="">
      <div className={u.qlTools}>
        <SearchField value={query} onChange={onQuery} placeholder={t("qlSearch")} />
        <CategoryTabs<Category> label={t("qlCats")} value={tabs.some((tab) => tab.key === category) ? category : "all"} onChange={onCategory} options={tabs} />
      </div>
      {room === 0 ? <div className={`${s.lbl} ${u.qlNote}`} role="status">{t("qlFormFull")}</div> : null}
      {groups.length === 0 ? <div className={`${s.lbl} ${u.qlEmpty}`}>{t("qlNone")}</div> : null}
      {groups.map(([id, list]) => (
        <section key={id} className={u.qlGroup} data-host-qlib-cat={id}>
          {category === "all" ? <h4 className={u.qlCat}>{hostQuestionCategoryLabel(id, language)}</h4> : null}
          {list.map((entry) => <LibraryRow key={entry.id} entry={entry} t={t} language={language} added={inForm.has(entry.id)} picked={picked.includes(entry.id)} blocked={!picked.includes(entry.id) && picked.length >= room} onToggle={() => onToggle(entry.id)} />)}
        </section>
      ))}
    </div>
  );
}

function LibraryRow({ entry, t, language, added, picked, blocked, onToggle }: { entry: HostLibraryEntry; t: HostT; language: OrbitLanguage; added: boolean; picked: boolean; blocked: boolean; onToggle: () => void }) {
  const question = entryQuestion(entry, language);
  const on = added || picked;
  const rest = question.options.length - PREVIEW_OPTIONS;
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-disabled={added || blocked || undefined} aria-label={t("qlSelect", { q: question.prompt })}
      className={`btn ${u.qlRow} ${on ? u.qlRowOn : ""} ${added ? u.qlRowIn : ""} ${blocked && !added ? u.qlRowBlocked : ""}`} data-host-qlib-q={entry.id} data-picked={picked ? "" : undefined}
      onClick={() => { if (!added) onToggle(); }}>
      <span className={`${u.qlBox} ${on ? u.qlBoxOn : ""}`} aria-hidden><Icon name="check" size={16} /></span>
      <span className={u.qlMain}>
        <span className={u.qlHead}>
          <b>{question.prompt}</b>
          <span className={`${s.chip} ${s[KIND_TONE[question.kind]]}`}>{t(KIND_LABEL[question.kind])}</span>
          {added ? <span className={`${s.chip} ${s.c_teal}`}>{t("qlIn")}</span> : null}
        </span>
        {question.options.length ? (
          <span className={u.qlOpts}>
            {question.options.slice(0, PREVIEW_OPTIONS).map((option) => <span key={option} className={u.qlOpt}>{option}</span>)}
            {rest > 0 ? <span className={`${s.lbl} ${u.qlMore}`}>{t("qlMore", { n: rest })}</span> : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** 「質問集から選ぶ」のドロワー。開くたびに選択は空から。 */
export function QuestionLibraryDrawer({ open, questions, t, language, onClose, onAdd }: { open: boolean; questions: readonly HostSetupQuestion[]; t: HostT; language: OrbitLanguage; onClose: () => void; onAdd: (ids: string[]) => void }) {
  const [{ picked, full }, setPick] = useState<{ picked: string[]; full: boolean }>({ full: false, picked: [] });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const room = remainingQuestionSlots(questions);
  const reset = () => { setPick({ full: false, picked: [] }); setQuery(""); };
  const close = () => { reset(); onClose(); };
  // 下の帯：選んだ数と残り；上限を超えて選ぼうとしたら理由をここに出す（押した場所の近くで見える）。
  const status = useMemo(() => (full ? t("qlFull") : picked.length ? t("qlPicked", { m: room - picked.length, n: picked.length }) : t("qlLeft", { n: room })), [full, picked.length, room, t]);
  return (
    <Drawer open={open} onClose={close} title={t("qlTitle")} subtitle={t("qlSub")} size="lg" fullOnPhone
      footer={<>
        <span className={`${s.lbl} ${u.qlStatus} ${full ? u.saveWarn : ""}`} aria-live="polite" data-host-qlib-status={full ? "full" : ""}>{status}</span>
        <button type="button" className={`btn ${s.btn}`} onClick={close}>{t("cancel")}</button>
        <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={picked.length === 0} onClick={() => { const ids = picked; reset(); onAdd(ids); }} data-host-qlib-add={picked.length}>{picked.length ? t("qlAdd", { n: picked.length }) : t("suAdd")}</button>
      </>}>
      <QuestionLibraryPanel questions={questions} t={t} language={language} picked={picked} query={query} category={category}
        onQuery={setQuery} onCategory={setCategory}
        onToggle={(id) => setPick((current) => togglePick(current.picked, id, room))} />
    </Drawer>
  );
}

