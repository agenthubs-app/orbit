import { Component, type ErrorInfo, type PropsWithChildren } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { layout, radius, spacing, textStyles } from "../design/tokens";
import { createControlStyles } from "../design/controls";
import { createThemedStyles } from "../design/theme";

// 渲染期抛出的异常在 React Native 里会把整棵树卸载，用户看到白屏且只能杀进程。
// 这里提供两层网：
//
// 1. AppErrorScreen —— 兜底界面本身，两层网共用。
// 2. AppErrorBoundary —— 类组件边界，给 expo-router 的 ErrorBoundary 约定
//    覆盖不到的地方用（Provider 层、以及 router 之外的任何东西）。
//
// 路由内部优先用 expo-router 的 ErrorBoundary 导出：它只重置出问题的那一段，
// 导航器保持挂载，retry() 之后还能正常跳转。类组件边界做不到这一点，
// 因为它一旦重置就会把整个导航器一起重新挂载。
//
// 两层网都只处理渲染异常。事件回调和异步请求里的错误不走这里，
// 那些由 useApiResource 的 failure/offline 状态和各屏自己的错误文案负责。

function errorDetail(error: Error): string {
  const message = error.message.trim();

  if (!message) {
    return "没有更多信息。";
  }

  // 原始异常信息通常是英文技术文本，对用户没有帮助但对排查有用，
  // 所以放在次要位置而不是标题里。
  return message.length > 240 ? `${message.slice(0, 240)}…` : message;
}

export function AppErrorScreen({
  error,
  onRetry
}: {
  error: Error;
  onRetry: () => void;
}) {
  const { styles } = useStyles();
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>这个页面出了点问题</Text>
        <Text style={styles.body}>
          页面没能显示出来。你的数据没有受影响，重试一下通常就好了。
        </Text>
        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>错误信息</Text>
          <Text style={styles.detailText}>{errorDetail(error)}</Text>
        </View>
        <Pressable
          accessibilityLabel="重试"
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.primaryButtonText}>重试</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

interface AppErrorBoundaryProps extends PropsWithChildren {
  onReset?: () => void;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 目前只落到设备日志。接入上报服务是轨道 C 的目标，届时改这一处即可。
    console.error("Orbit 渲染异常", error, info.componentStack);
  }

  reset = (): void => {
    // 先让 children 重新挂载，再让调用方决定要不要切走。
    this.setState({ error: null }, () => {
      this.props.onReset?.();
    });
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return <AppErrorScreen error={error} onRetry={this.reset} />;
  }
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  ...createControlStyles(colors),
  body: {
    ...textStyles.body,
    color: colors.text2
  },
  content: {
    alignSelf: "center",
    flexGrow: 1,
    gap: spacing.lg,
    justifyContent: "center",
    maxWidth: layout.contentMax,
    paddingHorizontal: layout.pageInset,
    paddingVertical: layout.contentBottom,
    width: "100%"
  },
  detailBox: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    gap: spacing.xs,
    padding: spacing.md
  },
  detailLabel: {
    ...textStyles.caption,
    color: colors.text3,
    fontWeight: "600"
  },
  detailText: {
    ...textStyles.caption,
    color: colors.text2
  },
  pressed: {
    opacity: 0.72
  },
  safeArea: {
    backgroundColor: colors.surface,
    flex: 1
  },
  title: {
    ...textStyles.pageTitle,
    color: colors.ink
  }
}));
