export type IngestV2Copy = { en: string; zh: string; ja: string };

/**
 * Copy owned by the batch importer. Keeping the three languages together makes
 * it impossible for a newly added interaction to silently fall back to English
 * when the account is set to Japanese.
 */
export const INGEST_V2_COPY = {
  batchImport: { en: "BATCH IMPORT", zh: "批量导入", ja: "一括インポート" },
  choosePhotos: { en: "Choose photos", zh: "选择名片照片", ja: "名刺写真を選ぶ" },
  addPhotos: { en: "Add photos", zh: "添加照片", ja: "写真を追加" },
  replacePhoto: { en: "Replace", zh: "更换", ja: "置き換え" },
  preparing: { en: "Preparing…", zh: "准备中…", ja: "準備中…" },
  card: { en: "card", zh: "张卡", ja: "枚" },
  cards: { en: "cards", zh: "张卡", ja: "枚のカード" },
  cardTitle: { en: "Card", zh: "卡片", ja: "名刺" },
  photo: { en: "photo", zh: "张照片", ja: "枚の写真" },
  photos: { en: "photos", zh: "张照片", ja: "枚の写真" },
  oneCardPerPhoto: { en: "One card per photo", zh: "一卡一照", ja: "1枚の写真に1枚の名刺" },
  pairBeforeUpload: {
    en: "Photos start as separate cards. Choose a photo explicitly when it belongs on the back of another card.",
    zh: "照片默认各自成卡。只有你明确选择后，照片才会放到另一张卡的反面。",
    ja: "写真は別々のカードから始まります。別のカードの裏面にする写真は、明示的に選んでください。",
  },
  front: { en: "Front", zh: "正面", ja: "表面" },
  back: { en: "Back", zh: "反面", ja: "裏面" },
  emptyBack: { en: "No back photo", zh: "尚未添加反面", ja: "裏面写真なし" },
  useAsBack: { en: "Use photo as back", zh: "将照片放入反面", ja: "裏面写真にする" },
  selectPhoto: { en: "Select a photo", zh: "选择照片", ja: "写真を選択" },
  removeBack: { en: "Remove back", zh: "移出反面", ja: "裏面から外す" },
  removePhoto: { en: "Remove photo", zh: "移除照片", ja: "写真を削除" },
  clearPairing: { en: "Clear pairing", zh: "取消配对", ja: "ペアを解除" },
  confirmPairing: { en: "Confirm pairing and upload", zh: "确认配对并上传", ja: "ペアを確定してアップロード" },
  retryUpload: { en: "Retry upload", zh: "重试上传", ja: "アップロードを再試行" },
  adjustPairing: { en: "Adjust pairing", zh: "调整配对", ja: "ペアを調整" },
  requestFrozen: { en: "This upload is saved. You can retry it safely.", zh: "这次上传已保留，可以安全重试。", ja: "このアップロードは保持されています。安全に再試行できます。" },
  pairingChanged: { en: "Pairing changed. Confirm again to create a new request.", zh: "配对已改变，请重新确认以创建新的请求。", ja: "ペアが変更されました。もう一度確定して新しい要求を作成してください。" },
  tooManyPhotos: { en: "Too many photos for one batch.", zh: "单批照片数量过多。", ja: "1回の一括処理で選べる写真が多すぎます。" },
  exceedsLimit: { en: "exceeds the 10 MiB per-photo limit.", zh: "超过单张 10 MiB 上限。", ja: "1枚あたり10 MiBの上限を超えています。" },
  review: { en: "Review", zh: "复核", ja: "確認" },
  sourceFront: { en: "Front source", zh: "正面来源", ja: "表面の出典" },
  sourceBack: { en: "Back source", zh: "反面来源", ja: "裏面の出典" },
  sourceManual: { en: "Manual", zh: "手工", ja: "手入力" },
  sourceExpired: { en: "Source changed — choose this field again.", zh: "来源已变化，请重新选择此字段。", ja: "出典が変わりました。この項目をもう一度選んでください。" },
  imageUnavailable: { en: "This image is unavailable. Replace the photo before confirming.", zh: "图片不可用，请先替换照片再确认。", ja: "画像を利用できません。確認する前に写真を置き換えてください。" },
  imageExpired: { en: "This image has expired. Replace the photo to continue.", zh: "图片已过期，请替换照片后继续。", ja: "画像の有効期限が切れています。写真を置き換えて続行してください。" },
  sameContact: { en: "Both sides were saved to the same contact.", zh: "正反面已保存到同一个联系人。", ja: "表面と裏面を同じ連絡先に保存しました。" },
  duplicate: { en: "This contact may already exist.", zh: "该联系人可能已经存在。", ja: "この連絡先は既に存在する可能性があります。" },
  createAnyway: { en: "Continue and create", zh: "仍然创建", ja: "続行して作成" },
  skipCard: { en: "Skip this card (both sides)", zh: "排除此卡（含两面）", ja: "このカードをスキップ（両面）" },
  cardCount: { en: "Cards", zh: "卡片", ja: "カード" },
  photoCount: { en: "Photos", zh: "照片", ja: "写真" },
  twoSided: { en: "Two-sided", zh: "双面", ja: "両面" },
  singleSided: { en: "Single-sided", zh: "单面", ja: "片面" },
  noDigest: { en: "The image is not ready yet. Replace the photo before confirming.", zh: "图片尚未就绪，请替换后再确认。", ja: "画像の準備ができていません。確認前に写真を置き換えてください。" },
  previousSourceInvalidated: { en: "A photo changed, so affected source choices need review. Manual fields were kept.", zh: "照片发生变化，受影响的来源选择需要重新复核；手工字段已保留。", ja: "写真が変更されたため、影響する出典の再確認が必要です。手入力項目は保持しました。" },
  waitingFile: { en: "Waiting for file", zh: "等待文件", ja: "ファイル待ち" },
  uploadFailed: { en: "Upload failed", zh: "上传失败", ja: "アップロード失敗" },
  unableToPrepare: { en: "The photo could not be prepared. Try another photo.", zh: "照片准备失败，请换一张照片重试。", ja: "写真を準備できませんでした。別の写真を試してください。" },
  startRecognition: { en: "Start recognition", zh: "开始识别", ja: "認識を開始" },
} as const satisfies Record<string, IngestV2Copy>;

export function countCopy(value: number, singular: IngestV2Copy, plural: IngestV2Copy): IngestV2Copy {
  return value === 1 ? singular : plural;
}
