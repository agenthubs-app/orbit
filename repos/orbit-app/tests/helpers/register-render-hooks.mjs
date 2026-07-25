// 让 node --test 能渲染 React Native 组件。
//
// 背景：这个仓库用 node --test + tsx，没有 jest-expo。react-native 的入口是未编译的
// Flow 代码，esbuild 解析不了（Unexpected "typeof"）。react-native-web 已经是本仓库
// 依赖（Expo Web 用它），组件 API 一致且是可以在 Node 里跑的普通 JS。
//
// tsx 在 CommonJS 模式下通过 require 解析模块，走不到 ESM 的 resolve 钩子，
// 所以这里改写 CJS 的解析入口。只作用于测试进程；Metro 打包原生包时用真的
// react-native，App 行为不受影响。
import Module from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const helpersDir = dirname(fileURLToPath(import.meta.url));

// 原生模块引用 react-native 内部路径，在 Node 里解析不了，用测试替身顶上。
const REDIRECTS = new Map([
  ["react-native", "react-native-web"],
  [
    "react-native-safe-area-context",
    join(helpersDir, "stubs", "react-native-safe-area-context.js")
  ]
]);

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function patchedResolveFilename(request, ...rest) {
  const redirected = REDIRECTS.get(request);

  return originalResolveFilename.call(this, redirected ?? request, ...rest);
};
