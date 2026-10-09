import { join } from "node:path";
import type { Plugin } from "esbuild";

// R04: the component library (src/components/ui) uses native-only motion,
// gesture, haptics and blur modules. Browser harnesses that render a screen
// using the library swap them for the small web stand-ins in tests/helpers/stubs.
export const NATIVE_UI_MODULES = ["react-native-reanimated", "react-native-gesture-handler", "expo-haptics", "expo-blur"] as const;

export const nativeUiStubs: Plugin = {
  name: "native-ui-stubs",
  setup(plugin) {
    for (const name of NATIVE_UI_MODULES) {
      plugin.onResolve({ filter: new RegExp(`^${name}$`) }, () => ({ path: join(process.cwd(), "tests/helpers/stubs", `${name}.js`) }));
    }
  },
};
