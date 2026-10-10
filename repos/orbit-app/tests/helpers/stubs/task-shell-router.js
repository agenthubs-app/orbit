// R05 shell tests: a router that records navigation and serves the URL in
// window.shellFixture ({ path, params, canGoBack }).
const React = require("react");
const fixture = () => window.shellFixture;
const record = (entry) => fixture().navigation.push(entry);
const router = {
  back: () => record({ method: "back" }),
  push: (href) => record({ method: "push", href }),
  replace: (href) => record({ method: "replace", href }),
  // Like expo-router, the new params arrive on a later render (fixture.paramsDelay ms).
  setParams: (params) => { record({ method: "setParams", params }); setTimeout(() => { Object.assign(fixture().params, params); fixture().rerender?.(); }, fixture().paramsDelay ?? 0); },
  canGoBack: () => Boolean(fixture().canGoBack),
};
module.exports = {
  useRouter: () => router,
  usePathname: () => fixture().path,
  useGlobalSearchParams: () => { const [, force] = React.useReducer((n) => n + 1, 0); fixture().rerender = force; return { ...fixture().params }; },
  useLocalSearchParams: () => fixture().params,
  useIsFocused: () => true,
  useFocusEffect: (effect) => React.useEffect(effect, [effect]),
  Redirect: ({ href }) => { React.useEffect(() => record({ method: "redirect", href }), [href]); return null; },
};
