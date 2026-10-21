# Shared report OG image and 100/100 confetti Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 1200×630 OG picture for every shared done report (plus the site's OG picture redrawn in the same series), and a four-shot confetti salvo from the score ring on full reports that score 100.

**Architecture:** One drawing module next to the fonts (`apps/web/src/app/_og/`) builds both pictures with `next/og`; a share-token route renders the report picture on request behind `getAuditByShareToken` with a small in-process PNG cache; the shared page's metadata points at it. A client component wraps the band's `ScoreRing` and fires `canvas-confetti` (dynamically imported) once per mount.

**Tech Stack:** Next 16 (`next/og` `ImageResponse`, Node runtime), React 19, `canvas-confetti`, Vitest (+ jsdom/Testing Library for the client component), PGlite test DB.

**Spec:** `docs/superpowers/specs/2026-10-21-share-og-image-and-confetti-design.md` (reference pictures and the approved spike `spike-render.mjs` in `docs/superpowers/specs/2026-10-21-share-og-image-and-confetti/`). Read both before starting a task; the spike holds every pixel value of the approved layout.

## Global Constraints

- Read `docs/web-ui.md` before touching `apps/web/src`; English only in code, comments, docs and commits; pnpm only; Biome (tabs, double quotes).
- Gate before each commit of a task that touches code: `pnpm check && pnpm typecheck && pnpm test` (the last task also runs `pnpm build`).
- Picture size 1200×630, `image/png`. Plum `#6e2a5e`; grade colours `#4fd1b0` (A+, A), `#facc15` (B, C, D), `#ff3b30` (F). Font: Schibsted Grotesk 500/800 from `app/_og/`, each font loaded through a literal `new URL("./…ttf", import.meta.url)`.
- Grid cell 64px, lines `rgba(255,255,255,.09)`, lit cells `rgba(255,255,255,.07)`, elliptic fade centred 50%/45%, opaque to 20%.
- Logo 64px mark + 40px wordmark on both pictures; brand row pulled left 8px, seal (150px) pulled left 19px so frames align with the text edge at 80px.
- Copy, verbatim: "AI readiness of", "out of 100", "Is your site ready for AI agents? Check it at agentcheck.dev"; site picture "Is your site ready" / "for AI agents?" (two lines) and "agentcheck.dev".
- OG route caching: 200 `public, max-age=300`; 404 `no-store`. Never Next's default immutable header.
- Confetti: shots at 0/350/700/1050 ms; origin x = ring centre ∓0.04 (shot 0 −, 1 +, 2 −, 3 +), y = ring centre (both as viewport fractions); particleCount 60; spread 80/90/100/110; startVelocity 34/37/40/43; ticks 220; scalar 0.9; colours `#4fd1b0 #ffffff #dc92cc #ffbe96 #6e2a5e`; `disableForReducedMotion: true`. Only `mode === "full"` and `score === 100`, never on the landing example.
- `AuditResult` and the database schema are not changed.

## Review Focus

1. A very long host (up to 253 chars, or a 63-char label) must stay on one line inside the picture, never overlap the ring or run off the edge → `hostFontSize` test in Task 1.
2. Unsharing (or blocking the owner) after the picture was rendered and cached must 404 at once, not serve the cached PNG → cache-after-lookup test in Task 2.
3. The report page polls with `router.refresh()` while running and re-renders the band; the confetti must fire once per page open, not on every re-render → rerender test in Task 3.
4. A user with reduced motion gets no confetti and no library download → reduced-motion test in Task 3.
5. A shared audit that is not done or has no score gets no `og:image` and the route 404s → tests in Task 2.

---

### Task 1: The OG drawing module and the site picture

**Files:**
- Create: `apps/web/src/app/_og/draw.tsx`
- Modify: `apps/web/src/app/opengraph-image.tsx` (becomes a thin wrapper)
- Test: `apps/web/test/app/og-draw.test.ts`

**Interfaces:**
- Produces (from `apps/web/src/app/_og/draw.tsx`):
  - `export const OG_SIZE = { width: 1200, height: 630 } as const`
  - `export type OgGrade = "A+" | "A" | "B" | "C" | "D" | "F"`
  - `export function hostFontSize(host: string): number`
  - `export async function drawReportOg(input: { host: string; score: number; grade: OgGrade }): Promise<Uint8Array>` — PNG bytes
  - `export async function drawSiteOg(): Promise<ImageResponse>` — used by `app/opengraph-image.tsx`

- [ ] **Step 1: Write the failing tests** in `apps/web/test/app/og-draw.test.ts` (node environment):
  - `hostFontSize("atarcms.com")` and `hostFontSize("example-shop.com")` are `84`.
  - `hostFontSize("a".repeat(63) + ".example.com")` is `< 84` and `>= 28`, and for every length 1..253 `hostFontSize(h) * 0.6 * h.length <= 890` holds or the size is the floor `28`.
  - `drawReportOg({ host: "atarcms.com", score: 100, grade: "A+" })` returns bytes starting with the PNG signature `89 50 4E 47 0D 0A 1A 0A`, and IHDR width/height (big-endian at offsets 16 and 20) equal 1200 and 630.
  - `drawSiteOg()` resolves to a response whose body, read with `arrayBuffer()`, has the same signature and size.

- [ ] **Step 2: Run** `pnpm --filter @agentcheck/web exec vitest run test/app/og-draw.test.ts` — expected FAIL (module missing).

- [ ] **Step 3: Implement `draw.tsx`** by porting the spike's `A1b(true)` (report) and `site` layouts, `gridOf(64)`, `ring`, `gradeMark` and `brandL` from `spike-render.mjs` into JSX. Keep the existing font comment from `opengraph-image.tsx`; move font loading here (literal URLs `./schibsted-grotesk-500.ttf`, `./schibsted-grotesk-800.ttf`, and the mark from `../icon.svg`). `hostFontSize`: `Math.max(28, Math.min(84, Math.floor(890 / (0.6 * host.length))))` (890px is the space right of the seal). The host line gets `whiteSpace: "nowrap"`. Grade colours by the rule in Global Constraints (one local function; `components/report/grade-mark.tsx` holds Tailwind classes, not hex, so it cannot be reused). `drawReportOg` returns `new Uint8Array(await new ImageResponse(...).arrayBuffer())`.

- [ ] **Step 4: Rewrite `app/opengraph-image.tsx`** to keep `alt`, `size` (= `OG_SIZE`), `contentType` and `export default function OpengraphImage() { return drawSiteOg(); }`.

- [ ] **Step 5: Run** the test file again — expected PASS. Then open the pictures to check them against `report-100.png`, `report-58.png`, `site.png`: write a throwaway script outside the repo (scratchpad) that saves `drawReportOg` output for 100/A+ atarcms.com, 58/D example-shop.com and a 70-char host, and compare by eye. Note any difference in the task report.

- [ ] **Step 6: Commit** `feat(web): one OG drawing module, the site picture on the hero grid`.

---

### Task 2: The shared report's OG route and metadata

**Files:**
- Create: `apps/web/src/server/og-image.ts`, `apps/web/src/app/api/shared/[token]/og.png/route.ts`
- Modify: `apps/web/src/app/r/[shareToken]/page.tsx` (`generateMetadata`), `apps/web/test/app/protection.test.ts` (`PUBLIC` += `"api/shared/[token]/og.png/route.ts"`), `CLAUDE.md` (the audit-scoped route pair list and the caching sentence: add `og.png` beside `badge.svg`, `public, max-age=300`)
- Test: `apps/web/test/server/og-image.test.ts`, `apps/web/test/app/shared-report-metadata.test.ts`

**Interfaces:**
- Consumes: `drawReportOg`, `OgGrade` from Task 1; `getAuditByShareToken` from `@agentcheck/db`; `publicOrigin` from `server/share.ts`.
- Produces: `export async function handleOgImage(token: string, deps: { db: Db; draw?: typeof drawReportOg; cache?: OgCache }): Promise<Response>`; `export function createOgCache(max = 50): OgCache` with `get(key: string): Uint8Array | undefined` and `set(key: string, png: Uint8Array): void` (LRU by insertion/hit order, keyed by audit id); a module-level default cache used when `deps.cache` is absent.

- [ ] **Step 1: Write the failing route tests** in `test/server/og-image.test.ts`, on PGlite, shaped like `test/server/badge.test.ts` (`vi.mock("server-only", …)`, `sharedAudit()` helper), with a fake `draw` (`vi.fn(async () => new Uint8Array([137, 80, 78, 71]))`) and a fresh `createOgCache()` per test:
  - shared done audit → 200, `content-type: image/png`, `cache-control: public, max-age=300`, body equals the fake bytes; `draw` called with `{ host: "example.com", score: 87, grade: "B" }`.
  - two requests → `draw` called once.
  - unknown token → 404 with `cache-control: no-store`, `draw` not called.
  - render, then `setShareToken(…, null)`, then request again → 404 (the cache is not consulted before the lookup).
  - owner blocked (`users.blocked` set as the db package's blocking helper/tests do) → 404.
  - queued audit carrying the token → 404.
  - `createOgCache(2)`: after setting a, b, c, `get("a")` is undefined and `get("c")` is defined.

- [ ] **Step 2: Extend `shared-report-metadata.test.ts`**: mock `next/headers` (`headers: async () => new Headers({ host: "localhost:3000" })`) and assert for the done shared audit `m.openGraph.images` equals `[{ url: "http://localhost:3000/api/shared/<TOKEN>/og.png", width: 1200, height: 630, alt: "AgentCheck: example.com scores 78/100 (B)" }]` and `m.twitter` matches `{ card: "summary_large_image", title, description }` (update the existing `card: "summary"` expectation). A shared audit without a score gets no `images`.

- [ ] **Step 3: Run** both files — expected FAIL.

- [ ] **Step 4: Implement** `handleOgImage` (lookup first; score as in `handleBadge`; host = `new URL(audit.url).hostname`; cache key `audit.id`), the route (copy `badge.svg/route.ts`, Node runtime is the default), the allowlist entry, the metadata change (`publicOrigin(await headers())`), and the `CLAUDE.md` lines.

- [ ] **Step 5: Run** both files and `test/app/protection.test.ts` — expected PASS. Run the gate.

- [ ] **Step 6: Commit** `feat(web): an OG picture for shared reports`.

---

### Task 3: Confetti at 100/100 on full reports

**Files:**
- Create: `apps/web/src/components/report/score-confetti.tsx` (`"use client"`)
- Modify: `apps/web/src/components/report/score-band.tsx` (`ScoreBand` gets `celebrate?: boolean` and wraps `ScoreRing` in `ScoreConfetti` when true), `apps/web/src/components/audit-report.tsx` (passes `celebrate={mode === "full" && result.score === 100}` to the non-example band only), `apps/web/package.json` (`canvas-confetti` dependency, `@types/canvas-confetti` dev), `docs/web-ui.md` (a short "Confetti" rule with the conditions above)
- Test: `apps/web/test/components/report/score-confetti.test.tsx` (`// @vitest-environment jsdom`), `apps/web/test/components/audit-report.test.tsx`

**Interfaces:**
- Produces: `export function ScoreConfetti({ children }: { children: ReactNode }): JSX.Element` — renders `<span ref className="inline-flex">{children}</span>`; on mount, unless `matchMedia("(prefers-reduced-motion: reduce)").matches`, does `const confetti = (await import("canvas-confetti")).default` and schedules the four shots from the Global Constraints, origin from the span's `getBoundingClientRect()` centre divided by `innerWidth`/`innerHeight`; clears its timers on unmount.

- [ ] **Step 1: Write the failing component tests**, mocking `canvas-confetti` (`vi.mock("canvas-confetti", () => ({ default: fire }))`), fake timers, a stubbed `matchMedia`, and a stubbed `getBoundingClientRect` (`{ left: 100, top: 100, width: 128, height: 128 }` with `innerWidth` 1280, `innerHeight` 800):
  - after advancing 1100 ms, `fire` was called 4 times; call 0 has `origin` `{ x: 164/1280 - 0.04, y: 164/800 }`, `particleCount: 60`, `spread: 80`, `startVelocity: 34`, `ticks: 220`, `scalar: 0.9`, the five colours, `disableForReducedMotion: true`; call 3 has `x: 164/1280 + 0.04`, `spread: 110`, `startVelocity: 43`.
  - re-rendering with new children does not fire again (still 4 after another 2 s).
  - with reduced motion: `fire` never called and the module never imported (assert with a spy on the mock factory or by `fire` count 0).
  - unmount after the first shot: no further calls.

- [ ] **Step 2: Extend `audit-report.test.tsx`** (static markup): a full result with score 100 renders the wrapper (give the span `data-confetti`), a quick 100, a full 99 and the `variant="example"` 100 do not.

- [ ] **Step 3: Run** both — expected FAIL. **Step 4: Implement**, `pnpm --filter @agentcheck/web add canvas-confetti` and `add -D @types/canvas-confetti`. **Step 5: Run** — expected PASS; run the gate.

- [ ] **Step 6: Commit** `feat(web): confetti when a full check scores 100`.

---

### Task 4: Production build and live check

**Files:** none expected (fix what the checks find).

- [ ] **Step 1:** Stop any `next dev`; run `pnpm check && pnpm typecheck && pnpm test && pnpm build`. Expected: all green.
- [ ] **Step 2:** Confirm the fonts and the mark reach the standalone output: `find apps/web/.next/standalone -name "schibsted-grotesk-*.ttf"` lists both weights in a path the route's chunk resolves; then start the standalone server against the dev database and `curl -sI http://localhost:3000/api/shared/<token>/og.png` returns 200 `image/png` for a shared done audit (create one locally) and 404 for a random token.
- [ ] **Step 3:** Delete `apps/web/.next`, run the dev stack (CLAUDE.md "Local stack"), open a full audit scoring 100 (set `score`/`result.score` to 100 on a local full audit if none exists) and see the salvo once; open a quick one and a 99 and see none; screenshot `/api/shared/<token>/og.png` and the site's `/opengraph-image` for the author.
- [ ] **Step 4:** Commit any fixes (`fix(web): …`), push the branch, open the PR.
