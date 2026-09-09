import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useId, useRef, useState } from "react";
import { Alert } from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { EventExperienceConfigurationContract, EventExperienceSnapshotContract, EventExperienceVersionContract } from "../../api/contract/event-experience";
import { eventExperiencePreviewResponseSchema, eventExperienceSnapshotSchema } from "../../api/schema/event-experience";
import type { ApiResult } from "../../api/types";
import { AppScreen } from "../../components/AppScreen";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { eventExperienceConfigurationFromSnapshot, eventExperienceConfigurationsEqual, eventExperienceFreeze, eventExperiencePath, eventExperienceQuestionSetsEqual, eventExperienceValidation, initialEventExperienceConfiguration } from "../../view-models/event-experience";
import { EventExperienceContent } from "./EventExperienceContent";

type Operation = "save" | "preview" | "publish";
interface EditorState {
  authorized: boolean;
  loading: boolean;
  snapshot: EventExperienceSnapshotContract | null;
  configuration: EventExperienceConfigurationContract;
  preview: EventExperienceVersionContract | null;
  busy: Operation | null;
  error: string | null;
  notice: string | null;
  editVersion: number;
}

function emptyEditor(): EditorState {
  return { authorized: false, loading: true, snapshot: null, configuration: initialEventExperienceConfiguration(), preview: null, busy: null, error: null, notice: null, editVersion: 0 };
}

export function EventExperienceScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const router = useRouter();
  const client = useOrbitApiClient();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.user?.id ?? null;
  const ready = auth.ready && server.ready && Boolean(actorId && eventId);
  const readIdentity = useId();
  const [scope, setScope] = useState({ client, actorId, eventId, ready });
  const scopeRef = useRef(scope);
  const mounted = useRef(true);
  const operationId = useRef(0);
  const locked = useRef(false);
  const [state, setState] = useState<EditorState>(emptyEditor);
  const current = useRef(state);
  const [now, setNow] = useState(Date.now);

  function update(patch: Partial<EditorState>) {
    current.current = { ...current.current, ...patch };
    setState(current.current);
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operationId.current++; locked.current = false; };
  }, []);

  useEffect(() => { if (scope.ready) void load(); }, [scope]);

  useEffect(() => {
    if (!state.snapshot?.head.frozenAt) return;
    // Recompute on an open screen; command guards also read the clock directly.
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [state.snapshot?.head.frozenAt]);

  if (scope.client !== client || scope.actorId !== actorId || scope.eventId !== eventId || scope.ready !== ready) {
    const nextScope = { client, actorId, eventId, ready };
    scopeRef.current = nextScope;
    setScope(nextScope);
    operationId.current++;
    locked.current = false;
    current.current = emptyEditor();
    setState(current.current);
    return null;
  }

  const dirty = !eventExperienceConfigurationsEqual(state.configuration, eventExperienceConfigurationFromSnapshot(state.snapshot));
  const freeze = eventExperienceFreeze(state.snapshot, state.configuration, now);

  function scopeIsCurrent() { return mounted.current && scopeRef.current === scope && scope.ready; }

  function acceptedSnapshot(result: ApiResult<unknown>): EventExperienceSnapshotContract | null {
    if (!result.success || result.status < 200 || result.status >= 300) return null;
    const parsed = eventExperienceSnapshotSchema.safeParse(result.data);
    return parsed.success && parsed.data.head.eventId === eventId ? parsed.data : null;
  }

  function failureMessage(result: ApiResult<unknown>): string {
    if (!result.success && result.status === 409 && result.error.context?.service === "event-experience" && result.error.context?.eventExperienceCode === "EVENT_EXPERIENCE_FROZEN") {
      return "已到资料编辑截止时间，题集须与截止前已发布的题集一致；截止前未发布题集时无法保存。内容已保留，请确认后重新读取。";
    }
    if (result.status === 409) return `${result.success ? "当前版本或截止状态已变化。" : result.error.message} 内容已保留，请确认后重新读取。`;
    return result.success ? "服务器返回的数据无法确认，请重试。" : result.error.message;
  }

  async function load() {
    if (!scopeIsCurrent() || locked.current) return;
    const id = ++operationId.current;
    const isCurrent = () => scopeIsCurrent() && operationId.current === id;
    locked.current = true;
    update({ loading: true, authorized: false, preview: null, error: null, notice: null });
    try {
      // Distinct read identities prevent shared GET coalescing across actors
      // with the same cookie/client. This header carries no authorization.
      const result = await client.get<unknown>(eventExperiencePath(eventId), { headers: { "X-Request-Id": `experience-${readIdentity}-${id}` } });
      if (!isCurrent()) return;
      const snapshot = acceptedSnapshot(result);
      const firstCreation = !result.success && result.status === 404 && result.error.code === "NOT_FOUND" && result.error.context?.service === "event-experience" && result.error.context?.eventExperienceCode === "EVENT_EXPERIENCE_NOT_FOUND";
      if (snapshot || firstCreation) {
        update({ snapshot, configuration: eventExperienceConfigurationFromSnapshot(snapshot), authorized: true, editVersion: current.current.editVersion + 1 });
      } else update({ error: failureMessage(result) });
    } catch {
      if (isCurrent()) update({ error: "暂时无法读取活动体验，请重试。" });
    } finally {
      if (isCurrent()) { locked.current = false; update({ loading: false }); }
    }
  }

  function change(configuration: EventExperienceConfigurationContract, restore = false) {
    if (!scopeIsCurrent() || !current.current.authorized || current.current.loading || (locked.current && current.current.busy !== "preview")) return;
    const previous = current.current;
    const questionChange = !eventExperienceQuestionSetsEqual(configuration.questionSet, previous.configuration.questionSet);
    const frozen = eventExperienceFreeze(previous.snapshot, previous.configuration).frozen;
    if (questionChange && frozen && !(restore && previous.snapshot?.published && eventExperienceQuestionSetsEqual(configuration.questionSet, previous.snapshot.published.configuration.questionSet))) return;
    if (previous.busy === "preview") { operationId.current++; locked.current = false; }
    update({ configuration, preview: null, busy: null, error: null, notice: null, editVersion: previous.editVersion + 1 });
  }

  function canPublish() {
    const s = current.current;
    return Boolean(s.snapshot?.draft && eventExperienceConfigurationsEqual(s.configuration, eventExperienceConfigurationFromSnapshot(s.snapshot)));
  }

  async function mutate(operation: Operation) {
    const s = current.current;
    if (!scopeIsCurrent() || !s.authorized || s.loading || locked.current || (operation === "publish" && !canPublish())) return;
    const validation = eventExperienceValidation(s.configuration);
    if (validation) { update({ error: validation }); return; }
    if (eventExperienceFreeze(s.snapshot, s.configuration).blocked) { update({ error: "已到截止时间，题集须与已发布版本一致。" }); return; }
    const id = ++operationId.current;
    const isCurrent = () => scopeIsCurrent() && operationId.current === id;
    locked.current = true;
    update({ busy: operation, error: null, notice: null, preview: null });
    const path = eventExperiencePath(eventId);
    try {
      const result = operation === "save"
        ? await client.put<EventExperienceSnapshotContract>(path, { body: { configuration: s.configuration, expectedRevision: s.snapshot?.head.revision ?? null } })
        : await client.post<unknown>(`${path}/${operation}`, { body: operation === "preview" ? { configuration: s.configuration } : { expectedRevision: s.snapshot!.head.revision } });
      if (!isCurrent()) return;
      if (operation === "preview") {
        const parsed = result.success && result.status >= 200 && result.status < 300 ? eventExperiencePreviewResponseSchema.safeParse(result.data) : null;
        if (parsed?.success) update({ preview: parsed.data.version });
        else update({ error: failureMessage(result) });
      } else {
        const snapshot = acceptedSnapshot(result);
        const advanced = snapshot && snapshot.head.revision > (s.snapshot?.head.revision ?? 0);
        const mutationMatches = operation === "save" ? Boolean(snapshot?.draft) : Boolean(
          snapshot?.published && s.snapshot?.draft &&
          snapshot.published.version === s.snapshot.draft.version &&
          snapshot.published.hash === s.snapshot.draft.hash &&
          eventExperienceConfigurationsEqual(snapshot.published.configuration, s.snapshot.draft.configuration)
        );
        if (snapshot && advanced && mutationMatches) update({ snapshot, configuration: eventExperienceConfigurationFromSnapshot(snapshot), editVersion: s.editVersion + 1, notice: operation === "save" ? "草稿已保存。" : "题集已发布。" });
        else update({ error: failureMessage(result) });
      }
    } catch {
      if (isCurrent()) update({ error: "暂时无法连接服务，内容已保留，请重试。" });
    } finally {
      if (isCurrent()) { locked.current = false; update({ busy: null }); }
    }
  }

  function confirmCommand(command: "publish" | "reload") {
    if (!scopeIsCurrent() || locked.current || (command === "publish" && (!current.current.authorized || !canPublish() || eventExperienceFreeze(current.current.snapshot, current.current.configuration).blocked))) return;
    const intended = current.current;
    const intendedOperation = operationId.current;
    const run = () => {
      if (!scopeIsCurrent() || locked.current || operationId.current !== intendedOperation || current.current.editVersion !== intended.editVersion || current.current.snapshot !== intended.snapshot) return;
      if (command === "publish") void mutate("publish"); else void load();
    };
    if (command === "reload" && eventExperienceConfigurationsEqual(intended.configuration, eventExperienceConfigurationFromSnapshot(intended.snapshot))) { run(); return; }
    Alert.alert(command === "publish" ? "发布题集" : "重新读取活动体验", command === "publish" ? `确认发布已保存的草稿版本 ${intended.snapshot?.draft?.version}？报名者将看到此版本。` : "重新读取会丢弃尚未保存的修改。确认继续？", [
      { style: "cancel", text: "取消" },
      { text: command === "publish" ? "确认发布" : "丢弃修改并读取", onPress: run },
    ]);
  }

  return <AppScreen eyebrow="活动运营" title="报名体验配置">
    <EventExperienceContent configuration={state.configuration} snapshot={state.snapshot} preview={state.preview} authorized={state.authorized} loading={state.loading} busy={state.busy} dirty={dirty} error={state.error} notice={state.notice} freeze={freeze} onChange={change} onSave={() => void mutate("save")} onPreview={() => void mutate("preview")} onPublish={() => confirmCommand("publish")} onReload={() => confirmCommand("reload")} onBack={() => router.push(`/events/${encodeURIComponent(eventId)}/operations` as Href)} onRestore={() => { const published = current.current.snapshot?.published; if (published) change({ ...current.current.configuration, questionSet: published.configuration.questionSet }, true); }} />
  </AppScreen>;
}
