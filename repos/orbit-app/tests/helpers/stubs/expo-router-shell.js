// Test stub for tests/skeleton-japanese.test.tsx: just enough router for AppScreen.
const state = () => globalThis.__shellRouter || { canGoBack: false, path: "/" };
module.exports = {
  useRouter: () => ({ back() {}, push() {}, replace() {}, canGoBack: () => state().canGoBack }),
  usePathname: () => state().path,
  Redirect: () => null,
};
