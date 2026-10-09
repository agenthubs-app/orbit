// R04: native builds draw icons with react-native-svg. Web and test bundles
// resolve svg.ts instead (Metro platform extensions), so they never pull in the
// native module.
export { Circle, Path, Rect, default } from "react-native-svg";
