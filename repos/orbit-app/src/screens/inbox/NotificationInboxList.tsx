import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { InboxNotificationKind, InboxNotificationListDTO, InboxNotificationDTO } from '../../api/contract/inbox-notifications';
import { secretaryKind } from '../../api/compute/secretary-source';
import { CategoryTabs, EmptyState, ListRow, SwipeRow, UiText, Button, type SwipeAction } from '../../components/ui';
import { useOrbitTheme } from '../../design/theme';
import { useOrbitLocale } from '../../i18n/OrbitLocaleContext';

export const notificationKindIcons: Record<InboxNotificationKind, 'time-outline' | 'sparkles-outline' | 'swap-horizontal-outline'> = {
  reminder: 'time-outline', suggestion: 'sparkles-outline', update: 'swap-horizontal-outline',
};

export type NotificationFilter = 'all' | 'secretary' | InboxNotificationKind | 'history';

export function NotificationInboxList({ data, onOpen, onMore, onRefresh, onFilter, onAction, filter, busy, error }: {
  data: InboxNotificationListDTO;
  onOpen: (id: string) => void;
  onMore: () => void;
  onRefresh: () => void;
  onFilter: (kind: NotificationFilter) => void;
  onAction?: (item: InboxNotificationDTO, action: 'read' | 'accept' | 'snooze') => void;
  filter: NotificationFilter;
  busy: boolean;
  error: string;
}) {
  const { colors } = useOrbitTheme();
  const { t, language } = useOrbitLocale();
  const { fontScale } = useWindowDimensions();
  const options: { key: NotificationFilter; label: string }[] = (['all', 'secretary', 'reminder', 'suggestion', 'update', 'history'] as const)
    .map(key => ({ key, label: t(`typedInbox.${key}`) }));
  let previousDay = '';
  return <View style={styles.container}>
    <CategoryTabs options={options} value={filter} onChange={onFilter} accessibilityLabel={t('inbox.alertsTab')} />
    {error ? <View><UiText accessibilityRole="alert" style={{ color: colors.ink }}>{error}</UiText><Button label={t('common.retry')} onPress={onRefresh} variant="secondary" /></View> : null}
    {!data.items.length ? <EmptyState title={t('typedInbox.empty')} /> : null}
    {data.items.map(item => {
      const day = new Date(item.occurredAt).toLocaleDateString(language, { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric' });
      const heading = day !== previousDay;
      previousDay = day;
      const kind = secretaryKind(item);
      const timestamp = item.dueAt ?? item.scheduledFor;
      const subtitle = fontScale > 1.2
        ? item.reason || item.sources[0]?.excerpt || ''
        : [item.reason, item.sources[0]?.excerpt ? `${t('typedInbox.source')} · ${item.sources[0].excerpt}` : null,
          timestamp ? `${t(item.dueAt ? 'typedInbox.due' : 'typedInbox.scheduled')} · ${new Date(timestamp).toLocaleString(language, { timeZone: 'Asia/Tokyo' })}` : null]
          .filter(Boolean).join(' · ');
      const actions: SwipeAction[] = onAction && item.target.status === 'available' && !busy && fontScale <= 1.2
        ? (['read', 'accept', 'snooze'] as const).filter(action => item.actions.includes(action) && !(action === 'read' && item.readAt))
          .map(action => ({ key: action, label: t(`typedInbox.${action}`), icon: action === 'read' ? 'check' : action === 'accept' ? 'plus' : 'clock', tone: action === 'read' ? 'lav' : action === 'accept' ? 'ok' : 'teal', onPress: () => onAction(item, action) }))
        : [];
      const row = <ListRow title={item.title} subtitle={subtitle} onPress={() => onOpen(item.id)}
        leading={<View style={[styles.icon, { backgroundColor: colors.surface2 }]}><UiText>{kind ? '✦' : item.kind === 'reminder' ? '◷' : item.kind === 'suggestion' ? '✧' : '↗'}</UiText></View>}
        titleAddon={!item.readAt && item.disposition === 'open' ? <View accessibilityLabel={t('typedInbox.unreadState')} style={[styles.dot, { backgroundColor: colors.accentText }]} /> : undefined}
        trailing={fontScale <= 1.2 ? <UiText style={{ color: colors.ink3Text, fontSize: 11 }}>{new Date(item.occurredAt).toLocaleTimeString(language, { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}</UiText> : undefined} />;
      return <View key={item.id}>
        {heading ? <UiText style={[styles.day, { color: colors.ink3Text }]}>{day}</UiText> : null}
        {actions.length ? <SwipeRow actions={actions}>{row}</SwipeRow> : row}
      </View>;
    })}
    {data.nextCursor ? <Button label={t('typedInbox.more')} disabled={busy} onPress={onMore} variant="secondary" /> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  day: { fontSize: 12, fontWeight: '700', marginTop: 12 },
  dot: { borderRadius: 3, height: 6, width: 6 },
  icon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
});
