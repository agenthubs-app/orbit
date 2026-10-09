// Test stub: gestures are inert; GestureDetector renders its child. Gesture logic
// lives in pure functions (swipe-logic.ts, sheet-logic.ts) with their own tests.
const React = require("react");
const { View } = require("react-native-web");

function chain() {
  const gesture = {};
  for (const name of ["activeOffsetX", "activeOffsetY", "failOffsetX", "failOffsetY", "onBegin", "onStart", "onUpdate", "onChange", "onEnd", "onFinalize", "enabled", "minDistance"]) gesture[name] = () => gesture;
  return gesture;
}
module.exports = {
  __esModule: true,
  Gesture: { Pan: chain, Tap: chain },
  GestureDetector: ({ children }) => children,
  GestureHandlerRootView: (props) => React.createElement(View, props),
};
