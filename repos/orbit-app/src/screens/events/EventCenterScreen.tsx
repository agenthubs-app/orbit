import { type Href, useRouter } from "expo-router";
import { RefreshControl, StyleSheet, Text } from "react-native";

import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { colors, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { eventCenterToView } from "../../view-models/event-center";
import {
  EventCenterContent,
  type EventCenterContentState
} from "./EventCenterContent";

export function EventCenterScreen() {
  const router = useRouter();
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.eventCenter,
    (data) => eventCenterToView(data).length === 0
  );
  const events =
    state.kind === "success" ? eventCenterToView(state.data) : [];
  const contentState: EventCenterContentState =
    state.kind === "failure" || state.kind === "offline"
      ? { kind: state.kind, message: state.error.message }
      : { kind: state.kind };

  return (
    <AppScreen
      eyebrow="我的活动权限"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="运营活动中心"
    >
      <Text style={styles.intro}>
        查看你负责或参与运营的活动，以及每场活动当前最需要处理的事项。
      </Text>
      <EventCenterContent
        events={events}
        onOpenAdmission={(id) =>
          router.push(
            `/events/${encodeURIComponent(id)}/operations/admission` as Href
          )
        }
        onOpenAnalytics={(id) =>
          router.push(`/events/${encodeURIComponent(id)}/analytics` as Href)
        }
        onOpenCheckIn={(id) =>
          router.push(
            `/events/${encodeURIComponent(id)}/operations/check-in` as Href
          )
        }
        onOpenOperations={(id) =>
          router.push(`/events/${encodeURIComponent(id)}/operations` as Href)
        }
        onOpenRoles={(id) =>
          router.push(
            `/events/${encodeURIComponent(id)}/operations/roles` as Href
          )
        }
        onOpenEvent={(id) =>
          router.push(`/events/${encodeURIComponent(id)}` as Href)
        }
        state={contentState}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: -spacing.sm
  }
});
