# Shared report OG image and 100/100 confetti — design

Two independent features for the web app, agreed with the author on 2026-10-21.
Reference pictures and the throwaway spike that drew them (next/og, real fonts)
are in `2026-10-21-share-og-image-and-confetti/`.

## 1. OG image for a shared report

### Intent

A link to a shared report (`/r/[shareToken]`) posted to X, LinkedIn, Telegram and
the like shows no picture today: `generateMetadata` sets text only and a small
`summary` Twitter card. The post should carry a picture that, at a glance, says
which site, its score and grade, that it is AgentCheck, and makes the viewer want
to check their own site.

### Goals

- A 1200×630 PNG per shared done audit, drawn on request, referenced from the
  shared page's `openGraph.images` and a `summary_large_image` Twitter card.
- The site's own OG picture (`app/opengraph-image.tsx`) gets the same grid
  background and logo size, so both read as one series.

### Non-goals

- No picture for private (`/audits/[id]`) or anonymous reports: social crawlers
  never see them.
- No stored images, no new table or column, no migration.
- `AuditResult` is not touched.

### Anti-goals

- A picture that outlives the share link: unsharing, or the owner being blocked,
  must stop it together with the page, badge, screenshot and favicon.
- Anything that lets a stranger burn CPU cheaply (unknown tokens must be cheap).

### Layout (approved: `report-100.png`, `report-58.png`)

Plum background as the site's OG (`#6e2a5e`, radial white glow at 80%/20%) plus a
dark glow bottom-left, and the hero's line grid on top (see Background). Padding
56px top, 80px sides, 60px bottom; three rows, space-between:

1. Top: the brand (white mark 64px + "Agent**Check**" 40px, Schibsted Grotesk
   500/800) on the left; on the right the score ring, 230px: track
   `rgba(255,255,255,.18)`, arc in the grade colour (`--band-pass` `#4fd1b0` for
   A+/A, `--band-warn` `#facc15` for B–D, `--band-fail` `#ff3b30` for F), stroke 7
   on a 100 viewBox, round cap, starting at 12 o'clock; inside, the score 84px/800
   and "out of 100" below it.
2. Middle: the grade seal (`GradeMark` geometry: frame and letters in the grade
   colour, spark white) 150px, then a column: "AI readiness of" 30px at 0.8
   opacity, and the host 84px/800, letter-spacing −2.
3. Bottom: "Is your site ready for AI agents? Check it at agentcheck.dev", 30px,
   0.9 opacity.

Left edges align on one line: the mark's and the seal's frames sit 12.5% into
their boxes, so the brand row is pulled left 8px and the seal 19px (the author
checked this alignment explicitly). The host is the audit's hostname
(`hostOf`/`new URL(audit.url).hostname`, as the page title uses). A host too long
for one line shrinks its font size to fit one line (builder picks the rule; the
spike's `example-shop.com` fits at 84px).

### Site OG picture (approved: `site.png`)

Same background and grid; brand row as above (logo 64px, was 96px); the question
in two lines, broken after "ready": "Is your site ready / for AI agents?" (88px,
800, line-height 1.05, letter-spacing −3); `agentcheck.dev` 32px at 0.85 opacity
at the bottom. Still built once at build time.

### Background grid

The landing hero's grid (`.hero-grid` in `globals.css`) with a 64px cell (the
author chose 64 over 44 and 56): 1px lines `rgba(255,255,255,.09)`, columns
centred on the picture, rows from the top, faded by an elliptic radial mask
(opaque to 20%, transparent at the edge, centred at 50%/45%), and three faintly
lit cells `rgba(255,255,255,.07)`. In the spike it is one inline SVG data URI
(next/og has no CSS masks). Shared by both pictures, in one module.

### Serving (decided with the author)

- Drawn on request, not stored at share time. Reasons given and accepted: only
  crawlers fetch it (a handful of requests per post, then platforms cache it for
  days), a render is ~50–150 ms, storing would need a column, a migration,
  cleanup on unshare/user deletion, and would freeze old designs.
- Route: `GET /api/shared/[token]/og.png` (the builder may pick the exact name),
  next to `badge.svg`, `screenshot`, `favicon`, authorised by
  `getAuditByShareToken` like them (null while the owner is blocked), added to
  the `PUBLIC` allowlist in `apps/web/test/app/protection.test.ts`. 404 with
  `no-store` for an unknown token or an audit without a score.
- Caching: `public, max-age=300`, as share-token images. Next's `ImageResponse`
  sets a year-long immutable `Cache-Control` by default; it must be overridden.
- An in-process cache of rendered PNGs keyed by audit id (small, bounded), hit
  only after the token lookup succeeds, so unsharing still stops the picture.
- `generateMetadata` on `/r/[shareToken]` adds `openGraph.images` (absolute URL
  from `publicOrigin`, 1200×630, alt like "AgentCheck: atarcms.com scores
  100/100 (A+)") and `twitter.card: "summary_large_image"`.
- `next/og` runs in the Node runtime; fonts come from `app/_og/` with literal
  `new URL()` paths (see the comment in `app/opengraph-image.tsx`).

## 2. Confetti at 100/100

### Intent

A small celebration, like Lighthouse, when a report scores 100.

### Behaviour (approved live on the shared atarcms.com report, variant 1)

- Full checks only (`mode === "full"`): a quick check skips Agentic
  Actionability and re-weights, so its 100 is easier and the report invites a
  full check; the author decided it gets no confetti. The OG picture shows the
  report's score either way.
- Fires on every open of a done full report whose total score is 100, for whoever
  can see it: `/audits/[id]` (owner, admin, anyone with an anonymous audit's id)
  and the shared `/r/[shareToken]`; no viewer gating. When a
  running audit finishes at 100 in front of the user, the same component mounts
  and fires.
- One salvo from the band's score ring: 4 shots at 0, 350, 700, 1050 ms, origin
  the ring's centre shifted ±4% of the viewport width alternately, 60 particles
  each, spread 80/90/100/110°, start velocity 34/37/40/43, ticks 220, scalar 0.9.
  Then nothing more: no loop (the author agreed continuous firing is too much on
  a page people read).
- Colours: `#4fd1b0`, `#ffffff`, `#dc92cc`, `#ffbe96`, `#6e2a5e`.
- No confetti with `prefers-reduced-motion: reduce`.
- Library: `canvas-confetti` (about 6 KB), loaded with a dynamic `import()` only
  when the score is 100, so other reports do not ship it.

### Non-goals

- No confetti on category scores of 100 when the total is lower; no sound; no
  setting to turn it off.

## Left to the builder

- Module layout for the shared OG drawing (grid, ring, seal, brand) and the
  font loading; the long-host rule; the cache size; test shape (route tests
  like `badge.test.ts`; the confetti client component with jsdom, mocking the
  library).
- Updating `CLAUDE.md` (the audit-scoped route pairs and caching list) and
  `docs/web-ui.md` (OG pictures, confetti) to describe the result.
