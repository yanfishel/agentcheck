# syntax=docker/dockerfile:1
# Two images from the pnpm workspace: `web` (Next standalone) and `worker`
# (Node with Playwright's Chromium; also runs the migrations).
# Build from the repo root: docker build -f deploy/Dockerfile --target web .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=true
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

FROM base AS web-build
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter @agentcheck/web...
# Next inlines NEXT_PUBLIC_* at build time; the publishable key is public.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
	NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL \
	NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL
RUN pnpm --filter @agentcheck/web build

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=web-build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM base AS worker-build
# Only the worker's workspace projects; `pnpm fetch` filled node_modules/.pnpm
# with every package, so start from an empty one and link production deps only.
COPY package.json ./
COPY apps/worker ./apps/worker
COPY packages/core ./packages/core
COPY packages/db ./packages/db
RUN rm -rf node_modules && pnpm install --offline --frozen-lockfile --prod

FROM node:22-bookworm-slim AS worker
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=worker-build /repo/package.json ./
COPY --from=worker-build /repo/node_modules ./node_modules
COPY --from=worker-build /repo/packages ./packages
COPY --from=worker-build /repo/apps/worker ./apps/worker
# The headless shell of the Chromium build the locked playwright-core expects,
# with its system libraries.
RUN node packages/core/node_modules/playwright-core/cli.js install --with-deps --only-shell chromium \
	&& rm -rf /var/lib/apt/lists/*
USER node
CMD ["node", "apps/worker/src/main.ts"]
