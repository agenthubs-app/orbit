export function contentUploadErrorCopy(code: string | null) {
  if (code?.startsWith("IMAGE_INVALID")) return {
    en: "This image could not be read. Choose another file.", zh: "无法读取这张图片，请重新选择文件。",
  };
  if (code === "UNAUTHORIZED" || code === "HTTP_401") return {
    en: "Sign in again, then retry the upload.", zh: "请重新登录后重试上传。",
  };
  if (code === "VERSION_CONFLICT" || code === "CONTENT_MISMATCH") return {
    en: "The item has changed. Refresh and check it before retrying.", zh: "这张名片已发生变化，请刷新核对后重试。",
  };
  if (code === "BATCH_GONE") return {
    en: "This batch is no longer available. Return to the import center.", zh: "此批次已不可用，请返回导入中心。",
  };
  return { en: "Upload did not finish. Retry with the same file.", zh: "上传尚未完成，请使用同一文件重试。" };
}
