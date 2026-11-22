import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { InboxNotificationKind, InboxNotificationListDTO, InboxNotificationDTO } from '../../api/contract/inbox-notifications';
import { secretaryKind } from '../../api/compute/secretary-source';
import { notificationDisplayZone, notificationLocalDay } from '../../api/compute/inbox-notification-day';
import { CategoryTabs, EmptyState, ListRow, SwipeRow, UiText, Button, type SwipeAction } from '../../components/ui';
import { useOrbitTheme } from '../../design/theme';
import { useOrbitLocale } from '../../i18n/OrbitLocaleContext';
import { SHELL_GUTTER } from '../../components/ShellTopBar';
import { useEffect, useRef } from 'react';
import type { AgentActionPreviewContract } from '../../api/contract/agent-v1';
import { AgentInboxRow, agentEntryKind, waitsForClick } from './AgentInboxEntries';

export const notificationKindIcons: Record<InboxNotificationKind, 'time-outline' | 'sparkles-outline' | 'swap-horizontal-outline'> = {
  reminder: 'time-outline', suggestion: 'sparkles-outline', update: 'swap-horizontal-outline',
};

export type NotificationFilter = 'all' | 'secretary' | InboxNotificationKind | 'history';

export function NotificationInboxList({ data, onOpen, onMore, onRefresh, onFilter, onAction, filter, busy, error, timeZone, cardStates, openId }: {
  data: InboxNotificationListDTO;
  onOpen: (item: InboxNotificationDTO) => void;
  onMore: () => void;
  onRefresh: () => void;
  onFilter: (kind: NotificationFilter) => void;
  onAction?: (item: InboxNotificationDTO, action: 'read' | 'accept' | 'snooze') => void;
  filter: NotificationFilter;
  busy: boolean;
  error: string;
  timeZone?: string;
  /** AG15 (D15-4): the cards behind card entries, to group those still waiting on top of 「全部」. */
  cardStates?: ReadonlyMap<string, AgentActionPreviewContract | null> | null;
  /** AG15: `open=<run or card id>` — open that entry once the list has it (「看结果」 on a task's page). */
  openId?: string | null;
}) {
  const { colors } = useOrbitTheme();
  const { t, language } = useOrbitLocale();
  const { fontScale } = useWindowDimensions();
  const options: { key: NotificationFilter; label: string }[] = (['all', 'secretary', 'reminder', 'suggestion', 'update', 'history'] as const)
    .map(key => ({ key, label: t(`typedInbox.${key}`) }));
  let previousDay = '';
  const zone = notificationDisplayZone(timeZone);
  const waiting = filter === 'all' ? data.items.filter(item => waitsForClick(item, cardStates ?? new Map())) : [];
  const rest = data.items.filter(item => !waiting.includes(item));
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!openId || opened.current === openId) return;
    const match = data.items.find(item => item.sources[0]?.sourceId === openId || item.target.id === openId);
    if (match) { opened.current = openId; onOpen(match); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, data.items]);
  const timeOf = (item: InboxNotificationDTO) => new Date(item.occurredAt).toLocaleTimeString(language, { timeZone: zone, hour: '2-digit', minute: '2-digit' });
  return <View style={styles.container}>
    {/* Six filters never fit one row on a phone: one horizontally scrolling row (bleeds to the screen edges) instead of wrapping. */}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filtersContent}>
      <CategoryTabs options={options} value={filter} onChange={onFilter} accessibilityLabel={t('inbox.alertsTab')} />
    </ScrollView>
    {error ? <View><UiText accessibilityRole="alert" style={{ color: colors.ink }}>{error}</UiText><Button label={t('common.retry')} onPress={onRefresh} variant="secondary" /></View> : null}
    {!data.items.length ? <EmptyState title={t('typedInbox.empty')} /> : null}
    {waiting.length ? <View testID="agent-waiting-group"><UiText style={[styles.day, { color: colors.ink3Text }]}>{t('scheduledTasks.group', { n: waiting.length })}</UiText>{waiting.map(item => <AgentInboxRow key={item.id} n={item} waiting time={timeOf(item)} onOpen={() => onOpen(item)} />)}</View> : null}
    {rest.map(item => {
      const day = new Date(item.occurredAt).toLocaleDateString(language, { timeZone: zone, month: 'long', day: 'numeric' });
      const dayKey = notificationLocalDay(item.occurredAt, zone);
      const heading = dayKey !== previousDay;
      previousDay = dayKey;
      const kind = secretaryKind(item);
      const timestamp = item.dueAt ?? item.scheduledFor;
      const subtitle = fontScale > 1.2
        ? item.reason || item.sources[0]?.excerpt || ''
        : [item.reason, item.sources[0]?.excerpt ? `${t('typedInbox.source')} · ${item.sources[0].excerpt}` : null,
          timestamp ? `${t(item.dueAt ? 'typedInbox.due' : 'typedInbox.scheduled')} · ${new Date(timestamp).toLocaleString(language, { timeZone: zone })}` : null]
          .filter(Boolean).join(' · ');
      const actions: SwipeAction[] = onAction && item.target.status === 'available' && !busy && fontScale <= 1.2
        ? (['read', 'accept', 'snooze'] as const).filter(action => item.actions.includes(action) && !(action === 'read' && item.readAt))
          .map(action => ({ key: action, label: t(`typedInbox.${action}`), icon: action === 'read' ? 'check' : action === 'accept' ? 'plus' : 'clock', tone: action === 'read' ? 'lav' : action === 'accept' ? 'ok' : 'teal', onPress: () => onAction(item, action) }))
        : [];
      const row = <ListRow title={item.title} subtitle={subtitle} onPress={() => onOpen(item)}
        leading={<View style={[styles.icon, { backgroundColor: colors.surface2 }]}><UiText>{kind ? '✦' : item.kind === 'reminder' ? '◷' : item.kind === 'suggestion' ? '✧' : '↗'}</UiText></View>}
        titleAddon={!item.readAt && item.disposition === 'open' ? <View accessibilityLabel={t('typedInbox.unreadState')} style={[styles.dot, { backgroundColor: colors.accentText }]} /> : undefined}
        trailing={fontScale <= 1.2 ? <UiText style={{ color: colors.ink3Text, fontSize: 13 }}>{new Date(item.occurredAt).toLocaleTimeString(language, { timeZone: zone, hour: '2-digit', minute: '2-digit' })}</UiText> : undefined} />;
      // AG15 (15-5): an entry Orbit's own agent wrote has its own row (tag and the task's name).
      const agentRow = agentEntryKind(item) ? <AgentInboxRow n={item} waiting={waitsForClick(item, cardStates ?? new Map())} time={timeOf(item)} onOpen={() => onOpen(item)} /> : null;
      return <View key={item.id}>
        {heading ? <UiText style={[styles.day, { color: colors.ink3Text }]}>{day}</UiText> : null}
        {agentRow ?? (actions.length ? <SwipeRow actions={actions}>{row}</SwipeRow> : row)}
      </View>;
    })}
    {data.nextCursor ? <Button label={t('typedInbox.more')} disabled={busy} onPress={onMore} variant="secondary" /> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  filters: { flexGrow: 0, marginHorizontal: -SHELL_GUTTER },
  filtersContent: { paddingHorizontal: SHELL_GUTTER },
  day: { fontSize: 14, fontWeight: '700', marginTop: 12 },
  dot: { borderRadius: 3, height: 6, width: 6 },
  icon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
});
