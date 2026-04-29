FROM node:24-trixie-slim AS base
WORKDIR /app
COPY --from=oven/bun:1.3.10 /usr/local/bin/bun /usr/local/bin/bun

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/api/package.json ./packages/api/
COPY packages/configs/package.json ./packages/configs/
RUN bun -e " \
  const pkg = JSON.parse(await Bun.file('package.json').text()); \
  pkg.workspaces = ['apps/server', 'packages/api', 'packages/configs']; \
  delete pkg.scripts?.prepare; \
  await Bun.write('package.json', JSON.stringify(pkg, null, 2)); \
"
RUN bun install
RUN tar czf /tmp/node_modules.tar.gz -C / app/node_modules app/apps/server/node_modules

FROM base AS runner
WORKDIR /app
COPY --from=deps /tmp/node_modules.tar.gz /tmp/
RUN tar xzf /tmp/node_modules.tar.gz -C / && rm /tmp/node_modules.tar.gz
COPY apps/server/src ./apps/server/src
COPY apps/server/package.json ./apps/server/
COPY apps/server/tsconfig.json ./apps/server/
COPY packages/api ./packages/api
COPY packages/configs ./packages/configs
WORKDIR /app/apps/server
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/index.ts"]
