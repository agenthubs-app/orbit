import assert from "node:assert/strict";
import test from "node:test";

import { createTranslator, type MessageKey } from "../src/i18n/messages";

const keys = [
  "notes.title",
  "notes.new",
  "notes.search",
  "notes.relatedPeople",
  "notes.relatedEvents",
  "notes.edit",
  "notes.autosaving",
  "notes.legacyReadOnly",
  "notes.untitled",
  "notes.titleRequired",
  "notes.bodyRequired",
  "notes.versionInvalid",
  "notes.aiTaskPrompt",
  "sync.localReady",
  "sync.syncing",
  "sync.fresh",
  "sync.stale",
  "sync.failure",
  "sync.lastSynced",
] as const;

test("notes chrome is translated in Chinese, Japanese, and English", () => {
  const expected = {
    zh: ["笔记", "新建笔记", "搜索笔记", "相关人脉", "相关活动", "编辑笔记", "正在自动保存…", "历史联系人备注（只读）", "未命名笔记", "请输入笔记标题。", "请输入笔记内容。", "笔记版本无效，请重新读取。", "请根据这篇笔记整理一个待办，并明确标题和日期。", "正在读取本地内容…", "正在同步最新内容…", "已是最新内容", "显示本地内容，联网后可刷新", "同步失败，请重试。", "上次同步：{time}"],
    ja: ["メモ", "新しいメモ", "メモを検索", "関連する人", "関連イベント", "メモを編集", "自動保存中…", "過去の連絡先メモ（読み取り専用）", "無題のメモ", "メモのタイトルを入力してください。", "メモ本文を入力してください。", "メモのバージョンが無効です。再読み込みしてください。", "このメモからタスクを整理し、タイトルと日付を明確にしてください。", "端末の内容を読み込んでいます…", "最新の内容を同期しています…", "最新の内容です", "端末の内容を表示中です。オンラインで更新できます。", "同期できませんでした。もう一度お試しください。", "最終同期：{time}"],
    en: ["Notes", "New note", "Search notes", "Related people", "Related events", "Edit note", "Autosaving…", "Legacy contact notes (read only)", "Untitled note", "Enter a note title.", "Enter note content.", "The note version is invalid. Reload it.", "Turn this note into a task with a clear title and date.", "Loading saved content…", "Syncing the latest content…", "Up to date", "Showing saved content. Refresh when online.", "Sync failed. Try again.", "Last synced: {time}"],
  } as const;

  for (const language of ["zh", "ja", "en"] as const) {
    const t = createTranslator(language);
    assert.deepEqual(keys.map((key) => t(key as MessageKey)), expected[language]);
  }
});

test("note titles, bodies, people, and event names remain literal in every language", () => {
  const values = ["東京 launch / 发布准备", "佐藤 / Sato", "Climate dinner / 气候晚宴", "note:stable-0025"];
  for (const language of ["zh", "ja", "en"] as const) {
    const t = createTranslator(language);
    assert.deepEqual(values.map((value) => t.literal(value)), values);
  }
});
