/** Stable recovery signals. Messages never contain provider diagnostics. */
export class CardUploadSourceError extends Error {
  constructor(readonly code: "UPLOAD_SOURCE_EXPIRED" | "UPLOAD_SOURCE_NOT_UPLOADED") {
    super(code === "UPLOAD_SOURCE_EXPIRED" ? "Upload source is not available for processing; reserve a new upload." : "Uploaded file could not be verified. Please retry the upload.");
    this.name = "CardUploadSourceError";
  }
}
