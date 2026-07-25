// react-native-safe-area-context 的测试替身。
//
// 真实实现引用 react-native 的内部原生模块路径，在 Node 里解析不了。
// 渲染测试关心的是「安全区里放了什么」，不是安全区本身，所以这里退化成普通 View。
const React = require("react");
const { View } = require("react-native-web");

function passthrough(props) {
  const { children, ...rest } = props ?? {};
  return React.createElement(View, rest, children);
}

const insets = { bottom: 0, left: 0, right: 0, top: 0 };

module.exports = {
  SafeAreaProvider: passthrough,
  SafeAreaView: passthrough,
  initialWindowMetrics: { frame: { height: 0, width: 0, x: 0, y: 0 }, insets },
  useSafeAreaFrame: () => ({ height: 0, width: 0, x: 0, y: 0 }),
  useSafeAreaInsets: () => insets
};
