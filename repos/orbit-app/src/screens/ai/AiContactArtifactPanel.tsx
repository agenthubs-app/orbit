import { Pressable, Text, View } from "react-native";
import { DataCard } from "../../components/DataCard";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTheme } from "../../design/theme";
import { spacing, textStyles } from "../../design/tokens";
import type { ConversationContactArtifactView } from "../../view-models/ai-artifacts";

export function AiContactArtifactPanel({ artifact, onOpenHref }: { artifact: ConversationContactArtifactView; onOpenHref: (href: string) => void }) {
  const locale = useOrbitLocale(); const { colors } = useOrbitTheme();
  const statusKeys = {
    empty: "aiContactArtifact.empty", pending: "aiContactArtifact.pending", failed: "aiContactArtifact.failed",
    unsupported: "aiContactArtifact.unsupported", unavailable: "aiContactArtifact.unavailable"
  } as const;
  return <View testID="ai-contact-artifact" style={{ gap: spacing.md }}>
    <DataCard title={artifact.title || locale.t("aiContactArtifact.title")} variant="inset">
      {artifact.status !== "ready" ? <Text accessibilityRole="alert" style={{ ...textStyles.small, color: colors.ink }}>{locale.t(statusKeys[artifact.status])}</Text> : <>
        <Text style={{ ...textStyles.body, color: colors.ink }}>{artifact.summary}</Text>
        {artifact.sections.map((section, index) => <View key={index} style={{ gap: spacing.sm }}>
          <Text style={{ ...textStyles.listTitle, color: colors.ink }}>{section.title}</Text>
          {section.body ? <Text style={{ ...textStyles.small, color: colors.ink }}>{section.body}</Text> : null}
          {section.items.map(item => <View key={item.id} testID="ai-contact-candidate" accessibilityLabel={[item.title, item.subtitle].filter(Boolean).join(" · ")} style={{ gap: spacing.xs, paddingVertical: spacing.sm }}>
            <Text style={{ ...textStyles.listTitle, color: colors.ink }}>{item.title}</Text>
            {item.subtitle ? <Text style={{ ...textStyles.small, color: colors.ink }}>{item.subtitle}</Text> : null}
            {item.reason ? <Text style={{ ...textStyles.body, color: colors.ink }}>{item.reason}</Text> : null}
            {item.body ? <Text style={{ ...textStyles.small, color: colors.ink }}>{item.body}</Text> : null}
            {item.metadata.map((entry, index) => <Text key={index} style={{ ...textStyles.small, color: colors.ink }}>{entry.label}：{entry.value}</Text>)}
            {item.evidenceIds.length ? <Text style={{ ...textStyles.small, color: colors.ink }}>{locale.t("aiContactArtifact.evidence", { count: item.evidenceIds.length })}</Text> : null}
            {item.contactHref ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("common.openNamed", { name: item.title })} onPress={() => onOpenHref(item.contactHref!)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ ...textStyles.body, color: colors.accent }}>{locale.t("aiContactArtifact.open")}</Text></Pressable> : null}
          </View>)}
        </View>)}
      </>}
    </DataCard>
  </View>;
}
