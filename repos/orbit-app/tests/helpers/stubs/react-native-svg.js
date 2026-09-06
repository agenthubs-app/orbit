const React = require("react");

function Svg({
  accessibilityElementsHidden,
  children,
  importantForAccessibility,
  pointerEvents,
  ...props
}) {
  return React.createElement("svg", props, children);
}

function Path({ accessible, onPress, ...props }) {
  return React.createElement("path", { ...props, onClick: onPress });
}

module.exports = { Path, default: Svg, __esModule: true };
