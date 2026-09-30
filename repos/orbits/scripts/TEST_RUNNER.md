# Node Test Runner

`npm test` runs the full app test suite.

`npm test -- tests/path/example.test.ts` runs only the provided test files. Harness sprint contracts use this focused form so unrelated suite failures do not hide the sprint result.

`npm test` refuses requests to paid AI provider hosts (`scripts/test-paid-ai-boundary.mjs`). A test that reaches one fails the whole run with the file name, even when product code swallows the provider error, because an exported developer key (for example `DEEPSEEK_API_KEY`) would otherwise turn a stubbed test into a paid, non-deterministic call. Set `ORBIT_TEST_ALLOW_PAID_AI=1` only for a deliberately budgeted live run.

Runtime-evidence audit tests are skipped in the default run; `npm run test:audit-full-product` runs them strictly.
