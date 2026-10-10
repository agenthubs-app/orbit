// R05 shell tests: a router that records navigation and serves the URL in
// window.shellFixture ({ path, params, canGoBack }).
const React = require("react");
const fixture = () => window.shellFixture;
const record = (entry) => fixture().navigation.push(entry);
const router = {
  dismissAll: () => record({ method: "dismissAll" }),
  back: () => record({ method: "back" }),
  push: (href) => record({ method: "push", href }),
  replace: (href) => record({ method: "replace", href }),
  // Like expo-router, new params arrive on a later render, in order; each write lands
  // fixture.paramsDelay ms after the previous one (so a slow device can be imitated).
  setParams: (params) => {
    record({ method: "setParams", params });
    const delay = fixture().paramsDelay ?? 0;
    const due = Math.max(Date.now(), fixture().lastParamsDue ?? 0) + delay;
    fixture().lastParamsDue = due;
    setTimeout(() => { Object.assign(fixture().params, params); fixture().rerender?.(); }, due - Date.now());
  },
  canGoBack: () => Boolean(fixture().canGoBack),
};
module.exports = {
  useRouter: () => router,
  usePathname: () => fixture().path,
  useRootNavigationState: () => fixture().rootState,
  useGlobalSearchParams: () => { const [, force] = React.useReducer((n) => n + 1, 0); fixture().rerender = force; return { ...fixture().params }; },
  useLocalSearchParams: () => fixture().params,
  useIsFocused: () => true,
  useFocusEffect: (effect) => React.useEffect(effect, [effect]),
  Redirect: ({ href }) => { React.useEffect(() => record({ method: "redirect", href }), [href]); return null; },
};
