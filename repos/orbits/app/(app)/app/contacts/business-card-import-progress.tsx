"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicV1PreparationJob } from "../../../../features/acquisition/business-card-v1-preparation/public-job";
import { useOrbitLanguage } from "../orbit-language-context";
import { CardImportClientError, IMPORTS, importJSON } from "./business-card-import-client";

type Translate = (copy: { en: string; zh: string }) => string;
export function cardImportError(code: string, t: Translate): string {
  if (code === "UNAUTHORIZED") return t({ en: "Your session expired. Sign in again.", zh: "登录已过期，请重新登录。" });
  if (code === "IMPORT_NOT_FOUND") return t({ en: "This import is unavailable for this account.", zh: "当前账号无法查看这个导入任务。" });
  if (["SOURCE_EXPIRED", "UPLOAD_SOURCE_EXPIRED", "IMPORT_SOURCE_EXPIRED"].includes(code)) return t({ en: "The upload expired. Choose the files again.", zh: "上传已过期，请重新选择文件。" });
  if (["PDF_INVALID", "IMAGE_INVALID", "INVALID_IMPORT_FILES", "BATCH_TOO_LARGE"].includes(code)) return t({
    en: "Choose readable card images (up to 10 MiB each) or a PDF (up to 50 MiB), with at most 500 cards in total.",
    zh: "请选择可读取的名片图片（每张不超过 10 MiB）或 PDF（不超过 50 MiB），一个批次最多 500 张名片。",
  });
  if (code === "IMPORT_CONFLICT" || code === "IMPORT_SOURCE_USED") return t({ en: "This import changed. Refresh its status before retrying.", zh: "导入状态已变化，请刷新状态后重试。" });
  return t({ en: "The request did not complete. Retry to check the saved progress.", zh: "请求未完成，请重试以确认已保存的进度。" });
}
const active = (job: PublicV1PreparationJob) => ["pending", "processing", "ready"].includes(job.state);
const errorCode = (error: unknown) => error instanceof CardImportClientError ? error.code : "IMPORT_UNAVAILABLE";
function validJob(value: PublicV1PreparationJob | undefined, id?: string): value is PublicV1PreparationJob {
  return !!value && typeof value.id === "string" && (!id || value.id === id) &&
    ["pending", "processing", "ready", "completed", "failed", "cancelled"].includes(value.state) &&
    Number.isInteger(value.sourceCount) && value.sourceCount > 0 && Number.isInteger(value.preparedPages) && value.preparedPages >= 0 &&
    Number.isInteger(value.completedSources) && value.completedSources >= 0 && value.completedSources <= value.sourceCount;
}
function label(job: PublicV1PreparationJob, t: Translate) {
  return t({ pending: { en: "Waiting to prepare", zh: "等待准备" }, processing: { en: "Preparing files", zh: "正在准备文件" },
    ready: { en: "Creating recognition batch", zh: "正在创建识别批次" }, completed: { en: "Files prepared", zh: "文件准备完成" },
    failed: { en: "Preparation failed", zh: "文件准备失败" }, cancelled: { en: "Cancelled", zh: "已取消" } }[job.state]);
}
function LoginLink({ t }: { t: Translate }) {
  return <a href={`/app/account/login?next=${encodeURIComponent(typeof window === "undefined" ? "/app/contacts/new" : window.location.pathname)}`}>
    {t({ en: "Sign in", zh: "重新登录" })}</a>;
}

export function BusinessCardImportProgress({ jobId }: { jobId: string }) {
  const { t } = useOrbitLanguage();
  const [job, setJob] = useState<PublicV1PreparationJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const sequence = useRef(0), action = useRef(false);
  useEffect(() => {
    let live = true, timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (action.current) { timer = setTimeout(poll, 3000); return; }
      const ticket = ++sequence.current; let again = true;
      try {
        const data = await importJSON<{ job: PublicV1PreparationJob }>(`${IMPORTS}/${jobId}`);
        if (!validJob(data.job, jobId)) throw new CardImportClientError("IMPORT_UNAVAILABLE");
        if (live && ticket === sequence.current) { setJob(data.job); setError(null); again = active(data.job); }
      } catch (cause) {
        const code = errorCode(cause);
        if (live && ticket === sequence.current) { setError(code); again = !["UNAUTHORIZED", "IMPORT_NOT_FOUND"].includes(code); }
      } finally { if (live && again) timer = setTimeout(poll, 3000); }
    }
    void poll();
    return () => { live = false; clearTimeout(timer); sequence.current++; };
  }, [jobId, reload]);

  async function cancel() {
    if (action.current) return;
    action.current = true; const ticket = ++sequence.current; setCancelling(true); setError(null);
    try {
      const data = await importJSON<{ job: PublicV1PreparationJob }>(`${IMPORTS}/${jobId}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!validJob(data.job, jobId)) throw new CardImportClientError("IMPORT_UNAVAILABLE");
      if (ticket === sequence.current) setJob(data.job);
    } catch (cause) { if (ticket === sequence.current) setError(errorCode(cause)); }
    finally { action.current = false; setCancelling(false); }
  }
  return <section className="card" style={{ padding: 20 }}>
    <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>{t({ en: "Prepare card import", zh: "准备名片导入" })}</h1>
    {!job && !error ? <p role="status">{t({ en: "Loading saved progress…", zh: "正在读取已保存的进度…" })}</p> : null}
    {job ? <>
      <div role="status" aria-live="polite">
        <p>{label(job, t)}</p>
        <p>{t({ en: `${job.completedSources}/${job.sourceCount} files prepared · ${job.preparedPages} pages saved`,
          zh: `已准备 ${job.completedSources}/${job.sourceCount} 个文件，已保存 ${job.preparedPages} 页` })}</p>
        {active(job) ? <progress aria-label={t({ en: "File preparation", zh: "文件准备进度" })}
          value={job.completedSources} max={job.sourceCount} style={{ width: "100%" }} /> : null}
        {job.currentSourcePageCount && active(job) ? <p>{t({ en: `Current file: ${Math.max(0, (job.currentSourcePage ?? 1) - 1)}/${job.currentSourcePageCount} pages`,
          zh: `当前文件已准备 ${Math.max(0, (job.currentSourcePage ?? 1) - 1)}/${job.currentSourcePageCount} 页` })}</p> : null}
      </div>
      {active(job) ? <p style={{ color: "var(--text-3)", fontSize: 13 }}>{t({
        en: "Your files are uploaded. You can close this page and return from the import center; preparation continues in the background.",
        zh: "文件已上传。你可以关闭页面，稍后从导入中心返回；文件准备会在后台继续。",
      })}</p> : null}
      {job.errorCode ? <p role="status">{active(job) ? t({ en: "Preparation is temporarily unavailable and will retry automatically.", zh: "文件准备暂时受阻，稍后会自动重试。" }) : cardImportError(job.errorCode, t)}</p> : null}
      {job.state === "cancelled" ? <p>{t({ en: "Preparation stopped. Temporary files are scheduled for cleanup.", zh: "文件准备已停止，临时文件已安排清理。" })}</p> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {job.state === "completed" && job.batchId ? <a className="btn btn-primary" href={`/app/contacts/new/batch/${encodeURIComponent(job.batchId)}`}>
          {t({ en: "View recognition batch", zh: "查看识别批次" })}</a> : null}
        {!["completed", "cancelled"].includes(job.state) ? <button className="btn btn-ghost" type="button" disabled={cancelling} onClick={() => void cancel()}>
          {cancelling ? t({ en: "Cancelling…", zh: "正在取消…" }) : t({ en: "Cancel import", zh: "取消导入" })}</button> : null}
        {["failed", "cancelled"].includes(job.state) ? <a className="btn btn-ghost" href="/app/contacts/new">{t({ en: "Choose files again", zh: "重新选择文件" })}</a> : null}
      </div>
    </> : null}
    {error ? <div role="alert" style={{ marginTop: 12, color: "var(--amber-text)" }}>
      <p>{cardImportError(error, t)}</p>
      {error === "UNAUTHORIZED" ? <LoginLink t={t} /> : <button type="button" className="btn btn-ghost" onClick={() => setReload((n) => n + 1)}>{t({ en: "Refresh status", zh: "刷新状态" })}</button>}
    </div> : null}
  </section>;
}

export function BusinessCardImportJobs({ batchIds }: { batchIds: readonly string[] }) {
  const { t } = useOrbitLanguage();
  const [jobs, setJobs] = useState<PublicV1PreparationJob[]>([]), [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true, timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      let again = false;
      try {
        const mode = await importJSON<{ directUpload: boolean }>("/api/contact-drafts/business-card/uploads");
        if (mode.directUpload === false) return;
        if (mode.directUpload !== true) throw new CardImportClientError("IMPORT_UNAVAILABLE");
        const data = await importJSON<{ jobs: PublicV1PreparationJob[] }>(IMPORTS);
        if (!Array.isArray(data.jobs) || data.jobs.some((job) => !validJob(job))) throw new CardImportClientError("IMPORT_UNAVAILABLE");
        if (live) { setJobs(data.jobs); setError(null); again = data.jobs.some(active); }
      } catch (cause) { if (live) setError(errorCode(cause)); }
      finally { if (live && again) timer = setTimeout(poll, 5000); }
    }
    void poll(); return () => { live = false; clearTimeout(timer); };
  }, [reload]);
  const visible = jobs.filter((job) => job.state !== "cancelled" && !(job.batchId && batchIds.includes(job.batchId)));
  return <>
    {visible.length ? <div style={{ display: "grid", gap: 8, marginTop: 12 }} aria-label={t({ en: "Saved imports", zh: "已保存的导入任务" })}>
      {visible.map((job) => <a className="card" key={job.id} href={`/app/contacts/new/import/${encodeURIComponent(job.id)}`} style={{ padding: 12, color: "var(--ink)", textDecoration: "none" }}>
        <span>{label(job, t)}</span><span style={{ marginLeft: 8, color: "var(--text-3)" }}>{t({ en: `${job.sourceCount} files · ${job.preparedPages} pages`, zh: `${job.sourceCount} 个文件 · ${job.preparedPages} 页` })}</span>
      </a>)}
    </div> : null}
    {error ? <div role="alert" style={{ marginTop: 12 }}>
      <p>{cardImportError(error, t)}</p>{error === "UNAUTHORIZED" ? <LoginLink t={t} /> :
        <button className="btn btn-ghost" type="button" onClick={() => setReload((n) => n + 1)}>{t({ en: "Reload saved imports", zh: "重新加载导入任务" })}</button>}
    </div> : null}
  </>;
}
