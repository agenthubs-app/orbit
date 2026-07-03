import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors, radius, spacing } from "../../src/design/tokens";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveBackgroundColor: colors.accentSofter,
        tabBarActiveTintColor: colors.accent,
        tabBarHideOnKeyboard: true,
        tabBarIconStyle: {
          marginBottom: -2,
          marginTop: 4
        },
        tabBarInactiveBackgroundColor: colors.surface,
        tabBarInactiveTintColor: colors.muted,
        tabBarItemStyle: {
          borderRadius: radius.control,
          marginHorizontal: spacing.xxs,
          marginVertical: spacing.xs
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          lineHeight: 14,
          marginTop: 0
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 82,
          paddingBottom: spacing.md,
          paddingHorizontal: spacing.sm,
          paddingTop: spacing.sm
        }
      }}
    >
      <Tabs.Screen
        name="ai"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="sparkles-outline" size={size} />
          ),
          title: "Orbit AI"
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="calendar-outline" size={size} />
          ),
          title: "Events"
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="people-outline" size={size} />
          ),
          title: "Contacts"
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="checkmark-done-outline" size={size} />
          ),
          title: "Schedule"
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="person-circle-outline" size={size} />
          ),
          title: "Profile"
        }}
      />
    </Tabs>
  );
}
