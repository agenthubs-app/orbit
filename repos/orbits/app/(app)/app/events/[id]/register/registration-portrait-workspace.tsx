"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { EVENT_PARTICIPANT_PROFILE_FIELDS } from "../../../../../../features/events/registration/contract";
import { EVENT_PROFILE_FIELD_LABELS } from "../../../../../../features/events/registration/interview-response-contract";
import { registrationQuestionnaireProgress } from "../../../../../../features/mobile/registration-questionnaire-progress";
import { portraitPersonaSchema, portraitPreviewInputSchema, portraitReadResultSchema, portraitSaveResultSchema } from "../../../../../../shared/api-schema/event-registration-portrait";
import type { PortraitAnswerProof, PortraitField, PortraitPreviewResult, PortraitSaveBody, SavedPortrait } from "../../../../../../shared/contract/event-registration-portrait";
import { RegistrationPortraitRecommendations } from "./registration-portrait-recommendations";

export interface RegistrationPortraitWorkspaceProps {
  actorId: string;
  event: { id: string; title: string; venue: string };
  language: "en" | "zh";
  children: ReactNode;
  initialDraftAnswers?: Partial<Record<PortraitField, string>>;
  enrollment?: {
    stage: string; status: string; canSubmit: boolean; pending: boolean; error: string | null;
    onSubmit: (answers: Partial<Record<PortraitField, string>>, identity: { questionSetHash?: string; questionSetVersion?: number }) => Promise<void>;
    onCancel?: () => void;
    confirmation?: { pending: boolean; onKeep: () => void; onConfirm: () => void };
  };
}
type History = { field: PortraitField; id: string; answer: string; prompt: string | null; options: readonly string[]; proof: PortraitAnswerProof };
const fieldSchema = z.enum(EVENT_PARTICIPANT_PROFILE_FIELDS);
const sourceReadSchema = z.object({
  registration: z.object({ eventId: z.string(), userId: z.string(), updatedAt: z.string(), participantProfile: z.object({
    answers: z.record(z.string(), z.string()),
    interviewResponses: z.array(z.object({ responseId: z.string(), field: fieldSchema, answer: z.object({ displayText: z.string() }), question: z.object({ prompt: z.string(), options: z.array(z.object({ label: z.string() })) }).nullable() })).optional()
  }) }).nullable(),
  questionSet: z.object({ questionSetHash: z.string().optional(), questionSetVersion: z.number().int().positive().optional(), questions: z.array(z.object({ id: z.string(), participantProfileField: fieldSchema, prompt: z.string(), options: z.array(z.string()), required: z.boolean().optional(), portraitQuestionToken: z.string().optional() })) })
});
const previewSchema = z.strictObject({ persona: portraitPersonaSchema, generationToken: z.string().min(1), answersVersion: z.string().regex(/^[a-f0-9]{64}$/), sourceRegistrationVersion: z.iso.datetime({ offset: true }).nullable() });
const interviewStepSchema = z.object({ done: z.boolean(), signedQuestion: z.object({ questionToken: z.string().min(1), portraitAdaptiveToken: z.string().min(1), question: z.object({ field: fieldSchema, prompt: z.string().min(1), options: z.array(z.string()), acknowledgment: z.string().optional(), provenance: portraitPersonaSchema.shape.provenance }) }).nullable() });
type SignedQuestion = NonNullable<z.infer<typeof interviewStepSchema>["signedQuestion"]>;

function portraitCopy(language: "en" | "zh", en: string, zh: string) { return language === "en" ? en : zh; }

function seedWebPortraitHistory(data: z.infer<typeof sourceReadSchema>, saved: SavedPortrait | null, registrationSource: z.infer<typeof portraitReadResultSchema>["registrationSource"]): readonly History[] {
  if (saved) return saved.sourceAnswers.map(entry => ({ id: entry.responseId, field: entry.field, answer: entry.answer, prompt: entry.question?.prompt ?? null, options: entry.question?.options.map(option => option.label) ?? [], proof: { kind: "stored_response", source: "portrait", responseId: entry.responseId, sourceVersion: String(saved.version), answer: entry.answer } }));
  const record = data.registration;
  if (!record) return [];
  if (!registrationSource) throw new Error("The canonical registration reference is unavailable.");
  return registrationSource.answers.map(entry => ({ id: entry.responseId, field: entry.field, answer: entry.answer, prompt: entry.question?.prompt ?? null, options: entry.question?.options.map(option => option.label) ?? [], proof: { kind: "stored_response", source: "registration", responseId: entry.responseId, sourceVersion: registrationSource.sourceVersion, answer: entry.answer } }));
}

export function RegistrationPortraitWorkspace({ actorId, event, language, children, enrollment, initialDraftAnswers }: RegistrationPortraitWorkspaceProps) {
  const origin = typeof window === "undefined" ? "same-origin" : window.location?.origin ?? "same-origin";
  const scopeKey = JSON.stringify([origin, actorId, event.id]);
  const scope = useMemo(() => ({ key: scopeKey }), [scopeKey]);
  const latestScope = useRef(scope); latestScope.current = scope;
  const previousScope = useRef(scope);
  const mounted = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const pendingMutation = useRef<PortraitSaveBody | null>(null);
  const touchedFormalFields = useRef(new Set<PortraitField>());
  const [view, setView] = useState<"registration" | "interview" | "review" | "result">("registration");
  const [history, setHistory] = useState<readonly History[]>([]);
  const [unverifiedDrafts, setUnverifiedDrafts] = useState<readonly History[]>([]);
  const [source, setSource] = useState<z.infer<typeof sourceReadSchema> | null>(null);
  const [formalAnswers, setFormalAnswers] = useState<Partial<Record<PortraitField, string>>>({});
  const [question, setQuestion] = useState<SignedQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [done, setDone] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editAnswer, setEditAnswer] = useState("");
  const [saved, setSaved] = useState<SavedPortrait | null>(null);
  const [preview, setPreview] = useState<PortraitPreviewResult | null>(null);
  const [readConfirmed, setReadConfirmed] = useState(false);
  const [formalReadConfirmed, setFormalReadConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "pending-confirmation" | "rejected">("idle");
  const [error, setError] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const copy = (en: string, zh: string) => portraitCopy(language, en, zh);
  const endpoint = `/api/events/${encodeURIComponent(event.id)}/registration`;
  const progress = registrationQuestionnaireProgress([...history, ...(question ? [{ field: question.question.field, answer }] : [])]);
  const currentSaved = saveState === "saved" ? saved : null;
  const persona = preview?.persona ?? currentSaved?.persona;

  function portraitIsCurrent() { return mounted.current && latestScope.current === scope && Boolean(actorId); }
  async function requestPortraitJson(path: string, controller: AbortController, body?: unknown) {
    const response = await fetch(path, { method: body === undefined ? "GET" : "POST", cache: "no-store", signal: controller.signal, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    const envelope = await response.json().catch(() => null);
    if (!response.ok || envelope?.success !== true) {
      throw Object.assign(new Error(envelope?.error?.message ?? copy("This operation could not be completed. Your answers were kept.", "暂时无法完成操作，回答已保留。")), { status: response.status });
    }
    return envelope.data as unknown;
  }
  async function loadSources(controller: AbortController, onRegistration?: (data: z.infer<typeof sourceReadSchema>) => void) {
    const [data, rawPortrait] = await Promise.all([
      requestPortraitJson(`${endpoint}?language=${language}&portraitProofs=true`, controller).then(raw => {
        const data = sourceReadSchema.parse(raw);
        if (data.registration && (data.registration.userId !== actorId || data.registration.eventId !== event.id)) throw new Error(copy("The registration source belongs to another account or event.", "报名来源不属于当前账号或活动。"));
        if (!controller.signal.aborted) onRegistration?.(data);
        return data;
      }),
      requestPortraitJson(`${endpoint}/portrait`, controller)
    ]);
    const read = portraitReadResultSchema.parse(rawPortrait);
    const portrait = read.portrait as SavedPortrait | null;
    if (read.registrationSource && (read.registrationSource.actorId !== actorId || read.registrationSource.eventId !== event.id)) throw new Error(copy("The registration reference belongs to another account or event.", "报名引用不属于当前账号或活动。"));
    if ((data.registration && (data.registration.userId !== actorId || data.registration.eventId !== event.id)) || (portrait && (portrait.actorId !== actorId || portrait.eventId !== event.id))) throw new Error(copy("The returned data belongs to another account or event.", "返回的数据不属于当前账号或活动。"));
    return { data, portrait, history: seedWebPortraitHistory(data, portrait, read.registrationSource) };
  }
  useEffect(() => {
    mounted.current = true;
    revision.current++;
    touchedFormalFields.current.clear();
    operation.current?.abort(); operation.current = null; pendingMutation.current = null;
    setHistory([]); setSource(null); setFormalAnswers({}); setSaved(null); setPreview(null); setView("registration"); setReadConfirmed(false); setPending(false); setSaveState("idle"); setError(null);
    setQuestion(null); setAnswer(""); setDone(false); setEditing(null); setEditAnswer("");
    const controller = new AbortController();
    setFormalReadConfirmed(false);
    setUnverifiedDrafts([]);
    if (actorId) void loadSources(controller, data => {
      if (!portraitIsCurrent() || controller.signal.aborted) return;
      setSource(data); setFormalAnswers(data.registration?.participantProfile.answers ?? initialDraftAnswers ?? {}); setFormalReadConfirmed(true);
    }).then(result => {
      if (!portraitIsCurrent() || controller.signal.aborted) return;
      setHistory(result.history); setSaved(result.portrait); setSaveState(result.portrait ? "saved" : "idle"); setReadConfirmed(true);
    }).catch(caught => { if (portraitIsCurrent() && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : copy("Could not read your portrait.", "暂时无法读取画像。")); });
    return () => { mounted.current = false; controller.abort(); operation.current?.abort(); operation.current = null; };
    // Source reads are scoped to the canonical actor, origin and event, never translated display text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    if (!source || source.registration || !initialDraftAnswers || !portraitIsCurrent()) return;
    setFormalAnswers(current => {
      const additions = Object.entries(initialDraftAnswers).filter(([field, value]) => !touchedFormalFields.current.has(field as PortraitField) && value?.trim() && current[field as PortraitField] !== value);
      return additions.length ? { ...current, ...Object.fromEntries(additions) } : current;
    });
    // Detail-page quick answers are local drafts, not saved registration facts or signed AI answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraftAnswers, source, scope]);

  useEffect(() => {
    const viewport = typeof window === "undefined" ? null : window.visualViewport;
    if (!viewport) return;
    const update = () => { if (Number.isFinite(viewport.height) && viewport.height > 0) setViewportHeight(viewport.height); };
    update(); viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);

  function changePortraitAnswer(value: string) {
    if (!portraitIsCurrent() || !readConfirmed) return;
    revision.current++; setAnswer(value);
  }
  const renderedRevision = revision.current;
  const draftHistory = (): readonly History[] => {
    if (!question || !answer.trim()) return history;
    if (history.some(entry => entry.field === question.question.field)) throw new Error(copy("This field has already been answered.", "该项已有回答。"));
    return [...history, { id: question.questionToken, field: question.question.field, prompt: question.question.prompt, options: question.question.options, answer: answer.trim(), proof: { kind: "signed_question", questionToken: question.questionToken, portraitAdaptiveToken: question.portraitAdaptiveToken, answer: answer.trim() } }];
  };
  async function nextPortraitQuestion() {
    if (!portraitIsCurrent() || !readConfirmed || operation.current || done || progress.answeredCount === 8 || (question && !answer.trim()) || renderedRevision !== revision.current) return;
    const controller = new AbortController(); operation.current = controller;
    const heldRevision = revision.current;
    setPending(true); setError(null);
    try {
      const draft = draftHistory();
      const step = interviewStepSchema.parse(await requestPortraitJson(`${endpoint}/interview`, controller, { mode: "portrait-interview", language, transcript: draft.map(entry => ({ field: entry.field, prompt: entry.prompt ?? EVENT_PROFILE_FIELD_LABELS[entry.field][language], answer: entry.answer })) }));
      if (!portraitIsCurrent() || operation.current !== controller || revision.current !== heldRevision) return;
      if ((!step.done && !step.signedQuestion) || (step.signedQuestion && draft.some(entry => entry.field === step.signedQuestion!.question.field))) throw new Error(copy("The next question could not be verified. Your answer was kept.", "下一题未通过验证，回答已保留。"));
      revision.current++; setHistory(draft); setQuestion(step.signedQuestion); setAnswer(""); setDone(step.done); setPreview(null); setSaveState("idle");
    } catch (caught) { if (portraitIsCurrent() && operation.current === controller) setError(caught instanceof Error ? caught.message : copy("Could not load the next question.", "暂时无法读取下一题。")); }
    finally { if (portraitIsCurrent() && operation.current === controller) { operation.current = null; setPending(false); } }
  }
  function keepPortraitEdit() {
    if (!portraitIsCurrent() || !readConfirmed || editing === null || !editAnswer.trim()) return;
    const entry = history[editing];
    if (!entry) return;
    if (entry.answer !== editAnswer.trim()) {
      revision.current++; pendingMutation.current = null;
      setHistory([...history.slice(0, editing), { ...entry, answer: editAnswer.trim(), proof: { ...entry.proof, answer: editAnswer.trim() } }]);
      setPreview(null); setQuestion(null); setAnswer(""); setDone(false); setSaveState("idle");
    }
    setEditing(null);
  }

  async function previewPortrait() {
    if (!portraitIsCurrent() || !readConfirmed || operation.current || !progress.canSuggestStop) return;
    const draft = draftHistory();
    const body = portraitPreviewInputSchema.parse({ mode: "portrait-preview", language, responses: draft.map(entry => entry.proof) });
    const controller = new AbortController(); operation.current = controller;
    const heldRevision = revision.current;
    setPending(true); setError(null);
    try {
      const result = previewSchema.parse(await requestPortraitJson(`${endpoint}/persona`, controller, body));
      if (!portraitIsCurrent() || operation.current !== controller || revision.current !== heldRevision) return;
      pendingMutation.current = null; setHistory(draft); setQuestion(null); setAnswer(""); setPreview(result as PortraitPreviewResult); setView("result"); setSaveState("idle");
    } catch (caught) {
      if (portraitIsCurrent() && operation.current === controller) {
        setError(caught instanceof Error ? caught.message : copy("Could not generate the portrait.", "画像暂时无法生成。"));
        if ([409, 422].includes((caught as { status?: number })?.status ?? 0) && revision.current === heldRevision) { setHistory(draft); setPreview(null); setSaveState("rejected"); }
      }
    }
    finally { if (portraitIsCurrent() && operation.current === controller) { operation.current = null; setPending(false); } }
  }
  async function persistPortrait() {
    if (!portraitIsCurrent() || !readConfirmed || !preview || operation.current || saveState === "saved") return;
    const controller = new AbortController(); operation.current = controller;
    const heldRevision = revision.current;
    const mutation = pendingMutation.current ?? { mutationId: `portrait:${Date.now()}:${Math.random().toString(36).slice(2)}`, expectedPortraitVersion: saved?.version ?? null, generationToken: preview.generationToken };
    pendingMutation.current = mutation;
    setPending(true); setError(null);
    let postAccepted = false;
    try {
      const receipt = portraitSaveResultSchema.parse(await requestPortraitJson(`${endpoint}/portrait`, controller, mutation));
      postAccepted = true;
      if (!portraitIsCurrent() || operation.current !== controller) return;
      const read = portraitReadResultSchema.parse(await requestPortraitJson(`${endpoint}/portrait`, controller)).portrait;
      if (!portraitIsCurrent() || operation.current !== controller) return;
      if (!read || receipt.receipt.mutationId !== mutation.mutationId || read.actorId !== actorId || read.eventId !== event.id || read.id !== receipt.receipt.portraitId || read.version !== receipt.receipt.portraitVersion || read.answersVersion !== receipt.receipt.answersVersion || read.updatedAt !== receipt.receipt.updatedAt) throw new Error(copy("Save not yet confirmed. Retry to check.", "保存结果待确认，请重试核对。"));
      setSaved(read as SavedPortrait); pendingMutation.current = null;
      setSaveState(revision.current === heldRevision ? "saved" : "idle");
    } catch (caught) {
      if (!portraitIsCurrent() || operation.current !== controller) return;
      const status = (caught as { status?: number })?.status;
      const rejected = !postAccepted && status !== undefined && [400, 401, 403, 404, 409, 422].includes(status);
      if (rejected) { pendingMutation.current = null; setPreview(null); }
      setSaveState(rejected ? "rejected" : "pending-confirmation");
      setError(rejected && caught instanceof Error ? caught.message : copy("Save not yet confirmed. Retry to check.", "保存结果待确认，请重试核对。"));
    } finally { if (portraitIsCurrent() && operation.current === controller) { operation.current = null; setPending(false); } }
  }
  async function recoverWebPortraitSources() {
    if (!portraitIsCurrent() || operation.current || (saveState !== "rejected" && readConfirmed)) return;
    const controller = new AbortController(); operation.current = controller;
    const heldRevision = revision.current;
    setPending(true); setError(null);
    try {
      const current = await loadSources(controller);
      if (!portraitIsCurrent() || operation.current !== controller || revision.current !== heldRevision) return;
      const recovered = history.map(entry => {
        if (entry.proof.kind === "signed_question") return entry;
        if (entry.proof.kind === "registration_question") {
          const formal = current.data.questionSet.questions.find(formal => formal.participantProfileField === entry.field && formal.portraitQuestionToken);
          if (formal) return { ...entry, prompt: formal.prompt, options: formal.options, proof: { kind: "registration_question" as const, portraitQuestionToken: formal.portraitQuestionToken!, answer: entry.answer } };
        } else {
          const trusted = current.history.find(trusted => trusted.field === entry.field);
          if (trusted) return { ...trusted, answer: entry.answer, proof: { ...trusted.proof, answer: entry.answer } };
        }
        throw new Error(copy("This answer no longer has a current source. Ask a new question; your draft remains visible.", "该回答已无当前可信来源，请重新追问；草稿仍然保留。"));
      });
      revision.current++; pendingMutation.current = null;
      setSource(current.data); setFormalReadConfirmed(true); setSaved(current.portrait); setHistory(recovered.length ? recovered : current.history); setPreview(null); setReadConfirmed(true); setSaveState("idle"); setView(saveState === "rejected" ? "interview" : "registration");
    } catch (caught) { if (portraitIsCurrent() && operation.current === controller) setError(caught instanceof Error ? caught.message : copy("Could not refresh the sources.", "暂时无法重新读取来源。")); }
    finally { if (portraitIsCurrent() && operation.current === controller) { operation.current = null; setPending(false); } }
  }
  function restartWebUnstoredQuestions() {
    if (!portraitIsCurrent() || !readConfirmed || operation.current || saveState !== "rejected") return;
    const first = history.findIndex(entry => entry.proof.kind === "signed_question");
    if (first < 0) return;
    revision.current++; pendingMutation.current = null;
    setUnverifiedDrafts(history.slice(first)); setHistory(history.slice(0, first)); setQuestion(null); setAnswer(""); setDone(false); setPreview(null); setSaveState("idle"); setError(null); setView("interview");
  }
  const canSubmitFormal = Boolean(enrollment?.canSubmit && !enrollment.pending && formalReadConfirmed && source?.questionSet.questions.length && !source.questionSet.questions.some(formal => formal.required && !formalAnswers[formal.participantProfileField]?.trim()));
  async function submitWebFormalRegistration() {
    if (!portraitIsCurrent() || !canSubmitFormal || !enrollment || !source || renderedRevision !== revision.current) return;
    await enrollment.onSubmit(formalAnswers, { ...(source.questionSet.questionSetHash ? { questionSetHash: source.questionSet.questionSetHash } : {}), ...(source.questionSet.questionSetVersion ? { questionSetVersion: source.questionSet.questionSetVersion } : {}) });
  }
  if (previousScope.current !== scope) {
    previousScope.current = scope;
    setUnverifiedDrafts([]);
    setFormalReadConfirmed(false);
    touchedFormalFields.current.clear();
    revision.current++;
    operation.current?.abort(); operation.current = null; pendingMutation.current = null;
    setHistory([]); setSource(null); setFormalAnswers({}); setSaved(null); setPreview(null); setView("registration"); setReadConfirmed(false); setPending(false); setSaveState("idle"); setError(null);
    setQuestion(null); setAnswer(""); setDone(false); setEditing(null); setEditAnswer("");
    return null;
  }
  return <section data-portrait-view={view} className="registration-portrait-7a" style={viewportHeight ? { height: viewportHeight } : undefined}>
    <style>{`.registration-portrait-7a{background:#FBFBFE;color:#0E1225;min-height:100dvh;font-family:var(--ff);padding:0 16px 16px}.registration-portrait-7a>header,.registration-portrait-7a>article,.registration-portrait-7a>footer{max-width:760px;margin:auto}.registration-portrait-7a>header{min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:8px}.registration-portrait-7a>header a{color:#4B4FC7;text-decoration:none;font-size:13px}.registration-portrait-7a>header strong{font-size:15px;color:#0E1225}.registration-portrait-7a button{font:inherit;cursor:pointer;min-height:44px}.registration-portrait-7a button:disabled{cursor:default;opacity:.45}.registration-portrait-7a .portrait-link{background:transparent;border:0;color:#4B4FC7;padding:10px 8px;font-size:13px}.registration-portrait-7a .portrait-primary{background:#0E1225;color:#fff;border:1px solid #0E1225;border-radius:14px;min-height:50px;padding:12px 18px;font-weight:800}.registration-portrait-7a .portrait-entry{display:flex;align-items:center;justify-content:space-between;width:100%;background:#F1F1FA;border:1px solid #E8E9F6;border-radius:14px;text-align:left;padding:14px;margin:16px 0;gap:16px}.registration-portrait-7a>article{padding:16px 0}.registration-portrait-7a dl>div{display:flex;gap:8px;padding:9px 0;border-bottom:1px solid #E8E9F6}.registration-portrait-7a dt{width:100px;flex-shrink:0;font-size:12px;color:#6B6F99}.registration-portrait-7a dd{margin:0;font-size:14px;line-height:20px;font-weight:600}.registration-portrait-7a>footer{border-top:1px solid #E8E9F6;padding-top:12px;display:flex;flex-wrap:wrap;gap:8px}.registration-portrait-7a .portrait-privacy{font-size:11px;color:#4B4FC7;background:#ECEEFB;padding:4px 8px;display:inline-block;border-radius:6px}.registration-portrait-7a h2{font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-size:24px;line-height:32px;font-weight:900;letter-spacing:-0.02em}.registration-portrait-7a .portrait-note{font-size:12px;line-height:19px;color:#6B6F99}.registration-portrait-7a [role=alert]{color:#B42318;font-size:13px}.registration-portrait-7a .portrait-progress{height:3px;background:#ECEEFB;border-radius:99px}.registration-portrait-7a .portrait-progress>span{display:block;height:3px;border-radius:99px;background:#4B4FC7}.registration-portrait-7a [data-orbit-registration-profile-guide]{background:#FBFBFE!important;padding:16px 0!important;min-height:0!important}.registration-portrait-7a [data-reg-saved-registration],.registration-portrait-7a [data-reg-cancelled-registration],.registration-portrait-7a [data-reg-anim=question]{border:0!important;border-radius:0!important;box-shadow:none!important;background:#FBFBFE!important}`}</style>
    <style>{`.registration-portrait-7a{height:100dvh;min-height:0;display:flex;flex-direction:column;box-sizing:border-box;padding:0 16px;overflow:hidden}.registration-portrait-7a>header{width:100%;flex-shrink:0}.registration-portrait-7a>article{width:100%;flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;padding-bottom:16px}.registration-portrait-7a>footer{width:100%;flex-shrink:0;box-sizing:border-box;padding-bottom:max(16px,env(safe-area-inset-bottom))}.registration-portrait-7a>footer>.portrait-primary{flex:1}.registration-portrait-7a>p{flex-shrink:0;margin:8px 0}`}</style>
    <header>
      {view === "registration" ? <a href={`/app/events/${encodeURIComponent(event.id)}?language=${language}`}>{copy("Events", "活动")}</a> : <button className="btn portrait-link" type="button" onClick={() => setView("registration")}>{copy("Registration details", "报名资料")}</button>}
      <strong>{view === "registration" ? copy("Registration details", "报名资料") : view === "review" ? copy("Review answers", "回答复核") : copy("Event portrait", "活动画像")}</strong>
      {view === "interview" ? <button className="btn portrait-link" type="button" onClick={() => setView("registration")}>{copy("Skip", "跳过")}</button> : view === "result" ? <button className="btn portrait-link" type="button" onClick={() => setView("interview")}>{copy("Edit answers", "编辑回答")}</button> : <span />}
    </header>
    {error ? <p role="alert">{error}</p> : null}
    {saveState === "rejected" || (!readConfirmed && error) ? <button className="btn portrait-link" type="button" disabled={pending} onClick={recoverWebPortraitSources}>{copy("Reload current sources", "重新读取当前来源")}</button> : null}
    {saveState === "rejected" && history.some(entry => entry.proof.kind === "signed_question") ? <button className="btn portrait-link" type="button" disabled={pending} onClick={restartWebUnstoredQuestions}>{copy("Ask unstored questions again", "重新追问未保存的题目")}</button> : null}
    {view === "registration" ? <article>
      {enrollment ? <main data-registration-stage={enrollment.stage} data-registration-status={enrollment.status}>
        <h2>{event.title}</h2><p className="portrait-note">{event.venue}</p>
        {source?.questionSet.questions.map((formal, index) => <section key={formal.id} style={{ padding: "14px 0", borderBottom: "1px solid #E8E9F6" }}>
          <p className="portrait-note">{index + 1} · {formal.required ? copy("Required", "必填") : copy("Optional", "选填")}</p>
          <PortraitQuestionInput key={`${scope.key}:${formal.id}`} language={language} formal prompt={formal.prompt} options={formal.options} answer={formalAnswers[formal.participantProfileField] ?? ""} onChange={value => {
            if (!portraitIsCurrent() || !formalReadConfirmed || enrollment.pending) return;
            revision.current++; pendingMutation.current = null;
            touchedFormalFields.current.add(formal.participantProfileField);
            setFormalAnswers(current => ({ ...current, [formal.participantProfileField]: value }));
            setPreview(null); setSaveState("idle");
            setHistory(current => { const position = current.findIndex(entry => entry.field === formal.participantProfileField); return position < 0 ? current : current.slice(0, position); });
            setQuestion(null); setAnswer(""); setDone(false);
          }} />
        </section>)}
        {enrollment.error ? <p role="alert">{enrollment.error}</p> : null}
        {enrollment.status === "rsvped" ? <p role="status">{copy("Registered", "已报名")}</p> : null}
        {enrollment.onCancel ? <button className="btn portrait-link" type="button" disabled={enrollment.pending} onClick={enrollment.onCancel}>{copy("Cancel registration", "取消报名")}</button> : null}
        {enrollment.confirmation ? <section role="alertdialog" aria-label={copy("Cancel registration?", "确认取消报名？")}><p>{copy("Cancel registration?", "确认取消报名？")}</p><button className="btn" type="button" disabled={enrollment.confirmation.pending} onClick={enrollment.confirmation.onKeep}>{copy("Keep registration", "保留报名")}</button><button className="btn" type="button" disabled={enrollment.confirmation.pending} onClick={enrollment.confirmation.onConfirm}>{copy("Confirm cancellation", "确认取消")}</button></section> : null}
      </main> : children}
      <button className="btn portrait-entry" type="button" disabled={!readConfirmed} onClick={() => {
        if (!portraitIsCurrent()) return;
        if (enrollment && !preview && !currentSaved && source) {
          const formalHistory: History[] = source.questionSet.questions.flatMap(formal => {
            const text = formalAnswers[formal.participantProfileField]?.trim();
            return text && formal.portraitQuestionToken ? [{ id: `formal:${formal.id}`, field: formal.participantProfileField, answer: text, prompt: formal.prompt, options: formal.options, proof: { kind: "registration_question" as const, portraitQuestionToken: formal.portraitQuestionToken, answer: text } }] : [];
          });
          if (formalHistory.length) { revision.current++; setHistory(formalHistory); }
        }
        setView(preview || currentSaved ? "result" : "interview");
      }}>
        <span><strong>{saveState === "saved" ? copy("Event portrait complete", "活动画像已完成") : copy("Event portrait", "活动画像")}</strong><br /><span className="portrait-note">{copy(`${progress.answeredCount}/8 fields filled`, `已补充 ${progress.answeredCount}/8 项`)}</span></span>
        {preview || currentSaved ? copy("View", "查看") : copy("Build portrait", "补充画像")}
      </button>
    </article> : <article>
      {view !== "result" && unverifiedDrafts.length ? <section><p className="portrait-note">{copy("These drafts were kept. Answer new questions before generating your portrait.", "这些草稿已保留，请回答新题后再生成画像。")}</p>{unverifiedDrafts.map(entry => <p key={entry.id}>{entry.answer}</p>)}</section> : null}
      {view === "result" ? <>
        <p className="portrait-privacy">{copy("Visible to you and authorized organizers", "本人及有权限主办方可见")}</p>
        <p className="portrait-note">{event.title}</p>
        {persona ? <><h2>{persona.tagline}</h2><p>{persona.seeking} · {persona.offering}</p><h3>{copy("Portrait details", "画像要点")}</h3><dl>{[[copy("Industry", "行业方向"), persona.industryTags.join(" / ")], [copy("Social pace", "社交节奏"), persona.energyStyle], [copy("Who to meet", "希望认识"), persona.seeking], [copy("What you offer", "能够提供"), persona.offering]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></> : <p>{copy("Generate a new portrait from your current answers.", "请根据当前回答重新生成画像。")}</p>}
        <RegistrationPortraitRecommendations key={scope.key} eventId={event.id} language={language} />
      </> : <>
        <p className="portrait-note">{copy(`${progress.answeredCount}/8 fields filled`, `已补充 ${progress.answeredCount}/8 项`)}</p>
        <div role="progressbar" aria-label={copy("Information coverage", "信息覆盖")} aria-valuemin={0} aria-valuemax={8} aria-valuenow={progress.answeredCount} className="portrait-progress"><span style={{ width: `${progress.answeredCount / 8 * 100}%` }} /></div>
        {view === "interview" ? <section>
          <p className="portrait-note" style={{ color: "#4B4FC7" }}>IORBIT</p>
          {question ? <>{question.question.acknowledgment ? <p className="portrait-note">{question.question.acknowledgment}</p> : null}<PortraitQuestionInput language={language} key={question.questionToken} prompt={question.question.prompt} options={question.question.options} answer={answer} onChange={changePortraitAnswer} /></> : <h2>{copy("Add to your event portrait", "继续补充活动画像")}</h2>}
        </section> : null}
        {progress.canSuggestStop ? <p className="portrait-note">{copy("You can generate your portrait now or keep answering.", "可以先生成画像，也可以继续补充。")}</p> : null}
        <button className="btn portrait-link" type="button" onClick={() => setView(view === "review" ? "interview" : "review")}>{copy(view === "review" ? "Event portrait" : "All", view === "review" ? "活动画像" : "全部")}</button>
        <dl>{history.map((entry, index) => <div key={entry.id}><dt>{EVENT_PROFILE_FIELD_LABELS[entry.field][language]}</dt><dd>{view === "review" ? <p className="portrait-note">{entry.prompt ?? copy("The original question was not retained. Showing the saved field and answer.", "旧回答未保留原题，显示已保存的字段与答案。")}</p> : null}{entry.answer}<button className="btn portrait-link" type="button" onClick={() => { if (portraitIsCurrent()) { setEditing(index); setEditAnswer(entry.answer); } }}>{copy(`Edit ${EVENT_PROFILE_FIELD_LABELS[entry.field].en}`, `改 ${EVENT_PROFILE_FIELD_LABELS[entry.field].zh}`)}</button>{editing === index ? <section><PortraitQuestionInput language={language} key={`edit:${entry.id}`} prompt={entry.prompt ?? EVENT_PROFILE_FIELD_LABELS[entry.field][language]} options={entry.options} answer={editAnswer} onChange={setEditAnswer} /><button className="btn portrait-link" type="button" onClick={() => setEditing(null)}>{copy("Cancel", "取消")}</button><button className="btn portrait-link" type="button" disabled={!editAnswer.trim()} onClick={keepPortraitEdit}>{copy("Keep changes", "保留修改")}</button></section> : null}</dd></div>)}</dl>
      </>}
    </article>}
    {view === "registration" && enrollment ? <footer>{enrollment.status !== "rsvped" ? <button className="btn portrait-primary" type="button" disabled={!canSubmitFormal} onClick={submitWebFormalRegistration}>{copy("Confirm registration", "确认报名")}</button> : null}</footer> : view === "result" ? <footer><button className="btn portrait-primary" type="button" disabled={pending || !preview || !readConfirmed || saveState === "saved"} onClick={persistPortrait}>{saveState === "saved" ? copy("Saved", "已保存") : copy("Save portrait", "保存画像")}</button><p className="portrait-note">{copy("Saving a portrait does not change registration", "保存画像不影响报名状态")}</p></footer> : view === "interview" ? <footer><button className="btn portrait-primary" type="button" disabled={pending || !readConfirmed || done || progress.answeredCount === 8 || Boolean(question && !answer.trim())} onClick={nextPortraitQuestion}>{copy("Next question", "下一题")}</button><button className="btn portrait-primary" type="button" disabled={pending || !readConfirmed || !progress.canSuggestStop} onClick={previewPortrait}>{copy("Generate portrait", "生成画像")}</button></footer> : null}
  </section>;
}

function PortraitQuestionInput({ prompt, options, answer, onChange, language = "en", formal = false }: { prompt: string; options: readonly string[]; answer: string; onChange: (value: string) => void; language?: "en" | "zh"; formal?: boolean }) {
  const choices = options.filter(option => !["Other", "其他", "その他"].includes(option));
  const [other, setOther] = useState(choices.length === 0 || Boolean(answer && !choices.includes(answer)));
  const [custom, setCustom] = useState(choices.includes(answer) ? "" : answer);
  useEffect(() => {
    if (answer && !choices.includes(answer)) { setOther(true); setCustom(answer); }
    // Server source reads arrive after the initial question render. Keep the actual controlled draft in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);
  return <div>
    <h2 style={{ fontSize: formal ? 15 : 20, lineHeight: formal ? "22px" : "29px", fontWeight: formal ? 700 : 800 }}>{prompt}</h2>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{choices.map(option => <button className="btn" type="button" key={option} aria-pressed={!other && answer === option} onClick={() => { setOther(false); onChange(option); }} style={{ border: "1px solid #DDDEFA", borderRadius: 10, padding: "8px 12px", fontSize: formal ? 13 : 14, color: !other && answer === option ? "#fff" : "#3B3F7A", background: !other && answer === option ? "#0E1225" : "#fff" }}>{option}</button>)}{choices.length ? <button className="btn" type="button" aria-pressed={other} onClick={() => { setOther(true); onChange(custom); }} style={{ border: "1px solid #DDDEFA", borderRadius: 10, padding: "8px 12px", fontSize: formal ? 13 : 14, background: other ? "#0E1225" : "#fff", color: other ? "#fff" : "#3B3F7A" }}>{language === "en" ? "Other" : "其他"}</button> : null}</div>
    {other ? <textarea aria-label={language === "en" ? "Your own answer" : "自行补充回答"} rows={2} value={custom} maxLength={1000} onChange={event => { setCustom(event.target.value); onChange(event.target.value); }} style={{ boxSizing: "border-box", width: "100%", minHeight: 44, border: 0, borderBottom: "1.5px solid #0E1225", background: "#fff", padding: "8px 0", font: "inherit", resize: "vertical" }} /> : null}
  </div>;
}
