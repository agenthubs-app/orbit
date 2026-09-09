import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { EventExperienceConfigurationContract, EventExperienceQuestionContract, EventExperienceSnapshotContract, EventExperienceVersionContract } from "../../api/contract/event-experience";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import { eventExperienceInitialQuestion, eventExperienceIntentLabels, eventExperienceIntents, eventExperienceQuestionsForTrack } from "../../view-models/event-experience";

export interface EventExperienceContentProps {
  configuration: EventExperienceConfigurationContract;
  snapshot: EventExperienceSnapshotContract | null;
  preview: EventExperienceVersionContract | null;
  authorized: boolean;
  loading: boolean;
  busy: "save" | "preview" | "publish" | null;
  dirty: boolean;
  error: string | null;
  notice: string | null;
  freeze: { frozen: boolean; blocked: boolean; canRestore: boolean };
  onChange: (configuration: EventExperienceConfigurationContract) => void;
  onSave: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onReload: () => void;
  onBack: () => void;
  onRestore: () => void;
}

function ExperienceButton({ label, icon, disabled = false, selected = false, primary = false, iconOnly = false, onPress }: {
  label: string; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean; selected?: boolean; primary?: boolean; iconOnly?: boolean; onPress: () => void;
}) {
  const { colors, styles } = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, primary && styles.primary, selected && styles.selected, iconOnly && styles.iconButton, disabled && styles.disabled, pressed && styles.pressed]}>
    {icon ? <Ionicons name={icon} size={20} color={primary ? colors.onAccent : colors.accent} /> : null}
    {!iconOnly ? <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text> : null}
  </Pressable>;
}

export function EventExperienceContent({ configuration, snapshot, preview, authorized, loading, busy, dirty, error, notice, freeze, onChange, onSave, onPreview, onPublish, onReload, onBack, onRestore }: EventExperienceContentProps) {
  const { colors, styles } = useStyles();
  const [intentMenu, setIntentMenu] = useState<{ index: number; configuration: EventExperienceConfigurationContract } | null>(null);
  const editingDisabled = loading || busy === "save" || busy === "publish";
  const questionsDisabled = editingDisabled || freeze.frozen;
  const custom = configuration.questionSet.track === "v2";
  const questions = configuration.questionSet.questions;
  const visibleMenu = authorized && custom && !questionsDisabled && intentMenu?.configuration === configuration ? intentMenu : null;
  const activeMenu = useRef(visibleMenu);
  activeMenu.current = visibleMenu;

  function changeQuestions(next: readonly EventExperienceQuestionContract[]) {
    if (questionsDisabled) return;
    onChange({ ...configuration, questionSet: { ...configuration.questionSet, questions: next } });
  }

  function changeQuestion(index: number, patch: Partial<EventExperienceQuestionContract>) {
    changeQuestions(questions.map((question, i) => i === index ? { ...question, ...patch } : question));
  }

  function changeTrack(track: "v1" | "v2") {
    if (questionsDisabled) return;
    onChange({ ...configuration, questionSet: { track, questions: eventExperienceQuestionsForTrack(track, questions) } });
  }

  function addQuestion() {
    if (!custom || questions.length >= 4 || questionsDisabled) return;
    const intent = eventExperienceIntents.find(intent => !questions.some(q => q.intent === intent));
    if (intent) changeQuestions([...questions, eventExperienceInitialQuestion(intent)]);
  }

  function chooseIntent(index: number) {
    if (!authorized || !custom || questionsDisabled) return;
    setIntentMenu({ index, configuration });
  }

  return <View style={styles.content}>
    <View style={styles.row}>
      <ExperienceButton label="返回活动运营台" icon="arrow-back" onPress={onBack} />
      <ExperienceButton label="重新读取" icon="refresh-outline" iconOnly disabled={loading || busy !== null} onPress={onReload} />
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    {loading ? <Text accessibilityLiveRegion="polite" style={styles.caption}>正在读取活动体验...</Text> : null}
    {authorized && !loading ? <>
      <View style={styles.section}>
        <Text style={styles.caption}>草稿版本：{snapshot?.draft?.version ?? "未保存"} · 已发布版本：{snapshot?.published?.version ?? "未发布"}</Text>
        <Text style={styles.caption}>问题编辑截止：{snapshot?.head.frozenAt ? new Date(snapshot.head.frozenAt).toLocaleString("zh-CN") : "未设置"}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.caption}>{busy ? busy === "save" ? "正在保存..." : busy === "publish" ? "正在发布..." : "正在生成预览..." : dirty ? "尚未保存" : snapshot ? "与已保存版本一致" : "尚无草稿"}</Text>
        {freeze.frozen ? <Text style={styles.warning}>{freeze.canRestore ? "已到截止时间，当前问题与已发布题集不同。" : freeze.blocked ? "已到截止时间，尚无已发布题集，暂不能保存或发布。" : "问题已截止；活动简介和强调色仍可修改。"}</Text> : null}
        {freeze.canRestore ? <ExperienceButton label="恢复已发布问题" icon="refresh-outline" disabled={editingDisabled} onPress={onRestore} /> : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>活动简介</Text>
        <TextInput accessibilityLabel="活动简介" editable={!editingDisabled} multiline maxLength={1000} value={configuration.introduction ?? ""} onChangeText={introduction => onChange({ ...configuration, introduction: introduction || null })} style={[styles.input, styles.introduction]} textAlignVertical="top" />
        <Text style={styles.heading}>强调色</Text>
        <View style={styles.row}>
          {["#128877", "#2563EB", "#C43B58", "#6E56CF"].map(color => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`强调色 ${color}`} accessibilityState={{ selected: configuration.accentColor === color, disabled: editingDisabled }} disabled={editingDisabled} onPress={() => onChange({ ...configuration, accentColor: color })} style={[styles.swatch, { backgroundColor: color, borderColor: configuration.accentColor === color ? colors.ink : colors.border }, editingDisabled && styles.disabled]} />)}
          <ExperienceButton label="恢复默认强调色" icon="refresh-outline" iconOnly disabled={editingDisabled} onPress={() => onChange({ ...configuration, accentColor: null })} />
        </View>
        <TextInput accessibilityLabel="强调色" autoCapitalize="none" autoCorrect={false} maxLength={7} editable={!editingDisabled} value={configuration.accentColor ?? ""} onChangeText={accentColor => onChange({ ...configuration, accentColor: accentColor || null })} placeholder="#RRGGBB" placeholderTextColor={colors.text3} style={styles.input} />
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>报名问题</Text>
        <View style={styles.row}>
          <ExperienceButton label="标准问题" selected={!custom} disabled={questionsDisabled} onPress={() => changeTrack("v1")} />
          <ExperienceButton label="自选问题" selected={custom} disabled={questionsDisabled} onPress={() => changeTrack("v2")} />
          {custom ? <ExperienceButton label="添加问题" icon="add" iconOnly disabled={questionsDisabled || questions.length >= 4} onPress={addQuestion} /> : null}
        </View>
        <Text style={styles.caption}>{custom ? `${questions.length} / 4 题 · 选答` : "2 题 · 必答"}</Text>
        {questions.map((question, index) => <View key={question.intent} style={styles.question}>
          <View style={styles.row}>
            <Text style={[styles.heading, styles.flex]}>{eventExperienceIntentLabels[question.intent]}</Text>
            {custom ? <>
              <ExperienceButton label={`问题类型 ${index + 1}`} icon="chevron-down" iconOnly disabled={questionsDisabled} onPress={() => chooseIntent(index)} />
              <ExperienceButton label={`移除问题 ${index + 1}`} icon="trash-outline" iconOnly disabled={questionsDisabled} onPress={() => changeQuestions(questions.filter((_, i) => i !== index))} />
            </> : null}
          </View>
          {visibleMenu?.index === index ? <View style={styles.section}>
            <Text style={styles.caption}>选择问题类型</Text>
            {eventExperienceIntents.filter(intent => !questions.some((q, i) => i !== index && q.intent === intent)).map(intent => <ExperienceButton key={intent} label={eventExperienceIntentLabels[intent]} selected={question.intent === intent} onPress={() => {
              if (activeMenu.current !== visibleMenu) return;
              activeMenu.current = null;
              setIntentMenu(null);
              changeQuestion(index, eventExperienceInitialQuestion(intent));
            }} />)}
            <ExperienceButton label="取消" onPress={() => {
              if (activeMenu.current !== visibleMenu) return;
              activeMenu.current = null;
              setIntentMenu(null);
            }} />
          </View> : null}
          <TextInput accessibilityLabel={`问题 ${index + 1}`} editable={!questionsDisabled} maxLength={240} multiline value={question.prompt} onChangeText={prompt => changeQuestion(index, { prompt })} style={styles.input} />
          {question.options.map((option, optionIndex) => <View key={optionIndex} style={styles.row}>
            <TextInput accessibilityLabel={`问题 ${index + 1} 选项 ${optionIndex + 1}`} editable={!questionsDisabled} maxLength={80} value={option} onChangeText={value => changeQuestion(index, { options: question.options.map((o, i) => i === optionIndex ? value : o) })} style={[styles.input, styles.flex]} />
            <ExperienceButton label={`移除问题 ${index + 1} 选项 ${optionIndex + 1}`} icon="remove" iconOnly disabled={questionsDisabled || question.options.length <= 2} onPress={() => { if (question.options.length > 2) changeQuestion(index, { options: question.options.filter((_, i) => i !== optionIndex) }); }} />
          </View>)}
          <ExperienceButton label={`添加选项 ${index + 1}`} icon="add" iconOnly disabled={questionsDisabled || question.options.length >= 5} onPress={() => { if (question.options.length < 5) changeQuestion(index, { options: [...question.options, ""] }); }} />
        </View>)}
      </View>
      <View style={styles.row}>
        <ExperienceButton label="保存草稿" icon="save-outline" primary disabled={busy !== null || freeze.blocked} onPress={onSave} />
        <ExperienceButton label="预览" icon="eye-outline" iconOnly disabled={busy !== null || freeze.blocked} onPress={onPreview} />
        <ExperienceButton label="发布题集" disabled={busy !== null || dirty || !snapshot?.draft || freeze.blocked} onPress={onPublish} />
      </View>
      {preview ? <View style={[styles.preview, { borderLeftColor: preview.configuration.accentColor ?? colors.border }]}>
        <Text style={styles.heading}>报名预览</Text>
        <Text style={styles.body}>{preview.configuration.introduction ?? "暂无活动简介"}</Text>
        {preview.configuration.questionSet.questions.map(question => <View key={question.intent} style={styles.section}>
          <Text style={styles.body}>{question.prompt}</Text>
          <Text style={styles.caption}>{question.required ? "必答" : "选答"}</Text>
          {question.options.map((option, index) => <Text key={index} style={styles.body}>{option}</Text>)}
        </View>)}
      </View> : null}
    </> : null}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  content: { gap: spacing.lg },
  section: { gap: spacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  heading: { fontSize: typography.body, lineHeight: 23, fontWeight: "700", color: colors.ink },
  body: { fontSize: typography.body, lineHeight: 23, color: colors.text, flexShrink: 1 },
  caption: { fontSize: typography.small, lineHeight: 20, color: colors.text3 },
  error: { fontSize: typography.small, lineHeight: 20, color: colors.rose },
  notice: { fontSize: typography.small, lineHeight: 20, color: colors.live },
  warning: { fontSize: typography.small, lineHeight: 20, color: colors.text2 },
  input: { minHeight: 48, minWidth: 0, borderWidth: 1, borderColor: colors.border2, borderRadius: 6, padding: spacing.sm, fontSize: typography.body, lineHeight: 23, color: colors.ink, backgroundColor: colors.surface },
  introduction: { minHeight: 112 },
  question: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: spacing.md, gap: spacing.sm },
  button: { minHeight: 44, maxWidth: "100%", borderRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  buttonText: { fontSize: typography.small, lineHeight: 20, fontWeight: "700", color: colors.ink, flexShrink: 1 },
  iconButton: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0 },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  primaryText: { color: colors.onAccent },
  selected: { borderColor: colors.accent, backgroundColor: colors.surface2 },
  swatch: { width: 44, height: 44, borderWidth: 3, borderRadius: 6 },
  preview: { borderLeftWidth: 4, paddingLeft: spacing.md, gap: spacing.md },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
}));
