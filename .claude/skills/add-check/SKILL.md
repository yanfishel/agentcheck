---
name: add-check
description: Add a new audit check to AgentCheck (or extend an existing one) - check file, registry entry, unit tests, reference-site expectations and reporter rendering. Use whenever implementing a check from docs/spec.md or a new one.
---

# Adding an AgentCheck check

Read `docs/spec.md` first to confirm the check's scoring category. Do not add a category or change weights without asking the user.

1. **Check file**: `packages/core/src/checks/<id>.ts` exports a `Check` constant (see `packages/core/src/types.ts` and an existing check such as `packages/core/src/checks/heading-hierarchy.ts`). Static checks use the shared `ctx` (`ctx.get`, `ctx.robots`, `ctx.$`); never mutate the shared `ctx.$` (clone first). Browser checks (Agentic Actionability) read `ctx.rendered()` and never import playwright-core: only `packages/core/src/browser/` does. When the outcome is `unavailable`, or the relevant `failures` half is set, return `skip` with the outcome's reason (never a pass).
2. **Return raw results only**: status, message, optional location. Never compute scores in a check; `packages/core/src/scoring.ts` does that. Every `warn`/`fail` needs a one-line remediation.
3. **Register** the check in `packages/core/src/registry.ts`, mark it `scope: "site"` if its answer is the same for every page of a site, and **document** it in `packages/core/src/check-docs.ts` (summary, pass/warn/fail/skip rules as the code applies them, and the published standard it rests on; `check-docs.test.ts` fails without it). The public `/checks` page is built from these, so run `vitest -u` in `apps/web` to refresh `public/checks.md`.
4. **Unit tests**: `packages/core/test/checks/<id>.test.ts`, using `runCheck` (`packages/core/test/helpers/run-check.ts`) and `mockRoutes` (`packages/core/test/helpers/mock-site.ts`) with inline HTML/text samples (browser checks: `fakeRenderer` / `renderedPage` from `packages/core/test/helpers/fake-renderer.ts`, never a real browser): at least pass, fail and one edge case (404, malformed content, redirect). Tests never touch the real network.
5. **Reference sites**: add a row per reference site (`good`, `mixed`, `poor`) where the check applies to `EXPECTED` in `packages/core/test/e2e/reference-sites.test.ts`. The sites are synthetic, hand-made fixtures under `packages/core/test/fixtures/sites/<name>/` (fictional pages on `https://<name>.example`, no live captures): edit their files by hand to give the new check the outcome you expect, keep every other check's status unchanged, and never add real third-party content. If the new check lowers the score of the CLI test page, extend `openSite()` in `apps/cli/test/main.test.ts`.
6. **Reporters**: render the result in every reporter that exists (only terminal today). If the JSON shape changes, tell the user it is a breaking change.
7. **Verify**: `pnpm check && pnpm typecheck && pnpm test && pnpm build` must pass.
8. **Commit** with a Conventional Commit, e.g. `feat(checks): detect heading level skips`.
