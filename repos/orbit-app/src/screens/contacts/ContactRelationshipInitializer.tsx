import * as Crypto from "expo-crypto";
import { type Href, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { OrbitLanguage } from "../../api/contract/language";
import type { ContactInitializationDraft } from "../../api/relationship-initialization";
import { DataCard } from "../../components/DataCard";
import { useOrbitTheme } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { createContactInitializationController, type ContactInitializationState } from "../../view-models/relationship-initialization";

export function useContactInitialization(contactId: string, connectionId: string | null | undefined, parentScopeKey: string | undefined, isScopeCurrent: () => boolean, onConfirmed: () => void) {
  const auth = useOrbitAuthSession(), server = useOrbitApiBaseUrl();
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId && contactId) && connectionId !== undefined;
  const scopeKey = JSON.stringify([auth.actorId, auth.cookieHeader, server.baseUrl, contactId, connectionId, parentScopeKey, ready]);
  const client = useOrbitApiClient({ scopeKey });
  const scope = useMemo(() => ({}), [scopeKey]);
  const latest = useRef(scope); latest.current = scope;
  const callbacks = useRef({ isScopeCurrent, onConfirmed }); callbacks.current = { isScopeCurrent, onConfirmed };
  const controller = useMemo(() => createContactInitializationController({ client, actorId: auth.actorId ?? "", contactId, connectionId: connectionId ?? null,
    createId: () => Crypto.randomUUID(), isCurrent: () => ready && latest.current === scope && callbacks.current.isScopeCurrent(),
    onConfirmed: () => { if (latest.current === scope && callbacks.current.isScopeCurrent()) callbacks.current.onConfirmed(); },
  }), [client, scope, ready, auth.actorId, contactId, connectionId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { if (ready) void controller.start(); return () => controller.dispose(); }, [controller, ready]);
  return { controller, state, ready };
}
export type ContactInitializationBinding = ReturnType<typeof useContactInitialization>;

export function contactInitializationStageText(stage: string, language: OrbitLanguage): string {
  const labels: Record<string, Record<OrbitLanguage, string>> = {
    active: { zh: "进行中", en: "Active", ja: "進行中" }, needs_follow_up: { zh: "需要跟进", en: "Needs follow-up", ja: "フォローアップが必要" },
    nurture: { zh: "维护中", en: "Nurture", ja: "定期的に連絡" }, archived: { zh: "已归档", en: "Archived", ja: "アーカイブ済み" },
    pending: { zh: "待设置关系", en: "Pending initialization", ja: "関係設定待ち" },
    loading: { zh: "正在读取关系状态", en: "Loading relationship state", ja: "関係を読み込み中" },
    error: { zh: "关系状态读取失败", en: "Relationship state unavailable", ja: "関係を読み込めません" },
  };
  return labels[stage]?.[language] ?? stage;
}

export function ContactRelationshipInitializer({ binding }: { binding: ContactInitializationBinding }) {
  const { language } = useOrbitLocale(), { timeZone, canSave } = useOrbitTimeZone();
  const router = useRouter();
  return <ContactInitializationForm state={binding.state} ready={binding.ready} language={language} timeZone={timeZone} canSave={canSave}
    onChange={binding.controller.change} onSave={() => binding.controller.save(timeZone, canSave)} onRefresh={binding.controller.refresh}
    onOpenTask={id => { if (binding.ready) router.push(`/tasks/relationship/${encodeURIComponent(id)}` as Href); }} />;
}

export function ContactInitializationForm({ state, ready, language, timeZone, canSave, onChange, onSave, onRefresh, onOpenTask }: {
  state: ContactInitializationState; ready: boolean; language: OrbitLanguage; timeZone: string; canSave: boolean;
  onChange: (patch: Partial<ContactInitializationDraft>) => void; onSave: () => Promise<void>; onRefresh: () => Promise<void>; onOpenTask: (id: string) => void;
}) {
  const { colors } = useOrbitTheme();
  const text = (zh: string, en: string, ja: string) => language === "zh" ? zh : language === "ja" ? ja : en;
  if (state.view.kind === "hidden") return null;
  const disabled = state.busy || state.locked || !ready;
  const dated = state.draft.stage === "needs_follow_up" || state.draft.stage === "nurture";
  const fields: ["goal" | "title" | "date" | "time", string, string][] = state.draft.stage === "active" ? [["goal", text("关系目标", "Relationship goal", "関係の目標"), ""]]
    : dated ? [["title", text("跟进内容", "Next step", "次の内容"), ""], ["date", text("下次日期", "Next date", "次の日付"), "YYYY-MM-DD"], ["time", text("下次时间", "Next time", "次の時刻"), "HH:mm"]] : [];
  return <DataCard title={text("我的关系设置", "My relationship settings", "自分の関係設定")}>
    <Text style={{ color: colors.text3 }}>{text("交换仅确认已认识。此处只设置你自己的关系下一步，不代表对方，也不会发送消息。", "An exchange confirms you know each other. Set your own next step; this does not represent the other person or send a message.", "交換は知り合ったことの確認です。自分の次のステップのみを設定し、相手には送信しません。")}</Text>
    {!ready ? <Text accessibilityRole="alert">{text("请先确认登录及服务连接。", "Confirm sign-in and service connection.", "ログインと接続を確認してください。")}</Text> : null}
    {state.view.kind === "loading" ? <Text>{contactInitializationStageText("loading", language)}</Text> : null}
    {state.error ? <Text accessibilityRole="alert" style={{ color: colors.ink }}>{state.error}</Text> : null}
    {state.notice ? <Text accessibilityRole="text">{state.notice === "replayed" ? text("已确认此前提交，未重复创建。", "Previous submission confirmed; nothing duplicated.", "前の送信を確認しました。重複作成はありません。") : text("已保存你的关系选择。", "Your relationship choice was saved.", "関係の選択を保存しました。")}</Text> : null}
    {state.view.kind === "pending" ? <View style={{ gap: 12 }}>
      <Text style={{ color: colors.ink }}>{contactInitializationStageText("pending", language)}</Text>
      {(["active", "needs_follow_up", "nurture", "archived"] as const).map(stage => <Pressable key={stage} accessibilityRole="radio" accessibilityLabel={contactInitializationStageText(stage, language)} accessibilityState={{ checked: state.draft.stage === stage, disabled }} disabled={disabled} onPress={() => onChange({ stage })} style={{ paddingVertical: 12 }}>
        <Text style={{ color: state.draft.stage === stage ? colors.accent : colors.ink }}>{state.draft.stage === stage ? "● " : "○ "}{contactInitializationStageText(stage, language)}</Text>
      </Pressable>)}
      {fields.map(([key, label, placeholder]) => <View key={key} style={{ gap: 6 }}><Text style={{ color: colors.text2 }}>{label}</Text><TextInput accessibilityLabel={label} value={state.draft[key]} editable={!disabled} onChangeText={value => onChange({ [key]: value })} placeholder={placeholder} placeholderTextColor={colors.text3} maxLength={key === "goal" ? 2000 : key === "title" ? 500 : 16} autoCapitalize="none" style={{ color: colors.ink, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12 }} /></View>)}
      {dated ? <Text style={{ color: colors.text3 }}>{text("当前设备时区：", "Device time zone: ", "端末のタイムゾーン：")}{timeZone}{!canSave ? text("（无法确认，不能提交日期）", " (unconfirmed; dated steps cannot be saved)", "（未確認のため日時を保存できません）") : ""}</Text> : null}
      {state.draft.stage === "archived" ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: state.draft.archiveConfirmed, disabled }} disabled={disabled} onPress={() => onChange({ archiveConfirmed: !state.draft.archiveConfirmed })}><Text style={{ color: colors.ink, paddingVertical: 12 }}>{state.draft.archiveConfirmed ? "☑ " : "☐ "}{text("确认归档我的关系", "Confirm archiving my relationship", "自分の関係をアーカイブすることを確認")}</Text></Pressable> : null}
      {state.locked ? <Text style={{ color: colors.text3 }}>{text("结果尚待确认；重试使用原提交。也可刷新读取最新状态。", "Awaiting confirmation; retry reuses the original request. You can also refresh.", "確認待ちです。再試行では同じリクエストを使用します。更新も可能です。")}</Text> : null}
      <Pressable accessibilityRole="button" disabled={!ready || state.busy || !state.draft.stage || (!state.locked && dated && !canSave)} onPress={() => void onSave()} style={{ padding: 14, borderRadius: 10, backgroundColor: colors.accent, opacity: !ready || state.busy || !state.draft.stage ? 0.5 : 1 }}>
        <Text style={{ color: colors.onAccent }}>{state.busy ? text("保存中…", "Saving…", "保存中…") : state.locked ? text("重试原提交", "Retry original submission", "同じ送信を再試行") : text("确认我的选择", "Confirm my choice", "自分の選択を確定")}</Text>
      </Pressable>
    </View> : null}
    {state.view.kind === "initialized" ? <View style={{ gap: 8 }}>
      <Text style={{ color: colors.ink }}>{text("当前阶段：", "Current stage: ", "現在の段階：")}{contactInitializationStageText(state.view.stage, language)}</Text>
      {state.view.goal ? <Text style={{ color: colors.ink }}>{text("关系目标：", "Goal: ", "目標：")}{state.view.goal}</Text> : null}
      {state.view.tasks.map(task => <Text key={task.id} style={{ color: colors.ink }}>{task.title} · {new Date(task.dueAt).toLocaleString(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { timeZone })}</Text>)}
      {state.view.tasks.length ? <Pressable accessibilityRole="button" onPress={() => { if (state.view.kind === "initialized") onOpenTask(state.view.connectionId); }}><Text style={{ color: colors.accent, paddingVertical: 12 }}>{text("处理关系跟进", "Manage follow-up", "フォローアップを管理")}</Text></Pressable> : null}
    </View> : null}
    <Pressable accessibilityRole="button" disabled={state.busy || !ready} onPress={() => void onRefresh()}><Text style={{ color: colors.accent, paddingVertical: 12 }}>{text("刷新关系状态", "Refresh relationship state", "関係状態を更新")}</Text></Pressable>
  </DataCard>;
}
