import type { NoteContract } from "../../shared/contract/notes";

export type NoteDTO = NoteContract;

export type NoteOperationKind = "create" | "update" | "unlink_contact";

export interface NoteOperationReceipt {
  idempotencyKey: string;
  kind: NoteOperationKind;
  fingerprint: string;
  resultVersion: number;
}

export interface NoteRecordPayload {
  schemaVersion: 1;
  note: NoteDTO;
  operations: readonly NoteOperationReceipt[];
}
