FROM oven/bun:1.3.10-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/api/package.json ./packages/api/
COPY packages/configs/package.json ./packages/configs/
RUN bun -e " \
  const pkg = JSON.parse(await Bun.file('package.json').text()); \
  pkg.workspaces = ['apps/server', 'packages/api', 'packages/configs']; \
  await Bun.write('package.json', JSON.stringify(pkg, null, 2)); \
"
RUN bun install --ignore-scripts
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
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD bun -e "const r = await fetch('http://localhost:3000/health'); if (!r.ok) process.exit(1)"
CMD ["bun", "apps/server/src/index.ts"]
