// R12 名刺 · 読み取り / まとめて確認 / 完成 (DESIGN §2.2): what the batch screen draws and
// what it can do. The route adapter (contacts/new/_add) builds this from the shared card
// batch state machine (useCardBatch) — the screen never touches the legacy modules.
import type { IngestContactCandidateContract } from "../../../../../shared/contract/business-card-batch";
import type { IngestV2CardDraft, IngestV2CardViewModel, IngestV2Field } from "../../contacts/ingest-v2/ingest-v2-route-view-model";

/** One card in the reading list (b11 A1 ③): 名前 / 読み取り中 / 重複 / 推測あり / 読み取れず. */
export type ScanCardKind = "uploading" | "queued" | "reading" | "duplicate" | "guess" | "failed" | "ready" | "added" | "skipped";

/** Where a card still waiting for the person sits in まとめて確認 (b9 A1 / A2 ④). */
export type ScanSection = "duplicate" | "review" | "ready" | "failed";

/** 要確認 grouped by the existing issue codes (DESIGN §2.2 step 6; no new OCR categories). */
export type ScanIssueGroup = "name" | "orgSuffix" | "misread" | "sides" | "enrichment" | "format" | "other";

export type ScanFailure = "image" | "busy";

export interface ScanCardView {
  cardId: string;
  kind: ScanCardKind;
  name: string;
  organization: string;
  role: string;
  twoSided: boolean;
  fileName: string;
  /** null = nothing left to do for this card (added / skipped / still reading). */
  section: ScanSection | null;
  issueGroup: ScanIssueGroup | null;
  failure: ScanFailure | null;
  candidate: IngestContactCandidateContract | null;
  card: IngestV2CardViewModel;
  draft: IngestV2CardDraft | null;
  flagged: readonly IngestV2Field[];
}

export type ScanPhase = "loading" | "missing" | "expired" | "cancelled" | "uploading" | "reading" | "importing" | "review" | "done";

export interface ScanAttributionEvent {
  eventId: string;
  title: string;
  startsAt: string;
}

export interface ScanBatchView {
  batchId: string;
  phase: ScanPhase;
  createdAt: string | null;
  /** The batch is `completed` (every card confirmed or skipped; plan candidates were queued). */
  completed: boolean;
  photos: number;
  uploaded: number;
  settled: number;
  cards: readonly ScanCardView[];
  counts: {
    duplicate: number;
    review: number;
    /** Added without a look (auto import) + clean cards held only for 会った場所. */
    asIs: number;
    autoAdded: number;
    held: number;
    failed: number;
    /** 完成: new contacts, merged into existing ones, unreadable (never counted as added). */
    created: number;
    merged: number;
    unreadable: number;
  };
  events: readonly ScanAttributionEvent[];
  /** The event chosen for the whole batch (null = つけない / no candidate). */
  selectedEventId: string | null;
  /** Events actually written on confirmation (receipt metEventId), for the 完成 scene line. */
  writtenEventIds: readonly string[];
  uploadFailed: boolean;
  missingFiles: number;
}

export type ScanSettleResult = "created" | "merged" | "duplicate" | "blocked" | "failed" | "skipped";

export interface ScanBatchActions {
  setDraft: (cardId: string, draft: IngestV2CardDraft) => void;
  settle: (cardId: string, kind: "confirm" | "merge" | "skip") => Promise<ScanSettleResult>;
  refresh: () => Promise<void>;
  retryRecognition: (cardId: string) => Promise<void>;
  replace: (cardId: string, file: File) => Promise<boolean>;
  chooseEvent: (eventId: string | null) => void;
  retryUpload: () => void;
  reattach: (files: FileList | null) => void;
}
