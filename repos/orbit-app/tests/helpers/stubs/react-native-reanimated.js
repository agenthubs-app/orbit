// Test stub (Node has no UI thread): shared values are plain boxes, animated styles
// are computed once, timing returns the target. The real library runs in the App.
const React = require("react");
const { View } = require("react-native-web");

const AnimatedView = React.forwardRef(function AnimatedView(props, ref) { return React.createElement(View, { ...props, ref }); });
module.exports = {
  __esModule: true,
  default: { View: AnimatedView, createAnimatedComponent: (component) => component },
  View: AnimatedView,
  useSharedValue: (value) => React.useRef({ value }).current,
  useAnimatedStyle: (factory) => factory(),
  withTiming: (value) => value,
  withSpring: (value) => value,
  runOnJS: (fn) => fn,
  Easing: { out: (fn) => fn, cubic: (t) => t },
};
